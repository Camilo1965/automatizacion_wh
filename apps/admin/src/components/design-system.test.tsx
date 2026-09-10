import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { FileDropzone } from './FileDropzone';
import { SearchCombobox } from './SearchCombobox';
import { ToastProvider } from './ToastProvider';
import { useToast } from './toast-context';

describe('premium design system', () => {
  it('uses a semantic button with the shared touch target', () => {
    render(<Button>Guardar</Button>);

    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveClass(
      'control-target',
    );
  });

  it('selects a combobox option using the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchCombobox
        label="Municipio"
        value={null}
        options={[{ id: '05001000', label: 'Medellín, Antioquia' }]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Municipio' }));
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('05001000');
  });

  it('rejects files outside the configured image types', async () => {
    const onFile = vi.fn();
    render(
      <FileDropzone
        label="Fotografía principal"
        accept={['image/jpeg', 'image/png']}
        maxBytes={5 * 1024 * 1024}
        onFile={onFile}
      />,
    );

    fireEvent.change(screen.getByLabelText('Fotografía principal'), {
      target: {
        files: [new File(['hello'], 'photo.txt', { type: 'text/plain' })],
      },
    });

    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Selecciona una imagen JPEG o PNG',
    );
  });

  it('announces transient notifications', async () => {
    const user = userEvent.setup();

    function Example() {
      const { showToast } = useToast();
      return (
        <button onClick={() => showToast('Cambios guardados')}>Show</button>
      );
    }

    render(
      <ToastProvider>
        <Example />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Show' }));

    expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados');
  });
});
