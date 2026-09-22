import {
  LoginResponseSchema,
  MfaConfirmBodySchema,
  MfaConfirmResponseSchema,
  MfaDisableBodySchema,
  MfaSetupResponseSchema,
  MfaStatusResponseSchema,
  MfaVerifyBodySchema,
  AdminSessionListResponseSchema,
  SessionIdParamsSchema,
  SessionResponseSchema,
  type AdminSessionPublic,
  type AdminUserPublic,
  type MfaStatusData,
} from '@camila/contracts';

import { apiRequest, apiRequestNoContent, ApiClientError } from './client';

export type LoginResult =
  | { kind: 'session'; user: AdminUserPublic }
  | { kind: 'mfa_required'; mfaToken: string };

export type MfaStatus = MfaStatusData;

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

export async function fetchMfaStatus(): Promise<MfaStatus> {
  const response = await apiRequest('/auth/mfa/enroll', {
    method: 'GET',
    schema: MfaStatusResponseSchema,
  });
  return response.data;
}

export async function beginMfaSetup(): Promise<{
  secret: string;
  otpauthUri: string;
}> {
  const response = await apiRequest('/auth/mfa/setup', {
    method: 'POST',
    schema: MfaSetupResponseSchema,
  });
  return response.data;
}

export async function confirmMfaSetup(code: string): Promise<string[]> {
  const body = MfaConfirmBodySchema.parse({ code });
  const response = await apiRequest('/auth/mfa/confirm', {
    method: 'POST',
    body,
    schema: MfaConfirmResponseSchema,
  });
  return response.data.recoveryCodes;
}

export async function disableMfa(password: string): Promise<void> {
  const body = MfaDisableBodySchema.parse({ password });
  await apiRequestNoContent('/auth/mfa/disable', {
    method: 'POST',
    body,
  });
}

export async function listSessions(): Promise<AdminSessionPublic[]> {
  const response = await apiRequest('/auth/sessions', {
    method: 'GET',
    schema: AdminSessionListResponseSchema,
  });
  return response.data.items;
}

export async function revokeSession(sessionId: string): Promise<void> {
  SessionIdParamsSchema.parse({ sessionId });
  await apiRequestNoContent(`/auth/sessions/${sessionId}/revoke`, {
    method: 'POST',
  });
}

export async function revokeOtherSessions(): Promise<void> {
  await apiRequestNoContent('/auth/sessions/revoke-others', {
    method: 'POST',
  });
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
