import { describe, expect, it, vi } from 'vitest';

import {
  NinetyNineEnviosClient,
  ShippingUncertainError,
} from '../src/modules/shipping/99envios-client.js';

describe('NinetyNineEnviosClient', () => {
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
});
