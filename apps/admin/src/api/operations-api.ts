import {
  IntegrationHealthResponseSchema,
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
export async function getAlerts() {
  return (await apiRequest('/alerts', { schema: OwnerAlertsResponseSchema }))
    .data;
}
