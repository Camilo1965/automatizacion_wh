# Validación sanitizada de 99envíos

Fecha: 2026-09-07. Ambiente: API oficial de integración. No se almacenan correo, contraseña ni JWT en este documento.

## Resultado

- `POST /api/integration/v1/login`: HTTP 200 y JWT no vacío.
- `POST /api/integration/v1/cotizar`: HTTP 200 con destino ficticio Medellín (`05001000`), contrapago, 1 kg, 30 × 20 × 12 cm y valor declarado de 120.000 COP.
- Respuestas utilizables: TCC, Servientrega, Coordinadora y Envia.
- Interrapidísimo respondió sin éxito porque la cuenta no tiene un código Inter asociado.
- La prueba de conversación real llegó a cotización, confirmación, reserva y envío de la solicitud de preenvío. El endpoint de preenvíos respondió `503 Service Unavailable`; el portal de la cuenta mostró cero envíos y cero preenvíos. No se creó recogida ni se obtuvo PDF.

## Prueba integral

El recorrido automatizado con PostgreSQL real y un proveedor controlado cubre bienvenida, talla, referencia, datos de entrega, cotización, confirmación duplicada, una sola reserva, una sola tarea de guía, creación de preenvío, descarga y almacenamiento idempotente del PDF. La prueba externa usa el comando protegido `CAMILA_ALLOW_REAL_GUIDE=YES pnpm --filter @camila/api shipping:acceptance`; solo admite una base cuyo nombre termine en `_test` y no se ejecuta desde `verify`.

Los errores `5xx` posteriores al envío de la solicitud de creación se conservan como resultado incierto y nunca se reintentan automáticamente. Los `4xx` continúan siendo rechazos deterministas. Antes de repetir la aceptación externa se debe comprobar en el portal que no exista el preenvío anterior.

## Hallazgo de contrato

El validador activo exige la presencia de `origen.nombre` y `origen.codigo`, aunque el arreglo `required` publicado para cotización no los enumera. Ambos admiten `null` según el esquema publicado. El adaptador envía ahora `origen: { nombre: null, codigo: null }` y mantiene una prueba del payload.

## Autenticación aplicada

El servidor solicita un JWT mediante correo y contraseña en cada operación y lo envía como Bearer. Los encabezados `X-Integration-Token` y `X-Integration-Id` permanecen opcionales para preenvío según la documentación; no sustituyen el JWT.
