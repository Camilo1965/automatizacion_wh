import { useEffect, useState, type ChangeEvent } from 'react';

import { uploadReferencePhoto } from '../api/catalog-api';
import { getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';

const MAX_BYTES = 5 * 1024 * 1024;

type PhotoEditorProps = {
  referenceId: string;
  currentPhotoUrl: string | null;
  onUploaded: () => void;
};

export function PhotoEditor({
  referenceId,
  currentPhotoUrl,
  onUploaded,
}: PhotoEditorProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl !== null) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError('');
    if (file === undefined) {
      return;
    }

    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
      setError('Solo se admiten JPEG o PNG');
      return;
    }

    if (file.size > MAX_BYTES) {
      setError('La foto no puede superar 5 MiB');
      return;
    }

    if (previewUrl !== null) {
      URL.revokeObjectURL(previewUrl);
    }
    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);

    setUploading(true);
    try {
      await uploadReferencePhoto(referenceId, file);
      onUploaded();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo subir la foto'));
    } finally {
      setUploading(false);
    }
  }

  const shownUrl = previewUrl ?? currentPhotoUrl;

  return (
    <section className="panel-block" aria-labelledby="photo-title">
      <h3 id="photo-title">Fotografía</h3>
      {shownUrl !== null ? (
        <img
          className="photo-preview"
          src={shownUrl}
          alt="Vista previa de la referencia"
        />
      ) : (
        <p className="muted">Sin fotografía</p>
      )}
      <label htmlFor="photo">Subir JPEG o PNG (máx. 5 MiB)</label>
      <input
        id="photo"
        name="photo"
        type="file"
        accept="image/jpeg,image/png"
        onChange={onFileChange}
        disabled={uploading}
      />
      <ErrorMessage message={error} id="photo-error" />
      {uploading ? (
        <p className="loading-state" role="status" aria-live="polite">
          Subiendo foto…
        </p>
      ) : null}
    </section>
  );
}
