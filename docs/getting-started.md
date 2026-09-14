# Tutorial: inicio local

Objetivo: dejar API + panel + PostgreSQL corriendo en tu máquina y entrar al panel con un usuario admin.

Tiempo estimado: 15–30 minutos (sin datos comerciales reales).

## Antes de empezar

Necesitas:

- Node.js 24.14.1
- pnpm 11.19.0
- Docker Compose

En Windows puedes usar PowerShell; los comandos de abajo son bash/zsh y equivalentes en PowerShell salvo donde se indique.

## Pasos

### 1. Variables de entorno

```bash
cp .env.example .env
```

No pegues secretos en chats ni en commits. Para un smoke test local sin WhatsApp/99envíos reales, basta con la sección de PostgreSQL del ejemplo.

### 2. Dependencias

```bash
pnpm install
```

### 3. PostgreSQL de desarrollo

```bash
docker compose up -d postgres
pnpm db:migrate
```

### 4. Crear admin

```bash
pnpm admin:create -- --username=operadora
```

Introduce la contraseña cuando el CLI la pida.

### 5. Arrancar

```bash
pnpm dev
```

Abre http://127.0.0.1:5173 e inicia sesión.

### 6. Comprobar API

```bash
curl -s http://127.0.0.1:3000/health/ready
```

## Siguiente

1. Importar catálogo (CSV) desde el panel y cargar fotos.
2. Importar localidades si vas a confirmar pedidos reales de envío.
3. Seguir [Piloto y despliegue](./how-to/pilot-and-deploy.md) para WhatsApp + 99envíos.

## Problemas frecuentes

| Síntoma | Qué revisar |
| --- | --- |
| `ready` falla | Contenedor `postgres`, `DATABASE_URL`, migraciones |
| Panel no autentica | `ADMIN_ORIGIN`, cookies, API en el puerto 3000 |
| E2E falla | `postgres-test`, `TEST_DATABASE_URL`, puertos 3100/5174 libres |
| Envío responde `shipping_not_configured` | Credenciales 99envíos en `.env` |
