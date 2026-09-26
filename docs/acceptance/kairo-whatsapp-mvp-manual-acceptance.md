# KAIRO WhatsApp MVP: guion manual y matriz de aceptación

**Estado de esta evidencia:** guion reproducible y expectativas documentadas; ejecución manual aún pendiente. Esta matriz no equivale a una aprobación del operador ni a una prueba real con Meta o 99envíos.

## Alcance y seguridad

El objetivo es validar el recorrido conversacional, la persistencia, la reserva de inventario y la creación/descarga de guía en un entorno desechable. Los proveedores externos deben ser dobles de prueba; no usar el token de Meta, el número real de WhatsApp, las credenciales productivas ni una cuenta real de 99envíos. No ejecutar scripts que limpien tablas contra una base de negocio.

En la revisión del 2026-09-25, `TEST_DATABASE_URL` no está configurada, no existe `.env` en este checkout y no hay listeners en `35174`, `5173` o `5174`. Por eso no se ejecutaron pruebas de integración o E2E ni se tomaron capturas. No se arrancaron servicios. Los resultados automatizados que sí pueden reproducirse se anotan por separado en el reporte de la tarea.

## Preparación cuando exista un entorno de pruebas

1. Crear una base PostgreSQL desechable separada de cualquier base operativa. Configurar `TEST_DATABASE_URL` solo en el entorno de prueba. Antes de lanzar pruebas, confirmar con el responsable que esa URL apunta a una instancia descartable y sin datos de clientes; no basta con que el nombre contenga `test`.
2. Aplicar las migraciones y fixtures exclusivamente sobre esa base. Preparar catálogo con una referencia disponible y otra inválida, talla con stock y talla agotada, localidades con cobertura, reglas de transportadora obligatoria y alternativa, cotización controlable y cliente recurrente sintético.
3. Inyectar proveedores falsos para cotización, creación de guía, descarga de PDF, WhatsApp y alertas. Para fallos, controlar el doble desde el test; no provocar fallos en servicios reales.
4. Crear una conversación nueva por caso con teléfono ficticio único y guardar su `conversationId` y los `orderId` asociados. Capturar inventario inicial para comparar deltas. Repetir un caso con los mismos identificadores de webhook solo donde la matriz lo solicita.
5. Ejecutar cada caso aisladamente y registrar resultado, fecha UTC, commit, IDs sintéticos y captura/transcripción sin PII. No compartir tokens, teléfonos reales ni PDFs de clientes.

### Comandos de integración permitidos

Solo después de verificar que la URL configurada es desechable y que corresponde a este entorno:

```powershell
pnpm --filter @camila/api exec vitest run --project integration test/whatsapp-sales-flow.integration.test.ts
```

No ejecutar `pnpm test:integration`, `pnpm test:concurrency`, `db:migrate` ni helpers de limpieza antes de esa verificación: algunos tests de integración limpian tablas para aislar sus fixtures. Si no hay URL de prueba verificada, omitirlos y documentar la limitación.

## Cómo verificar los datos persistidos

Después de cada caso, contrastar el estado de la conversación y pedido en KAIRO con consultas de solo lectura sobre el fixture sintético. Sustituir `:conversation_id` por el UUID generado para ese caso; estas consultas no deben modificarse para escribir datos.

