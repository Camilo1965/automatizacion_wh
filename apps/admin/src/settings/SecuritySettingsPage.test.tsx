import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { adminUser } from '../test/fixtures';
import { server } from '../test/server';
import { renderWithProviders } from '../test/render';
import { SecuritySettingsPage } from './SecuritySettingsPage';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async () => 'data:image/png;base64,qr'),
  },
}));

const base = '/api/admin';

function securityHandlers(options?: { created?: boolean }) {
  let created = options?.created ?? false;
  return [
    http.get(`${base}/auth/session`, () =>
      HttpResponse.json({ data: { user: adminUser } }),
    ),
    http.get(`${base}/auth/mfa/enroll`, () =>
      HttpResponse.json({
        data: { enabled: false, pendingSetup: false },
      }),
    ),
    http.get(`${base}/auth/sessions`, () =>
      HttpResponse.json({
        data: {
          items: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              createdAt: '2026-09-22T12:00:00.000Z',
              expiresAt: '2026-09-23T00:00:00.000Z',
              lastSeenAt: '2026-09-22T12:00:00.000Z',
              current: true,
            },
          ],
        },
      }),
    ),
    http.get(`${base}/security/users`, () =>
      HttpResponse.json({
        data: {
          items: created
            ? [
                adminUser,
                {
                  id: '22222222-2222-4222-8222-222222222222',
                  username: 'ops1',
                  role: 'operator',
                },
              ]
            : [
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
    http.post(`${base}/auth/mfa/setup`, () =>
      HttpResponse.json({
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/KAIRO:camila?secret=JBSWY3DPEHPK3PXP&issuer=KAIRO',
        },
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
  ];
}

describe('SecuritySettingsPage', () => {
  it('lists users without exposing hashes or secrets', async () => {
    server.use(...securityHandlers());

    renderWithProviders(<SecuritySettingsPage />);

    expect(
      await screen.findByRole('heading', { name: 'Seguridad y acceso' }),
    ).toBeVisible();
    expect(await screen.findByText('operadora')).toBeVisible();
    expect(screen.getByText('camila')).toBeVisible();
    expect(screen.queryByText(/scrypt|password_hash/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\$scrypt\$/);
  });

  it('creates an operator with password confirmation', async () => {
    const user = userEvent.setup();
    server.use(...securityHandlers());

    renderWithProviders(<SecuritySettingsPage />);
    await screen.findByRole('button', { name: 'Crear operadora' });

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

  it('shows local MFA QR, otpauth URI and manual secret', async () => {
    const user = userEvent.setup();
    server.use(...securityHandlers());

    renderWithProviders(<SecuritySettingsPage />);
    expect(
      await screen.findByText('Autenticación en dos pasos (MFA)'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Configurar MFA' }));

    expect(
      await screen.findByAltText('Código QR para configurar MFA'),
    ).toHaveAttribute('src', 'data:image/png;base64,qr');
    expect(screen.getByText(/otpauth:\/\/totp\//)).toBeVisible();
    expect(screen.getByText(/Secreto manual: JBSWY3DPEHPK3PXP/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/chart\.googleapis|qrserver/i);
  });

  it('lists the current session', async () => {
    server.use(...securityHandlers());
    renderWithProviders(<SecuritySettingsPage />);
    expect(await screen.findByText('Esta sesión')).toBeVisible();
  });
});
