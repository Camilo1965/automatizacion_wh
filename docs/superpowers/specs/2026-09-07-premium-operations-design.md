# Diseño de operación premium, alertas y cierre para Treinta

Fecha: 2026-09-07  
Estado: aprobado para planificación

## 1. Objetivo

Completar la operación diaria de la tienda después de una venta por WhatsApp. El sistema debe organizar automáticamente cada conversación y pedido, avisar a la propietaria cuando exista una acción concreta, controlar el inventario disponible y producir todos los días un archivo para actualizar Treinta manualmente.

Todas las ventas del alcance entran por WhatsApp. El inventario inicial vive hoy en Treinta, pero después de la migración inicial la aplicación Camila será la autoridad del stock disponible para el canal de WhatsApp. Treinta conservará una copia administrativa actualizada al cierre de cada día mediante un archivo generado por Camila y cargado manualmente por la propietaria.

La integración no automatizará el navegador de Treinta ni utilizará endpoints privados. La búsqueda realizada durante el diseño no encontró documentación pública oficial de una API de inventario de Treinta. La arquitectura admite incorporar un adaptador oficial posteriormente si Treinta ofrece acceso documentado.

## 2. Alcance

Este bloque incluye:

- importación inicial del inventario exportado desde Treinta;
- mapeo permanente entre variantes de Camila y registros externos de Treinta;
- etiquetas operativas internas para conversaciones y pedidos;
- alertas por WhatsApp al número personal de la propietaria;
- bandeja de alertas persistente dentro del panel;
- generación automática del cierre diario a las 19:00 en `America/Bogota`;
- vista previa, validación, resolución de conflictos y archivo de inventario para Treinta;
- confirmación manual de que el archivo fue aplicado en Treinta;
- historial inmutable, reapertura controlada y movimientos compensatorios;
- pruebas unitarias, de integración con PostgreSQL y E2E.

Quedan fuera de este bloque:

- escribir directamente en Treinta sin una API oficial;
- automatizar clics o credenciales en Treinta Web;
- contabilidad, facturación o conciliación del dinero recaudado;
- sincronización bidireccional en tiempo real;
- crear ventas financieras dentro de Treinta;
- depender de etiquetas nativas de WhatsApp Business para el estado operativo.

## 3. Decisiones principales

### 3.1 Autoridad del inventario

Camila será la autoridad del inventario disponible para WhatsApp. Treinta se actualizará manualmente al finalizar el día. La disponibilidad se calcula así:

```text
stock disponible = existencia física - unidades reservadas
```

El archivo diario representa el stock disponible. Una confirmación reserva unidades y reduce lo que puede ofrecer el bot. El despacho convierte la reserva en salida física sin producir un segundo descuento en el valor exportado. Una cancelación libera la reserva; si ocurre después de un cierre confirmado, su efecto aparece como movimiento compensatorio en el siguiente cierre.

### 3.2 Separación entre operación y Treinta

Pedidos, reservas, despachos, cancelaciones, devoluciones y ajustes se registran primero en Camila. Treinta nunca participa en la transacción que confirma un pedido. Una caída, cambio de formato o indisponibilidad de Treinta no puede detener las ventas por WhatsApp.

### 3.3 Alertas híbridas

La propietaria recibe alertas inmediatas cuando debe actuar y un resumen consolidado al final del día. Los eventos de baja prioridad se acumulan para evitar ruido.

### 3.4 Estados internos en lugar de etiquetas nativas

La organización automática se implementa con estados y etiquetas dentro del panel de Camila. Las etiquetas nativas de la aplicación WhatsApp Business podrán seguir usándose manualmente, pero no son una dependencia porque la Cloud API no publica una interfaz estable para administrarlas.

## 4. Flujo después de la confirmación de un cliente

