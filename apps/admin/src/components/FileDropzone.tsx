import { useId, useState, type ChangeEvent, type DragEvent } from 'react';

import { UploadIcon } from '../design/icons';

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
    if (!disabled) validate(event.dataTransfer.files[0]);
  }

  return (
    <div className="file-dropzone-wrap">
      <label
        className={`file-dropzone ${disabled ? 'disabled' : ''}`}
        htmlFor={id}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <UploadIcon />
        <strong>{label}</strong>
        <span>Arrastra una imagen o selecciónala desde tu dispositivo</span>
        <input
          id={id}
          aria-label={label}
          type="file"
          accept={accept.join(',')}
          disabled={disabled}
          onChange={handleChange}
        />
      </label>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
