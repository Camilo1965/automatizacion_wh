# Matriz de retención (plantilla)

Completar períodos y acciones con criterio legal/operativo. Columna **legal status** queda para revisión humana.

**No reemplazar `[HUMANO]` con duraciones inventadas.** Tras aprobación Colombia, copiar valores a una política versionada (`retention_policies`) con `legalStatus=approved` y activar con reautenticación owner (`security:manage`).

Ejecución automática permanece OFF hasta `RETENTION_EXECUTION_ENABLED=true` **y** política activa aprobada.

| data class                                                                        | retention                                         | action                                                                                     | legal status |
| --------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| Mensajes WhatsApp inbound (`whatsapp_inbound_messages`)                           | `[HUMANO]`                                        | retain / anonymize / delete por política versionada                                        | `[HUMANO]`   |
| Mensajes conversación (`whatsapp_conversation_messages`)                          | `[HUMANO]`                                        | retain / anonymize / delete                                                                | `[HUMANO]`   |
| Mensajes outbound (`whatsapp_outbound_messages`)                                  | `[HUMANO]`                                        | retain / anonymize / delete                                                                | `[HUMANO]`   |
| Conversaciones (`whatsapp_conversations`)                                         | `[HUMANO]`                                        | retain / anonymize (no delete si hay FK a pedidos)                                         | `[HUMANO]`   |
| Pedidos confirmados — PII (`sales_orders`, `order_summaries`)                      | `[HUMANO]`                                        | **anonymize** o retain (nunca delete vía retención)                                        | `[HUMANO]`   |
| Sesiones admin expiradas (`admin_sessions`)                                       | 12 h activas + purge de filas vencidas            | delete de expiradas/revocadas; simular/ejecutar vía retención                              | `[HUMANO]`   |
| Alertas resueltas (`owner_alerts`)                                                | `[HUMANO]`                                        | retain / delete                                                                            | `[HUMANO]`   |
| Auditoría (`admin_audit_events`)                                                  | `[HUMANO]`                                        | **retain** obligatorio                                                                     | `[HUMANO]`   |
| Secretos MFA / integraciones                                                      | Mientras la cuenta esté activa                    | Borrar al deshabilitar MFA / rotar integraciones                                           | `[HUMANO]`   |

Herramientas: UI `settings/privacy`, `pnpm --filter @camila/api retention:simulate`, `pnpm --filter @camila/api retention:execute`.
