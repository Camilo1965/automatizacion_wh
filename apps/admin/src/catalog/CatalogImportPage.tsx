import { useState } from 'react';
import type { CatalogImportResult } from '@camila/contracts';
import { FileSpreadsheet } from 'lucide-react';

import {
  commitCatalogImport,
  previewCatalogImport,
} from '../api/catalog-import-api';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageHeader, PageSection } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export function CatalogImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const step = preview ? (preview.status === 'committed' ? 3 : 2) : 1;

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
    <section aria-labelledby="catalog-import-title" className="space-y-6">
      <PageHeader
        eyebrow="Inventario"
        title="Importar desde Treinta"
        titleId="catalog-import-title"
        description="Revisa altas y actualizaciones antes de cambiar las existencias de KAIRO."
      />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Carga el archivo de inventario, revisa cada fila y confirma solo cuando
        los datos sean correctos. La vista previa nunca modifica existencias:
        las referencias nuevas quedan inactivas y las existentes actualizan
        precio y stock con movimientos auditables.
      </p>
      <ol
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        aria-label="Progreso de importación"
      >
        {(
          [
            [1, 'Cargar archivo'],
            [2, 'Revisar cambios'],
            [3, 'Importación lista'],
          ] as const
        ).map(([n, label]) => (
          <li
            key={n}
            className={cn(
              'inline-flex items-center gap-2 rounded-[1.125rem] border px-3 py-2 text-sm',
              step === n
                ? 'border-foreground bg-foreground text-background'
                : step > n
                  ? 'border-border bg-muted text-foreground'
                  : 'border-border bg-card text-muted-foreground',
            )}
          >
            <span className="font-mono text-xs">{n}</span>
            {label}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        <a
          aria-label="Descargar plantilla"
          href="/api/admin/catalog-import-template"
          download
          className="font-medium text-foreground underline underline-offset-4"
        >
          Descargar plantilla CSV
        </a>
        <span>
          {' '}
          · Columnas: referencia, modelo, color, precio y tallas
        </span>
      </p>
      <PageSection className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-[1.125rem] border border-border bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <FileSpreadsheet className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="catalog-file">Archivo CSV de Treinta</Label>
          <p className="text-xs text-muted-foreground">
            Selecciona el archivo exportado. La vista previa no modifica el
            inventario.
          </p>
          <Input
            id="catalog-file"
            type="file"
            accept=".csv,text/csv"
            className="h-11 rounded-[1.125rem] bg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setPreview(null);
              setError(
                next && !next.name.toLowerCase().endsWith('.csv')
                  ? 'Selecciona un archivo CSV.'
                  : null,
              );
              setFile(
                next && next.name.toLowerCase().endsWith('.csv') ? next : null,
              );
            }}
          />
        </div>
      </PageSection>
      {file ? (
        <p className="text-sm text-muted-foreground">
          Archivo seleccionado: {file.name} ({Math.ceil(file.size / 1024)} KB)
        </p>
      ) : null}
      <Button
        type="button"
        disabled={!file || busy}
        loading={busy && !confirming}
        className="h-11"
        onClick={() => void loadPreview()}
      >
        Previsualizar
      </Button>
      {error ? <ErrorMessage message={error} /> : null}
      {preview ? (
        <div className="space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge tone="info">
              Referencias: {preview.references.length}
            </StatusBadge>
            <StatusBadge
              tone={preview.errors.length > 0 ? 'danger' : 'success'}
            >
              Errores: {preview.errors.length}
            </StatusBadge>
          </div>
          {preview.status === 'invalid' ? (
            <p className="text-sm text-muted-foreground">
              Hay filas por corregir.
            </p>
          ) : null}
          {preview.references.length ? (
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)]">
              <Table>
                <TableCaption>Referencias detectadas</TableCaption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">Código</TableHead>
                    <TableHead className="px-4">Modelo</TableHead>
                    <TableHead className="px-4">Color</TableHead>
                    <TableHead className="px-4">Precio</TableHead>
                    <TableHead className="px-4">Tallas y unidades</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.references.map((reference) => (
                    <TableRow key={reference.code}>
                      <TableCell className="px-4 font-mono text-xs">
                        {reference.code}
                      </TableCell>
                      <TableCell className="px-4 whitespace-normal">
                        {reference.modelName}
                      </TableCell>
                      <TableCell className="px-4">{reference.color}</TableCell>
                      <TableCell className="px-4">
                        {new Intl.NumberFormat('es-CO', {
                          style: 'currency',
                          currency: 'COP',
                          maximumFractionDigits: 0,
                        }).format(reference.priceCop)}
                      </TableCell>
                      <TableCell className="px-4 whitespace-normal">
                        {reference.stock
                          .map(
                            (stock) =>
                              `${stock.size} (${stock.physicalQuantity})`,
                          )
                          .join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {preview.errors.length ? (
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">Fila</TableHead>
                    <TableHead className="px-4">Campo</TableHead>
                    <TableHead className="px-4">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.errors.map((item, index) => (
                    <TableRow key={`${item.row}-${item.code}-${index}`}>
                      <TableCell className="px-4">{item.row}</TableCell>
                      <TableCell className="px-4">{item.field}</TableCell>
                      <TableCell className="px-4 whitespace-normal">
                        {item.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {preview.errors.length ? (
            <p className="text-sm text-muted-foreground">
              Corrige el archivo en Treinta y vuelve a previsualizar. No se
              puede confirmar mientras existan errores.
            </p>
          ) : null}
          {preview.status === 'previewed' ? (
            <Button
              type="button"
              className="h-11"
              onClick={() => setConfirming(true)}
            >
              Confirmar importación
            </Button>
          ) : null}
          {preview.status === 'committed' ? (
            <p className="text-sm font-medium text-foreground" role="status">
              Catálogo importado correctamente.
            </p>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Confirmar importación"
        message="Se crearán referencias nuevas inactivas y se actualizarán las referencias existentes con movimientos de inventario."
        confirmLabel="Importar catálogo"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void commit()}
      />
    </section>
  );
}
