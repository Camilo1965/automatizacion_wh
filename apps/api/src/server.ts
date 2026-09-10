import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createPostgresDatabase } from './database/client.js';
import { AuthService } from './modules/auth/auth-service.js';
import { PostgresAdminAuthRepository } from './modules/auth/postgres-admin-auth-repository.js';
import { DefaultCatalogService } from './modules/catalog/catalog-service.js';
import { LocalPhotoStorage } from './modules/catalog/local-photo-storage.js';
import { PostgresCatalogImportRepository } from './modules/catalog/postgres-catalog-import-repository.js';
import { CatalogImportService } from './modules/catalog/catalog-import-service.js';
import { PostgresCatalogRepository } from './modules/catalog/postgres-catalog-repository.js';
import { LocalityService } from './modules/localities/locality-service.js';
import { PostgresLocalityRepository } from './modules/localities/postgres-locality-repository.js';
import { PostgresOrderRepository } from './modules/orders/postgres-order-repository.js';
import { OrderService } from './modules/orders/order-service.js';
import { PostgresWhatsAppInboundRepository } from './modules/whatsapp/postgres-whatsapp-inbound-repository.js';
import { PostgresConversationRepository } from './modules/conversations/postgres-conversation-repository.js';
import { PostgresConversationMenuRepository } from './modules/conversations/postgres-conversation-menu-repository.js';
import { WhatsAppSalesService } from './modules/conversations/whatsapp-sales-service.js';
import { PostgresOutboundRepository } from './modules/whatsapp/postgres-outbound-repository.js';
import { MetaWhatsAppClient } from './modules/whatsapp/meta-whatsapp-client.js';
import { OutboxWorker } from './modules/whatsapp/outbox-worker.js';
import { PostgresConversationAdminRepository } from './modules/conversations/postgres-conversation-admin-repository.js';
import { PostgresConversationTranscriptRepository } from './modules/conversations/postgres-conversation-transcript-repository.js';
import { ManualMessageService } from './modules/conversations/manual-message-service.js';
import { PostgresShippingGuideJobRepository } from './modules/shipping/postgres-shipping-guide-job-repository.js';
import { NinetyNineEnviosClient } from './modules/shipping/99envios-client.js';
import { ShippingGuideWorker } from './modules/shipping/shipping-guide-worker.js';
import { PostgresShippingQuoteRepository } from './modules/shipping/postgres-shipping-quote-repository.js';
import { ShippingQuoteService } from './modules/shipping/shipping-quote-service.js';
import { ShippingGuideService } from './modules/shipping/shipping-guide-service.js';
import { LocalGuidePdfStorage } from './modules/shipping/local-guide-pdf-storage.js';
import { DashboardService } from './modules/dashboard/dashboard-service.js';
import { PostgresDashboardRepository } from './modules/dashboard/postgres-dashboard-repository.js';
import { ConnectionCapabilityService } from './modules/whatsapp/connection-capability-service.js';
import path from 'node:path';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const database = createPostgresDatabase(config.databaseUrl);
  const authRepository = new PostgresAdminAuthRepository(database);
  const authService = new AuthService(authRepository);
  const catalogRepository = new PostgresCatalogRepository(database);
  const photoStorage = new LocalPhotoStorage(config.mediaRoot);
  const catalogService = new DefaultCatalogService(
    catalogRepository,
    photoStorage,
  );
  const catalogImportService = new CatalogImportService(
    new PostgresCatalogImportRepository(database),
  );
  const localityService = new LocalityService(
    new PostgresLocalityRepository(database),
  );
  const orderService = new OrderService(
    new PostgresOrderRepository(database),
    (referenceId) => catalogRepository.findReferenceById(referenceId),
  );
  const outboundRepository = new PostgresOutboundRepository(database);
  const shippingGuideJobs = new PostgresShippingGuideJobRepository(database);
  const shippingClient =
    config.ninetyNineEnviosEmail !== undefined &&
    config.ninetyNineEnviosPassword !== undefined
      ? new NinetyNineEnviosClient({
          email: config.ninetyNineEnviosEmail,
          password: config.ninetyNineEnviosPassword,
          ...(config.ninetyNineEnviosIntegrationToken === undefined
            ? {}
            : { integrationToken: config.ninetyNineEnviosIntegrationToken }),
          ...(config.ninetyNineEnviosIntegrationId === undefined
            ? {}
            : { integrationId: config.ninetyNineEnviosIntegrationId }),
        })
      : undefined;
  const shippingQuoteService =
    shippingClient === undefined
      ? undefined
      : new ShippingQuoteService(
          new PostgresShippingQuoteRepository(database),
          orderService,
          shippingClient,
        );
  const shippingGuideService =
    shippingClient === undefined
      ? undefined
      : new ShippingGuideService(
          shippingGuideJobs,
          shippingClient,
          new LocalGuidePdfStorage(path.join(config.mediaRoot, 'guides')),
        );
  const inboundProcessor = new WhatsAppSalesService(
    new PostgresConversationRepository(database),
    catalogService,
    new PostgresConversationMenuRepository(database),
    outboundRepository,
    orderService,
    localityService,
    shippingGuideJobs,
    shippingQuoteService,
  );
  const conversationAdminRepository = new PostgresConversationAdminRepository(
    database,
  );
  const conversationTranscriptRepository =
    new PostgresConversationTranscriptRepository(database);
  const manualMessageService = new ManualMessageService(
    conversationAdminRepository,
    outboundRepository,
  );

  const app = await buildApp({
    config,
    database,
    authService,
    catalogService,
    catalogImportService,
    localityService,
    orderService,
    inboundRepository: new PostgresWhatsAppInboundRepository(database),
    inboundProcessor,
    conversationAdminRepository,
    conversationTranscriptRepository,
    manualMessageService,
    dashboardService: new DashboardService(
      new PostgresDashboardRepository(database),
    ),
    connectionCapabilityService: new ConnectionCapabilityService({
      ...(config.whatsappPhoneNumberId === undefined
        ? {}
        : { phoneNumberId: config.whatsappPhoneNumberId }),
      webhookConfigured:
        config.whatsappWebhookVerifyToken !== undefined &&
        config.whatsappAppSecret !== undefined,
    }),
    photoStorage,
    ...(shippingQuoteService === undefined ? {} : { shippingQuoteService }),
    ...(shippingGuideService === undefined ? {} : { shippingGuideService }),
  });

  if (
    config.whatsappAccessToken !== undefined &&
    config.whatsappPhoneNumberId !== undefined
  ) {
    const worker = new OutboxWorker(
      outboundRepository,
      new MetaWhatsAppClient({
        accessToken: config.whatsappAccessToken,
        phoneNumberId: config.whatsappPhoneNumberId,
        graphApiVersion: config.whatsappGraphApiVersion ?? 'v26.0',
      }),
      photoStorage,
    );
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void worker.runOnce().finally(() => {
        running = false;
      });
    }, 250);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
    });
  }

  if (shippingClient !== undefined) {
    const worker = new ShippingGuideWorker(
      shippingGuideJobs,
      orderService,
      shippingClient,
    );
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void worker.runOnce().finally(() => {
        running = false;
      });
    }, 1000);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
    });
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

main().catch((error: unknown) => {
  console.error('Failed to start API');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
});
