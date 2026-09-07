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
  const inboundProcessor = new WhatsAppSalesService(
    new PostgresConversationRepository(database),
    catalogService,
    new PostgresConversationMenuRepository(database),
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
    photoStorage,
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
