import type { FormEvent } from 'react';
import type {
  LocalityPublic,
  ShippingPolicy,
  ShippingRulePublic,
} from '@camila/contracts';

import { OperationalOutcome } from '@/components/OperationalOutcome';
import { ErrorMessage } from '@/components/ErrorMessage';
import { LocalityPicker } from '@/components/LocalityPicker';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PolicyFields } from './PolicyFields';
import { describePolicy } from './policy-utils';

export function LocalityExceptions({
  municipalPolicy,
  carriers,
  selectedLocality,
  localityCarrierCode,
  rules,
  pending,
  invalidBlockedRule,
  error,
  saved,
  preview,
  onMunicipalChange,
  onLocalityChange,
  onSave,
  onSimulate,
  onEditRule,
  onDeactivate,
}: {
  municipalPolicy: ShippingPolicy;
  carriers: readonly string[];
  selectedLocality: LocalityPublic | null;
  localityCarrierCode: string;
  rules: readonly ShippingRulePublic[];
  pending: boolean;
  invalidBlockedRule: boolean;
  error: string | null;
  saved: string | null;
  preview: {
    source: 'global' | 'municipality';
    policy: ShippingPolicy;
  } | null;
  onMunicipalChange: (policy: ShippingPolicy) => void;
  onLocalityChange: (locality: LocalityPublic | null) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSimulate: () => void;
  onEditRule: (rule: ShippingRulePublic) => void;
  onDeactivate: (rule: ShippingRulePublic) => void;
}) {
  return (
    <section aria-label="Excepciones por localidad" className="space-y-4">
      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <form onSubmit={onSave}>
          <CardHeader>
            <p className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
              Excepción por municipio
            </p>
            <CardTitle className="text-lg">
              <h2 className="text-lg font-semibold tracking-tight">
                Nueva regla municipal
              </h2>
            </CardTitle>
            <CardDescription>{describePolicy(municipalPolicy)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LocalityPicker
              value={selectedLocality}
              onChange={onLocalityChange}
            />
            <details className="rounded-[1.125rem] border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Editar excepción municipal
              </summary>
              <div className="mt-4">
                <PolicyFields
                  prefix="municipal"
                  policy={municipalPolicy}
                  carriers={carriers}
                  onChange={onMunicipalChange}
                />
              </div>
            </details>
            {invalidBlockedRule ? (
              <ErrorMessage message="Elige una transportadora antes de bloquear el fallback." />
            ) : null}
            {error ? (
              <OperationalOutcome
                tone="danger"
                outcome={error}
                nextStep="corrige la regla municipal y vuelve a guardar."
              />
            ) : null}
            {saved ? (
              <OperationalOutcome
                tone="success"
                outcome={saved}
                nextStep="simula la regla efectiva o cotiza en el simulador."
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  pending || invalidBlockedRule || selectedLocality === null
                }
                loading={pending}
                type="submit"
              >
                Guardar regla
              </Button>
              <Button
                variant="secondary"
                disabled={!/^\d{8}$/.test(localityCarrierCode)}
                type="button"
                onClick={onSimulate}
              >
                Simular regla efectiva
              </Button>
            </div>
            {preview ? (
              <aside
                className="space-y-2 rounded-[1.125rem] border border-border bg-muted/40 p-4"
                aria-label="Resultado de simulación"
              >
                <strong className="text-sm font-medium text-foreground">
                  Origen:{' '}
                  {preview.source === 'municipality'
                    ? 'regla municipal'
                    : 'regla general'}
                </strong>
                <p className="text-sm text-foreground">
                  {describePolicy(preview.policy)}
                </p>
                <small className="text-xs text-muted-foreground">
                  Esta simulación no crea cotizaciones ni guías.
                </small>
              </aside>
            ) : null}
          </CardContent>
        </form>
      </Card>

      <Card
        className="rounded-3xl border-border shadow-[var(--shadow-card)]"
        aria-labelledby="active-rules-title"
      >
        <CardHeader>
          <CardTitle id="active-rules-title" className="text-lg">
            Reglas guardadas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay excepciones municipales.
            </p>
          ) : (
            rules.map((rule) => (
              <article
                key={rule.localityCarrierCode}
                className="space-y-3 rounded-[1.125rem] border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <strong className="text-sm font-medium text-foreground">
                      {rule.locality}, {rule.department}
                    </strong>
                    <p className="text-sm text-muted-foreground">
                      {describePolicy(rule)}
                    </p>
                  </div>
                  <StatusBadge tone={rule.active ? 'success' : 'neutral'}>
                    {rule.active ? 'Activa' : 'Inactiva'}
                  </StatusBadge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onEditRule(rule)}
                  >
                    Editar regla de {rule.locality}
                  </Button>
                  {rule.active ? (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={pending}
                      onClick={() => onDeactivate(rule)}
                    >
                      Desactivar regla
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
