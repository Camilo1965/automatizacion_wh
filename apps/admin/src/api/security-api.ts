import {
  AdminUserListResponseSchema,
  CreateAdminUserBodySchema,
  DeactivateAdminUserBodySchema,
  SessionResponseSchema,
  UpdateAdminUserRoleBodySchema,
  type AdminRole,
  type AdminUserPublic,
} from '@camila/contracts';
import { z } from 'zod';

import { apiRequest } from './client';

const ManagedUserResponseSchema = z
  .object({
    data: z.object({ user: SessionResponseSchema.shape.data.shape.user }),
  })
  .strict();

export async function listAdminUsers(): Promise<AdminUserPublic[]> {
  const response = await apiRequest('/security/users', {
    method: 'GET',
    schema: AdminUserListResponseSchema,
  });
  return response.data.items;
}

export async function createAdminUser(input: {
  username: string;
  password: string;
  passwordConfirmation: string;
  role: AdminRole;
  currentPassword: string;
}): Promise<AdminUserPublic> {
  const body = CreateAdminUserBodySchema.parse(input);
  const response = await apiRequest('/security/users', {
    method: 'POST',
    body,
    schema: ManagedUserResponseSchema,
  });
  return response.data.user;
}

export async function updateAdminUserRole(
  userId: string,
  input: { role: AdminRole; currentPassword: string },
): Promise<AdminUserPublic> {
  const body = UpdateAdminUserRoleBodySchema.parse(input);
  const response = await apiRequest(`/security/users/${userId}/role`, {
    method: 'PATCH',
    body,
    schema: ManagedUserResponseSchema,
  });
  return response.data.user;
}

export async function deactivateAdminUser(
  userId: string,
  input: { currentPassword: string },
): Promise<AdminUserPublic> {
  const body = DeactivateAdminUserBodySchema.parse(input);
  const response = await apiRequest(`/security/users/${userId}/deactivate`, {
    method: 'POST',
    body,
    schema: ManagedUserResponseSchema,
  });
  return response.data.user;
}
