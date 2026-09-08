# Cierre técnico local de la fase 5

Fecha: 2026-09-07.

El sistema local cotiza el envío después de completar el destino, guarda todas las alternativas por versión del borrador y selecciona una transportadora con este orden: regla exacta del municipio, Envia si está disponible y menor costo total como último criterio. El resumen conserva flete, recaudo, recargo, transportadora, vencimiento y total contra entrega.

La confirmación vuelve a validar la cotización bajo bloqueo de base de datos. Una cotización cambiada o vencida no reserva inventario. La misma transacción que confirma y reserva crea un único trabajo persistente de guía asociado a la cotización.

El worker distingue fallos anteriores al envío de resultados inciertos posteriores al envío. Los inciertos no se reintentan automáticamente. La propietaria puede registrar el número que verificó directamente en 99envíos. El PDF se solicita únicamente para una guía creada, se valida, se escribe de forma atómica con un nombre generado y se sirve desde una ruta autenticada con caché privada y ETag.

La autenticación y cotización externas se validaron con una cuenta autorizada y datos controlados: login HTTP 200 y cotización HTTP 200. La cuenta devolvió cuatro transportadoras utilizables y rechazó Interrapidísimo porque no tiene código asociado. El 2026-09-08 se completó una guía TCC contraentrega y se verificó visualmente su PDF real. La auditoría corrigió el total enviado a `valorDeclarado`, normalizó el identificador numérico de la respuesta y añadió soporte seguro para las URLs de PDF que devuelve el proveedor.
