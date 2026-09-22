import type { FastifyInstance } from 'fastify';
import { IntegrationSettingsUpdateSchema } from '@camila/contracts';
import { z } from 'zod';

import type { AlertService } from '../../modules/alerts/alert-service.js';
import type { BotFlowService } from '../../modules/conversations/bot-flow-service.js';
import type { IntegrationHealthService } from '../../modules/integrations/integration-health-service.js';
import {
  IntegrationSettingsError,
  type IntegrationSettingsOperations,
} from '../../modules/integrations/integration-settings-service.js';
import type { ConnectionCapabilityService } from '../../modules/whatsapp/connection-capability-service.js';
import type { AdminAuthenticate } from './admin-shared.js';
import { registerBotFlowRoutes } from './bot-flow.js';

export async function registerIntegrationsRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    botFlowService?: BotFlowService;
    integrationSettingsService?: IntegrationSettingsOperations;
    integrationHealthService?: IntegrationHealthService;
    connectionCapabilityService?: ConnectionCapabilityService;
    alertService?: AlertService;
  },
): Promise<void> {
  const { authenticate, integrationHealthService } = dependencies;
  if (dependencies.botFlowService !== undefined) {
    app.get('/configuration/audit', async (request) => {
      await authenticate(request);
      return { data: { items: await dependencies.botFlowService!.audit() } };
    });
    registerBotFlowRoutes(app, dependencies.botFlowService, (request) =>
      authenticate(request),
    );
  }
  if (dependencies.integrationSettingsService !== undefined) {
    const lifecycleService = dependencies.integrationSettingsService;
    if (
      lifecycleService.lifecycle &&
      lifecycleService.test &&
      lifecycleService.activate
    ) {
      app.get('/integrations/lifecycle', async (request) => {
        await authenticate(request);
        return { data: await lifecycleService.lifecycle!() };
      });
      app.post('/integrations/:provider/test', async (request, reply) => {
        await authenticate(request);
        const { provider } = z
          .object({ provider: z.enum(['whatsapp', 'shipping']) })
          .parse(request.params);
        try {
          return { data: await lifecycleService.test!(provider) };
        } catch {
          return reply.code(400).send({
            error: {
              code: 'connection_test_failed',
              message:
                'No se pudo validar el borrador. Revisa las credenciales y vuelve a probar. No se enviaron mensajes ni se crearon guías.',
            },
          });
        }
      });
      app.post('/integrations/:provider/activate', async (request, reply) => {
        const user = await authenticate(request);
        const { provider } = z
          .object({ provider: z.enum(['whatsapp', 'shipping']) })
          .parse(request.params);
        const { revision } = z
          .object({ revision: z.number().int().positive() })
          .strict()
          .parse(request.body);
        try {
          return {
            data: await lifecycleService.activate!(
              provider,
              revision,
              user.username,
            ),
          };
        } catch {
          return reply.code(409).send({
            error: {
              code: 'activation_rejected',
              message:
                'El borrador cambió o su prueba venció. Vuelve a probar antes de activar.',
            },
          });
        }
      });
    }
    app.get('/integrations/settings', async (request, reply) => {
      await authenticate(request);
      return reply.status(200).send({
        data: await dependencies.integrationSettingsService!.getPublic(),
      });
    });
    app.patch('/integrations/settings', async (request, reply) => {
      const user = await authenticate(request);
      try {
        await dependencies.integrationSettingsService!.update(
          IntegrationSettingsUpdateSchema.parse(request.body),
          user.username,
        );
      } catch (error) {
        if (error instanceof IntegrationSettingsError) {
          return reply.status(400).send({
            error: {
              code: 'invalid_integration_settings',
              message: error.message,
            },
          });
        }
        throw error;
      }
      return reply.status(200).send({
        data: await dependencies.integrationSettingsService!.getPublic(),
      });
    });
  }

  if (dependencies.connectionCapabilityService !== undefined) {
    app.get('/whatsapp/connection', async (request, reply) => {
      await authenticate(request);
      const saved =
        await dependencies.integrationSettingsService?.getWhatsApp?.();
      const connection =
        dependencies.connectionCapabilityService!.getConnection();
      return reply.status(200).send({
        data: saved
          ? {
              ...connection,
              phoneNumberId: saved.phoneNumberId,
              wabaId: saved.wabaId ?? connection.wabaId,
              webhookConfigured: Boolean(
                saved.appSecret && saved.webhookVerifyToken,
              ),
            }
          : connection,
      });
    });
  }

  if (dependencies.alertService !== undefined) {
    app.post('/alerts/:id/resolve', async (request, reply) => {
      await authenticate(request);
      const id = z.uuid().parse((request.params as { id: string }).id);
      const data = await dependencies.alertService!.resolve(id);
      return data
        ? reply.status(200).send({ data })
        : reply.status(404).send({
            error: { code: 'not_found', message: 'La alerta no existe.' },
          });
    });
    app.get('/alerts', async (request, reply) => {
      await authenticate(request);
      return reply.status(200).send({
        data: {
          items: await dependencies.alertService!.list(),
          nextCursor: null,
        },
      });
    });
    app.post('/alerts/:id/read', async (request, reply) => {
      await authenticate(request);
      const id = z.uuid().parse((request.params as { id: string }).id);
      const data = await dependencies.alertService!.markRead(id);
      return data
        ? reply.status(200).send({ data })
        : reply.status(404).send({
            error: { code: 'not_found', message: 'La alerta no existe.' },
          });
    });
  }

  if (integrationHealthService !== undefined) {
    app.get('/integrations/health', async (request, reply) => {
      await authenticate(request);
      return reply
        .status(200)
        .send({ data: await integrationHealthService.check() });
    });
  }
}
