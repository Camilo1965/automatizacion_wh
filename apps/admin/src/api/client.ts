import { ApiErrorSchema } from '@camila/contracts';
import type { z } from 'zod';

const API_BASE = '/api/admin';

export type ApiErrorPayload = {
  code: string;
  message: string;
  field?: string;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = payload.code;
    if (payload.field !== undefined) {
      this.field = payload.field;
    }
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | null,
): void {
  unauthorizedHandler = handler;
}

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  skipUnauthorizedHandler?: boolean;
};

async function parseErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    const json: unknown = await response.json();
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) {
      return {
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        ...(parsed.data.error.field === undefined
          ? {}
          : { field: parsed.data.error.field }),
      };
    }
  } catch {
    // fall through
  }

  return {
    code: 'request_error',
    message: 'No se pudo completar la solicitud',
  };
}

function buildRequestInit(options: ApiRequestOptions): RequestInit {
  const headers = new Headers();
  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
  };

  if (options.signal !== undefined) {
    init.signal = options.signal;
  }

  if (options.formData !== undefined) {
    init.body = options.formData;
    if (options.method === undefined) {
      init.method = 'POST';
    }
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
    if (options.method === undefined) {
      init.method = 'POST';
    }
  }

  if (options.method !== undefined) {
    init.method = options.method;
  }

  return init;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions & { schema: z.ZodType<T> },
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, buildRequestInit(options));

  if (response.status === 401 && options.skipUnauthorizedHandler !== true) {
    unauthorizedHandler?.();
  }

  if (response.status === 204) {
    throw new ApiClientError(response.status, {
      code: 'invalid_response',
      message: 'La respuesta del servidor no es válida',
    });
  }

  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    throw new ApiClientError(response.status, payload);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiClientError(response.status, {
      code: 'invalid_response',
      message: 'La respuesta del servidor no es válida',
    });
  }

  const parsed = options.schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError(response.status, {
      code: 'invalid_response',
      message: 'La respuesta del servidor no es válida',
    });
  }

  return parsed.data;
}

export async function apiRequestNoContent(
  path: string,
  options: ApiRequestOptions = {},
): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, buildRequestInit(options));

  if (response.status === 401 && options.skipUnauthorizedHandler !== true) {
    unauthorizedHandler?.();
  }

  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    throw new ApiClientError(response.status, payload);
  }

  throw new ApiClientError(response.status, {
    code: 'invalid_response',
    message: 'La respuesta del servidor no es válida',
  });
}

export async function apiDownload(path: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}${path}`, buildRequestInit({}));
  if (response.status === 401) unauthorizedHandler?.();
  if (!response.ok)
    throw new ApiClientError(
      response.status,
      await parseErrorPayload(response),
    );
  return response.blob();
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }
  return fallback;
}

export function getFieldError(error: unknown): string | undefined {
  if (error instanceof ApiClientError) {
    return error.field;
  }
  return undefined;
}
