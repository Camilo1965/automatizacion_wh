import { access } from 'node:fs/promises';

import { loadConfig, type AppConfig } from './config.js';
import {
  createPostgresDatabase,
  type PostgresDatabase,
} from './database/client.js';
import { AlertService } from './modules/alerts/alert-service.js';
import { OwnerAlertWorker } from './modules/alerts/owner-alert-worker.js';
import { PostgresAlertRepository } from './modules/alerts/postgres-alert-repository.js';
import { AuthService } from './modules/auth/auth-service.js';
import { PostgresAdminAuthRepository } from './modules/auth/postgres-admin-auth-repository.js';
import { AuditService } from './modules/audit/audit-service.js';
import { PostgresAuditRepository } from './modules/audit/postgres-audit-repository.js';
import { PostgresRetentionDataStore } from './modules/privacy/postgres-retention-data-store.js';
import { PostgresRetentionRepository } from './modules/privacy/postgres-retention-repository.js';
import { RetentionService } from './modules/privacy/retention-service.js';
import { CatalogImportService } from './modules/catalog/catalog-import-service.js';
import { DefaultCatalogService } from './modules/catalog/catalog-service.js';
import { LocalPhotoStorage } from './modules/catalog/local-photo-storage.js';
import { PostgresCatalogImportRepository } from './modules/catalog/postgres-catalog-import-repository.js';
import { PostgresCatalogRepository } from './modules/catalog/postgres-catalog-repository.js';
import { BotFlowService } from './modules/conversations/bot-flow-service.js';
import { ManualMessageService } from './modules/conversations/manual-message-service.js';
import { PostgresConversationAdminRepository } from './modules/conversations/postgres-conversation-admin-repository.js';
import { PostgresConversationMenuRepository } from './modules/conversations/postgres-conversation-menu-repository.js';
import { PostgresConversationRepository } from './modules/conversations/postgres-conversation-repository.js';
import { PostgresConversationTranscriptRepository } from './modules/conversations/postgres-conversation-transcript-repository.js';
import { WhatsAppSalesService } from './modules/conversations/whatsapp-sales-service.js';
import { DashboardService } from './modules/dashboard/dashboard-service.js';
import { PostgresDashboardRepository } from './modules/dashboard/postgres-dashboard-repository.js';
import {
  ConfiguredNinetyNineEnviosClient,
  ConfiguredWhatsAppClient,
} from './modules/integrations/configured-clients.js';
import { IntegrationHealthService } from './modules/integrations/integration-health-service.js';
import { IntegrationSecretCrypto } from './modules/integrations/integration-secret-crypto.js';
import { IntegrationSettingsService } from './modules/integrations/integration-settings-service.js';
import { PostgresIntegrationSettingsRepository } from './modules/integrations/postgres-integration-settings-repository.js';
import { DailyClosureScheduler } from './modules/inventory/daily-closure-scheduler.js';
import { InventoryClosureService } from './modules/inventory/inventory-closure-service.js';
import { PostgresInventoryClosureRepository } from './modules/inventory/postgres-inventory-closure-repository.js';
import { LocalityCatalogService } from './modules/localities/locality-catalog-service.js';
import { LocalityService } from './modules/localities/locality-service.js';
import { PostgresLocalityRepository } from './modules/localities/postgres-locality-repository.js';
import { OrderService } from './modules/orders/order-service.js';
import { PostgresOrderRepository } from './modules/orders/postgres-order-repository.js';
import { GlobalSearchService } from './modules/search/global-search-service.js';
import { GuideDeliveryService } from './modules/shipping/guide-delivery-service.js';
import { LocalGuidePdfStorage } from './modules/shipping/local-guide-pdf-storage.js';
import { PostgresShippingGuideJobRepository } from './modules/shipping/postgres-shipping-guide-job-repository.js';
import { PostgresShippingQuoteRepository } from './modules/shipping/postgres-shipping-quote-repository.js';
import { ShippingGuideService } from './modules/shipping/shipping-guide-service.js';
import { ShippingGuideWorker } from './modules/shipping/shipping-guide-worker.js';
import { ShippingIncidentService } from './modules/shipping/shipping-incident-service.js';
import { ShippingQuoteService } from './modules/shipping/shipping-quote-service.js';
import { createObjectStorage } from './modules/storage/create-object-storage.js';
import { ConnectionCapabilityService } from './modules/whatsapp/connection-capability-service.js';
import { OutboxWorker } from './modules/whatsapp/outbox-worker.js';
import { PostgresOutboundRepository } from './modules/whatsapp/postgres-outbound-repository.js';
import { PostgresWhatsAppInboundRepository } from './modules/whatsapp/postgres-whatsapp-inbound-repository.js';
import type { AppDependencies } from './app.js';

export type AppRuntime = Readonly<{
  config: AppConfig;
  database: PostgresDatabase;
  appDependencies: AppDependencies;
  workers: Readonly<{
    start(onError: (message: string, error?: unknown) => void): () => void;
  }>;
}>;

