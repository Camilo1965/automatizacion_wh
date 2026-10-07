# Auditoría visual, funcional y de calidad de KAIRO

Fecha: 6 de octubre de 2026 · Zona: America/Bogota.

## Dictamen

**No está terminado ni listo para entregarlo como MVP autónomo.** El recorrido normal local funciona y la interfaz tiene una base consistente, pero la auditoría encontró seis problemas P1, fallos de recuperación y discrepancias entre datos reales, contratos e interfaz. Es apto para demostración asistida del alcance probado; no para afirmar que toda la operación está cerrada.

No se confirmó un P0 en este alcance. Eso no equivale a una garantía de ausencia de fallos.

La revisión es una auditoría: no se modificó código funcional, no se hizo merge/push y no se llamó a Meta ni 99envíos. Los cambios preexistentes del login en el checkout principal se conservaron.

## Versión y alcance real

- Código funcional auditado: `codex/kairo-whatsapp-ux@17f66ba37f702efd1501e6ca20f546412cd1d975`.
- `main` permanece en `ec48e38`: hay **27 commits** de esta rama que aún no están integrados, incluidas cuatro migraciones y las mejoras del bot.
- El login centrado verde/dorado existe como cambios locales sin confirmar en `C:/Users/WinterOS/Documents/ChatGPT/camila`. El login de la rama funcional todavía es el diseño anterior. Por tanto, aún no existe una única versión final que reúna ambos.
- Navegador local: escritorio 1280×720; móvil 390×844; comprobaciones adicionales a 320×640.
- Se recorrieron los tipos de página de las 26 rutas del panel: login, inicio, catálogo y creación/detalle, importación, pedidos y creación/detalle, conversaciones, clientes y detalle/revisión, envíos, municipios, novedades, WhatsApp, bot/editor/simulador, integraciones, seguridad, privacidad, auditoría, alertas, cierres, ayuda y menú Más. También se revisaron búsqueda global y confirmaciones.
- Roles: propietaria y operadora sintéticas. El cliente se probó mediante el servicio real del bot con proveedores falsos y mediante el simulador; no por un intercambio real de WhatsApp.
- Datos y archivos son ficticios, alojados en bases temporales nuevas dentro del PostgreSQL ya existente de Camila. El PDF de muestra es un fixture de 80 bytes: verifica transporte/autorización, **no impresión ni validez de una etiqueta real**.
- No se ejecutó `pnpm test:e2e` ni se declaró aprobación manual de toda la matriz de 15 casos. La inspección del navegador y las integraciones ejecutadas tienen el alcance descrito aquí.

## Evidencia favorable

1. Login centrado: se vio completo, sin desplazamiento horizontal a 1280, 390 y 320 px. Campos/botón principal de 48 px; mostrar contraseña de 44 px. Autocompletado correcto y foco visible por teclado.
2. Compra normal local: captura → resumen con total COP → confirmación → reserva única → guía ficticia.
3. Guía visible dentro de la conversación para KAIRO, con número, transportadora, pedido y acción de descarga. El servicio de entrega automática al WhatsApp se detiene por política `operator_only`.
4. Endpoint PDF: HTTP 200 autenticado, `application/pdf`, prefijo `%PDF-`, hash consistente; HTTP 401 sin sesión. El reintento en la interfaz quitó el error. La captura del evento de descarga del navegador no entregó una ruta de archivo; no se afirmó recepción de un PDF imprimible.
5. Desde la interfaz se despachó y marcó entregado el pedido ficticio. El stock físico pasó de 5 a 4, la reserva quedó en 0 y el cliente pasó a “Compra acreditada”. El filtro Compradores devolvió ese contacto.
6. Regla municipal: se guardó “Medellín solo Envia”, preferida Envia, sin alternativa; la simulación efectiva devolvió origen municipal y sólo esa transportadora permitida. Esta simulación no consultó precios reales.
7. Tomar control habilitó el compositor y pausó el bot. Operadora no ve accesos de configuración del bot/integraciones/privacidad y el API denegó el acceso al bot.
8. Tipografías, cards, botones, estados vacíos y disposición móvil son coherentes en las pantallas observadas. Login, editor del bot, envíos y privacidad no tuvieron desbordamiento horizontal en las mediciones a 320 px.
9. Build, typecheck, lint estricto y presupuesto de bundle pasaron en la versión auditada.