1. El cliente confirma el resumen vigente del pedido.
2. La transacción existente confirma el pedido, reserva inventario y crea una única tarea de guía.
3. La conversación pasa a `pedido_confirmado` y después a `generando_guia`.
4. El worker crea la guía en 99envíos.
5. Si recibe una creación confirmada, almacena transportadora, guía y PDF; la conversación pasa a `listo_para_despachar`.
6. Se crea una alerta persistente `order_ready_to_dispatch` y una entrega dirigida al WhatsApp personal de la propietaria.
7. Si el resultado es incierto o rechazado, se crea `shipping_guide_attention_required`; no se reintenta automáticamente una creación incierta.
8. La propietaria abre el pedido desde la alerta, descarga la guía y confirma el despacho.
9. El despacho descuenta existencia física y reserva dentro de la misma transacción ya definida para el ciclo de pedidos.
10. El movimiento aparecerá en el cierre que corresponda sin duplicar el descuento previamente reflejado por la reserva.

## 5. Etiquetas operativas

El panel calcula una sola etiqueta principal a partir de estados persistidos, además de indicadores secundarios cuando corresponda:

| Etiqueta               | Condición principal                                        |
| ---------------------- | ---------------------------------------------------------- |
| `nuevo`                | conversación recibida sin talla válida                     |
| `eligiendo_talla`      | se solicitó o se está corrigiendo la talla                 |
| `catalogo_enviado`     | existen referencias presentadas y se espera selección      |
| `datos_pendientes`     | existe producto elegido y faltan datos de entrega          |
| `pedido_confirmado`    | el pedido se confirmó y tiene reserva                      |
| `generando_guia`       | existe una tarea de guía pendiente o en proceso            |
| `listo_para_despachar` | la guía está creada                                        |
| `despachado`           | el pedido pasó a despacho                                  |
| `requiere_atencion`    | el cliente pidió una persona o el flujo no puede continuar |
| `incidencia_guia`      | la creación quedó rechazada o incierta                     |
| `cancelado`            | el pedido fue cancelado                                    |
| `entregado`            | la propietaria registró la entrega                         |
| `devuelto`             | la propietaria registró la devolución                      |

Las etiquetas no se escriben como texto duplicado en varias tablas. Un proyector de estado devuelve la etiqueta a partir de la conversación, el pedido y la guía. Las listas del panel pueden filtrarla y cada transición conserva su auditoría original.

## 6. Alertas para la propietaria

### 6.1 Eventos inmediatos

- pedido con guía listo para despachar;
- cliente que solicita atención humana;
- guía rechazada o con resultado incierto;
- variante que queda sin disponibilidad después de una confirmación.

### 6.2 Eventos del resumen diario

- variantes bajo el umbral de stock;
- conversaciones abandonadas;
- pedidos confirmados, listos, despachados, cancelados, entregados y devueltos;
- valor total contraentrega de pedidos confirmados;
- guías pendientes o con incidencia;
- cierres y conflictos de inventario.

### 6.3 Contenido del aviso de despacho

El mensaje incluye número interno de pedido, referencia, modelo, talla, cantidad, total contraentrega, transportadora y número de guía. Sus botones abren rutas autenticadas del panel para ver el pedido, obtener el PDF y confirmar el despacho. La mutación de despacho exige confirmación dentro del panel.

### 6.4 Entrega, plantillas e idempotencia

Las alertas se guardan antes de enviarse y utilizan un identificador único por tipo y entidad. Un webhook repetido, reintento del worker o reinicio no puede producir una alerta duplicada.

El envío al número personal se realiza mediante la Cloud API existente. Cuando el mensaje sea iniciado por la empresa o esté fuera de una ventana de servicio, se usa una plantilla operativa aprobada por Meta. La configuración contiene el número de la propietaria y los nombres de plantilla como secretos de entorno. No se guardan en Git.

Los estados de entrega son `pending`, `processing`, `sent`, `delivered`, `failed` y `suppressed`. Un fallo conserva la alerta en el panel y permite reintento manual. Los fallos deterministas no se reintentan sin cambios. Los fallos transitorios admiten reintentos limitados con espera creciente y la misma clave idempotente.

