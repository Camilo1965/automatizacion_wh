# KAIRO WhatsApp MVP Implementation Plan

> **Para quien ejecute este plan:** seguir cada tarea con revisión entre tareas. Cada casilla representa una acción verificable; no avanzar de fase con una prueba roja.

**Objetivo:** cerrar los siete hallazgos del flujo de compra por WhatsApp y hacer que el simulador permita revisar la misma experiencia que recibe el cliente.

**Arquitectura:** conservar `OrderService` como autoridad para cambios de pedidos y `PostgresConversationRepository` como autoridad para estado de conversación. `WhatsAppSalesService` coordina ambas y la cola de salida; los textos de resumen y estado se extraen a formateadores puros compartidos con el simulador. El simulador usa datos ficticios en memoria y nunca llama a 99envíos, Meta ni a la base operativa.

**Tecnologías:** TypeScript, Fastify, React, PostgreSQL/Drizzle, Vitest y Playwright existentes en el repositorio.

## Decisiones y límites globales

- La guía PDF debe estar disponible en la conversación de KAIRO para el operador. El envío automático del PDF al WhatsApp del cliente queda desactivado por defecto y en los flujos activos del MVP; un eventual opt-in futuro será explícito.
- `confirmar` reserva el producto y confirma el pedido; no afirma que el cliente pagó, que la transportadora recogió el paquete ni que la entrega ocurrió.
- El segmento `buyer` continúa dependiendo de un estado de pago comprobado o entrega. El sistema hoy solo tiene evidencia de `delivered`; no cambiarlo a `confirmed`.
- No se modifica el login: hay cambios locales ajenos a este plan y dos expectativas antiguas en `App.test.tsx`.
- Las pruebas de aceptación usan un PostgreSQL de pruebas separado, un proveedor de WhatsApp falso y un proveedor de envíos falso. Nunca usan el `.env` operativo para limpiar tablas o crear guías.
- Toda respuesta de error debe decir qué puede hacer el cliente a continuación. Ningún fallo de pedido o cotización se presentará como compra exitosa.
- Los comandos siguen funcionando por texto. Si se añaden botones de WhatsApp, son una capa de comodidad con la misma semántica.

| Punto acordado | Entrega | Prioridad |
| --- | --- | --- |
| 1. Cancelación coherente | Tarea 1 | P0 |
| 2. Corrección sin reiniciar | Tarea 2 | P0 |
| 3. Resumen claro, sin repeticiones | Tarea 3 | P0 |
| 4. Menos fricción al comprar | Tareas 4 y 5 | P1 |
| 5. Estado posterior al pedido | Tarea 6 | P1 |
| 6. Simulador fiel | Tarea 7 | P1 |
| 7. Guía para operador en KAIRO | Tarea 8 | P1 |

## Mapa de archivos y responsabilidades

| Unidad | Archivos principales | Responsabilidad |
| --- | --- | --- |
| Estados y comandos | `apps/api/src/modules/conversations/conversation-state.ts`, `configured-flow.ts` | Interpretar texto y decidir el siguiente estado, sin operaciones externas. |
| Persistencia de conversación | `apps/api/src/modules/conversations/postgres-conversation-repository.ts` | Guardar estado, pedido activo y versión del resumen de forma coherente. |
| Coordinación de ventas | `apps/api/src/modules/conversations/whatsapp-sales-service.ts` | Aplicar transiciones de pedido, cotizar y encolar respuestas. |
| Pedido | `apps/api/src/modules/orders/order-service.ts`, `postgres-order-repository.ts` | Validar cambios, cancelación e invalidación de resúmenes. |
| Resumen y mensajes | Nuevo `apps/api/src/modules/conversations/customer-order-messages.ts` | Un único texto para revisión, confirmación y estado posterior. |
| Simulador | `apps/api/src/modules/conversations/bot-flow-simulator.ts`, `apps/admin/src/settings/BotFlowSimulatePanel.tsx` | Datos ficticios y vista de conversación sin efectos secundarios. |
| Guía | `apps/api/src/modules/shipping/guide-delivery-service.ts`, `apps/admin/src/conversations/ConversationTimeline.tsx`, `apps/admin/src/settings/BotFlowPage.tsx` | PDF para operador y política de envío al cliente. |

