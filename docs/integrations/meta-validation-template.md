# Plantilla de validación Meta WhatsApp

Fecha: ____-**-** · Operador: ________ · Ambiente: staging / producción

## Preflight

| Chequeo                                   | OK         |
| ----------------------------------------- | ---------- |
| Webhook URL HTTPS pública                 | `[HUMANO]` |
| Verify token coincide                     |            |
| App secret configurado (cifrado en panel) |            |
| Phone number ID / WABA                    |            |
| Plantilla de alerta propietaria aprobada  |            |

## Pruebas no destructivas

| Paso                            | Resultado | Hora | Notas (sin tokens) |
| ------------------------------- | --------- | ---- | ------------------ |
| GET verify webhook              |           |      |                    |
| Inbound texto → bot             |           |      |                    |
| Outbound bot texto              |           |      |                    |
| Takeover humano + mensaje panel |           |      |                    |
| Return to bot                   |           |      |                    |

## Fallos observados

| Síntoma | Código / HTTP | Recuperación |
| ------- | ------------- | ------------ |
|         |               |              |

**No pegar access tokens, app secrets ni números personales completos.**
