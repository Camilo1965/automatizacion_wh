import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CreateReferenceBodySchema,
  decodeMovementCursor,
  encodeMovementCursor,
  ListMovementsQuerySchema,
  ListReferencesQuerySchema,
  LoginBodySchema,
  PatchReferenceBodySchema,
  SetStockBodySchema,
  CreateOrderBodySchema,
  PatchOrderBodySchema,
  ConfirmOrderBodySchema,
  CarrierRuleBodySchema,
  ShippingPolicySchema,
  ShippingRuleBodySchema,
  ShippingPolicyPreviewBodySchema,
} from '@camila/contracts';

import type { AppConfig } from '../../config.js';
import {
  toPublicMovement,
  toPublicReference,
  toPublicReferenceDetail,
  toPublicReferenceSummary,
  toPublicStockRecord,
  toPublicOrder,
  toPublicOrderSummary,
} from '../../http/admin-mappers.js';
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
} from '../../http/session-cookie.js';
import type { AdminUserPublic } from '../../modules/auth/admin-auth-repository.js';
import type { AuthService } from '../../modules/auth/auth-service.js';
import {
  CatalogNotFoundError,
  PhotoValidationError,
} from '../../modules/catalog/catalog-errors.js';
import type { CatalogService } from '../../modules/catalog/catalog-service.js';
import type { CatalogImportService } from '../../modules/catalog/catalog-import-service.js';
import { CatalogImportValidationError } from '../../modules/catalog/catalog-errors.js';
import type { LocalityService } from '../../modules/localities/locality-service.js';
import type { PhotoStorage } from '../../modules/catalog/photo-storage.js';
import type { OrderService } from '../../modules/orders/order-service.js';
import type { ConversationAdminRepository } from '../../modules/conversations/postgres-conversation-admin-repository.js';
import type { ConversationTranscriptRepository } from '../../modules/conversations/conversation-transcript-repository.js';
import {
  ManualMessageError,
  type ManualMessageService,
} from '../../modules/conversations/manual-message-service.js';
import type { ShippingQuoteOperations } from '../../modules/shipping/shipping-quote-service.js';
import type { ShippingGuideOperations } from '../../modules/shipping/shipping-guide-service.js';
import type { DashboardService } from '../../modules/dashboard/dashboard-service.js';
import { registerDashboardRoute } from './dashboard.js';
import { CARRIER_CATALOG } from '../../modules/shipping/carrier-catalog.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: AdminUserPublic;
  }
}

const ReferenceIdParamsSchema = z
  .object({
    referenceId: z.uuid(),
  })
  .strict();

const StockParamsSchema = z
  .object({
    referenceId: z.uuid(),
    size: z.string().min(1),
  })
  .strict();

const OrderIdParamsSchema = z.object({ orderId: z.uuid() }).strict();

async function requireAdminSession(
  request: FastifyRequest,
  authService: AuthService,
): Promise<AdminUserPublic> {
  const token = request.cookies[ADMIN_SESSION_COOKIE];
  const user = await authService.getSession(token);
  request.adminUser = user;
  return user;
}

function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(
    ADMIN_SESSION_COOKIE,
    adminSessionCookieOptions(config.nodeEnv),
  );
}

export type AdminRoutesDependencies = Readonly<{
  config: AppConfig;
  authService: AuthService;
  catalogService: CatalogService;
  catalogImportService?: CatalogImportService;
  localityService?: LocalityService;
  photoStorage: PhotoStorage;
  orderService?: OrderService;
  conversationAdminRepository?: ConversationAdminRepository;
  conversationTranscriptRepository?: ConversationTranscriptRepository;
  manualMessageService?: ManualMessageService;
  shippingQuoteService?: ShippingQuoteOperations;
  shippingGuideService?: ShippingGuideOperations;
  dashboardService?: DashboardService;
}>;

