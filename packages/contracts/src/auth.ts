import { z } from 'zod';

import { dataEnvelopeSchema, publicUsernameSchema } from './shared.js';

export const AdminUserPublicSchema = z
  .object({
    id: z.uuid(),
    username: publicUsernameSchema,
  })
  .strict();

export type AdminUserPublic = z.infer<typeof AdminUserPublicSchema>;

export const LoginBodySchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
  })
  .strict();

export type LoginBody = z.infer<typeof LoginBodySchema>;

export const SessionDataSchema = z
  .object({
    user: AdminUserPublicSchema,
  })
  .strict();

export type SessionData = z.infer<typeof SessionDataSchema>;

export const SessionResponseSchema = dataEnvelopeSchema(SessionDataSchema);
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const LoginResponseSchema = dataEnvelopeSchema(SessionDataSchema);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
