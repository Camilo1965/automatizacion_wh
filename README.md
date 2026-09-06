# Camila

Base técnica local para la automatización de ventas de calzado por WhatsApp.

WhatsApp, Chatwoot y 99envíos todavía no están conectados. Esta base solo incluye API, panel mínimo y PostgreSQL local.

## Requisitos

- Node.js `24.14.1` (ver `.nvmrc`)
- pnpm `11.19.0`
- Docker Desktop con Docker Compose

## Configuración inicial

Copia el archivo de ejemplo a `.env` en PowerShell:

```powershell
Copy-Item .env.example .env
```

`.env` contiene solo valores locales de desarrollo. Nunca versiones `.env`, datos reales ni credenciales.

## Instalación

```powershell
pnpm install
```

Para verificar el lockfile:

```powershell
pnpm install --frozen-lockfile
```

## PostgreSQL de desarrollo

```powershell
docker compose up -d postgres
```

Detener:

```powershell
docker compose stop postgres
```

## Iniciar API y panel

Con `.env` presente y PostgreSQL de desarrollo en marcha:

```powershell
pnpm --filter @camila/api dev
pnpm --filter @camila/admin dev
```

O ambos en paralelo:

```powershell
pnpm dev
```

### URLs locales

| Servicio              | URL                   |
| --------------------- | --------------------- |
| API                   | http://127.0.0.1:3000 |
| Panel                 | http://127.0.0.1:5173 |
| PostgreSQL desarrollo | 127.0.0.1:5432        |
| PostgreSQL pruebas    | 127.0.0.1:5433        |

## Validaciones

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm verify
```

`pnpm verify` ejecuta formato, lint, tipos, pruebas unitarias y build. No incluye la integración con PostgreSQL.

## Pruebas de integración

`postgres-test` almacena sus datos en memoria temporal y los pierde al eliminar o recrear el contenedor.

Iniciar PostgreSQL de pruebas:

```powershell
docker compose --profile test up -d postgres-test
```

Ejecutar:

```powershell
$env:TEST_DATABASE_URL='postgresql://camila_test:camila_test@127.0.0.1:5433/camila_test'
pnpm test:integration
```

Si `TEST_DATABASE_URL` no está definida, el comando falla con una explicación clara.

Detener PostgreSQL de pruebas:

```powershell
docker compose --profile test stop postgres-test
```

## Comprobar salud de la API

Con la API en ejecución:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health/live
Invoke-RestMethod http://127.0.0.1:3000/health/ready
```

`/health/live` no consulta PostgreSQL. `/health/ready` exige que la base responda.

## Notas

- `entregables/` y `proposal_work/` no forman parte del producto y están en `.gitignore`.
- No se versionan `node_modules`, artefactos de compilación, cobertura ni secretos.
