# Diseño de fase 3: pedidos y reservas

## Objetivo

Permitir que la propietaria complete y pruebe una venta contra entrega desde el panel, desde la selección de una variante hasta confirmación, reserva, cancelación, despacho, entrega o devolución, sin WhatsApp ni 99envíos y sin permitir sobreventa.

## Decisiones de alcance

- Un pedido contiene exactamente una referencia, una talla y una cantidad entre 1 y 10.
- El pedido comienza como `draft`; un borrador no reserva stock.
- La propietaria es la única usuaria del panel y todas las rutas de pedidos requieren su sesión.
- El cliente paga contra entrega. En esta fase el total contiene solamente producto; `shippingCostCop` es `null` y `shippingPending` es `true`.
- La localidad se elige por el código vigente importado. El pedido conserva código, departamento y nombre como snapshot para que una futura actualización del catálogo no cambie pedidos históricos.
- No se conecta WhatsApp, Chatwoot, Treinta ni 99envíos.
- No se modela carrito, varias variantes, abonos, descuentos, impuestos ni pagos en línea.

## Enfoques considerados

### Recomendado: agregado de pedido con snapshot y auditorías separadas

`sales_orders` conserva el estado actual de un pedido de una variante. `order_summaries` conserva resúmenes inmutables; `order_confirmations` resuelve idempotencia; `order_status_events` registra transiciones; `reservation_movements` registra cambios de reservado. `inventory_movements` continúa siendo la auditoría de cantidad física.

Ventajas: transacciones claras, historial verificable y adaptación directa al flujo futuro de WhatsApp. Evita generalizar hacia un carrito que el negocio no necesita.

### Alternativa descartada: pedido y eventos como JSON

Reduciría tablas, pero debilitaría constraints, búsquedas y concurrencia. Consultar stock reservado y auditar transiciones dependería de interpretar documentos.

### Alternativa descartada: carrito con `order_items`

Permitiría varias variantes, pero contradice la regla acordada de una variante por pedido y aumenta estados, totales y bloqueos sin aportar valor al piloto.

## Modelo de datos

### `sales_orders`

- `id uuid` PK.
- `order_number bigint generated always as identity`, único, mostrado como `PED-000001`.
- `status varchar(16)`: `draft`, `confirmed`, `cancelled`, `dispatched`, `delivered`, `returned`.
- `reference_id uuid` FK restrict a `catalog_references`.
- `size numeric(4,1)` con las mismas reglas de talla del catálogo.
- `quantity integer` entre 1 y 10.
- `customer_name varchar(120)`.
- `customer_phone varchar(13)` en formato `+57` y diez dígitos nacionales.
- `address varchar(180)`.
- `locality_carrier_code varchar(32)`.
- `locality_department varchar(100)` y `locality_name varchar(120)` como snapshot.
- `delivery_notes varchar(250)`, nullable.
- `draft_version integer`, inicia en 1 y aumenta con cada cambio efectivo del borrador.
- `latest_summary_version integer`, inicia en 0.
- `confirmed_summary_version integer`, nullable.
- `confirmed_unit_price_cop`, `confirmed_subtotal_cop`, nullable hasta confirmar.
- timestamps `created_at`, `updated_at`, `confirmed_at`, `cancelled_at`, `dispatched_at`, `delivered_at`, `returned_at`.

Los campos de cliente y destino pueden ser nulos mientras el pedido sea borrador. `POST /orders` exige la variante y acepta los datos del cliente disponibles; `PATCH` permite completarlos campo a campo. La aplicación exige todos antes de generar un resumen. Los constraints enlazan `confirmed_at` con los importes confirmados; los estados `confirmed`, `dispatched`, `delivered` y `returned` lo exigen. Un pedido `cancelled` puede conservarlo si se canceló después de confirmar o mantenerlo nulo si se canceló como borrador.

### `order_summaries`

- PK compuesta `(order_id, version)`.
- `draft_version` que originó el resumen.
- `snapshot jsonb` validado en el dominio, con versión de esquema `1`.
- `created_at`.

El snapshot contiene número del pedido, referencia, modelo, color, talla, cantidad, precio unitario, subtotal, costo de envío nulo, total provisional, nombre, teléfono, dirección y localidad. Nunca se modifica.

### `order_confirmations`

- `id uuid` PK.
- `idempotency_key varchar(128)` único.
- `order_id uuid` único y FK restrict.
- `summary_version integer`.
- `created_at`.

La misma clave siempre devuelve la confirmación ya creada. Una clave usada para otro pedido produce conflicto.

### `reservation_movements`

- `id uuid` PK.
- `order_id`, `reference_id`, `size`.
- cantidades reservadas anterior y nueva, delta y motivo.
- motivos: `order_confirmed`, `order_cancelled`, `order_dispatched`.
- `created_at` con `clock_timestamp()`.

### `order_status_events`

- `id uuid` PK.
- `order_id`, estado anterior nullable, estado nuevo, motivo nullable, `created_by_admin_id`, `created_at`.
- Se registra creación y cada transición exitosa.

La migración amplía los motivos permitidos de `inventory_movements` con `order_dispatched` y `order_returned`.

## Estados y transiciones

