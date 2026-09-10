import { screen } from '@testing-library/react';
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
});
