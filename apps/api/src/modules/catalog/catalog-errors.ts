export class CatalogValidationError extends Error {
  readonly field: string;
  readonly code: string;

  constructor(field: string, code: string, message: string) {
    super(message);
    this.name = 'CatalogValidationError';
    this.field = field;
    this.code = code;
  }
}

export class CatalogConflictError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CatalogConflictError';
    this.code = code;
  }
}

export class CatalogImportValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CatalogImportValidationError';
    this.code = code;
  }
}

export class CatalogNotFoundError extends Error {
  readonly entity: 'reference';

  constructor(message: string) {
    super(message);
    this.name = 'CatalogNotFoundError';
    this.entity = 'reference';
  }
}

export class PhotoValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PhotoValidationError';
    this.code = code;
  }
}

export class PhotoCleanupError extends Error {
  readonly storageKey: string;
  readonly replacementApplied: true;

  constructor(storageKey: string, message: string) {
    super(message);
    this.name = 'PhotoCleanupError';
    this.storageKey = storageKey;
    this.replacementApplied = true;
  }
}
