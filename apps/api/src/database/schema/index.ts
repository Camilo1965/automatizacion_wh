export * from './admin.js';
export * from './catalog.js';
export * from './integrations.js';
export * from './orders.js';
export * from './whatsapp.js';
export * from './shipping.js';
export * from './ops.js';
export * from './privacy.js';

import {
  adminAuditEvents,
  adminMfaRecoveryCodes,
  adminMfaSecrets,
  adminSessions,
  adminUsers,
} from './admin.js';
import {
  catalogImports,
  catalogReferences,
  catalogStock,
  inventoryMovements,
} from './catalog.js';
import {
  integrationDrafts,
  integrationSettings,
  integrationVersions,
} from './integrations.js';
import {
  orderConfirmations,
  orderStatusEvents,
  orderSummaries,
  reservationMovements,
  salesOrders,
} from './orders.js';
import {
  botFlowDrafts,
  botFlowVersions,
  whatsappCatalogMenuOptions,
  whatsappCatalogMenus,
  whatsappConversationEvents,
  whatsappConversationMessages,
  whatsappConversations,
  whatsappInboundMessages,
  whatsappOutboundMessages,
} from './whatsapp.js';
import {
  localityCatalogVersions,
  shippingCarrierRules,
  shippingGuideJobs,
  shippingIncidents,
  shippingLocalities,
  shippingLocalityImports,
  shippingObservedCarriers,
  shippingPolicyAudits,
  shippingPreferences,
  shippingQuotes,
} from './shipping.js';
import { inventoryClosures, ownerAlertDeliveries, ownerAlerts } from './ops.js';
import { retentionPolicies, retentionRuns } from './privacy.js';

export const schema = {
  shippingIncidents,
  integrationDrafts,
  integrationVersions,
  localityCatalogVersions,
  botFlowVersions,
  botFlowDrafts,
  adminUsers,
  adminMfaSecrets,
  adminMfaRecoveryCodes,
  adminSessions,
  adminAuditEvents,
  catalogReferences,
  catalogStock,
  inventoryMovements,
  catalogImports,
  shippingLocalities,
  shippingLocalityImports,
  integrationSettings,
  salesOrders,
  orderSummaries,
  orderConfirmations,
  reservationMovements,
  orderStatusEvents,
  whatsappInboundMessages,
  whatsappConversations,
  whatsappConversationMessages,
  whatsappConversationEvents,
  whatsappCatalogMenus,
  whatsappCatalogMenuOptions,
  whatsappOutboundMessages,
  shippingQuotes,
  shippingCarrierRules,
  shippingPreferences,
  shippingObservedCarriers,
  shippingPolicyAudits,
  shippingGuideJobs,
  ownerAlerts,
  ownerAlertDeliveries,
  inventoryClosures,
  retentionPolicies,
  retentionRuns,
};
