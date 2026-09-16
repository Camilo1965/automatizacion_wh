import { createHash } from 'node:crypto';

import { parseColombianLocalitiesCsv } from './locality-import.js';
import {
  parse99EnviosLocalitySource,
  toColombianLocalities,
} from './99envios-locality-source.js';
import type {
  LocalityListInput,
  LocalityRepository,
} from './locality-repository.js';

export class LocalityImportError extends Error {
  readonly issues: readonly Readonly<{
    row: number;
    code: string;
    message: string;
  }>[];

  constructor(
    issues: readonly Readonly<{ row: number; code: string; message: string }>[],
  ) {
    super('El archivo de localidades contiene errores');
    this.name = 'LocalityImportError';
    this.issues = issues;
  }
}

export class LocalityService {
  constructor(private readonly repository: LocalityRepository) {}

  async importCsv(bytes: Uint8Array) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new LocalityImportError([
        {
          row: 1,
          code: 'invalid_encoding',
          message: 'El archivo debe usar codificación UTF-8',
        },
      ]);
    }
    const parsed = parseColombianLocalitiesCsv(text);
    if (parsed.errors.length > 0) throw new LocalityImportError(parsed.errors);
    if (parsed.localities.length === 0) {
      throw new LocalityImportError([
        {
          row: 1,
          code: 'empty_dataset',
          message: 'El archivo debe incluir al menos una localidad',
        },
      ]);
    }
    return this.repository.replaceAll({
      localities: parsed.localities,
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      sourceType: 'csv',
    });
  }

  async import99EnviosSource(source: string) {
    const parsed = parse99EnviosLocalitySource(source);
    if (parsed.issues.length > 0) throw new LocalityImportError(parsed.issues);
    const localities = toColombianLocalities(parsed.rows);
    if (localities.length === 0) {
      throw new LocalityImportError([
        {
          row: 1,
          code: 'empty_dataset',
          message: 'La fuente no incluye localidades colombianas válidas',
        },
      ]);
    }
    return this.repository.replaceAll({
      localities,
      sourceSha256: createHash('sha256').update(source, 'utf8').digest('hex'),
      sourceType: '99envios_document',
    });
  }

  list(input: LocalityListInput) {
    return this.repository.list({
      ...input,
      ...(input.query === undefined
        ? {}
        : {
            query: input.query
              .trim()
              .normalize('NFD')
              .replace(/\p{Diacritic}/gu, '')
              .toLocaleLowerCase('es-CO'),
          }),
    });
  }

  listDepartments() {
    return this.repository.listDepartments();
  }
}
