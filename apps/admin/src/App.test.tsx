import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the operations shell with accessible landmarks', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Camila Operaciones' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('Entorno local')).toBeInTheDocument();
  });
});
