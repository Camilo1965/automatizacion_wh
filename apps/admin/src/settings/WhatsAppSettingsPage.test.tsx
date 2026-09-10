import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WhatsAppSettingsPage } from './WhatsAppSettingsPage';
import { renderWithProviders } from '../test/render';

describe('WhatsAppSettingsPage', () => {
  it('explains that the mobile application is unavailable without evidence', async () => {
    renderWithProviders(<WhatsAppSettingsPage />);
    expect(await screen.findByText('Solo API de WhatsApp')).toBeVisible();
    expect(
      screen.getByText(/aplicación móvil todavía no está verificada/i),
    ).toBeVisible();
  });
});
