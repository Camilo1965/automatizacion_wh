import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1915, height: 900 },
];

for (const viewport of viewports) {
  test(`login remains usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/login');

    await expect(
      page.getByRole('heading', {
        name: 'Tu negocio, organizado en un solo lugar',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar al panel' }),
    ).toBeVisible();

    const geometry = await page.locator('.auth-stage').evaluate((stage) => {
      const rect = stage.getBoundingClientRect();
      const pageWindow = stage.ownerDocument.defaultView;
      return {
        bodyWidth: stage.ownerDocument.documentElement.scrollWidth,
        viewportWidth: pageWindow?.innerWidth ?? 0,
        stage: {
          top: rect.top,
          right: rect.right,
          left: rect.left,
        },
      };
    });

    expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.stage.left).toBeGreaterThanOrEqual(0);
    expect(geometry.stage.right).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    );
  });
}

test('login has no serious accessibility violations and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');

  const results = await new AxeBuilder({ page })
    .include('.auth-shell')
    .analyze();
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
  ).toEqual([]);

  for (const selector of ['.login-brand-panel', '.login-card']) {
    await expect(page.locator(selector)).toHaveCSS('transform', 'none');
    await expect(page.locator(selector)).toHaveCSS('opacity', '1');
  }
});
