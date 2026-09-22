import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ConversationTranscriptRepository } from '../../modules/conversations/conversation-transcript-repository.js';
import {
  ManualMessageError,
  type ManualMessageService,
} from '../../modules/conversations/manual-message-service.js';
import type { ConversationAdminRepository } from '../../modules/conversations/postgres-conversation-admin-repository.js';
import type { ConnectionCapabilityService } from '../../modules/whatsapp/connection-capability-service.js';
import {
  decodeConversationCursor,
  encodeConversationCursor,
  type AdminAuthenticate,
} from './admin-shared.js';

export async function registerConversationsRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    conversationAdminRepository?: ConversationAdminRepository;
    conversationTranscriptRepository?: ConversationTranscriptRepository;
    manualMessageService?: ManualMessageService;
    connectionCapabilityService?: ConnectionCapabilityService;
  },
): Promise<void> {
  const {
    authenticate,
    conversationAdminRepository,
    conversationTranscriptRepository,
    manualMessageService,
  } = dependencies;
  if (conversationAdminRepository !== undefined) {
    const ConversationIdParamsSchema = z
      .object({ conversationId: z.uuid() })
      .strict();
    app.get('/conversations', async (request, reply) => {
      await authenticate(request);
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          cursor: z.string().min(1).optional(),
        })
        .strict()
        .parse(request.query);
      let after: { updatedAt: Date; id: string } | undefined;
      if (query.cursor !== undefined) {
        try {
          after = decodeConversationCursor(query.cursor);
        } catch {
          return reply.status(400).send({
            error: {
              code: 'invalid_cursor',
              message: 'Conversation cursor is invalid',
              field: 'cursor',
            },
          });
        }
      }
      const page = await conversationAdminRepository.list({
        limit: query.limit,
        ...(after === undefined ? {} : { after }),
      });
      return reply.status(200).send({
        data: {
          items: page.items,
          nextCursor:
            page.nextCursor === null
              ? null
              : encodeConversationCursor(page.nextCursor),
        },
      });
    });
    app.get('/conversations/:conversationId', async (request, reply) => {
      await authenticate(request);
      const { conversationId } = ConversationIdParamsSchema.parse(
        request.params,
      );
      const conversation =
        await conversationAdminRepository.get(conversationId);
      if (conversation === null) {
        return reply.status(404).send({
          error: {
            code: 'conversation_not_found',
            message: 'Conversation was not found',
          },
        });
      }
      return reply.status(200).send({ data: conversation });
    });
    if (conversationTranscriptRepository !== undefined) {
      app.get(
        '/conversations/:conversationId/messages',
        async (request, reply) => {
          await authenticate(request);
          const { conversationId } = ConversationIdParamsSchema.parse(
            request.params,
          );
          if (
            (await conversationAdminRepository.get(conversationId)) === null
          ) {
            return reply.status(404).send({
              error: {
                code: 'conversation_not_found',
                message: 'Conversation was not found',
              },
            });
          }
          const query = z
            .object({
              limit: z.coerce.number().int().min(1).max(100).default(50),
              cursor: z.string().min(1).optional(),
            })
            .strict()
            .parse(request.query);
          const page = await conversationTranscriptRepository.listMessages(
            conversationId,
            query.limit,
            query.cursor,
          );
          return reply.status(200).send({
            data: {
              items: page.items.map((message) => ({
                ...message,
                occurredAt: message.occurredAt.toISOString(),
              })),
              nextCursor: page.nextCursor,
            },
          });
        },
      );
    }
    if (manualMessageService !== undefined) {
      app.post(
        '/conversations/:conversationId/messages',
        async (request, reply) => {
          const user = await authenticate(request);
          const { conversationId } = ConversationIdParamsSchema.parse(
            request.params,
          );
          const body = z
            .object({
              clientRequestId: z.string().min(1).max(128),
              text: z.string().min(1).max(4096),
            })
            .strict()
            .parse(request.body);
          try {
            const result = await manualMessageService.send({
              conversationId,
              actorUserId: user.id,
              clientRequestId: body.clientRequestId,
              text: body.text,
            });
            return reply.status(202).send({ data: result });
          } catch (error) {
            if (error instanceof ManualMessageError) {
              const status =
                error.code === 'conversation_not_found'
                  ? 404
                  : error.code === 'invalid_message'
                    ? 400
                    : 409;
              return reply.status(status).send({
                error: { code: error.code, message: error.message },
              });
            }
            throw error;
          }
        },
      );
    }
    app.post(
      '/conversations/:conversationId/take-control',
      async (request, reply) => {
        await authenticate(request);
        const { conversationId } = ConversationIdParamsSchema.parse(
          request.params,
        );
        await conversationAdminRepository.takeControl(conversationId);
        const conversation =
          await conversationAdminRepository.get(conversationId);
        if (conversation === null) {
          return reply.status(404).send({
            error: {
              code: 'conversation_not_found',
              message: 'Conversation was not found',
            },
          });
        }
        return reply.status(200).send({ data: conversation });
      },
    );
    app.post(
      '/conversations/:conversationId/release-control',
      async (request, reply) => {
        await authenticate(request);
        const { conversationId } = ConversationIdParamsSchema.parse(
          request.params,
        );
        await conversationAdminRepository.releaseControl(conversationId);
        const conversation =
          await conversationAdminRepository.get(conversationId);
        if (conversation === null) {
          return reply.status(404).send({
            error: {
              code: 'conversation_not_found',
              message: 'Conversation was not found',
            },
          });
        }
        return reply.status(200).send({ data: conversation });
      },
    );
  }
}