## 7. Importación inicial desde Treinta

### 7.1 Entrada

La propietaria exporta el inventario completo desde Treinta y carga un archivo XLSX o CSV en el panel. La carga tiene dos pasos: diagnóstico y aplicación. El diagnóstico no modifica datos.

### 7.2 Detección y mapeo

El importador reconoce encabezados normalizados y permite asignar manualmente los campos cuando el nombre no sea conocido. Admite tanto variantes propias de Treinta como productos independientes por referencia y talla.

El mapeo requiere:

- referencia comercial;
- talla en pasos de `0.5`;
- existencia entera no negativa.

Puede incorporar modelo, color, precio, SKU, código de barras e identificador externo cuando estén disponibles. Nunca relaciona variantes solo por el nombre visible. El vínculo persistente utiliza el identificador externo; si no existe, utiliza una clave estable confirmada por la propietaria compuesta por referencia y talla.

### 7.3 Validaciones

La vista previa rechaza o marca:

- encabezados obligatorios ausentes;
- códigos o tallas duplicados;
- cantidades negativas o no enteras;
- tallas fuera del dominio;
- valores monetarios inválidos;
- una variante externa relacionada con dos variantes internas;
- diferencias entre filas repetidas de la misma referencia;
- referencias internas ya existentes que producirían una colisión.

La aplicación válida ocurre en una transacción. Crea o actualiza las referencias autorizadas, registra stock inicial y crea movimientos con el identificador de importación. La huella SHA-256 del archivo evita aplicar dos veces el mismo contenido.

## 8. Cierre diario

### 8.1 Programación

Un trabajo persistente crea el cierre todos los días a las 19:00 en `America/Bogota`. También existe una acción manual para generar la vista previa antes o después. Solo puede existir un cierre por intervalo de corte y versión.

El intervalo comienza inmediatamente después del corte confirmado anterior y termina en el instante del nuevo corte. No se calcula con la zona horaria del servidor.

### 8.2 Estados

```text
draft -> ready -> sent -> acknowledged
   |       |
   +-> conflicted

acknowledged -> reopened
reopened -> ready -> sent -> acknowledged
```

- `draft`: cálculo inicial aún modificable mediante reconstrucción;
- `conflicted`: existen bloqueos que impiden producir el archivo;
- `ready`: snapshot validado y archivo creado;
- `sent`: se intentó entregar el archivo a la propietaria;
- `acknowledged`: la propietaria confirmó que actualizó Treinta;
- `reopened`: reapertura explícita con motivo y auditoría.

Un cierre reconocido nunca se reescribe. Una reapertura crea una versión nueva relacionada con la anterior.

### 8.3 Línea por variante

Cada línea conserva:

- referencia, talla e identificador externo;
- existencia física al inicio y al corte;
- reservas al inicio y al corte;
- stock disponible anterior reportado a Treinta;
- entradas, ajustes, nuevas reservas, reservas liberadas, despachos y devoluciones;
- stock disponible final;
- diferencia respecto al último valor reconocido por Treinta;
- motivo o movimientos que explican el cambio.

Las líneas son snapshots. No se recalculan al consultar un cierre histórico.

### 8.4 Conflictos que bloquean el archivo

- stock disponible negativo;
- reserva sin pedido confirmado vigente;
- pedido confirmado sin movimiento de reserva;
- referencia o talla sin mapeo externo;
- vínculo externo duplicado;
- movimientos anteriores sin conciliar;
- cierre anterior listo o enviado sin decisión de la propietaria;
- inconsistencia aritmética entre movimientos y saldos.

El panel muestra el código, explicación y acción posible para cada conflicto. Resolverlo no elimina evidencia: crea el ajuste o corrige el mapeo y reconstruye el borrador.

## 9. Archivo para Treinta

El generador utiliza un `TreintaFileProfile` versionado. El perfil define encabezados, orden, tipos, hoja, clave externa y una de dos estrategias:

