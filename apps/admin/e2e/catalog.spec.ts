import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { E2E_PASSWORD, E2E_USERNAME } from './constants';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const pngPath = path.join(e2eDir, 'fixtures', 'sample.png');

function credentials(): { username: string; password: string } {
  try {
    const state = JSON.parse(
      readFileSync(path.join(e2eDir, '.e2e-state.json'), 'utf8'),
    ) as { username: string; password: string };
    return state;
  } catch {
    return { username: E2E_USERNAME, password: E2E_PASSWORD };
  }
}

async function login(page: Page): Promise<void> {
  const { username, password } = credentials();
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('protected route redirects to login', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Iniciar sesión' }),
  ).toBeVisible();
});

test('rejects bad credentials with generic message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill('e2e_admin');
  await page.getByLabel('Contraseña').fill('not-the-password');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Credenciales inválidas');
});

test('main catalog operations flow', async ({ page }) => {
  await page.goto('/references/new');
  await expect(
    page.getByRole('heading', { name: 'Iniciar sesión' }),
  ).toBeVisible();

  await login(page);

  await page.getByRole('link', { name: 'Nueva referencia' }).click();
  await page.getByLabel('Código').fill('01');
  await page.getByLabel('Modelo').fill('Ballerina');
  await page.getByLabel('Color').fill('Negro');
  await page.getByLabel('Precio (COP)').fill('120000');
  await page.getByRole('button', { name: 'Crear referencia' }).click();

  await expect(page.getByLabel('Código')).toHaveValue('01');
  await expect(page.getByRole('heading', { name: /Referencia/ })).toBeVisible();

  await page.getByLabel('Subir JPEG o PNG (máx. 5 MiB)').setInputFiles(pngPath);
  await expect(
    page.getByAltText('Vista previa de la referencia'),
  ).toBeVisible();

  await page.getByLabel('Talla').fill('37');
  await page.getByLabel('Cantidad física').fill('3');
  await page.getByLabel('Nota').fill('Carga inicial');
  await page.getByRole('button', { name: 'Guardar stock' }).click();
  await expect(page.getByText('0→3')).toBeVisible();
  await expect(page.getByText(/Talla 37: 3 físicas/)).toBeVisible();

  await page.getByLabel('Cantidad física').fill('5');
  await page.getByLabel('Nota').fill('Ajuste de conteo');
  await page.getByRole('button', { name: 'Guardar stock' }).click();
  await expect(page.getByText('3→5')).toBeVisible();

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
  await expect(page.getByText('01')).toBeVisible();

  await page.getByRole('link', { name: /01/ }).click();
  await page.getByRole('button', { name: 'Reactivar' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Activa' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.goto('/references/new');
  await expect(
    page.getByRole('heading', { name: 'Iniciar sesión' }),
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
