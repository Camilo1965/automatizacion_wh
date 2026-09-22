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

### `[HUMANO]`

- Contrato comercial y límites de la cuenta 99envíos.
- Procedimiento si 99envíos cambia API o credenciales de integración.
