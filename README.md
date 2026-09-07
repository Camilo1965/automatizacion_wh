# Camila

Base técnica local para la automatización de ventas de calzado por WhatsApp.

WhatsApp, Chatwoot y 99envíos todavía no están conectados. El panel React de operaciones ya cubre autenticación, catálogo e inventario básicos.

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

Navegadores de Playwright (una vez, desde el monorepo):

```powershell
pnpm --filter @camila/admin exec playwright install chromium
```

## Panel de administración

El panel vive en `apps/admin` y habla con la API bajo `/api/admin` (Vite proxy en desarrollo).

### Crear o restablecer usuario admin

Con PostgreSQL de desarrollo en marcha y migraciones aplicadas:

```powershell
pnpm admin:create -- --username=tu_usuario
pnpm admin:reset-password -- --username=tu_usuario
```

Los comandos piden la contraseña de forma interactiva. No se documentan contraseñas reales aquí.

### Flujos del panel

- Inicio de sesión con cookie HttpOnly (`credentials: include`)
- Catálogo con búsqueda, filtro de estado y paginación «Ver más»
- Alta de referencia (el código puede conservar ceros iniciales, p. ej. `01`)
- Detalle: editar modelo/color/precio, activar/desactivar con confirmación
- Foto JPEG/PNG hasta 5 MiB
- Ajuste de stock por talla con nota e historial de movimientos
- Importación CSV con vista previa, errores por fila y confirmación explícita
- Indicador de referencias listas para publicar: activa, con foto y stock disponible

### URLs locales

| Servicio              | URL                   |
| --------------------- | --------------------- |
| API                   | http://127.0.0.1:3000 |
| Panel                 | http://127.0.0.1:5173 |
| PostgreSQL desarrollo | 127.0.0.1:5432        |
| PostgreSQL pruebas    | 127.0.0.1:5433        |

## Catálogo interno

Una **referencia** es una combinación concreta de modelo y color (por ejemplo `01`). El código visible puede conservar ceros iniciales.

El stock se controla por `referencia + talla`. Se admiten tallas enteras y medias (`36`, `37`, `37.5`).

Flujo obligatorio para disponibilidad:

`talla → confirmación de talla → consulta de disponibilidad → fotos`

No existe una consulta de catálogo general sin talla confirmada. Solo se listan referencias activas, con fotografía válida y `physicalQuantity - reservedQuantity > 0` para esa talla. Cada tanda devuelve máximo cuatro referencias, ordenadas por código.

Las fotografías se guardan como archivos bajo `MEDIA_ROOT` (predeterminado `./var/media`). PostgreSQL guarda únicamente metadatos y la clave interna. Se aceptan JPEG/PNG de hasta 5 MiB.

Ejemplo ficticio: la referencia `01` puede tener stock en tallas `36`, `37` y `37.5` a la vez; una consulta confirmada de `37` no debe devolver existencias de otras tallas.

### Importar referencias y stock inicial

En el panel abre **Importar catálogo**, descarga la plantilla y conserva exactamente este encabezado:

```csv
reference_code,model_name,color,price_cop,size,physical_quantity
```

Cada fila representa una talla de una referencia. Repite código, modelo, color y precio para agregar otras tallas. Los códigos conservan ceros iniciales y las tallas admiten medios puntos. El archivo debe estar en UTF-8, pesar máximo 2 MiB y contener máximo 500 filas de datos.

La vista previa no modifica el catálogo. Muestra errores de estructura, datos inconsistentes, talla repetida y códigos que ya existen. Solo una vista previa sin errores permite confirmar. La confirmación crea referencias **inactivas**, registra el stock inicial y crea un movimiento de inventario por talla dentro de una sola transacción. Después se carga y revisa una foto por referencia y se activa únicamente cuando esté lista.

### Importar localidades de envío

El sistema recibe una copia CSV autorizada del catálogo de localidades, sin ejecutar código PHP ni contenido del documento de origen. El encabezado obligatorio es:

```csv
carrier_code,department,locality,country
```

Solo admite `CO`, preserva `carrier_code` como texto y rechaza códigos repetidos o longitudes inválidas. Con PostgreSQL de desarrollo iniciado y migrado:

```powershell
pnpm --filter @camila/api localities:import -- --input C:\ruta\localidades.csv
```

La carga reemplaza todas las localidades dentro de una transacción. Si el SHA-256 del archivo coincide con la fuente ya cargada, no vuelve a escribir datos. Un archivo inválido o sin localidades conserva los datos anteriores.

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

## Validaciones

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm verify
```

`pnpm verify` ejecuta formato, lint, tipos, unitarias, integración, E2E y build. Integración y E2E requieren `postgres-test` y `TEST_DATABASE_URL`.

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

## Pruebas E2E del panel

Las E2E usan Playwright (Chromium), `postgres-test`, migraciones, un usuario de prueba creado por `AuthService` vía CLI de seed, `MEDIA_ROOT` temporal, API y Vite.

Puertos por defecto (evitan chocar con `pnpm dev` en 3000/5173; `pnpm verify` puede correr con esos ocupados):

| Servicio E2E | Puerto | Override                |
| ------------ | ------ | ----------------------- |
| API          | 3100   | `CAMILA_E2E_API_PORT`   |
| Panel Vite   | 5174   | `CAMILA_E2E_ADMIN_PORT` |

```powershell
docker compose --profile test up -d postgres-test
$env:TEST_DATABASE_URL='postgresql://camila_test:camila_test@127.0.0.1:5433/camila_test'
pnpm test:e2e
```

`apps/admin/playwright.config.ts` arranca API + Vite (`webServer`) tras `globalSetup`. Credenciales E2E viven en `apps/admin/e2e/constants.ts`; no uses esas credenciales fuera de pruebas locales.

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
