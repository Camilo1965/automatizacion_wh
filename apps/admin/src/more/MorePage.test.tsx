import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MorePage } from './MorePage';
import { renderWithProviders } from '../test/render';

describe('MorePage', () => {
  it('makes every secondary operation reachable on mobile', () => {
    renderWithProviders(<MorePage />);
    for (const name of [
      'Importar desde Treinta',
      'Cierres diarios',
      'Alertas',
      'Políticas de envío',
      'WhatsApp Business',
      'Integraciones',
    ]) {
      expect(screen.getByRole('link', { name })).toBeVisible();
    }
  });
});
