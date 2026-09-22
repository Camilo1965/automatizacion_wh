import type { FastifyInstance } from 'fastify';
import {
  ActivateRetentionPolicyBodySchema,
  CreateRetentionPolicyBodySchema,
  DataSubjectExecuteBodySchema,
  DataSubjectPreviewBodySchema,
  StartRetentionRunBodySchema,
} from '@camila/contracts';
import { z } from 'zod';

import {
  RetentionConfirmationRequiredError,
  RetentionExecutionDisabledError,
  RetentionPolicyNotApprovedError,
  RetentionValidationError,
  type RetentionService,
} from '../../modules/privacy/retention-service.js';
import { authorize, type AdminAuthenticate } from './admin-shared.js';

const ResumeBodySchema = z
  .object({
    currentPassword: z.string().min(1),
  })
  .strict();

const StartRunWithPolicySchema = StartRetentionRunBodySchema.extend({
  policyId: z.string().uuid().optional(),
});

export async function registerPrivacyRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    retentionService: RetentionService;
  },
): Promise<void> {
  const requireSecurity = authorize(
    dependencies.authenticate,
    'security:manage',
  );
  const requireAuditRead = authorize(dependencies.authenticate, 'audit:read');

  app.get('/privacy/inventory', async (request) => {
    await requireSecurity(request);
    return { data: dependencies.retentionService.getInventory() };
  });

  app.get('/privacy/policies', async (request) => {
    await requireSecurity(request);
    const items = await dependencies.retentionService.listPolicies();
    return { data: { items } };
  });

  app.post('/privacy/policies', async (request) => {
    const user = await requireSecurity(request);
    const body = CreateRetentionPolicyBodySchema.parse(request.body);
    const policy = await dependencies.retentionService.createDraftPolicy(user, {
      classes: body.classes,
      currentPassword: body.currentPassword,
      ...(body.note === undefined ? {} : { note: body.note }),
    });
    return { data: { policy } };
  });

  app.post('/privacy/policies/:policyId/activate', async (request) => {
    const user = await requireSecurity(request);
    const params = z
      .object({ policyId: z.string().uuid() })
      .parse(request.params);
    const body = ActivateRetentionPolicyBodySchema.parse(request.body);
    const policy = await dependencies.retentionService.activatePolicy(
      user,
      params.policyId,
      body,
    );
    return { data: { policy } };
  });

  app.get('/privacy/runs', async (request) => {
    await requireAuditRead(request);
    const items = await dependencies.retentionService.listRuns();
    return { data: { items } };
  });

  app.get('/privacy/runs/:runId', async (request, reply) => {
    await requireAuditRead(request);
    const params = z.object({ runId: z.string().uuid() }).parse(request.params);
    const run = await dependencies.retentionService.getRun(params.runId);
    if (run === null) {
      return reply
        .status(404)
        .send({ error: { code: 'not_found', message: 'Run not found' } });
    }
    return { data: { run } };
  });

  app.post('/privacy/runs', async (request) => {
    const user = await requireSecurity(request);
    const body = StartRunWithPolicySchema.parse(request.body);
    const run = await dependencies.retentionService.startRun(user, {
      mode: body.mode,
      currentPassword: body.currentPassword,
      ...(body.confirmIrreversible === undefined
        ? {}
        : { confirmIrreversible: body.confirmIrreversible }),
      ...(body.policyId === undefined ? {} : { policyId: body.policyId }),
      ...(body.batchSize === undefined ? {} : { batchSize: body.batchSize }),
    });
    return { data: { run } };
  });

  app.post('/privacy/runs/:runId/resume', async (request) => {
    const user = await requireSecurity(request);
    const params = z.object({ runId: z.string().uuid() }).parse(request.params);
    const body = ResumeBodySchema.parse(request.body);
    const run = await dependencies.retentionService.resumeRun(
      user,
      params.runId,
      body,
    );
    return { data: { run } };
  });

  app.post('/privacy/data-subject/preview', async (request) => {
    const user = await requireSecurity(request);
    const body = DataSubjectPreviewBodySchema.parse(request.body);
    const preview = await dependencies.retentionService.previewDataSubject(
      user,
      body,
    );
    return { data: { preview } };
  });

  app.post('/privacy/data-subject/execute', async (request) => {
    const user = await requireSecurity(request);
    const body = DataSubjectExecuteBodySchema.parse(request.body);
    const result = await dependencies.retentionService.executeDataSubject(
      user,
      body,
    );
    return { data: { result } };
  });
}

export function mapPrivacyError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
} | null {
  if (error instanceof RetentionExecutionDisabledError) {
    return { statusCode: 403, code: error.code, message: error.message };
  }
  if (error instanceof RetentionPolicyNotApprovedError) {
    return { statusCode: 409, code: error.code, message: error.message };
  }
  if (error instanceof RetentionConfirmationRequiredError) {
    return { statusCode: 400, code: error.code, message: error.message };
  }
  if (error instanceof RetentionValidationError) {
    return { statusCode: 400, code: error.code, message: error.message };
  }
  return null;
}
