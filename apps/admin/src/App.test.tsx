import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { tinyPngFile } from './test/fixtures';
import { seedDefaultCatalog, state } from './test/handlers';
import { renderWithProviders } from './test/render';

async function loginAsAdmin(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const username = await screen.findByLabelText('Usuario');
  const password = screen.getByLabelText('Contraseña');
  await user.clear(username);
  await user.type(username, 'camila');
  await user.clear(password);
  await user.type(password, 'password1234');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('App shell', () => {
  it('renders Camila Operaciones brand landmarks after login', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/login'] });

    await loginAsAdmin(user);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Camila Operaciones',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('Entorno local')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Catálogo' }),
    ).toBeInTheDocument();
  });
});

describe('Login and session', () => {
  it('shows generic invalid credentials message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/login'] });

    const username = await screen.findByLabelText('Usuario');
    await user.type(username, 'camila');
    await user.type(screen.getByLabelText('Contraseña'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Credenciales inválidas',
    );
  });

  it('redirects protected routes to login without session', async () => {
    renderWithProviders(<App />, { initialEntries: ['/'] });

    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
  });

  it('logs in and reaches catalog', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    state.authenticated = false;
    renderWithProviders(<App />, { initialEntries: ['/login'] });

    await loginAsAdmin(user);

    expect(await screen.findByText('01')).toBeInTheDocument();
    expect(screen.getByText(/Ballerina/)).toBeInTheDocument();
  });
});

describe('Catalog flows', () => {
  it('lists references and filters by inactive status', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    state.references[0]!.active = false;
    renderWithProviders(<App />, { initialEntries: ['/'] });

    expect(
      await screen.findByText('No hay referencias con estos filtros'),
    ).toBeInTheDocument();

    await user.selectOptions(
      await screen.findByLabelText('Estado'),
      'inactive',
    );
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
    await user.click(screen.getByRole('button', { name: 'Crear referencia' }));

    expect(
      await screen.findByRole('heading', { name: /Referencia/ }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('01')).toBeInTheDocument();
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

  it('previews photo with object URL and revokes on change', async () => {
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

    createObjectURL.mockReturnValue('blob:preview-2');
    await user.upload(input, tinyPngFile('second.png'));

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    });

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('adjusts stock and shows movement history', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    const id = state.references[0]!.id;
    renderWithProviders(<App />, { initialEntries: [`/references/${id}`] });

    const quantity = await screen.findByLabelText('Cantidad física');
    await user.clear(quantity);
    await user.type(quantity, '5');
    await user.type(screen.getByLabelText('Nota'), 'Ajuste de conteo');
    await user.click(screen.getByRole('button', { name: 'Guardar stock' }));

    expect(await screen.findByText(/3→5/)).toBeInTheDocument();
  });

  it('shows server errors on catalog list', async () => {
    seedDefaultCatalog();
    state.forceServerError = true;
    renderWithProviders(<App />, { initialEntries: ['/'] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An unexpected error occurred',
    );
  });

  it('clears session and shows login on expired 401', async () => {
    const user = userEvent.setup();
    seedDefaultCatalog();
    renderWithProviders(<App />, { initialEntries: ['/'] });
    expect(await screen.findByText('01')).toBeInTheDocument();

    state.forceUnauthorized = true;
    state.authenticated = false;

    await user.click(screen.getByRole('link', { name: /01/ }));

    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
  });

  it('shows loading and empty states', async () => {
    state.authenticated = true;
    renderWithProviders(<App />, { initialEntries: ['/'] });

    expect(
      await screen.findByText('No hay referencias con estos filtros'),
    ).toBeInTheDocument();
  });
});
