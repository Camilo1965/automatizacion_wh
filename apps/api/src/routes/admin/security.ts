import type { FastifyInstance } from 'fastify';
import {
  CreateAdminUserBodySchema,
  DeactivateAdminUserBodySchema,
  UpdateAdminUserRoleBodySchema,
} from '@camila/contracts';
import { z } from 'zod';

import type { AuthService } from '../../modules/auth/auth-service.js';
import { authorize, type AdminAuthenticate } from './admin-shared.js';

export async function registerSecurityRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    authService: AuthService;
  },
): Promise<void> {
  const requireSecurity = authorize(
    dependencies.authenticate,
    'security:manage',
  );

  app.get('/security/users', async (request, reply) => {
    const actor = await requireSecurity(request);
    const items = await dependencies.authService.listUsers(actor);
    return reply.status(200).send({ data: { items } });
  });

  app.post('/security/users', async (request, reply) => {
    const actor = await requireSecurity(request);
    const body = CreateAdminUserBodySchema.parse(request.body);
    const user = await dependencies.authService.createManagedUser(actor, {
      username: body.username,
      password: body.password,
      passwordConfirmation: body.passwordConfirmation,
      role: body.role,
      currentPassword: body.currentPassword,
    });
    return reply.status(201).send({ data: { user } });
  });

  app.patch('/security/users/:userId/role', async (request, reply) => {
    const actor = await requireSecurity(request);
    const { userId } = z.object({ userId: z.uuid() }).parse(request.params);
    const body = UpdateAdminUserRoleBodySchema.parse(request.body);
    const user = await dependencies.authService.updateUserRole(actor, userId, {
      role: body.role,
      currentPassword: body.currentPassword,
    });
    return reply.status(200).send({ data: { user } });
  });

  app.post('/security/users/:userId/deactivate', async (request, reply) => {
    const actor = await requireSecurity(request);
    const { userId } = z.object({ userId: z.uuid() }).parse(request.params);
    const body = DeactivateAdminUserBodySchema.parse(request.body);
    const user = await dependencies.authService.deactivateUser(actor, userId, {
      currentPassword: body.currentPassword,
    });
    return reply.status(200).send({ data: { user } });
  });
}
