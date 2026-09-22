import { useEffect, useState, type ChangeEvent } from 'react';

import { uploadReferencePhoto } from '../api/catalog-api';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageSection } from '../components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
    <PageSection aria-labelledby="photo-title" className="space-y-4">
      <h3
        id="photo-title"
        className="text-base font-semibold tracking-tight text-foreground"
      >
        Fotografía
      </h3>
      {shownUrl !== null ? (
        <img
          className="max-h-72 w-full max-w-md rounded-[1.125rem] border border-border object-cover shadow-[var(--shadow-card)]"
          src={shownUrl}
          alt="Vista previa de la referencia"
        />
      ) : (
        <p className="text-sm text-muted-foreground">Sin fotografía</p>
      )}
      <div className="space-y-2">
        <Label htmlFor="photo">Subir JPEG o PNG (máx. 5 MiB)</Label>
        <Input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png"
          onChange={onFileChange}
          disabled={uploading}
          className="h-11 rounded-[1.125rem] bg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm"
        />
      </div>
      <Button
        type="button"
        className="h-11"
        onClick={onSaveClick}
        disabled={pendingFile === null || uploading}
        loading={uploading}
      >
        {uploading ? 'Subiendo…' : 'Guardar fotografía'}
      </Button>
      <ErrorMessage message={error} id="photo-error" />
      {warning !== '' ? (
        <Alert role="status" aria-live="polite" className="rounded-[1.125rem]">
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ) : null}
      {uploading ? (
        <p
          className="text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
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
    </PageSection>
  );
}
