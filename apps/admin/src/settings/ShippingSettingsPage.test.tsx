import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { adminUser } from '../test/fixtures';
import { server } from '../test/server';
import { renderWithProviders } from '../test/render';
import { ShippingSettingsPage } from './ShippingSettingsPage';

const base = '/api/admin';

function shippingHandlers(options?: { simulateFail?: boolean }) {
  let simulateFail = options?.simulateFail ?? true;
  return [
    http.get(`${base}/auth/session`, () =>
      HttpResponse.json({ data: { user: adminUser } }),
    ),
    http.get(`${base}/shipping/preferences`, () =>
      HttpResponse.json({
        data: {
          revision: 1,
          preferredCarrier: null,
          fallbackPolicy: 'allow',
          offerMode: 'customer_choice',
          protectedInsurance: 'standard',
        },
      }),
    ),
    http.get(`${base}/shipping/rules`, () =>
      HttpResponse.json({ data: { items: [] } }),
    ),
    http.get(`${base}/shipping/carriers`, () =>
      HttpResponse.json({
        data: { items: ['interrapidisimo', 'tcc', 'servientrega'] },
      }),
    ),
    http.get(`${base}/localities/departments`, () =>
      HttpResponse.json({
        data: { items: [{ name: 'Antioquia', localityCount: 1 }] },
      }),
    ),
    http.get(`${base}/localities`, () =>
      HttpResponse.json({
        data: {
          items: [
            {
              carrierCode: '05001000',
              department: 'Antioquia',
              locality: 'Medellín',
              country: 'CO',
              normalizedName: 'medellin',
            },
          ],
          nextAfterCode: null,
        },
      }),
    ),
    http.post(`${base}/shipping/simulate`, () => {
      if (simulateFail) {
        simulateFail = false;
        return HttpResponse.json(
          {
            error: {
              code: 'provider_unavailable',
              message: '99envíos no respondió',
            },
          },
          { status: 503 },
        );
      }
      return HttpResponse.json({
        data: {
          localityCarrierCode: '05001000',
          blocked: false,
          selectedCarrier: 'tcc',
          sideEffects: false,
          quotes: [
            {
              carrier: 'tcc',
              totalCop: 12000,
              insuranceMode: 'none',
              selected: true,
              reason: 'selected',
            },
          ],
        },
      });
    }),
  ];
}

describe('ShippingSettingsPage sections and simulator recovery', () => {
  it('prevents saving defaults after a failed load and recovers on retry', async () => {
    const user = userEvent.setup();
    let requests = 0;
    server.use(
      http.get(`${base}/shipping/preferences`, () => {
        requests += 1;
        if (requests === 1)
          return HttpResponse.json(
            { error: { code: 'unavailable', message: 'Carga fallida' } },
            { status: 503 },
          );
        return HttpResponse.json({
          data: {
            revision: 4,
            preferredCarrier: 'tcc',
            fallbackPolicy: 'block',
            offerMode: 'economy_only',
            protectedInsurance: 'standard',
          },
        });
      }),
      ...shippingHandlers(),
    );
    renderWithProviders(<ShippingSettingsPage />);

    expect(await screen.findByText('Carga fallida')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Guardar preferencia general' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Guardar regla' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar carga' }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Guardar preferencia general' }),
      ).toBeEnabled();
    });
    expect(requests).toBe(2);
  });

  it('starts a new municipal rule from the loaded global policy and explains replacement', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${base}/shipping/preferences`, () =>
        HttpResponse.json({
          data: {
            revision: 3,
            preferredCarrier: 'tcc',
            fallbackPolicy: 'block',
            offerMode: 'protected_only',
            protectedInsurance: 'plus',
            allowedCarriers: ['tcc'],
          },
        }),
      ),
      ...shippingHandlers(),
    );
    renderWithProviders(<ShippingSettingsPage />);
    const municipal = await screen.findByRole('region', {
      name: 'Excepciones por localidad',
    });
    await waitFor(() =>
      expect(
        within(municipal).getByRole('button', { name: 'Guardar regla' }),
      ).toBeDisabled(),
    );
    await user.selectOptions(
      within(municipal).getByLabelText('Departamento', { exact: true }),
      'Antioquia',
    );
    await user.selectOptions(
      within(municipal).getByLabelText('Municipio', { exact: true }),
      '05001000',
    );
    await user.click(within(municipal).getByText('Editar excepción municipal'));
    expect(
      within(municipal).getByLabelText('Transportadora preferida'),
    ).toHaveValue('tcc');
    expect(
      within(municipal).getByText(/reemplaza todos los campos/i),
    ).toBeVisible();
    expect(
      within(municipal).getByRole('button', {
        name: 'Copiar política general',
      }),
    ).toBeVisible();
  });

  it('blocks a contradictory municipal rule before sending it', async () => {
    const user = userEvent.setup();
    server.use(...shippingHandlers());
    renderWithProviders(<ShippingSettingsPage />);
    const municipal = await screen.findByRole('region', {
      name: 'Excepciones por localidad',
    });
    await user.selectOptions(
      within(municipal).getByLabelText('Departamento', { exact: true }),
      'Antioquia',
    );
    await user.selectOptions(
      within(municipal).getByLabelText('Municipio', { exact: true }),
      '05001000',
    );
    await user.click(within(municipal).getByText('Editar excepción municipal'));
    await user.selectOptions(
      within(municipal).getByLabelText('Transportadora preferida'),
      'tcc',
    );
    const excluded = within(municipal).getByRole('group', {
      name: 'Transportadoras excluidas',
    });
    await user.click(within(excluded).getByLabelText('TCC'));
    expect(
      within(municipal).getByText(/transportadora preferida.*excluida/i),
    ).toBeVisible();
    expect(
      within(municipal).getByRole('button', { name: 'Guardar regla' }),
    ).toBeDisabled();
  });

  it('separates general policy, locality exceptions, simulator and incidents status', async () => {
    server.use(...shippingHandlers());
    renderWithProviders(<ShippingSettingsPage />);

    expect(
      await screen.findByRole('heading', { name: /Preferencias de envío/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: /Política general/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: /Excepciones por localidad/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: /Simulador de decisión/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: /Incidencias y estado/i }),
    ).toBeVisible();
  });

  it('recovers from simulator errors with a persistent next step', async () => {
    const user = userEvent.setup();
    server.use(...shippingHandlers({ simulateFail: true }));
    renderWithProviders(<ShippingSettingsPage />);

    expect(
      await screen.findByRole('button', { name: /Cotizar sin crear guía/i }),
    ).toBeDisabled();

    const simulator = screen.getByRole('region', {
      name: /Simulador de decisión/i,
    });
    const department = within(simulator).getByLabelText(/Departamento/i);
    await user.selectOptions(department, 'Antioquia');
    const municipality = within(simulator).getByLabelText(/Municipio/i);
    await user.selectOptions(municipality, '05001000');

    await user.click(
      within(simulator).getByRole('button', {
        name: /Cotizar sin crear guía/i,
      }),
    );

    expect(
      await within(simulator).findByText(
        /99envíos no respondió|No se pudo consultar la cobertura/i,
      ),
    ).toBeVisible();
    expect(
      within(simulator).getByText(/reintentar la cotización/i),
    ).toBeVisible();

    await user.click(
      within(simulator).getByRole('button', { name: /Reintentar cotización/i }),
    );

    await waitFor(() => {
      expect(
        within(simulator).getByText(/Transportadora seleccionada: tcc/i),
      ).toBeVisible();
    });
    expect(
      within(simulator).getByText(/revisa la regla o crea el pedido/i),
    ).toBeVisible();
  });
});
