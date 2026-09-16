# Auditoría de configuración operativa KAIRO

Fecha: 16 de septiembre de 2026. Implementación en `codex/configurable-operations`, con integración prevista en `main` después de la verificación final.

## Alcance implementado

- Editor guiado de mensajes, comandos, intentos, fotografías por página y pasos opcionales. Validación de variables por paso, recuperación de borrador, publicación y restauración versionadas. Las conversaciones existentes conservan su versión.
- Credenciales cifradas de Meta y 99envíos con borrador, prueba de conexión limitada y activación explícita. Configuración pública separada de los secretos; auditoría de cambios y revisión optimista contra sobrescrituras concurrentes.
- Catálogo versionado de departamentos y municipios. Vista previa y publicación del documento preparado de 99envíos, importación CSV/documento, exclusiones visibles y restauración sin eliminar localidades de pedidos anteriores.
- Envío decidido por la propietaria: menor costo total, preferencia obligatoria, lista permitida/excluida, fallback ordenado, seguro estándar o Plus, umbral de valor y dimensiones/contenido del paquete. Simulación mediante cotización sin crear guía.
- Seguro, transportadora, precio y paquete conservados hasta la guía. Una cotización vencida exige resumen y confirmación nuevos. La ausencia de cobertura válida detiene el bot y solicita atención.
- PDF automático deduplicado, alertas persistentes, notificaciones a la propietaria mediante plantilla aprobada y atención humana con reconocimiento entregable después de detener la automatización.
- Novedades de entrega 99envíos: sincronización, respuesta auditada y bloqueo de reintento ante un resultado incierto.
- Importación de configuración antigua a borradores, comando de verificación con PostgreSQL de pruebas y guía de operación para la propietaria.

## Hallazgos corregidos

1. Las variables de mensajes podían ser desconocidas o utilizar datos aún no recogidos. Ahora se validan por paso; nombre, talla, referencia, precio y transportadora se renderizan con los datos correspondientes.
2. La confirmación con una cotización vencida podía dejar la conversación terminada sin pedido confirmado. Ahora vuelve a cotizar y a esperar confirmación; la prueba completa comprueba cero reservas y cero guías antes de la nueva respuesta.
3. La pausa de automatización podía cancelar el reconocimiento de atención humana. Ese mensaje usa la fuente de atención de propietaria; una prueba con PostgreSQL verifica su entrega y la cancelación de los mensajes automáticos pendientes.
4. Dos importaciones o modificaciones simultáneas podían duplicar una vista previa o sobrescribir una política. Bloqueos transaccionales, revisión y respuestas de conflicto evitan ambos resultados.
5. La activación repetida podía duplicar versiones; los metadatos podían mostrar una prueba expirada. La activación es idempotente y la vigencia de la prueba se calcula antes de habilitarla.
6. La respuesta administrativa de creación municipal no coincidía con el cliente. Se conserva el contrato sin contenido y el recorrido E2E valida su persistencia.
7. Los formularios nuevos tenían botones y casillas nativas poco adecuados para celular. Se unificaron espaciado, superficies, objetivos táctiles, foco y nombres de transportadoras, conservando sus identificadores internos.
8. Las respuestas inciertas de novedades podían volver a quedar disponibles para reintento. La incertidumbre se conserva incluso después de sincronizar con el proveedor.

## Verificación

La puerta de calidad incluye formato, lint, TypeScript, pruebas unitarias, integración, E2E y build. También se verificaron instalación congelada, configuración Docker, auditoría de dependencias de producción y ausencia de errores de whitespace.

| Suite                  | Pruebas |
| ---------------------- | ------: |
| Contratos              |      68 |
| API unitarias          |     193 |
| Panel unitarias        |      49 |
| Integración PostgreSQL |     102 |
| E2E Chromium           |      22 |
| Total                  |     434 |

El recorrido de integración ejecuta conversación, selección automática, renovación de cotización vencida, confirmación, reserva, guía, PDF, alerta, despacho, movimiento de inventario, archivo de cierre Treinta y reconocimiento. Comprueba deduplicación de mensajes, PDF y cierre, y ausencia de doble descuento.

Se repitieron tres veces las suites de catálogo, trabajos de guía y venta completa: 19 pruebas aprobadas en cada ejecución, incluyendo las carreras de inicialización de stock y deduplicación de guía/PDF.

Los E2E recorren catálogo, configuración, publicaciones y regla municipal; revisan las pantallas operativas a 390 × 844, 768 × 1024, 1280 × 720 y 1440 × 900. Login también se verifica a 1915 px y con movimiento reducido. Axe comprueba ausencia de violaciones serias o críticas en las rutas cubiertas; las pruebas verifican ausencia de desplazamiento horizontal. Se revisaron capturas del editor y las reglas municipales.

Las migraciones se prueban desde una base vacía y desde `0000`, preservando catálogo y existencias y verificando reaplicación segura. Se añadieron las migraciones `0021` a `0029` sin modificar el historial anterior.

## Límites de la evidencia y puesta en marcha

- Meta y 99envíos se simulan en las pruebas de venta. No se crearon guías ni enviaron notificaciones externas durante la auditoría automatizada.
- La propietaria debe guardar, probar y activar credenciales reales desde Integraciones. La clave de cifrado del servidor permanece fuera del panel y requiere copia de seguridad junto con PostgreSQL y los archivos.
- Las notificaciones a su teléfono necesitan una plantilla de Meta aprobada con la configuración documentada. Sin ella, las alertas siguen disponibles en el panel.
- La coexistencia con WhatsApp Business móvil requiere confirmación de Meta; el panel no la presenta como verificada sin evidencia.
- El archivo preparado contiene 1.256 localidades válidas y 17 exclusiones. Publicarlo es una decisión explícita; la importación no activa datos sin revisión.
- Treinta continúa mediante archivos y aplicación manual; no se afirma integración API.
- El build pasa con un aviso de tamaño del paquete principal. Las gráficas se separan, pero aún hay oportunidad de reducir la carga inicial; el aviso no se oculta aumentando el límite.

Ver [guía operativa](../how-to/owner-operations.md) y [plan con trazabilidad](../superpowers/plans/2026-09-15-configurable-bot-integrations-localities.md).
