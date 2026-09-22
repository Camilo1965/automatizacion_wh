import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { adminUser } from '../test/fixtures';
import { server } from '../test/server';
import { MorePage } from './MorePage';
import { renderWithProviders } from '../test/render';

const base = '/api/admin';

describe('MorePage', () => {
  it('makes every secondary operation reachable on mobile for owners', async () => {
    server.use(
      http.get(`${base}/auth/session`, () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
    );
    renderWithProviders(<MorePage />);
    for (const name of [
      'Importar desde Treinta',
      'Cierres diarios',
      'Alertas',
      'Políticas de envío',
      'WhatsApp Business',
      'Integraciones',
      'Seguridad y acceso',
    ]) {
      expect(await screen.findByRole('link', { name })).toBeVisible();
    }
  });

  it('hides owner-only links for operators', async () => {
    server.use(
      http.get(`${base}/auth/session`, () =>
        HttpResponse.json({
          data: {
            user: {
              ...adminUser,
              username: 'operadora',
              role: 'operator',
            },
          },
        }),
      ),
    );
    renderWithProviders(<MorePage />);
    expect(await screen.findByRole('link', { name: 'Alertas' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Integraciones' })).toBeNull();
    expect(
      await screen.findByRole('link', { name: 'Seguridad y acceso' }),
    ).toBeVisible();
  });
});
