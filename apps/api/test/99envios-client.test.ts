import { describe, expect, it, vi } from 'vitest';

import {
  NinetyNineEnviosClient,
  ShippingUncertainError,
} from '../src/modules/shipping/99envios-client.js';

describe('NinetyNineEnviosClient', () => {
  it('sends the selected Plus insurance to 99envios', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ numeroPreenvio: '1', valorFlete: 1000 }), { status: 200 }));
    const client = new NinetyNineEnviosClient({ email: 'owner@example.test', password: 'secret', fetch: request });

    await client.createPreShipment({
      weightKg: 1, lengthCm: 30, widthCm: 20, heightCm: 12, contents: 'Calzado', declaredValueCop: 120000,
      recipient: { firstName: 'Camila', firstSurname: 'Pérez', phone: '3158191776', address: 'Calle 1', localityCode: '05001000' },
      carrier: 'tcc', notes: null, insurance: 'plus',
    });

    const body = JSON.parse((request.mock.calls[1]![1] as RequestInit).body as string) as { seguro99: boolean; seguro99plus: boolean };
    expect(body).toMatchObject({ seguro99: false, seguro99plus: true });
  });

  it('treats a login network failure as pre-submission failure', async () => {
    const client = new NinetyNineEnviosClient({
      email: 'owner@example.test',
      password: 'secret',
      fetch: vi.fn().mockRejectedValue(new TypeError('network down')),
    });

    await expect(
      client.createPreShipment({
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
        contents: 'Calzado',
        declaredValueCop: 120000,
        recipient: {
          firstName: 'Camila',
          firstSurname: 'Pérez',
          phone: '+573158191776',
          address: 'Calle 1 # 2-3',
          localityCode: '05001000',
        },
        carrier: 'envia',
        notes: null,
      }),
    ).rejects.toMatchObject({ name: 'ShippingRequestError' });
  });

  it('logs in and creates a COD pre-shipment using the documented payload', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ numeroPreenvio: '954101306101', valorFlete: 11596 }),
          { status: 200 },
        ),
      );
    const client = new NinetyNineEnviosClient({
      email: 'owner@example.test',
      password: 'secret',
      integrationToken: 'integration-token',
      integrationId: 'camila',
      fetch: request,
    });
    await expect(
      client.createPreShipment({
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
        contents: 'Calzado',
        declaredValueCop: 120000,
        recipient: {
          firstName: 'Camila',
          firstSurname: 'Pérez',
          phone: '3158191776',
          address: 'Calle 1 # 2-3',
          localityCode: '05001000',
        },
        carrier: 'envia',
        notes: null,
      }),
    ).resolves.toEqual({
      preShipmentNumber: '954101306101',
      freightCop: 11596,
    });
    expect(request.mock.calls[0]?.[0]).toBe(
      'https://integration.99envios.app/api/integration/v1/login',
    );
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string)).toEqual({
      email: 'owner@example.test',
      password: 'secret',
    });
    expect(request.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer jwt-token',
      'X-Integration-Token': 'integration-token',
      'X-Integration-Id': 'camila',
    });
    expect(
      JSON.parse(request.mock.calls[1]?.[1]?.body as string),
    ).toMatchObject({
      IdTipoEntrega: 1,
      IdServicio: 1,
      AplicaContrapago: true,
      Destinatario: { idLocalidad: '05001000', telefono: '3158191776' },
      transportadora: { pais: 'colombia', nombre: 'envia' },
      origenCreacion: 1,
    });
  });

  it('normalizes numeric guide identifiers and decimal COP returned by the live API', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ numeroPreenvio: 616566749, valorFlete: 28325.96 }),
          { status: 200 },
        ),
      );
    const client = new NinetyNineEnviosClient({
      email: 'owner@example.test',
      password: 'secret',
      fetch: request,
    });

    await expect(
      client.createPreShipment({
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
        contents: 'Calzado',
        declaredValueCop: 146093,
        recipient: {
          firstName: 'Camila',
          firstSurname: 'Pérez',
          phone: '3158191776',
          address: 'Calle 1 # 2-3',
          localityCode: '05001000',
        },
        carrier: 'tcc',
        notes: null,
      }),
    ).resolves.toEqual({
      preShipmentNumber: '616566749',
      freightCop: 28326,
    });
  });

  it('marks an interrupted creation request as uncertain', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockRejectedValueOnce(new TypeError('network down'));
    const client = new NinetyNineEnviosClient({
      email: 'x@y.test',
      password: 'secret',
      fetch: request,
    });
    await expect(
      client.createPreShipment({
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
        contents: 'Calzado',
        declaredValueCop: 1,
        recipient: {
          firstName: 'A',
          firstSurname: 'B',
          phone: '3158191776',
          address: 'Calle 1',
          localityCode: '05001000',
        },
        carrier: 'envia',
        notes: null,
      }),
    ).rejects.toBeInstanceOf(ShippingUncertainError);
  });

  it('marks a provider 5xx after submission as uncertain', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('temporarily busy', { status: 503 }));
    const client = new NinetyNineEnviosClient({
      email: 'x@y.test',
      password: 'secret',
      fetch: request,
    });

    await expect(
      client.createPreShipment({
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
        contents: 'Calzado',
        declaredValueCop: 1,
        recipient: {
          firstName: 'A',
          firstSurname: 'B',
          phone: '3158191776',
          address: 'Calle 1',
          localityCode: '05001000',
        },
        carrier: 'envia',
        notes: null,
      }),
    ).rejects.toBeInstanceOf(ShippingUncertainError);
  });

  it('treats a provider 4xx as a rejected request', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('invalid data', { status: 422 }));
    const client = new NinetyNineEnviosClient({
      email: 'x@y.test',
      password: 'secret',
      fetch: request,
    });
    const input = {
      weightKg: 1,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 12,
      contents: 'Calzado',
      declaredValueCop: 1,
      recipient: {
        firstName: 'A',
        firstSurname: 'B',
        phone: '3158191776',
        address: 'Calle 1',
        localityCode: '05001000',
      },
      carrier: 'envia',
      notes: null,
    };

    await expect(client.createPreShipment(input)).rejects.toMatchObject({
      name: 'ShippingRequestError',
    });
  });

  it('marks a successful but unreadable provider response as uncertain', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response('<html>broken</html>', { status: 200 }),
      );
    const client = new NinetyNineEnviosClient({
      email: 'x@y.test',
      password: 'secret',
      fetch: request,
    });

    await expect(
      client.createPreShipment({
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
        contents: 'Calzado',
        declaredValueCop: 1,
        recipient: {
          firstName: 'A',
          firstSurname: 'B',
          phone: '3158191776',
          address: 'Calle 1',
          localityCode: '05001000',
        },
        carrier: 'envia',
        notes: null,
      }),
    ).rejects.toBeInstanceOf(ShippingUncertainError);
  });

  it('downloads an existing guide PDF without creating another pre-shipment', async () => {
    const pdf = new Uint8Array([37, 80, 68, 70, 45]);
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(pdf, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      );
    const client = new NinetyNineEnviosClient({
      email: 'owner@example.test',
      password: 'secret',
      fetch: request,
    });

    await expect(client.getGuidePdf('954101306101', 'envia')).resolves.toEqual(
      pdf,
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      'https://integration.99envios.app/api/integration/v1/pdf/2',
    );
    expect(JSON.parse(request.mock.calls[1]?.[1]?.body as string)).toEqual({
      guia: 954101306101,
      transportadora: { pais: 'colombia', nombre: 'envia' },
      AplicaContrapago: true,
    });
  });

  it('follows the whitelisted PDF URL returned by the live provider', async () => {
    const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const pdfUrl =
      'https://api.99envios.app/storage/adjuntos/adjuntos/pdfs/test.pdf';
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(pdfUrl, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=UTF-8' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(pdf, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      );
    const client = new NinetyNineEnviosClient({
      email: 'owner@example.test',
      password: 'secret',
      fetch: request,
    });

    await expect(
      client.getGuidePdf('2220959663', 'servientrega'),
    ).resolves.toEqual(pdf);
    expect(request.mock.calls[2]?.[0]).toBe(pdfUrl);
  });

  it('rejects a PDF URL outside the 99envios storage host', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response('https://example.test/private.pdf', { status: 200 }),
      );
    const client = new NinetyNineEnviosClient({
      email: 'owner@example.test',
      password: 'secret',
      fetch: request,
    });

    await expect(
      client.getGuidePdf('2220959663', 'servientrega'),
    ).rejects.toMatchObject({ name: 'ShippingRequestError' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('normalizes successful carrier quotes and keeps the documented COD values separate', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            envia: {
              exito: true,
              valor: 13368,
              valor_contrapago: 3000,
              sobreflete: 600,
              IdServicio: 12,
              dias: 1,
            },
            tcc: { exito: false, mensaje: 'Sin cobertura' },
          }),
          { status: 200 },
        ),
      );
    const client = new NinetyNineEnviosClient({
      email: 'owner@example.test',
      password: 'secret',
      fetch: request,
    });

    await expect(
      client.quote({
        localityCode: '05001000',
        declaredValueCop: 120000,
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
        shippingDate: '07-09-2026',
      }),
    ).resolves.toEqual([
      {
        carrier: 'envia',
        freightCop: 13368,
        cashOnDeliveryCop: 3000,
        surchargeCop: 600,
        serviceId: 12,
        estimatedDays: '1',
      },
    ]);
    expect(request.mock.calls[1]?.[0]).toBe(
      'https://integration.99envios.app/api/integration/v1/cotizar',
    );
    expect(JSON.parse(request.mock.calls[1]?.[1]?.body as string)).toEqual({
      destino: { nombre: null, codigo: '05001000' },
      origen: { nombre: null, codigo: null },
      IdTipoEntrega: 1,
      IdServicio: 1,
      valorDeclarado: 120000,
      peso: 1,
      largo: 30,
      ancho: 20,
      alto: 12,
      fecha: '07-09-2026',
      AplicaContrapago: true,
      seguro99: false,
      seguro99plus: false,
    });
  });
});
