import { expect, test, type Page } from '@playwright/test';

import {
  E2E_ADMIN_ORIGIN,
  E2E_API_ORIGIN,
  E2E_PASSWORD,
  E2E_USERNAME,
} from './constants';

const OPERATOR_USERNAME = 'e2e_operator';
const OPERATOR_PASSWORD = 'e2e-operator-12';

let loginSequence = 0;

async function login(page: Page, username: string, password: string) {
  loginSequence += 1;
  await page.setExtraHTTPHeaders({
    'x-camila-test-client': `authz-playwright-${loginSequence}`,
  });
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
}

async function ensureOperator(page: Page) {
  await login(page, E2E_USERNAME, E2E_PASSWORD);
  const create = await page.request.post(
    `${E2E_API_ORIGIN}/api/admin/security/users`,
    {
      headers: { Origin: E2E_ADMIN_ORIGIN },
      data: {
        username: OPERATOR_USERNAME,
        password: OPERATOR_PASSWORD,
        passwordConfirmation: OPERATOR_PASSWORD,
        role: 'operator',
        currentPassword: E2E_PASSWORD,
      },
    },
  );
  expect([201, 409]).toContain(create.status());
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Entrar al panel' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('owner sees security navigation and operator is denied owner routes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await ensureOperator(page);

  await login(page, E2E_USERNAME, E2E_PASSWORD);
  await expect(
    page.getByRole('link', { name: 'Seguridad y acceso' }),
  ).toBeVisible();
  await page.goto('/settings/security');
  await expect(
    page.getByRole('heading', { name: 'Seguridad y acceso' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();

  await login(page, OPERATOR_USERNAME, OPERATOR_PASSWORD);
  await expect(
    page.getByRole('link', { name: 'Seguridad y acceso' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Integraciones' }),
  ).toHaveCount(0);

  await page.goto('/settings/security');
  await expect(
    page.getByRole('heading', { name: 'Seguridad y acceso' }),
  ).toBeVisible();
  await expect(
    page.getByText('Autenticación en dos pasos (MFA)'),
  ).toBeVisible();
  await expect(page.getByText('Crear operadora')).toHaveCount(0);

  const denied = await page.request.get(
    `${E2E_API_ORIGIN}/api/admin/security/users`,
    { headers: { Origin: E2E_ADMIN_ORIGIN } },
  );
  expect(denied.status()).toBe(403);

  const allowed = await page.request.get(
    `${E2E_API_ORIGIN}/api/admin/alerts`,
    { headers: { Origin: E2E_ADMIN_ORIGIN } },
  );
  expect(allowed.status()).toBe(200);
});
