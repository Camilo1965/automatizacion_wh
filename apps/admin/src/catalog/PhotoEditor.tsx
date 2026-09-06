import { useEffect, useState, type ChangeEvent } from 'react';

import { uploadReferencePhoto } from '../api/catalog-api';
import { getErrorMessage } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasExistingPhoto = currentPhotoUrl !== null;

  useEffect(() => {
    return () => {
      if (previewUrl !== null) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError('');
    setWarning('');
    if (file === undefined) {
      return;
    }

    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
      setError('Solo se admiten JPEG o PNG');
      setPendingFile(null);
      return;
    }

    if (file.size > MAX_BYTES) {
      setError('La foto no puede superar 5 MiB');
      setPendingFile(null);
      return;
    }

    if (previewUrl !== null) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
    setPendingFile(file);
  }

  async function performUpload(file: File) {
    setUploading(true);
    setError('');
    setWarning('');
    try {
      const response = await uploadReferencePhoto(referenceId, file);
      if (response.warnings?.includes('old_photo_cleanup_failed') === true) {
        setWarning(
          'La foto nueva sí fue guardada, pero no se pudo limpiar la foto anterior.',
        );
      }
      if (previewUrl !== null) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setPendingFile(null);
      setConfirmOpen(false);
      onUploaded();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo subir la foto'));
      setConfirmOpen(false);
    } finally {
      setUploading(false);
    }
  }

  function onSaveClick() {
    if (pendingFile === null || uploading) {
      return;
    }
    if (hasExistingPhoto) {
      setConfirmOpen(true);
      return;
    }
    void performUpload(pendingFile);
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
      <button
        type="button"
        className="button-primary"
        onClick={onSaveClick}
        disabled={pendingFile === null || uploading}
      >
        {uploading ? 'Subiendo…' : 'Guardar fotografía'}
      </button>
      <ErrorMessage message={error} id="photo-error" />
      {warning !== '' ? (
        <p className="warning-message" role="status" aria-live="polite">
          {warning}
        </p>
      ) : null}
      {uploading ? (
        <p className="loading-state" role="status" aria-live="polite">
          Subiendo foto…
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Reemplazar fotografía"
        message="¿Reemplazar la fotografía actual de esta referencia?"
        confirmLabel="Reemplazar"
        onConfirm={() => {
          if (pendingFile !== null) {
            void performUpload(pendingFile);
          }
        }}
        onCancel={() => setConfirmOpen(false)}
        busy={uploading}
      />
    </section>
  );
}
