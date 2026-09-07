import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import { extractInboundWhatsAppMessages } from '../modules/whatsapp/whatsapp-event.js';
import type { WhatsAppInboundRepository } from '../modules/whatsapp/whatsapp-inbound-repository.js';
import { verifyWhatsAppSignature } from '../modules/whatsapp/whatsapp-signature.js';

const verificationQuerySchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string().min(1),
});

export type WhatsAppRoutesDependencies = Readonly<{
  config: AppConfig;
  inboundRepository?: WhatsAppInboundRepository;
  inboundProcessor?: Readonly<{
    process(input: {
      whatsappMessageId: string;
      customerPhone: string;
      text: string;
    }): Promise<void>;
  }>;
}>;

export const whatsappRoutes: FastifyPluginAsync<
  WhatsAppRoutesDependencies
> = async (app, { config, inboundRepository, inboundProcessor }) => {
  app.get('/webhooks/whatsapp', async (request, reply) => {
    if (config.whatsappWebhookVerifyToken === undefined) {
      return reply.status(404).send({ error: 'not_configured' });
    }
    const query = verificationQuerySchema.safeParse(request.query);
    if (
      !query.success ||
      query.data['hub.verify_token'] !== config.whatsappWebhookVerifyToken
    ) {
      return reply.status(403).send({ error: 'verification_failed' });
    }
    return reply.type('text/plain').send(query.data['hub.challenge']);
  });

  app.post(
    '/webhooks/whatsapp',
    { config: { rawBody: true } },
    async (request, reply) => {
      const rawBody = request.rawBody;
      const signature = request.headers['x-hub-signature-256'];
      if (
        !Buffer.isBuffer(rawBody) ||
        typeof signature !== 'string' ||
        !verifyWhatsAppSignature(rawBody, signature, config.whatsappAppSecret)
      ) {
        return reply.status(401).send();
      }
      const parsed = extractInboundWhatsAppMessages(request.body);
      if (!parsed.ok) return reply.status(400).send();
      if (parsed.messages.length > 0) {
        if (inboundRepository === undefined) return reply.status(503).send();
        await inboundRepository.storeMany(parsed.messages);
        if (inboundProcessor !== undefined) {
          for (const message of parsed.messages) {
            if (message.messageType === 'text' && message.textBody !== null) {
              await inboundProcessor.process({
                whatsappMessageId: message.whatsappMessageId,
                customerPhone: message.customerPhone,
                text: message.textBody,
              });
            }
          }
        }
      }
      return reply.status(200).send();
    },
  );
};
