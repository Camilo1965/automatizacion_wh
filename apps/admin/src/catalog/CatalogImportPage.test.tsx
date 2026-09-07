import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CatalogImportPage } from './CatalogImportPage';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';

const previewId = '11111111-1111-4111-8111-111111111111';
const createdAt = '2026-09-06T00:00:00.000Z';

describe('CatalogImportPage', () => {
  it('offers template download and CSV preview', async () => {
    renderWithProviders(<CatalogImportPage />);
    expect(
      await screen.findByRole('heading', { name: 'Importar catálogo' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Descargar plantilla' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Archivo CSV')).toBeVisible();
  });

  it('shows row errors and does not offer commit for an invalid preview', async () => {
    server.use(
      http.post('/api/admin/catalog-imports/preview', () =>
        HttpResponse.json(
          {
            data: {
              id: previewId,
              status: 'invalid',
              references: [],
              errors: [
                {
                  row: 2,
                  field: 'reference_code',
                  code: 'reference_exists',
                  message: 'La referencia 01 ya existe en el catálogo',
                },
              ],
              createdAt,
            },
          },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<CatalogImportPage />);

    await user.upload(
      screen.getByLabelText('Archivo CSV'),
      new File(['invalid'], 'catalogo.csv', { type: 'text/csv' }),
    );
    await user.click(screen.getByRole('button', { name: 'Previsualizar' }));

    expect(
      await screen.findByText('La referencia 01 ya existe en el catálogo'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Confirmar importación' }),
    ).not.toBeInTheDocument();
  });

  it('requires confirmation and reports a successful import', async () => {
    server.use(
      http.post('/api/admin/catalog-imports/preview', () =>
        HttpResponse.json(
          {
            data: {
              id: previewId,
              status: 'previewed',
              references: [
                {
                  code: '01',
                  modelName: 'Tenis',
                  color: 'Negro',
                  priceCop: 120000,
                  stock: [{ size: '37', physicalQuantity: 2 }],
                },
              ],
              errors: [],
              createdAt,
            },
          },
          { status: 201 },
        ),
      ),
      http.post(`/api/admin/catalog-imports/${previewId}/commit`, () =>
        HttpResponse.json({
          data: {
            id: previewId,
            status: 'committed',
            references: [
              {
                code: '01',
                modelName: 'Tenis',
                color: 'Negro',
                priceCop: 120000,
                stock: [{ size: '37', physicalQuantity: 2 }],
              },
            ],
            errors: [],
            createdAt,
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<CatalogImportPage />);

    await user.upload(
      screen.getByLabelText('Archivo CSV'),
      new File(['valid'], 'catalogo.csv', { type: 'text/csv' }),
    );
    await user.click(screen.getByRole('button', { name: 'Previsualizar' }));
    expect(await screen.findByRole('cell', { name: '01' })).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Tenis' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '37 (2)' })).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Confirmar importación' }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Confirmar importación',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Importar catálogo' }),
    );

    expect(
      await screen.findByText('Catálogo importado correctamente.'),
    ).toBeVisible();
  });
});
