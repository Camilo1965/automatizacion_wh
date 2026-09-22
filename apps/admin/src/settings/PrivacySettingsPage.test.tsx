import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { adminUser } from '../test/fixtures';
import { server } from '../test/server';
import { renderWithProviders } from '../test/render';
import { PrivacySettingsPage } from './PrivacySettingsPage';

const base = '/api/admin';

function privacyHandlers() {
  return [
    http.get(`${base}/auth/session`, () =>
      HttpResponse.json({ data: { user: adminUser } }),
    ),
    http.get(`${base}/privacy/inventory`, () =>
      HttpResponse.json({
        data: {
          items: [
            {
              dataClass: 'sales_orders_customer_pii',
              tables: ['sales_orders', 'order_summaries'],
              piiFields: ['customer_name', 'customer_phone', 'address'],
              relationshipStrategy:
                'Commercial retention: anonymize PII; never delete orders.',
              allowedActions: ['retain', 'anonymize'],
            },
          ],
          capabilityNote:
            'security:manage for activate/execute; audit:read for reports',
          legalDurationsStatus: '[HUMANO]',
        },
      }),
    ),
    http.get(`${base}/privacy/policies`, () =>
      HttpResponse.json({
        data: {
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              version: 1,
              status: 'draft',
              classes: [
                {
                  dataClass: 'sales_orders_customer_pii',
                  action: 'anonymize',
                  retentionDays: null,
                  legalBasis: '[HUMANO]',
                  legalStatus: 'pending_human_approval',
                },
              ],
              createdAt: '2026-09-22T00:00:00.000Z',
              activatedAt: null,
              note: null,
            },
          ],
        },
      }),
    ),
    http.get(`${base}/privacy/runs`, () =>
      HttpResponse.json({ data: { items: [] } }),
    ),
    http.post(`${base}/privacy/runs`, async ({ request }) => {
      const body = (await request.json()) as {
        mode?: string;
        currentPassword?: string;
      };
      expect(body.mode).toBe('dry_run');
      expect(body.currentPassword).toBe('password1234');
      return HttpResponse.json({
        data: {
          run: {
            id: '22222222-2222-4222-8222-222222222222',
            policyId: '11111111-1111-4111-8111-111111111111',
            policyVersion: 1,
            mode: 'dry_run',
            status: 'completed',
            progress: [],
            report: null,
            errorMessage: null,
            createdAt: '2026-09-22T00:00:00.000Z',
            startedAt: null,
            finishedAt: null,
          },
        },
      });
    }),
  ];
}

describe('PrivacySettingsPage', () => {
  it('shows inventory, policy versions, dry-run and [HUMANO] legal note', async () => {
    server.use(...privacyHandlers());
    renderWithProviders(<PrivacySettingsPage />);

    expect(
      await screen.findByRole('heading', { name: /Inventario y retención/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sales_orders_customer_pii/)).toBeInTheDocument();
    expect(screen.getAllByText(/\[HUMANO\]/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /Simular \(dry-run\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/v1 · draft/)).toBeInTheDocument();
  });

  it('submits dry-run with password confirmation', async () => {
    server.use(...privacyHandlers());
    const user = userEvent.setup();
    renderWithProviders(<PrivacySettingsPage />);

    await screen.findByRole('heading', { name: /Inventario y retención/i });
    await user.type(
      screen.getByLabelText(/Contraseña actual/i),
      'password1234',
    );
    await user.click(
      screen.getByRole('button', { name: /Simular \(dry-run\)/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Solo conteos e IDs opacos/i),
      ).toBeInTheDocument();
    });
  });
});
