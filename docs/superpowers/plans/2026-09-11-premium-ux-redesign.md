# Plan: rediseño UX premium Camila (cliente final)

Fecha: 11 de septiembre de 2026  
Repo: `Camilo1965/automatizacion_wh`  
App: `apps/admin`  
Audiencia: propietaria del negocio de calzado (usuaria final, no desarrolladora)

## 1. Objetivo

Entregar un panel operativo **listo para cliente final**: login con marca y logo, sistema visual único, y todos los paneles (operativos + premium) al mismo nivel de calidad. La dueña debe reconocer un producto profesional al entrar y poder operar el día (prioridades → pedidos → WhatsApp) sin pantallas de “herramienta interna”.

## 2. Diagnóstico actual (HEAD `59ca02f`)

| Área | Estado |
| --- | --- |
| Design system (tokens, Button, PageHeader, EmptyState, etc.) | Existe, adopción parcial |
| Dashboard con conteos reales | Sí |
| Inbox WhatsApp (lista + timeline + composer + control) | Sí |
| Alertas, integraciones, cierres Treinta, settings WA | Sí |
| Login | Formulario plano dentro de AppShell — no brand |
| Pedidos lista / detalle | Legacy; `?view=` del dashboard no filtra |
| Catálogo | Legacy visual |
| Inbox `?attention=` | No cableado |
| Dualidad CSS `.button-primary` vs `.ui-button` | Activa — rompe sensación de producto |

## 3. Dirección de marca

- **Nombre:** Camila Operaciones
- **Estética:** retail-ops premium (claridad tipo Linear × calidez boutique)
- **Logo:** mark circular (burbuja de chat verde bosque + acento terracota). Archivos objetivo: `apps/admin/public/logo.svg`, `logo.png`, favicon.
- **Paleta:**
  - Canvas `#F7F4EF`
  - Surface `#FFFFFF` / soft `#F0EBE4`
  - Texto `#27211E` / muted `#675F57`
  - Borde `#DED5CB`
  - Primary `#236052` / hover `#194B40` / soft `#E6F0ED`
  - Accent terracota `#B65C43`
  - Danger / warning / success con pares soft existentes, unificados
- **Tipografía:** Inter (UI) + mono para códigos de referencia
- **Reglas:** mobile-first 390px, desktop 1280px, targets 44px, WCAG 2.2 AA, `prefers-reduced-motion`
- **Principio duro:** un solo design system; eliminar clases legacy de botones en pantallas

## 4. Fases de implementación

### F0 — Fundación visual

- Ampliar `apps/admin/src/design/tokens.css` (densidad, z-index, logo sizes)
- Añadir logo SVG/PNG + favicon en `public/`
- Depurar `styles.css`: alias legacy → tokens; documentar deprecación de `.button-primary`
- Asegurar `ToastProvider` y tipografía cargados en `main.tsx`

**Gate:** build admin + snapshot visual de tokens.

### F1 — Login centrado con logo (prioridad de percepción)

- `LoginPage` **fuera** del chrome de operaciones (sin sidebar/nav operativa)
- Layout centrado: logo grande, wordmark “Camila”, subtítulo “Operaciones”
- Card con `FormField` + `Button` primary full-width
- Errores claros; estado loading; fondo con gradiente de marca
- Copy de producto (no “panel de catálogo e inventario” técnico)

**Gate:** E2E login + unit del formulario; revisión a 390px y 1280px.

### F2 — Shell premium

- Sidebar con logo + grupos (Operación / Inventario / Configuración)
- `GlobalHeader`: usuario, entorno, enlace/estado WhatsApp o integraciones
- `MobileNavigation` 5 destinos + Más
- Skeletons y empty states consistentes en rutas autenticadas

**Gate:** navegación desktop/móvil sin pantallas rotas.

### F3 — Paneles operativos (crítico MVP)

1. **Inicio** — pulido visual; deep links deben filtrar destino
2. **Pedidos** — rebuild con filtros URL:
   - `view=incidents`
   - `view=ready_to_dispatch`
   - `view=awaiting_confirmation`
   - `view=all` (default)
   - Preferir filtros en API; si temporalmente client-side, documentarlo
   - `StatusBadge` + `ResponsiveDataList` / cards premium + `PageHeader`
3. **Detalle pedido** — pasos de workflow, `SearchCombobox` de municipio (no DANE a pelo como UX primaria), acciones con `Button`/`StatusBadge`, bloques cotización/guía/PDF claros
4. **Conversaciones** — mantener inbox; filtrar `attention=true`; preview último mensaje si el contrato lo permite
5. **Catálogo + detalle referencia** — migrar a design system; readiness visual; stock legible

**Gate:** E2E dashboard → pedidos filtrados → inbox attention; typecheck/lint/unit admin.

### F4 — Paneles premium restantes

- Preferencias de envío (combobox localidades)
- WhatsApp settings
- Integraciones
- Alertas
- Cierres Treinta / inventario
- Importar catálogo
- Más

Mismo lenguaje visual, mismos componentes, sin pantallas “huérfanas”.

**Gate:** recorrido manual de cada ruta a 390px; sin clases legacy visibles.

### F5 — Calidad cliente final

- Copy 100% español de negocio
- Teclado + focus visibles
- `pnpm --filter @camila/admin` typecheck, unit, e2e afectados
- Checklist de aceptación con la propietaria (login, prioridades del día, pedido, chat, catálogo)

## 5. Fuera de alcance (esta entrega)

- Chatwoot / VPS / cambios de Meta en producción
- Nueva librería UI externa salvo necesidad clara (preferir componentes existentes en `apps/admin/src/components`)
- Refactors de backend no relacionados con filtros de listados

## 6. Criterio de listo

Una propietaria:

1. Abre `/login` y ve marca + logo profesional
2. Entra al Inicio y entiende qué atender hoy (números reales)
3. Pica una prioridad y ve la cola filtrada correcta
4. Abre un pedido y completa el flujo sin UX de desarrollador
5. Responde un WhatsApp desde el inbox
6. No encuentra botones ni tipografías inconsistentes entre pantallas

## 7. Orden de PRs sugerido

1. F0 + F1 (marca + login) — máximo impacto percibido
2. F2 + F3 pedidos/inbox filters — desbloquea operación real
3. F3 catálogo + F4 paneles restantes
4. F5 polish + E2E

## 8. Notas para el agente de implementación

- Partir de `main` actual; no asumir que OrdersList ya lee search params (hoy no lo hace).
- Extender contratos Zod/`@camila/contracts` si hace falta `view` en list orders.
- Mantener auth de una sola propietaria.
- No versionar secretos ni `.env`.
- El logo de referencia se generó en el asistente Grok Bot (mark verde/terracota); recrear SVG limpio en `public/`.