## P1 — cerrar antes de entregar

### F01. Una confirmación interrumpida se pierde al repetir el webhook

**Confirmado con PostgreSQL y las clases reales.** Se llegó al resumen, se ejecutó sólo `repository.receive(confirmar)` para simular un corte y después `service.process` con el mismo ID.

Resultado:

```json
{
  "state": "completed",
  "mode": "bot",
  "active_summary_version": 1,
  "status": "draft",
  "guides": 0,
  "reservations": 0
}
```

No se encoló confirmación. El evento duplicado ya no entrega la acción que falta: la conversación avanza antes del efecto del pedido.

Fuentes: [apps/api/src/modules/conversations/postgres-conversation-repository.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/conversations/postgres-conversation-repository.ts:445), [apps/api/src/modules/conversations/whatsapp-sales-service.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/conversations/whatsapp-sales-service.ts:249).

**Cierre mínimo:** persistir y recuperar la continuación de confirmación, con una respuesta idempotente. Probar interrupción antes de transición y después de confirmar, reentrega del mismo evento y exactamente una reserva, una guía y una respuesta. La guía ya se inserta atómicamente al confirmar; el corte posterior afecta la respuesta, no implica pérdida de ese trabajo.

### F02. Cotización vencida y recotización fallida dejan al cliente bloqueado

**Confirmado con PostgreSQL.** Resumen válido → vencer la cotización del pedido asociado → proveedor falso falla al recotizar → confirmar.

Resultado: conversación `completed/bot`, versión anterior 1, pedido `draft`, cero reservas, cero guías y cero alertas de cotización. Los últimos mensajes dicen que se calcula/revise el nuevo total, pero ese total ni el relevo llegan.

El relevo de resumen sin cotización exige versión activa nula, mientras esta ruta conserva la anterior.

Fuentes: [apps/api/src/modules/conversations/whatsapp-sales-service.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/conversations/whatsapp-sales-service.ts:673), [apps/api/src/modules/conversations/postgres-conversation-repository.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/conversations/postgres-conversation-repository.ts:781).

**Cierre mínimo:** invalidar/fencear correctamente el resumen anterior y efectuar el relevo de forma atómica. Integración que exija modo humano, alerta, respuesta útil y ninguna reserva/guía cuando la nueva cotización falla.

### F03. Repetir setup de MFA puede desactivar un MFA ya activo

**Confirmado en memoria; la lectura del upsert PostgreSQL confirma que también sobrescribe un MFA activo.** `beginMfaEnrollment` escribe secreto nuevo con `enabled:false`; el upsert reemplaza el registro activo. La ruta sólo exige sesión, sin comprobar contraseña o factor anterior. Este hallazgo no se ejecutó contra PostgreSQL.

Reproducción: `enabled:true,pendingSetup:false` → llamar setup → `enabled:false,pendingSetup:true`.

Fuentes: [apps/api/src/routes/admin/auth.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/routes/admin/auth.ts:116), [apps/api/src/modules/auth/auth-service.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/auth/auth-service.ts:455), [apps/api/src/modules/auth/postgres-admin-auth-repository.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/auth/postgres-admin-auth-repository.ts:362).

**Cierre mínimo:** rechazar setup si MFA está activo, o implementar rotación con reautenticación y verificación del factor vigente. Regresión HTTP que demuestre que setup no cambia ni desactiva un MFA activo.

### F04. La monitorización puede mostrar backups correctos aunque estén detenidos

