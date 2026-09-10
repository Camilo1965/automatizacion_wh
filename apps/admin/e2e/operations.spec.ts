import { expect, test, type Page } from '@playwright/test';
import {
  E2E_ADMIN_ORIGIN,
  E2E_API_ORIGIN,
  E2E_PASSWORD,
  E2E_USERNAME,
} from './constants';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(E2E_USERNAME);
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('connects integrations, alerts and the Treinta closure workflow', async ({
  page,
}) => {
  await login(page);
  await page.goto('/settings/integrations');
  await expect(
    page.getByRole('heading', { name: 'Integraciones' }),
  ).toBeVisible();
  for (const name of [
    'Base de datos',
    'Archivos y fotografías',
    'WhatsApp',
    '99envíos',
    'Scheduler',
  ]) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }

  await page.goto('/alerts');
  await expect(
    page.getByRole('heading', { name: 'Alertas', exact: true }),
  ).toBeVisible();

  const response = await page.request.post(
    `${E2E_API_ORIGIN}/api/admin/inventory/closures/2026-09-10/generate`,
    {
      headers: { Origin: E2E_ADMIN_ORIGIN },
      data: {},
    },
  );
  expect(response.status()).toBe(201);
  await page.goto('/inventory/closures');
  await expect(
    page.getByRole('heading', { name: 'Cierres diarios de Treinta' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Descargar CSV' }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: 'Marcar como aplicado en Treinta' })
      .first(),
  ).toBeVisible();
});

test('exposes every secondary operation from the mobile navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('link', { name: 'Más' }).click();
  await expect(
    page.getByRole('heading', { name: 'Más herramientas' }),
  ).toBeVisible();
  for (const name of [
    'Importar catálogo',
    'Cierres de Treinta',
    'Alertas',
    'Preferencias de envío',
    'WhatsApp Business',
    'Integraciones',
  ]) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
]) {
  test(`has no horizontal overflow at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await login(page);
    for (const route of [
      '/',
      '/conversations',
      '/catalog',
      '/orders',
      '/settings/shipping',
      '/settings/whatsapp',
      '/settings/integrations',
      '/alerts',
      '/inventory/closures',
      '/more',
    ]) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      const overflow = await page
        .locator('html')
        .evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(
        overflow,
        `${route} overflows at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
  });
}
