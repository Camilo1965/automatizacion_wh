# Runbook — 99envíos

Integración para cotización y creación de guías. Credenciales opcionales hasta operación real.

## Variables de entorno

Pares obligatorios (validación simétrica en config):

- `NINETYNINE_ENVIOS_EMAIL` + `NINETYNINE_ENVIOS_PASSWORD`

Opcionales según contrato con 99envíos:

- `NINETYNINE_ENVIOS_INTEGRATION_TOKEN`
- `NINETYNINE_ENVIOS_INTEGRATION_ID`
- `NINETYNINE_ENVIOS_BRANCH_CODE` (código numérico de sucursal, usado por el respaldo del PDF si el API no encuentra la transportadora)

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

En la cuenta KAIRO probada, `/pdf/{tipo_pdf}` devolvió `401` con `Transportadora no encontrada.` para TCC, incluso con JWT válido y ambos formatos (`1` sticker y `2` normal). El portal **Envíos completos → Acción → Ver PDF** sí abrió el PDF de esa guía. La respuesta de cotización usa el carrier canónico `tcc`; el mismo valor y país se enviaron al endpoint PDF, así que cambiar mayúsculas o el tipo de PDF no resuelve este rechazo.

KAIRO ahora aplica un respaldo limitado cuando coinciden las tres condiciones: el endpoint PDF responde `401`, su cuerpo es exactamente `Transportadora no encontrada`, y hay un `branchCode` numérico configurado. En ese caso descarga el objeto de guía que el portal sirve desde `api.99envios.app/storage/...`. El código de sucursal se configura como `NINETYNINE_ENVIOS_BRANCH_CODE` en el entorno o como `Sucursal de 99envíos` en Integraciones. Solo se aceptan transportadoras del catálogo KAIRO, el host es fijo y no se siguen redirecciones. No se intenta un preenvío alternativo.

Esta ruta de almacenamiento no está descrita en el OpenAPI; es un respaldo observado y verificado con guías existentes en el portal. Si el objeto no está disponible, no se vuelve a crear la guía: conserva su número, usa **Ver PDF** en el portal y escala a 99envíos para que corrijan el endpoint oficial. El error por JWT inválido no activa el respaldo.

### `[HUMANO]`

- Contrato comercial y límites de la cuenta 99envíos.
- Procedimiento si 99envíos cambia API o credenciales de integración.
