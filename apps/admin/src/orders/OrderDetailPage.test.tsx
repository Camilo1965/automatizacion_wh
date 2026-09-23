import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { adminUser } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { OrderDetailPage } from './OrderDetailPage';

const orderId = '11111111-1111-4111-8111-111111111111';
const referenceId = '22222222-2222-4222-8222-222222222222';
const now = '2026-09-22T12:00:00.000Z';

describe('OrderDetailPage shipping recovery', () => {
  it('explains how to recover when no selectable quote remains', async () => {
    server.use(
      http.get('/api/admin/auth/session', () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get(`/api/admin/orders/${orderId}`, () =>
        HttpResponse.json({
          data: {
            id: orderId,
            orderNumber: 'PED-000001',
            status: 'draft',
            reference: {
              id: referenceId,
              code: '01',
              modelName: 'Ballerina',
              color: 'Negro',
            },
            size: '37',
            quantity: 1,
            customer: { name: 'Ana Gómez', phone: '+573001234567' },
            destination: {
              address: 'Calle 1',
              localityCarrierCode: '05001000',
              localityDepartment: 'Antioquia',
              localityName: 'Medellín',
              deliveryNotes: null,
            },
            draftVersion: 1,
            latestSummaryVersion: 0,
            confirmedSummaryVersion: null,
            createdAt: now,
            updatedAt: now,
          },
        }),
      ),
      http.get(`/api/admin/orders/${orderId}/shipping`, () =>
        HttpResponse.json({ data: { quotes: [], guide: null } }),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
      </Routes>,
      { initialEntries: [`/orders/${orderId}`] },
    );

    expect(
      await screen.findByRole('button', { name: 'Cotizar envío' }),
    ).toBeVisible();
    expect(
      screen.getByText(/no hay cotizaciones vigentes.*cotiza de nuevo/i),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Generar resumen' }),
    ).toBeDisabled();
  });
});