- `absolute_stock`: la cantidad que debe quedar;
- `delta`: el ajuste que debe aplicarse.

La activación del perfil requiere una plantilla real exportada o descargada desde la cuenta de la propietaria y una prueba controlada. Solo quedará activo el formato que Treinta acepte para actualizar productos existentes.

El archivo contiene exclusivamente las columnas admitidas por Treinta. El informe explicativo se conserva en el panel para que columnas u hojas adicionales no causen un rechazo del importador.

Si la cuenta de Treinta no admite actualización masiva, el generador produce un libro de ajustes manuales con:

```text
Referencia | Talla | Cantidad anterior | Ajuste | Cantidad final
```

El archivo se crea de forma atómica, recibe un nombre no predecible para almacenamiento, se sirve únicamente a una sesión autorizada y guarda tamaño, MIME y SHA-256. Regenerar el mismo snapshot produce los mismos datos y no incluye movimientos de otro cierre.

## 10. Modelo de datos conceptual

### `inventory_external_mappings`

Relaciona una variante `reference_id + size` con proveedor, identificador externo, clave de coincidencia, perfil y estado. La combinación proveedor + identificador externo es única.

### `inventory_imports` e `inventory_import_rows`

Conservan huella, nombre seguro, estado, mapeo de columnas, conteos, errores por fila y resultado de la importación inicial.

### `inventory_closures`

Conserva intervalo, zona horaria, versión, estado, totales, archivo, huella, fechas de envío/reconocimiento y relación con la versión reabierta.

### `inventory_closure_lines`

Conserva el snapshot aritmético por referencia y talla. La clave es cierre + variante.

### `inventory_closure_conflicts`

Conserva conflictos detectados, estado de resolución, entidad relacionada y evidencia no sensible.

### `owner_alerts` y `owner_alert_deliveries`

Separan el evento que debe conocer la propietaria de sus intentos de entrega. La clave idempotente del evento es única. Los intentos registran estado, código público de error y referencias de Meta sin guardar el cuerpo del mensaje.

## 11. Límites de privacidad y seguridad

- Solo la propietaria autenticada consulta cierres, archivos y alertas.
- El Excel de inventario no contiene nombre, teléfono, dirección ni notas del cliente.
- Las alertas incluyen únicamente los datos operativos necesarios y se envían al número personal configurado.
- El número de la propietaria, credenciales, tokens y nombres privados de plantilla se cargan desde variables de entorno.
- Los logs no incluyen mensajes, direcciones, teléfonos, credenciales ni contenidos de archivos.
- Las descargas usan caché privada, ETag y autorización de servidor.
- Los archivos se almacenan fuera de Git y entran en la política de copias cifradas del despliegue.
- Reabrir un cierre y confirmar su aplicación en Treinta requiere sesión, Origin válido y auditoría.

## 12. Recuperación e idempotencia

- El scheduler crea el trabajo diario mediante una clave derivada de la fecha comercial y la hora de corte.
- El generador reclama trabajos con bloqueo y tolera reinicios.
- Un cierre con el mismo intervalo no duplica líneas ni movimientos.
- Una alerta usa una clave estable por evento y entidad.
- Un fallo de WhatsApp no invalida el cierre ni el pedido.
- Un fallo de generación no marca movimientos como conciliados.
- Los movimientos se consideran reportados a Treinta solo cuando la propietaria reconoce el cierre.
- Si se reconoce un archivo equivocado, la reapertura crea una versión compensatoria; no borra el cierre anterior.

## 13. Panel de la propietaria

El panel incorpora:

- contador de alertas pendientes;
- filtros por etiqueta operativa;
- lista de pedidos listos para despachar y con incidencia;
- asistente de importación inicial de Treinta;
- vista previa del cierre con totales y líneas;
- lista de conflictos con acciones de resolución;
- descarga y reenvío del archivo;
- acción `Marcar actualizado en Treinta` con confirmación;
- historial de cierres y versiones;
- reapertura con motivo obligatorio;
- configuración del umbral de stock bajo y hora de corte.

