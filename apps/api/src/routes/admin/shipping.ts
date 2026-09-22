import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CarrierRuleBodySchema,
  ShippingPolicyPreviewBodySchema,
  ShippingPolicySchema,
  ShippingRuleBodySchema,
} from '@camila/contracts';
import { z } from 'zod';

import { CARRIER_CATALOG } from '../../modules/shipping/carrier-catalog.js';
import type { ShippingGuideOperations } from '../../modules/shipping/shipping-guide-service.js';
import type { ShippingQuoteOperations } from '../../modules/shipping/shipping-quote-service.js';
import { OrderIdParamsSchema, type AdminAuthenticate } from './admin-shared.js';

export async function registerShippingRoutes(
  app: FastifyInstance,
  dependencies: {
    authenticate: AdminAuthenticate;
    shippingQuoteService?: ShippingQuoteOperations;
    shippingGuideService?: ShippingGuideOperations;
  },
): Promise<void> {
  const { authenticate, shippingQuoteService, shippingGuideService } =
    dependencies;
  if (shippingGuideService !== undefined) {
    const ReviewGuideBodySchema = z
      .object({ preShipmentNumber: z.string().trim().min(1).max(64) })
      .strict();
    app.get('/orders/:orderId/shipping-guide/pdf', async (request, reply) => {
      await authenticate(request);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      const pdf = await shippingGuideService.fetchPdf(orderId);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Cache-Control', 'private, no-store');
      if (pdf.sha256 !== null) reply.header('ETag', `"${pdf.sha256}"`);
      return reply.status(200).send(Buffer.from(pdf.bytes));
    });
    app.post(
      '/orders/:orderId/shipping-guide/review',
      async (request, reply) => {
        await authenticate(request);
        const { orderId } = OrderIdParamsSchema.parse(request.params);
        const body = ReviewGuideBodySchema.parse(request.body);
        await shippingGuideService.reviewUncertain(
          orderId,
          body.preShipmentNumber,
        );
        return reply.status(204).send();
      },
    );
  } else {
    const unavailable = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      await authenticate(request);
      return reply.status(503).send({
        error: {
          code: 'shipping_not_configured',
          message: 'Shipping provider credentials are not configured',
        },
      });
    };
    app.get('/orders/:orderId/shipping-guide/pdf', unavailable);
    app.post('/orders/:orderId/shipping-guide/review', unavailable);
  }

  const publicShipping = (
    state: Awaited<ReturnType<ShippingQuoteOperations['getShipping']>>,
  ) => ({
    quotes: state.quotes.map((quote) => ({
      id: quote.id,
      carrier: quote.carrier,
      serviceId: quote.serviceId,
      freightCop: quote.freightCop,
      cashOnDeliveryCop: quote.cashOnDeliveryCop,
      surchargeCop: quote.surchargeCop,
      insuranceMode: quote.insuranceMode,
      insuranceCop: quote.insuranceCop,
      totalShippingCop:
        quote.freightCop +
        quote.cashOnDeliveryCop +
        quote.surchargeCop +
        quote.insuranceCop,
      estimatedDays: quote.estimatedDays,
      quotedAt: quote.quotedAt.toISOString(),
      expiresAt: quote.expiresAt.toISOString(),
      recommended: quote.recommended,
      selected: quote.selected,
    })),
    guide:
      state.guide === null
        ? null
        : { ...state.guide, updatedAt: state.guide.updatedAt.toISOString() },
  });

  if (shippingQuoteService !== undefined) {
    if (shippingQuoteService.simulate)
      app.post('/shipping/simulate', async (request) => {
        await authenticate(request);
        const body = z
          .object({
            localityCarrierCode: z.string().regex(/^\d{8}$/),
            declaredValueCop: z.number().int().positive().max(100000000),
          })
          .strict()
          .parse(request.body);
        return {
          data: await shippingQuoteService.simulate!(
            body.localityCarrierCode,
            body.declaredValueCop,
          ),
        };
      });
    const ShippingQuoteParamsSchema = z
      .object({ orderId: z.uuid(), quoteId: z.uuid() })
      .strict();
    app.get('/orders/:orderId/shipping', async (request, reply) => {
      await authenticate(request);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      return reply.status(200).send({
        data: publicShipping(await shippingQuoteService.getShipping(orderId)),
      });
    });
    app.post('/orders/:orderId/shipping-quotes', async (request, reply) => {
      await authenticate(request);
      const { orderId } = OrderIdParamsSchema.parse(request.params);
      await shippingQuoteService.createQuotes(orderId);
      return reply.status(201).send({
        data: publicShipping(await shippingQuoteService.getShipping(orderId)),
      });
    });
    app.post(
      '/orders/:orderId/shipping-quotes/:quoteId/select',
      async (request, reply) => {
        await authenticate(request);
        const { orderId, quoteId } = ShippingQuoteParamsSchema.parse(
          request.params,
        );
        await shippingQuoteService.selectQuote(orderId, quoteId);
        return reply.status(200).send({
          data: publicShipping(await shippingQuoteService.getShipping(orderId)),
        });
      },
    );
    app.put('/shipping/carrier-rules', async (request, reply) => {
      await authenticate(request);
      const body = CarrierRuleBodySchema.parse(request.body);
      await shippingQuoteService.setCarrierRule(
        body.localityCarrierCode,
        body.carrier,
      );
      return reply.status(204).send();
    });
    app.get('/shipping/preferences', async (request, reply) => {
      await authenticate(request);
      return reply.status(200).send({
        data: await shippingQuoteService.getDefaultPolicy(),
      });
    });
    app.patch('/shipping/preferences', async (request, reply) => {
      const user = await authenticate(request);
      const policy = ShippingPolicySchema.parse(request.body);
      await shippingQuoteService.setDefaultPolicy(policy, user.username);
      return reply
        .status(200)
        .send({ data: await shippingQuoteService.getDefaultPolicy() });
    });
    app.get('/shipping/rules', async (request, reply) => {
      await authenticate(request);
      const items = await shippingQuoteService.listShippingRules();
      return reply.status(200).send({
        data: {
          items: items.map((item) => ({
            ...item,
            updatedAt: item.updatedAt.toISOString(),
          })),
        },
      });
    });
    app.get('/shipping/carriers', async (request, reply) => {
      await authenticate(request);
      return reply.status(200).send({
        data: { items: CARRIER_CATALOG.map((carrier) => carrier.id) },
      });
    });
    app.post('/shipping/rules', async (request, reply) => {
      const user = await authenticate(request);
      const body = ShippingRuleBodySchema.parse(request.body);
      const { localityCarrierCode, ...policy } = body;
      await shippingQuoteService.setShippingPolicy(
        localityCarrierCode,
        policy,
        user.username,
      );
      return reply.status(204).send();
    });
    app.post('/shipping/rules/preview', async (request, reply) => {
      await authenticate(request);
      const body = ShippingPolicyPreviewBodySchema.parse(request.body);
      return reply.status(200).send({
        data: await shippingQuoteService.previewPolicy(
          body.localityCarrierCode,
        ),
      });
    });
    app.patch('/shipping/rules/:localityCode', async (request, reply) => {
      const user = await authenticate(request);
      const { localityCode } = z
        .object({ localityCode: z.string().regex(/^\d{8}$/) })
        .strict()
        .parse(request.params);
      const policy = ShippingPolicySchema.parse(request.body);
      await shippingQuoteService.setShippingPolicy(
        localityCode,
        policy,
        user.username,
      );
      return reply.status(204).send();
    });
    app.post(
      '/shipping/rules/:localityCode/deactivate',
      async (request, reply) => {
        const user = await authenticate(request);
        const { localityCode } = z
          .object({ localityCode: z.string().regex(/^\d{8}$/) })
          .strict()
          .parse(request.params);
        await shippingQuoteService.deactivateShippingRule(
          localityCode,
          user.username,
        );
        return reply.status(204).send();
      },
    );
  } else {
    const unavailable = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      await authenticate(request);
      return reply.status(503).send({
        error: {
          code: 'shipping_not_configured',
          message: 'Shipping provider credentials are not configured',
        },
      });
    };
    app.get('/orders/:orderId/shipping', unavailable);
    app.post('/orders/:orderId/shipping-quotes', unavailable);
    app.post('/orders/:orderId/shipping-quotes/:quoteId/select', unavailable);
    app.put('/shipping/carrier-rules', unavailable);
    app.get('/shipping/preferences', unavailable);
    app.patch('/shipping/preferences', unavailable);
    app.get('/shipping/rules', unavailable);
    app.get('/shipping/carriers', unavailable);
    app.post('/shipping/rules', unavailable);
    app.post('/shipping/rules/preview', unavailable);
    app.patch('/shipping/rules/:localityCode', unavailable);
    app.post('/shipping/rules/:localityCode/deactivate', unavailable);
  }
}
