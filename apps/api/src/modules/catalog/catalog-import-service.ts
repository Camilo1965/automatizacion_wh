import { createHash } from 'node:crypto';

import { parseCatalogImportCsv } from './catalog-import-csv.js';
import { CatalogImportValidationError } from './catalog-errors.js';
import type {
  CatalogImport,
  CatalogImportRepository,
} from './catalog-import-repository.js';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export class CatalogImportService {
  constructor(private readonly repository: CatalogImportRepository) {}

  async preview(bytes: Uint8Array): Promise<CatalogImport> {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMPORT_BYTES) {
      throw new CatalogImportValidationError(
        'invalid_import_file_size',
        'El archivo CSV debe tener entre 1 byte y 2 MiB',
      );
    }

    let csv: string;
    try {
      csv = textDecoder.decode(bytes);
    } catch {
      throw new CatalogImportValidationError(
        'invalid_import_encoding',
        'El archivo CSV debe usar codificación UTF-8',
      );
    }
    const parsed = parseCatalogImportCsv(csv);
    return this.repository.createPreview({
      sha256: createHash('sha256').update(bytes).digest('hex'),
      references: parsed.references,
      errors: parsed.errors,
    });
  }

  confirm(importId: string): Promise<CatalogImport> {
    return this.repository.confirm(importId);
  }
}
