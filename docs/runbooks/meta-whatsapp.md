# Runbook — Meta WhatsApp Cloud API

## Variables

En `.env.prod` (o cifrado en panel con `KAIRO_CONFIG_ENCRYPTION_KEY`):

| Variable                        | Uso                          |
| ------------------------------- | ---------------------------- |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Verificación GET del webhook |
| `WHATSAPP_APP_SECRET`           | Firma HMAC de payloads       |
| `WHATSAPP_ACCESS_TOKEN`         | Envío de mensajes            |
| `WHATSAPP_PHONE_NUMBER_ID`      | ID del número                |
| `WHATSAPP_GRAPH_API_VERSION`    | p. ej. `v26.0`               |

Access token y phone number id deben configurarse **juntos** o ninguno (validación en `loadConfig`).

## Webhook público

1. Proxy HTTPS activo ([proxy-https.md](./proxy-https.md)).
2. URL callback en Meta Developers: `https://<dominio>/webhooks/whatsapp` (ruta registrada en el API).
3. Verify token igual a `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

### `[HUMANO]`

- App Meta en modo producción y número aprobado.
- Política de rotación de token y registro de quién tiene acceso al Business Manager.

## Verificación operativa

- GET de verificación desde Meta (challenge).
- POST de prueba con firma válida (`WHATSAPP_APP_SECRET`).
- Revisar cola/worker para mensajes salientes tras cambios de config.

## Incidentes

- **401/403 en envío:** token expirado o permisos insuficientes — renovar en Meta.
- **Webhooks no llegan:** DNS, TLS, firewall, URL mal configurada en Meta.
- **Firma inválida:** secret distinto al configurado en app Meta.
