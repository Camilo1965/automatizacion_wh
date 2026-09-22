import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  BotFlowDraftBodySchema,
  BotFlowSimulationBodySchema,
} from '@camila/contracts';
import type { AuditService } from '../../modules/audit/audit-service.js';
import {
  BotFlowError,
  type BotFlowService,
} from '../../modules/conversations/bot-flow-service.js';
import { simulateBotFlow } from '../../modules/conversations/bot-flow-simulator.js';
import { validateBotFlow } from '../../modules/conversations/flow-definition.js';

export function registerBotFlowRoutes(
  app: FastifyInstance,
  service: BotFlowService,
  authenticate: (
    request: FastifyRequest,
  ) => Promise<{ id?: string; username: string }>,
  auditService?: AuditService,
) {
  app.get('/bot-flow', async (request) => {
    await authenticate(request);
    return { data: await service.get() };
  });
  app.put('/bot-flow/draft', async (request, reply) => {
    const user = await authenticate(request);
    const body = BotFlowDraftBodySchema.parse(request.body);
    try {
      return {
        data: await service.save(body.revision, body.definition, user.username),
      };
    } catch (error) {
      if (error instanceof BotFlowError)
        return reply
          .code(error.status)
          .send({ error: { code: error.code, message: error.message } });
      throw error;
    }
  });
  app.post('/bot-flow/publish', async (request, reply) => {
    const user = await authenticate(request);
    const body = z
      .object({
        revision: z.number().int().nonnegative(),
        restoreVersionId: z.uuid().optional(),
      })
      .strict()
      .parse(request.body);
    try {
      const data = await service.publish(
        body.revision,
        user.username,
        body.restoreVersionId,
      );
      await auditService?.record({
        action: 'bot_flow.published',
        result: 'success',
        actorUserId: user.id ?? null,
        actorUsername: user.username,
        targetType: 'bot_flow',
        targetId: 'sales',
        correlationId: request.id,
        metadata: {
          revision: body.revision,
          ...(body.restoreVersionId === undefined
            ? {}
            : { restoreVersionId: body.restoreVersionId }),
        },
      });
      return { data };
    } catch (error) {
      if (error instanceof BotFlowError) {
        await auditService?.record({
          action: 'bot_flow.published',
          result: 'failure',
          actorUserId: user.id ?? null,
          actorUsername: user.username,
          targetType: 'bot_flow',
          targetId: 'sales',
          correlationId: request.id,
          metadata: { errorCode: error.code, revision: body.revision },
        });
        return reply
          .code(error.status)
          .send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });
  app.post('/bot-flow/simulate', async (request, reply) => {
    await authenticate(request);
    const body = BotFlowSimulationBodySchema.parse(request.body);
    const issues = validateBotFlow(body.definition);
    if (issues.length > 0)
      return reply.code(400).send({
        error: {
          code: 'invalid_flow',
          message: issues.map((issue) => issue.message).join(' '),
        },
      });
    return {
      data: simulateBotFlow(body.definition, body.messages, body.scenario),
    };
  });
}
