# Fase 3 — Frontend UX operativa

**Objetivo:** Búsqueda global en servidor; modularizar superficies operativas (Bot primero); estados de carga/vacío/error en recorridos incluidos.

**Puerta:** E2E caminos felices + recuperables; cliente no pagina lotes para filtrar localmente.

## Tareas

### 3.1 Búsqueda global (servidor)
- Contrato `GlobalSearch*` en `packages/contracts`
- `GlobalSearchService` + `GET /api/admin/search?q=`
- Admin: `GlobalSearch` debounced → endpoint (sin descargar páginas)
- Tests: contratos + integración + unit admin

### 3.2 Bot flow modular
- Extraer panel de simulación a componente dedicado
- Conservar tabs Editor / Simular / Historial (escritorio + móvil)

### 3.3 Fuera de este commit (siguientes)
- Rediseño profundo Integraciones / Envíos / Bandeja / Pedidos (iteraciones)
- Endpoint búsqueda ya desbloquea Fase 3 gate principal del diseño

**Estado:** Completada (`pnpm verify` verde).

**Commit:** `feat: move global search to server and split bot simulate panel`
