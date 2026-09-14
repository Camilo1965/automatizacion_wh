# Cierre técnico de la fase 2

> Documento histórico (2026-09-06). La guía vigente está en el [índice de docs](../README.md).

Fecha de verificación: 6 de septiembre de 2026.

## Alcance terminado

1. Catálogo y stock por referencia y talla, con enteros y medias tallas, movimientos auditables y consulta pública limitada a referencias activas con foto y disponibilidad.
2. Importación CSV en dos pasos: vista previa persistida y confirmación explícita. La confirmación crea referencias inactivas, stock y movimientos en una transacción.
3. Administración protegida para una sola propietaria: plantilla descargable, tabla de errores, diálogo de confirmación y contador de preparación del catálogo.
4. Localidades colombianas: validación, reemplazo transaccional, idempotencia por SHA-256, búsqueda sin depender de acentos y paginación por código del transportador.
5. Cobertura unitaria, integración con PostgreSQL y recorrido E2E en Chromium.

## Reglas de aceptación implementadas

- El CSV usa UTF-8, máximo 2 MiB y 500 filas de datos.
- El código de referencia conserva ceros iniciales.
- Una referencia puede incluir varias tallas, pero no repetir la misma talla.
- Modelo, color y precio deben ser consistentes en todas las filas de una referencia.
- La vista previa informa códigos que ya existen antes de permitir confirmar.
- Una vista previa inválida no puede confirmarse.
- Confirmar dos veces el mismo identificador no duplica catálogo ni movimientos.
- Las nuevas referencias quedan inactivas para exigir fotografía y revisión.
- El indicador `ready` exige referencia activa, fotografía y al menos una talla disponible.
- La importación de localidades rechaza fuentes vacías, códigos duplicados, países distintos de `CO` y datos fuera de longitud.
- Reimportar la misma fuente de localidades no reescribe la tabla.

## Datos que faltan para el piloto real

La aplicación está lista para recibirlos, pero el repositorio no incluye datos comerciales inventados. La propietaria debe entregar:

- 10 referencias reales con modelo, color, precio y stock por talla;
- una fotografía JPEG o PNG por referencia;
- el CSV autorizado y vigente de localidades de 99envíos.

Después de importar, la propietaria debe cargar las fotos, revisar el contador de preparación y activar cada referencia. La aceptación operativa de la fase se registra cuando las 10 aparezcan como listas y una consulta de talla 37 devuelva solo las que tengan unidades disponibles.

## Evidencia automatizada

La puerta de cierre es `pnpm verify`. Incluye formato, lint, tipos, contratos, unitarias, integración PostgreSQL, E2E Chromium y build. También se ejecuta `pnpm audit --prod` y `git diff --check` antes del commit de cierre.
