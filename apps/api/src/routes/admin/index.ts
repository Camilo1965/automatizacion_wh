import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CreateReferenceBodySchema,
  decodeMovementCursor,
  encodeMovementCursor,
  ListMovementsQuerySchema,
  ListReferencesQuerySchema,
  LoginBodySchema,
  PatchReferenceBodySchema,
  SetStockBodySchema,
} from '@camila/contracts';

import type { AppConfig } from '../../config.js';
import {
  toPublicMovement,
  toPublicReference,
  toPublicReferenceDetail,
  toPublicReferenceSummary,
  toPublicStockRecord,
} from '../../http/admin-mappers.js';
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
} from '../../http/session-cookie.js';
import type { AdminUserPublic } from '../../modules/auth/admin-auth-repository.js';
import type { AuthService } from '../../modules/auth/auth-service.js';
import {
  CatalogNotFoundError,
  PhotoValidationError,
} from '../../modules/catalog/catalog-errors.js';
import type { CatalogService } from '../../modules/catalog/catalog-service.js';
import type { CatalogImportService } from '../../modules/catalog/catalog-import-service.js';
import { CatalogImportValidationError } from '../../modules/catalog/catalog-errors.js';
import type { PhotoStorage } from '../../modules/catalog/photo-storage.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: AdminUserPublic;
  }
}

const ReferenceIdParamsSchema = z
  .object({
    referenceId: z.uuid(),
  })
  .strict();

const StockParamsSchema = z
  .object({
    referenceId: z.uuid(),
    size: z.string().min(1),
  })
  .strict();

async function requireAdminSession(
  request: FastifyRequest,
  authService: AuthService,
): Promise<AdminUserPublic> {
  const token = request.cookies[ADMIN_SESSION_COOKIE];
  const user = await authService.getSession(token);
  request.adminUser = user;
  return user;
}

function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(
    ADMIN_SESSION_COOKIE,
    adminSessionCookieOptions(config.nodeEnv),
  );
}

export type AdminRoutesDependencies = Readonly<{
  config: AppConfig;
  authService: AuthService;
  catalogService: CatalogService;
  catalogImportService?: CatalogImportService;
  photoStorage: PhotoStorage;
}>;