export async function createRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppRuntime> {
  const config = loadConfig(env);
  const database = createPostgresDatabase(config.databaseUrl);
  const botFlowService = new BotFlowService(database);
  await botFlowService.bootstrap();
  const localityCatalogService = new LocalityCatalogService(database);
  await localityCatalogService.bootstrap();
  const authRepository = new PostgresAdminAuthRepository(database);
  const auditService = new AuditService(new PostgresAuditRepository(database));
  const authService = new AuthService(authRepository, {
    ...(config.integrationEncryptionKey === undefined
      ? {}
      : {
          mfaCrypto: new IntegrationSecretCrypto(
            config.integrationEncryptionKey,
          ),
          mfaSigningKeyBase64: config.integrationEncryptionKey,
        }),
    sessionIdleTtlMs: (config.sessionIdleTtlMinutes ?? 60) * 60 * 1000,
    sessionLastSeenThrottleMs:
      (config.sessionLastSeenThrottleSeconds ?? 300) * 1000,
    absoluteSessionTtlMs: (config.sessionAbsoluteTtlHours ?? 12) * 60 * 60 * 1000,
    auditSink: auditService.asAuthAuditSink(),
  });
  // Retention jobs are owner/CLI triggered. Automatic execution stays OFF unless
  // RETENTION_EXECUTION_ENABLED=true and an approved active policy exists.
  const retentionService = new RetentionService(
    new PostgresRetentionRepository(database),
    new PostgresRetentionDataStore(database),
    auditService,
    {
      executionEnabled: config.retentionExecutionEnabled === true,
      now: () => new Date(),
      confirmPassword: async (actor, password) => {
        if (actor.id === null) {
          return;
        }
        await authService.confirmCurrentPassword(
          {
            id: actor.id,
            username: actor.username,
            role: actor.role,
          },
          password,
        );
      },
    },
  );
  const catalogRepository = new PostgresCatalogRepository(database);
  const photoStorage = new LocalPhotoStorage(
    createObjectStorage(config, 'photos'),
  );
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
  const integrationSettingsService =
    config.integrationEncryptionKey === undefined
      ? undefined
      : new IntegrationSettingsService(
          new PostgresIntegrationSettingsRepository(database),
          new IntegrationSecretCrypto(config.integrationEncryptionKey),
        );
  const orderService = new OrderService(
    new PostgresOrderRepository(database),
    (referenceId) => catalogRepository.findReferenceById(referenceId),
  );
  const outboundRepository = new PostgresOutboundRepository(database);
  const shippingGuideJobs = new PostgresShippingGuideJobRepository(database);
  const shippingFallback =
    config.ninetyNineEnviosEmail !== undefined &&
    config.ninetyNineEnviosPassword !== undefined
      ? {
          email: config.ninetyNineEnviosEmail,
          password: config.ninetyNineEnviosPassword,
          ...(config.ninetyNineEnviosIntegrationToken === undefined
            ? {}
            : { integrationToken: config.ninetyNineEnviosIntegrationToken }),
          ...(config.ninetyNineEnviosIntegrationId === undefined
            ? {}
            : { integrationId: config.ninetyNineEnviosIntegrationId }),
        }
      : undefined;
  const shippingClient =
    integrationSettingsService !== undefined || shippingFallback !== undefined
      ? new ConfiguredNinetyNineEnviosClient(
          integrationSettingsService,
          shippingFallback,
        )
      : undefined;
  const shippingQuoteService =
    shippingClient === undefined
      ? undefined
      : new ShippingQuoteService(
          new PostgresShippingQuoteRepository(database),
          orderService,
          shippingClient,
        );
  const guidePdfStorage = new LocalGuidePdfStorage(
    createObjectStorage(config, 'guides'),
  );
  const shippingGuideService =
    shippingClient === undefined
      ? undefined
      : new ShippingGuideService(
          shippingGuideJobs,
          shippingClient,
          guidePdfStorage,
        );
  const alertService = new AlertService(new PostgresAlertRepository(database));
  const inboundProcessor = new WhatsAppSalesService(
    new PostgresConversationRepository(database),
    catalogService,
    new PostgresConversationMenuRepository(database),
    outboundRepository,
    orderService,
    localityService,
    shippingGuideJobs,
    shippingQuoteService,
    alertService,
    async () => (await integrationSettingsService?.getWhatsApp()) ?? null,
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

  const inventoryClosureService = new InventoryClosureService(
    new PostgresInventoryClosureRepository(database),
  );

  const appDependencies: AppDependencies = {
    config,
    database,
    authService,
    auditService,
    retentionService,
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
    globalSearchService: new GlobalSearchService(database),
    connectionCapabilityService: new ConnectionCapabilityService({
      ...(config.whatsappPhoneNumberId === undefined
        ? {}
        : { phoneNumberId: config.whatsappPhoneNumberId }),
      webhookConfigured:
        config.whatsappWebhookVerifyToken !== undefined &&
        config.whatsappAppSecret !== undefined,
    }),
    alertService,
    inventoryClosureService,
    integrationHealthService: new IntegrationHealthService({
      database: () => database.ping(),
      mediaStorage: () => access(config.mediaRoot),
      whatsappConfigured: async () =>
        (await integrationSettingsService?.getWhatsApp()) != null ||
        (config.whatsappAccessToken !== undefined &&
          config.whatsappPhoneNumberId !== undefined),
      shippingConfigured: async () =>
        (await integrationSettingsService?.getShipping()) != null ||
        shippingFallback !== undefined,
      schedulerHealthy: true,
    }),
    photoStorage,
    ...(shippingQuoteService === undefined ? {} : { shippingQuoteService }),
    ...(shippingGuideService === undefined ? {} : { shippingGuideService }),
    ...(integrationSettingsService === undefined
      ? {}
      : { integrationSettingsService }),
    botFlowService,
    localityCatalogService,
    ...(shippingClient === undefined
      ? {}
      : {
          shippingIncidentService: new ShippingIncidentService(
            database,
            shippingClient,
          ),
        }),
  };

  const whatsappFallback =
    config.whatsappAccessToken !== undefined &&
    config.whatsappPhoneNumberId !== undefined
      ? {
          accessToken: config.whatsappAccessToken,
          phoneNumberId: config.whatsappPhoneNumberId,
          graphApiVersion: config.whatsappGraphApiVersion ?? 'v26.0',
        }
      : undefined;

  return {
    config,
    database,
    appDependencies,
    workers: {
      start(onError) {
        const timers: NodeJS.Timeout[] = [];
        let stopped = false;

        const closureScheduler = new DailyClosureScheduler(
          inventoryClosureService,
        );
        if (integrationSettingsService) {
          const alertWorker = new OwnerAlertWorker(
            database,
            integrationSettingsService,
          );
          let notifying = false;
          const timer = setInterval(() => {
            if (stopped || notifying) return;
            notifying = true;
            void alertWorker
              .runOnce()
              .catch((error: unknown) =>
                onError('Owner notification failed', error),
              )
              .finally(() => {
                notifying = false;
              });
          }, 5000);
          timer.unref();
          timers.push(timer);
        }

        let purgingSessions = false;
        const maintenanceTimer = setInterval(() => {
          if (stopped) return;
          void closureScheduler.tick(new Date());
          if (purgingSessions) return;
          purgingSessions = true;
          void authService
            .purgeExpiredSessions()
            .catch((error: unknown) => onError('Session purge failed', error))
            .finally(() => {
              purgingSessions = false;
            });
        }, 60_000);
        maintenanceTimer.unref();
        timers.push(maintenanceTimer);
        void closureScheduler.tick(new Date());

        if (
          integrationSettingsService !== undefined ||
          whatsappFallback !== undefined
        ) {
          const worker = new OutboxWorker(
            outboundRepository,
            new ConfiguredWhatsAppClient(
              integrationSettingsService,
              whatsappFallback,
            ),
            photoStorage,
            alertService,
            guidePdfStorage,
          );
          let running = false;
          const timer = setInterval(() => {
            if (stopped || running) return;
            running = true;
            void (async () => {
              if (
                whatsappFallback === undefined &&
                (await integrationSettingsService?.getWhatsApp()) === null
              ) {
                return;
              }
              await worker.runOnce();
            })()
              .catch((error: unknown) =>
                onError('WhatsApp worker failed', error),
              )
              .finally(() => {
                running = false;
              });
          }, 250);
          timer.unref();
          timers.push(timer);
        }

        if (shippingClient !== undefined) {
          const worker = new ShippingGuideWorker(
            shippingGuideJobs,
            orderService,
            shippingClient,
            alertService,
          );
          let running = false;
          const timer = setInterval(() => {
            if (stopped || running) return;
            running = true;
            void (async () => {
              if (
                shippingFallback === undefined &&
                (await integrationSettingsService?.getShipping()) === null
              ) {
                return;
              }
              await worker.runOnce();
            })()
              .catch((error: unknown) =>
                onError('Shipping worker failed', error),
              )
              .finally(() => {
                running = false;
              });
          }, 1000);
          timer.unref();
          timers.push(timer);
        }

        if (shippingGuideService !== undefined) {
          const delivery = new GuideDeliveryService(
            database,
            shippingGuideService,
            outboundRepository,
            alertService,
          );
          let delivering = false;
          const timer = setInterval(() => {
            if (stopped || delivering) return;
            delivering = true;
            void delivery
              .runOnce()
              .catch((error: unknown) =>
                onError('Guide document delivery failed', error),
              )
              .finally(() => {
                delivering = false;
              });
          }, 1000);
          timer.unref();
          timers.push(timer);
        }

        return () => {
          stopped = true;
          for (const timer of timers) {
            clearInterval(timer);
          }
        };
      },
    },
  };
}
