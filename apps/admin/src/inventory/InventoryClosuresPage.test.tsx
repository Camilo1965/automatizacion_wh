import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InventoryClosuresPage } from './InventoryClosuresPage';
import { renderWithProviders } from '../test/render';

describe('InventoryClosuresPage', () => {
  it('shows the daily Treinta workflow', async () => {
    renderWithProviders(<InventoryClosuresPage />);
    expect(await screen.findByText('10 de septiembre de 2026')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Descargar CSV' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Marcar como aplicado en Treinta' }),
    ).toBeVisible();
  });
});