export const adminRoutes: FastifyPluginAsync<AdminRoutesDependencies> = async (
  app,
  dependencies,
) => {
  const {
    config,
    authService,
    catalogService,
    photoStorage,
    catalogImportService,
  } = dependencies;

  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const body = LoginBodySchema.parse(request.body);
      const result = await authService.login(body.username, body.password);
      reply.setCookie(
        ADMIN_SESSION_COOKIE,
        result.token,
        adminSessionCookieOptions(config.nodeEnv),
      );
      return reply.status(200).send({
        data: {
          user: result.user,
        },
      });
    },
  );

  app.get('/auth/session', async (request, reply) => {
    const user = await requireAdminSession(request, authService);
    return reply.status(200).send({
      data: { user },
    });
  });

  app.post('/auth/logout', async (request, reply) => {
    await requireAdminSession(request, authService);
    const token = request.cookies[ADMIN_SESSION_COOKIE];
    await authService.logout(token);
    clearSessionCookie(reply, config);
    return reply.status(204).send();
  });

  app.get('/references', async (request, reply) => {
    await requireAdminSession(request, authService);
    const query = ListReferencesQuerySchema.parse(request.query);
    const page = await catalogService.listAdminReferences({
      status: query.status,
      limit: query.limit,
      ...(query.query === undefined ? {} : { query: query.query }),
      ...(query.afterCode === undefined ? {} : { afterCode: query.afterCode }),
    });

    return reply.status(200).send({
      data: {
        items: page.items.map(toPublicReferenceSummary),
        nextAfterCode: page.nextAfterCode,
      },
    });
  });

  if (catalogImportService !== undefined) {
    app.get('/catalog-import-template', async (request, reply) => {
      await requireAdminSession(request, authService);
      const template = [
        'reference_code,model_name,color,price_cop,size,physical_quantity',
        '01,Tenis urbano,Negro,120000,37,2',
        '01,Tenis urbano,Negro,120000,37.5,1',
      ].join('\n');
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header(
          'Content-Disposition',
          'attachment; filename="plantilla-catalogo.csv"',
        )
        .send(template);
    });

    app.post('/catalog-imports/preview', async (request, reply) => {
      await requireAdminSession(request, authService);
      if (!request.isMultipart()) {
        throw new CatalogImportValidationError(
          'multipart_required',
          'La importación requiere un archivo CSV multipart',
        );
      }
      const part = await request.file();
      if (part === undefined || part.fieldname !== 'file') {
        throw new CatalogImportValidationError(
          'missing_file',
          'Debe enviar un único archivo en el campo file',
        );
      }
      const preview = await catalogImportService.preview(
        new Uint8Array(await part.toBuffer()),
      );
      return reply.status(201).send({
        data: {
          id: preview.id,
          status: preview.status,
          references: preview.references,
          errors: preview.errors,
          createdAt: preview.createdAt.toISOString(),
        },
      });
    });

    app.post('/catalog-imports/:importId/commit', async (request, reply) => {
      await requireAdminSession(request, authService);
      const params = z
        .object({ importId: z.uuid() })
        .strict()
        .parse(request.params);
      const committed = await catalogImportService.confirm(params.importId);
      return reply.status(200).send({
        data: {
          id: committed.id,
          status: committed.status,
          references: committed.references,
          errors: committed.errors,
          createdAt: committed.createdAt.toISOString(),
        },
      });
    });
  }

  app.post('/references', async (request, reply) => {
    await requireAdminSession(request, authService);
    const body = CreateReferenceBodySchema.parse(request.body);
    const reference = await catalogService.createReference(body);
    return reply.status(201).send({
      data: toPublicReference(reference),
    });
  });

  app.get('/references/:referenceId', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const detail = await catalogService.getAdminReference(params.referenceId);
    return reply.status(200).send({
      data: toPublicReferenceDetail(detail),
    });
  });

  app.patch('/references/:referenceId', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const body = PatchReferenceBodySchema.parse(request.body);
    const reference = await catalogService.updateReference({
      referenceId: params.referenceId,
      ...(body.modelName === undefined ? {} : { modelName: body.modelName }),
      ...(body.color === undefined ? {} : { color: body.color }),
      ...(body.priceCop === undefined ? {} : { priceCop: body.priceCop }),
    });
    return reply.status(200).send({
      data: toPublicReference(reference),
    });
  });

  app.post('/references/:referenceId/activate', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const reference = await catalogService.activateReference(
      params.referenceId,
    );
    return reply.status(200).send({
      data: toPublicReference(reference),
    });
  });

  app.post('/references/:referenceId/deactivate', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const reference = await catalogService.deactivateReference(
      params.referenceId,
    );
    return reply.status(200).send({
      data: toPublicReference(reference),
    });
  });

  app.put('/references/:referenceId/photo', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);

    if (!request.isMultipart()) {
      throw new PhotoValidationError(
        'multipart_required',
        'Photo upload requires multipart form data',
      );
    }

    let fileCount = 0;
    let fieldCount = 0;
    let bytes: Uint8Array | null = null;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        fileCount += 1;
        if (part.fieldname !== 'photo') {
          throw new PhotoValidationError(
            'invalid_field',
            'Photo must be uploaded in the photo field',
          );
        }
        if (fileCount > 1) {
          throw new PhotoValidationError(
            'too_many_files',
            'Exactly one photo file is required',
          );
        }
        const buffer = await part.toBuffer();
        bytes = new Uint8Array(buffer);
      } else {
        fieldCount += 1;
      }
    }

    if (fieldCount > 0) {
      throw new PhotoValidationError(
        'unexpected_fields',
        'Photo upload must not include extra fields',
      );
    }

    if (fileCount === 0 || bytes === null) {
      throw new PhotoValidationError(
        'missing_file',
        'Exactly one photo file is required',
      );
    }

    const result = await catalogService.replacePhoto(params.referenceId, bytes);
    return reply.status(200).send({
      data: toPublicReference(result.reference),
      ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
    });
  });

  app.get('/references/:referenceId/photo', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const detail = await catalogService.getAdminReference(params.referenceId);
    const photo = detail.reference.photo;
    if (photo === null) {
      throw new CatalogNotFoundError('Catalog reference photo was not found');
    }

    const etag = `"${photo.sha256}"`;
    const ifNoneMatch = request.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      return reply.status(304).send();
    }

    const bytes = await photoStorage.read(photo.storageKey);
    return reply
      .status(200)
      .header('Content-Type', photo.mimeType)
      .header('Content-Length', String(bytes.byteLength))
      .header('ETag', etag)
      .header('Cache-Control', 'private, max-age=3600')
      .send(Buffer.from(bytes));
  });

  app.put('/references/:referenceId/stock/:size', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = StockParamsSchema.parse(request.params);
    const body = SetStockBodySchema.parse(request.body);
    const stock = await catalogService.setPhysicalStock({
      referenceId: params.referenceId,
      size: params.size,
      physicalQuantity: body.physicalQuantity,
      note: body.note,
    });
    return reply.status(200).send({
      data: toPublicStockRecord(stock),
    });
  });

  app.get('/references/:referenceId/movements', async (request, reply) => {
    await requireAdminSession(request, authService);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const query = ListMovementsQuerySchema.parse(request.query);

    let cursor: { createdAt: Date; id: string } | undefined;
    if (query.cursor !== undefined) {
      try {
        cursor = decodeMovementCursor(query.cursor);
      } catch {
        return reply.status(400).send({
          error: {
            code: 'invalid_cursor',
            message: 'Movement cursor is invalid',
            field: 'cursor',
          },
        });
      }
    }

    const page = await catalogService.listAdminMovements({
      referenceId: params.referenceId,
      limit: query.limit,
      ...(query.size === undefined ? {} : { size: query.size }),
      ...(cursor === undefined ? {} : { cursor }),
    });

    return reply.status(200).send({
      data: {
        items: page.items.map(toPublicMovement),
        nextCursor:
          page.nextCursor === null
            ? null
            : encodeMovementCursor(page.nextCursor),
      },
    });
  });
};
