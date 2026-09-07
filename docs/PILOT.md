# Piloto local y despliegue

## Antes de activar producción

1. Rota el token de Meta y el App Secret que se compartieron durante las pruebas; guarda los nuevos valores solo en `.env`.
2. Crea una cuenta de integración de 99envíos y configura `NINETYNINE_ENVIOS_EMAIL` y `NINETYNINE_ENVIOS_PASSWORD` en `.env`. Los encabezados de integración son opcionales.
3. Ejecuta `pnpm db:migrate` y crea la propietaria con el comando administrativo existente.
4. Carga diez referencias de prueba, cada una con una foto JPEG/PNG, talla y stock.
5. Importa las localidades de Colombia con código DANE de ocho dígitos. Sin una localidad importada el bot no confirma un pedido.

## Prueba local de extremo a extremo

1. Inicia PostgreSQL y después la API con `pnpm dev:api`.
2. Inicia el panel con `pnpm dev:admin`.
3. Expón la API mediante un túnel HTTPS temporal y configura `/webhooks/whatsapp` en Meta.
4. Desde el número de prueba escribe: `hola`, una talla, una referencia, los datos de destino, `ninguna` y `confirmar`.
5. Comprueba en el panel que el pedido está confirmado, que el stock reservado subió una unidad y que hay una tarea de guía pendiente o creada.

## Reglas operativas

- La propietaria puede tomar una conversación; los mensajes pendientes del bot se cancelan de inmediato.
- Una confirmación repetida reserva solo una vez y crea una sola tarea de guía.
- Si 99envíos no responde después de recibir la solicitud, la tarea queda como `uncertain`. No se reintenta automáticamente: la propietaria debe comprobar en 99envíos si ya existe la guía antes de intervenir.
- Antes de pasar al número real, instala HTTPS, copias de seguridad diarias de PostgreSQL y alertas para tareas de guía `failed` o `uncertain`.
