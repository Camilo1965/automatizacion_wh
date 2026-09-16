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
  test(`login remains centered and usable at ${viewport.width}x${viewport.height}`, async ({
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
    await expect
      .poll(() =>
        page
          .locator('.auth-stage')
          .evaluate((element) =>
            element
              .getAnimations()
              .every(
                (animation: { playState: string }) =>
                  animation.playState === 'finished',
              ),
          ),
      )
      .toBe(true);

    const geometry = await page.locator('.auth-stage').evaluate((stage) => {
      const rect = stage.getBoundingClientRect();
      const pageWindow = stage.ownerDocument.defaultView;
      const brand = stage.querySelector('.login-brand-panel');
      const form = stage.querySelector('.login-card');
      const brandRect = brand?.getBoundingClientRect();
      const formRect = form?.getBoundingClientRect();
      return {
        bodyWidth: stage.ownerDocument.documentElement.scrollWidth,
        bodyHeight: stage.ownerDocument.documentElement.scrollHeight,
        viewportWidth: pageWindow?.innerWidth ?? 0,
        viewportHeight: pageWindow?.innerHeight ?? 0,
        stage: {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        margins: [rect.left, (pageWindow?.innerWidth ?? 0) - rect.right],
        overlaps:
          brandRect !== undefined && formRect !== undefined
            ? !(
                brandRect.right <= formRect.left ||
                formRect.right <= brandRect.left ||
                brandRect.bottom <= formRect.top ||
                formRect.bottom <= brandRect.top
              )
            : false,
      };
    });

    expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.bodyHeight).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.stage.top).toBeGreaterThanOrEqual(0);
    expect(geometry.stage.left).toBeGreaterThanOrEqual(0);
    expect(geometry.stage.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.stage.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(Math.abs(geometry.margins[0]! - geometry.margins[1]!)).toBeLessThan(
      2,
    );
    expect(geometry.overlaps).toBe(false);
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

  const duration = await page
    .locator('.auth-stage')
    .evaluate(
      (element) =>
        element.ownerDocument.defaultView?.getComputedStyle(element)
          .animationDuration ?? '0s',
    );
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.00001);

  for (const selector of ['.login-brand-panel', '.login-card']) {
    await expect(page.locator(selector)).toHaveCSS('transform', 'none');
    await expect(page.locator(selector)).toHaveCSS('opacity', '1');
  }
});