**Confirmado con reloj simulado.** Un éxito guarda edad 0; el lector prioriza esa edad fija. Al avanzar 48 horas continúa exportando edad 0 y éxito 1. Además el fallo posterior escribe campos que el lector no usa para marcar fracaso.

Fuentes: [apps/api/src/modules/observability/metrics.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/observability/metrics.ts:389), [scripts/lib/backup-core.mjs](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/scripts/lib/backup-core.mjs:271), [scripts/backup-postgres.mjs](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/scripts/backup-postgres.mjs:99), [infra/prometheus/alerts.yml](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/infra/prometheus/alerts.yml:85).

**Cierre mínimo:** calcular edad desde la fecha del último éxito en cada lectura y registrar éxito/fallo explícitamente. Probar reloj avanzado, fallo después de éxito, recuperación y recepción de la alerta fuera del servidor.

### F05. Integraciones declara el worker activo sin comprobarlo

**Confirmado visualmente y por código.** Esta auditoría inició API/frontend, no el worker de este entorno; aun así la pantalla dice “Activo” y asegura un heartbeat reciente. El runtime inyecta `schedulerHealthy:true`.

Fuentes: [apps/api/src/runtime.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/runtime.ts:288), [apps/api/src/modules/integrations/integration-health-service.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/integrations/integration-health-service.ts:53), [apps/admin/src/settings/integrations/integration-diagnostics.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/settings/integrations/integration-diagnostics.ts:77).

**Cierre mínimo:** heartbeat compartido/persistido y caducidad comprobada por el API. Apagar el worker debe mostrar estado atrasado/caído; encenderlo debe recuperar estado. No usar una constante como evidencia operativa. La salud de medios también necesita comprobar el almacenamiento elegido: actualmente sólo verifica el directorio local, incluso para S3.

Evidencia: [Integraciones declara Scheduler Activo](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/integrations-desktop.jpg).

### F06. El historial de inventario falla tras un despacho normal

**Confirmado en UI, HTTP y validación de contrato.** Después del despacho, el API devuelve HTTP 200 con `reason:"order_dispatched"`, pero el contrato público sólo acepta `initial` y `manual_adjustment`. El panel muestra “La respuesta del servidor no es válida” y pierde el historial.

Fuente principal: [packages/contracts/src/inventory.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/packages/contracts/src/inventory.ts:29). Consumo: [apps/admin/src/catalog/MovementHistory.tsx](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/catalog/MovementHistory.tsx:45).

**Cierre mínimo:** alinear contratos, tipos y etiquetas con despacho/devolución. Probar venta real local → movimiento → respuesta HTTP válida para el schema → historial visible, incluyendo devolución.

Evidencia: [Error de historial después de despachar](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/inventory-movement-contract-error.jpg).

## P2 — calidad y flujos pendientes

