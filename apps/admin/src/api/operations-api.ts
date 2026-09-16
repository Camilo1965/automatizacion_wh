import {
  IntegrationHealthResponseSchema,
  IntegrationSettingsResponseSchema,
  InventoryClosureResponseSchema,
  InventoryClosuresResponseSchema,
  OwnerAlertsResponseSchema,
} from '@camila/contracts';
import { apiRequest } from './client';

export async function getIntegrationHealth() {
  return (
    await apiRequest('/integrations/health', {
      schema: IntegrationHealthResponseSchema,
    })
  ).data;
}
export async function getIntegrationSettings() {
  return (
    await apiRequest('/integrations/settings', {
      schema: IntegrationSettingsResponseSchema,
    })
  ).data;
}
export async function updateIntegrationSettings(body: unknown) {
  return (
    await apiRequest('/integrations/settings', {
      method: 'PATCH',
      body,
      schema: IntegrationSettingsResponseSchema,
    })
  ).data;
}
export async function getAlerts() {
  return (await apiRequest('/alerts', { schema: OwnerAlertsResponseSchema }))
    .data;
}
export async function getInventoryClosures() {
  return (
    await apiRequest('/inventory/closures', {
      schema: InventoryClosuresResponseSchema,
    })
  ).data;
}
export async function acknowledgeInventoryClosure(id: string) {
  return (
    await apiRequest(`/inventory/closures/${id}/acknowledge`, {
      method: 'POST',
      schema: InventoryClosureResponseSchema,
    })
  ).data;
}
