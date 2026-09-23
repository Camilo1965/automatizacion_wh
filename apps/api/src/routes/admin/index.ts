import type { FastifyPluginAsync } from 'fastify';

import type { AppConfig } from '../../config.js';
import type { BotFlowService } from '../../modules/conversations/bot-flow-service.js';
import type { LocalityCatalogService } from '../../modules/localities/locality-catalog-service.js';
import type { ShippingIncidentService } from '../../modules/shipping/shipping-incident-service.js';
import type { AdminUserPublic } from '../../modules/auth/admin-auth-repository.js';
import type { AuthService } from '../../modules/auth/auth-service.js';
import type { CatalogService } from '../../modules/catalog/catalog-service.js';
import type { CatalogImportService } from '../../modules/catalog/catalog-import-service.js';
import type { LocalityService } from '../../modules/localities/locality-service.js';
import type { PhotoStorage } from '../../modules/catalog/photo-storage.js';
import type { OrderService } from '../../modules/orders/order-service.js';
import type { ConversationAdminRepository } from '../../modules/conversations/postgres-conversation-admin-repository.js';
import type { ConversationTranscriptRepository } from '../../modules/conversations/conversation-transcript-repository.js';
import type { ManualMessageService } from '../../modules/conversations/manual-message-service.js';
import type { ShippingQuoteOperations } from '../../modules/shipping/shipping-quote-service.js';
import type { ShippingGuideOperations } from '../../modules/shipping/shipping-guide-service.js';
import type { DashboardService } from '../../modules/dashboard/dashboard-service.js';
import type { GlobalSearchService } from '../../modules/search/global-search-service.js';
import type { ConnectionCapabilityService } from '../../modules/whatsapp/connection-capability-service.js';
import type { AlertService } from '../../modules/alerts/alert-service.js';
import type { AuditService } from '../../modules/audit/audit-service.js';
import type { InventoryClosureService } from '../../modules/inventory/inventory-closure-service.js';
import type { IntegrationHealthService } from '../../modules/integrations/integration-health-service.js';
import type { IntegrationSettingsOperations } from '../../modules/integrations/integration-settings-service.js';
import type { RetentionService } from '../../modules/privacy/retention-service.js';
import type { CustomerService } from '../../modules/customers/customer-service.js';
import { requireAdminSession, authorize } from './admin-shared.js';
import { registerAuditRoutes } from './audit.js';
import { registerAuthRoutes } from './auth.js';
import { registerCatalogRoutes } from './catalog.js';
import { registerConversationsRoutes } from './conversations.js';
import { registerCustomerRoutes } from './customers.js';
import { registerDashboardRoute } from './dashboard.js';
import { registerGlobalSearchRoute } from './search.js';
import { registerIntegrationsRoutes } from './integrations.js';
import { registerInventoryRoutes } from './inventory.js';
import { registerLocalitiesRoutes } from './localities.js';
import { registerLocalityCatalogRoutes } from './locality-catalog.js';
import { registerOrdersRoutes } from './orders.js';
import { registerPrivacyRoutes } from './privacy.js';
import { registerSecurityRoutes } from './security.js';
import { registerShippingRoutes } from './shipping.js';
import { registerShippingIncidentRoutes } from './shipping-incidents.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: AdminUserPublic;
  }
}

export type AdminRoutesDependencies = Readonly<{
  botFlowService?: BotFlowService;
  localityCatalogService?: LocalityCatalogService;
  shippingIncidentService?: ShippingIncidentService;
  config: AppConfig;
  authService: AuthService;
  auditService?: AuditService;
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
  globalSearchService?: GlobalSearchService;
  connectionCapabilityService?: ConnectionCapabilityService;
  alertService?: AlertService;
  inventoryClosureService?: InventoryClosureService;
  integrationHealthService?: IntegrationHealthService;
  integrationSettingsService?: IntegrationSettingsOperations;
  retentionService?: RetentionService;
  customerService?: CustomerService;
}>;

