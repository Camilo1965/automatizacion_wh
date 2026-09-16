import { z } from 'zod';
const Issue = z.object({
  row: z.number().int(),
  code: z.string(),
  message: z.string(),
});
export const LocalityCatalogVersionsResponseSchema = z
  .object({
    data: z
      .object({
        versions: z.array(
          z
            .object({
              id: z.uuid(),
              status: z.enum(['preview', 'active', 'retired']),
              sourceType: z.string(),
              sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
              rowCount: z.number().int().nonnegative(),
              issues: z.array(Issue),
              author: z.string(),
              createdAt: z.iso.datetime(),
              publishedAt: z.iso.datetime().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();
export const LocalityCatalogPreviewResponseSchema = z
  .object({
    data: z
      .object({
        id: z.uuid(),
        rows: z.array(
          z
            .object({
              carrierCode: z.string().regex(/^\d{8}$/),
              department: z.string(),
              locality: z.string(),
              normalizedName: z.string(),
              country: z.literal('CO'),
            })
            .strict(),
        ),
        rowCount: z.number().int().positive(),
        issues: z.array(Issue),
        excludedCount: z.number().int().nonnegative(),
        baseVersionId: z.uuid().nullable(),
      })
      .strict(),
  })
  .strict();
