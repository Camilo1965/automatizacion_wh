import type { FastifyInstance } from 'fastify';
import {
  LoginBodySchema,
  MfaConfirmBodySchema,
  MfaDisableBodySchema,
  MfaVerifyBodySchema,
} from '@camila/contracts';

import type { AppConfig } from '../../config.js';
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
} from '../../http/session-cookie.js';
import type { AuthService } from '../../modules/auth/auth-service.js';
import { clearSessionCookie, type AdminAuthenticate } from './admin-shared.js';

export async function registerAuthRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    config: AppConfig;
    authService: AuthService;
  },
): Promise<void> {
  const { authenticate, config, authService } = dependencies;
  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          keyGenerator(request) {
            const testClient = request.headers['x-camila-test-client'];
            return config.nodeEnv === 'test' && typeof testClient === 'string'
              ? testClient
              : request.ip;
          },
        },
      },
    },
    async (request, reply) => {
      const body = LoginBodySchema.parse(request.body);
      const result = await authService.login(body.username, body.password);
      if (result.kind === 'mfa_required') {
        return reply.status(200).send({
          data: {
            mfaRequired: true as const,
            mfaToken: result.mfaToken,
          },
        });
      }
      reply.setCookie(
        ADMIN_SESSION_COOKIE,
        result.token,
        adminSessionCookieOptions(config.nodeEnv),
      );
      return reply.status(200).send({
        data: {
          user: result.user,
        },
      });
    },
  );

  app.post('/auth/mfa/verify', async (request, reply) => {
    const body = MfaVerifyBodySchema.parse(request.body);
    const result = await authService.completeMfaLogin(body.mfaToken, body.code);
    reply.setCookie(
      ADMIN_SESSION_COOKIE,
      result.token,
      adminSessionCookieOptions(config.nodeEnv),
    );
    return reply.status(200).send({
      data: {
        user: result.user,
      },
    });
  });

  app.get('/auth/mfa/enroll', async (request, reply) => {
    const user = await authenticate(request);
    const status = await authService.getMfaStatus(user.id);
    return reply.status(200).send({ data: status });
  });

  app.post('/auth/mfa/setup', async (request, reply) => {
    const user = await authenticate(request);
    const setup = await authService.beginMfaEnrollment(user.id);
    return reply.status(200).send({ data: setup });
  });

  app.post('/auth/mfa/confirm', async (request, reply) => {
    const user = await authenticate(request);
    const body = MfaConfirmBodySchema.parse(request.body);
    const confirmed = await authService.confirmMfaEnrollment(
      user.id,
      body.code,
    );
    return reply.status(200).send({ data: confirmed });
  });

  app.post('/auth/mfa/disable', async (request, reply) => {
    const user = await authenticate(request);
    const body = MfaDisableBodySchema.parse(request.body);
    await authService.disableMfa(user.id, body.password);
    return reply.status(204).send();
  });

  app.get('/auth/session', async (request, reply) => {
    const user = await authenticate(request);
    return reply.status(200).send({
      data: { user },
    });
  });

  app.post('/auth/logout', async (request, reply) => {
    await authenticate(request);
    const token = request.cookies[ADMIN_SESSION_COOKIE];
    await authService.logout(token);
    clearSessionCookie(reply, config);
    return reply.status(204).send();
  });
}
