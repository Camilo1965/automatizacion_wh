import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { ShippingIncidentService } from '../src/modules/shipping/shipping-incident-service.js';
import { ShippingUncertainError } from '../src/modules/shipping/99envios-client.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

describe('shipping incident response safety', () => {
  const url = requireTestDatabaseUrl();
  const database = createPostgresDatabase(url);
  const client = { getIncidents: vi.fn(), respondIncident: vi.fn() };
  const service = new ShippingIncidentService(database, client);
  beforeAll(() => runMigrations(url));
  beforeEach(async () => {
    vi.resetAllMocks();
    await database.orm.execute('TRUNCATE shipping_incidents');
    client.getIncidents.mockResolvedValue([
      {
        id: 101,
        numero_preenvio: '123456789',
        novedad: 'Dirección incompleta',
        observaciones: null,
      },
    ]);
  });
  afterAll(() => database.close());
  it('deduplicates sync and sends a single response under simultaneous requests', async () => {
    await service.sync();
    await service.sync();
    expect(await service.list()).toHaveLength(1);
    client.respondIncident.mockResolvedValue(undefined);
    const results = await Promise.allSettled([
      service.respond(101, 'Dirección corregida', 'Portería', 'owner'),
      service.respond(101, 'Dirección corregida', 'Portería', 'owner'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(client.respondIncident).toHaveBeenCalledExactlyOnceWith(
      101,
      '123456789',
      'Dirección corregida',
      'Portería',
    );
    expect((await service.list())[0]).toMatchObject({
      responseStatus: 'sent',
      author: 'owner',
    });
  });
  it('blocks retries after an uncertain response and preserves that state on sync', async () => {
    await service.sync();
    client.respondIncident.mockRejectedValue(new ShippingUncertainError());
    await expect(
      service.respond(101, 'Revisar dirección', '', 'owner'),
    ).rejects.toThrow();
    await service.sync();
    expect((await service.list())[0]?.responseStatus).toBe('uncertain');
    await expect(
      service.respond(101, 'Otra respuesta', '', 'owner'),
    ).rejects.toThrow();
    expect(client.respondIncident).toHaveBeenCalledTimes(1);
  });
});
