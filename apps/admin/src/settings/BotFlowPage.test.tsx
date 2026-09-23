import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotFlowStepKeys } from '@camila/contracts';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { adminUser } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { BotFlowPage } from './BotFlowPage';

const definition = {
  commands: {
    human: 'humano',
    reset: 'reiniciar',
    more: 'mas',
    confirm: 'confirmar',
    cancel: 'cancelar',
  },
  pageSize: 3,
  steps: Object.fromEntries(
    BotFlowStepKeys.map((key) => [
      key,
      { enabled: true, message: `Paso ${key}` },
    ]),
  ),
  optionalSteps: {
    notes: true,
    showCarrierInSummary: true,
    sendGuideToCustomer: true,
  },
};

describe('BotFlowPage editing and simulation', () => {
  beforeEach(() => sessionStorage.removeItem('kairo.bot-flow-draft'));

  it('keeps persistent optional-step controls in Editor, not Simular', async () => {
    const user = userEvent.setup();
    let simulatedNotes: boolean | undefined;
    let draftWrites = 0;
    server.use(
      http.get('/api/admin/auth/session', () =>
        HttpResponse.json({ data: { user: adminUser } }),
      ),
      http.get('/api/admin/bot-flow', () =>
        HttpResponse.json({
          data: {
            revision: 1,
            definition,
            activeVersionId: null,
            versions: [],
          },
        }),
      ),
      http.put('/api/admin/bot-flow/draft', () => {
        draftWrites += 1;
        return HttpResponse.json({
          data: {
            revision: 2,
            definition,
            activeVersionId: null,
            versions: [],
          },
        });
      }),
      http.post('/api/admin/bot-flow/simulate', async ({ request }) => {
        simulatedNotes = (
          (await request.json()) as { definition: typeof definition }
        ).definition.optionalSteps.notes;
        return HttpResponse.json({ data: { events: [], sideEffects: false } });
      }),
    );
    renderWithProviders(<BotFlowPage />);

    expect(await screen.findByText('Borrador guardado')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Simular' }));
    expect(screen.queryByRole('switch')).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Editor' }));
    await user.click(
      screen.getByRole('switch', {
        name: 'Solicitar indicaciones de entrega',
      }),
    );
    expect(screen.getByText('Cambios sin guardar')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Simular' }));
    await user.click(screen.getByRole('button', { name: 'Probar borrador' }));
    expect(simulatedNotes).toBe(false);
    expect(draftWrites).toBe(0);
  });
});
