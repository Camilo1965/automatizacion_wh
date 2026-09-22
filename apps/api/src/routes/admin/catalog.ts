import type { FastifyInstance } from 'fastify';
import {
  CreateReferenceBodySchema,
  decodeMovementCursor,
  encodeMovementCursor,
  ListMovementsQuerySchema,
  ListReferencesQuerySchema,
  PatchReferenceBodySchema,
  SetStockBodySchema,
} from '@camila/contracts';
import { z } from 'zod';

import {
  toPublicMovement,
  toPublicReference,
  toPublicReferenceDetail,
  toPublicReferenceSummary,
  toPublicStockRecord,
} from '../../http/admin-mappers.js';
import type { AuditService } from '../../modules/audit/audit-service.js';
import {
  CatalogImportValidationError,
  CatalogNotFoundError,
  PhotoValidationError,
} from '../../modules/catalog/catalog-errors.js';
import type { CatalogImportService } from '../../modules/catalog/catalog-import-service.js';
import type { CatalogService } from '../../modules/catalog/catalog-service.js';
import type { PhotoStorage } from '../../modules/catalog/photo-storage.js';
import {
  ReferenceIdParamsSchema,
  StockParamsSchema,
  type AdminAuthenticate,
} from './admin-shared.js';

export async function registerCatalogRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    catalogService: CatalogService;
    catalogImportService?: CatalogImportService;
    photoStorage: PhotoStorage;
    auditService?: AuditService;
  },
): Promise<void> {
  const {
    authenticate,
    catalogService,
    catalogImportService,
    photoStorage,
    auditService,
  } = dependencies;
  app.get('/references', async (request, reply) => {
    await authenticate(request);
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

  app.get('/catalog-readiness', async (request, reply) => {
    await authenticate(request);
    return reply
      .status(200)
      .send({ data: await catalogService.getReadiness() });
  });

  if (catalogImportService !== undefined) {
    app.get('/catalog-import-template', async (request, reply) => {
      await authenticate(request);
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
      await authenticate(request);
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
      await authenticate(request);
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
    await authenticate(request);
    const body = CreateReferenceBodySchema.parse(request.body);
    const reference = await catalogService.createReference(body);
    return reply.status(201).send({
      data: toPublicReference(reference),
    });
  });

  app.get('/references/:referenceId', async (request, reply) => {
    await authenticate(request);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const detail = await catalogService.getAdminReference(params.referenceId);
    return reply.status(200).send({
      data: toPublicReferenceDetail(detail),
    });
  });

  app.patch('/references/:referenceId', async (request, reply) => {
    await authenticate(request);
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
    await authenticate(request);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const reference = await catalogService.activateReference(
      params.referenceId,
    );
    return reply.status(200).send({
      data: toPublicReference(reference),
    });
  });

  app.post('/references/:referenceId/deactivate', async (request, reply) => {
    await authenticate(request);
    const params = ReferenceIdParamsSchema.parse(request.params);
    const reference = await catalogService.deactivateReference(
      params.referenceId,
    );
    return reply.status(200).send({
      data: toPublicReference(reference),
    });
  });

  app.put('/references/:referenceId/photo', async (request, reply) => {
    await authenticate(request);
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
    await authenticate(request);
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
    const user = await authenticate(request);
    const params = StockParamsSchema.parse(request.params);
    const body = SetStockBodySchema.parse(request.body);
    try {
      const stock = await catalogService.setPhysicalStock({
        referenceId: params.referenceId,
        size: params.size,
        physicalQuantity: body.physicalQuantity,
        note: body.note,
      });
      await auditService?.record({
        action: 'inventory.adjusted',
        result: 'success',
        actorUserId: user.id,
        actorUsername: user.username,
        targetType: 'catalog_stock',
        targetId: `${params.referenceId}:${params.size}`,
        correlationId: request.id,
        metadata: { physicalQuantity: body.physicalQuantity },
      });
      return reply.status(200).send({
        data: toPublicStockRecord(stock),
      });
    } catch (error) {
      await auditService?.record({
        action: 'inventory.adjusted',
        result: 'failure',
        actorUserId: user.id,
        actorUsername: user.username,
        targetType: 'catalog_stock',
        targetId: `${params.referenceId}:${params.size}`,
        correlationId: request.id,
      });
      throw error;
    }
  });

  app.get('/references/:referenceId/movements', async (request, reply) => {
    await authenticate(request);
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
}
