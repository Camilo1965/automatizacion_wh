import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import {
  E2E_ADMIN_ORIGIN,
  E2E_API_ORIGIN,
  E2E_PASSWORD,
  E2E_USERNAME,
} from './constants';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const pngPath = path.join(e2eDir, 'fixtures', 'sample.png');
const pngAltPath = path.join(e2eDir, 'fixtures', 'sample-alt.jpg');
const catalogImportPath = path.join(e2eDir, 'fixtures', 'catalog-import.csv');
let loginSequence = 0;

async function login(page: Page): Promise<void> {
  loginSequence += 1;
  await page.setExtraHTTPHeaders({
    'x-camila-test-client': `playwright-${loginSequence}`,
  });
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(E2E_USERNAME);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
}

async function confirmStock(page: Page): Promise<void> {
  const dialog = page.getByRole('alertdialog', {
    name: 'Confirmar ajuste de stock',
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog).toBeHidden();
}

test.describe.configure({ mode: 'serial' });

test('protected route redirects to login', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Bienvenida a KAIRO' }),
  ).toBeVisible();
});

test('rejects bad credentials with generic message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill('e2e_admin');
  await page.getByLabel('Contraseña', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByRole('alert')).toHaveText('Credenciales inválidas');
});

test('API anonymous logout returns 401', async ({ request }) => {
  const response = await request.post(
    `${E2E_API_ORIGIN}/api/admin/auth/logout`,
    {
      headers: {
        Origin: E2E_ADMIN_ORIGIN,
        'Content-Type': 'application/json',
      },
      data: {},
    },
  );
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: 'authentication_required' },
  });
});

test('main catalog operations flow', async ({ page }) => {
  await page.goto('/references/new');
  await expect(
    page.getByRole('heading', { name: 'Bienvenida a KAIRO' }),
  ).toBeVisible();

  await login(page);

  await page.getByRole('link', { name: 'Nueva referencia' }).click();
  await page.getByLabel('Código').fill('01');
  await page.getByLabel('Modelo').fill('Ballerina');
  await page.getByLabel('Color').fill('Negro');
  await page.getByLabel('Precio (COP)').fill('120000');
  await page.getByLabel('Fotografía principal').setInputFiles(pngPath);
  await page.getByRole('button', { name: 'Crear referencia' }).click();

  await expect(page.getByLabel('Código')).toHaveValue('01');
  await expect(page.getByRole('heading', { name: /Referencia/ })).toBeVisible();

  let photoUploads = 0;
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/photo')) {
      photoUploads += 1;
    }
  });

  await page.getByLabel('Subir JPEG o PNG (máx. 5 MiB)').setInputFiles(pngPath);
  await expect(
    page.getByAltText('Vista previa de la referencia'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Guardar fotografía' }),
  ).toBeEnabled();
  expect(photoUploads).toBe(0);

  await page.getByRole('button', { name: 'Guardar fotografía' }).click();
  await page
    .getByRole('alertdialog', { name: 'Reemplazar fotografía' })
    .getByRole('button', { name: 'Reemplazar' })
    .click();
  await expect.poll(() => photoUploads).toBe(1);
  await expect(
    page.getByAltText('Vista previa de la referencia'),
  ).toBeVisible();

  await page.getByLabel('Talla').fill('37');
  await page.getByLabel('Cantidad física').fill('3');
  await page.getByLabel('Nota').fill('Carga inicial');
  await page.getByRole('button', { name: 'Guardar stock' }).click();
  await confirmStock(page);
  await expect(page.getByText('0→3')).toBeVisible();
  await expect(
    page.getByText(/Talla 37: 3 físicas · 0 reservadas · 3 disponibles/),
  ).toBeVisible();
  await expect(page.getByText(/Físico:\s*3/)).toBeVisible();
  await expect(page.getByText(/Reservado:\s*0/)).toBeVisible();
  await expect(page.getByText(/Disponible:\s*3/)).toBeVisible();

  await page.getByLabel('Cantidad física').fill('5');
  await page.getByLabel('Nota').fill('Ajuste de conteo');
  await page.getByRole('button', { name: 'Guardar stock' }).click();
  const stockDialog = page.getByRole('alertdialog', {
    name: 'Confirmar ajuste de stock',
  });
  await expect(stockDialog).toBeVisible();
  await stockDialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(stockDialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Guardar stock' }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'Guardar stock' }).click();
  await confirmStock(page);
  await expect(page.getByText('3→5')).toBeVisible();
  await expect(page.getByText('+2')).toBeVisible();
  const movementRow = page
    .locator('.movement-list li')
    .filter({ hasText: '3→5' });
  await expect(movementRow).toBeVisible();
  await expect(movementRow.locator('div.muted')).not.toBeEmpty();

  await page
    .getByLabel('Subir JPEG o PNG (máx. 5 MiB)')
    .setInputFiles(pngAltPath);
  await page.getByRole('button', { name: 'Guardar fotografía' }).click();
  const photoDialog = page.getByRole('alertdialog', {
    name: 'Reemplazar fotografía',
  });
  await expect(photoDialog).toBeVisible();
  await photoDialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(photoDialog).toBeHidden();
  expect(photoUploads).toBe(1);
  await expect(
    page.getByRole('button', { name: 'Guardar fotografía' }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'Guardar fotografía' }).click();
  await expect(photoDialog).toBeVisible();
  await photoDialog.getByRole('button', { name: 'Reemplazar' }).click();
  await expect.poll(() => photoUploads).toBe(2);
  await expect(photoDialog).toBeHidden();

  const model = page.getByLabel('Modelo');
  await model.fill('Ballerina Plus');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByLabel('Modelo')).toHaveValue('Ballerina Plus');

  await page.getByRole('button', { name: 'Desactivar' }).click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Desactivar referencia',
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Desactivar' })).toBeFocused();
  await expect(
    page.getByRole('status').filter({ hasText: 'Activa' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Desactivar' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Desactivar' })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Inactiva' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Volver al catálogo' }).click();
  await page.getByLabel('Estado').selectOption('inactive');
  await expect(
    page.locator('.reference-code', { hasText: /^01$/ }),
  ).toBeVisible();
  await expect(page.getByText(/Tallas:\s*37/)).toBeVisible();
  await expect(
    page.getByAltText('Fotografía de 01 Ballerina Plus'),
  ).toBeVisible();

  await page.getByRole('link', { name: /01/ }).click();
  await page.getByRole('button', { name: 'Reactivar' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Activa' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.goto('/references/new');
  await expect(
    page.getByRole('heading', { name: 'Bienvenida a KAIRO' }),
  ).toBeVisible();
});

