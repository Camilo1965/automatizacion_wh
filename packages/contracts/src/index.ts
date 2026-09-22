import { z } from 'zod';

export * from './shared.js';
export * from './auth.js';
export * from './catalog.js';
export * from './orders.js';
export * from './inventory.js';
export * from './shipping.js';
export * from './integrations-settings.js';
export * from './dashboard.js';
export * from './conversations.js';
export * from './whatsapp-connection.js';
export * from './operations.js';
export * from './global-search.js';
export * from './bot-flow.js';
export * from './locality-catalog.js';
export * from './integration-lifecycle.js';
export * from './shipping-incidents.js';
export * from './shipping-simulation.js';
export * from './configuration-audit.js';

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        field: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;