```sql
-- Conversación y pedido activo/histórico asociado al caso
SELECT c.id AS conversation_id, c.state, c.mode, c.active_order_id,
       c.active_summary_version, o.id AS order_id, o.order_number,
       (o.id = c.active_order_id) AS is_active_order,
       o.status AS order_status, o.customer_id, o.confirmed_summary_version
FROM whatsapp_conversations c
LEFT JOIN LATERAL (
  SELECT c.active_order_id AS order_id WHERE c.active_order_id IS NOT NULL
  UNION
  SELECT l.order_id FROM conversation_order_links l
  WHERE l.origin_conversation_id = c.id
) case_orders ON TRUE
LEFT JOIN sales_orders o ON o.id = case_orders.order_id
WHERE c.id = :conversation_id
ORDER BY o.created_at;

-- Reserva: comprobar el delta para reference_id + talla del pedido del caso
SELECT s.reference_id, s.size, s.physical_quantity, s.reserved_quantity
FROM catalog_stock s
WHERE s.reference_id = :reference_id AND s.size = :size;

-- Trabajo de guía: los recorridos no confirmados/error deben devolver cero filas
SELECT id, order_id, status, carrier, pre_shipment_number,
       error_code, guide_pdf_storage_key, guide_pdf_byte_size
FROM shipping_guide_jobs
WHERE order_id = :order_id;

-- Cola saliente; contar por conversación y revisar idempotency_key, type y status
SELECT id, idempotency_key, message_type, source, status, attempt_count,
       error_code, created_at
FROM whatsapp_outbound_messages
WHERE conversation_id = :conversation_id
ORDER BY created_at, id;

-- Alertas operativas asociadas; no incluir detail con PII en evidencias públicas
SELECT type, severity, status, deduplication_key, created_at
FROM owner_alerts
WHERE entity_url LIKE '%' || :order_id || '%'
ORDER BY created_at;
```

El vínculo histórico `conversation_order_links` conserva pedidos cancelados y confirmados; `active_order_id` representa el pedido activo actual. En casos con más de un pedido, inspeccionar todos los pedidos enlazados y no inferir el pedido activo solo por el último `order_number`. Comparar la reserva antes/después del caso: cancelar/cambiar producto debe liberarla; solo confirmar debe incrementarla; despachar reduce inventario físico según el flujo de operaciones.

## Matriz de 15 recorridos

Los estados listados son **resultados esperados para comprobar**, no resultados ya observados. Un caso solo queda “aprobado” después de registrar evidencia real del entorno aislado.

