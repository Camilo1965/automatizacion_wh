import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ConfigurationAuditResponseSchema } from '@camila/contracts';

import { apiRequest } from '../api/client';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/LoadingState';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const ACTION_LABELS: Record<string, string> = {
  'login.succeeded': 'Inicio de sesión',
  'login.failed': 'Inicio de sesión fallido',
  'mfa.verify_succeeded': 'MFA verificado',
  'mfa.verify_failed': 'MFA fallido',
  'mfa.enabled': 'MFA activado',
  'mfa.disabled': 'MFA desactivado',
  'session.revoked': 'Sesión revocada',
  'session.revoked_others': 'Otras sesiones revocadas',
  'role.changed': 'Rol actualizado',
  'user.created': 'Usuario creado',
  'user.deactivated': 'Usuario desactivado',
  'integration.activated': 'Integración activada',
  'integration.updated': 'Integración actualizada',
  'bot_flow.published': 'Flujo del bot publicado',
  'locality_catalog.published': 'Catálogo de municipios publicado',
  'shipping_policy.updated': 'Política de envío actualizada',
  'inventory.adjusted': 'Ajuste de inventario',
  'inventory.closure_generated': 'Cierre de inventario generado',
  'inventory.closure_acknowledged': 'Cierre de inventario confirmado',
  'order.transitioned': 'Pedido actualizado',
  'data.exported': 'Exportación',
  'retention.executed': 'Retención ejecutada',
  'retention.simulated': 'Retención simulada',
};

export function ConfigurationAuditPage() {
  const [actionFilter, setActionFilter] = useState('');
  const [resultFilter, setResultFilter] = useState<
    '' | 'success' | 'failure'
  >('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (actionFilter.trim()) params.set('action', actionFilter.trim());
    if (resultFilter) params.set('result', resultFilter);
    return params.toString();
  }, [actionFilter, resultFilter, offset]);

  const query = useQuery({
    queryKey: ['unified-audit', queryString],
    queryFn: () =>
      apiRequest(`/audit?${queryString}`, {
        schema: ConfigurationAuditResponseSchema,
      }),
  });

  const items = query.data?.data.items ?? [];
  const total = query.data?.data.total ?? 0;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Historial de auditoría"
        description="Registro unificado de seguridad y operaciones. Contraseñas, tokens y secretos nunca aparecen aquí. La IP en bruto no se almacena."
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Acción</span>
          <Input
            value={actionFilter}
            onChange={(event) => {
              setOffset(0);
              setActionFilter(event.target.value);
            }}
            placeholder="ej. login.failed"
            className="w-56"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Resultado</span>
          <select
            className="flex h-10 w-40 rounded-md border border-input bg-background px-3 text-sm"
            value={resultFilter}
            onChange={(event) => {
              setOffset(0);
              setResultFilter(event.target.value as '' | 'success' | 'failure');
            }}
          >
            <option value="">Todos</option>
            <option value="success">Éxito</option>
            <option value="failure">Fallo</option>
          </select>
        </label>
      </div>
      {query.isPending ? (
        <LoadingState label="Cargando historial…" />
      ) : query.isError ? (
        <ErrorMessage message="No se pudo cargar el historial." />
      ) : (
        <div className="space-y-3">
          {items.length ? (
            items.map((item) => (
              <Card
                key={item.id}
                className="rounded-3xl border-border shadow-[var(--shadow-card)]"
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {ACTION_LABELS[item.action] ?? item.action}
                    </CardTitle>
                    <CardDescription>
                      {item.actorUsername ?? 'sistema'} ·{' '}
                      {new Date(item.createdAt).toLocaleString('es-CO', {
                        timeZone: 'America/Bogota',
                      })}
                      {item.targetType
                        ? ` · ${item.targetType}${item.targetId ? ` ${item.targetId}` : ''}`
                        : ''}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      item.result === 'success' ? 'outline' : 'destructive'
                    }
                    className="rounded-[1.125rem] text-xs"
                  >
                    {item.result === 'success' ? 'Éxito' : 'Fallo'}
                  </Badge>
                </CardHeader>
              </Card>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay eventos registrados todavía.
            </p>
          )}
          {total > limit ? (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {offset + 1}–{Math.min(offset + limit, total)} de {total}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
