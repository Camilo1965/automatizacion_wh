import type {
  CatalogImportRowError,
  ParsedCatalogImportReference,
} from './catalog-import-csv.js';

export type CatalogImportStatus = 'previewed' | 'invalid' | 'committed';

export type CatalogImportPreviewInput = Readonly<{
  sha256: string;
  references: readonly ParsedCatalogImportReference[];
  errors: readonly CatalogImportRowError[];
}>;

export type CatalogImport = Readonly<
  CatalogImportPreviewInput & {
    id: string;
    status: CatalogImportStatus;
    createdAt: Date;
  }
>;

export interface CatalogImportRepository {
  createPreview(input: CatalogImportPreviewInput): Promise<CatalogImport>;
  confirm(importId: string): Promise<CatalogImport>;
}
