import { z } from 'zod';
export const ConfigurationAuditResponseSchema = z
  .object({
    data: z
      .object({
        items: z.array(
          z
            .object({
              id: z.uuid(),
              scope: z.string(),
              action: z.string(),
              author: z.string(),
              revision: z.number().int().nullable(),
              createdAt: z.iso.datetime(),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();
