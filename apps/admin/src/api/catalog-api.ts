import type {
  CreateReferenceBody,
  PatchReferenceBody,
  PhotoPublic,
  SetStockBody,
} from '@camila/contracts';

import { apiRequest } from './client';

export type ReferenceSummary = {
  id: string;
  code: string;
  modelName: string;
  color: string;
  priceCop: number;
  active: boolean;
  photo: PhotoPublic | null;
  availableSizes: string[];
  updatedAt: string;
};

export type StockAvailability = {
  size: string;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  updatedAt: string;
};

export type ReferenceDetail = {
  id: string;
  code: string;
  modelName: string;
  color: string;
  priceCop: number;
  active: boolean;
  photo: PhotoPublic | null;
  createdAt: string;
  updatedAt: string;
  stock: StockAvailability[];
};

export type InventoryMovementPublic = {
  id: string;
  size: string;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
  reason: string;
  note: string | null;
  createdAt: string;
};

export type ListReferencesParams = {
  query?: string;
  status?: 'active' | 'inactive' | 'all';
  afterCode?: string;
  limit?: number;
};

export type ListReferencesResult = {
  items: ReferenceSummary[];
  nextAfterCode: string | null;
};

export type ListMovementsParams = {
  size?: string;
  cursor?: string;
  limit?: number;
};

export type ListMovementsResult = {
  items: InventoryMovementPublic[];
  nextCursor: string | null;
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
  const response = await apiRequest<{ data: ListReferencesResult }>(
    `/references${query}`,
  );
  return response.data;
}

export async function createReference(
  body: CreateReferenceBody,
): Promise<ReferenceDetail> {
  const response = await apiRequest<{ data: Omit<ReferenceDetail, 'stock'> }>(
    '/references',
    {
      method: 'POST',
      body,
    },
  );
  return { ...response.data, stock: [] };
}

export async function getReference(
  referenceId: string,
): Promise<ReferenceDetail> {
  const response = await apiRequest<{ data: ReferenceDetail }>(
    `/references/${referenceId}`,
  );
  return response.data;
}

export async function updateReference(
  referenceId: string,
  body: PatchReferenceBody,
): Promise<Omit<ReferenceDetail, 'stock'>> {
  const response = await apiRequest<{ data: Omit<ReferenceDetail, 'stock'> }>(
    `/references/${referenceId}`,
    {
      method: 'PATCH',
      body,
    },
  );
  return response.data;
}

export async function activateReference(
  referenceId: string,
): Promise<Omit<ReferenceDetail, 'stock'>> {
  const response = await apiRequest<{ data: Omit<ReferenceDetail, 'stock'> }>(
    `/references/${referenceId}/activate`,
    { method: 'POST' },
  );
  return response.data;
}

export async function deactivateReference(
  referenceId: string,
): Promise<Omit<ReferenceDetail, 'stock'>> {
  const response = await apiRequest<{ data: Omit<ReferenceDetail, 'stock'> }>(
    `/references/${referenceId}/deactivate`,
    { method: 'POST' },
  );
  return response.data;
}

export async function uploadReferencePhoto(
  referenceId: string,
  file: File,
): Promise<Omit<ReferenceDetail, 'stock'>> {
  const formData = new FormData();
  formData.append('photo', file);
  const response = await apiRequest<{ data: Omit<ReferenceDetail, 'stock'> }>(
    `/references/${referenceId}/photo`,
    {
      method: 'PUT',
      formData,
    },
  );
  return response.data;
}

export async function setStock(
  referenceId: string,
  size: string,
  body: SetStockBody,
): Promise<StockAvailability> {
  const response = await apiRequest<{
    data: StockAvailability & { referenceId: string };
  }>(`/references/${referenceId}/stock/${encodeURIComponent(size)}`, {
    method: 'PUT',
    body,
  });
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
  const response = await apiRequest<{ data: ListMovementsResult }>(
    `/references/${referenceId}/movements${query}`,
  );
  return response.data;
}
