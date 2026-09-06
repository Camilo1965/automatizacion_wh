import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test/render';
import { ConfirmDialog } from './ConfirmDialog';

function DialogHarness({
  busy = false,
  onCancel = vi.fn(),
  onConfirm = vi.fn(),
}: {
  busy?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir diálogo
      </button>
      <ConfirmDialog
        open={open}
        title="Confirmar acción"
        message="¿Seguro?"
        confirmLabel="Confirmar"
        onConfirm={onConfirm}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
        busy={busy}
      />
    </>
  );
}

describe('ConfirmDialog accessibility', () => {
  it('cycles Tab within the dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Abrir diálogo' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Confirmar acción',
    });
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Confirmar' });

    cancel.focus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    expect(dialog).toBeInTheDocument();
  });

  it('calls onCancel on Escape when not busy', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(<DialogHarness onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Abrir diálogo' }));
    await screen.findByRole('alertdialog', { name: 'Confirmar acción' });
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when busy', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(<DialogHarness busy onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Abrir diálogo' }));
    await screen.findByRole('alertdialog', { name: 'Confirmar acción' });
    await user.keyboard('{Escape}');

    expect(onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole('alertdialog', { name: 'Confirmar acción' }),
    ).toBeInTheDocument();
  });

  it('restores focus to the trigger on close', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DialogHarness />);

    const trigger = screen.getByRole('button', { name: 'Abrir diálogo' });
    await user.click(trigger);
    await screen.findByRole('alertdialog', { name: 'Confirmar acción' });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
});
