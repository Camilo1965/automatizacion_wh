# Worksheet de conciliación de datos

**Estado Task 13 (2026-09-22):** herramienta/plantilla `verified` (automatable). **Import real + firmas = `[HUMANO]` / BLOCKING.** Ningún dominio conciliado en closeout automático.

| Dominio                  | Fuente            | Import tool       | Filas esperadas | Filas cargadas | Diferencias | Aprobado `[HUMANO]` |
| ------------------------ | ----------------- | ----------------- | --------------- | -------------- | ----------- | ------------------- |
| Referencias / precios    | Treinta / CSV     | Catalog import    | —               | —              | —           | **BLOCKING**        |
| Stock por talla          | Inventario físico | Panel stock       | —               | —              | —           | **BLOCKING**        |
| Localidades              | 99envíos / CSV    | Locality catalog  | —               | —              | —           | **BLOCKING**        |
| Reglas envío municipales | Operación         | Shipping settings | —               | —              | —           | **BLOCKING**        |
| Credenciales             | Password manager  | Integraciones     | N/A             | configured?    | —           | **BLOCKING**        |

## Automatizable

- Preview/commit de import en panel + tests de import (sin datos prod)
- Esta worksheet como contrato de evidencia

## `[HUMANO]` — acciones exactas

1. Exportar fuentes reales (CSV Treinta / inventario / localidades).
2. En staging (preferido) o prod controlado: **preview** → revisar counts/hashes → **commit**.
3. Rellenar filas esperadas vs cargadas; documentar diferencias (faltantes, duplicados, hash mismatch).
4. Owner firma columna **Aprobado** (nombre + fecha) por dominio.
5. Credenciales: confirmar “configured” solo tras secret channel → panel; marcar N/A en counts.

Notas / hashes (sanitizados):

```
(pending [HUMANO])
```

**Sin firmas owner = NO-GO piloto.**
