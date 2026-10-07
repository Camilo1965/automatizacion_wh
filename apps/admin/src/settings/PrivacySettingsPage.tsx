import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  activateRetentionPolicy,
  executeDataSubject,
  fetchPrivacyInventory,
  listRetentionPolicies,
  listRetentionRuns,
  previewDataSubject,
  startRetentionRun,
} from '../api/privacy-api';
import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { ErrorMessage } from '@/components/ErrorMessage';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function PrivacySettingsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [confirmIrreversible, setConfirmIrreversible] = useState(false);

  const inventoryQuery = useQuery({
    queryKey: ['privacy-inventory'],
    queryFn: fetchPrivacyInventory,
    enabled: isOwner,
  });
  const policiesQuery = useQuery({
    queryKey: ['privacy-policies'],
    queryFn: listRetentionPolicies,
    enabled: isOwner,
  });
  const runsQuery = useQuery({
    queryKey: ['privacy-runs'],
    queryFn: listRetentionRuns,
    enabled: isOwner,
  });

  const dryRunMutation = useMutation({
    mutationFn: () => {
      const policyId = policiesQuery.data?.[0]?.id;
      if (policyId === undefined) {
        throw new Error('Crea un borrador de política primero');
      }
      return startRetentionRun({
        mode: 'dry_run',
        currentPassword: password,
        policyId,
      });
    },
    onSuccess: async (run) => {
      setError(null);
      setMessage(
        `Simulación ${run.id.slice(0, 8)}… completada. Solo conteos e IDs opacos.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['privacy-runs'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(getErrorMessage(err, 'No se pudo simular retención'));
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => {
      const draft = policiesQuery.data?.find((p) => p.status === 'draft');
      if (draft === undefined) {
        throw new Error('No hay borrador para activar');
      }
      if (!confirmIrreversible) {
        throw new Error('Confirma la acción irreversible');
      }
      return activateRetentionPolicy(draft.id, {
        currentPassword: password,
        confirmIrreversible: true,
      });
    },
    onSuccess: async () => {
      setError(null);
      setMessage(
        'Política activada. El borrado automático sigue apagado y requiere una habilitación y aprobación por separado.',
      );
      await queryClient.invalidateQueries({ queryKey: ['privacy-policies'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(getErrorMessage(err, 'No se pudo activar la política'));
    },
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      previewDataSubject({
        kind: 'export',
        customerPhone,
        currentPassword: password,
      }),
    onSuccess: (preview) => {
      setError(null);
      setPreviewJson(JSON.stringify(preview, null, 2));
      setMessage('Vista previa lista (sin PII en claro).');
    },
    onError: (err) => {
      setMessage(null);
      setError(getErrorMessage(err, 'No se pudo previsualizar'));
    },
  });

  const anonymizeMutation = useMutation({
    mutationFn: () => {
      if (!confirmIrreversible) {
        throw new Error('Confirma la acción irreversible');
      }
      return executeDataSubject({
        kind: 'anonymize',
        customerPhone,
        currentPassword: password,
        confirmIrreversible: true,
      });
    },
    onSuccess: async () => {
      setError(null);
      setMessage('Cliente anonimizado (pedidos conservados sin PII).');
      await queryClient.invalidateQueries({ queryKey: ['privacy-runs'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(getErrorMessage(err, 'No se pudo anonimizar'));
    },
  });

  if (!isOwner) {
    return (
      <section className="space-y-4">
        <PageHeader
          eyebrow="Privacidad"
          title="Retención y datos"
          description="Solo la propietaria puede gestionar retención y solicitudes."
        />
        <ErrorMessage message="Se requiere capacidad security:manage (rol owner)." />
      </section>
    );
  }

  if (
    inventoryQuery.isLoading ||
    policiesQuery.isLoading ||
    runsQuery.isLoading
  ) {
    return <LoadingState label="Cargando privacidad…" />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Privacidad"
        title="Privacidad de clientes"
        description="Consulta qué datos gestiona KAIRO y revisa las herramientas de privacidad disponibles."
      />

      <p className="rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
        KAIRO no elimina datos automáticamente. Los plazos de conservación deben
        definirse con asesoría legal antes de activar una política; las acciones
        de exportación y anonimización requieren reautenticación.
      </p>

      {error !== null ? <ErrorMessage message={error} /> : null}
      {message !== null ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Confirmación</CardTitle>
          <CardDescription>
            Contraseña reciente obligatoria para simular, activar o anonimizar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            Contraseña actual
            <input
              type="password"
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmIrreversible}
              onChange={(event) => setConfirmIrreversible(event.target.checked)}
            />
            Confirmo acción irreversible (activar / anonimizar)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos que gestiona KAIRO</CardTitle>
          <CardDescription>
            Revisa las categorías de información y las acciones disponibles.
            Plazos legales:{' '}
            {legalStatusLabel(inventoryQuery.data?.legalDurationsStatus)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm">
            {(inventoryQuery.data?.items ?? []).map((item) => (
              <li key={item.dataClass} className="border-b pb-2">
                <div className="font-medium">
                  {dataClassLabel(item.dataClass)}
                </div>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    Detalles técnicos
                  </summary>
                  <div className="mt-2 space-y-1">
                    <p>Almacenamiento interno: {item.tables.join(', ')}</p>
                    <p>Acciones admitidas: {item.allowedActions.join(', ')}</p>
                    <p>{item.relationshipStrategy}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versiones de política</CardTitle>
          <CardDescription>
            Las políticas quedan en borrador hasta contar con revisión legal y
            activarlas con reautenticación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm">
            {(policiesQuery.data ?? []).map((policy) => (
              <li key={policy.id}>
                Política v{policy.version} · {operationalLabel(policy.status)}
                {policy.activatedAt !== null
                  ? ` · activada ${policy.activatedAt}`
                  : ''}
              </li>
            ))}
            {(policiesQuery.data ?? []).length === 0 ? (
              <li className="text-muted-foreground">
                Aún no hay una política preparada. Primero debe acordarse y
                documentarse el plazo de conservación con asesoría legal.
              </li>
            ) : null}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => dryRunMutation.mutate()}
              disabled={password.length === 0 || dryRunMutation.isPending}
            >
              Simular (dry-run)
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => activateMutation.mutate()}
              disabled={password.length === 0 || activateMutation.isPending}
            >
              Activar borrador aprobado
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ejecuciones y reportes</CardTitle>
          <CardDescription>
            Revisa simulaciones y el estado de las solicitudes realizadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(runsQuery.data ?? []).map((run) => (
              <li key={run.id}>
                {modeLabel(run.mode)} · {operationalLabel(run.status)} ·
                política v{run.policyVersion}
                {run.report !== null
                  ? ` · firma ${run.report.signature.slice(0, 12)}…`
                  : ''}
                {run.errorMessage !== null
                  ? ' · requiere revisión del equipo'
                  : ''}
              </li>
            ))}
            {(runsQuery.data ?? []).length === 0 ? (
              <li className="text-muted-foreground">Sin ejecuciones.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Solicitud de titular</CardTitle>
          <CardDescription>
            Exportación o anonimización controlada; sin registros ajenos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            Teléfono del cliente (solo consulta; no se muestra en auditoría)
            <input
              type="text"
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => previewMutation.mutate()}
              disabled={
                password.length === 0 ||
                customerPhone.length < 7 ||
                previewMutation.isPending
              }
            >
              Vista previa
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => anonymizeMutation.mutate()}
              disabled={
                password.length === 0 ||
                customerPhone.length < 7 ||
                anonymizeMutation.isPending
              }
            >
              Anonimizar
            </Button>
          </div>
          {previewJson !== null ? (
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {previewJson}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function legalStatusLabel(status: string | undefined): string {
  if (status === 'approved') return 'revisados';
  if (status === 'pending' || status === 'missing')
    return 'pendientes de definir';
  return 'por revisar';
}

function dataClassLabel(value: string): string {
  const labels: Record<string, string> = {
    sales_orders_customer_pii: 'Pedidos y comprobantes',
    whatsapp_conversations_pii: 'Conversaciones con clientes',
    whatsapp_messages_pii: 'Mensajes de clientes',
    customers_pii: 'Datos de contacto',
    customer_contact: 'Datos de contacto',
    customer_destinations: 'Direcciones de entrega',
    conversations: 'Conversaciones',
    orders: 'Pedidos y comprobantes',
    guides: 'Guías de envío',
    audit_events: 'Registro de actividad',
  };
  return labels[value] ?? 'Otra información operativa';
}

function modeLabel(value: string): string {
  if (value === 'dry_run') return 'Simulación';
  if (value === 'execute') return 'Ejecución';
  return 'Solicitud';
}

function operationalLabel(value: string): string {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    active: 'Activa',
    completed: 'Completada',
    failed: 'Requiere revisión',
    running: 'En curso',
    paused: 'Pausada',
  };
  return labels[value] ?? 'Estado actualizado';
}
