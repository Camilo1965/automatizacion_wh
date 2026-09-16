import { z } from 'zod';
const Quote = z
  .object({
    carrier: z.string(),
    totalCop: z.number().nonnegative(),
    insuranceMode: z.enum(['none', 'standard', 'plus']),
    selected: z.boolean(),
    reason: z.enum([
      'selected',
      'excluded',
      'not_allowed',
      'higher_cost_or_preference',
      'required_unavailable',
    ]),
  })
  .strict();
export const ShippingSimulationResponseSchema = z
  .object({
    data: z
      .object({
        localityCarrierCode: z.string().regex(/^\d{8}$/),
        selectedCarrier: z.string().nullable(),
        blocked: z.boolean(),
        quotes: z.array(Quote),
        sideEffects: z.literal(false),
      })
      .strict(),
  })
  .strict();
