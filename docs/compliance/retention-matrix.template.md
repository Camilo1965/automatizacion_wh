# Matriz de retención (plantilla)

Completar períodos y acciones con criterio legal/operativo. Columna **legal status** queda para revisión humana.

| data class                                                                        | retention                                         | action                                                                                     | legal status |
| --------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| Mensajes WhatsApp (`whatsapp_conversation_messages`, `whatsapp_inbound_messages`) | `[HUMANO]`                                        | Purga/anonymize vía job futuro; simular con `pnpm --filter @camila/api retention:simulate` | `[HUMANO]`   |
| Pedidos confirmados (`sales_orders` y relacionados)                               | `[HUMANO]`                                        | Archivar o anonimizar tras plazo comercial                                                 | `[HUMANO]`   |
| Sesiones admin expiradas (`admin_sessions`)                                       | 12 h activas + purge automático de filas vencidas | `purgeExpiredSessions()` en worker                                                         | `[HUMANO]`   |
| Alertas resueltas (`owner_alerts`)                                                | `[HUMANO]`                                        | Eliminar o compactar tras N días                                                           | `[HUMANO]`   |
| Auditoría de configuración (`configuration_audits`)                               | `[HUMANO]`                                        | Retener mínimo requerido por cumplimiento                                                  | `[HUMANO]`   |
| Secretos MFA / integraciones                                                      | Mientras la cuenta esté activa                    | Borrar al deshabilitar MFA / rotar integraciones                                           | `[HUMANO]`   |
