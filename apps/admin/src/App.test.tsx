import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { tinyPngFile } from './test/fixtures';
import { seedDefaultCatalog, state } from './test/handlers';
import { renderWithProviders } from './test/render';
import { server } from './test/server';

async function loginAsAdmin(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const username = await screen.findByLabelText('Usuario');
  const password = screen.getByLabelText('Contraseña');
  await user.clear(username);
  await user.type(username, 'camila');
  await user.clear(password);
  await user.type(password, 'password1234');
  await user.click(screen.getByRole('button', { name: 'Entrar al panel' }));
}

describe('App shell', () => {
  it('saves a municipality carrier preference', async () => {
    const user = userEvent.setup();
    state.authenticated = true;
    let saved: unknown;
    server.use(
      http.get('/api/admin/localities/departments', () =>
        HttpResponse.json({
          data: { items: [{ name: 'Antioquia', localityCount: 125 }] },
        }),
      ),
      http.get('/api/admin/localities', ({ request }) => {
        const { pathname } = new URL(request.url);
        if (pathname !== '/api/admin/localities') {
          return HttpResponse.json({ data: { items: [] } }, { status: 404 });
        }
        return HttpResponse.json({
          data: {
            items: [
              {
                carrierCode: '05001000',
                department: 'Antioquia',
                locality: 'Medellín',
                country: 'CO',
                normalizedName: 'medellin antioquia',
              },
            ],
            nextAfterCode: null,
          },
        });
      }),
      http.post('/api/admin/shipping/rules', async ({ request }) => {
        saved = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<App />, { initialEntries: ['/settings/shipping'] });

    const municipalityForm = (
      await screen.findByRole('heading', { name: 'Nueva regla municipal' })
    ).closest('form')!;
    await within(municipalityForm).findByRole('option', {
      name: /Antioquia/,
    });
    await user.selectOptions(
      within(municipalityForm).getByLabelText('Departamento'),
      'Antioquia',
    );
    await within(municipalityForm).findByRole('option', { name: /Medellín/ });
    await user.selectOptions(
      within(municipalityForm).getByLabelText('Municipio'),
      '05001000',
    );
    await user.selectOptions(
      within(municipalityForm).getByLabelText('Transportadora preferida'),
      'tcc',
    );
    await user.selectOptions(
      within(municipalityForm).getByLabelText('Si no aparece la preferida'),
      'block',
    );
    await user.selectOptions(
      within(municipalityForm).getByLabelText('Política automática de seguro'),
      'protected_only',
    );
    await user.selectOptions(
      within(municipalityForm).getByLabelText('Seguro protegido'),
      'plus',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar regla' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Regla guardada',
    );
    expect(saved).toEqual({
      revision: 0,
      localityCarrierCode: '05001000',
      preferredCarrier: 'tcc',
      fallbackPolicy: 'block',
      offerMode: 'protected_only',
      protectedInsurance: 'plus',
    });
  });

  it('shows the operational navigation and dashboard after login', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/login'] });

    await loginAsAdmin(user);

    expect(
      await screen.findByRole('heading', { name: 'Inicio' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Pedidos' })[0]).toHaveAttribute(
      'href',
      '/orders',
    );
    expect(
      screen.getAllByRole('link', { name: 'Conversaciones' })[0],
    ).toHaveAttribute('href', '/conversations');
    expect(
      screen.getAllByRole('link', { name: 'Catálogo' })[0],
    ).toHaveAttribute('href', '/catalog');
    expect(screen.getAllByRole('link', { name: 'Envíos' })[0]).toHaveAttribute(
      'href',
      '/settings/shipping',
    );
  });

  it('renders Camila brand landmarks after login', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/login'] });

    await loginAsAdmin(user);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Camila',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('Entorno local')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Inicio' }),
    ).toBeInTheDocument();
  });

  it('opens the global operations search from the header', async () => {
    const user = userEvent.setup();
    state.authenticated = true;
    renderWithProviders(<App />, { initialEntries: ['/'] });
    await screen.findByRole('heading', { name: 'Inicio' });
    await user.click(
      screen.getByRole('button', { name: 'Abrir búsqueda global' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Búsqueda global' }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Cliente, teléfono, pedido o referencia'),
    ).toHaveFocus();
  });
});

