import { describe, expect, it, vi } from 'vitest';

import {
  NinetyNineEnviosClient,
  ShippingUncertainError,
} from '../src/modules/shipping/99envios-client.js';

describe('NinetyNineEnviosClient', () => {
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
      guia: '954101306101',
      transportadora: { pais: 'colombia', nombre: 'envia' },
      AplicaContrapago: true,
    });
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
