# Fase 2 — Diseño, responsive y accesibilidad

**Estado:** completado (2026-09-21). `pnpm verify` exit 0; Axe critical/serious = 0 en flujos E2E incluidos.

**Precondiciones:** Fase 1 cerrada (`pnpm verify` verde).

**Fuente:** [diseño rector §6](../specs/2026-09-21-kairo-production-hardening-design.md)

## Tareas

### 2.1 Marca visible
- Shell: sidebar, header móvil, `index.html`, búsqueda global.
- Producto: **KAIRO** (hero) + **Operaciones** (subtítulo).
- Tests unitarios/E2E que aún digan Camila en landmarks de marca.

### 2.2 Tokens y contraste
- `--muted-foreground` y equivalentes sidebar ≥ 4.5:1 sobre `--background` / `--sidebar`.
- Eyebrows/descripciones: usar token AA o `text-foreground/70` donde el muted falle.
- Sin selector ni CSS incompleto de modo oscuro en superficie operativa.

### 2.3 Accesibilidad de formularios críticos
- Bot flow: labels explícitos en comandos, page size y campos del editor.
- Re-activar Axe en E2E de bot/localities/shipping/integrations cuando pase.

### 2.4 Cascada heredada
- Reducir reglas globales peligrosas en `styles.css` (enlaces ya retirados en F1).
- Preferir utilidades/tokens; no reintroducir `a { color }`.

### 2.5 Puerta de salida
```bash
docker compose --profile test up -d postgres-test
pnpm verify
```
- Axe critical/serious = 0 en recorridos E2E incluidos.
- Teclado + 390 / 768 / 1280 / 1440 sin overflow horizontal en operaciones.

**Commit recomendado:** `feat: unify KAIRO Operaciones brand and WCAG AA shell`
