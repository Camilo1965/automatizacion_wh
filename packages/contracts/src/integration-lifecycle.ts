import { z } from 'zod';
export const IntegrationLifecycleResponseSchema = z
  .object({
    data: z
      .object({
        drafts: z.array(
          z
            .object({
              provider: z.enum(['whatsapp', 'shipping']),
              revision: z.number().int().positive(),
              tested: z.boolean(),
              testedAt: z.iso.datetime().nullable(),
            })
            .strict(),
        ),
        versions: z.array(
          z
            .object({
              id: z.uuid(),
              provider: z.enum(['whatsapp', 'shipping']),
              revision: z.number().int().positive(),
              author: z.string(),
              createdAt: z.iso.datetime(),
              status: z.enum(['active', 'retired']),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();
