import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { adminUser } from '../test/fixtures';
import { server } from '../test/server';
import { renderWithProviders } from '../test/render';
import { IntegrationsPage } from './IntegrationsPage';

const base = '/api/admin';
const checkedAt = '2026-09-22T12:00:00.000Z';

function integrationHandlers(options?: {
  databaseStatus?: 'up' | 'degraded' | 'down';
  settingsOk?: boolean;
}) {
  const databaseStatus = options?.databaseStatus ?? 'up';
  const settingsOk = options?.settingsOk ?? true;
  return [
    http.get(`${base}/auth/session`, () =>
      HttpResponse.json({ data: { user: adminUser } }),
    ),
    http.get(`${base}/integrations/health`, () =>
      HttpResponse.json({
        data: {
          database: {
            status: databaseStatus,
            checkedAt,
            detail:
              databaseStatus === 'up'
                ? 'PostgreSQL responde'
                : 'Sin respuesta del pool',
          },
          mediaStorage: {
            status: 'degraded',
            checkedAt,
            detail: 'Almacenamiento local lento',
          },
          whatsapp: { status: 'up', checkedAt, detail: null },
          shipping: { status: 'down', checkedAt, detail: 'Timeout 99envíos' },
          scheduler: {
            status: 'down',
            checkedAt,
            detail: 'Último heartbeat ausente',
          },
        },
      }),
    ),
    http.get(`${base}/integrations/settings`, () => {
      if (!settingsOk) {
        return HttpResponse.json(
          { error: { code: 'encryption_unavailable', message: 'No key' } },
          { status: 503 },
        );
      }
      return HttpResponse.json({
        data: {
          whatsapp: {
            configured: true,
            phoneNumberId: '123456',
            timezone: 'America/Bogota',
            serviceHours: null,
            graphApiVersion: 'v26.0',
            wabaId: null,
            ownerAlertPhone: null,
            ownerAlertTemplate: null,
          },
          shipping: {
            configured: false,
            accountEmail: null,
            integrationId: null,
            branchCode: null,
            pdfType: 2,
          },
        },
      });
    }),
    http.get(`${base}/integrations/lifecycle`, () =>
      HttpResponse.json({
        data: {
          drafts: [
            {
              provider: 'whatsapp',
              revision: 2,
              tested: false,
              testedAt: null,
            },
            {
              provider: 'shipping',
              revision: 1,
              tested: true,
              testedAt: checkedAt,
            },
          ],
          versions: [],
        },
      }),
    ),
  ];
}

describe('IntegrationsPage provider wording and lifecycle', () => {
  it('shows status-specific diagnostics for internal services without credential copy', async () => {
    server.use(...integrationHandlers({ databaseStatus: 'down' }));
    renderWithProviders(<IntegrationsPage />);

    const database = await screen.findByRole('heading', {
      name: 'Base de datos',
      level: 3,
    });
    const databaseCard = database.closest('article, [data-slot="card"]');
    expect(databaseCard).toBeTruthy();
    expect(
      within(databaseCard as HTMLElement).queryByText(/Guardar credenciales/i),
    ).toBeNull();
    expect(
      within(databaseCard as HTMLElement).getByText(
        /Revisa la conexión a PostgreSQL/i,
      ),
    ).toBeVisible();

    const media = screen.getByRole('heading', {
      name: 'Archivos y fotografías',
      level: 3,
    });
    const mediaCard = media.closest('article, [data-slot="card"]');
    expect(
      within(mediaCard as HTMLElement).queryByText(/Guardar credenciales/i),
    ).toBeNull();
    expect(
      within(mediaCard as HTMLElement).getByText(
        /Verifica el almacenamiento de medios/i,
      ),
    ).toBeVisible();

    const scheduler = screen.getByRole('heading', {
      name: 'Scheduler',
      level: 3,
    });
    const schedulerCard = scheduler.closest('article, [data-slot="card"]');
    expect(
      within(schedulerCard as HTMLElement).queryByText(/Guardar credenciales/i),
    ).toBeNull();
    expect(
      within(schedulerCard as HTMLElement).getByText(
        /Reinicia el worker y confirma/i,
      ),
    ).toBeVisible();

    expect(screen.queryAllByText(/Guardar credenciales/i)).toHaveLength(0);
  });

  it('exposes the four-step lifecycle for WhatsApp and 99envíos', async () => {
    server.use(...integrationHandlers());
    renderWithProviders(<IntegrationsPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'WhatsApp Cloud API',
        level: 3,
      }),
    ).toBeVisible();
    expect(
      screen.getAllByRole('heading', { name: '99envíos', level: 3 }).length,
    ).toBeGreaterThanOrEqual(1);

    for (const step of [
      '1. Credenciales',
      '2. Prueba segura',
      '3. Activación',
      '4. Verificación operativa',
    ]) {
      expect(screen.getAllByText(step).length).toBeGreaterThanOrEqual(1);
    }

    expect(
      screen.getAllByText(/probar la conexión de forma segura/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Siguiente paso:/i).length).toBeGreaterThan(0);
  });

  it('shows permission/degraded states with persistent next steps', async () => {
    server.use(...integrationHandlers({ settingsOk: false }));
    renderWithProviders(<IntegrationsPage />);

    expect(
      await screen.findByText(/INTEGRATION_ENCRYPTION_KEY/i),
    ).toBeVisible();
    expect(
      screen.getByText(/clave de cifrado INTEGRATION_ENCRYPTION_KEY/i),
    ).toBeVisible();
    expect(screen.getAllByText(/Siguiente paso:/i).length).toBeGreaterThan(0);
  });
});
