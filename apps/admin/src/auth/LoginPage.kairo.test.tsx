import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '../App';
import { renderWithProviders } from '../test/render';

describe('KAIRO login', () => {
  it('presents the KAIRO operations brand and a usable password control', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { initialEntries: ['/login'] });

    expect(
      await screen.findByRole('img', { name: 'KAIRO' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Centro de operaciones KAIRO' }),
    ).toBeInTheDocument();

    const password = screen.getByLabelText('Contraseña');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(
      screen.getByRole('button', { name: 'Mostrar contraseña' }),
    );
    expect(password).toHaveAttribute('type', 'text');
  });
});
