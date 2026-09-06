import {
  LoginResponseSchema,
  SessionResponseSchema,
  type AdminUserPublic,
} from '@camila/contracts';

import { apiRequest, apiRequestNoContent, ApiClientError } from './client';

export async function login(
  username: string,
  password: string,
): Promise<AdminUserPublic> {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: { username, password },
    skipUnauthorizedHandler: true,
    schema: LoginResponseSchema,
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
