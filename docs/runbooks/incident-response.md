# Runbook — respuesta a incidentes

## Severidad

| Nivel | Ejemplo                                        | Acción                              |
| ----- | ---------------------------------------------- | ----------------------------------- |
| P0    | Sin login / sin webhook / guías masivas failed | Página, rollback, aviso propietaria |
| P1    | PDF fallando, uncertain acumulado              | Contener, runbook 99envíos/Meta     |
| P2    | UI menor                                       | Ticket, siguiente release           |

## Pasos

1. Clasificar severidad.
2. Congelar cambios no relacionados.
3. Recoger `/health/ready`, logs api/worker, IDs pedido (sin PII).
4. Aplicar runbook de dominio (postgres, Meta, 99envíos, storage).
5. Registrar en evidence-log / incident log local.
6. Comunicar a propietaria estado y ETA.
