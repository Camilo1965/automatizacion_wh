import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';

import type { AppConfig } from './config.js';
import type { BotFlowService } from './modules/conversations/bot-flow-service.js';
import type { LocalityCatalogService } from './modules/localities/locality-catalog-service.js';
import type { ShippingIncidentService } from './modules/shipping/shipping-incident-service.js';
import type { PostgresDatabase } from './database/client.js';
import { mapDomainError, sendApiError } from './http/map-domain-error.js';
import type { AuthService } from './modules/auth/auth-service.js';
import type { CatalogService } from './modules/catalog/catalog-service.js';
import type { CatalogImportService } from './modules/catalog/catalog-import-service.js';
import type { PhotoStorage } from './modules/catalog/photo-storage.js';
import type { LocalityService } from './modules/localities/locality-service.js';
import type { OrderService } from './modules/orders/order-service.js';
import type { CustomerService } from './modules/customers/customer-service.js';
import type { WhatsAppInboundRepository } from './modules/whatsapp/whatsapp-inbound-repository.js';
import type { ConversationAdminRepository } from './modules/conversations/postgres-conversation-admin-repository.js';
import type { ConversationTranscriptRepository } from './modules/conversations/conversation-transcript-repository.js';
import type { ManualMessageService } from './modules/conversations/manual-message-service.js';
import type { DashboardService } from './modules/dashboard/dashboard-service.js';
import type { GlobalSearchService } from './modules/search/global-search-service.js';
import type { ShippingQuoteOperations } from './modules/shipping/shipping-quote-service.js';
import type { ShippingGuideOperations } from './modules/shipping/shipping-guide-service.js';
import type { ConnectionCapabilityService } from './modules/whatsapp/connection-capability-service.js';
import type { AlertService } from './modules/alerts/alert-service.js';
import type { AuditService } from './modules/audit/audit-service.js';
import type { RetentionService } from './modules/privacy/retention-service.js';
import type { InventoryClosureService } from './modules/inventory/inventory-closure-service.js';
import type { IntegrationHealthService } from './modules/integrations/integration-health-service.js';
import type { IntegrationSettingsOperations } from './modules/integrations/integration-settings-service.js';
import { refreshOperationalGauges } from './modules/observability/collect-gauges.js';
import type { ErrorReporter } from './modules/observability/error-reporter.js';
import {
  classifyRoute,
  CORRELATION_HEADER,
  MetricsRegistry,
  normalizeCorrelationId,
} from './modules/observability/metrics.js';
import { OrderConflictError } from './modules/orders/order-errors.js';
import { adminRoutes } from './routes/admin/index.js';
import { healthRoutes } from './routes/health.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { randomUUID } from 'node:crypto';

export type AppDependencies = Readonly<{
  config: AppConfig;
  database: PostgresDatabase;
  metrics?: MetricsRegistry;
  errorReporter?: ErrorReporter;
  authService: AuthService;
  auditService?: AuditService;
  retentionService?: RetentionService;
  catalogService: CatalogService;
  catalogImportService?: CatalogImportService;
  photoStorage: PhotoStorage;
  localityService?: LocalityService;
  orderService?: OrderService;
  customerService?: CustomerService;
  inboundRepository?: WhatsAppInboundRepository;
  inboundProcessor?: Readonly<{
    process(input: {
      whatsappMessageId: string;
      customerPhone: string;
      text: string;
    }): Promise<void>;
  }>;
  conversationAdminRepository?: ConversationAdminRepository;
  conversationTranscriptRepository?: ConversationTranscriptRepository;
  manualMessageService?: ManualMessageService;
  shippingQuoteService?: ShippingQuoteOperations;
  shippingGuideService?: ShippingGuideOperations;
  dashboardService?: DashboardService;
  globalSearchService?: GlobalSearchService;
  connectionCapabilityService?: ConnectionCapabilityService;
  alertService?: AlertService;
  inventoryClosureService?: InventoryClosureService;
  integrationHealthService?: IntegrationHealthService;
  integrationSettingsService?: IntegrationSettingsOperations;
  botFlowService?: BotFlowService;
  localityCatalogService?: LocalityCatalogService;
  shippingIncidentService?: ShippingIncidentService;
}>;

