# Camila

Base técnica local para la automatización de ventas de calzado por WhatsApp.

WhatsApp, Chatwoot y 99envíos todavía no están conectados. No existe interfaz administrativa de catálogo todavía.

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

## Catálogo interno

Una **referencia** es una combinación concreta de modelo y color (por ejemplo `01`). El código visible puede conservar ceros iniciales.

El stock se controla por `referencia + talla`. Se admiten tallas enteras y medias (`36`, `37`, `37.5`).

Flujo obligatorio para disponibilidad:

`talla → confirmación de talla → consulta de disponibilidad → fotos`

No existe una consulta de catálogo general sin talla confirmada. Solo se listan referencias activas, con fotografía válida y `physicalQuantity - reservedQuantity > 0` para esa talla. Cada tanda devuelve máximo cuatro referencias, ordenadas por código.

Las fotografías se guardan como archivos bajo `MEDIA_ROOT` (predeterminado `./var/media`). PostgreSQL guarda únicamente metadatos y la clave interna. Se aceptan JPEG/PNG de hasta 5 MiB.

Ejemplo ficticio: la referencia `01` puede tener stock en tallas `36`, `37` y `37.5` a la vez; una consulta confirmada de `37` no debe devolver existencias de otras tallas.

## Migraciones

Generar SQL desde el esquema Drizzle:

```powershell
pnpm db:generate -- --name=catalog_core
```

Aplicar migraciones con `DATABASE_URL`:

```powershell
pnpm db:migrate
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

Ejecutar desde PowerShell:

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
- No se versionan `node_modules`, artefactos de compilación, cobertura, `/var/` ni secretos.
