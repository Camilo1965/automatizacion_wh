import { useState } from 'react';
import type { CatalogImportResult } from '@camila/contracts';
import {
  commitCatalogImport,
  previewCatalogImport,
} from '../api/catalog-import-api';
import { getErrorMessage } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';

export function CatalogImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadPreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewCatalogImport(file));
    } catch (caught) {
      setError(getErrorMessage(caught, 'No se pudo revisar el archivo'));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await commitCatalogImport(preview.id));
      setConfirming(false);
    } catch (caught) {
      setError(getErrorMessage(caught, 'No se pudo importar el catálogo'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="catalog-import-title">
      <h2 id="catalog-import-title">Importar catálogo</h2>
      <p>
        <a href="/api/admin/catalog-import-template" download>
          Descargar plantilla
        </a>
      </p>
      <label htmlFor="catalog-file">Archivo CSV</label>
      <input
        id="catalog-file"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={!file || busy}
        onClick={() => void loadPreview()}
      >
        Previsualizar
      </button>
      {error ? <ErrorMessage message={error} /> : null}
      {preview ? (
        <div aria-live="polite">
          <p>
            Referencias: {preview.references.length}. Errores:{' '}
            {preview.errors.length}.
          </p>
          {preview.references.length ? (
            <table>
              <caption>Referencias detectadas</caption>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Modelo</th>
                  <th>Color</th>
                  <th>Precio</th>
                  <th>Tallas y unidades</th>
                </tr>
              </thead>
              <tbody>
                {preview.references.map((reference) => (
                  <tr key={reference.code}>
                    <td>{reference.code}</td>
                    <td>{reference.modelName}</td>
                    <td>{reference.color}</td>
                    <td>
                      {new Intl.NumberFormat('es-CO', {
                        style: 'currency',
                        currency: 'COP',
                        maximumFractionDigits: 0,
                      }).format(reference.priceCop)}
                    </td>
                    <td>
                      {reference.stock
                        .map(
                          (stock) =>
                            `${stock.size} (${stock.physicalQuantity})`,
                        )
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {preview.errors.length ? (
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Campo</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {preview.errors.map((item, index) => (
                  <tr key={`${item.row}-${item.code}-${index}`}>
                    <td>{item.row}</td>
                    <td>{item.field}</td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {preview.status === 'previewed' ? (
            <button type="button" onClick={() => setConfirming(true)}>
              Confirmar importación
            </button>
          ) : null}
          {preview.status === 'committed' ? (
            <p>Catálogo importado correctamente.</p>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Confirmar importación"
        message="Se crearán referencias inactivas y existencias iniciales."
        confirmLabel="Importar catálogo"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void commit()}
      />
    </section>
  );
}