export const adminRoutes: FastifyPluginAsync<AdminRoutesDependencies> = async (
  app,
  dependencies,
) => {
  const authenticate = (request: Parameters<typeof requireAdminSession>[0]) =>
    requireAdminSession(request, dependencies.authService);

  if (dependencies.shippingIncidentService !== undefined) {
    registerShippingIncidentRoutes(
      app,
      dependencies.shippingIncidentService,
      authorize(authenticate, 'shipping:operate'),
    );
  }
  if (dependencies.localityCatalogService !== undefined) {
    registerLocalityCatalogRoutes(
      app,
      dependencies.localityCatalogService,
      authorize(authenticate, 'integrations:manage'),
      dependencies.auditService,
    );
  }

  await registerIntegrationsRoutes(app, {
    authenticate,
    ...(dependencies.botFlowService === undefined
      ? {}
      : { botFlowService: dependencies.botFlowService }),
    ...(dependencies.integrationSettingsService === undefined
      ? {}
      : {
          integrationSettingsService: dependencies.integrationSettingsService,
        }),
    ...(dependencies.integrationHealthService === undefined
      ? {}
      : {
          integrationHealthService: dependencies.integrationHealthService,
        }),
    ...(dependencies.connectionCapabilityService === undefined
      ? {}
      : {
          connectionCapabilityService: dependencies.connectionCapabilityService,
        }),
    ...(dependencies.alertService === undefined
      ? {}
      : { alertService: dependencies.alertService }),
    ...(dependencies.auditService === undefined
      ? {}
      : { auditService: dependencies.auditService }),
  });

  if (dependencies.inventoryClosureService !== undefined) {
    await registerInventoryRoutes(app, {
      authenticate: authorize(authenticate, 'inventory:operate'),
      inventoryClosureService: dependencies.inventoryClosureService,
      ...(dependencies.auditService === undefined
        ? {}
        : { auditService: dependencies.auditService }),
    });
  }

  await registerShippingRoutes(app, {
    authenticate: authorize(authenticate, 'shipping:operate'),
    manageShipping: authorize(authenticate, 'shipping:manage'),
    ...(dependencies.shippingQuoteService === undefined
      ? {}
      : { shippingQuoteService: dependencies.shippingQuoteService }),
    ...(dependencies.shippingGuideService === undefined
      ? {}
      : { shippingGuideService: dependencies.shippingGuideService }),
    ...(dependencies.auditService === undefined
      ? {}
      : { auditService: dependencies.auditService }),
  });

  await registerConversationsRoutes(app, {
    authenticate: authorize(authenticate, 'conversations:operate'),
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
    ...(dependencies.connectionCapabilityService === undefined
      ? {}
      : {
          connectionCapabilityService: dependencies.connectionCapabilityService,
        }),
  });

  if (dependencies.customerService !== undefined) {
    await registerCustomerRoutes(app, {
      authenticate: authorize(authenticate, 'orders:operate'),
      customerService: dependencies.customerService,
    });
  }

  if (dependencies.localityService !== undefined) {
    await registerLocalitiesRoutes(app, {
      authenticate: authorize(authenticate, 'shipping:operate'),
      localityService: dependencies.localityService,
    });
  }

  await registerAuthRoutes(app, {
    authenticate,
    config: dependencies.config,
    authService: dependencies.authService,
  });

  if (dependencies.auditService !== undefined) {
    await registerAuditRoutes(app, {
      authenticate,
      auditService: dependencies.auditService,
    });
  }

  await registerSecurityRoutes(app, {
    authenticate,
    authService: dependencies.authService,
  });

  if (dependencies.retentionService !== undefined) {
    await registerPrivacyRoutes(app, {
      authenticate,
      retentionService: dependencies.retentionService,
    });
  }

  await registerCatalogRoutes(app, {
    authenticate: authorize(authenticate, 'catalog:operate'),
    catalogService: dependencies.catalogService,
    photoStorage: dependencies.photoStorage,
    ...(dependencies.catalogImportService === undefined
      ? {}
      : { catalogImportService: dependencies.catalogImportService }),
    ...(dependencies.auditService === undefined
      ? {}
      : { auditService: dependencies.auditService }),
  });

  if (dependencies.orderService !== undefined) {
    await registerOrdersRoutes(app, {
      authenticate: authorize(authenticate, 'orders:operate'),
      orderService: dependencies.orderService,
      ...(dependencies.auditService === undefined
        ? {}
        : { auditService: dependencies.auditService }),
    });
  }

  if (dependencies.dashboardService !== undefined) {
    await registerDashboardRoute(app, {
      dashboardService: dependencies.dashboardService,
      authenticate: authorize(authenticate, 'orders:operate'),
    });
  }
  if (dependencies.globalSearchService !== undefined) {
    await registerGlobalSearchRoute(app, {
      globalSearchService: dependencies.globalSearchService,
      authenticate: authorize(authenticate, 'catalog:operate'),
    });
  }
};
