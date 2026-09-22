# Inventario de PII — KAIRO / Camila

Inventario técnico de tablas y campos que pueden contener datos personales identificables (PII). No sustituye asesoría legal.

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
| `whatsapp_outbound_messages`     | `recipient_phone` | Teléfono destino        |

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
