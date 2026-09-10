import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntegrationsPage } from './IntegrationsPage';
import { renderWithProviders } from '../test/render';

describe('IntegrationsPage', () => {
  it('shows every operational dependency', async () => {
    renderWithProviders(<IntegrationsPage />);
    expect(await screen.findByText('Base de datos')).toBeVisible();
    expect(screen.getByText('99envíos')).toBeVisible();
    expect(screen.getByText('Scheduler')).toBeVisible();
  });
});
