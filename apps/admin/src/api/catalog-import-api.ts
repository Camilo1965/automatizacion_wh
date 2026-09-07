import {
  CatalogReadinessResponseSchema,
  CatalogImportResponseSchema,
  type CatalogImportResult,
} from '@camila/contracts';
import { apiRequest } from './client';

export async function previewCatalogImport(
  file: File,
): Promise<CatalogImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  return (
    await apiRequest('/catalog-imports/preview', {
      method: 'POST',
      formData,
      schema: CatalogImportResponseSchema,
    })
  ).data;
}

export async function commitCatalogImport(
  id: string,
): Promise<CatalogImportResult> {
  return (
    await apiRequest(`/catalog-imports/${encodeURIComponent(id)}/commit`, {
      method: 'POST',
      schema: CatalogImportResponseSchema,
    })
  ).data;
}

export async function getCatalogReadiness() {
  return (
    await apiRequest('/catalog-readiness', {
      schema: CatalogReadinessResponseSchema,
    })
  ).data;
}
