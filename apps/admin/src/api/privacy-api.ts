import {
  DataSubjectPreviewResponseSchema,
  DataSubjectResultResponseSchema,
  PrivacyInventoryResponseSchema,
  RetentionPolicyListResponseSchema,
  RetentionPolicyResponseSchema,
  RetentionRunListResponseSchema,
  RetentionRunResponseSchema,
  type CreateRetentionPolicyBody,
  type DataSubjectExecuteBody,
  type DataSubjectPreviewBody,
  type RetentionPolicy,
  type RetentionRun,
  type StartRetentionRunBody,
} from '@camila/contracts';

import { apiRequest } from './client';

export async function fetchPrivacyInventory() {
  const response = await apiRequest('/privacy/inventory', {
    method: 'GET',
    schema: PrivacyInventoryResponseSchema,
  });
  return response.data;
}

export async function listRetentionPolicies(): Promise<RetentionPolicy[]> {
  const response = await apiRequest('/privacy/policies', {
    method: 'GET',
    schema: RetentionPolicyListResponseSchema,
  });
  return response.data.items;
}

export async function createRetentionPolicy(
  body: CreateRetentionPolicyBody,
): Promise<RetentionPolicy> {
  const response = await apiRequest('/privacy/policies', {
    method: 'POST',
    body,
    schema: RetentionPolicyResponseSchema,
  });
  return response.data.policy;
}

export async function activateRetentionPolicy(
  policyId: string,
  body: { currentPassword: string; confirmIrreversible: true },
): Promise<RetentionPolicy> {
  const response = await apiRequest(`/privacy/policies/${policyId}/activate`, {
    method: 'POST',
    body,
    schema: RetentionPolicyResponseSchema,
  });
  return response.data.policy;
}

export async function listRetentionRuns(): Promise<RetentionRun[]> {
  const response = await apiRequest('/privacy/runs', {
    method: 'GET',
    schema: RetentionRunListResponseSchema,
  });
  return response.data.items;
}

export async function startRetentionRun(
  body: StartRetentionRunBody & { policyId?: string },
): Promise<RetentionRun> {
  const response = await apiRequest('/privacy/runs', {
    method: 'POST',
    body,
    schema: RetentionRunResponseSchema,
  });
  return response.data.run;
}

export async function resumeRetentionRun(
  runId: string,
  body: { currentPassword: string },
): Promise<RetentionRun> {
  const response = await apiRequest(`/privacy/runs/${runId}/resume`, {
    method: 'POST',
    body,
    schema: RetentionRunResponseSchema,
  });
  return response.data.run;
}

export async function previewDataSubject(body: DataSubjectPreviewBody) {
  const response = await apiRequest('/privacy/data-subject/preview', {
    method: 'POST',
    body,
    schema: DataSubjectPreviewResponseSchema,
  });
  return response.data.preview;
}

export async function executeDataSubject(body: DataSubjectExecuteBody) {
  const response = await apiRequest('/privacy/data-subject/execute', {
    method: 'POST',
    body,
    schema: DataSubjectResultResponseSchema,
  });
  return response.data.result;
}