## Fase 1 — Cerrar el pedido sin inconsistencias (P0)

### Task 1: Cancelación desde el resumen

**Estado actual:** `conversation-state.ts` devuelve `cancel_order`, pero `WhatsAppSalesService.process()` no la ejecuta. La conversación puede volver a pedir talla mientras el borrador anterior sigue asociado.

**Archivos:** modificar `conversation-state.ts`, `postgres-conversation-repository.ts`, `whatsapp-sales-service.ts`; probar en `conversation-state.test.ts`, `whatsapp-sales-service.test.ts` y `whatsapp-sales-flow.integration.test.ts`.

**Interfaz prevista:**

```ts
clearActiveOrder(conversationId: string, expectedOrderId: string): Promise<void>
// Solo limpia activeOrderId, selectedReferenceId y activeSummaryVersion
// cuando expectedOrderId sigue siendo el pedido activo.
```

- [ ] Añadir una prueba de integración: crear borrador y resumen, recibir `cancelar`, verificar pedido `cancelled`, conversación sin pedido activo y sin versión de resumen, sin trabajo de guía, y una sola respuesta de cancelación.
- [ ] Añadir una prueba de reentrega del mismo `whatsappMessageId`: no repetir transición ni respuesta.
- [ ] Ejecutar esas pruebas y comprobar que fallan con el código actual.
- [ ] En el servicio, ejecutar `orders.transition({ orderId, action: 'cancel', idempotencyKey: 'whatsapp:<messageId>' })`, limpiar el vínculo activo con precondición y responder: `Cancelé el pedido <ID>. Si quieres empezar otro, dime tu talla.` Mantener el historial y el vínculo histórico del pedido.
- [ ] Si la cancelación del pedido falla, no comunicar éxito; pausar automatización, abrir alerta para operador y explicar que revisará el caso. Comprobar el caso en una prueba.
- [ ] Ejecutar `pnpm --filter @camila/api exec vitest run --project unit test/conversation-state.test.ts test/whatsapp-sales-service.test.ts` y la integración dirigida con una base de pruebas aislada. Revisar el diff y guardar la tarea en un commit propio.

**Aceptación:** cancelar no deja un borrador activo reutilizable ni reserva inventario; la respuesta tiene un identificador de pedido; los mensajes duplicados no producen efectos dobles.

### Task 2: Correcciones desde el resumen

**Diseño:** aceptar `cambiar dirección`, `cambiar municipio`, `cambiar producto` y `cancelar` cuando se espera confirmación. Mostrar las opciones también en el texto del resumen. Cambios de dirección/municipio conservan el borrador; cambiar producto cancela ese borrador y crea uno nuevo al elegir otra referencia.

**Archivos:** `conversation-state.ts`, `configured-flow.ts`, `postgres-conversation-repository.ts`, `whatsapp-sales-service.ts`, `packages/contracts/src/bot-flow.ts`; pruebas de estado, servicio e integración.

**Interfaz prevista:**

```ts
type SummaryEditAction = 'edit_address' | 'edit_locality' | 'edit_product';
// Toda edición deja activeSummaryVersion = null antes de admitir confirmar.
```

- [ ] Escribir casos que empiezan con resumen vigente y ejercitan cada comando. Confirmar con la versión anterior debe ser rechazado.
- [ ] Para dirección, ir a `awaiting_address`, actualizar el borrador y recalcular cotización/resumen si el proveedor depende de la dirección.
- [ ] Para municipio, ir a `awaiting_locality`; validar contra el catálogo de localidades y recalcular cotización/resumen. Un nombre no encontrado conserva el mismo paso y muestra hasta tres opciones.
- [ ] Para producto, cancelar el borrador anterior, limpiar vínculo activo y volver a pedir talla/referencia. No ofrecer confirmación del pedido anterior.
- [ ] Persistir el cambio de estado y la invalidación de `activeSummaryVersion` de manera atómica; verificar interrupciones, reintentos y mensajes duplicados.
- [ ] Probar que la conversación antigua conserva su versión de flujo hasta reiniciar, y que una corrección no cambia a otra versión a mitad de compra.
- [ ] Ejecutar pruebas unitarias e integración del recorrido completo; revisar y guardar en commit propio.