| ID  | Hallazgo verificado                                                                                                                                                                                                                                                       | Cierre mínimo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F07 | Mensajes en cola muestra 0 cuando DB tiene 2 y 5 pendientes. El SQL generado compara `outbound.conversation_id = "id"`, que se resuelve a `outbound.id`.                                                                                                                  | Correlación con columna exterior explícita; integrar list/get con dos conversaciones y cantidades diferentes. Fuente: [apps/api/src/modules/conversations/postgres-conversation-admin-repository.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/conversations/postgres-conversation-admin-repository.ts:84) y línea 115.                                                                                                                                                                                  |
| F08 | Buscar `PED-000001` no encuentra el pedido existente; la búsqueda compara sólo el número sin prefijo ni ceros.                                                                                                                                                            | Normalizar el identificador comercial y mostrarlo también en resultados. Probar prefijo, ceros y referencia visible. Fuente: [apps/api/src/modules/search/global-search-service.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/search/global-search-service.ts:62).                                                                                                                                                                                                                                       |
| F09 | El simulador conserva la dirección fija tras corregirla, acepta `REF 99` y no reproduce el relevo por municipio inválido tras dos fallos. Reproducciones en memoria con código real.                                                                                      | Paridad de datos, estados y textos con el flujo operativo para correcciones y errores. Fuente: [apps/api/src/modules/conversations/bot-flow-simulator.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/conversations/bot-flow-simulator.ts:120) y 151.                                                                                                                                                                                                                                                      |
| F10 | Tres campos de comandos del editor no tienen etiqueta visible ni nombre accesible: dirección, municipio y producto. DOM: labels vacíos y sin aria-label.                                                                                                                  | Completar el mapa de etiquetas y validar los tres controles con teclado/lector. Fuente: [apps/admin/src/settings/BotFlowPage.tsx](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/settings/BotFlowPage.tsx:415).                                                                                                                                                                                                                                                                                                     |
| F11 | Estados `showing models`, `awaiting size`, `completed` y `created` llegan al operador; talla aparece como 37.0 en algunas superficies. El error de archivo ausente se presentó en inglés.                                                                                 | Mapa de todos los estados reales, etiquetas COP/talla/transportadora consistentes y errores localizados con próxima acción. Fuentes: [apps/admin/src/lib/operational-label.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/lib/operational-label.ts:1), [apps/api/src/http/map-domain-error.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/http/map-domain-error.ts:245).                                                                                                          |
| F12 | La conversación móvil de 22 hitos ocupó 3.937 px; su log tuvo 2.830 px de altura, sin scroll independiente. Al abrirla se ven los mensajes antiguos y la guía/compositor quedan abajo.                                                                                    | Altura de bandeja basada en viewport, hilo acotado, encabezado/compositor persistentes y acceso al último mensaje sin impedir leer anteriores. Fuente: [apps/admin/src/conversations/ConversationInboxPage.tsx](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/conversations/ConversationInboxPage.tsx:179) y [apps/admin/src/conversations/ConversationTimeline.tsx](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/conversations/ConversationTimeline.tsx:28).                        |
| F13 | Operadora ve Guardar preferencia y Desactivar regla habilitados aunque el servidor los deniega. El mensaje posterior indica “corrige la preferencia y vuelve a guardar”, una acción que no resolverá su permiso.                                                          | Vista de lectura o controles según capacidad; explicación “la propietaria puede cambiar esta regla”. Fuente: [apps/admin/src/settings/shipping/GeneralShippingPolicy.tsx](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/settings/shipping/GeneralShippingPolicy.tsx:63) y 84.                                                                                                                                                                                                                                      |
| F14 | Privacidad expone nombres de tablas, permisos internos, inglés, variables de entorno y marcadores `[HUMANO]`. Crear políticas depende de API/CLI.                                                                                                                         | Vista de negocio en español, separar opciones avanzadas y expresar claramente lo que la propietaria puede hacer. No presentar marcadores de desarrollo como instrucciones terminadas. Fuente: [apps/admin/src/settings/PrivacySettingsPage.tsx](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/settings/PrivacySettingsPage.tsx:169).                                                                                                                                                                               |
| F15 | Una creación de guía rechazada marca `failed` terminal, aunque la alerta indica `retrySafe:true`. No se encontró acción de recuperación para ese estado. Evidencia por composición de código; no se ejecutó un reintento manual.                                          | Recuperación explícita sólo para rechazo confirmado sin guía creada, manteniendo reconciliación separada de estados inciertos. Probar generación única tras corregir la causa. Fuentes: [apps/api/src/modules/shipping/shipping-guide-worker.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/shipping/shipping-guide-worker.ts:270) y [apps/api/src/modules/shipping/guide-job-state.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/modules/shipping/guide-job-state.ts:22). |
| F16 | Detrás de Caddy, login limita por la IP del proxy: Fastify no configura trustProxy. Reproducción de getter con dos IP externas distintas devolvió el mismo socket. No se probó HTTP a través de Caddy.                                                                    | Confianza restringida al proxy/red prevista y prueba de dos clientes, incluyendo rechazo de headers falsificados. Fuentes: [apps/api/src/app.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/app.ts:136) y [apps/api/src/routes/admin/auth.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/src/routes/admin/auth.ts:43).                                                                                                                                                                  |
| F17 | El harness E2E puede heredar S3/proveedores/alias de clave del entorno anfitrión, incluidas credenciales productivas si están presentes: sanitizer sólo quita NO_COLOR. El nombre `_test` no aísla un bucket externo. La auditoría actual limpió expresamente su entorno. | Allowlist E2E, almacenamiento local o bucket dedicado, claves sintéticas y exclusión de proveedores. Fuentes: [apps/admin/src/lib/sanitize-e2e-env.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/lib/sanitize-e2e-env.ts:10) y [apps/admin/playwright.config.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/playwright.config.ts:28).                                                                                                                                              |

