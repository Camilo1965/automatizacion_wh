# Guía de contribución

Gracias por contribuir a Camila. Este documento fija expectativas mínimas de calidad para un entorno de equipo.

## Flujo

1. Crea una rama desde `main` (`feat/…`, `fix/…`, `docs/…`).
2. Mantén el diff enfocado en un objetivo.
3. Ejecuta las comprobaciones relevantes (idealmente `pnpm verify`).
4. Abre un PR con resumen del problema, enfoque y cómo probarlo.
5. No incluyas secretos, `.env`, medias reales ni dumps de base de datos.

## Estándares

- TypeScript estricto; contratos compartidos viven en `@camila/contracts`.
- Formato: Prettier. Lint: ESLint (config raíz).
- Pruebas: unitarias cerca del dominio; integración con `postgres-test`; E2E Playwright para el panel.
- Commits claros; un PR = una historia revisable.

## Documentación

- Actualiza el README o `docs/` si cambias el comportamiento visible para operadores o onboarding.
- Sigue el índice Diátaxis en [docs/README.md](docs/README.md).
- No inventes capacidades en la docs: verifica contra el código.

## Seguridad

- Nunca pegues tokens en issues, PRs o chats.
- Webhooks y cookies: respeta los controles existentes; no los desactives “para probar” en ramas compartidas.
