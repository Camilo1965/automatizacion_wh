# Inventario de PII — KAIRO / Camila

Inventario técnico de tablas y campos que pueden contener datos personales identificables (PII). No sustituye asesoría legal.

**Capacidad:** `security:manage` (owner) para políticas, dry-run, ejecución y solicitudes de titular; `audit:read` para ver reportes/runs.

**Duraciones legales Colombia:** `[HUMANO]` — no inventar plazos aprobados. Ver `retention-matrix.template.md`.

**Ejecución automática:** OFF salvo `RETENTION_EXECUTION_ENABLED=true` **y** política activa con `legalStatus=approved` por clase.

## Clases de retención (modelo explícito)

| data class | Tablas | Estrategia de relación | Acciones permitidas |
| --- | --- | --- | --- |
| `whatsapp_inbound_messages` | `whatsapp_inbound_messages` | Filas independientes | retain / anonymize / delete |
| `whatsapp_conversation_messages` | `whatsapp_conversation_messages` | Hijo de conversación | retain / anonymize / delete |
| `whatsapp_outbound_messages` | `whatsapp_outbound_messages` | Outbox | retain / anonymize / delete |
| `whatsapp_conversations` | `whatsapp_conversations` | Puede referenciar pedidos (restrict); no borrar si hay FK | retain / anonymize |
| `sales_orders_customer_pii` | `sales_orders`, `order_summaries` | Conservación comercial: anonimizar PII; **nunca** borrar pedido vía retención | retain / anonymize |
| `admin_sessions_expired` | `admin_sessions` | Solo sesiones vencidas/revocadas | retain / delete |
| `owner_alerts_resolved` | `owner_alerts` | Solo alertas resueltas | retain / delete |
| `admin_audit_events` | `admin_audit_events` | Auditoría inmutable | retain **solo** |

## Administración

| Tabla            | Campo        | Clase                                             |
| ---------------- | ------------ | ------------------------------------------------- |
| `admin_users`    | `username`   | Identificador de cuenta (puede ser pseudónimo)    |
| `admin_sessions` | `token_hash` | Derivado criptográfico de sesión (no PII directo) |

## Pedidos y clientes

| Tabla             | Campo            | Clase                                           |
| ----------------- | ---------------- | ----------------------------------------------- |
| `sales_orders`    | `customer_name`  | Nombre                                          |
| `sales_orders`    | `customer_phone` | Teléfono                                        |
| `sales_orders`    | `address`        | Dirección                                       |
| `sales_orders`    | `delivery_notes` | Notas que pueden incluir PII                    |
| `order_summaries` | `payload` (JSON) | Resumen de pedido; puede repetir datos de envío |

## WhatsApp / conversaciones

| Tabla                            | Campo             | Clase                   |
| -------------------------------- | ----------------- | ----------------------- |
| `whatsapp_inbound_messages`      | `customer_phone`  | Teléfono                |
| `whatsapp_inbound_messages`      | `text_body`       | Contenido de mensaje    |
| `whatsapp_inbound_messages`      | `payload` (JSON)  | Metadatos del proveedor |
| `whatsapp_conversations`         | `customer_phone`  | Teléfono                |
| `whatsapp_conversation_messages` | `text_body`       | Contenido de mensaje    |
| `whatsapp_outbound_messages`     | `customer_phone`  | Teléfono destino        |
| `whatsapp_outbound_messages`     | `text_body`       | Contenido de mensaje    |

## Envíos

| Tabla                 | Campo                                | Clase                                 |
| --------------------- | ------------------------------------ | ------------------------------------- |
| `shipping_quotes`     | Campos de destino en JSON/`snapshot` | Dirección / teléfono según cotización |
| `shipping_guide_jobs` | Metadatos de guía                    | Puede incluir datos del destinatario  |

## Integraciones (secretos)

| Tabla                  | Campo             | Clase                                                          |
| ---------------------- | ----------------- | -------------------------------------------------------------- |
| `integration_settings` | `encrypted_value` | Credenciales de terceros (no PII de clientes, datos sensibles) |

## MFA (admin)

| Tabla                      | Campo              | Clase                           |
| -------------------------- | ------------------ | ------------------------------- |
| `admin_mfa_secrets`        | `encrypted_secret` | Secreto TOTP cifrado            |
| `admin_mfa_recovery_codes` | `code_hash`        | Hash de códigos de recuperación |

## Alertas operativas

| Tabla          | Campo             | Clase                                            |
| -------------- | ----------------- | ------------------------------------------------ |
| `owner_alerts` | `title`, `detail` | Puede mencionar pedidos/teléfonos en texto libre |

## Auditoría

| Tabla                 | Campo                         | Clase                                      |
| --------------------- | ----------------------------- | ------------------------------------------ |
| `admin_audit_events`  | `actor_username`, `metadata`  | Conservar; sin cuerpos de mensaje ni PII cruda |

## Operación

- Dry-run: `pnpm --filter @camila/api retention:execute -- --mode=dry_run` o UI Privacidad.
- Compat conteo: `pnpm --filter @camila/api retention:simulate`.
- Execute: solo con flag + política activa aprobada; lotes reanudables e informe firmado.