| #   | Recorrido y pasos reproducibles                                                                                                                                        | Conversación / pedido esperado                                                                                                                                                                                                                                      | Inventario y trabajos de guía                                                                                              | Mensajes/alertas e invariantes                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Compra normal.** Iniciar conversación sintética; elegir talla, referencia disponible, completar datos/destino y cotizar; revisar resumen; confirmar una sola vez.    | Llega a `awaiting_confirmation` con resumen vigente; al confirmar, el pedido activo pasa `draft` → `confirmed`. El mensaje dice “Pedido <ID> confirmado; reservamos tu producto” y avisa que notificará cuando exista la guía; no afirma pago, despacho ni entrega. | Antes de confirmar: reserva sin delta y 0 trabajos. Después: reserva +1 y exactamente 1 trabajo `pending` de guía.         | Una confirmación; no duplicar por reintento. Sin crear guía externa hasta que el worker de prueba procese el trabajo.                                                                       |
| 2   | **Cancelar antes de confirmar.** Llegar al resumen y escribir `cancelar`.                                                                                              | Conversación limpia el pedido activo (y la versión de resumen) y vuelve al punto inicial de compra; el pedido histórico queda `cancelled`.                                                                                                                          | Reserva sin delta/liberada a 0; 0 trabajos de guía.                                                                        | Una respuesta de cancelación con ID de pedido; no mensaje de éxito de compra.                                                                                                               |
| 3   | **Cambiar dirección.** Llegar al resumen, pedir `cambiar dirección`, enviar otra dirección válida y completar recotización/resumen.                                    | Pedido conserva identidad y sigue `draft`; paso de captura de dirección y luego `awaiting_confirmation` con versión nueva. La confirmación anterior deja de ser válida.                                                                                             | Reserva sin delta; 0 trabajos de guía.                                                                                     | Cotización corresponde al nuevo destino; no se encola confirmación hasta confirmar resumen vigente.                                                                                         |
| 4   | **Cambiar municipio.** Desde resumen cambiar municipio por uno cubierto distinto y revisar nueva cotización/resumen.                                                   | Pedido sigue `draft`; nuevo municipio y nuevo resumen vigente; la versión anterior no permite confirmar.                                                                                                                                                            | Reserva sin delta; 0 trabajos.                                                                                             | Si no existe cobertura, mostrar alternativa/ayuda y no representar el pedido como listo.                                                                                                    |
| 5   | **Cambiar producto.** Desde resumen escribir `cambiar producto`, seleccionar talla/referencia nueva y revisar.                                                         | Pedido anterior `cancelled`, preservado en historial; se limpia el vínculo activo y la conversación reinicia selección (`awaiting_size`); el nuevo borrador nace solo al seguir la selección.                                                                       | Cualquier reserva del borrador anterior queda liberada; 0 guías hasta confirmar el pedido nuevo.                           | No se reutiliza ni confirma el resumen anterior.                                                                                                                                            |
| 6   | **Talla agotada.** Seleccionar talla sin modelos disponibles (stock disponible 0), después responder con otra talla.                                                   | Devuelve a `awaiting_size` y pide otra talla; no crea pedido ni lo confirma. La nueva talla puede continuar a `showing_models`.                                                                                                                                     | Reserva permanece 0; 0 trabajos de guía.                                                                                   | No se promete pedido reservado ni se crea mensaje de confirmación.                                                                                                                          |
| 7   | **Referencia inválida.** En `showing_models`, responder una referencia que no está en el menú vigente y luego elegir una opción del menú.                              | Conserva el paso `showing_models`; la referencia inválida no crea pedido. Una opción vigente puede crear borrador y continuar captura.                                                                                                                              | Reserva 0; 0 guías durante el error.                                                                                       | Error útil con próximo paso; sin resumen o confirmación con precio de referencia inexistente.                                                                                               |
| 8   | **Transportadora obligatoria caída.** Configurar doble de cotización para que la carrier obligatoria falle o no dé cobertura.                                          | No se publica resumen confirmable; conversación pasa a revisión humana (modo `human`) o instruye reintentar según política y muestra estado real. Pedido no confirmado.                                                                                             | Reserva 0; 0 guías.                                                                                                        | Alerta operacional si hay relevo; no encolar una confirmación ni un texto que prometa costo/entrega inexistente.                                                                            |
| 9   | **Alternativa permitida.** Carrier preferida no disponible y política admite carrier alternativa; volver a cotizar.                                                    | Resumen `awaiting_confirmation` usa la alternativa realmente elegida, con costos de esa cotización.                                                                                                                                                                 | Reserva 0 y 0 guías antes de confirmar; después de confirmar, reserva +1 y un trabajo pendiente.                           | El mensaje muestra carrier/costo seleccionados; no atribuir el precio de la preferida a la alternativa.                                                                                     |
| 10  | **Cotización vencida.** Obtener resumen y dejar expirar cotización de fixture; intentar confirmar.                                                                     | Rechaza el resumen vencido, no avanza a confirmado; recotiza y emite resumen nuevo o releva a revisión si no logra cotizar.                                                                                                                                         | En el intento rechazado, reserva 0 y 0 guías. Solo un segundo consentimiento explícito al resumen vigente puede confirmar. | La respuesta anterior no se interpreta como confirmación del precio nuevo; no trabajo duplicado.                                                                                            |
| 11  | **Guía creada.** Confirmar compra en fixture; ejecutar worker falso de guía una vez.                                                                                   | Pedido permanece `confirmed` hasta evento real de despacho; panel/conversación muestra evento `guía generada`, número, carrier y fecha.                                                                                                                             | Un trabajo por pedido: `pending` → `created`; el stock sigue reservado mientras no se despache.                            | Un hito/alerta idempotente. La existencia de guía no comunica “despachado” ni “entregado”.                                                                                                  |
| 12  | **Fallo de PDF.** Crear guía con proveedor falso que falla al recuperar/generar PDF; revisar y reintentar.                                                             | Se mantiene el estado verdadero de guía/pedido y se muestra alerta operativa; no aparece acción de descarga válida hasta tener bytes almacenados.                                                                                                                   | No reservar/liberar adicionalmente; no crear otro trabajo por reintento de PDF.                                            | Sin mensaje/documento ficticio. Error de PDF y reintento no avanzan pedido ni duplican evento.                                                                                              |
| 13  | **Webhook duplicado.** Enviar dos veces el mismo `whatsappMessageId` de confirmación/referencia; comparar resultados.                                                  | Una sola transición; pedido y conversación iguales tras segunda entrega.                                                                                                                                                                                            | A lo sumo una reserva neta y un trabajo de guía por pedido.                                                                | Un mensaje saliente por clave idempotente; la repetición no duplica alerta ni evento.                                                                                                       |
| 14  | **Cliente recurrente.** Usar mismo `customerId` sintético con un destino anterior válido; iniciar otro pedido, aceptar explícitamente reutilizarlo y cotizar de nuevo. | Sigue siendo un pedido `draft` hasta consentimiento del resumen. Se reutilizan solo datos del mismo cliente y se vuelve a validar cobertura/cotización. `cambiar dirección` vuelve a captura normal.                                                                | 0 reserva/guías antes de confirmar.                                                                                        | No revelar dirección antes de aceptar reutilizar; no buscar datos por coincidencia de teléfono ni reutilizar datos de otro cliente; consentimiento de marketing no es requisito ni permiso. |
| 15  | **Relevo a propietaria.** Forzar error no recuperable o cobertura sin alternativa y verificar relevo.                                                                  | Conversación queda en modo `human`; pedido continúa `draft` o no existe, nunca `confirmed` por el fallo.                                                                                                                                                            | Reserva sin delta (o liberada); 0 guías.                                                                                   | Una respuesta de relevo y alerta deduplicada; se cancelan automáticos pendientes no enviados. No seguir contestando automáticamente hasta reactivación explícita.                           |

