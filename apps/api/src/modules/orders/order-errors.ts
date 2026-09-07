export class OrderValidationError extends Error {
  constructor(
    readonly field: string,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

export class OrderConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OrderConflictError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(message = 'Order was not found') {
    super(message);
    this.name = 'OrderNotFoundError';
  }
}
