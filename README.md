# Camila — Automatización de comercio por WhatsApp

Plataforma operativa para vender por WhatsApp con catálogo guiado por talla, reserva de inventario, cotización de envíos, selección de seguro, generación de guía y panel de administración.

Diseñada para un negocio de calzado con contraentrega en Colombia. Integra **WhatsApp Cloud API**, **99envíos** y un panel responsive para la operación diaria.

> Estado: producto en evolución. Treinta se integra por importación inicial y cierre manual. WhatsApp y 99envíos se conectan mediante adaptadores configurables.

## Tabla de contenidos

- [Qué resuelve](#qué-resuelve)
- [Arquitectura](#arquitectura)
- [Mapa del repositorio](#mapa-del-repositorio)
- [Conceptos de dominio](#conceptos-de-dominio)
- [Inicio rápido](#inicio-rápido)
- [URLs locales](#urls-locales)
- [Configuración](#configuración)
- [Verificación y pruebas](#verificación-y-pruebas)
- [Seguridad](#seguridad)
- [Documentación](#documentación)
- [Contribuir](#contribuir)

## Qué resuelve

| Capacidad | Descripción |
| --- | --- |
| Conversación WhatsApp | Guía al cliente: talla → referencias con foto → datos → envío → confirmación |
| Catálogo con stock real | Solo muestra referencias activas, con fotografía y disponibilidad para la talla confirmada |
| Inventario | Stock por `referencia + talla`, reservas y movimientos auditables |
| Envíos | Reglas globales o por municipio (código DANE), transportadora, fallback y seguro |
| Guías | Cotización, creación de guía, PDF y manejo de resultados inciertos |
| Panel admin | Auth, catálogo, pedidos, conversaciones, alertas, preferencias e integraciones |

Flujo de disponibilidad obligatorio:

`talla → confirmación → consulta → fotos`

No existe un listado general de catálogo sin talla confirmada. Cada tanda devuelve como máximo cuatro referencias, ordenadas por código.

## Arquitectura

```mermaid
flowchart LR
  WA[WhatsApp Cloud API] -->|webhook firmado| API["@camila/api Fastify"]
  Admin["@camila/admin Vite"] -->|/api/admin cookie| API
  API --> PG[(PostgreSQL)]
  API --> Media[(MEDIA_ROOT)]
  API -->|JWT login| N99[99envíos]
  API --> Contracts["@camila/contracts"]
  Admin --> Contracts
```

**API** (`apps/api`): Fastify 5, Drizzle ORM, módulos de dominio (`whatsapp`, `catalog`, `inventory`, `orders`, `shipping`, `conversations`, `localities`, `auth`, `alerts`, `dashboard`, `integrations`).

**Admin** (`apps/admin`): React + Vite, sesión por cookie HttpOnly (`credentials: include`), proxy a `/api/admin` en desarrollo.

### Directorio de municipios de 99envíos

El directorio usa códigos DANE internamente y muestra municipio y departamento en el panel. Para importar una copia descargada del documento de 99envíos, guarda el contenido fuente en UTF-8 y ejecuta:

```powershell
pnpm --filter @camila/api localities:import -- --input .\99envios-localidades.txt --format=99envios-document
```

Las filas inválidas de la fuente se excluyen; los destinos válidos se mantienen disponibles y los anteriores se conservan como históricos.

**Contracts** (`packages/contracts`): tipos y contratos compartidos entre API y panel.

Detalle: [docs/architecture.md](docs/architecture.md).

## Mapa del repositorio

```text
automatizacion_wh/
├── apps/
│   ├── api/                 # API Fastify + Drizzle + workers/CLI
│   └── admin/               # Panel React (Vite) + Playwright E2E
├── packages/
│   └── contracts/           # Contratos TypeScript compartidos
├── docs/                    # Documentación (índice Diátaxis)
├── compose.yaml             # PostgreSQL desarrollo y pruebas
├── .env.example             # Variables de entorno (sin secretos)
├── ROADMAP.md               # Plan de producto
└── README.md                # Este documento
```

## Conceptos de dominio

| Término | Definición |
| --- | --- |
| **Referencia** | Combinación concreta de modelo y color (p. ej. `01`). El código puede conservar ceros iniciales. |
| **Talla** | Entera o media (`36`, `37`, `37.5`). El stock se controla por `referencia + talla`. |
| **Disponible** | `physicalQuantity - reservedQuantity > 0` para la talla confirmada. |
| **Lista para publicar** | Referencia activa, con foto válida y al menos una talla disponible. |
| **Política de envío** | Regla general o excepción por código DANE: transportadora, fallback y modo de seguro. |
| **Guía incierta** | 99envíos no respondió tras enviar la solicitud. No se reintenta sola; la operadora verifica en 99envíos. |

## Inicio rápido

### Requisitos

- Node.js `24.14.1` (ver `.nvmrc`)
- pnpm `11.19.0` (ver `packageManager` en `package.json`)
- Docker con Compose

### 1. Clonar y configurar entorno

```bash
cp .env.example .env
# Edita .env solo en local. Nunca lo subas a Git.
```

### 2. Instalar dependencias

```bash
pnpm install
# o, para CI / verificación estricta:
pnpm install --frozen-lockfile
```

Chromium para E2E (una vez):

```bash
pnpm --filter @camila/admin exec playwright install chromium
```

### 3. Base de datos

```bash
docker compose up -d postgres
pnpm db:migrate
```

### 4. Usuario administrador

```bash
pnpm admin:create -- --username=tu_usuario
# o restablecer:
pnpm admin:reset-password -- --username=tu_usuario
```

Los comandos piden la contraseña de forma interactiva.

### 5. Arrancar API y panel

```bash
pnpm dev
```

Equivale a levantar `@camila/api` y `@camila/admin` en paralelo (tras compilar contracts).

Guía ampliada: [docs/getting-started.md](docs/getting-started.md).

## URLs locales

| Servicio | URL |
| --- | --- |
| API | http://127.0.0.1:3000 |
| Panel | http://127.0.0.1:5173 |
| PostgreSQL desarrollo | 127.0.0.1:5432 |
| PostgreSQL pruebas | 127.0.0.1:5433 |

Salud:

```bash
curl -s http://127.0.0.1:3000/health/live
curl -s http://127.0.0.1:3000/health/ready
```

`/health/live` no consulta PostgreSQL. `/health/ready` exige que la base responda.

## Configuración

Todas las variables están documentadas en [`.env.example`](.env.example).

| Área | Variables clave |
| --- | --- |
| App | `HOST`, `PORT`, `ADMIN_ORIGIN`, `MEDIA_ROOT`, `LOG_LEVEL` |
| Base de datos | `DATABASE_URL`, `TEST_DATABASE_URL` |
| WhatsApp | `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |
| 99envíos | `NINETYNINE_ENVIOS_EMAIL`, `NINETYNINE_ENVIOS_PASSWORD` (JWT vía `POST /api/integration/v1/login`); headers opcionales `NINETYNINE_ENVIOS_INTEGRATION_*` |

Sin credenciales completas de 99envíos, las rutas de envío responden `shipping_not_configured` y no llaman al proveedor.

Fotografías: JPEG/PNG hasta 5 MiB bajo `MEDIA_ROOT` (por defecto `./var/media`). PostgreSQL guarda metadatos y la clave interna.

## Verificación y pruebas

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration   # requiere postgres-test + TEST_DATABASE_URL
pnpm test:e2e           # Playwright; puertos por defecto 3100 / 5174
pnpm build
pnpm verify             # formato + lint + tipos + unit + integración + e2e + build
```

PostgreSQL de pruebas (tmpfs; se pierde al recrear el contenedor):

```bash
docker compose --profile test up -d postgres-test
export TEST_DATABASE_URL='postgresql://camila_test:camila_test@127.0.0.1:5433/camila_test'
pnpm test:integration
pnpm test:e2e
```

## Seguridad

- Nunca versionar `.env`, credenciales, datos reales ni `/var/`.
- Webhooks de WhatsApp: verificar firma antes de procesar eventos.
- Sesión admin: cookie HttpOnly; el panel usa `credentials: include`.
- Rotar tokens de Meta y App Secret antes de producción (ver [piloto](docs/how-to/pilot-and-deploy.md)).
- `entregables/` y `proposal_work/` están en `.gitignore` y no forman parte del producto.

## Documentación

Índice completo (Diátaxis): **[docs/README.md](docs/README.md)**

| Tipo | Documento |
| --- | --- |
| Tutorial | [Inicio local](docs/getting-started.md) |
| How-to | [Piloto y despliegue](docs/how-to/pilot-and-deploy.md) |
| Explanation | [Arquitectura](docs/architecture.md) |
| Reference | [Integraciones 99envíos](docs/integrations/99envios-validation-2026-09-07.md) |
| Producto | [ROADMAP.md](ROADMAP.md) |

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md). Resumen:

1. Rama desde `main`.
2. Cambios pequeños y verificables.
3. `pnpm verify` (o el subconjunto relevante) antes del PR.
4. Sin secretos en el diff.

---

**Nombre interno del monorepo:** `camila` (`@camila/api`, `@camila/admin`, `@camila/contracts`).