export const adminRoutes: FastifyPluginAsync<AdminRoutesDependencies> = async (
  app,
  dependencies,
) => {
  const {
    config,
    authService,
    catalogService,
    photoStorage,
    catalogImportService,
    localityService,
    orderService,
    conversationAdminRepository,
    conversationTranscriptRepository,
    manualMessageService,
    shippingQuoteService,
    shippingGuideService,
    dashboardService,
  } = dependencies;

  if (dashboardService !== undefined) {
    await registerDashboardRoute(app, {
      dashboardService,
      authenticate: (request) => requireAdminSession(request, authService),
    });
  }

  if (shippingGuideService !== undefined) {
    const ReviewGuideBodySchema = z
      .object({ preShipmentNumber: z.string().trim().min(1).max(64) })
      .strict();
    app.get('/orders/:orderId/shipping-guide/pdf', async (request, reply) => {
      await requireAdminSession(request, authService);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      const pdf = await shippingGuideService.fetchPdf(orderId);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Cache-Control', 'private, no-store');
      if (pdf.sha256 !== null) reply.header('ETag', `"${pdf.sha256}"`);
      return reply.status(200).send(Buffer.from(pdf.bytes));
    });
    app.post(
      '/orders/:orderId/shipping-guide/review',
      async (request, reply) => {
        await requireAdminSession(request, authService);
        const { orderId } = OrderIdParamsSchema.parse(request.params);
        const body = ReviewGuideBodySchema.parse(request.body);
        await shippingGuideService.reviewUncertain(
          orderId,
          body.preShipmentNumber,
        );
        return reply.status(204).send();
      },
    );
  } else {
    const unavailable = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      await requireAdminSession(request, authService);
      return reply.status(503).send({
        error: {
          code: 'shipping_not_configured',
          message: 'Shipping provider credentials are not configured',
        },
      });
    };
    app.get('/orders/:orderId/shipping-guide/pdf', unavailable);
    app.post('/orders/:orderId/shipping-guide/review', unavailable);
  }

  const publicShipping = (
    state: Awaited<ReturnType<ShippingQuoteOperations['getShipping']>>,
  ) => ({
    quotes: state.quotes.map((quote) => ({
      id: quote.id,
      carrier: quote.carrier,
      serviceId: quote.serviceId,
      freightCop: quote.freightCop,
      cashOnDeliveryCop: quote.cashOnDeliveryCop,
      surchargeCop: quote.surchargeCop,
      insuranceMode: quote.insuranceMode,
      insuranceCop: quote.insuranceCop,
      totalShippingCop:
        quote.freightCop +
        quote.cashOnDeliveryCop +
        quote.surchargeCop +
        quote.insuranceCop,
      estimatedDays: quote.estimatedDays,
      quotedAt: quote.quotedAt.toISOString(),
      expiresAt: quote.expiresAt.toISOString(),
      recommended: quote.recommended,
      selected: quote.selected,
    })),
    guide:
      state.guide === null
        ? null
        : { ...state.guide, updatedAt: state.guide.updatedAt.toISOString() },
  });

  if (shippingQuoteService !== undefined) {
    const ShippingQuoteParamsSchema = z
      .object({ orderId: z.uuid(), quoteId: z.uuid() })
      .strict();
    app.get('/orders/:orderId/shipping', async (request, reply) => {
      await requireAdminSession(request, authService);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      return reply.status(200).send({
        data: publicShipping(await shippingQuoteService.getShipping(orderId)),
      });
    });
    app.post('/orders/:orderId/shipping-quotes', async (request, reply) => {
      await requireAdminSession(request, authService);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      await shippingQuoteService.createQuotes(orderId);
      return reply.status(201).send({
        data: publicShipping(await shippingQuoteService.getShipping(orderId)),
      });
    });
    app.post(
      '/orders/:orderId/shipping-quotes/:quoteId/select',
      async (request, reply) => {
        await requireAdminSession(request, authService);
        const { orderId, quoteId } = ShippingQuoteParamsSchema.parse(
          request.params,
        );
        await shippingQuoteService.selectQuote(orderId, quoteId);
        return reply.status(200).send({
          data: publicShipping(await shippingQuoteService.getShipping(orderId)),
        });
      },
    );
    app.put('/shipping/carrier-rules', async (request, reply) => {
      await requireAdminSession(request, authService);
      const body = CarrierRuleBodySchema.parse(request.body);
      await shippingQuoteService.setCarrierRule(
        body.localityCarrierCode,
        body.carrier,
      );
      return reply.status(204).send();
    });
    app.get('/shipping/preferences', async (request, reply) => {
      await requireAdminSession(request, authService);
      return reply.status(200).send({
        data: await shippingQuoteService.getDefaultPolicy(),
      });
    });
    app.patch('/shipping/preferences', async (request, reply) => {
      await requireAdminSession(request, authService);
      const policy = ShippingPolicySchema.parse(request.body);
      await shippingQuoteService.setDefaultPolicy(policy);
      return reply.status(200).send({ data: policy });
    });
    app.get('/shipping/rules', async (request, reply) => {
      await requireAdminSession(request, authService);
      const items = await shippingQuoteService.listShippingRules();
      return reply.status(200).send({
        data: {
          items: items.map((item) => ({
            ...item,
            updatedAt: item.updatedAt.toISOString(),
          })),
        },
      });
    });
    app.get('/shipping/carriers', async (request, reply) => {
      await requireAdminSession(request, authService);
      return reply.status(200).send({
        data: { items: CARRIER_CATALOG.map((carrier) => carrier.id) },
      });
    });
    app.post('/shipping/rules', async (request, reply) => {
      await requireAdminSession(request, authService);
      const body = ShippingRuleBodySchema.parse(request.body);
      const { localityCarrierCode, ...policy } = body;
      await shippingQuoteService.setShippingPolicy(localityCarrierCode, policy);
      return reply.status(201).send();
    });
    app.post('/shipping/rules/preview', async (request, reply) => {
      await requireAdminSession(request, authService);
      const body = ShippingPolicyPreviewBodySchema.parse(request.body);
      return reply.status(200).send({
        data: await shippingQuoteService.previewPolicy(
          body.localityCarrierCode,
        ),
      });
    });
    app.patch('/shipping/rules/:localityCode', async (request, reply) => {
      await requireAdminSession(request, authService);
      const { localityCode } = z
        .object({ localityCode: z.string().regex(/^\d{8}$/) })
        .strict()
        .parse(request.params);
      const policy = ShippingPolicySchema.parse(request.body);
      await shippingQuoteService.setShippingPolicy(localityCode, policy);
      return reply.status(204).send();
    });
    app.post(
      '/shipping/rules/:localityCode/deactivate',
      async (request, reply) => {
        await requireAdminSession(request, authService);
        const { localityCode } = z
          .object({ localityCode: z.string().regex(/^\d{8}$/) })
          .strict()
          .parse(request.params);
        await shippingQuoteService.deactivateShippingRule(localityCode);
        return reply.status(204).send();
      },
    );
  } else {
    const unavailable = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      await requireAdminSession(request, authService);
      return reply.status(503).send({
        error: {
          code: 'shipping_not_configured',
          message: 'Shipping provider credentials are not configured',
        },
      });
    };
    app.get('/orders/:orderId/shipping', unavailable);
    app.post('/orders/:orderId/shipping-quotes', unavailable);
    app.post('/orders/:orderId/shipping-quotes/:quoteId/select', unavailable);
    app.put('/shipping/carrier-rules', unavailable);
    app.get('/shipping/preferences', unavailable);
    app.patch('/shipping/preferences', unavailable);
    app.get('/shipping/rules', unavailable);
    app.get('/shipping/carriers', unavailable);
    app.post('/shipping/rules', unavailable);
    app.post('/shipping/rules/preview', unavailable);
    app.patch('/shipping/rules/:localityCode', unavailable);
    app.post('/shipping/rules/:localityCode/deactivate', unavailable);
  }

  if (conversationAdminRepository !== undefined) {
    const ConversationIdParamsSchema = z
      .object({ conversationId: z.uuid() })
      .strict();
    app.get('/conversations', async (request, reply) => {
      await requireAdminSession(request, authService);
      const query = z
        .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
        .strict()
        .parse(request.query);
      return reply.status(200).send({
        data: { items: await conversationAdminRepository.list(query.limit) },
      });
    });
    app.get('/conversations/:conversationId', async (request, reply) => {
      await requireAdminSession(request, authService);
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
          await requireAdminSession(request, authService);
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
          const user = await requireAdminSession(request, authService);
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
        await requireAdminSession(request, authService);
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
        await requireAdminSession(request, authService);
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

  if (localityService !== undefined) {
    app.get('/localities', async (request, reply) => {
      await requireAdminSession(request, authService);
      const query = z
        .object({
          query: z.string().trim().min(1).max(120).optional(),
          department: z.string().trim().min(1).max(100).optional(),
          afterCode: z.string().min(1).max(32).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        })
        .strict()
        .parse(request.query);
      const page = await localityService.list({
        limit: query.limit,
        ...(query.query === undefined ? {} : { query: query.query }),
        ...(query.department === undefined
          ? {}
          : { department: query.department }),
        ...(query.afterCode === undefined
          ? {}
          : { afterCode: query.afterCode }),
      });
      return reply.status(200).send({ data: page });
    });
  }

  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          keyGenerator(request) {
            const testClient = request.headers['x-camila-test-client'];
            return config.nodeEnv === 'test' && typeof testClient === 'string'
              ? testClient
              : request.ip;
          },
        },
      },
    },
    async (request, reply) => {
      const body = LoginBodySchema.parse(request.body);
      const result = await authService.login(body.username, body.password);
      reply.setCookie(
        ADMIN_SESSION_COOKIE,
        result.token,
        adminSessionCookieOptions(config.nodeEnv),
      );
      return reply.status(200).send({
        data: {
          user: result.user,
        },
      });
    },
  );

  app.get('/auth/session', async (request, reply) => {
    const user = await requireAdminSession(request, authService);
    return reply.status(200).send({
      data: { user },
    });
  });

  app.post('/auth/logout', async (request, reply) => {
    await requireAdminSession(request, authService);
    const token = request.cookies[ADMIN_SESSION_COOKIE];
    await authService.logout(token);
    clearSessionCookie(reply, config);
    return reply.status(204).send();
  });

  app.get('/references', async (request, reply) => {
    await requireAdminSession(request, authService);
    const query = ListReferencesQuerySchema.parse(request.query);
    const page = await catalogService.listAdminReferences({
      status: query.status,
      limit: query.limit,
      ...(query.query === undefined ? {} : { query: query.query }),
      ...(query.afterCode === undefined ? {} : { afterCode: query.afterCode }),
    });

    return reply.status(200).send({
      data: {
        items: page.items.map(toPublicReferenceSummary),
        nextAfterCode: page.nextAfterCode,
      },
    });
  });

  app.get('/catalog-readiness', async (request, reply) => {
    await requireAdminSession(request, authService);
    return reply
      .status(200)
      .send({ data: await catalogService.getReadiness() });
  });

  if (catalogImportService !== undefined) {
    app.get('/catalog-import-template', async (request, reply) => {
      await requireAdminSession(request, authService);
      const template = [
        'reference_code,model_name,color,price_cop,size,physical_quantity',
        '01,Tenis urbano,Negro,120000,37,2',
        '01,Tenis urbano,Negro,120000,37.5,1',
      ].join('\n');
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header(
          'Content-Disposition',
          'attachment; filename="plantilla-catalogo.csv"',
        )
        .send(template);
    });

    app.post('/catalog-imports/preview', async (request, reply) => {
      await requireAdminSession(request, authService);
      if (!request.isMultipart()) {
        throw new CatalogImportValidationError(
          'multipart_required',
          'La importación requiere un archivo CSV multipart',
        );
      }
      const part = await request.file();
      if (part === undefined || part.fieldname !== 'file') {
        throw new CatalogImportValidationError(
          'missing_file',
          'Debe enviar un único archivo en el campo file',
        );
      }
      const preview = await catalogImportService.preview(
        new Uint8Array(await part.toBuffer()),
      );
      return reply.status(201).send({
        data: {
          id: preview.id,
          status: preview.status,
          references: preview.references,
          errors: preview.errors,
          createdAt: preview.createdAt.toISOString(),
        },
      });
    });

    app.post('/catalog-imports/:importId/commit', async (request, reply) => {
      await requireAdminSession(request, authService);
      const params = z
        .object({ importId: z.uuid() })
        .strict()
        .parse(request.params);
      const committed = await catalogImportService.confirm(params.importId);
      return reply.status(200).send({
        data: {
          id: committed.id,
          status: committed.status,
          references: committed.references,
          errors: committed.errors,
          createdAt: committed.createdAt.toISOString(),
        },
      });
    });
  }

  app.post('/references', async (request, reply) => {
    await requireAdminSession(request, authService);
    const body = CreateReferenceBodySchema.parse(request.body);
    const reference = await catalogService.createReference(body);
    return reply.status(201).send({
      data: toPublicReference(reference),
    });
  });

  app.get('/references/:referenceId', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const detail = await catalogService.getAdminReference(params.referenceId);
    return reply.status(200).send({
      data: toPublicReferenceDetail(detail),
    });
  });

  app.patch('/references/:referenceId', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const body = PatchReferenceBodySchema.parse(request.body);
    const reference = await catalogService.updateReference({
      referenceId: params.referenceId,
      ...(body.modelName === undefined ? {} : { modelName: body.modelName }),
      ...(body.color === undefined ? {} : { color: body.color }),
      ...(body.priceCop === undefined ? {} : { priceCop: body.priceCop }),
    });
    return reply.status(200).send({
      data: toPublicReference(reference),
    });
  });

  app.post('/references/:referenceId/activate', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const reference = await catalogService.activateReference(
      params.referenceId,
    );
    return reply.status(200).send({
      data: toPublicReference(reference),
    });
  });

  app.post('/references/:referenceId/deactivate', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const reference = await catalogService.deactivateReference(
      params.referenceId,
    );
    return reply.status(200).send({
      data: toPublicReference(reference),
    });
  });

  app.put('/references/:referenceId/photo', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);

    if (!request.isMultipart()) {
      throw new PhotoValidationError(
        'multipart_required',
        'Photo upload requires multipart form data',
      );
    }

    let fileCount = 0;
    let fieldCount = 0;
    let bytes: Uint8Array | null = null;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        fileCount += 1;
        if (part.fieldname !== 'photo') {
          throw new PhotoValidationError(
            'invalid_field',
            'Photo must be uploaded in the photo field',
          );
        }
        if (fileCount > 1) {
          throw new PhotoValidationError(
            'too_many_files',
            'Exactly one photo file is required',
          );
        }
        const buffer = await part.toBuffer();
        bytes = new Uint8Array(buffer);
      } else {
        fieldCount += 1;
      }
    }

    if (fieldCount > 0) {
      throw new PhotoValidationError(
        'unexpected_fields',
        'Photo upload must not include extra fields',
      );
    }

    if (fileCount === 0 || bytes === null) {
      throw new PhotoValidationError(
        'missing_file',
        'Exactly one photo file is required',
      );
    }

    const result = await catalogService.replacePhoto(params.referenceId, bytes);
    return reply.status(200).send({
      data: toPublicReference(result.reference),
      ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
    });
  });

  app.get('/references/:referenceId/photo', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const detail = await catalogService.getAdminReference(params.referenceId);
    const photo = detail.reference.photo;
    if (photo === null) {
      throw new CatalogNotFoundError('Catalog reference photo was not found');
    }

    const etag = `"${photo.sha256}"`;
    const ifNoneMatch = request.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      return reply.status(304).send();
    }

    const bytes = await photoStorage.read(photo.storageKey);
    return reply
      .status(200)
      .header('Content-Type', photo.mimeType)
      .header('Content-Length', String(bytes.byteLength))
      .header('ETag', etag)
      .header('Cache-Control', 'private, max-age=3600')
      .send(Buffer.from(bytes));
  });

  app.put('/references/:referenceId/stock/:size', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = StockParamsSchema.parse(request.params);
    const body = SetStockBodySchema.parse(request.body);
    const stock = await catalogService.setPhysicalStock({
      referenceId: params.referenceId,
      size: params.size,
      physicalQuantity: body.physicalQuantity,
      note: body.note,
    });
    return reply.status(200).send({
      data: toPublicStockRecord(stock),
    });
  });

  app.get('/references/:referenceId/movements', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const query = ListMovementsQuerySchema.parse(request.query);

    let cursor: { createdAt: Date; id: string } | undefined;
    if (query.cursor !== undefined) {
      try {
        cursor = decodeMovementCursor(query.cursor);
      } catch {
        return reply.status(400).send({
          error: {
            code: 'invalid_cursor',
            message: 'Movement cursor is invalid',
            field: 'cursor',
          },
        });
      }
    }

    const page = await catalogService.listAdminMovements({
      referenceId: params.referenceId,
      limit: query.limit,
      ...(query.size === undefined ? {} : { size: query.size }),
      ...(cursor === undefined ? {} : { cursor }),
    });

    return reply.status(200).send({
      data: {
        items: page.items.map(toPublicMovement),
        nextCursor:
          page.nextCursor === null
            ? null
            : encodeMovementCursor(page.nextCursor),
      },
    });
  });

  if (orderService !== undefined) {
    app.post('/orders', async (request, reply) => {
      const user = await requireAdminSession(request, authService);
      const body = CreateOrderBodySchema.parse(request.body);
      const order = await orderService.create({
        referenceId: body.referenceId,
        size: body.size,
        quantity: body.quantity,
        adminUserId: user.id,
        ...(body.customerName === undefined
          ? {}
          : { customerName: body.customerName }),
        ...(body.customerPhone === undefined
          ? {}
          : { customerPhone: body.customerPhone }),
        ...(body.address === undefined ? {} : { address: body.address }),
        ...(body.localityCarrierCode === undefined
          ? {}
          : { localityCarrierCode: body.localityCarrierCode }),
        ...(body.deliveryNotes === undefined
          ? {}
          : { deliveryNotes: body.deliveryNotes }),
      });
      return reply.status(201).send({ data: toPublicOrder(order) });
    });

    app.get('/orders', async (request, reply) => {
      await requireAdminSession(request, authService);
      const query = z
        .object({
          status: z
            .enum([
              'draft',
              'confirmed',
              'cancelled',
              'dispatched',
              'delivered',
              'returned',
            ])
            .optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        })
        .strict()
        .parse(request.query);
      const page = await orderService.list({
        limit: query.limit,
        ...(query.status === undefined ? {} : { status: query.status }),
      });
      return reply.status(200).send({
        data: {
          items: page.items.map(toPublicOrder),
          nextCursor: page.nextCursor,
        },
      });
    });

    app.get('/orders/:orderId', async (request, reply) => {
      await requireAdminSession(request, authService);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      const order = await orderService.get(orderId);
      if (order === null) throw new CatalogNotFoundError('Order was not found');
      return reply.status(200).send({ data: toPublicOrder(order) });
    });

    app.patch('/orders/:orderId', async (request, reply) => {
      const user = await requireAdminSession(request, authService);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      const body = PatchOrderBodySchema.parse(request.body);
      const order = await orderService.update({
        orderId,
        adminUserId: user.id,
        ...(body.customerName === undefined
          ? {}
          : { customerName: body.customerName }),
        ...(body.customerPhone === undefined
          ? {}
          : { customerPhone: body.customerPhone }),
        ...(body.address === undefined ? {} : { address: body.address }),
        ...(body.localityCarrierCode === undefined
          ? {}
          : { localityCarrierCode: body.localityCarrierCode }),
        ...(body.deliveryNotes === undefined
          ? {}
          : { deliveryNotes: body.deliveryNotes }),
      });
      return reply.status(200).send({ data: toPublicOrder(order) });
    });

    app.post('/orders/:orderId/summaries', async (request, reply) => {
      await requireAdminSession(request, authService);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      return reply.status(201).send({
        data: toPublicOrderSummary(await orderService.createSummary(orderId)),
      });
    });

    for (const action of ['cancel', 'dispatch', 'deliver', 'return'] as const) {
      app.post(`/orders/:orderId/${action}`, async (request, reply) => {
        const user = await requireAdminSession(request, authService);
        const { orderId } = OrderIdParamsSchema.parse(request.params);
        const order = await orderService.transition({
          orderId,
          action,
          adminUserId: user.id,
        });
        return reply.status(200).send({ data: toPublicOrder(order) });
      });
    }

    app.post('/orders/:orderId/confirm', async (request, reply) => {
      const user = await requireAdminSession(request, authService);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      const body = ConfirmOrderBodySchema.parse(request.body);
      const order = await orderService.transition({
        orderId,
        action: 'confirm',
        adminUserId: user.id,
        ...body,
      });
      return reply.status(200).send({ data: toPublicOrder(order) });
    });
  }
};
