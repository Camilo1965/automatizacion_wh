import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { adminUser } from '../test/fixtures';
import { server } from '../test/server';
import { renderWithProviders } from '../test/render';
import { SecuritySettingsPage } from './SecuritySettingsPage';

const base = '/api/admin';

describe('SecuritySettingsPage', () => {
  it('lists users without exposing hashes or secrets', async () => {
    server.use(
      http.get(`${base}/auth/session`, () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get(`${base}/security/users`, () =>
        HttpResponse.json({
          data: {
            items: [
              adminUser,
              {
                id: '22222222-2222-4222-8222-222222222222',
                username: 'operadora',
                role: 'operator',
              },
            ],
          },
        }),
      ),
    );

    renderWithProviders(<SecuritySettingsPage />);

    expect(
      await screen.findByRole('heading', { name: 'Seguridad y acceso' }),
    ).toBeVisible();
    expect(screen.getByText('camila')).toBeVisible();
    expect(screen.getByText('operadora')).toBeVisible();
    expect(screen.queryByText(/scrypt|password_hash/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\$scrypt\$/);
  });

  it('creates an operator with password confirmation', async () => {
    const user = userEvent.setup();
    let created = false;
    server.use(
      http.get(`${base}/auth/session`, () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get(`${base}/security/users`, () =>
        HttpResponse.json({
          data: { items: created ? [adminUser, {
            id: '22222222-2222-4222-8222-222222222222',
            username: 'ops1',
            role: 'operator',
          }] : [adminUser] },
        }),
      ),
      http.post(`${base}/security/users`, async ({ request }) => {
        const body = (await request.json()) as {
          username?: string;
          currentPassword?: string;
          role?: string;
        };
        expect(body.username).toBe('ops1');
        expect(body.role).toBe('operator');
        expect(body.currentPassword).toBe('password1234');
        created = true;
        return HttpResponse.json(
          {
            data: {
              user: {
                id: '22222222-2222-4222-8222-222222222222',
                username: 'ops1',
                role: 'operator',
              },
            },
          },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<SecuritySettingsPage />);
    await screen.findByRole('heading', { name: 'Seguridad y acceso' });

    await user.type(screen.getByLabelText('Usuario'), 'ops1');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'password1234');
    await user.type(
      screen.getByLabelText('Confirmar contraseña nueva'),
      'password1234',
    );
    await user.type(
      screen.getByLabelText(/Tu contraseña actual/),
      'password1234',
    );
    await user.click(screen.getByRole('button', { name: 'Crear operadora' }));

    await waitFor(() => {
      expect(screen.getByText('Operadora creada.')).toBeVisible();
    });
  });
});
