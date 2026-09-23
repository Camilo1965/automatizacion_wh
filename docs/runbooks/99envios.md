# Runbook — 99envíos

Integración para cotización y creación de guías. Credenciales opcionales hasta operación real.

## Variables de entorno

Pares obligatorios (validación simétrica en config):

- `NINETYNINE_ENVIOS_EMAIL` + `NINETYNINE_ENVIOS_PASSWORD`

Opcionales según contrato con 99envíos:

- `NINETYNINE_ENVIOS_INTEGRATION_TOKEN`
- `NINETYNINE_ENVIOS_INTEGRATION_ID`

Alternativa: guardar conexión cifrada en panel KAIRO (requiere `KAIRO_CONFIG_ENCRYPTION_KEY` en producción).

## Activación

1. Obtener credenciales de cuenta 99envíos.
2. Configurar en `.env.prod` o panel Integraciones.
3. Probar cotización en entorno controlado antes de guías reales.
4. CLI local de aceptación (solo dev/test): `pnpm --filter @camila/api shipping:acceptance`.

## Operación

- Fallos de login: revisar email/password y estado del servicio 99envíos.
- Guías duplicadas: el backend usa idempotencia en caminos críticos; no reintentar manualmente sin revisar orden en panel.

## Contrato comprobado y PDF

La [especificación oficial OpenAPI de 99envíos](https://integration.99envios.app/api-docs-json), consultada el 22 de septiembre de 2026, publica la versión `2.0.0`. Para `POST /api/integration/v1/preenvio`, `IdServicio` se describe como “solo acepta valor 1 para estándar”. Por eso el adaptador envía `1` en el preenvío aunque una cotización de una transportadora devuelva otro `IdServicio` (por ejemplo `12`); ese valor de la respuesta se conserva con la oferta, pero no reemplaza el código estándar exigido por el endpoint de creación. Este es un requisito del contrato publicado, no una conversión inferida por KAIRO.

Un `401` al consultar `/pdf/{tipo_pdf}` no autoriza crear otro preenvío. La guía puede existir en **Envíos completos** aunque el PDF del endpoint falle; conserva el número de guía y comprueba la acción **Ver PDF** del portal antes de escalar el caso a 99envíos. Las pruebas locales comprueban que el fallo de PDF no llama a `/preenvio`, pero la obtención de PDF para TCC en la cuenta real sigue pendiente de confirmación externa.

### `[HUMANO]`

- Contrato comercial y límites de la cuenta 99envíos.
- Procedimiento si 99envíos cambia API o credenciales de integración.
