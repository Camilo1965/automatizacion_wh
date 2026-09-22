import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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
    'x-camila-test-client': `operations-playwright-${loginSequence}`,
  });
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(E2E_USERNAME);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
  await expect(page.locator('main')).toBeVisible();
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
    await expect(
      page.getByRole('heading', { name, exact: true, level: 3 }),
    ).toBeVisible();
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
    'Importar desde Treinta',
    'Cierres diarios',
    'Alertas',
    'Políticas de envío',
    'WhatsApp Business',
    'Integraciones',
  ]) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
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
      '/settings/bot-flow',
      '/settings/localities',
      '/shipping/incidents',
      '/settings/whatsapp',
      '/settings/integrations',
      '/settings/audit',
      '/settings/security',
      '/settings/privacy',
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

test('has no serious accessibility violations on principal routes', async ({
  page,
}) => {
  await login(page);
  for (const route of [
    '/',
    '/conversations',
    '/catalog',
    '/orders',
    '/settings/shipping',
    '/settings/bot-flow',
    '/settings/localities',
    '/shipping/incidents',
    '/alerts',
    '/settings/integrations',
    '/settings/whatsapp',
    '/settings/audit',
    '/settings/security',
    '/settings/privacy',
    '/inventory/closures',
    '/more',
  ]) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const seriousViolations = results.violations
      .filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      )
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target.join(' ')),
      }));
    expect(seriousViolations, `${route} has accessibility violations`).toEqual(
      [],
    );
  }
});

test('keeps keyboard order, 44px targets and reduced motion on shell', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/settings/integrations');
  await expect(
    page.getByRole('heading', { name: 'Integraciones' }),
  ).toBeVisible();
  const undersized = await page.evaluate(() => {
    const targets = [
      ...document.querySelectorAll('a.control-target, button.control-target'),
    ];
    return targets
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
      })
      .map((element) => element.textContent?.trim() || element.getAttribute('aria-label') || element.tagName)
      .slice(0, 8);
  });
  expect(undersized).toEqual([]);
  await page.keyboard.press('Tab');
  const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
  expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(activeTag);
  await page.getByRole('link', { name: 'Más' }).focus();
  await expect(page.getByRole('link', { name: 'Más' })).toBeFocused();
  await page.getByRole('link', { name: 'Más' }).click();
  await expect(
    page.getByRole('heading', { name: 'Más herramientas' }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Integraciones' }),
  ).toBeVisible();
});
