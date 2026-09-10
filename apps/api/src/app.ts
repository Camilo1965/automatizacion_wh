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
import type { PostgresDatabase } from './database/client.js';
import { mapDomainError, sendApiError } from './http/map-domain-error.js';
import type { AuthService } from './modules/auth/auth-service.js';
import type { CatalogService } from './modules/catalog/catalog-service.js';
import type { CatalogImportService } from './modules/catalog/catalog-import-service.js';
import type { PhotoStorage } from './modules/catalog/photo-storage.js';
import type { LocalityService } from './modules/localities/locality-service.js';
import type { OrderService } from './modules/orders/order-service.js';
import type { WhatsAppInboundRepository } from './modules/whatsapp/whatsapp-inbound-repository.js';
import type { ConversationAdminRepository } from './modules/conversations/postgres-conversation-admin-repository.js';
import type { ConversationTranscriptRepository } from './modules/conversations/conversation-transcript-repository.js';
import type { ManualMessageService } from './modules/conversations/manual-message-service.js';
import type { DashboardService } from './modules/dashboard/dashboard-service.js';
import type { ShippingQuoteOperations } from './modules/shipping/shipping-quote-service.js';
import type { ShippingGuideOperations } from './modules/shipping/shipping-guide-service.js';
import type { ConnectionCapabilityService } from './modules/whatsapp/connection-capability-service.js';
import { adminRoutes } from './routes/admin/index.js';
import { healthRoutes } from './routes/health.js';
import { whatsappRoutes } from './routes/whatsapp.js';

export type AppDependencies = Readonly<{
  config: AppConfig;
  database: PostgresDatabase;
  authService: AuthService;
  catalogService: CatalogService;
  catalogImportService?: CatalogImportService;
  photoStorage: PhotoStorage;
  localityService?: LocalityService;
  orderService?: OrderService;
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
  connectionCapabilityService?: ConnectionCapabilityService;
}>;

declare module 'fastify' {
  interface FastifyInstance {
    database: PostgresDatabase;
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
  const app = Fastify({
    bodyLimit: 1024 * 1024,
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
          'body.password',
          'body.passwordConfirmation',
        ],
        remove: true,
      },
    },
  });

  app.decorate('database', dependencies.database);

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
    return mapDomainError(error, request, reply);
  });

  await app.register(healthRoutes);
  await app.register(whatsappRoutes, {
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
    ...(dependencies.connectionCapabilityService === undefined
      ? {}
      : {
          connectionCapabilityService: dependencies.connectionCapabilityService,
        }),
    photoStorage: dependencies.photoStorage,
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
