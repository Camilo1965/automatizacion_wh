import {
  DashboardResponseSchema,
  type DashboardSummary,
} from '@camila/contracts';

import { apiRequest } from './client';

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return (
    await apiRequest('/dashboard', {
      schema: DashboardResponseSchema,
    })
  ).data;
}
