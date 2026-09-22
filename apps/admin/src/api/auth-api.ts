import {
  LoginResponseSchema,
  MfaVerifyBodySchema,
  SessionResponseSchema,
  type AdminUserPublic,
} from '@camila/contracts';

import { apiRequest, apiRequestNoContent, ApiClientError } from './client';

export type LoginResult =
  | { kind: 'session'; user: AdminUserPublic }
  | { kind: 'mfa_required'; mfaToken: string };

export async function login(
  username: string,
  password: string,
): Promise<LoginResult> {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: { username, password },
    skipUnauthorizedHandler: true,
    schema: LoginResponseSchema,
  });
  if ('mfaRequired' in response.data) {
    return { kind: 'mfa_required', mfaToken: response.data.mfaToken };
  }
  return { kind: 'session', user: response.data.user };
}

export async function verifyMfaLogin(
  mfaToken: string,
  code: string,
): Promise<AdminUserPublic> {
  const body = MfaVerifyBodySchema.parse({ mfaToken, code });
  const response = await apiRequest('/auth/mfa/verify', {
    method: 'POST',
    body,
    skipUnauthorizedHandler: true,
    schema: SessionResponseSchema,
  });
  return response.data.user;
}

export async function fetchSession(): Promise<AdminUserPublic | null> {
  try {
    const response = await apiRequest('/auth/session', {
      method: 'GET',
      skipUnauthorizedHandler: true,
      schema: SessionResponseSchema,
    });
    return response.data.user;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await apiRequestNoContent('/auth/logout', {
    method: 'POST',
    skipUnauthorizedHandler: true,
  });
}
