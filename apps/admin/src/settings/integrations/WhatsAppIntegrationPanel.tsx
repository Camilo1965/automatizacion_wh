import type { FormEvent } from 'react';

import { OperationalOutcome } from '@/components/OperationalOutcome';
import { Button } from '@/components/Button';
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

const checkboxClassName = 'size-4 rounded border border-input accent-primary';

type WhatsAppSettings = {
  configured: boolean;
  phoneNumberId: string | null;
  serviceHours?: {
    days: number[];
    start: string;
    end: string;
  } | null | undefined;
  graphApiVersion?: string | null | undefined;
  wabaId?: string | null | undefined;
  ownerAlertPhone?: string | null | undefined;
  ownerAlertTemplate?: string | null | undefined;
};

type SettingsSave = {
  isPending: boolean;
  mutate: (body: {
    whatsapp?: Record<string, unknown>;
    shipping?: Record<string, unknown>;
  }) => void;
};

export function WhatsAppIntegrationPanel({
  settings,
  save,
  tested,
  active,
}: {
  settings: WhatsAppSettings;
  save: SettingsSave;
  tested: boolean;
  active: boolean;
}) {
  const currentStep = !settings.configured
    ? 1
    : !tested
      ? 2
      : !active
        ? 3
        : 4;

  return (
    <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const phoneNumberId = String(fields.get('phoneNumberId') ?? '').trim();
          const accessToken = String(fields.get('accessToken') ?? '').trim();
          const graphApiVersion = String(
            fields.get('graphApiVersion') ?? '',
          ).trim();
          const appSecret = String(fields.get('appSecret') ?? '').trim();
          const webhookVerifyToken = String(
            fields.get('webhookVerifyToken') ?? '',
          ).trim();
          if (
            phoneNumberId === '' &&
            accessToken === '' &&
            graphApiVersion === '' &&
            appSecret === '' &&
            webhookVerifyToken === ''
          )
            return;
          save.mutate({
            whatsapp: {
              timezone: 'America/Bogota',
              serviceHours:
                fields.get('hoursEnabled') === 'on'
                  ? {
                      days: fields.getAll('hoursDays').map(Number),
                      start: String(fields.get('hoursStart')),
                      end: String(fields.get('hoursEnd')),
                    }
                  : null,
              ...(String(fields.get('wabaId') ?? '').trim()
                ? { wabaId: String(fields.get('wabaId')).trim() }
                : {}),
              ...(String(fields.get('ownerAlertPhone') ?? '').trim()
                ? {
                    ownerAlertPhone: String(
                      fields.get('ownerAlertPhone'),
                    ).trim(),
                  }
                : {}),
              ...(String(fields.get('ownerAlertTemplate') ?? '').trim()
                ? {
                    ownerAlertTemplate: String(
                      fields.get('ownerAlertTemplate'),
                    ).trim(),
                  }
                : {}),
              ...(phoneNumberId === '' ? {} : { phoneNumberId }),
              ...(accessToken === '' ? {} : { accessToken }),
              ...(graphApiVersion === '' ? {} : { graphApiVersion }),
              ...(appSecret === '' ? {} : { appSecret }),
              ...(webhookVerifyToken === '' ? {} : { webhookVerifyToken }),
            },
          });
        }}
      >
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="text-lg">
              <h3 className="text-lg font-semibold tracking-tight">
                WhatsApp Cloud API
              </h3>
            </CardTitle>
            <CardDescription>
              {settings.configured
                ? `Número configurado en el editor: ${settings.phoneNumberId}`
                : 'Aún no hay credenciales guardadas.'}
            </CardDescription>
          </div>
          <ProviderLifecycleSteps currentStep={currentStep} />
          <OperationalOutcome
            outcome={
              settings.configured
                ? 'Credenciales en borrador. Las pruebas no envían mensajes.'
                : 'Faltan credenciales para este canal.'
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
            <Label htmlFor="phoneNumberId">ID del número</Label>
            <Input
              id="phoneNumberId"
              name="phoneNumberId"
              defaultValue={settings.phoneNumberId ?? ''}
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accessToken">Nuevo token de acceso</Label>
            <Input
              id="accessToken"
              name="accessToken"
              type="password"
              autoComplete="new-password"
              placeholder="Se conserva si lo dejas vacío"
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wabaId">Cuenta de WhatsApp Business (WABA ID)</Label>
            <Input
              id="wabaId"
              name="wabaId"
              inputMode="numeric"
              defaultValue={settings.wabaId ?? ''}
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ownerAlertPhone">
              WhatsApp de la propietaria para alertas
            </Label>
            <Input
              id="ownerAlertPhone"
              name="ownerAlertPhone"
              type="tel"
              placeholder="+573001234567"
              defaultValue={settings.ownerAlertPhone ?? ''}
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ownerAlertTemplate">
              Plantilla aprobada para alertas
            </Label>
            <Input
              id="ownerAlertTemplate"
              name="ownerAlertTemplate"
              defaultValue={settings.ownerAlertTemplate ?? ''}
              placeholder="alerta_operativa"
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            La plantilla debe estar aprobada por Meta, en español (es_CO), con
            una variable de texto en el cuerpo. Sin plantilla se conservan las
            alertas en el panel.
          </p>
          <div className="space-y-2">
            <Label htmlFor="graphApiVersion">Versión de Graph API</Label>
            <Input
              id="graphApiVersion"
              name="graphApiVersion"
              defaultValue={settings.graphApiVersion ?? 'v26.0'}
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <fieldset className="space-y-3 rounded-[1.125rem] border border-border p-4">
            <legend className="px-1 text-sm font-medium text-foreground">
              Horario de atención de la propietaria
            </legend>
            <p className="text-sm text-muted-foreground">
              El bot vende las 24 horas. Al solicitar atención humana fuera de
              este horario, informa cuándo responderás. Zona: Colombia.
            </p>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="hoursEnabled"
                className={checkboxClassName}
                defaultChecked={settings.serviceHours != null}
              />
              Informar un horario de atención
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                'Domingo',
                'Lunes',
                'Martes',
                'Miércoles',
                'Jueves',
                'Viernes',
                'Sábado',
              ].map((day, index) => (
                <label
                  key={day}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    name="hoursDays"
                    value={index}
                    className={checkboxClassName}
                    defaultChecked={
                      settings.serviceHours?.days.includes(index) ??
                      (index > 0 && index < 6)
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hoursStart">Hora de inicio</Label>
                <Input
                  id="hoursStart"
                  name="hoursStart"
                  type="time"
                  defaultValue={settings.serviceHours?.start ?? '09:00'}
                  className="h-11 rounded-[1.125rem] bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hoursEnd">Hora de cierre</Label>
                <Input
                  id="hoursEnd"
                  name="hoursEnd"
                  type="time"
                  defaultValue={settings.serviceHours?.end ?? '18:00'}
                  className="h-11 rounded-[1.125rem] bg-muted"
                />
              </div>
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="appSecret">App secret de Meta</Label>
            <Input
              id="appSecret"
              name="appSecret"
              type="password"
              autoComplete="new-password"
              placeholder="Se conserva si lo dejas vacío"
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhookVerifyToken">
              Token de verificación del webhook
            </Label>
            <Input
              id="webhookVerifyToken"
              name="webhookVerifyToken"
              type="password"
              autoComplete="new-password"
              placeholder="Se conserva si lo dejas vacío"
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <Button type="submit" disabled={save.isPending} loading={save.isPending}>
            Guardar conexión
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
