import type { FormEvent } from 'react';
import type { ShippingPolicy } from '@camila/contracts';

import { OperationalOutcome } from '@/components/OperationalOutcome';
import { Button } from '@/components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PolicyFields } from './PolicyFields';
import { describePolicy } from './policy-utils';

export function GeneralShippingPolicy({
  policy,
  carriers,
  pending,
  onChange,
  onSave,
  saved,
  error,
}: {
  policy: ShippingPolicy;
  carriers: readonly string[];
  pending: boolean;
  onChange: (policy: ShippingPolicy) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  saved: string | null;
  error: string | null;
}) {
  return (
    <section aria-label="Política general" className="space-y-3">
      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <form onSubmit={onSave}>
          <CardHeader>
            <p className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
              Regla general
            </p>
            <CardTitle className="text-lg">
              Municipios sin una regla propia
            </CardTitle>
            <CardDescription>{describePolicy(policy)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <details className="rounded-[1.125rem] border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Editar transportadora, seguro y paquete
              </summary>
              <div className="mt-4">
                <PolicyFields
                  prefix="global"
                  policy={policy}
                  carriers={carriers}
                  onChange={onChange}
                />
              </div>
            </details>
            <Button
              variant="secondary"
              disabled={pending}
              loading={pending}
              type="submit"
            >
              Guardar preferencia general
            </Button>
            {error ? (
              <OperationalOutcome
                tone="danger"
                outcome={error}
                nextStep="corrige la preferencia y vuelve a guardar."
              />
            ) : null}
            {saved ? (
              <OperationalOutcome
                tone="success"
                outcome={saved}
                nextStep="revisa excepciones por localidad o prueba el simulador."
              />
            ) : null}
          </CardContent>
        </form>
      </Card>
    </section>
  );
}
