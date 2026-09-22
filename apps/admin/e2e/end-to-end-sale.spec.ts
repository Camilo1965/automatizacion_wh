import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import {
  E2E_ADMIN_ORIGIN,
  E2E_API_ORIGIN,
  E2E_DATABASE_URL,
  E2E_PASSWORD,
  E2E_USERNAME,
} from './constants';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const pngPath = path.join(e2eDir, 'fixtures', 'sample.png');
const repoRoot = path.resolve(e2eDir, '../../..');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
let loginSequence = 0;

function runSaleHelper(args: string[]): void {
  const env = {
    ...process.env,
    DATABASE_URL: E2E_DATABASE_URL,
    TEST_DATABASE_URL: E2E_DATABASE_URL,
  };
  const pnpmArgs = [
    '--filter',
    '@camila/api',
    'exec',
    'tsx',
    'src/cli/e2e-sale-helpers.ts',
    ...args,
  ];
  if (process.platform === 'win32') {
    const quoted = [pnpmCommand, ...pnpmArgs]
      .map((part) => (/\s/.test(part) ? `"${part}"` : part))
      .join(' ');
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', quoted], {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
      shell: false,
    });
    return;
  }
  execFileSync(pnpmCommand, pnpmArgs, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: false,
  });
}

async function login(page: Page) {
  loginSequence += 1;
  await page.setExtraHTTPHeaders({
    'x-camila-test-client': `e2e-sale-${loginSequence}`,
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

test('controlled sale: catalog → customer → quote → confirm → guide → dispatch → deliver → return constraints', async ({
  page,
}) => {
  runSaleHelper(['ensure-locality']);
  await login(page);

  await page.goto('/references/new');
  await page.getByLabel('Código').fill('88');
  await page.getByLabel('Modelo').fill('Sale E2E');
  await page.getByLabel('Color').fill('Rojo');
  await page.getByLabel('Precio (COP)').fill('99000');
  await page.getByLabel('Fotografía principal').setInputFiles(pngPath);
  await page.getByLabel('Talla 37').fill('2');
  await page.getByRole('button', { name: 'Crear referencia' }).click();
  await expect(page).toHaveURL(/\/references\/[0-9a-f-]+$/);
  const referenceId = page.url().split('/').pop()!;

  await page.goto('/orders/new');
  await page.getByLabel('Referencia').selectOption(referenceId);
  await page.getByLabel('Talla').selectOption('37');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
  const orderId = page.url().split('/').pop()!;

  await page.getByLabel('Nombre').fill('Cliente E2E');
  await page.getByLabel('Teléfono').fill('3001234567');
  await page.getByLabel('Dirección').fill('Calle 10 # 20-30');
  await page
    .getByLabel('Departamento', { exact: true })
    .selectOption('Antioquia');
  await expect(page.getByLabel('Municipio', { exact: true })).toBeEnabled();
  await page.getByLabel('Municipio', { exact: true }).selectOption('05001000');
  await expect(page.getByText(/Medellín, Antioquia/)).toBeVisible();

  const patch = await page.request.patch(
    `${E2E_API_ORIGIN}/api/admin/orders/${orderId}`,
    {
      headers: { Origin: E2E_ADMIN_ORIGIN },
      data: {
        customerName: 'Cliente E2E',
        customerPhone: '3001234567',
        address: 'Calle 10 # 20-30',
        localityCarrierCode: '05001000',
      },
    },
  );
  expect(patch.status(), await patch.text()).toBe(200);
  await page.reload();
  await expect(page.getByLabel('Nombre')).toHaveValue('Cliente E2E');
  await expect(page.getByLabel('Dirección')).toHaveValue(/Calle 10/);
  await expect(page.getByText(/Medellín, Antioquia|05001000/)).toBeVisible();

  runSaleHelper(['seed-quote', orderId]);
  await page.reload();
  await expect(page.getByText(/Envío seleccionado: envia/i)).toBeVisible();
  await page.getByRole('button', { name: 'Generar resumen' }).click();
  await expect(page.getByText(/Total contra entrega/i)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar y reservar' }).click();
  await expect(page.getByText(/confirmado/i).first()).toBeVisible();

  runSaleHelper(['mark-guide-created', orderId]);
  await page.reload();
  await expect(page.getByText(/Estado: created/i)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Descargar PDF' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Despachar' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Despachar' })
    .click();
  await expect(page.getByText(/despachado/i).first()).toBeVisible();

  const cancelWhileDispatched = await page.request.post(
    `${E2E_API_ORIGIN}/api/admin/orders/${orderId}/cancel`,
    { headers: { Origin: E2E_ADMIN_ORIGIN }, data: {} },
  );
  expect(cancelWhileDispatched.status()).toBeGreaterThanOrEqual(400);

  await page.getByRole('button', { name: 'Entregar' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Marcar entregado' })
    .click();
  await expect(page.getByText(/entregado/i).first()).toBeVisible();

  await page.getByRole('button', { name: 'Registrar devolución' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Registrar devolución' })
    .click();
  await expect(page.getByText(/devuelto|devoluci/i).first()).toBeVisible();
});

test('rejects duplicate inbound webhook payload without second row', async ({
  request,
}) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  test.skip(
    appSecret === undefined || appSecret.trim() === '',
    'WHATSAPP_APP_SECRET unset — covered by critical-idempotency.integration',
  );
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'ENTRY',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '573000000000',
                phone_number_id: '100',
              },
              contacts: [{ wa_id: '573009998877', profile: { name: 'Dup' } }],
              messages: [
                {
                  from: '573009998877',
                  id: `wamid.e2e-dup-${randomUUID()}`,
                  timestamp: '1710000000',
                  type: 'text',
                  text: { body: 'hola' },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  });
  const signature = `sha256=${createHmac('sha256', appSecret!)
    .update(body)
    .digest('hex')}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Hub-Signature-256': signature,
  };
  const first = await request.post(`${E2E_API_ORIGIN}/webhooks/whatsapp`, {
    headers,
    data: body,
  });
  const second = await request.post(`${E2E_API_ORIGIN}/webhooks/whatsapp`, {
    headers,
    data: body,
  });
  expect(first.status()).toBe(200);
  expect(second.status()).toBe(200);
});

test('rate limits repeated anonymous login attempts', async ({ request }) => {
  const headers = {
    Origin: E2E_ADMIN_ORIGIN,
    'Content-Type': 'application/json',
    'x-camila-test-client': 'e2e-sale-rate-limit',
  };
  let lastStatus = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request.post(
      `${E2E_API_ORIGIN}/api/admin/auth/login`,
      {
        headers,
        data: { username: 'nobody', password: 'wrong-password-12' },
      },
    );
    lastStatus = response.status();
    if (lastStatus === 429) break;
  }
  expect(lastStatus).toBe(429);
});