F07 tiene evidencia HTTP/SQL además de la generación del query. F15/F16 son hallazgos del camino de código/configuración con los límites indicados; no se presentan como escenarios de proveedor/proxy ya ejecutados.

## Mejoras visuales que no requieren rehacer el sistema

- Mantener la base de componentes. Unificar verde/dorado del login con acentos moderados del panel; no es necesario convertir toda la interfaz en una página promocional.
- Mostrar nombre y último mensaje en la lista de conversaciones cuando existan, junto con hora/pendientes.
- Ofrecer un preset “sólo esta transportadora” y dejar listas de permitidas/excluidas, seguro y paquete en opciones avanzadas. La regla actual funciona, pero exige preferida + fallback + limitar lista + desmarcar cuatro opciones.
- Simplificar la navegación inicial con una entrada de Ajustes y un checklist de puesta en marcha con enlaces directos. La sidebar actual requiere scroll para alcanzar configuración.
- Ajuste de stock: precargar la cantidad vigente o dejar entrada vacía. Hoy muestra físico 4, pero inicia cantidad nueva en 0. **Sí existen nota obligatoria y confirmación**, por lo que no se afirmó un borrado de stock por un solo clic. Fuente: [apps/admin/src/catalog/StockEditor.tsx](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/admin/src/catalog/StockEditor.tsx:25).
- Mejorar microcopy: “alternativa económica” aparece incluso en una regla que detiene ante falta de Envia; explicar si se refiere al seguro o al proveedor.
- Presentar motivos de inventario y acciones de auditoría con etiquetas comerciales, conservando IDs/códigos en detalles avanzados.
- Las vistas previas de imágenes en el hilo aún dicen “Imagen adjunta no disponible”; evaluar un endpoint autenticado de medios. Las fotos del fixture son imágenes mínimas sintéticas, por lo que no se calificó la fotografía real del catálogo.
- Se observaron errores de contexto AuthProvider durante un build concurrente/HMR del entorno de desarrollo; la navegación posterior se recuperó. No se demostró un fallo equivalente en el build de producción. Un error boundary con reintento sería una mejora de resiliencia.

## Verificación automatizada de hoy

| Comprobación                                     | Resultado fresco                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Typecheck                                        | pasó                                                                                   |
| Lint estricto                                    | pasó, antes de crear los artefactos de auditoría                                       |
| Build contracts/API/admin                        | pasó                                                                                   |
| Presupuesto de bundle                            | pasó; mayor chunk 367.543 bytes, dentro del límite del repo                            |
| Unit contracts                                   | 81/81                                                                                  |
| Unit API                                         | 447/447                                                                                |
| Unit admin, corrida general                      | 100/101; falló la espera del heading de ayuda                                          |
| Repetición App.test.tsx                          | 27/27                                                                                  |
| Unit admin con maxWorkers=2                      | 101/101; confirma sensibilidad a carga, no corrige la fragilidad de la espera original |
| Login rediseñado de main, prueba dirigida        | 1/1                                                                                    |
| Integraciones completas                          | 196 pasaron, 3 fallaron; 39 archivos pasaron, 3 fallaron y 1 archivo S3 quedó omitido  |
| Repetición de las 3 suites afectadas             | 15/16; 2 archivos pasaron y 1 falló                                                    |
| PDF HTTP y autorización                          | 200 autenticado, 401 sin sesión                                                        |
| Confirmación interrumpida / recotización fallida | se reprodujeron los dos defectos con PostgreSQL y servicios reales                     |

