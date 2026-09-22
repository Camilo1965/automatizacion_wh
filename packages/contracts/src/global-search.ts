import { z } from 'zod';

export const GlobalSearchKindSchema = z.enum([
  'order',
  'conversation',
  'reference',
]);

export type GlobalSearchKind = z.infer<typeof GlobalSearchKindSchema>;

export const GlobalSearchHitSchema = z
  .object({
    kind: GlobalSearchKindSchema,
    id: z.string().uuid(),
    label: z.string().min(1).max(240),
    href: z.string().min(1).max(240),
  })
  .strict();

export type GlobalSearchHit = z.infer<typeof GlobalSearchHitSchema>;

export const GlobalSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(80),
    limit: z.coerce.number().int().min(1).max(20).default(12),
  })
  .strict();

export type GlobalSearchQuery = z.infer<typeof GlobalSearchQuerySchema>;

export const GlobalSearchDataSchema = z
  .object({
    items: z.array(GlobalSearchHitSchema).max(20),
  })
  .strict();

export const GlobalSearchResponseSchema = z
  .object({
    data: GlobalSearchDataSchema,
  })
  .strict();

export type GlobalSearchResponse = z.infer<typeof GlobalSearchResponseSchema>;