describe('Shipping operations', () => {
  it('shows the recommended carrier and enables a shipping-inclusive summary', async () => {
    const user = userEvent.setup();
    state.authenticated = true;
    const orderId = '11111111-1111-4111-8111-111111111111';
    const order = {
      id: orderId,
      orderNumber: 'PED-000001',
      status: 'draft',
      reference: {
        id: '22222222-2222-4222-8222-222222222222',
        code: '01',
        modelName: 'Tenis',
        color: 'Negro',
      },
      size: '37',
      quantity: 1,
      customer: { name: 'Camila Pérez', phone: '+573158191776' },
      destination: {
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '05001000',
        localityDepartment: 'Antioquia',
        localityName: 'Medellín',
        deliveryNotes: null,
      },
      draftVersion: 1,
      latestSummaryVersion: 0,
      confirmedSummaryVersion: null,
      createdAt: '2026-09-07T17:00:00.000Z',
      updatedAt: '2026-09-07T17:00:00.000Z',
    };
    const shipping = {
      data: {
        quotes: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            carrier: 'envia',
            serviceId: 12,
            freightCop: 13368,
            cashOnDeliveryCop: 3000,
            surchargeCop: 600,
            insuranceMode: 'none',
            insuranceCop: 0,
            totalShippingCop: 16968,
            estimatedDays: '1',
            quotedAt: '2026-09-07T17:00:00.000Z',
            expiresAt: '2026-09-07T17:30:00.000Z',
            recommended: true,
            selected: true,
          },
        ],
        guide: null,
      },
    };
    server.use(
      http.get(`/api/admin/orders/${orderId}`, () =>
        HttpResponse.json({ data: order }),
      ),
      http.get(`/api/admin/orders/${orderId}/shipping`, () =>
        HttpResponse.json(shipping),
      ),
      http.post(`/api/admin/orders/${orderId}/shipping-quotes`, () =>
        HttpResponse.json(shipping, { status: 201 }),
      ),
    );
    renderWithProviders(<App />, { initialEntries: [`/orders/${orderId}`] });

    const option = await screen.findByRole('radio');
    expect(option.closest('label')).toHaveTextContent(/envia/);
    expect(option.closest('label')).toHaveTextContent(/16\.968/);
    expect(option.closest('label')).toHaveTextContent(/Recomendada/);
    expect(
      screen.getByRole('button', { name: 'Generar resumen' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cotizar envío' }));
    await waitFor(() =>
      expect(
        screen.getByText(/Envío seleccionado: envia/i),
      ).toBeInTheDocument(),
    );
  });
});

describe('Login and session', () => {
  it('shows generic invalid credentials message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/login'] });

    const username = await screen.findByLabelText('Usuario');
    await user.type(username, 'camila');
    await user.type(screen.getByLabelText('Contraseña'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Entrar al panel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Credenciales inválidas',
    );
  });

  it('redirects protected routes to login without session', async () => {
    renderWithProviders(<App />, { initialEntries: ['/catalog'] });

    expect(
      await screen.findByRole('heading', { name: 'Bienvenida a Camila' }),
    ).toBeInTheDocument();
  });

  it('logs in and reaches the operational dashboard', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    state.authenticated = false;
    renderWithProviders(<App />, { initialEntries: ['/login'] });

    await loginAsAdmin(user);

    expect(
      await screen.findByRole('heading', { name: 'Inicio' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nuevo pedido' })).toHaveAttribute(
      'href',
      '/orders/new',
    );
  });
});

