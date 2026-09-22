import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '../App';
import { renderWithProviders } from '../test/render';

describe('Camila login', () => {
  it('presents the access experience and a usable password control', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/login'] });

    expect(
      await screen.findByRole('img', { name: 'KAIRO' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Tu negocio, organizado en un solo lugar',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Bienvenida a KAIRO' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('auth-shell');
    expect(
      screen.getByRole('button', { name: 'Entrar al panel' }),
    ).toBeEnabled();

    const password = screen.getByLabelText('Contraseña');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(
      screen.getByRole('button', { name: 'Mostrar contraseña' }),
    );
    expect(password).toHaveAttribute('type', 'text');
  });
});
