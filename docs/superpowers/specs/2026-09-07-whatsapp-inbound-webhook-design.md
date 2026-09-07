# Diseño: recepción segura de eventos entrantes de WhatsApp

## Objetivo

Recibir de forma local los eventos de WhatsApp Cloud API, comprobar que fueron
firmados por Meta y persistir cada mensaje entrante una única vez. Este bloque
no decide respuestas, no crea pedidos y no envía mensajes salientes.

## Alcance y decisiones

- El canal es la API oficial de WhatsApp Cloud API, directamente desde Meta.
- `POST /webhooks/whatsapp` exige `X-Hub-Signature-256`, calculada sobre los
  bytes exactos del cuerpo con HMAC-SHA-256 y `WHATSAPP_APP_SECRET`.
- Una firma ausente, con formato incorrecto o distinta responde `401` y no
  escribe en la base de datos. La comparación usa tiempo constante.
- Un mensaje entrante se identifica por su `messages[].id` de WhatsApp. La
  tabla aplica unicidad para que reintentos de Meta no creen dos filas.
- El evento se almacena antes de la futura máquina de conversación. La fila
  conserva el identificador de mensaje, teléfono del cliente, número de
  teléfono empresarial, tipo, texto cuando sea un mensaje de texto y el
  payload original `jsonb` para auditoría técnica.
- Cambios que no contienen `messages[]` y mensajes propios no crean una fila;
  se reconocen con `200` para que Meta no los reintente.
- La ruta responde `200` únicamente después de que los mensajes válidos del
  lote se hayan insertado o identificado como duplicados.
- El logger no registra URL con query string, cookies, autorización, cuerpos
  de webhook ni secretos.
- La clave de verificación del `GET` permanece separada del secreto de la app.

## Enfoques considerados

### Recomendado: receptor directo, tabla de eventos y deduplicación por mensaje

Un módulo `whatsapp` separa validación criptográfica, extracción mínima del
payload y repositorio PostgreSQL. La ruta queda limitada a comprobar firma,
extraer mensajes e invocar al servicio.

Esto conserva un límite claro: la siguiente tarea podrá consumir eventos ya
persistidos sin que la red de Meta ni los reintentos modifiquen el flujo de
venta.

### Descartado: procesar el mensaje dentro del handler HTTP

Mezclar la futura conversación, lectura de catálogo y envío de fotos con la
petición de Meta haría lentos los acuses, multiplicaría efectos ante reintentos
y dificultaría intervenir manualmente.

### Descartado: aceptar cualquier POST durante pruebas

Un túnel temporal es público. Aceptar cuerpos sin firma permitiría que
cualquiera simule clientes y contamine pedidos o auditorías.

## Modelo de datos

`whatsapp_inbound_messages` contiene:

- `id uuid` como clave interna.
- `whatsapp_message_id varchar(128)` único.
- `business_phone_number_id varchar(32)`.
- `customer_phone varchar(20)` normalizado como `+` seguido de dígitos.
- `message_type varchar(32)`.
- `text_body text`, nulo para tipos no textuales.
- `received_at timestamptz`, usando la fecha del mensaje si Meta la entrega.
- `payload jsonb`, el cambio de webhook que originó el mensaje.
- `created_at timestamptz`.

El límite de tamaño actual de Fastify (1 MiB) se conserva. No se procesan
adjuntos en este bloque; un mensaje multimedia se guarda como tipo y payload,
sin descargar el archivo.

## Flujo

```text
Meta POST
  -> bytes crudos del cuerpo
  -> HMAC SHA-256 y comparación constante
  -> extraer entry[].changes[].value.messages[]
  -> INSERT ... ON CONFLICT (whatsapp_message_id) DO NOTHING
  -> HTTP 200
```

Un lote puede contener varios mensajes. Cada uno se intenta insertar de forma
independiente dentro de una transacción. Si la escritura falla, la respuesta
es `500` para que Meta pueda reintentar el lote; la constraint conserva la
idempotencia.

## Configuración y operación local

- Añadir `WHATSAPP_APP_SECRET` al `.env` local y como entrada comentada en
  `.env.example`.
- El secreto se obtiene en la configuración básica de la aplicación de Meta y
  nunca se pega en chat, se añade a Git ni se incluye en logs.
- Mantener `WHATSAPP_WEBHOOK_VERIFY_TOKEN` para la verificación `GET`.
- El túnel `trycloudflare.com` sigue siendo temporal: si se reinicia se debe
  actualizar la URL en Meta y volver a verificarla.

## Pruebas y aceptación

- Una firma válida de un mensaje de texto produce `200` y una fila persistida.
- La misma carga enviada dos veces produce `200` y conserva una sola fila.
- Firma faltante, alterada o con secreto no configurado devuelve `401` y no
  persiste nada.
- Un cambio de estado sin `messages[]` devuelve `200` y no genera filas.
- Payload inválido, incluso con firma válida, devuelve `400` sin persistir.
- El log estructurado no contiene query string, firma, secreto ni cuerpo.
- Las pruebas de integración usan PostgreSQL efímero y datos ficticios.

## Fuera de alcance

La máquina de estados de talla, envío de fotos, plantillas, ventana de 24
horas, Chatwoot, atención humana, creación de pedidos y 99envíos se
implementarán en bloques posteriores sobre estos eventos persistidos.
