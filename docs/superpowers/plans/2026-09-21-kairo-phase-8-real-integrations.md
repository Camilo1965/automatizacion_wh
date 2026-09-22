# Fase 8 — Integraciones reales

**Objetivo:** Evidencia trazable Meta + 99envíos con credenciales reales fuera del repo.

**Automatizable:** plantillas, preflight CLI, empaquetado de evidencia.
**`[HUMANO]` obligatorio:** credenciales Meta/99envíos, autorización de una guía real, mensajes reales.

## Checklist `[HUMANO]`

1. Configurar WABA + webhook HTTPS + tokens en panel (Integraciones → probar → activar).
2. Recibir un mensaje de prueba y enviar respuesta (bot o panel).
3. Cotizar pedido draft con 99envíos.
4. Confirmar pedido deliberado y autorizar **una** guía (`CAMILA_ALLOW_REAL_GUIDE=YES` + `pnpm --filter @camila/api shipping:acceptance`).
5. Verificar PDF y clasificar created / uncertain / failed.
6. Rellenar [docs/integrations/evidence-log.md](../../integrations/evidence-log.md) sin secretos.

## Entregables repo

- Plantillas Meta / evidencia
- Runbooks Meta y 99envíos (Fase 7)
- CLI de aceptación controlada existente

**Estado:** Preparación completada; evidencia real `[HUMANO]` pendiente.
