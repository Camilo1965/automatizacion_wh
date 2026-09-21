import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LocalityCatalogPreviewResponseSchema,
  LocalityCatalogVersionsResponseSchema,
} from '@camila/contracts';
import { apiRequest, getErrorMessage } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { ErrorMessage } from '../components/ErrorMessage';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
    <section className="operational-config">
      <PageHeader
        eyebrow="Envíos"
        title="Departamentos y municipios"
        description="Importa el listado de 99envíos, revisa los municipios y publica una versión. Los pedidos existentes se conservan."
      />
      <dl className="settings-overview" aria-label="Resumen de localidades">
        <div>
          <dt>Listado activo</dt>
          <dd>
            {activeVersion
              ? `${activeVersion.rowCount} localidades`
              : 'Sin publicar'}
          </dd>
        </div>
        <div>
          <dt>Vistas previas</dt>
          <dd>{previewCount}</dd>
        </div>
        <div>
          <dt>Última actividad</dt>
          <dd>
            {versions[0]
              ? new Date(versions[0].createdAt).toLocaleString('es-CO')
              : 'Sin historial'}
          </dd>
        </div>
      </dl>
      {!query.isPending && activeVersion === null ? (
        <ErrorMessage message="No hay un listado activo de municipios. Publica o restaura una versión antes de depender del selector de envíos." />
      ) : null}
      <div className="card">
        <h2>Importar listado</h2>
        <button
          type="button"
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
        </button>
        <p className="muted">
          Versión revisada del documento proporcionado. Se carga para
          previsualizar; nunca reemplaza tus localidades sin confirmación.
        </p>
        {fileError && <ErrorMessage message={fileError} />}
        <label htmlFor="locality-format">Formato</label>
        <select
          id="locality-format"
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
        <label htmlFor="locality-file">Archivo de texto UTF-8</label>
        <input
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
        />
        <label htmlFor="locality-source">Contenido del documento</label>
        <textarea
          id="locality-source"
          rows={6}
          maxLength={500000}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            preview.reset();
          }}
        />
        <p>
          CSV: carrier_code,department,locality,country. El sistema verifica el
          código de envío internamente; la propietaria selecciona nombres.
        </p>
        <button
          type="button"
          disabled={!source || preview.isPending}
          onClick={() => preview.mutate()}
        >
          Previsualizar importación
        </button>
        {preview.isError && (
          <ErrorMessage
            message={getErrorMessage(
              preview.error,
              'No se pudo validar el archivo.',
            )}
          />
        )}
      </div>
      {preview.data && (
        <div className="card">
          <h2>Vista previa</h2>
          <p>
            {preview.data.data.rowCount} localidades válidas ·{' '}
            {preview.data.data.excludedCount} filas excluidas
          </p>
          {preview.data.data.issues.map((issue, index) => (
            <p key={index}>
              Fila {issue.row}: {issue.message}
            </p>
          ))}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Municipio</th>
                  <th>Departamento</th>
                </tr>
              </thead>
              <tbody>
                {preview.data.data.rows.map((row) => (
                  <tr key={row.carrierCode}>
                    <td>{row.locality}</td>
                    <td>{row.department}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Se muestran las primeras 100 localidades. Las filas excluidas no se
            publicarán.
          </p>
          <button
            type="button"
            onClick={() =>
              setConfirmation({ id: preview.data.data.id, restore: false })
            }
          >
            Publicar listado validado
          </button>
        </div>
      )}
      {publish.isError && (
        <ErrorMessage
          message={getErrorMessage(
            publish.error,
            'No se pudo publicar el listado.',
          )}
        />
      )}
      <div className="card">
        <h2>Versiones y restauración</h2>
        {query.isError && (
          <ErrorMessage message="No se pudo cargar el historial." />
        )}
        {versions.length === 0 ? (
          <p className="muted">
            No hay versiones publicadas ni vistas previas guardadas.
          </p>
        ) : null}
        {versions.map((version) => (
          <article key={version.id}>
            <h3>
              {version.status === 'active'
                ? 'Listado activo'
                : version.status === 'preview'
                  ? 'Vista previa'
                  : 'Versión anterior'}
            </h3>
            <p>
              {version.rowCount} localidades ·{' '}
              {new Date(version.createdAt).toLocaleString('es-CO')} ·{' '}
              {version.author}
            </p>
            {version.status === 'retired' && (
              <button
                type="button"
                onClick={() =>
                  setConfirmation({ id: version.id, restore: true })
                }
              >
                Restaurar este listado
              </button>
            )}
          </article>
        ))}
      </div>
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
