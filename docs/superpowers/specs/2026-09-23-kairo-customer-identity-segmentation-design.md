# KAIRO: identidad e historial de clientes para el MVP

**Estado:** diseño aprobado por la propietaria el 2026-09-23. Pendiente de revisión de este documento antes del plan de implementación.

## Objetivo y alcance

Dar a cada cliente un identificador interno estable que relacione sus conversaciones y pedidos, permita consultar su historial y filtrar compradores de personas sin compra acreditada. La preparación para Ads consiste en conservar una segmentación confiable y el estado de autorización de marketing; el MVP no sincroniza, exporta ni envía datos personales a plataformas publicitarias.

La propietaria definió comprador como quien tiene una compra **pagada o entregada**, no simplemente un pedido confirmado. El sistema actual sí registra `delivered`, pero no acredita pagos por separado. Por ello, el primer corte puede clasificar entregas no devueltas; una rama `paid` solo se habilita cuando exista un registro auditable de pago y, si corresponde, reverso. No se infiere pago de `confirmed`, `dispatched`, una guía creada ni de una cotización contraentrega.

## Decisión de diseño

Se evaluaron tres enfoques: tratar el teléfono como ID del cliente (mínimo cambio, pero el teléfono puede cambiar o ser compartido), guardar manualmente una etiqueta `comprador` (se desactualiza respecto de pedidos y devoluciones) y crear un perfil con UUID, relaciones explícitas y segmentos calculados. Se elige el tercero. El perfil representa inicialmente un **contacto comercial**, no una identidad civil verificada: un número compartido puede agrupar interacciones de más de una persona. El número normalizado sirve para conciliar el contacto, pero no es su clave primaria ni justifica fusionar perfiles distintos sin revisión.

## Modelo y vinculación

1. Crear `customers` con UUID, nombre de presentación opcional, teléfono colombiano normalizado cuando exista, fechas y estado de marketing `unknown | granted | denied`. `granted` requiere evidencia trazable de fecha, canal, texto/finalidad aceptada y versión de aviso; `denied` y revocación excluyen al cliente de cualquier audiencia. Los datos de consentimiento no se rellenan retrospectivamente por haber conversado o comprado.
2. Añadir `customer_id` a conversaciones y pedidos. Al primer contacto de WhatsApp se crea o vincula un perfil de contacto por teléfono normalizado. Los pedidos nacidos del bot reciben el mismo `customer_id`; los creados en el panel se vinculan al perfil de contacto correcto cuando se captura el teléfono. Si nombres diferentes comparten teléfono, el perfil se marca para revisión y se excluye de futuras audiencias hasta resolver la ambigüedad. Un cambio de teléfono de un pedido no fusiona ni reasigna silenciosamente la identidad histórica.
3. Migrar datos existentes por lotes e idempotentemente. Vincular solo números válidos y no ambiguos; las filas sin teléfono o con colisiones dudosas quedan para revisión visible, sin crear fusiones irreversibles. Mantener compatibilidad de lecturas/escrituras durante la migración y verificar conteos antes y después.
4. Calcular el segmento desde hechos de negocio: `buyer` si hay al menos un pedido `delivered` no `returned`, o un pago acreditado no revertido cuando ese registro exista; `not_yet_buyer` si no existe tal evidencia. Una cancelación, devolución o reembolso debe recomputar el segmento. El segmento no es un booleano editable.
5. Exponer una ficha de cliente para operador/propietaria con ID, contacto, conversaciones y pedidos enlazados, última actividad y segmento. Añadir filtros `Todos`, `Compradores` y `Sin compra acreditada`, búsqueda por nombre o teléfono y estados vacíos claros. Desde la conversación se puede abrir la ficha; desde la ficha se puede volver al pedido o conversación, sin mostrar más PII de la necesaria.

## Privacidad y Ads

El estado de compra y la autorización de marketing son conceptos independientes. El MVP no incluye botón de exportación ni integración con Meta Ads. La futura audiencia solo podría incluir perfiles con autorización aplicable y no revocada; antes de construirla habrá que validar texto de consentimiento, finalidad, retención, mecanismo de revocación, controles de acceso y aprobación de la propietaria. Las [condiciones de Meta para audiencias de lista](https://www.facebook.com/legal/terms/customaudience/update) requieren derechos y permisos para usar los datos; la [SIC colombiana](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/derecho-la-tranquilidad-y-supresion-de-datos-personales) exige sustento para el contacto publicitario y respeto a la revocación. Ni el hash del teléfono ni una venta sustituyen esa autorización.

## Pruebas y aceptación

- Migración: mismo número válido no duplica perfil, número inválido o ambiguo no fusiona clientes, reejecución segura, relaciones de pedidos y conversaciones consistentes.
- Segmentos: `draft`, `confirmed` y `dispatched` no clasifican como comprador; `delivered` sí; `returned` revierte la clasificación si no existe otra compra válida. La ruta de pago permanece inactiva mientras no exista evidencia de pago.
- API/UI: acceso autenticado y por rol, paginación y filtros correctos, historial completo de varios pedidos, búsqueda sin filtración accidental de PII, estados vacíos y navegación móvil.
- Marketing: `unknown` por defecto, ningún envío o exportación de PII, revocación registrada y auditable cuando se habilite la captura de autorización.
- Verificación local completa y revisión de una muestra anonimizada de conciliación antes de considerar los datos aptos para operar.

## No objetivos

No crear campañas, audiencias automáticas, envíos promocionales, enriquecimiento de perfiles ni un CRM general. No marcar como pagado un pedido sin fuente verificable. No prometer que una persona sin compra acreditada nunca haya comprado fuera de KAIRO.
