import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../test/render';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  it('renders real operational queues and links to filtered work', async () => {
    renderWithProviders(<DashboardPage />);

    const readyLink = await screen.findByRole('link', {
      name: /Listos para despachar/,
    });
    expect(readyLink).toHaveTextContent('3');
    expect(readyLink).toHaveAttribute('href', '/orders?view=ready_to_dispatch');
    expect(
      screen.getByRole('link', { name: /Conversaciones por atender/ }),
    ).toHaveAttribute('href', '/conversations?attention=true');
    expect(screen.getByText('$ 480.000')).toBeInTheDocument();
  });

  it('switches the range without manufacturing dashboard data', async () => {
    renderWithProviders(<DashboardPage />);
    const button = await screen.findByRole('button', { name: '7 días' });
    await button.click();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'Resumen de los últimos 7 días',
        }),
      ).toBeInTheDocument(),
    );
  });
});