**Aceptación:** el cliente corrige un dato con un comando, ve el dato actualizado y solo puede confirmar el resumen nuevo.

### Task 3: Resumen único y comprensible

**Estado actual:** el servicio genera un resumen real con producto, talla, precios, transportadora, total y dirección; el texto ya contiene `confirmar/cancelar` y se concatena con el paso de confirmación configurado, por lo que repite instrucciones.

**Archivos:** crear `customer-order-messages.ts`; modificar `whatsapp-sales-service.ts`, `flow-definition.ts`, `BotFlowPage.tsx`; probar en `whatsapp-sales-service.test.ts`, `flow-definition.test.ts` y prueba del panel.

**Interfaz prevista:**

```ts
export function formatOrderReview(
  summary: OrderSummary,
  flow: BotFlowDefinition,
): string;
```

- [ ] Escribir prueba del texto exacto con referencia, modelo, talla, subtotal, envío, total contra entrega, nombre, dirección, número de pedido y las acciones `confirmar`, `cancelar`, `cambiar dirección`, `cambiar municipio` y `cambiar producto`. Añadir caso sin cotización: no mostrar total final ni habilitar confirmación.
- [ ] Extraer `formatOrderReview(summary, flow)` para usarlo en el envío real y el simulador. El mensaje configurable `summary` será encabezado opcional; `confirmation` será una pregunta única al final.
- [ ] Actualizar el texto inicial del flujo y la descripción del editor para que el dueño vea qué parte es editable y qué datos operativos se calculan.
- [ ] Probar formato móvil: líneas cortas, montos COP consistentes, dirección legible y ausencia de instrucciones repetidas.
- [ ] Ejecutar pruebas unitarias dirigidas y guardar en commit propio.

**Aceptación:** una sola pregunta de confirmación y un solo total; ningún precio de demostración aparece en una respuesta operativa.

## Fase 2 — Compra fácil de entender (P1)

### Task 4: Respuestas flexibles y ayuda contextual

**Archivos:** `conversation-state.ts`, `configured-flow.ts`, `whatsapp-sales-service.ts`, pruebas de estado y servicio.

- [ ] Escribir tabla de entradas equivalentes: `37`, `talla 37`, `37.5`, `sí`, `si`, `mismo número`, `no`, `saltar`; indicar por prueba en qué estado aplica cada una.
- [ ] Ampliar el reconocimiento de talla y teléfono sin interpretar números de pedido o direcciones como tallas. Mantener las reglas actuales de celular colombiano.
- [ ] Incluir REF y nombre del artículo seleccionado antes de pedir nombre; conservar `más modelos`, `reiniciar` y `asesora` en los pasos pertinentes.
- [ ] Para municipio ambiguo, numerar hasta tres coincidencias y aceptar el nombre completo o el número de una sugerencia de la última lista; no aceptar números fuera de esa lista.
- [ ] Después de dos fallos, ofrecer ayuda humana sin un bucle interminable y sin perder la conversación.
- [ ] Ejecutar pruebas de estados y casos reales con proveedor falso; guardar en commit propio.

**Aceptación:** el cliente puede responder de forma natural en los casos definidos y siempre recibe una instrucción útil para continuar.

### Task 5: Reutilizar datos de clientes habituales con confirmación

**Contexto:** `customers` ya tiene identificador estable y `sales_orders` conserva nombre/destino; no crear otra identidad por teléfono. La reutilización de una dirección es una comodidad de compra, no consentimiento para publicidad.

**Archivos:** `apps/api/src/modules/customers/postgres-customer-repository.ts`, `whatsapp-sales-service.ts`, `conversation-state.ts`, pruebas de clientes y del flujo; añadir esquema solo si resulta imprescindible tras revisar el modelo existente.

