import { expect, test, type Page } from '@playwright/test';

import {
  E2E_ADMIN_ORIGIN,
  E2E_API_ORIGIN,
  E2E_PASSWORD,
  E2E_USERNAME,
} from './constants';

let loginSequence = 0;

async function login(page: Page) {
  loginSequence += 1;
  await page.setExtraHTTPHeaders({
    'x-camila-test-client': `security-playwright-${loginSequence}`,
  });
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(E2E_USERNAME);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('owner can open security page, start MFA setup and see sessions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);

  await page.goto('/settings/security');
  await expect(
    page.getByRole('heading', { name: 'Seguridad y acceso' }),
  ).toBeVisible();
  await expect(page.getByText('Autenticación en dos pasos (MFA)')).toBeVisible();
  await expect(page.getByText('Sesiones activas', { exact: true })).toBeVisible();
  await expect(page.getByText('Esta sesión')).toBeVisible();

  const status = await page.request.get(
    `${E2E_API_ORIGIN}/api/admin/auth/mfa/enroll`,
    { headers: { Origin: E2E_ADMIN_ORIGIN } },
  );
  expect(status.status()).toBe(200);

  await page.getByRole('button', { name: 'Configurar MFA' }).click();
  await expect(
    page.getByAltText('Código QR para configurar MFA'),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/otpauth:\/\/totp\//)).toBeVisible();
  await expect(page.getByText(/Secreto manual:/)).toBeVisible();
});
