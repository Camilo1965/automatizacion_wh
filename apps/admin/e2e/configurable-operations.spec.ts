import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E_API_ORIGIN, E2E_USERNAME, E2E_PASSWORD } from './constants';

test('owner publishes localities, edits the bot and configures a municipal insurance rule', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({
    'x-camila-test-client': 'configurable-owner-e2e',
  });
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(E2E_USERNAME);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
  await page.goto('/settings/localities');
  await page.getByLabel('Formato').selectOption('csv');
  await page
    .getByLabel('Contenido del documento')
    .fill(
      'carrier_code,department,locality,country\n05001000,Antioquia,Medellín,CO\n08001000,Atlántico,Barranquilla,CO',
    );
  await page.getByRole('button', { name: 'Previsualizar importación' }).click();
  await expect(
    page.getByText('2 localidades válidas', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Publicar listado validado' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Listado activo' }),
  ).toBeVisible();
  await page.goto('/settings/bot-flow');
  await page
    .getByLabel('Mensaje para el cliente', { exact: true })
    .fill('¡Hola! Bienvenida a KAIRO. ¿Qué talla buscas?');
  await page
    .getByRole('button', { name: 'Guardar borrador', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Publicar flujo', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Publicar flujo', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Publicar', exact: true })
    .click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await page.getByRole('tab', { name: 'Simular' }).click();
  await page
    .getByRole('button', { name: 'Probar borrador', exact: true })
    .click();
  await expect(
    page.getByText('Bot: ¡Hola! Bienvenida a KAIRO. ¿Qué talla buscas?', {
      exact: true,
    }),
  ).toBeVisible();
  const flows = await page.request.get(`${E2E_API_ORIGIN}/api/admin/bot-flow`);
  expect((await flows.json()).data.activeVersionId).toBeTruthy();
  await page.goto('/settings/shipping');
  const municipal = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Nueva regla municipal' }),
  });
  await municipal
    .getByLabel('Departamento', { exact: true })
    .selectOption('Antioquia');
  await municipal
    .getByLabel('Municipio', { exact: true })
    .selectOption({ label: 'Medellín' });
  await municipal.getByText('Editar excepción municipal').click();
  await municipal.getByLabel('Transportadora preferida').selectOption('tcc');
  await municipal
    .getByLabel('Si no aparece la preferida')
    .selectOption('block');
  await municipal
    .getByLabel('Política automática de seguro')
    .selectOption('protected_only');
  await municipal.getByLabel('Seguro protegido').selectOption('plus');
  await municipal
    .getByRole('button', { name: 'Guardar regla', exact: true })
    .click();
  await expect(page.getByText('Regla guardada', { exact: true })).toBeVisible();
  const rules = await page.request.get(
    `${E2E_API_ORIGIN}/api/admin/shipping/rules`,
  );
  expect((await rules.json()).data.items).toContainEqual(
    expect.objectContaining({
      localityCarrierCode: '05001000',
      preferredCarrier: 'tcc',
      fallbackPolicy: 'block',
      protectedInsurance: 'plus',
    }),
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of [
      '/settings/bot-flow',
      '/settings/localities',
      '/settings/shipping',
      '/shipping/incidents',
      '/settings/integrations',
      '/settings/audit',
    ]) {
      await page.goto(route);
      await expect(page.locator('main h2').first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.filter((violation) =>
          ['critical', 'serious'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (route === '/settings/bot-flow' || route === '/settings/shipping')
        await page.screenshot({
          path: `test-results/${route.endsWith('bot-flow') ? 'bot-flow' : 'shipping-rules'}-${viewport.width}.png`,
          fullPage: true,
        });
    }
    await page.screenshot({
      path: `test-results/configuration-${viewport.width}.png`,
      fullPage: true,
    });
  }
});
