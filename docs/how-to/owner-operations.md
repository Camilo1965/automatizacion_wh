# Operación y demostración de KAIRO

## Preparación técnica inicial

Usa Node 24 y pnpm 11.19.0. Copia `.env.example` a `.env`, configura PostgreSQL y una clave `KAIRO_CONFIG_ENCRYPTION_KEY` de 32 bytes en base64. La clave permanece en el servidor: no se puede cambiar desde el panel porque protege todas las versiones de credenciales. Conserva una copia segura junto con los respaldos.

```powershell
pnpm install --frozen-lockfile
docker compose up -d --wait postgres
pnpm db:migrate
pnpm admin:create -- --username propietaria
pnpm dev
```

El comando de alta solicita la contraseña sin guardarla en Git. Abre `http://127.0.0.1:5173`. En producción usa HTTPS y un dominio estable; para recibir mensajes durante una prueba local publica únicamente la API mediante un túnel HTTPS. Configura la URL terminada en `/webhooks/whatsapp` en Meta. El túnel debe permanecer activo.

## Configurar el número y las credenciales

En **Configuración → Integraciones** completa WhatsApp: ID del número, WABA, token de acceso, App Secret y token de verificación del webhook. App Secret y token de verificación son valores diferentes. Los campos secretos vacíos conservan el valor guardado. Guarda el borrador, pulsa **Probar** y después **Activar** la revisión verificada. Si editas cualquier dato debes volver a probar; la verificación vence a los 15 minutos. Guardar no cambia una conexión activa.

Para 99envíos guarda correo y contraseña de la cuenta, sucursal para novedades, formato de PDF y credenciales de integración cuando las requiera la cuenta. El origen para cotizaciones es opcional: se selecciona por departamento y municipio. El origen de una guía pertenece a la configuración de la cuenta del proveedor; no se inventa un parámetro de origen para crearla. La prueba de conexión solo realiza login por POST: **no crea una guía**.

El horario informa la disponibilidad de atención humana en Colombia; el bot continúa vendiendo las 24 horas. Para avisos al WhatsApp personal de la propietaria configura su teléfono y el nombre de una plantilla aprobada por Meta, idioma `es_CO`, con una variable de texto en el cuerpo. Sin esa plantilla las alertas continúan disponibles en el panel. Un envío incierto nunca se repite automáticamente.

La aplicación móvil de WhatsApp Business solo puede compartir el número con Cloud API si Meta habilita y confirma coexistencia. El panel muestra la evidencia disponible; no garantiza coexistencia por guardar credenciales.

## Cargar municipios y definir envíos

En **Configuración → Localidades**, pulsa **Usar listado 99envíos incluido** o carga el documento/CSV correspondiente. Revisa la vista previa y publica. El archivo incluido conserva 1.256 destinos colombianos válidos; su archivo de metadatos registra fuente, hash y 17 filas excluidas. No se publica automáticamente. Los códigos se conservan como texto internamente; selecciona nombres en el panel.

El historial permite restaurar un listado creando una nueva versión. No se borran destinos antiguos referenciados por pedidos. Una vista previa queda obsoleta si alguien publica otro listado antes de confirmar: vuelve a previsualizar.

En **Configuración → Envíos** define la política general y las reglas exactas por municipio. Una regla municipal activa sustituye toda la política general:

- Automática: elige la cotización válida con menor flete + recaudo + recargos + seguro.
- Preferida: se selecciona aunque cueste más; las preferencias secundarias tienen prioridad explícita.
- Obligatoria: si no aparece la preferida, se detiene el bot y se crea atención; no se genera resumen ni guía.
- Permitidas/excluidas: limitan las alternativas elegibles; las listas no pueden contradecirse.
- Seguro: sin adicional, siempre estándar/Plus o a partir del valor configurado.
- Paquete: peso, dimensiones y contenido pasan a la cotización y quedan conservados para la guía.

El simulador de envío solicita una cotización real de solo lectura; no crea pedido ni guía. El cliente **no elige transportadora ni seguro**. La selección, costos y política se conservan con el pedido confirmado. Si cambia el pedido o vence la cotización, se exige un resumen y una confirmación nuevos.

## Cambiar mensajes y probar el bot