- [ ] Escribir prueba: para un `customerId` válido, proponer la última dirección utilizable sin escribirla completa en un mensaje previo a confirmar identidad; el cliente responde `sí` o `cambiar dirección`.
- [ ] Obtener únicamente datos del mismo `customerId`, excluir registros anonimizados o marcados para revisión y no usar consentimiento de marketing como permiso para compartir datos.
- [ ] Tras `sí`, copiar nombre/destino al nuevo borrador y volver a validar localidad, cobertura y cotización. Con `cambiar dirección`, pasar al flujo de captura normal.
- [ ] Si faltan datos o la localidad ya no tiene cobertura, pedirlos de nuevo y explicar la razón.
- [ ] Probar comprador recurrente, primer comprador, perfil anonimizado y destino sin cobertura; guardar en commit propio.

**Aceptación:** el cliente recurrente escribe menos, pero confirma antes de reutilizar datos; no se mezclan datos entre clientes.

### Task 6: Estados posteriores a la confirmación

**Archivos:** `customer-order-messages.ts`, `whatsapp-sales-service.ts`, `apps/api/src/modules/shipping/guide-delivery-service.ts`, `apps/admin/src/conversations/ConversationTimeline.tsx`, `apps/admin/src/orders/OrderDetailPage.tsx`; pruebas de confirmación, guía y estados.

- [ ] Probar que la confirmación dice `Pedido <ID> confirmado; reservamos tu producto` y explica que se notificará la guía cuando exista. No decir `pagado`, `despachado` ni `entregado` en esa etapa.
- [ ] Definir textos separados para `guía generada`, `despachado` y `entregado`, ligados a transiciones reales del pedido. Registrar cada evento una vez, con clave idempotente.
- [ ] Mostrar esos hitos en la conversación de KAIRO con fecha y estado; si falla la generación del PDF, mostrar alerta operativa y mantener el estado honesto.
- [ ] Antes de activar mensajes salientes por WhatsApp para hitos tardíos, verificar la ventana de conversación y plantillas aprobadas; si no se permite el envío, conservar el hito en el panel y no encolar mensaje libre.
- [ ] Probar reintentos, fallos de proveedor y que el estado visible no avance por un mensaje fallido; guardar en commit propio.

**Aceptación:** cada hito corresponde a un evento confirmado y el cliente nunca recibe una promesa de envío/entrega prematura.

## Fase 3 — Prueba fiel y guía para operador (P1)

### Task 7: Simulador con el mismo resumen y mejores controles

**Estado actual:** `bot-flow-simulator.ts` inserta valores fijos y concatena textos genéricos; no reproduce el resumen que construye `WhatsAppSalesService`. La pantalla muestra pares de líneas, no una conversación visual.

**Archivos:** `bot-flow-simulator.ts`, `customer-order-messages.ts`, `BotFlowSimulatePanel.tsx`, `BotFlowPage.tsx`, `packages/contracts/src/bot-flow.ts`; pruebas del simulador y del panel.

- [ ] Definir un fixture explícito `PED-DEMO`, REF 01, talla 37, producto/precio, envío y dirección ficticios. Etiquetarlo `Ejemplo: no es un pedido real`.
- [ ] Reutilizar `formatOrderReview(summary, flow)` de la tarea 3; el escenario normal debe mostrar exactamente el resumen, la corrección y la confirmación que corresponderían a ese fixture.
- [ ] Añadir pruebas de paridad para los seis escenarios existentes: disponible, agotado, municipio inválido, transportadora bloqueada, alternativa y cotización vencida. En los escenarios bloqueados no aparece confirmación de compra.
- [ ] Sustituir la entrada multilineal como única interacción por un chat con burbujas, campo de respuesta, botones de escenario y opción de reiniciar. Mantener entrada multilineal en sección avanzada para pruebas rápidas.
- [ ] Mostrar foto de catálogo de ejemplo solo si el fixture tiene asset local; si no, usar tarjeta de producto textual. Incluir vista móvil a 390 px y navegación por teclado.
- [ ] Confirmar por prueba que `sideEffects: false`, que el endpoint no abre transacción operativa y que ningún botón llama a Meta ni 99envíos. Guardar en commit propio.

**Aceptación:** el operador entiende qué verá un cliente y puede recorrer el caso normal sin escribir diez líneas antes de pulsar probar.

### Task 8: PDF de guía en KAIRO y control de envío al cliente

