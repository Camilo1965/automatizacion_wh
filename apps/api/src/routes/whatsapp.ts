import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../config.js';

const verificationQuerySchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string().min(1),
});

export type WhatsAppRoutesDependencies = Readonly<{ config: AppConfig }>;

export const whatsappRoutes: FastifyPluginAsync<
  WhatsAppRoutesDependencies
> = async (app, { config }) => {
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

  app.post('/webhooks/whatsapp', async (_request, reply) => {
    // Message persistence and flow orchestration are added in the next block.
    return reply.status(200).send();
  });
};