Las siete suites antiguamente revisadas no eran toda la integración. En esta corrida:

- Dos fallos de fixtures construyen códigos con hex UUID en minúsculas, pero PostgreSQL sólo permite mayúsculas. Según el UUID, una prueba puede pasar o fallar: en la repetición pasó outbound y siguió fallando transcript. Fuentes: [apps/api/test/conversation-transcript-repository.integration.test.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/test/conversation-transcript-repository.integration.test.ts:117) y [apps/api/test/outbound-repository.integration.test.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/test/outbound-repository.integration.test.ts:113).
- La migración de anonimización excedió 5 s bajo la carga inicial y pasó en la repetición aislada. No se demostró defecto de migración por ese timeout.
- La suite de migraciones mantiene un único nombre temporal para múltiples casos y sólo limpia el último en afterAll; dejó tres bases temporales por corrida. Se inspeccionó la propiedad antes de limpiar los recursos de esta auditoría. Fuente: [apps/api/test/database-migrations.integration.test.ts](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/apps/api/test/database-migrations.integration.test.ts:66).
- S3/MinIO no estaba disponible: el contrato se omitió. No se afirmó cobertura de S3 productivo.
- No se repitieron todos los gates históricos de verify:release (cobertura/audit/scanners/smoke) para este SHA.

Logs y reproducciones: `.superpowers/audits/2026-10-06/integration.log`, `integration-recheck.log`, `seed-fixtures.log`; scripts `run-audit.mjs --reproduce` y `check-http.mjs`. Sólo contienen datos ficticios. Las claves de DB se generaron en memoria, no se imprimieron ni guardaron.

## Estándares usados como criterios, no como certificación

