# Runbook — Proxy inverso y HTTPS

## Diseño

- **Caddy** termina HTTP(S) y enruta:
  - `/health/*` → `api:3000`
  - `/api/*` → `api:3000`
  - resto → `admin:8080` (nginx-unprivileged + SPA)
- Admin usa rutas relativas `/api/...`; no requiere `VITE_*` de API URL si el proxy es coherente.
- Caddy espera upstreams healthy (`health_uri` hacia API ready y admin `/`).

Plantilla montada: [docker/Caddyfile.example](../../docker/Caddyfile.example).

## Staging / loopback (sin DNS)

```bash
pnpm production:smoke
```

Este comando usa un proyecto Compose exclusivo; no combines el override staging con el nombre de proyecto `camila-prod`.

- HTTP: `http://127.0.0.1:18080`
- HTTPS: `https://127.0.0.1:18443` con `CAMILA_DOMAIN=localhost` y `CADDY_SITE_OPTIONS=tls internal`
- `ADMIN_ORIGIN=https://localhost:18443`

```bash
curl -k -sS --resolve localhost:18443:127.0.0.1 https://localhost:18443/health/live
curl -k -sS --resolve localhost:18443:127.0.0.1 https://localhost:18443/
```

## Producción con TLS

`compose.prod.yaml` publica **80/443** (y 443/udp). Requiere `CAMILA_DOMAIN`.

### `[HUMANO]` — checklist

1. **DNS:** `A`/`AAAA` de `CAMILA_DOMAIN` → IP de la VPS.
2. **Firewall:** permitir 80/443; denegar 5432 desde Internet.
3. **Certificados:**
   - Automático (recomendado): fijar `CADDY_GLOBAL_OPTIONS=email you@example.com` en `.env.prod`; Caddy obtiene cert ACME para `CAMILA_DOMAIN`.
   - Manual: PEM en volumen + directiva `tls` vía `CADDY_SITE_OPTIONS`.
4. **ADMIN_ORIGIN:** HTTPS exacto del panel (p. ej. `https://kairo.example.com`). Producción **rechaza** orígenes HTTP.
5. Confirmar que `.env.prod` no usa contraseñas `change_me` / example.

## WhatsApp webhooks

Meta llama URL HTTPS pública (p. ej. `https://kairo.example.com/api/whatsapp/webhook`). El mismo Caddy reenvía `/api/*` al API sin cache.

## Fallos frecuentes

- **502 en /api:** API no healthy o migrate pendiente; revisar `depends_on` y logs.
- **SPA 404 al refrescar:** falta `try_files` — incluido en `docker/nginx-admin.conf` (listen **8080**).
- **CORS / cookies:** `ADMIN_ORIGIN` = origen exacto del navegador (HTTPS en prod).
- **Staging TLS trust:** usar `curl -k` / `NODE_TLS_REJECT_UNAUTHORIZED=0` solo en smoke local.
