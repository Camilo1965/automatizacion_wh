import { expect, test } from '@playwright/test';

import { E2E_PASSWORD, E2E_USERNAME } from './constants';

const customerId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const timestamp = '2026-09-22T12:00:00.000Z';

test('navigates the mobile customer directory, segment filter and history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: string[] = [];
  await page.route('**/api/admin/customers?**', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      json: {
        data: {
          items: [
            {
              id: customerId,
              displayName: 'Ana Gómez',
              normalizedPhone: '+573001234567',
              segment: 'buyer',
              marketingConsent: 'unknown',
              lastActivityAt: timestamp,
              createdAt: timestamp,
            },
          ],
          nextCursor: null,
        },
      },
    });
  });
  await page.route(`**/api/admin/customers/${customerId}`, async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: customerId,
          displayName: 'Ana Gómez',
          normalizedPhone: '+573001234567',
          segment: 'buyer',
          marketingConsent: 'unknown',
          lastActivityAt: timestamp,
          createdAt: timestamp,
          orders: [
            {
              id: orderId,
              orderNumber: 'PED-000123',
              status: 'delivered',
              createdAt: timestamp,
            },
          ],
          conversations: [
            {
              id: conversationId,
              customerPhone: '+573001234567',
              state: 'awaiting_size',
              updatedAt: timestamp,
            },
          ],
        },
      },
    });
  });
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(E2E_USERNAME);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Más', exact: true }).click();
  await page.getByRole('link', { name: 'Directorio de clientes' }).click();
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  await page.getByRole('button', { name: 'Compradores' }).click();
  await expect
    .poll(() =>
      requests.some(
        (url) => new URL(url).searchParams.get('segment') === 'buyer',
      ),
    )
    .toBe(true);
  await page.getByRole('link', { name: 'Ana Gómez' }).click();
  await expect(page.getByRole('heading', { name: 'Ana Gómez' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'PED-000123' })).toHaveAttribute(
    'href',
    `/orders/${orderId}`,
  );
  await expect(
    page.getByRole('link', { name: 'Abrir conversación' }),
  ).toHaveAttribute('href', `/conversations?conversation=${conversationId}`);
  const overflow = await page
    .locator('html')
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
