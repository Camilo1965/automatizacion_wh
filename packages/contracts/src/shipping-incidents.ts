import { z } from 'zod';
export const ShippingIncidentsResponseSchema = z
  .object({
    data: z
      .object({
        incidents: z.array(
          z
            .object({
              id: z.number().int().positive(),
              preShipmentNumber: z.string(),
              orderId: z.uuid().nullable(),
              description: z.string(),
              observations: z.string().nullable(),
              response: z.string().nullable(),
              responseStatus: z.enum([
                'open',
                'processing',
                'sent',
                'uncertain',
              ]),
              author: z.string().nullable(),
              syncedAt: z.iso.datetime(),
              respondedAt: z.iso.datetime().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();
