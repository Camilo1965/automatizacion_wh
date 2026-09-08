# Validación sanitizada de 99envíos

Fecha: 2026-09-07. Ambiente: API oficial de integración. No se almacenan correo, contraseña ni JWT en este documento.

## Resultado

- `POST /api/integration/v1/login`: HTTP 200 y JWT no vacío.
- `POST /api/integration/v1/cotizar`: HTTP 200 con destino ficticio Medellín (`05001000`), contrapago, 1 kg, 30 × 20 × 12 cm y valor declarado de 120.000 COP.
- Respuestas utilizables: TCC, Servientrega, Coordinadora y Envia.
- Interrapidísimo respondió sin éxito porque la cuenta no tiene un código Inter asociado.
- No se creó preenvío, guía, recogida ni PDF.

## Hallazgo de contrato

El validador activo exige la presencia de `origen.nombre` y `origen.codigo`, aunque el arreglo `required` publicado para cotización no los enumera. Ambos admiten `null` según el esquema publicado. El adaptador envía ahora `origen: { nombre: null, codigo: null }` y mantiene una prueba del payload.

## Autenticación aplicada

El servidor solicita un JWT mediante correo y contraseña en cada operación y lo envía como Bearer. Los encabezados `X-Integration-Token` y `X-Integration-Id` permanecen opcionales para preenvío según la documentación; no sustituyen el JWT.
