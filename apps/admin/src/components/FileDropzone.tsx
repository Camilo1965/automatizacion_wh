import { useId, useState, type ChangeEvent, type DragEvent } from 'react';
import { Upload } from 'lucide-react';

import { cn } from '@/lib/utils';

type FileDropzoneProps = {
  label: string;
  accept: readonly string[];
  maxBytes: number;
  onFile: (file: File) => void;
  disabled?: boolean;
};

export function FileDropzone({
  label,
  accept,
  maxBytes,
  onFile,
  disabled = false,
}: FileDropzoneProps) {
  const id = useId();
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  function validate(file: File | undefined) {
    if (!file) return;
    if (!accept.includes(file.type)) {
      setError('Selecciona una imagen JPEG o PNG');
      return;
    }
    if (file.size > maxBytes) {
      setError(`El archivo supera ${Math.floor(maxBytes / 1024 / 1024)} MiB`);
      return;
    }
    setError('');
    onFile(file);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    validate(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) validate(event.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-2">
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center shadow-[var(--shadow-card)] transition-colors',
          dragging && 'border-foreground bg-muted',
          disabled && 'pointer-events-none opacity-50',
        )}
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span
          className="flex size-10 items-center justify-center rounded-[1.125rem] border border-border bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <Upload className="size-4" />
        </span>
        <strong className="text-sm font-medium text-foreground">{label}</strong>
        <span className="text-xs text-muted-foreground">
          Arrastra una imagen o selecciónala desde tu dispositivo
        </span>
        <input
          id={id}
          aria-label={label}
          type="file"
          accept={accept.join(',')}
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
        />
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