### Evidencia por caso

Registrar una fila por intento con estos campos: `case_id`, commit SHA, fecha UTC, `conversation_id`/`order_id` sintéticos, pasos y mensajes enviados, estado observado antes/después, delta de `reserved_quantity`, recuento/estado de `shipping_guide_jobs`, recuento/estado de `whatsapp_outbound_messages`, alertas, resultado (`aprobado`/`fallido`/`bloqueado`) y enlace a captura redactada. Si el resultado no coincide, abrir defecto; no cambiar la expectativa para hacer pasar el caso sin explicar la decisión.

## Revisión manual del operador: escritorio y 390 px

Ejecutar con navegador de prueba disponible y fixture/datos sintéticos. El tamaño de viewport móvil debe ser exactamente 390 px de ancho; registrar también el tamaño de escritorio utilizado.

| Pantalla                  | Verificación                                                                                                                                                                                      | Evidencia esperada                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Ajustes → simulador       | Recorrer los escenarios disponibles; iniciar/resetear; respuestas por teclado; se entiende que son datos ficticios, sin efectos externos. Casos bloqueados no enseñan una confirmación de compra. | Capturas 390 px + escritorio y transcripción completa del recorrido normal y de un error.         |
| Editor del flujo          | Tab/Shift+Tab, foco visible, etiquetas entendibles, campos de error vinculados, guardar/publicar con estados inequívocos; scroll usable en móvil.                                                 | Capturas y nota de lector/teclado; errores visibles y no solo por color.                          |
| Conversación del operador | Hitos con fecha/estado, respuesta de relevo, tarjeta de producto/estado legible, sin indicar despacho/entrega antes de los eventos.                                                               | Captura antes/después de guía con nombres y teléfono redactados.                                  |
| Descarga de guía          | Acción accesible por teclado, autorización de operador, PDF válido y nombre inequívoco; estado de carga/error/reintento si el PDF aún no existe.                                                  | Captura y resultado de abrir PDF sintético; nunca compartir su contenido si es de un pedido real. |

Para cada pantalla anotar: contraste de texto/controles, foco inicial y orden, interacción sin mouse, mensaje de error y recuperación, overflow horizontal, etiquetas accesibles y diferencia móvil/escritorio. Esta revisión no se considera aprobada hasta que la haga una persona operadora y registre su resultado.

## No confundir validaciones

- Pruebas unitarias/API/admin en verde no demuestran persistencia PostgreSQL, render visual real, conectividad pública, revisión manual, webhook de Meta ni creación real de guía.
- La simulación del editor es un doble de producto, no una conversación enviada a WhatsApp.
- La integración local con dobles de proveedores no demuestra autorización ni funcionamiento de credenciales productivas de Meta/99envíos.
- Solo registrar “prueba real Meta/99envíos” si existe autorización, entorno y evidencia separada de cada proveedor; no forma parte de este guion local.
