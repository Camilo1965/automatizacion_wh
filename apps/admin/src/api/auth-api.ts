import type { AdminUserPublic } from '@camila/contracts';

import { apiRequest } from './client';

type UserEnvelope = {
  data: {
    user: AdminUserPublic;
  };
};

export async function login(
  username: string,
  password: string,
): Promise<AdminUserPublic> {
  const response = await apiRequest<UserEnvelope>('/auth/login', {
    method: 'POST',
    body: { username, password },
    skipUnauthorizedHandler: true,
  });
  return response.data.user;
}

export async function fetchSession(): Promise<AdminUserPublic | null> {
  try {
    const response = await apiRequest<UserEnvelope>('/auth/session', {
      method: 'GET',
      skipUnauthorizedHandler: true,
    });
    return response.data.user;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error as { status: number }).status === 401
    ) {
      return null;
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', {
    method: 'POST',
    skipUnauthorizedHandler: true,
  });
}
