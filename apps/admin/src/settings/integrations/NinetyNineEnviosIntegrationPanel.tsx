import type { FormEvent } from 'react';
import type { LocalityPublic } from '@camila/contracts';

import { OperationalOutcome } from '@/components/OperationalOutcome';
import { Button } from '@/components/Button';
import { LocalityPicker } from '@/components/LocalityPicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ProviderLifecycleSteps } from './ProviderLifecycleSteps';
import { providerLifecycleNextStep } from './integration-diagnostics';

const selectClassName =
  'h-11 w-full rounded-[1.125rem] border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

type ShippingSettings = {
  configured: boolean;
  accountEmail: string | null;
  branchCode?: string | null | undefined;
  pdfType?: 1 | 2 | undefined;
};

type SettingsSave = {
  isPending: boolean;
  mutate: (body: {
    whatsapp?: Record<string, unknown>;
    shipping?: Record<string, unknown>;
  }) => void;
};

export function NinetyNineEnviosIntegrationPanel({
  settings,
  origin,
  onOriginChange,
  save,
  tested,
  active,
}: {
  settings: ShippingSettings;
  origin: LocalityPublic | null;
  onOriginChange: (value: LocalityPublic | null) => void;
  save: SettingsSave;
  tested: boolean;
  active: boolean;
}) {
  const currentStep = !settings.configured ? 1 : !tested ? 2 : !active ? 3 : 4;

  return (
    <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const accountEmail = String(fields.get('accountEmail') ?? '').trim();
          const password = String(fields.get('password') ?? '').trim();
          const integrationToken = String(
            fields.get('integrationToken') ?? '',
          ).trim();
          const integrationId = String(
            fields.get('integrationId') ?? '',
          ).trim();
          if (
            accountEmail === '' &&
            password === '' &&
            integrationToken === '' &&
            integrationId === ''
          )
            return;
          save.mutate({
            shipping: {
              ...(origin ? { originLocalityCode: origin.carrierCode } : {}),
              ...(String(fields.get('branchCode') ?? '').trim()
                ? { branchCode: String(fields.get('branchCode')).trim() }
                : {}),
              pdfType: Number(fields.get('pdfType') ?? 2),
              ...(accountEmail === '' ? {} : { accountEmail }),
              ...(password === '' ? {} : { password }),
              ...(integrationToken === '' ? {} : { integrationToken }),
              ...(integrationId === '' ? {} : { integrationId }),
            },
          });
        }}
      >
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="text-lg">
              <h3 className="text-lg font-semibold tracking-tight">99envíos</h3>
            </CardTitle>
            <CardDescription>
              {settings.configured
                ? `Cuenta configurada en el editor: ${settings.accountEmail}`
                : 'Aún no hay credenciales guardadas.'}
            </CardDescription>
          </div>
          <ProviderLifecycleSteps currentStep={currentStep} />
          <OperationalOutcome
            outcome={
              settings.configured
                ? 'Credenciales en borrador. Las pruebas no crean guías.'
                : 'Faltan credenciales para cotizar y generar guías.'
            }
            nextStep={providerLifecycleNextStep({
              configured: settings.configured,
              tested,
              active,
            })}
            tone={settings.configured ? 'info' : 'warning'}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">
              Municipio de origen para cotizaciones
            </h4>
            <LocalityPicker value={origin} onChange={onOriginChange} />
            <p className="text-sm text-muted-foreground">
              Opcional. Si no cambias el origen, se conserva la configuración
              activa o el origen de tu cuenta en 99envíos.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branchCode">Sucursal de 99envíos</Label>
            <Input
              id="branchCode"
              name="branchCode"
              inputMode="numeric"
              pattern="[0-9]+"
              defaultValue={settings.branchCode ?? ''}
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pdfType">Formato de guía</Label>
            <select
              id="pdfType"
              name="pdfType"
              className={selectClassName}
              defaultValue={settings.pdfType ?? 2}
            >
              <option value={2}>Normal</option>
              <option value={1}>Etiqueta adhesiva</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountEmail">Correo de cuenta</Label>
            <Input
              id="accountEmail"
              name="accountEmail"
              type="email"
              defaultValue={settings.accountEmail ?? ''}
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Nueva contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Se conserva si la dejas vacía"
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="integrationToken">
              Token de integración (opcional)
            </Label>
            <Input
              id="integrationToken"
              name="integrationToken"
              type="password"
              autoComplete="new-password"
              placeholder="Se conserva si lo dejas vacío"
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="integrationId">ID de integración (opcional)</Label>
            <Input
              id="integrationId"
              name="integrationId"
              type="password"
              autoComplete="new-password"
              placeholder="Se conserva si lo dejas vacío"
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <Button
            type="submit"
            disabled={save.isPending}
            loading={save.isPending}
          >
            Guardar conexión
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
