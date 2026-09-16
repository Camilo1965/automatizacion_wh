import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntegrationsPage } from './IntegrationsPage';
import { renderWithProviders } from '../test/render';

describe('IntegrationsPage', () => {
  it('shows every operational dependency', async () => {
    renderWithProviders(<IntegrationsPage />);
    expect(await screen.findByText('Base de datos')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: '99envíos', level: 3 }),
    ).toBeVisible();
    expect(screen.getByText('Scheduler')).toBeVisible();
  });
});