describe('Catalog flows', () => {
  it('lists references with complete fields', async () => {
    seedDefaultCatalog();
    renderWithProviders(<App />, { initialEntries: ['/catalog'] });

    const item = await screen.findByRole('link', { name: /01/ });
    expect(item).toHaveTextContent('Ballerina');
    expect(item).toHaveTextContent('Negro');
    expect(item).toHaveTextContent('Activa');
    expect(item).toHaveTextContent(/120\.?000|120000/);
    expect(item).toHaveTextContent(/37/);
    expect(item).toHaveTextContent(/Sin foto|fotografía/i);
    expect(item).toHaveTextContent(
      new Date('2026-09-06T12:00:00.000Z').toLocaleString('es-CO'),
    );
  });

  it('lists references and filters by inactive status', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    state.references[0]!.active = false;
    renderWithProviders(<App />, { initialEntries: ['/catalog'] });

    expect(
      await screen.findByText('No hay referencias con estos filtros'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Inactivas' }));
    expect(await screen.findByText('01')).toBeInTheDocument();
  });

  it('creates a reference preserving leading zeros', async () => {
    const user = userEvent.setup();
    state.authenticated = true;
    renderWithProviders(<App />, { initialEntries: ['/references/new'] });

    await user.type(await screen.findByLabelText('Código'), '01');
    await user.type(screen.getByLabelText('Modelo'), 'Clásico');
    await user.type(screen.getByLabelText('Color'), 'Rojo');
    await user.type(screen.getByLabelText('Precio (COP)'), '99000');
    await user.upload(
      screen.getByLabelText('Fotografía principal'),
      tinyPngFile(),
    );
    await user.type(screen.getByLabelText('Talla 37'), '2');
    await user.click(screen.getByRole('button', { name: 'Crear referencia' }));

    expect(
      await screen.findByRole('heading', { name: /Referencia/ }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('01')).toBeInTheDocument();
    expect(screen.getByText(/Talla 37: 2 físicas/)).toBeInTheDocument();
  });

  it('rejects decimal price without silent truncation', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    const price = await screen.findByLabelText('Precio (COP)');
    await user.clear(price);
    await user.type(price, '120000.5');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/precio/i);
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(price.getAttribute('aria-describedby')).toBe(alert.id);
    expect(state.references[0]!.priceCop).toBe(120_000);
  });

  it('edits model and confirms deactivate', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    const model = await screen.findByLabelText('Modelo');
    await user.clear(model);
    await user.type(model, 'Ballerina Plus');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(state.references[0]!.modelName).toBe('Ballerina Plus');
    });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Desactivar referencia',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Desactivar' }),
    );

    await waitFor(() => {
      expect(state.references[0]!.active).toBe(false);
    });
  });

  it('previews photo with object URL and does not upload on select', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:preview-1');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    const input = await screen.findByLabelText('Subir JPEG o PNG (máx. 5 MiB)');
    await user.upload(input, tinyPngFile());

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
    });
    expect(
      await screen.findByAltText('Vista previa de la referencia'),
    ).toHaveAttribute('src', 'blob:preview-1');
    expect(state.references[0]!.photo).toBeNull();

    createObjectURL.mockReturnValue('blob:preview-2');
    await user.upload(input, tinyPngFile('second.png'));

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    });
    expect(state.references[0]!.photo).toBeNull();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('uploads on Guardar when no prior photo', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    const input = await screen.findByLabelText('Subir JPEG o PNG (máx. 5 MiB)');
    await user.upload(input, tinyPngFile());
    expect(state.references[0]!.photo).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Guardar fotografía' }),
    );

    await waitFor(() => {
      expect(state.references[0]!.photo).not.toBeNull();
    });
  });

  it('confirms photo replace; cancel skips upload; confirm uploads once', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    state.references[0]!.photo = {
      url: '/api/admin/references/photo',
      mimeType: 'image/png',
      byteSize: 10,
      etag: `"${'c'.repeat(64)}"`,
    };
    let uploads = 0;
    server.use(
      http.put('/api/admin/references/:referenceId/photo', () => {
        uploads += 1;
        const found = state.references[0]!;
        found.photo = {
          url: '/api/admin/references/photo-new',
          mimeType: 'image/png',
          byteSize: 20,
          etag: `"${'d'.repeat(64)}"`,
        };
        return HttpResponse.json({
          data: {
            id: found.id,
            code: found.code,
            modelName: found.modelName,
            color: found.color,
            priceCop: found.priceCop,
            active: found.active,
            photo: found.photo,
            createdAt: found.createdAt,
            updatedAt: found.updatedAt,
          },
        });
      }),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-new');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    const input = await screen.findByLabelText('Subir JPEG o PNG (máx. 5 MiB)');
    await user.upload(input, tinyPngFile());
    await user.click(
      screen.getByRole('button', { name: 'Guardar fotografía' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(uploads).toBe(0);

    await user.click(
      screen.getByRole('button', { name: 'Guardar fotografía' }),
    );
    const dialog2 = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog2).getByRole('button', {
        name: /Reemplazar|Confirmar|Guardar/i,
      }),
    );

    await waitFor(() => {
      expect(uploads).toBe(1);
    });
  });

  it('shows accessible warning when old photo cleanup failed', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    state.photoCleanupWarning = true;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    await user.upload(
      await screen.findByLabelText('Subir JPEG o PNG (máx. 5 MiB)'),
      tinyPngFile(),
    );
    await user.click(
      screen.getByRole('button', { name: 'Guardar fotografía' }),
    );

    expect(
      await screen.findByText(
        /La foto nueva sí fue guardada|foto nueva.*(guardada|sí)/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows stock balances and confirms adjustment', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    expect(await screen.findByText(/Físico:\s*3/i)).toBeInTheDocument();
    expect(screen.getByText(/Reservado:\s*0/i)).toBeInTheDocument();
    expect(screen.getByText(/Disponible:\s*3/i)).toBeInTheDocument();

    const quantity = screen.getByLabelText('Cantidad física');
    await user.clear(quantity);
    await user.type(quantity, '5');
    await user.type(screen.getByLabelText('Nota'), 'Ajuste de conteo');
    await user.click(screen.getByRole('button', { name: 'Guardar stock' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/37/);
    expect(dialog).toHaveTextContent(/3/);
    expect(dialog).toHaveTextContent(/5/);
    expect(dialog).toHaveTextContent(/Ajuste de conteo/);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(state.movements).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Guardar stock' }));
    const dialog2 = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog2).getByRole('button', { name: /Confirmar|Guardar/i }),
    );

    expect(await screen.findByText(/\+2/)).toBeInTheDocument();
    expect(screen.getByText(/3→5|3 → 5/)).toBeInTheDocument();
  });

  it('rejects stock quantity below reserved and non-digit amounts', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    state.references[0]!.stock[0] = {
      size: '37',
      physicalQuantity: 5,
      reservedQuantity: 2,
      availableQuantity: 3,
      updatedAt: '2026-09-06T12:00:00.000Z',
    };
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    expect(await screen.findByText(/Reservado:\s*2/i)).toBeInTheDocument();

    const quantity = screen.getByLabelText('Cantidad física');
    await user.clear(quantity);
    await user.type(quantity, '1');
    await user.type(screen.getByLabelText('Nota'), 'Bajar de más');
    await user.click(screen.getByRole('button', { name: 'Guardar stock' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/reservad/i);
    expect(state.movements).toHaveLength(0);

    await user.clear(quantity);
    await user.type(quantity, '3.5');
    await user.click(screen.getByRole('button', { name: 'Guardar stock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /entero|cantidad/i,
    );
    expect(state.movements).toHaveLength(0);
  });

  it('shows physical, reserved and available on detail stock list', async () => {
    seedDefaultCatalog();
    state.references[0]!.stock[0] = {
      size: '37',
      physicalQuantity: 5,
      reservedQuantity: 2,
      availableQuantity: 3,
      updatedAt: '2026-09-06T12:00:00.000Z',
    };
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    const list = await screen
      .findByRole('list', { name: /Existencias/i })
      .catch(() => screen.getByText(/Existencias/).closest('section')!);
    const row = within(list as HTMLElement).getByText(/Talla 37/);
    expect(row).toHaveTextContent(/5/);
    expect(row).toHaveTextContent(/2/);
    expect(row).toHaveTextContent(/3/);
    expect(row).toHaveTextContent(
      new Date('2026-09-06T12:00:00.000Z').toLocaleString('es-CO'),
    );
  });

  it('renders movement history with signed delta, reason and load more', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    state.movementsPageSize = 1;
    state.movements = [
      {
        id: '33333333-3333-4333-8333-333333333331',
        size: '37',
        previousQuantity: 3,
        newQuantity: 5,
        delta: 2,
        reason: 'manual_adjustment',
        note: 'Sube',
        createdAt: '2026-09-06T14:00:00.000Z',
      },
      {
        id: '33333333-3333-4333-8333-333333333332',
        size: '37',
        previousQuantity: 5,
        newQuantity: 4,
        delta: -1,
        reason: 'manual_adjustment',
        note: 'Baja',
        createdAt: '2026-09-06T13:00:00.000Z',
      },
    ];
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    expect(await screen.findByText(/\+2/)).toBeInTheDocument();
    expect(screen.getByText(/manual_adjustment/)).toBeInTheDocument();
    expect(
      screen.getByText(
        new Date('2026-09-06T14:00:00.000Z').toLocaleString('es-ES'),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/-1/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText(/-1/)).toBeInTheDocument();
    expect(screen.getAllByText(/Talla 37/).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Cargar más' }),
      ).not.toBeInTheDocument();
    });
  });

  it('shows server errors on catalog list', async () => {
    seedDefaultCatalog();
    state.forceServerError = true;
    renderWithProviders(<App />, { initialEntries: ['/catalog'] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An unexpected error occurred',
    );
  });

  it('shows recoverable invalid_response when list payload is malformed', async () => {
    seedDefaultCatalog();
    server.use(
      http.get('/api/admin/references', () =>
        HttpResponse.json({
          data: {
            items: [{ id: 'not-a-uuid', code: '01' }],
            nextAfterCode: null,
          },
        }),
      ),
    );
    renderWithProviders(<App />, { initialEntries: ['/catalog'] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La respuesta del servidor no es válida',
    );
  });

  it('clears session and shows login on expired 401', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    renderWithProviders(<App />, { initialEntries: ['/catalog'] });
    expect(await screen.findByText('01')).toBeInTheDocument();

    state.forceUnauthorized = true;
    state.authenticated = false;

    await user.click(screen.getByRole('link', { name: /01/ }));

    expect(
      await screen.findByRole('heading', { name: 'Bienvenida a Camila' }),
    ).toBeInTheDocument();
  });

  it('shows loading and empty states', async () => {
    state.authenticated = true;
    renderWithProviders(<App />, { initialEntries: ['/catalog'] });

    expect(
      await screen.findByText('No hay referencias con estos filtros'),
    ).toBeInTheDocument();
  });
});