En **Configuración → Flujo del bot** selecciona cada paso, escribe sus mensajes y usa los botones de variables disponibles. Configura respuestas inválidas, límite de intentos, comandos, cantidad de fotos y pasos opcionales. Guarda el borrador, simula y publica. Las conversaciones que ya comenzaron conservan su versión; reiniciar inicia el flujo vigente. Restaurar una publicación crea otra versión y mantiene el historial.

Los cambios locales se recuperan en la misma sesión del navegador después de una recarga. Una revisión obsoleta se rechaza para evitar sobrescribir otro cambio. La simulación controlada permite compra normal, talla agotada, municipio inválido, transportadora bloqueada, fallback y cotización vencida, sin llamar a Meta o 99envíos.

Prueba con una respuesta del cliente por línea:

```text
hola
37
01
Ana Pérez
3001234567
Antioquia
Medellín
Calle 10 número 20
ninguna
confirmar
```

## Subir catálogo y atender ventas

En **Catálogo → Nueva referencia** crea código, modelo, color y precio, adjunta la fotografía y registra existencias por talla. Cada referencia tiene una fotografía, y una talla puede tener múltiples referencias. Solo las referencias activas con fotografía válida y unidades disponibles se envían por WhatsApp. La importación CSV/XLSX permite comenzar con Treinta; revisa el mapeo y los errores antes de confirmar. Una importación no sustituye fotografías faltantes.

En **Conversaciones** revisa el chat, pedido y lo que espera el bot. Toma control antes de responder manualmente. La automatización se pausa y no continúa contestando en paralelo. Reanudar devuelve el control al punto mostrado por el panel.

Una venta sigue: talla → fotos disponibles → referencia → datos → cotización automática → resumen → confirmación → reserva → guía → PDF. La guía aparece en el pedido y el PDF se envía como documento si la versión del flujo lo permite. Un webhook repetido no crea otra reserva, guía o documento. En **Pedidos** descarga el PDF y marca despachado una sola vez.

## Alertas, novedades y Treinta

**Alertas** reúne pedidos confirmados, guías creadas e incidencias. Abre la entidad asociada, marca como leída o resuelve tras revisar. Si el aviso al teléfono quedó incierto, comprueba el WhatsApp antes de cualquier acción: no hay reenvío automático.

En **Envíos → Novedades** sincroniza la sucursal y responde con confirmación. Una respuesta incierta queda bloqueada hasta revisar el proveedor; sincronizar no la convierte en pendiente ni autoriza otro envío.

El despacho registra el movimiento exportable una vez. En **Cierres diarios** revisa y genera el archivo del día, descarga, aplica manualmente en Treinta y confirma que lo aplicaste. El scheduler usa las 19:00 de `America/Bogota`. Regenerar conserva el cierre; reabrir exige motivo y conserva las versiones anteriores. Treinta no se actualiza por API ni mediante clics automatizados.

## Demo sin alterar cuentas reales

Primero muestra el panel, crea una referencia de prueba, publica municipios y mensajes y ejecuta ambos simuladores. La prueba automatizada usa proveedores controlados para recorrer conversación → pedido → reserva → guía → PDF → alertas → despacho → archivo de Treinta → reconocimiento.

```powershell
pnpm verify:local
```

Este comando inicia PostgreSQL de pruebas, espera su salud, ejecuta la puerta completa y detiene ese servicio al terminar. Usa `pnpm verify:local -- --keep-database` para dejarlo activo. Nunca apunta a la base de producción. Chromium debe estar instalado: `pnpm --filter @camila/admin exec playwright install chromium`.

Una demo real requiere credenciales activas, número autorizado, webhook público firmado, catálogo y stock listos y disponibilidad/saldo en 99envíos. La creación de guía real tiene efectos externos; acuerda previamente un único pedido controlado y su cancelación con el proveedor. Las pruebas automatizadas no crean guías reales.

## Auditoría y recuperación

**Configuración → Historial de cambios** muestra fecha, autora y acción de flujos, localidades, conexiones y novedades. Las respuestas públicas nunca incluyen contraseñas ni tokens. Respalda PostgreSQL, `MEDIA_ROOT` y la clave de cifrado. Ante guía incierta verifica su existencia en 99envíos antes de crear otra; ante PDF fallido descarga el PDF del pedido y conserva la guía existente.
