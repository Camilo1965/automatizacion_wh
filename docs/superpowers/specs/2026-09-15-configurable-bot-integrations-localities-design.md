# Configuración integral del bot, localidades e integraciones

**Fecha:** 2026-09-15  
**Estado:** aprobado en conversación; pendiente de revisión del documento  
**Producto:** KAIRO  
**Fuentes externas:** [OpenAPI de 99envíos](https://integration.99envios.app/api-docs) y [directorio de localidades suministrado](https://docs.google.com/document/d/1RQxkGWIiQsoHtBUP8SDhINw3f_IHMRMT_NM2r6JkTxo/mobilebasic)

## 1. Objetivo

Permitir que la propietaria configure desde el panel el flujo de ventas de WhatsApp, sus mensajes, las credenciales operativas, las reglas de envío y el catálogo de localidades compatible con 99envíos. Cada control visible debe afectar el comportamiento real del sistema y respetar los campos admitidos por el proveedor.

La solución debe conservar las garantías actuales de idempotencia, inventario, cotización, guía y auditoría. Una conversación activa termina con la versión del flujo con la que comenzó; una publicación nueva solo afecta conversaciones nuevas.

## 2. Decisiones de producto

- El editor será visual, guiado e interactivo. No permitirá conexiones arbitrarias que produzcan pedidos incompletos o ciclos infinitos.
- Existirán modos sencillo y avanzado sobre el mismo modelo versionado.
- El cliente no elegirá transportadora ni seguro. KAIRO los resolverá con la política de la propietaria.
- El comportamiento predeterminado elegirá el menor costo completo entre alternativas válidas.
- Una regla exacta de localidad, identificada internamente por código DANE de ocho dígitos, reemplazará la política general.
- Departamento, municipio y centro poblado serán legibles; el código DANE permanecerá oculto durante la operación normal.
- Las credenciales de WhatsApp y 99envíos podrán administrarse desde el panel, cifradas y con activación posterior a una prueba correcta.
- La conexión a PostgreSQL y la clave maestra de cifrado permanecerán en el entorno del servidor.
- Los parámetros que 99envíos fija a un valor único no aparecerán como opciones editables.
- Las configuraciones inválidas no podrán publicarse ni activarse.

## 3. Arquitectura funcional

La función se divide en cuatro módulos independientes y conectados:

1. **Flujos del bot:** edición, simulación, validación, publicación, versiones y ejecución.
2. **Localidades:** catálogo versionado, importación, normalización, búsqueda y revisión de conflictos.
3. **Envíos:** política general, reglas exactas por localidad, selección automática, seguro y trazabilidad.
4. **Integraciones:** configuración cifrada, prueba, activación, rotación y estado de WhatsApp y 99envíos.

Los módulos publican contratos Zod compartidos. El frontend nunca interpreta secretos, códigos internos del proveedor ni reglas comerciales por su cuenta.

## 4. Editor visual del bot

### 4.1 Topología protegida

El flujo base contiene estos pasos:

```text
inicio
→ bienvenida
→ solicitar_talla
→ buscar_catalogo
  ├─ con_stock → enviar_productos
  └─ sin_stock → solicitar_otra_talla
→ seleccionar_referencia
→ solicitar_nombre
→ solicitar_telefono
→ solicitar_departamento
→ solicitar_localidad
→ solicitar_direccion
→ solicitar_indicaciones
→ cotizar_envio
  ├─ cotizacion_valida → mostrar_resumen
  ├─ regla_bloqueada → atencion_humana
  └─ proveedor_no_disponible → atencion_humana
→ confirmar_pedido
→ reservar_stock
→ generar_guia
→ enviar_guia
→ finalizar
```

Los pasos comerciales obligatorios podrán personalizarse, pero no eliminarse ni dejarse desconectados. Los pasos opcionales, como indicaciones de entrega, horario o mensaje posterior a la guía, podrán activarse o desactivarse.

### 4.2 Modo sencillo

Permite modificar:

- mensaje principal y mensaje de error de cada paso;
- botones o respuestas admitidas;
- emojis;
- número máximo de intentos;
- tiempo de espera;
- mensaje fuera de horario;
- mensaje de transferencia humana;
- textos del resumen, confirmación y guía;
- visibilidad del nombre de la transportadora para el cliente;
- tamaño de página del catálogo dentro de los límites de Meta;
- activación de pasos opcionales.

### 4.3 Modo avanzado

Permite configurar condiciones dentro de límites declarativos:

- disponibilidad de stock;
- talla reconocida;
- intentos inválidos;
- horario comercial;
- localidad válida;
- resultado de cotización;
- necesidad de atención humana;
- vigencia de la cotización;
- comandos globales como `asesora`, `cambiar talla`, `más modelos`, `confirmar` y `cancelar`.

No se admitirá JavaScript, SQL, expresiones regulares libres ni URLs ejecutables introducidas por la usuaria.

### 4.4 Variables de mensaje

El editor ofrecerá un selector cerrado de variables tipadas:

```text
{negocio.nombre}
{cliente.nombre}
{cliente.telefono}
{producto.referencia}
{producto.modelo}
{producto.color}
{producto.talla}
{producto.precio}
{pedido.numero}
{pedido.total}
{destino.departamento}
{destino.localidad}
{envio.transportadora}
{envio.costo}
{envio.seguro}
{guia.numero}
```

Una plantilla con variables desconocidas, datos que no existen todavía en ese paso o longitud superior al límite del canal será inválida.

### 4.5 Versionado y publicación

Estados de una versión:

```text
draft → validated → published → archived
```

- Solo puede existir un borrador editable y una versión publicada activa por flujo.
- Publicar será una operación transaccional con control de versión optimista.
- Cada conversación guardará `flow_version_id` y continuará con esa versión hasta terminar.
- Restaurar una versión creará una versión nueva basada en el snapshot anterior; no reescribirá el historial.
- La auditoría conservará actor, fecha, versión anterior, versión nueva y resumen del cambio.

### 4.6 Simulador

El simulador ejecutará el flujo con adaptadores controlados de catálogo, localidades, Meta y 99envíos. Permitirá elegir escenarios de stock, localidad, cobertura y error. Nunca enviará mensajes, reservará inventario ni creará guías reales.

Mostrará:

- conversación en formato WhatsApp;
- paso actual y contexto acumulado;
- variables resueltas;
- política de envío aplicada;
- transición elegida y motivo;
- advertencias que impedirían publicar.

## 5. Modelo de persistencia del flujo

### 5.1 Nuevas tablas

`bot_flows`

- `id uuid primary key`
- `name varchar(100)`
- `active boolean`
- `created_at`, `updated_at`

`bot_flow_versions`

- `id uuid primary key`
- `flow_id uuid references bot_flows`
- `version integer`
- `status draft|validated|published|archived`
- `configuration jsonb`
- `configuration_sha256 char(64)`
- `created_by`, `published_by` referencias a `admin_users`
- `created_at`, `validated_at`, `published_at`
- índice único `(flow_id, version)`
- índice único parcial para un borrador y una publicación activa

`bot_flow_audits`

- identidad, flujo, versión, actor, acción, resumen y snapshot de diferencias;
- registro append-only.

`whatsapp_conversations` se ampliará con:

- `flow_version_id`;
- `current_step_key`;
- `flow_context jsonb` validado antes de persistir;
- `automation_paused_at` y motivo.

### 5.2 Configuración como documento tipado

La topología y los textos se guardarán en un documento JSONB atómico validado mediante `BotFlowConfigurationSchema`. No se dispersarán los nodos en tablas editables individualmente: así una publicación representa un snapshot completo, reproducible y fácil de restaurar.

## 6. Directorio de localidades 99envíos

### 6.1 Fuente inicial

El documento suministrado contiene pares `value` y `label`. Se convertirá en un CSV versionado dentro del repositorio con:

```text
provider_code,department,locality,locality_kind,source_label,active
```

Se guardarán URL de origen, fecha de extracción y SHA-256. No se consultará el Google Doc durante la operación normal.

### 6.2 Normalización

- El código debe cumplir `^[0-9]{8}$`.
- Los ceros iniciales se conservan como texto.
- Departamento y localidad tendrán valor original, valor de presentación y valor normalizado para búsqueda.
- La búsqueda ignorará tildes, mayúsculas y espacios repetidos.
- Municipios y centros poblados tendrán tipos distintos.
- Duplicados exactos se consolidarán.
- Un mismo código con nombres incompatibles será conflicto bloqueante.
- Registros extranjeros, códigos de longitud distinta y departamentos desconocidos quedarán en revisión.
- Una localidad utilizada por pedidos no podrá borrarse; solo desactivarse para pedidos nuevos.

### 6.3 Experiencia de selección

`LocalityPicker` operará en dos fases:

1. seleccionar o buscar departamento;
2. buscar municipio o centro poblado dentro del departamento.

Mostrará `Localidad, Departamento` y una etiqueta secundaria para centros poblados. El DANE solo aparecerá en detalles técnicos desplegables.

### 6.4 Actualizaciones desde el panel

La propietaria podrá subir CSV, revisar altas, modificaciones, desactivaciones, duplicados y conflictos, y publicar una versión. La importación será transaccional y reversible mediante una publicación nueva basada en la versión anterior.

## 7. Política automática de envíos

### 7.1 Política general

Sin regla local:

1. solicitar cotización a las transportadoras devueltas por 99envíos;
2. excluir respuestas sin éxito o con importes incompletos;
3. calcular `flete + contrapago + sobreflete + comisión + seguro`;
4. seleccionar el menor costo completo;
5. conservar todas las alternativas y la razón de selección.

### 7.2 Regla exacta por localidad

Una regla puede contener:

- transportadoras permitidas;
- transportadoras excluidas;
- prioridad ordenada;
- transportadora obligatoria;
- fallback `cheapest_allowed`, `ordered_preferences` o `block`;
- seguro `none`, `standard` o `plus`;
- valor mínimo para seguro;
- peso y dimensiones que reemplazan los valores generales;
- vigencia y estado;
- nota interna.

No se permitirá guardar una regla bloqueada sin transportadora obligatoria. Una transportadora excluida no podrá aparecer simultáneamente como preferida.

### 7.3 Confirmación y guía

El cliente no seleccionará transportadora ni seguro. Recibirá el resumen con producto, envío y total contraentrega. Al confirmar:

- se valida vigencia de la cotización;
- se congela el snapshot de alternativa y política;
- se reserva stock una sola vez;
- se crea una tarea de guía idempotente;
- el preenvío usa exactamente transportadora, seguro, servicio y valores confirmados;
- el PDF se almacena y se encola como documento de WhatsApp;
- la propietaria ve pedido, guía y alertas relacionadas.

Si la cotización vence o cambia producto, talla, cantidad, precio, dirección o localidad, se invalida el resumen y se solicita una confirmación nueva.

## 8. Matriz de compatibilidad con 99envíos

La especificación OpenAPI consultada el 2026-09-15 publica seis operaciones.

### 8.1 Inicio de sesión

`POST /api/integration/v1/login`

| Panel | Campo proveedor | Tratamiento |
| --- | --- | --- |
| Correo | `email` | Secreto cifrado, obligatorio |
| Contraseña | `password` | Secreto cifrado, obligatorio |
| JWT | respuesta `token` | Caché cifrada de corta duración; nunca editable |

### 8.2 Cotización

`POST /api/integration/v1/cotizar`, con máximo documentado de 300 cotizaciones por hora.

| Panel o dominio | Campo proveedor | Tratamiento |
| --- | --- | --- |
| Localidad seleccionada | `destino.codigo` | DANE interno obligatorio |
| Nombre de localidad | `destino.nombre` | Derivado del directorio |
| Origen | `origen.nombre`, `origen.codigo` | Configuración de negocio opcional |
| Entrega a domicilio | `IdTipoEntrega` | Fijo en `1`, no editable |
| Servicio | `IdServicio` | Valor compatible calculado, no texto libre |
| Valor del pedido | `valorDeclarado` | Derivado del pedido |
| Peso, alto, largo, ancho | campos homónimos | Valores generales con reemplazo por regla |
| Fecha | `fecha` | Derivada en formato `d-m-Y` |
| Seguro | `seguro99`, `seguro99plus` | Derivado de la política; Plus tiene prioridad |
| Contraentrega | `AplicaContrapago` | Activo para KAIRO |

El cliente manejará explícitamente `401`, `403`, `404`, `422`, `429` y respuestas parciales por transportadora. El limitador local evitará superar 300 llamadas por hora y respetará `retry_after` cuando exista.

### 8.3 Preenvío

`POST /api/integration/v1/preenvio`

| Panel o dominio | Campo proveedor | Tratamiento |
| --- | --- | --- |
| Domicilio | `IdTipoEntrega` | Fijo en `1` |
| Servicio estándar | `IdServicio` | Fijo en `1` según documentación del endpoint |
| Contraentrega | `AplicaContrapago` | Activo |
| Paquete | `peso`, `largo`, `ancho`, `alto` | Snapshot confirmado |
| Contenido | `diceContener` | Configuración general o por regla |
| Declarado | `valorDeclarado` | Total de producto aplicable |
| Seguro | `seguro99`, `seguro99plus` | Snapshot confirmado |
| Destinatario | documento, nombre, apellidos, teléfono, dirección, correo | Datos validados del pedido |
| Localidad | `Destinatario.idLocalidad` | DANE de ocho dígitos |
| Observaciones | `Observaciones` | Indicaciones de entrega |
| Transportadora | `transportadora.pais`, `transportadora.nombre` | Alternativa seleccionada; país fijo `colombia` |
| Origen | `origenCreacion` | Fijo en `1` |
| Headers opcionales | `X-Integration-Token`, `X-Integration-Id` | Secretos cifrados opcionales |

Una respuesta incierta después de enviar la solicitud nunca se reintentará automáticamente. Se creará una alerta para verificar primero si la guía existe.

### 8.4 PDF

`POST /api/integration/v1/pdf/{tipo_pdf?}`

- Formato configurable: `1` sticker o `2` normal.
- Utiliza guía, transportadora y contraentrega del snapshot confirmado.
- El archivo se validará como PDF, se almacenará idempotentemente y se enviará al cliente como documento por WhatsApp.

### 8.5 Novedades

- `GET /api/integration/sucursal/novedades/{codigo_sucursal}` consulta novedades.
- `POST /api/integration/sucursal/novedades/{id}` actualiza una novedad con número de guía, respuesta y observaciones.

El panel permitirá configurar `codigo_sucursal`, programar sincronización, mostrar novedades por pedido y responderlas manualmente. Nunca inventará estados de rastreo que el endpoint no publique.

### 8.6 Transportadoras

La cotización documenta Interrapidísimo, TCC, Servientrega, Coordinadora y Envia. La lista del panel será cerrada y tipada. Solo se marcará cobertura cuando una cotización real de 99envíos regrese `exito: true`.

## 9. Configuración de integraciones

### 9.1 Persistencia segura

`integration_config_versions`

- proveedor `whatsapp|99envios`;
- estado `draft|tested|active|retired`;
- configuración pública JSONB validada;
- secretos AES-256-GCM con IV y tag únicos;
- versión de clave y huella SHA-256 no reversible;
- actor, fechas de prueba y activación;
- resumen de la última prueba, sin datos sensibles.

La clave `KAIRO_CONFIG_ENCRYPTION_KEY` será obligatoria en producción y no se almacenará en PostgreSQL. Las respuestas administrativas solo expondrán `configured`, últimos cuatro caracteres cuando sea seguro y huella abreviada.

### 9.2 WhatsApp editable

- token de acceso;
- Phone Number ID;
- WABA ID;
- App Secret;
- token de verificación;
- versión permitida de Graph API;
- número de alertas;
- horario y zona horaria;
- comportamiento fuera de horario;
- estado de coexistencia, que solo se marcará verificado con evidencia de Meta.

La prueba verificará credenciales mediante una lectura segura y validará configuración local del webhook. Enviar un mensaje de prueba será una acción separada y explícita.

### 9.3 99envíos editable

- correo y contraseña;
- Integration Token e Integration ID opcionales;
- código de sucursal para novedades;
- origen DANE opcional;
- peso y dimensiones predeterminados;
- contenido declarado;
- formato PDF;
- seguro general;
- límites internos de cotización y tiempo de caché dentro del máximo del proveedor.

La prueba hará login y una validación sin crear preenvío. La creación de una guía de prueba seguirá siendo una acción separada, explícita y protegida.

### 9.4 Activación

```text
editar borrador → probar → marcar verificada → activar
```

Una prueba fallida no reemplaza la configuración activa. Las rotaciones conservan la versión anterior hasta que la nueva se pruebe y active.

## 10. API administrativa

### Flujos

```text
GET    /api/admin/bot/flows
GET    /api/admin/bot/flows/:id
POST   /api/admin/bot/flows/:id/draft
PATCH  /api/admin/bot/flows/:id/draft
POST   /api/admin/bot/flows/:id/validate
POST   /api/admin/bot/flows/:id/simulate
POST   /api/admin/bot/flows/:id/publish
GET    /api/admin/bot/flows/:id/versions
POST   /api/admin/bot/flows/:id/versions/:version/restore
GET    /api/admin/bot/flows/:id/audit
```

### Localidades

```text
GET    /api/admin/localities/departments
GET    /api/admin/localities?department=&query=&kind=&active=
POST   /api/admin/locality-imports/preview
POST   /api/admin/locality-imports/:id/publish
GET    /api/admin/locality-imports/:id
GET    /api/admin/locality-catalog/versions
POST   /api/admin/locality-catalog/versions/:version/restore
PATCH  /api/admin/localities/:code
```

### Políticas

```text
GET    /api/admin/shipping/preferences
PATCH  /api/admin/shipping/preferences
GET    /api/admin/shipping/rules
POST   /api/admin/shipping/rules
PATCH  /api/admin/shipping/rules/:localityCode
POST   /api/admin/shipping/rules/:localityCode/deactivate
POST   /api/admin/shipping/rules/preview
```

### Integraciones

```text
GET    /api/admin/integrations
GET    /api/admin/integrations/:provider
PUT    /api/admin/integrations/:provider/draft
POST   /api/admin/integrations/:provider/test
POST   /api/admin/integrations/:provider/activate
GET    /api/admin/integrations/:provider/versions
GET    /api/admin/integrations/:provider/audit
POST   /api/admin/integrations/whatsapp/send-test
```

Todas las mutaciones requieren sesión, Origin válido, versión esperada, validación estricta, auditoría y respuestas públicas sin secretos.

## 11. Experiencia administrativa

La navegación de Configuración incluirá:

- Flujo del bot;
- Mensajes;
- Localidades;
- WhatsApp;
- 99envíos;
- Envíos;
- Notificaciones;
- Negocio;
- Historial.

El editor tendrá lienzo central, biblioteca de pasos y panel lateral en escritorio. En móvil usará vistas sucesivas y una barra fija con Guardar/Probar. Todos los controles tendrán ayuda contextual, validación en línea, teclado completo, objetivos táctiles de 44 px y alternativa a animaciones.

No se mostrarán nombres internos como `awaiting_locality`, JSON, DANE o identificadores de transportadora en la vista habitual.

## 12. Manejo de errores

- Un flujo inválido se guarda como borrador, pero no se publica.
- Una edición concurrente retorna `409 configuration_changed` y ofrece comparar cambios.
- Una credencial incorrecta nunca sustituye la activa.
- Una localidad desconocida vuelve a solicitar destino o transfiere a la propietaria según el flujo publicado.
- Una regla obligatoria sin cobertura crea alerta y pausa la automatización.
- Un `429` de 99envíos conserva el pedido y programa una nueva cotización segura; no crea guía.
- Una respuesta incierta de preenvío queda `uncertain` y requiere conciliación.
- El envío del PDF puede reintentarse sin recrear la guía.
- Los logs redactan tokens, contraseñas, cookies, documentos y direcciones completas.

## 13. Migración y compatibilidad

- Se generará una versión inicial del flujo a partir del comportamiento actual de `conversation-state.ts` y `whatsapp-sales-service.ts`.
- Conversaciones existentes se fijarán a esa versión antes de activar el nuevo runtime.
- Las variables actuales de `.env` se importarán una sola vez a la primera configuración cifrada; no se eliminarán hasta verificar la migración y documentar el rollback.
- Las reglas actuales de envío se convertirán al nuevo modelo sin cambiar la transportadora o seguro ya confirmados en pedidos.
- El catálogo inicial de localidades se publicará desde el snapshot normalizado del documento suministrado.
- Las migraciones serán aditivas y conservarán compatibilidad durante el despliegue gradual.

## 14. Pruebas y criterios de aceptación

### Flujo y versionado

1. Editar, validar, simular y publicar un mensaje cambia conversaciones nuevas.
2. Una conversación activa conserva su versión anterior.
3. Una variable inválida o un paso obligatorio desconectado bloquea publicación.
4. Restaurar una versión crea otra versión y conserva auditoría.
5. La toma humana detiene mensajes automáticos pendientes.

### Localidades

6. Buscar `medellin` devuelve Medellín, Antioquia y conserva `05001000` internamente.
7. Barranquilla se resuelve al código esperado sin que la propietaria lo escriba.
8. Códigos de siete dígitos, duplicados conflictivos y departamentos desconocidos no se publican.
9. Una actualización nunca borra localidades usadas por pedidos.

### Envíos

10. Sin regla se selecciona el menor costo completo válido.
11. Una regla de Barranquilla puede permitir únicamente TCC y Seguro 99 Plus.
12. Con fallback bloqueado y sin TCC, el pedido pasa a atención y no crea guía.
13. Con fallback permitido, se selecciona la siguiente preferida o la más barata permitida.
14. El cliente nunca recibe un selector de transportadora o seguro.
15. La guía conserva DANE, transportadora, seguro y valores confirmados.
16. Una cotización vencida exige resumen y confirmación nuevos.
17. Confirmaciones o webhooks repetidos no duplican reserva ni guía.

### Integraciones

18. Un secreto guardado no puede recuperarse por API ni aparecer en logs.
19. Una configuración nueva solo puede activarse después de prueba correcta.
20. Fallar una prueba mantiene activa la versión anterior.
21. Login, cotización, preenvío y PDF respetan los contratos documentados.
22. Novedades se sincronizan por código de sucursal y se vinculan por guía.
23. La prueba de integración nunca crea una guía; la aceptación real está separada.

### UX y accesibilidad

24. Editor, selectores y configuración funcionan a 390, 768, 1280 y 1440 px.
25. No hay controles sin efecto real.
26. No hay errores críticos o serios de Axe.
27. El flujo completo se opera con teclado y foco visible.
28. La simulación explica la decisión de envío sin exponer secretos.

### Puerta de calidad

```text
pnpm install --frozen-lockfile
docker compose config
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm audit --prod
git diff --check
```

Además se repetirán tres veces las pruebas de concurrencia de publicación, confirmación, reserva y guía. Se verificará migración incremental y desde base vacía.

## 15. Entrega por subproyectos

El alcance se implementará en este orden:

1. Catálogo DANE/localidades versionado y selector reutilizable.
2. Configuración cifrada y activación segura de integraciones.
3. Modelo versionado y runtime del flujo.
4. Editor visual guiado, mensajes y simulador.
5. Política automática por localidad y eliminación de selección del cliente.
6. PDF por WhatsApp, novedades de 99envíos y alertas operativas.
7. Migración, E2E integral, accesibilidad y documentación de operación.

Cada subproyecto debe terminar funcionando, probado y con commit independiente antes de iniciar el siguiente.

## 16. Fuera de alcance

- Automatizar clics dentro de Treinta.
- Constructor libre que ejecute código de la usuaria.
- Reemplazar la API oficial de Meta o de 99envíos.
- Mostrar o recuperar secretos completos después de guardarlos.
- Prometer rastreo o coexistencia móvil que el proveedor no haya confirmado.
- Crear guías reales desde el simulador o la prueba de credenciales.

