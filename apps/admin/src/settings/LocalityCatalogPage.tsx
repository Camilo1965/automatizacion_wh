import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LocalityCatalogPreviewResponseSchema,
  LocalityCatalogVersionsResponseSchema,
} from '@camila/contracts';

import { apiRequest, getErrorMessage } from '../api/client';
import { PageHeader } from '@/components/PageHeader';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const selectClassName =
  'h-11 w-full rounded-[1.125rem] border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export function LocalityCatalogPage() {
  const client = useQueryClient();
  const [source, setSource] = useState('');
  const [format, setFormat] = useState('99envios_document');
  const [fileError, setFileError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    id: string;
    restore: boolean;
  } | null>(null);
  const query = useQuery({
    queryKey: ['locality-catalog'],
    queryFn: () =>
      apiRequest('/locality-catalog', {
        schema: LocalityCatalogVersionsResponseSchema,
      }),
  });
  const preview = useMutation({
    mutationFn: () =>
      apiRequest('/locality-catalog/preview', {
        method: 'POST',
        body: { source, format },
        schema: LocalityCatalogPreviewResponseSchema,
      }),
  });
  const publish = useMutation({
    mutationFn: (body: { id: string; restore: boolean }) =>
      apiRequest('/locality-catalog/publish', {
        method: 'POST',
        body,
        schema: LocalityCatalogVersionsResponseSchema,
      }),
    onSuccess: (result) => {
      client.setQueryData(['locality-catalog'], result);
      setConfirmation(null);
      preview.reset();
      void client.invalidateQueries({ queryKey: ['localities'] });
    },
  });
  const versions = query.data?.data.versions ?? [];
  const activeVersion =
    versions.find((version) => version.status === 'active') ?? null;
  const previewCount = versions.filter(
    (version) => version.status === 'preview',
  ).length;
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Envíos"
        title="Departamentos y municipios"
        description="Importa el listado de 99envíos, revisa los municipios y publica una versión. Los pedidos existentes se conservan."
      />
      <dl
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Resumen de localidades"
      >
        <div className="space-y-1 rounded-[1.125rem] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Listado activo
          </dt>
          <dd className="text-sm text-foreground">
            {activeVersion
              ? `${activeVersion.rowCount} localidades`
              : 'Sin publicar'}
          </dd>
        </div>
        <div className="space-y-1 rounded-[1.125rem] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Vistas previas
          </dt>
          <dd className="text-sm text-foreground">{previewCount}</dd>
        </div>
        <div className="space-y-1 rounded-[1.125rem] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Última actividad
          </dt>
          <dd className="text-sm text-foreground">
            {versions[0]
              ? new Date(versions[0].createdAt).toLocaleString('es-CO')
              : 'Sin historial'}
          </dd>
        </div>
      </dl>
      {!query.isPending && activeVersion === null ? (
        <ErrorMessage message="No hay un listado activo de municipios. Publica o restaura una versión antes de depender del selector de envíos." />
      ) : null}
      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-lg">Importar listado</CardTitle>
          <CardDescription>
            Versión revisada del documento proporcionado. Se carga para
            previsualizar; nunca reemplaza tus localidades sin confirmación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void fetch('/99envios-localities.csv')
                .then((response) => {
                  if (!response.ok) throw new Error();
                  return response.text();
                })
                .then((text) => {
                  setSource(text);
                  setFormat('csv');
                  setFileError('');
                  preview.reset();
                })
                .catch(() =>
                  setFileError(
                    'No se pudo cargar el listado incluido. Intenta subir tu archivo.',
                  ),
                );
            }}
          >
            Usar listado de 99envíos incluido
          </Button>
          {fileError && <ErrorMessage message={fileError} />}
          <div className="space-y-2">
            <Label htmlFor="locality-format">Formato</Label>
            <select
              id="locality-format"
              className={selectClassName}
              value={format}
              onChange={(event) => {
                setFormat(event.target.value);
                preview.reset();
              }}
            >
              <option value="99envios_document">
                Documento de 99envíos (contenido PHP)
              </option>
              <option value="csv">CSV de localidades</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="locality-file">Archivo de texto UTF-8</Label>
            <Input
              id="locality-file"
              type="file"
              accept=".txt,.csv,.php,.html"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  if (file.size > 500000) {
                    setSource('');
                    setFileError('El archivo supera el límite de 500 KB.');
                    return;
                  }
                  setFileError('');
                  void file.text().then((text) => {
                    setSource(text);
                    preview.reset();
                  });
                }
              }}
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="locality-source">Contenido del documento</Label>
            <Textarea
              id="locality-source"
              rows={6}
              maxLength={500000}
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                preview.reset();
              }}
              className="rounded-[1.125rem] bg-muted"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            CSV: carrier_code,department,locality,country. El sistema verifica
            el código de envío internamente; la propietaria selecciona nombres.
          </p>
          <Button
            type="button"
            disabled={!source || preview.isPending}
            loading={preview.isPending}
            onClick={() => preview.mutate()}
          >
            Previsualizar importación
          </Button>
          {preview.isError && (
            <ErrorMessage
              message={getErrorMessage(
                preview.error,
                'No se pudo validar el archivo.',
              )}
            />
          )}
        </CardContent>
      </Card>
      {preview.data && (
        <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-lg">Vista previa</CardTitle>
            <CardDescription>
              {preview.data.data.rowCount} localidades válidas ·{' '}
              {preview.data.data.excludedCount} filas excluidas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.data.data.issues.map((issue, index) => (
              <p key={index} className="text-sm text-muted-foreground">
                Fila {issue.row}: {issue.message}
              </p>
            ))}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Municipio</TableHead>
                  <TableHead>Departamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.data.data.rows.map((row) => (
                  <TableRow key={row.carrierCode}>
                    <TableCell>{row.locality}</TableCell>
                    <TableCell>{row.department}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-sm text-muted-foreground">
              Se muestran las primeras 100 localidades. Las filas excluidas no
              se publicarán.
            </p>
            <Button
              type="button"
              onClick={() =>
                setConfirmation({ id: preview.data.data.id, restore: false })
              }
            >
              Publicar listado validado
            </Button>
          </CardContent>
        </Card>
      )}
      {publish.isError && (
        <ErrorMessage
          message={getErrorMessage(
            publish.error,
            'No se pudo publicar el listado.',
          )}
        />
      )}
      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-lg">Versiones y restauración</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isError && (
            <ErrorMessage message="No se pudo cargar el historial." />
          )}
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay versiones publicadas ni vistas previas guardadas.
            </p>
          ) : null}
          {versions.map((version) => (
            <article
              key={version.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-[1.125rem] border border-border p-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    {version.status === 'active'
                      ? 'Listado activo'
                      : version.status === 'preview'
                        ? 'Vista previa'
                        : 'Versión anterior'}
                  </h3>
                  <StatusBadge
                    tone={
                      version.status === 'active'
                        ? 'success'
                        : version.status === 'preview'
                          ? 'info'
                          : 'neutral'
                    }
                  >
                    {version.status === 'active'
                      ? 'Activo'
                      : version.status === 'preview'
                        ? 'Preview'
                        : 'Anterior'}
                  </StatusBadge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {version.rowCount} localidades ·{' '}
                  {new Date(version.createdAt).toLocaleString('es-CO')} ·{' '}
                  {version.author}
                </p>
              </div>
              {version.status === 'retired' && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setConfirmation({ id: version.id, restore: true })
                  }
                >
                  Restaurar este listado
                </Button>
              )}
            </article>
          ))}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation?.restore ? 'Restaurar listado' : 'Publicar listado'}
        message="El selector usará este listado. Los destinos guardados en pedidos existentes se conservarán. La operación quedará registrada."
        confirmLabel="Confirmar"
        busy={publish.isPending}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation) publish.mutate(confirmation);
        }}
      />
    </section>
  );
}
