import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import {
  AuthenticationRequiredError,
  InvalidCredentialsError,
  PasswordMismatchError,
  UsernameConflictError,
  UserNotFoundError,
} from '../modules/auth/auth-errors.js';
import { UsernameValidationError } from '../modules/auth/username.js';
import { PasswordValidationError } from '../modules/auth/password.js';
import {
  CatalogConflictError,
  CatalogImportValidationError,
  CatalogNotFoundError,
  CatalogValidationError,
  PhotoValidationError,
} from '../modules/catalog/catalog-errors.js';
import { LocalityImportError } from '../modules/localities/locality-service.js';
import {
  OrderConflictError,
  OrderNotFoundError,
  OrderValidationError,
} from '../modules/orders/order-errors.js';
import { ShippingDomainError } from '../modules/shipping/shipping-quote-service.js';

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    field?: string;
  };
};

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  field?: string,
): FastifyReply {
  const body: ApiErrorBody = {
    error: field === undefined ? { code, message } : { code, message, field },
  };
  return reply.status(statusCode).send(body);
}

export function mapDomainError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply | null {
  if (error instanceof InvalidCredentialsError) {
    return sendApiError(reply, 401, error.code, error.message);
  }

  if (error instanceof AuthenticationRequiredError) {
    return sendApiError(reply, 401, error.code, error.message);
  }

  if (error instanceof UsernameValidationError) {
    return sendApiError(reply, 400, error.code, error.message, 'username');
  }

  if (error instanceof PasswordValidationError) {
    return sendApiError(reply, 400, error.code, error.message, 'password');
  }

  if (error instanceof PasswordMismatchError) {
    return sendApiError(reply, 400, error.code, error.message, error.field);
  }

  if (error instanceof UsernameConflictError) {
    return sendApiError(reply, 409, error.code, error.message, 'username');
  }

  if (error instanceof UserNotFoundError) {
    return sendApiError(reply, 404, error.code, error.message);
  }

  if (error instanceof CatalogValidationError) {
    return sendApiError(reply, 400, error.code, error.message, error.field);
  }

  if (error instanceof OrderValidationError) {
    return sendApiError(reply, 400, error.code, error.message, error.field);
  }

  if (error instanceof OrderConflictError) {
    return sendApiError(reply, 409, error.code, error.message);
  }

  if (error instanceof ShippingDomainError) {
    const status =
      error.code === 'order_not_found' ||
      error.code === 'shipping_quote_not_found'
        ? 404
        : 409;
    return sendApiError(reply, status, error.code, error.message);
  }

  if (error instanceof OrderNotFoundError) {
    return sendApiError(reply, 404, 'not_found', error.message);
  }

  if (error instanceof CatalogConflictError) {
    return sendApiError(reply, 409, error.code, error.message);
  }

  if (error instanceof CatalogImportValidationError) {
    return sendApiError(reply, 400, error.code, error.message);
  }

  if (error instanceof LocalityImportError) {
    return sendApiError(reply, 400, 'invalid_localities', error.message);
  }

  if (error instanceof CatalogNotFoundError) {
    return sendApiError(reply, 404, 'not_found', error.message);
  }

  if (error instanceof PhotoValidationError) {
    if (error.code === 'too_large') {
      return sendApiError(reply, 413, error.code, error.message);
    }
    return sendApiError(reply, 400, error.code, error.message);
  }

  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field =
      issue === undefined || issue.path.length === 0
        ? undefined
        : issue.path.map(String).join('.');
    return sendApiError(
      reply,
      400,
      'validation_error',
      issue?.message ?? 'Invalid request',
      field,
    );
  }

  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const fastifyError = error as FastifyError;
    if (fastifyError.statusCode === 429) {
      return sendApiError(
        reply,
        429,
        'rate_limited',
        'Too many login attempts. Try again later.',
      );
    }

    if (fastifyError.code === 'FST_REQ_FILE_TOO_LARGE') {
      return sendApiError(
        reply,
        413,
        'too_large',
        'Photo exceeds the maximum allowed size',
      );
    }

    if (fastifyError.code === 'FST_FILES_LIMIT') {
      return sendApiError(
        reply,
        400,
        'too_many_files',
        'Exactly one photo file is required',
      );
    }

    if (
      fastifyError.code === 'FST_FIELDS_LIMIT' ||
      fastifyError.code === 'FST_PARTS_LIMIT'
    ) {
      return sendApiError(
        reply,
        400,
        'unexpected_fields',
        'Photo upload must not include extra fields',
      );
    }

    if (
      fastifyError.statusCode !== undefined &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
    ) {
      return sendApiError(
        reply,
        fastifyError.statusCode,
        'request_error',
        fastifyError.message,
      );
    }
  }

  request.log.error({ err: error }, 'request failed');
  return sendApiError(
    reply,
    500,
    'internal_error',
    'An unexpected error occurred',
  );
}
