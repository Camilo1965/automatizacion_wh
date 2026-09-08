# Validación sanitizada de 99envíos

Fecha: 2026-09-07. Ambiente: API oficial de integración. No se almacenan correo, contraseña ni JWT en este documento.

## Resultado

- `POST /api/integration/v1/login`: HTTP 200 y JWT no vacío.
- `POST /api/integration/v1/cotizar`: HTTP 200 con destino ficticio Medellín (`05001000`), contrapago, 1 kg, 30 × 20 × 12 cm y valor declarado de 120.000 COP.
- Respuestas utilizables: TCC, Servientrega, Coordinadora y Envia.
- Interrapidísimo respondió sin éxito porque la cuenta no tiene un código Inter asociado.
- La prueba de conversación real llegó a cotización, confirmación, reserva y envío de la solicitud de preenvío. Algunos intentos respondieron `503 Service Unavailable`; otros devolvieron HTTP 200 con un identificador numérico no compatible con el ejemplo publicado.
- El resumen inicial del portal continuó mostrando cero, pero la vista “Envíos completos” confirmó que los cuatro intentos controlados habían creado guías. Este hallazgo impide usar el contador del dashboard para decidir un reintento.
- La ejecución corregida creó una guía TCC con un valor contraentrega de `146093`. No se solicitó recolección.
- El PDF real tiene dos páginas, 64.998 bytes, firma `%PDF-` y SHA-256 `b58dd90e5065d229558b014194a037afdfb2e322c76bd127023bc62e039482f8`. La inspección visual confirmó transportadora, remesa, destino controlado y recaudo `146093`.

## Prueba integral

El recorrido automatizado con PostgreSQL real y un proveedor controlado cubre bienvenida, talla, referencia, datos de entrega, cotización, confirmación duplicada, una sola reserva, una sola tarea de guía, creación de preenvío, descarga y almacenamiento idempotente del PDF. La prueba externa usa el comando protegido `CAMILA_ALLOW_REAL_GUIDE=YES pnpm --filter @camila/api shipping:acceptance`; solo admite una base cuyo nombre termine en `_test` y no se ejecuta desde `verify`.

Los errores `5xx` posteriores al envío de la solicitud de creación se conservan como resultado incierto y nunca se reintentan automáticamente. Los `4xx` continúan siendo rechazos deterministas. Antes de repetir la aceptación externa se debe comprobar en el portal que no exista el preenvío anterior.

## Diferencias observadas frente al OpenAPI

- `numeroPreenvio` puede llegar como número aunque el ejemplo lo muestra como texto. El adaptador lo normaliza a texto para persistencia.
- `valorFlete` puede incluir decimales; el dominio actual conserva COP enteros y redondea al límite del adaptador.
- El endpoint de PDF exige la guía como número. Para Servientrega llegó a responder una URL de `api.99envios.app/storage/` declarada como `text/html`; el adaptador solo sigue URLs HTTPS de ese host y valida la firma `%PDF-`.
- Para la guía TCC probada, el endpoint público de PDF respondió `401 Transportadora no encontrada`, mientras el mismo PDF estaba disponible desde la acción “Ver PDF” del portal. La evidencia se recuperó desde esa ubicación y se asoció al pedido sin crear otra guía.
- La cuenta muestra el documento de identidad como no verificado. Esto no impidió crear las guías, pero debe resolverse antes del piloto.

## Corrección del valor contraentrega

El video oficial indica que la guía debe recibir el total que pagará el cliente. El worker ahora obtiene el valor desde la cotización inmutable asociada a la tarea: subtotal del producto más flete, servicio contraentrega y sobreflete. La prueba integral comprueba que `120000 + 13368 + 3000 + 600 = 136968` llegue a `valorDeclarado` y que una confirmación repetida produzca una sola tarea.

Fuente audiovisual revisada completa: [APIs externas en 99envíos](https://www.youtube.com/watch?v=gxLA-fc8gJg).

## Hallazgo de contrato

El validador activo exige la presencia de `origen.nombre` y `origen.codigo`, aunque el arreglo `required` publicado para cotización no los enumera. Ambos admiten `null` según el esquema publicado. El adaptador envía ahora `origen: { nombre: null, codigo: null }` y mantiene una prueba del payload.

## Autenticación aplicada

El servidor solicita un JWT mediante correo y contraseña en cada operación y lo envía como Bearer. Los encabezados `X-Integration-Token` y `X-Integration-Id` permanecen opcionales para preenvío según la documentación; no sustituyen el JWT.
