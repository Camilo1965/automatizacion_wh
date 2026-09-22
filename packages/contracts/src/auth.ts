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

export const LoginSessionDataSchema = SessionDataSchema;

export const LoginMfaRequiredDataSchema = z
  .object({
    mfaRequired: z.literal(true),
    mfaToken: z.string().min(1),
  })
  .strict();

export const LoginDataSchema = z.union([
  LoginSessionDataSchema,
  LoginMfaRequiredDataSchema,
]);

export type LoginData = z.infer<typeof LoginDataSchema>;

export const LoginResponseSchema = dataEnvelopeSchema(LoginDataSchema);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const MfaVerifyBodySchema = z
  .object({
    mfaToken: z.string().min(1),
    code: z.string().min(1),
  })
  .strict();

export type MfaVerifyBody = z.infer<typeof MfaVerifyBodySchema>;

export const MfaStatusDataSchema = z
  .object({
    enabled: z.boolean(),
    pendingSetup: z.boolean(),
  })
  .strict();

export const MfaStatusResponseSchema = dataEnvelopeSchema(MfaStatusDataSchema);

export const MfaSetupDataSchema = z
  .object({
    secret: z.string().min(1),
    otpauthUri: z.string().min(1),
  })
  .strict();

export const MfaSetupResponseSchema = dataEnvelopeSchema(MfaSetupDataSchema);

export const MfaConfirmBodySchema = z
  .object({
    code: z.string().min(1),
  })
  .strict();

export const MfaConfirmDataSchema = z
  .object({
    recoveryCodes: z.array(z.string().min(1)),
  })
  .strict();

export const MfaConfirmResponseSchema =
  dataEnvelopeSchema(MfaConfirmDataSchema);

export const MfaDisableBodySchema = z
  .object({
    password: z.string().min(1),
  })
  .strict();