test('shows field validation error on create', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Nueva referencia' }).click();
  await page.getByLabel('Código').fill('02');
  await page.getByLabel('Modelo').fill('x');
  await page.getByLabel('Color').fill('Azul');
  await page.getByLabel('Precio (COP)').fill('0');
  await page.getByRole('button', { name: 'Crear referencia' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('rejects decimal price with field-associated error', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /01/ }).click();
  const price = page.getByLabel('Precio (COP)');
  await price.fill('120000.5');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/precio/i);
  await expect(price).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await price.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText(/precio/i);
});

test('loads more movements when seeded beyond page size', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /01/ }).click();
  await expect(page.getByRole('heading', { name: /Referencia/ })).toBeVisible();

  const referenceId = page.url().split('/').pop();
  expect(referenceId).toBeTruthy();

  for (let quantity = 6; quantity <= 56; quantity += 1) {
    const response = await page.request.put(
      `/api/admin/references/${referenceId}/stock/37`,
      {
        headers: {
          Origin: E2E_ADMIN_ORIGIN,
          'Content-Type': 'application/json',
        },
        data: {
          physicalQuantity: quantity,
          note: `Seed movimiento ${quantity}`,
        },
      },
    );
    expect(
      response.ok(),
      `stock seed ${quantity} failed: ${response.status()}`,
    ).toBeTruthy();
  }

  await page.reload();
  await expect(page.getByRole('button', { name: 'Cargar más' })).toBeVisible();
  await page.getByRole('button', { name: 'Cargar más' }).click();
  await expect(page.getByText(/Seed movimiento 6/)).toBeVisible();
});

test('previews and confirms a catalog CSV import', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Importar desde Treinta' }).click();
  await expect(
    page.getByRole('heading', { name: 'Importar desde Treinta' }),
  ).toBeVisible();

  await page.getByLabel('Archivo CSV').setInputFiles(catalogImportPath);
  await page.getByRole('button', { name: 'Previsualizar' }).click();
  await expect(page.getByText('Referencias: 1. Errores: 0.')).toBeVisible();

  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Confirmar importación',
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Importar catálogo' }).click();
  await expect(
    page.getByText('Catálogo importado correctamente.'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Catálogo', exact: true }).click();
  await page.getByLabel('Estado').selectOption('inactive');
  await expect(page.getByText('E2E-IMPORT')).toBeVisible();
  await expect(page.getByText(/Tallas:\s*37, 37.5/)).toBeVisible();
});
