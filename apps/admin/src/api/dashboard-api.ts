import {
  DashboardResponseSchema,
  type DashboardSummary,
} from '@camila/contracts';

import { apiRequest } from './client';

export async function getDashboardSummary(
  range: 'today' | '7d' | '30d' = 'today',
): Promise<DashboardSummary> {
  return (
    await apiRequest(`/dashboard?range=${range}`, {
      schema: DashboardResponseSchema,
    })
  ).data;
}