| Estado actual | Acción    | Estado final | Efecto en stock                                |
| ------------- | --------- | ------------ | ---------------------------------------------- |
| inexistente   | crear     | `draft`      | ninguno                                        |
| `draft`       | editar    | `draft`      | aumenta `draftVersion` si cambió algo          |
| `draft`       | resumir   | `draft`      | snapshot inmutable; no reserva                 |
| `draft`       | confirmar | `confirmed`  | `reserved += quantity`                         |
| `draft`       | cancelar  | `cancelled`  | ninguno                                        |
| `confirmed`   | cancelar  | `cancelled`  | `reserved -= quantity`                         |
| `confirmed`   | despachar | `dispatched` | `physical -= quantity`, `reserved -= quantity` |
| `dispatched`  | entregar  | `delivered`  | ninguno                                        |
| `dispatched`  | devolver  | `returned`   | `physical += quantity`                         |
| `delivered`   | devolver  | `returned`   | `physical += quantity`                         |

Los estados terminales `cancelled` y `returned` no aceptan nuevas transiciones. En esta fase no puede existir guía, por lo que una cancelación confirmada se permite; la fase de envíos añadirá la guarda de guía.

## Versiones y precio

Generar resumen bloquea el pedido, valida que esté en borrador y que sus datos estén completos, consulta la referencia y localidad actuales, incrementa `latestSummaryVersion` y guarda el snapshot. Confirmar recibe `summaryVersion` y exige que sea el último resumen, que su `draftVersion` coincida con el borrador y que el precio actual de la referencia coincida con el precio del snapshot.

Si cambió el pedido o el precio, responde `409 summary_stale`. El panel vuelve a generar el resumen y requiere otra confirmación humana. La confirmación guarda el precio y subtotal aceptados en `sales_orders`; cambios posteriores del catálogo no alteran el pedido.

## Transacción de confirmación

1. Buscar la clave idempotente. Si existe para el mismo pedido, devolver el pedido confirmado.
2. Bloquear `sales_orders FOR UPDATE`.
3. Validar estado `draft`, resumen solicitado y versión.
4. Releer referencia y precio; exigir referencia activa.
5. Bloquear `catalog_stock` de referencia+talla `FOR UPDATE`.
6. Exigir `physical_quantity - reserved_quantity >= quantity`.
7. Incrementar reservado con una actualización condicional.
8. Insertar `reservation_movements`, `order_confirmations` y evento de estado.
9. Actualizar pedido a `confirmed` y guardar importes/timestamp.
10. Confirmar toda la transacción.

Dos compradores del último par se serializan sobre la misma fila de stock. Solo uno puede satisfacer disponibilidad.

## API administrativa

- `POST /api/admin/orders`: crea borrador completo.
- `GET /api/admin/orders`: lista paginada por número, estado, teléfono o referencia.
- `GET /api/admin/orders/:orderId`: detalle, resumen confirmado, movimientos y eventos.
- `PATCH /api/admin/orders/:orderId`: edita únicamente un borrador.
- `POST /api/admin/orders/:orderId/summaries`: crea y devuelve resumen versionado.
- `POST /api/admin/orders/:orderId/confirm`: recibe `summaryVersion` e `idempotencyKey`.
- `POST /api/admin/orders/:orderId/cancel`: recibe motivo obligatorio.
- `POST /api/admin/orders/:orderId/dispatch`: despacha manualmente.
- `POST /api/admin/orders/:orderId/deliver`: registra entrega manual.
- `POST /api/admin/orders/:orderId/return`: recibe motivo obligatorio.

Todas las mutaciones conservan la comprobación exacta de `Origin`. Los errores siguen `{ error: { code, message, field? } }` y usan `400` para entrada inválida, `404` para recursos inexistentes y `409` para conflicto de estado, resumen, idempotencia o stock.

## Panel

La navegación añade **Pedidos** y **Nuevo pedido**. El formulario selecciona referencia activa, talla disponible, cantidad, cliente y localidad. La pantalla de resumen presenta exactamente los datos versionados y un botón de confirmación. El detalle muestra estado, importes, destino, reserva, eventos y acciones permitidas.

Los botones destructivos usan `ConfirmDialog`. El panel deshabilita acciones mientras se envían, muestra conflictos recuperables y refresca pedido, lista y stock al terminar.

## Seguridad y privacidad

- Sesión de propietaria obligatoria.
- Nombre, teléfono y dirección nunca aparecen en logs estructurados ni mensajes de error.
- Las respuestas solo contienen los campos necesarios del pedido.
- No se guardan conversaciones ni credenciales externas.
- Las pruebas usan personas, teléfonos y direcciones ficticias.

## Criterios de aceptación

- Un borrador no cambia stock físico ni reservado.
- Un resumen viejo no puede confirmar.
- Una confirmación repetida con la misma clave devuelve el mismo pedido y una sola reserva.
- Dos confirmaciones simultáneas por el último par producen un confirmado y un conflicto de stock.
- Cancelar un confirmado libera exactamente su reserva una vez.
- Despachar descuenta físico y reserva una vez.
- Devolver repone físico una vez.
- Cambiar precio obliga a generar y aceptar un resumen nuevo.
- El panel completa el recorrido crear → resumir → confirmar → despachar → entregar y el recorrido confirmar → cancelar.
- `pnpm verify` queda verde y PostgreSQL de pruebas permanece efímero.
