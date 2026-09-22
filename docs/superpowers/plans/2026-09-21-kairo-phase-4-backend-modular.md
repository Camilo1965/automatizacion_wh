# Fase 4 — Backend modular, schema y contratos

**Objetivo:** Separar HTTP/worker; partir schema y contratos por dominio; modularizar rutas admin; formalizar máquinas de estado e idempotencia en caminos críticos.

**Puerta:** Contratos públicos compatibles; API y worker arrancan independientes; invariantes críticas en DB + tests; `pnpm verify` verde.

## Tareas

### 4.1 Entrypoints HTTP / worker
- `createRuntime()` compartido
- `server.ts` HTTP-only (sin timers de workers)
- `worker.ts` loops + graceful stop
- Scripts `dev:worker`, `start`, `start:worker`; root `dev` incluye worker

### 4.2 Schema por dominio
- Partir `database/schema.ts` sin reescribir migraciones
- Barrel + `drizzle.config` al index

### 4.3 Contratos por dominio
- Extraer orders / catalog / inventory / shipping; `index.ts` barrel + primitives

### 4.4 Rutas admin por dominio
- `register*Routes` por dominio; `admin/index.ts` orquestador

### 4.5 Máquinas de estado
- Formalizar guías y mensajes outbound; tests ilegales orders/conversations

### 4.6 Idempotencia crítica
- Confirm, outbound keys, guide claim, PDF — constraints + tests replay

### 4.7 Fuera de alcance (Fase 5+)
- Huecos de negocio, MFA, infra prod, integraciones reales

**Estado:** Completada (`pnpm verify` verde).

**Commit:** `refactor: modularize backend schema contracts routes and workers`
