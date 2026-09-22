# Plantilla de validación Meta WhatsApp

Fecha: ____-**-** · Operador: ________ · Ambiente: staging / producción

**Estado Task 13 (2026-09-22):** plantilla `verified` (automatable). **Todas las pruebas live = `[HUMANO]` / BLOCKING.** No se ejecutaron llamadas reales Meta en closeout automático.

## Preflight

| Chequeo                                   | Estado                  | Acción humana exacta                                                                          |
| ----------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| Webhook URL HTTPS pública                 | **BLOCKING** `[HUMANO]` | Publicar dominio + DNS A/AAAA → VPS; Caddy ACME; URL `https://<dominio>/…webhook` en Meta App |
| Verify token coincide                     | **BLOCKING** `[HUMANO]` | Pegar mismo verify token en panel Integraciones y Meta; guardar vía panel (cifrado)           |
| App secret configurado (cifrado en panel) | **BLOCKING** `[HUMANO]` | Secret channel → panel; nunca Git/chat                                                        |
| Phone number ID / WABA                    | **BLOCKING** `[HUMANO]` | Copiar IDs desde Meta Business → panel                                                        |
| Plantilla de alerta propietaria aprobada  | **BLOCKING** `[HUMANO]` | Meta Business Manager: plantilla Approved; registrar nombre + idioma aquí                     |

## Pruebas no destructivas `[HUMANO]`

Solo tras preflight OK. Registrar Resultado / Hora UTC / Notas **sin tokens**.

| Paso                             | Resultado              | Hora | Notas (sin tokens)                            |
| -------------------------------- | ---------------------- | ---- | --------------------------------------------- |
| GET verify webhook               | **BLOCKING** pendiente |      | Captura HTTP 200 + challenge OK               |
| Signature rejection (firma mala) | **BLOCKING** pendiente |      | Confirmar 401/403; sin body sensible          |
| Inbound texto → bot              | **BLOCKING** pendiente |      | wamid parcial + correlación                   |
| Outbound bot texto               | **BLOCKING** pendiente |      | Dentro ventana 24h servicio                   |
| Plantilla aprobada (si aplica)   | **BLOCKING** pendiente |      | Solo si Meta confirma coexistence / plantilla |
| Takeover humano + mensaje panel  | **BLOCKING** pendiente |      |                                               |
| Return to bot                    | **BLOCKING** pendiente |      |                                               |

## Fallos observados

| Síntoma | Código / HTTP | Recuperación |
| ------- | ------------- | ------------ |
|         |               |              |

## Evidencia mínima para quitar BLOCKING

1. Timestamp UTC + ambiente.
2. Verify OK + un inbound + un outbound (o plantilla) con IDs sanitizados.
3. Fila correspondiente en `evidence-log.md`.
4. Confirmación Meta de coexistence **solo si** el producto lo exige — no asumir.

**No pegar access tokens, app secrets ni números personales completos.**
