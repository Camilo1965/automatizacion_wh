# KAIRO: guía descargable en la conversación interna

**Estado:** diseño aprobado por la propietaria el 2026-09-23. Pendiente de revisión de este documento antes del plan de implementación.

## Objetivo y alcance

Cada guía de 99envíos creada para un pedido originado en WhatsApp debe aparecer exactamente una vez en la conversación interna de KAIRO, con pedido, transportadora, número de preenvío y una acción para descargar el PDF e imprimirlo. Esta actividad es solo para el operador: no añade mensajes de WhatsApp al cliente ni cambia la opción existente `sendGuideToCustomer`. Un pedido creado directamente en el panel, sin conversación de origen, continúa mostrando su guía en el detalle del pedido.

La tarjeta representa la **creación de la guía**, no la disponibilidad del PDF ni la entrega del documento por WhatsApp. Debe aparecer aunque la descarga del PDF falle o el envío al cliente esté desactivado.

## Decisión de diseño

Se evaluaron tres opciones: enlazar solamente el pedido activo desde el contexto de la conversación (rápido, pero pierde guías históricas), reutilizar el mensaje de documento enviado por WhatsApp (depende de `sendGuideToCustomer` y confunde una acción interna con una entrega al cliente) o registrar una actividad interna persistente e idempotente. Se elige la tercera.

## Modelo y flujo

1. Persistir una relación inmutable `order_id → origin_conversation_id` cuando el bot vincula el borrador de pedido a la conversación. El pedido puede dejar de estar activo sin perder esta relación. La relación tiene `order_id` único, claves foráneas y no se crea para pedidos de panel sin conversación.
2. Ampliar el transcript con una fuente `system` y metadatos tipados de actividad `guide_created` (`orderId`, `guideJobId`, `preShipmentNumber`, `carrier`). La base garantiza unicidad por `guideJobId`; los eventos del sistema nunca entran en la cola de WhatsApp y no tienen estado de entrega al cliente en la interfaz.
3. Al marcar un trabajo de guía como `created`, insertar su actividad interna en la misma transacción, si existe relación de origen. Si la guía se recupera de estado `uncertain` mediante revisión, realizar la misma inserción idempotente. Un error de persistencia ocurrido **después** de que 99envíos haya respondido con éxito se trata como resultado incierto y nunca como permiso para crear otra guía. Una conciliación de solo base de datos al migrar cubre las guías creadas históricas cuyo origen pueda probarse; no se adivina el origen de pedidos no vinculables.
4. El endpoint autenticado de mensajes devuelve la actividad como un elemento discriminado del transcript, ordenado y paginado de forma estable junto con los mensajes. El contrato distingue una actividad interna de un documento enviado por WhatsApp. La vista de conversación presenta una tarjeta neutral con número de pedido, transportadora, preenvío, enlace al pedido y botón `Descargar PDF`.
5. El botón reutiliza `GET /api/admin/orders/:orderId/shipping-guide/pdf` y su cliente autenticado. No se crea una URL pública ni se expone la clave de almacenamiento. Si el PDF todavía no se puede obtener, se muestra un error recuperable y la acción `Reintentar`; jamás se solicita otra guía para resolver un error de PDF. La descarga conserva la URL temporal del navegador el tiempo necesario para que se inicie antes de revocarla.
6. Los mensajes de tipo `document` se muestran como documentos, no como imágenes. Cualquier URL de medios expuesta por el contrato debe corresponder a una ruta autenticada implementada; si no existe, no se muestra un enlace roto. Las imágenes conservan su presentación actual cuando tengan una ruta válida.

## Interfaz y estados

- La tarjeta debe leerse claramente en escritorio y móvil, con enlace y botones accesibles por teclado, nombre comprensible y estados visibles de carga y error.
- Una guía creada aparece al refrescar la conversación o en el siguiente sondeo existente de cinco segundos, sin depender de que sea el pedido actualmente activo.
- La actividad interna usa una etiqueta `Solo KAIRO` y no muestra `Enviado`, `Entregado` ni `Leído`.
- Si una descarga falla, la guía sigue visible y el operador puede consultar el pedido; la recuperación no dispara una operación facturable de 99envíos.

## Pruebas y aceptación

- Integración PostgreSQL: relación de origen persistente, varios pedidos en una conversación, inserción atómica e idempotente para `created` y para revisión de `uncertain`, fallo local tras éxito del proveedor sin segundo preenvío y sin actividad para pedidos de panel.
- API/contratos: orden y paginación estables, autenticación 401 y autorización según rol, ningún medio público y ningún evento `system` en la cola de WhatsApp.
- UI: tarjeta una sola vez, descarga exitosa, PDF temporalmente no disponible, reintento sin nueva guía, documento de WhatsApp sin `<img>` roto, visualización móvil y acceso por teclado.
- Regresión: el envío opcional del PDF al cliente conserva su configuración y las pruebas del flujo de creación de guía siguen pasando.
- Puerta local: formato, lint, tipos, tests, E2E y build del monorepo. La aceptación real con Meta y 99envíos sigue siendo una puerta separada de producción.

## No objetivos

No construir un editor visual de ramificaciones del bot, no enviar la tarjeta al WhatsApp del cliente, no crear guías para probar la interfaz y no introducir descarga pública de PDFs.
