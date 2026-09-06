import {
  ListMovementsResponseSchema,
  ListReferencesResponseSchema,
  PhotoUploadResponseSchema,
  ReferenceDetailResponseSchema,
  ReferencePublicResponseSchema,
  StockResponseSchema,
  type CreateReferenceBody,
  type InventoryMovementPublic,
  type ListMovementsResult,
  type ListReferencesResult,
  type PatchReferenceBody,
  type PhotoUploadResponse,
  type ReferenceDetail,
  type ReferencePublic,
  type ReferenceSummary,
  type SetStockBody,
  type StockAvailability,
} from '@camila/contracts';

import { apiRequest } from './client';

export type {
  InventoryMovementPublic,
  ListMovementsResult,
  ListReferencesResult,
  ReferenceDetail,
  ReferencePublic,
  ReferenceSummary,
  StockAvailability,
};

export type ListReferencesParams = {
  query?: string;
  status?: 'active' | 'inactive' | 'all';
  afterCode?: string;
  limit?: number;
};

export type ListMovementsParams = {
  size?: string;
  cursor?: string;
  limit?: number;
};

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
}

export async function listReferences(
  params: ListReferencesParams = {},
): Promise<ListReferencesResult> {
  const query = toQuery({
    query: params.query,
    status: params.status,
    afterCode: params.afterCode,
    limit: params.limit,
  });
  const response = await apiRequest(`/references${query}`, {
    schema: ListReferencesResponseSchema,
  });
  return response.data;
}

export async function createReference(
  body: CreateReferenceBody,
): Promise<ReferenceDetail> {
  const response = await apiRequest('/references', {
    method: 'POST',
    body,
    schema: ReferencePublicResponseSchema,
  });
  return { ...response.data, stock: [] };
}

export async function getReference(
  referenceId: string,
): Promise<ReferenceDetail> {
  const response = await apiRequest(`/references/${referenceId}`, {
    schema: ReferenceDetailResponseSchema,
  });
  return response.data;
}

export async function updateReference(
  referenceId: string,
  body: PatchReferenceBody,
): Promise<ReferencePublic> {
  const response = await apiRequest(`/references/${referenceId}`, {
    method: 'PATCH',
    body,
    schema: ReferencePublicResponseSchema,
  });
  return response.data;
}

export async function activateReference(
  referenceId: string,
): Promise<ReferencePublic> {
  const response = await apiRequest(`/references/${referenceId}/activate`, {
    method: 'POST',
    schema: ReferencePublicResponseSchema,
  });
  return response.data;
}

export async function deactivateReference(
  referenceId: string,
): Promise<ReferencePublic> {
  const response = await apiRequest(`/references/${referenceId}/deactivate`, {
    method: 'POST',
    schema: ReferencePublicResponseSchema,
  });
  return response.data;
}

export async function uploadReferencePhoto(
  referenceId: string,
  file: File,
): Promise<PhotoUploadResponse> {
  const formData = new FormData();
  formData.append('photo', file);
  return apiRequest(`/references/${referenceId}/photo`, {
    method: 'PUT',
    formData,
    schema: PhotoUploadResponseSchema,
  });
}

export async function setStock(
  referenceId: string,
  size: string,
  body: SetStockBody,
): Promise<StockAvailability> {
  const response = await apiRequest(
    `/references/${referenceId}/stock/${encodeURIComponent(size)}`,
    {
      method: 'PUT',
      body,
      schema: StockResponseSchema,
    },
  );
  return {
    size: response.data.size,
    physicalQuantity: response.data.physicalQuantity,
    reservedQuantity: response.data.reservedQuantity,
    availableQuantity: response.data.availableQuantity,
    updatedAt: response.data.updatedAt,
  };
}

export async function listMovements(
  referenceId: string,
  params: ListMovementsParams = {},
): Promise<ListMovementsResult> {
  const query = toQuery({
    size: params.size,
    cursor: params.cursor,
    limit: params.limit,
  });
  const response = await apiRequest(
    `/references/${referenceId}/movements${query}`,
    {
      schema: ListMovementsResponseSchema,
    },
  );
  return response.data;
}
