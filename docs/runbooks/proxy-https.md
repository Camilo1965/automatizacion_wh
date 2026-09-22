# Runbook — Proxy inverso y HTTPS

## Diseño

- **Caddy** termina HTTP(S) y enruta:
  - `/api/*` → servicio `api:3000`
  - resto → servicio `admin:80` (nginx + SPA)
- Admin usa rutas relativas `/api/...`; no requiere `VITE_*` de API URL si el proxy es coherente.

Plantilla: [docker/Caddyfile.example](../../docker/Caddyfile.example).

## Desarrollo / prueba en VPS

`compose.prod.yaml` publica Caddy en `127.0.0.1:8080:80` para probar sin abrir el firewall público:

```bash
curl -sS http://127.0.0.1:8080/          # admin SPA
docker compose -f compose.prod.yaml exec api wget -qO- http://127.0.0.1:3000/health/live
```

## Producción con TLS

### `[HUMANO]` — checklist

1. **DNS:** registro `A`/`AAAA` del dominio admin (y API si separa host) hacia la IP de la VPS.
2. **Firewall:** permitir 80 y 443; denegar 5432 desde Internet.
3. **Certificados:**
   - **Automático (recomendado):** descomentar bloque `{$CAMILA_DOMAIN}` en Caddyfile, fijar `email` en bloque global, montar `docker/Caddyfile` (no solo `.example`).
   - **Manual:** PEM en volumen y directiva `tls` en Caddy; rotación fuera de banda.
4. **Compose:** descomentar `ports: '80:80'` y `'443:443'` en servicio `caddy`; quitar bind solo loopback si aplica.
5. **ADMIN_ORIGIN:** en `.env.prod`, debe coincidir con la URL HTTPS del panel (p. ej. `https://kairo.example.com`).

## WhatsApp webhooks

Meta llama URL HTTPS pública (p. ej. `https://kairo.example.com/api/whatsapp/webhook`). El mismo Caddy debe reenviar ese path al API sin cache.

## Fallos frecuentes

- **502 en /api:** API caída o no en red `internal`; revisar `depends_on` y logs API.
- **SPA 404 al refrescar:** falta `try_files` en nginx admin — ya incluido en `docker/nginx-admin.conf`.
- **CORS / cookies:** `ADMIN_ORIGIN` debe ser el origen exacto del navegador.