- [WCAG 2.2 — etiquetas e instrucciones](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html): F10 carece de etiquetas/nombres en tres entradas. Deben cerrarse también los nombres accesibles conforme a 4.1.2.
- [WCAG 2.2 — reflujo](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): las páginas medidas a 320 px conservaron ancho; faltan barrido completo de todos los estados, zoom y tecnologías de asistencia.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): se muestrearon foco, teclado, tamaños y lectura. Los controles de login cumplen las dimensiones observadas; no se hizo certificación de contraste o accesibilidad de toda la aplicación.
- [OWASP ASVS](https://owasp.org/projects/asvs) y [gestión de factores MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html): verificar cambios sensibles de autenticación, permisos en servidor, aislamiento de entornos y evidencia de controles.
- Fiabilidad funcional: reentrega e interrupciones no deben perder efectos ni dejar estados contradictorios; los eventos de compra/guía deben corresponder a hechos persistidos.
- Operabilidad: estados de salud honestos, backups restaurables, alertas que realmente llegan y recuperación desde el panel sin SQL manual.

## Plan mínimo de cierre por fases

### Fase 1 — fiabilidad y seguridad

Cerrar F01–F06 con regresiones reproducibles y revisión independiente. Añadir recuperación controlada de guía fallida (F15), sin activar reintentos ciegos de guías inciertas. Salida: ningún P1 conocido abierto y pruebas de interrupciones, quote failure, MFA activo, backup detenido/worker apagado e inventario real verdes.

### Fase 2 — experiencia operativa

Cerrar contador, búsqueda por ID, paridad del simulador, tres etiquetas, traducciones, bandeja acotada, permisos visibles y privacidad (F07–F14). Mantener el flujo normal y las guías dentro de KAIRO. Salida: una operadora completa el recorrido sin instrucciones de desarrollo, falsos “0”, controles imposibles de guardar ni búsqueda que rechace el ID que ve.

Los presets y acentos de marca son mejoras de conveniencia; priorizar los errores observados.

### Fase 3 — validación y versión única

Corregir fixtures aleatorios, esperas por carga y limpieza de bases; cerrar aislamiento E2E y proxy. Preparar una única versión que integre la rama y el login preservado. Antes del merge ejecutar checks del SHA final, todas las integraciones relevantes con MinIO de test, E2E, build y gate local de release. No crear CI GitHub: el usuario indicó que no se utiliza.

Registrar la matriz de 15 recorridos con estado, reserva, trabajos de guía y mensajes. No sustituir pruebas de fallos por el escenario normal.

### Fase 4 — piloto real y entrega

En el despliegue elegido: dominio/HTTPS y persistencia, restauración en entorno vacío y alerta fuera del servidor; conectar las cuentas activas, comprobar webhook firmado entrante y respuesta real de WhatsApp; cotizar, crear una guía de 99envíos, descargar/abrir/imprimir el PDF real y verificar la cancelación del envío de prueba acordada.

La propietaria y una operadora revisan el flujo, permisos, municipio restringido, guía y contingencias. Entregar acceso, instrucciones breves y un registro de incidencias del piloto. Salida: evidencia de operación real y recuperación, más aceptación del cliente sobre el alcance MVP.

## Qué puede quedar para después

Ads, campañas, exportaciones de marketing por consentimiento, analítica avanzada, pagos adicionales, permisos más granulares, personalización visual extensa y una librería completa de dashboards. La identidad estable y el filtro de compra ya existen; no hacen falta más módulos grandes para corregir los problemas actuales.

## Evidencia visual seleccionada

- [Login rediseñado — escritorio](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/login-desktop.jpg) y [móvil](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/login-mobile.jpg).
- [Bandeja](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/conversations-desktop.jpg) y [hilo móvil largo](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/conversation-mobile-thread.jpg).
- [Guía en conversación después del reintento](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/guide-download-result.jpg).
- [Comprador acreditado después de entregar](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/buyer-filter-mobile.jpg).
- [Regla municipal guardada](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/shipping-rule-saved-desktop.jpg).
- [Operadora: control habilitado y siguiente paso incorrecto](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/operator-shipping-denied.jpg).
- [Búsqueda del ID comercial sin resultado](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/search-order-id-not-found.jpg).
- [Privacidad con textos internos](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/privacy-desktop.jpg).
- [Historial de inventario rechazado](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/inventory-movement-contract-error.jpg).
- [Ayuda operativa existente](C:/Users/WinterOS/.codex/worktrees/kairo-whatsapp-ux/camila/.superpowers/audits/2026-10-06/help-desktop.jpg).

El informe permite comenzar correcciones concretas. No declara el producto terminado ni un GO de lanzamiento.

## Cierre del entorno de auditoría

Limpieza verificada al finalizar: se eliminaron las ocho bases temporales restantes (seis creadas por la suite de migraciones y dos bases de auditoría), después de comprobar el propietario temporal exacto y cero sesiones activas en cada una. Se retiraron los dos roles restantes. Las bases de reproducción y sus roles ya se habían eliminado al terminar cada reproducción.

Inventario final del contenedor PostgreSQL: únicamente `camila` y `postgres`, igual que antes de la auditoría. Consulta de roles `kairo_audit_1006_%`: 0. No había listeners de auditoría en 33100/35174/35175/35176. Las pestañas temporales se cerraron y el viewport se restauró. La base persistente `camila` permaneció intacta.

Los fixtures eliminados eran desechables y se pueden generar nuevamente con los scripts; no se conserva un backup de esas bases ficticias. Se mantienen las capturas, el informe y los logs. No hay una aplicación real conectada a proveedores dejada abierta por esta auditoría.