**Estado actual:** `ConversationTimeline.tsx` ya ofrece `Descargar guía PDF` con reintento; el endpoint autenticado también existe. Conservar esa implementación y centrar el cambio en la política de entrega y la claridad del evento.

**Archivos:** `flow-definition.ts`, `BotFlowPage.tsx`, `guide-delivery-service.ts`, `apps/admin/src/conversations/ConversationTimeline.tsx`, `apps/admin/src/conversations/ConversationTimeline.test.tsx`, `apps/api/src/routes/admin/shipping.ts`; prueba de integración de guía.

- [ ] Extender las pruebas existentes: al crearse una guía válida, el operador ve número, transportadora, estado y la acción ya existente `Descargar guía PDF`; la descarga sigue usando la ruta autenticada ya empleada por pedidos.
- [ ] Añadir prueba: con política del MVP `operator_only`, no se encola `enqueueDocument`, incluso si una conversación vieja conserva `sendGuideToCustomer: true` en su snapshot.
- [ ] Establecer el valor predeterminado `sendGuideToCustomer: false` y presentar en Ajustes `Guía para el operador` como comportamiento activo. Conservar la opción de envío al cliente deshabilitada o marcada como opt-in futuro hasta tener una política de producto explícita.
- [ ] No reescribir versiones históricas del flujo. Publicar una nueva versión por los mecanismos existentes y aplicar la política `operator_only` también al trabajador que procesa conversaciones antiguas.
- [ ] Probar guía creada, PDF aún no disponible, descarga fallida, reintento y acceso sin permiso; guardar en commit propio.

**Aceptación:** la guía se descarga dentro de KAIRO; la política no depende de cuándo comenzó la conversación.

## Fase 4 — Validación y salida (P0)

### Task 9: Matriz de aceptación y revisión del operador

**Archivos:** `apps/api/test/whatsapp-sales-flow.integration.test.ts`, pruebas del panel, `docs/` para guion manual.

- [ ] Ejecutar en base aislada los recorridos: compra normal; cancelar antes de confirmar; cambiar dirección; cambiar municipio; cambiar producto; talla agotada; referencia inválida; transportadora obligatoria caída; alternativa permitida; cotización vencida; guía creada; fallo de PDF; duplicado de webhook; cliente recurrente; relevo a propietaria.
- [ ] Para cada recorrido, comprobar estado de conversación, estado del pedido, inventario reservado o liberado, número de trabajos de guía y mensajes encolados. Los caminos de error no deben crear guía.
- [ ] Revisar en 390 px y escritorio el simulador, el editor del flujo, la conversación del operador y el enlace de descarga. Probar teclado, foco, contraste y mensajes de error.
- [ ] Ejecutar `pnpm --filter @camila/contracts test:unit`, `pnpm --filter @camila/api test:unit`, `pnpm --filter @camila/admin test:unit`, `pnpm typecheck`, `pnpm lint:strict` y las integraciones dirigidas con `TEST_DATABASE_URL` apuntando a una base desechable verificada. Ejecutar `pnpm test:e2e` cuando el entorno local de pruebas esté levantado.
- [ ] Corregir los dos tests de login que hoy esperan un título obsoleto solo si no pertenecen a cambios locales aún en curso; no mezclar esa corrección con los commits del bot.
- [ ] Entregar evidencia: comandos/resultados, capturas móvil/escritorio, transcripción del simulador, matriz de casos y límites restantes del test real de Meta/99envíos.

**Criterio de salida:** ningún P0 abierto, suites relevantes verdes, aprobación manual del dueño sobre el flujo simulado y la descarga de guía en KAIRO. El test real de WhatsApp y 99envíos se registra aparte; no se declara realizado por pasar el simulador.

## Orden de entrega

1. Fase 1: cancelación, correcciones y resumen; habilita un recorrido de compra seguro.
2. Fase 2: reduce fricción y aclara el estado del pedido.
3. Fase 3: hace verificable la experiencia y alinea la guía con el operador.
4. Fase 4: cierra regresiones y deja un guion de prueba manual reproducible.

Cada tarea termina con prueba dirigida y revisión de diff antes de integrarse. No mezclar los cambios preexistentes de login con este trabajo.