La vista principal prioriza acciones: incidencias, atención humana, pedidos por despachar, cierre pendiente y stock agotado. Las estadísticas quedan debajo de las tareas operativas.

## 14. Pruebas de aceptación

### Dominio y unitarias

- cálculo de stock disponible;
- reserva, liberación, despacho y devolución sin doble descuento;
- proyección de todas las etiquetas;
- deduplicación y clasificación de alertas;
- intervalos de cierre en `America/Bogota`;
- perfiles de archivo absoluto y delta;
- validación de tallas enteras y medias;
- cálculo y verificación de SHA-256.

### Integración con PostgreSQL

- dos clientes compiten por la última unidad;
- confirmación repetida reserva una vez y alerta una vez;
- scheduler repetido crea un cierre;
- reinicio durante claim, generación y entrega;
- cancelación antes del corte y después de un cierre reconocido;
- despacho no vuelve a descontar el stock exportable;
- devolución posterior crea compensación;
- importación repetida por contenido no se aplica;
- restricciones únicas de mapeos, cierres, líneas y alertas;
- fallo de auditoría revierte la mutación completa.

### HTTP y seguridad

- sesión y Origin obligatorios para todas las mutaciones;
- respuestas validadas por contratos compartidos;
- límites de tamaño y tipo de XLSX/CSV;
- nombres de archivo no controlados por el usuario;
- descarga no autenticada rechazada;
- ausencia de datos de clientes en el archivo y logs.

### Panel y E2E

- importar inventario con vista previa y confirmación;
- rechazar archivo inválido sin alterar stock;
- pedido confirmado produce etiqueta y alerta;
- guía creada produce `listo_para_despachar`;
- cierre de las 19:00 produce un único archivo;
- conflicto impide generación y explica cómo resolverlo;
- propietaria descarga, reenvía y reconoce el cierre;
- reapertura produce una versión nueva y conserva la anterior;
- falla simulada de Meta deja la alerta visible y reintentable.

## 15. Despliegue progresivo

1. Construir estados internos, alertas persistentes y bandeja del panel.
2. Crear y aprobar las plantillas operativas de Meta; probarlas con el número personal autorizado.
3. Implementar importación inicial y ejecutar una vista previa con el inventario real de Treinta.
4. Aplicar la migración inicial después de que la propietaria valide conteos y mapeos.
5. Implementar cierres y generar archivos internos durante varios días sin aplicarlos.
6. Obtener la plantilla real de actualización de Treinta y activar su perfil mediante una prueba controlada.
7. Ejecutar cierres paralelos de observación y comparar contra Treinta.
8. Activar el envío automático de las 19:00 y la confirmación manual de actualización.

## 16. Criterios de terminación

El bloque se considera terminado cuando:

- un pedido real confirmado produce una sola alerta útil para la propietaria;
- el panel organiza cada conversación sin depender de etiquetas de WhatsApp Business;
- el inventario real de Treinta puede importarse con una vista previa comprensible;
- ninguna operación permite sobreventa o doble descuento;
- el cierre de las 19:00 genera un archivo compatible o, si la cuenta no admite carga, una lista exacta de ajustes manuales;
- la propietaria puede descargar, aplicar y reconocer el cierre sin ayuda técnica;
- una cancelación o devolución tardía queda compensada y explicada;
- todos los recorridos críticos pasan unitarias, integración con PostgreSQL y E2E;
- la documentación operativa explica importación, cierre, errores, reapertura y recuperación.

## 17. Fuentes verificadas durante el diseño

- [Treinta: inventario, variantes y carga por Excel](https://treinta.co/software-inventario-ventas)
- [Treinta Web](https://web.treinta.co/)
- [Colección oficial de Meta para WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)
- [Centro de ayuda de WhatsApp: etiquetas en WhatsApp Business](https://faq.whatsapp.com/smba/chats/how-to-use-labels)
