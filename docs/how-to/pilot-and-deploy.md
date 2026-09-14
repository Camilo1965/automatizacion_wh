# How-to: piloto local y despliegue

Checklist operativa antes de tráfico real. Basada en la práctica del piloto del proyecto.

## Antes de producción

1. Rota el token de Meta y el App Secret usados en pruebas. Guarda los nuevos valores solo en `.env` / secret manager.
2. Configura cuenta de integración 99envíos: `NINETYNINE_ENVIOS_EMAIL` y `NINETYNINE_ENVIOS_PASSWORD`. Los encabezados de integración son opcionales.
3. Ejecuta `pnpm db:migrate` y crea la propietaria con `pnpm admin:create`.
4. Carga al menos diez referencias de prueba, cada una con foto JPEG/PNG, talla y stock.
5. Importa localidades de Colombia (código DANE). Sin localidad importada el bot no confirma el pedido.

## Prueba de extremo a extremo

1. Inicia PostgreSQL y después:

   ```bash
   pnpm --filter @camila/api dev
   pnpm --filter @camila/admin dev
   ```

   O `pnpm dev` desde la raíz.

2. Expón la API con un túnel HTTPS temporal y configura `/webhooks/whatsapp` en Meta.
3. Desde el número de prueba: `hola` → talla → referencia → datos de destino → `ninguna` (o seguro) → `confirmar`.
4. Verifica en WhatsApp: transportadora, valor de envío y total contra entrega antes de confirmar.
5. En el panel: pedido confirmado, stock reservado +1, una sola tarea de guía pendiente o creada.
6. Cuando el estado sea `created`, descarga el PDF y revisa destinatario, recaudo y transportadora.

## Reglas operativas

- Si la propietaria toma la conversación, los mensajes pendientes del bot se cancelan de inmediato.
- Una confirmación repetida reserva una sola vez y crea una sola tarea de guía.
- Si 99envíos no responde después de recibir la solicitud, la tarea queda `uncertain`. No hay reintento automático: verificar en 99envíos antes de intervenir.
- Si la guía incierta sí existe, registra en el panel el número verificado. Eso permite recuperar el PDF y no reencola la creación.
- Antes del número real: HTTPS, backups diarios de PostgreSQL y alertas para guías `failed` o `uncertain`.

## Autenticación 99envíos (referencia)

El servidor hace `POST /api/integration/v1/login` con email/password, recibe un JWT y lo usa como `Authorization: Bearer <token>`. Los headers de integración no sustituyen el JWT.