declare module 'fastify' {
  interface FastifyInstance {
    database: PostgresDatabase;
    metrics: MetricsRegistry;
  }
}

function requireAdminOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  adminOrigin: string,
): FastifyReply | undefined {
  const method = request.method.toUpperCase();
  if (
    method === 'GET' ||
    method === 'HEAD' ||
    method === 'OPTIONS' ||
    !request.url.startsWith('/api/admin')
  ) {
    return undefined;
  }

  const origin = request.headers.origin;
  if (origin !== adminOrigin) {
    return sendApiError(
      reply,
      403,
      'invalid_origin',
      'Origin header is required and must match the admin origin',
    );
  }

  return undefined;
}

export async function buildApp(
  dependencies: AppDependencies,
): Promise<FastifyInstance> {
  const metrics = dependencies.metrics ?? new MetricsRegistry();
  const metricsEnabled = dependencies.config.metricsEnabled !== false;

  const app = Fastify({
    bodyLimit: 1024 * 1024,
    genReqId(req) {
      return (
        normalizeCorrelationId(req.headers[CORRELATION_HEADER]) ?? randomUUID()
      );
    },
    logger: {
      level: dependencies.config.logLevel,
      redact: {
        paths: [
          'req.url',
          'req.body',
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.x-hub-signature-256',
          'res.headers["set-cookie"]',
          'req.body.password',
          'req.body.passwordConfirmation',
          'req.body.currentPassword',
          'req.body.code',
          'req.body.mfaToken',
          'req.body.accessToken',
          'req.body.appSecret',
          'req.body.webhookVerifyToken',
          'req.body.integrationToken',
          'body.password',
          'body.passwordConfirmation',
          'body.currentPassword',
          'body.code',
          'body.mfaToken',
        ],
        remove: true,
      },
    },
  });

  app.decorate('database', dependencies.database);
  app.decorate('metrics', metrics);

  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, {
    origin(origin, callback) {
      callback(null, origin === dependencies.config.adminOrigin);
    },
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 5 * 1024 * 1024,
      fields: 0,
    },
  });
  await app.register(rateLimit, {
    global: false,
  });
  await app.register(rawBody, {
    global: false,
    encoding: false,
    runFirst: true,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header(CORRELATION_HEADER, request.id);
    (
      request as FastifyRequest & { metricsStartedAt?: bigint }
    ).metricsStartedAt = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request, reply) => {
    const started = (request as FastifyRequest & { metricsStartedAt?: bigint })
      .metricsStartedAt;
    const durationSeconds =
      started === undefined
        ? 0
        : Number(process.hrtime.bigint() - started) / 1e9;
    metrics.recordHttpRequest({
      method: request.method,
      routeGroup: classifyRoute(request.url),
      statusCode: reply.statusCode,
      durationSeconds,
    });
  });

  app.addHook('preHandler', async (request, reply) => {
    const rejected = requireAdminOrigin(
      request,
      reply,
      dependencies.config.adminOrigin,
    );
    if (rejected !== undefined) {
      return rejected;
    }
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (
      error instanceof OrderConflictError &&
      error.code === 'insufficient_stock'
    ) {
      metrics.recordInventoryConflict('insufficient_stock');
    }
    const mapped = mapDomainError(error, request, reply);
    if (mapped === null || reply.statusCode >= 500) {
      void dependencies.errorReporter?.report(error, {
        correlationId: request.id,
        tags: { surface: 'http' },
      });
    }
    return mapped;
  });

  if (metricsEnabled) {
    app.get('/metrics', async (request, reply) => {
      const token = dependencies.config.metricsToken;
      if (token !== undefined) {
        const auth = request.headers.authorization;
        const bearer =
          typeof auth === 'string' && auth.startsWith('Bearer ')
            ? auth.slice('Bearer '.length)
            : undefined;
        const queryToken =
          typeof request.query === 'object' &&
          request.query !== null &&
          'token' in request.query &&
          typeof (request.query as { token?: unknown }).token === 'string'
            ? (request.query as { token: string }).token
            : undefined;
        if (bearer !== token && queryToken !== token) {
          return reply.status(401).send({ error: 'unauthorized' });
        }
      }

      await refreshOperationalGauges({
        metrics,
        database: dependencies.database,
        ...(dependencies.config.backupMetricsPath === undefined
          ? {}
          : { backupMetricsPath: dependencies.config.backupMetricsPath }),
      });

      return reply
        .type('text/plain; version=0.0.4; charset=utf-8')
        .send(metrics.renderPrometheus());
    });
  }

  await app.register(healthRoutes);
  await app.register(whatsappRoutes, {
    ...(dependencies.integrationSettingsService === undefined
      ? {}
      : { settings: dependencies.integrationSettingsService }),
    config: dependencies.config,
    ...(dependencies.inboundRepository === undefined
      ? {}
      : { inboundRepository: dependencies.inboundRepository }),
    ...(dependencies.inboundProcessor === undefined
      ? {}
      : { inboundProcessor: dependencies.inboundProcessor }),
  });
  await app.register(adminRoutes, {
    prefix: '/api/admin',
    config: dependencies.config,
    authService: dependencies.authService,
    ...(dependencies.auditService === undefined
      ? {}
      : { auditService: dependencies.auditService }),
    ...(dependencies.retentionService === undefined
      ? {}
      : { retentionService: dependencies.retentionService }),
    catalogService: dependencies.catalogService,
    ...(dependencies.catalogImportService === undefined
      ? {}
      : { catalogImportService: dependencies.catalogImportService }),
    ...(dependencies.localityService === undefined
      ? {}
      : { localityService: dependencies.localityService }),
    ...(dependencies.orderService === undefined
      ? {}
      : { orderService: dependencies.orderService }),
    ...(dependencies.customerService === undefined
      ? {}
      : { customerService: dependencies.customerService }),
    ...(dependencies.conversationAdminRepository === undefined
      ? {}
      : {
          conversationAdminRepository: dependencies.conversationAdminRepository,
        }),
    ...(dependencies.conversationTranscriptRepository === undefined
      ? {}
      : {
          conversationTranscriptRepository:
            dependencies.conversationTranscriptRepository,
        }),
    ...(dependencies.manualMessageService === undefined
      ? {}
      : { manualMessageService: dependencies.manualMessageService }),
    ...(dependencies.shippingQuoteService === undefined
      ? {}
      : { shippingQuoteService: dependencies.shippingQuoteService }),
    ...(dependencies.shippingGuideService === undefined
      ? {}
      : { shippingGuideService: dependencies.shippingGuideService }),
    ...(dependencies.dashboardService === undefined
      ? {}
      : { dashboardService: dependencies.dashboardService }),
    ...(dependencies.globalSearchService === undefined
      ? {}
      : { globalSearchService: dependencies.globalSearchService }),
    ...(dependencies.connectionCapabilityService === undefined
      ? {}
      : {
          connectionCapabilityService: dependencies.connectionCapabilityService,
        }),
    ...(dependencies.alertService === undefined
      ? {}
      : { alertService: dependencies.alertService }),
    ...(dependencies.inventoryClosureService === undefined
      ? {}
      : { inventoryClosureService: dependencies.inventoryClosureService }),
    ...(dependencies.integrationHealthService === undefined
      ? {}
      : { integrationHealthService: dependencies.integrationHealthService }),
    ...(dependencies.integrationSettingsService === undefined
      ? {}
      : {
          integrationSettingsService: dependencies.integrationSettingsService,
        }),
    photoStorage: dependencies.photoStorage,
    ...(dependencies.botFlowService === undefined
      ? {}
      : { botFlowService: dependencies.botFlowService }),
    ...(dependencies.localityCatalogService === undefined
      ? {}
      : { localityCatalogService: dependencies.localityCatalogService }),
    ...(dependencies.shippingIncidentService === undefined
      ? {}
      : { shippingIncidentService: dependencies.shippingIncidentService }),
  });

  let databaseClosed = false;
  app.addHook('onClose', async () => {
    if (databaseClosed) {
      return;
    }
    databaseClosed = true;
    await dependencies.database.close();
  });

  return app;
}
