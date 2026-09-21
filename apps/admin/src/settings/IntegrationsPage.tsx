import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { LocalityPublic } from '@camila/contracts';

import {
  getIntegrationHealth,
  getIntegrationSettings,
  updateIntegrationSettings,
} from '../api/operations-api';
import { ErrorMessage } from '@/components/ErrorMessage';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { LocalityPicker } from '@/components/LocalityPicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { IntegrationLifecycle } from './IntegrationLifecycle';

const labels = {
  database: 'Base de datos',
  mediaStorage: 'Archivos y fotografías',
  whatsapp: 'WhatsApp',
  shipping: '99envíos',
  scheduler: 'Scheduler',
} as const;

const selectClassName =
  'h-11 w-full rounded-[1.125rem] border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const checkboxClassName =
  'size-4 rounded border border-input accent-primary';

export function IntegrationsPage() {
  const [origin, setOrigin] = useState<LocalityPublic | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['integration-health'],
    queryFn: getIntegrationHealth,
    refetchInterval: 60_000,
  });
  const settings = useQuery({
    queryKey: ['integration-settings'],
    queryFn: getIntegrationSettings,
    retry: false,
  });
  const save = useMutation({
    mutationFn: updateIntegrationSettings,
    onSuccess: () => {
      document
        .querySelectorAll<HTMLInputElement>('form input[type="password"]')
        .forEach((input) => {
          input.value = '';
        });
      void queryClient.invalidateQueries({
        queryKey: ['integration-lifecycle'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['integration-settings'],
      });
      void queryClient.invalidateQueries({ queryKey: ['integration-health'] });
    },
  });
  if (query.isPending)
    return <LoadingState label="Comprobando integraciones…" />;
  if (query.isError)
    return (
      <ErrorMessage message="No se pudo comprobar el estado de las integraciones" />
    );
  return (
    <section className="space-y-6">
      <PageHeader
        title="Integraciones"
        description="Comprobaciones seguras que no envían mensajes ni crean guías."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(query.data).map(([key, check]) => (
          <Card
            className="rounded-3xl border-border shadow-[var(--shadow-card)]"
            key={key}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <h3 className="font-heading text-base leading-snug font-medium text-foreground">
                {labels[key as keyof typeof labels]}
              </h3>
              <StatusBadge
                tone={
                  check.status === 'up'
                    ? 'success'
                    : check.status === 'down'
                      ? 'danger'
                      : 'warning'
                }
              >
                {check.status === 'up'
                  ? 'Activo'
                  : check.status === 'down'
                    ? 'Incidencia'
                    : 'Sin verificar'}
              </StatusBadge>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {check.status === 'up'
                  ? `Último éxito: ${new Date(check.checkedAt).toLocaleString('es-CO')}`
                  : check.status === 'down'
                    ? `Último fallo: ${new Date(check.checkedAt).toLocaleString('es-CO')}`
                    : `Última revisión: ${new Date(check.checkedAt).toLocaleString('es-CO')}`}
              </p>
              {check.detail ? (
                <p className="text-sm text-muted-foreground">{check.detail}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Guardar credenciales solo marca Configurado. Probar marca
                Verificado. Activar pone el canal en operación.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {settings.isSuccess ? (
        <Tabs defaultValue="whatsapp" className="gap-4">
          <TabsList className="h-auto rounded-[1.125rem] p-1">
            <TabsTrigger
              value="whatsapp"
              className="rounded-[0.875rem] px-3 py-2"
            >
              WhatsApp Cloud API
            </TabsTrigger>
            <TabsTrigger
              value="shipping"
              className="rounded-[0.875rem] px-3 py-2"
            >
              99envíos
            </TabsTrigger>
          </TabsList>
          <TabsContent value="whatsapp">
            <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  const phoneNumberId = String(
                    fields.get('phoneNumberId') ?? '',
                  ).trim();
                  const accessToken = String(
                    fields.get('accessToken') ?? '',
                  ).trim();
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
                      ...(webhookVerifyToken === ''
                        ? {}
                        : { webhookVerifyToken }),
                    },
                  });
                }}
              >
                <CardHeader>
                  <CardTitle className="text-lg">WhatsApp Cloud API</CardTitle>
                  <CardDescription>
                    {settings.data.whatsapp.configured
                      ? `Número configurado en el editor: ${settings.data.whatsapp.phoneNumberId}`
                      : 'Aún no hay credenciales guardadas.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumberId">ID del número</Label>
                    <Input
                      id="phoneNumberId"
                      name="phoneNumberId"
                      defaultValue={settings.data.whatsapp.phoneNumberId ?? ''}
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
                    <Label htmlFor="wabaId">
                      Cuenta de WhatsApp Business (WABA ID)
                    </Label>
                    <Input
                      id="wabaId"
                      name="wabaId"
                      inputMode="numeric"
                      defaultValue={settings.data.whatsapp.wabaId ?? ''}
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
                      defaultValue={
                        settings.data.whatsapp.ownerAlertPhone ?? ''
                      }
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
                      defaultValue={
                        settings.data.whatsapp.ownerAlertTemplate ?? ''
                      }
                      placeholder="alerta_operativa"
                      className="h-11 rounded-[1.125rem] bg-muted"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    La plantilla debe estar aprobada por Meta, en español
                    (es_CO), con una variable de texto en el cuerpo. Sin
                    plantilla se conservan las alertas en el panel.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="graphApiVersion">
                      Versión de Graph API
                    </Label>
                    <Input
                      id="graphApiVersion"
                      name="graphApiVersion"
                      defaultValue={
                        settings.data.whatsapp.graphApiVersion ?? 'v26.0'
                      }
                      className="h-11 rounded-[1.125rem] bg-muted"
                    />
                  </div>
                  <fieldset className="space-y-3 rounded-[1.125rem] border border-border p-4">
                    <legend className="px-1 text-sm font-medium text-foreground">
                      Horario de atención de la propietaria
                    </legend>
                    <p className="text-sm text-muted-foreground">
                      El bot vende las 24 horas. Al solicitar atención humana
                      fuera de este horario, informa cuándo responderás. Zona:
                      Colombia.
                    </p>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        name="hoursEnabled"
                        className={checkboxClassName}
                        defaultChecked={
                          settings.data.whatsapp.serviceHours != null
                        }
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
                              settings.data.whatsapp.serviceHours?.days.includes(
                                index,
                              ) ??
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
                          defaultValue={
                            settings.data.whatsapp.serviceHours?.start ??
                            '09:00'
                          }
                          className="h-11 rounded-[1.125rem] bg-muted"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hoursEnd">Hora de cierre</Label>
                        <Input
                          id="hoursEnd"
                          name="hoursEnd"
                          type="time"
                          defaultValue={
                            settings.data.whatsapp.serviceHours?.end ?? '18:00'
                          }
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
          </TabsContent>
          <TabsContent value="shipping">
            <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  const accountEmail = String(
                    fields.get('accountEmail') ?? '',
                  ).trim();
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
                      ...(origin
                        ? { originLocalityCode: origin.carrierCode }
                        : {}),
                      ...(String(fields.get('branchCode') ?? '').trim()
                        ? {
                            branchCode: String(fields.get('branchCode')).trim(),
                          }
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
                <CardHeader>
                  <CardTitle className="text-lg">99envíos</CardTitle>
                  <CardDescription>
                    {settings.data.shipping.configured
                      ? `Cuenta configurada en el editor: ${settings.data.shipping.accountEmail}`
                      : 'Aún no hay credenciales guardadas.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">
                      Municipio de origen para cotizaciones
                    </h3>
                    <LocalityPicker value={origin} onChange={setOrigin} />
                    <p className="text-sm text-muted-foreground">
                      Opcional. Si no cambias el origen, se conserva la
                      configuración activa o el origen de tu cuenta en 99envíos.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="branchCode">Sucursal de 99envíos</Label>
                    <Input
                      id="branchCode"
                      name="branchCode"
                      inputMode="numeric"
                      pattern="[0-9]+"
                      defaultValue={settings.data.shipping.branchCode ?? ''}
                      className="h-11 rounded-[1.125rem] bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pdfType">Formato de guía</Label>
                    <select
                      id="pdfType"
                      name="pdfType"
                      className={selectClassName}
                      defaultValue={settings.data.shipping.pdfType ?? 2}
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
                      defaultValue={settings.data.shipping.accountEmail ?? ''}
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
                    <Label htmlFor="integrationId">
                      ID de integración (opcional)
                    </Label>
                    <Input
                      id="integrationId"
                      name="integrationId"
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
          </TabsContent>
        </Tabs>
      ) : null}
      {settings.isError ? (
        <p className="rounded-[1.125rem] border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
          La edición de credenciales se activa al configurar
          INTEGRATION_ENCRYPTION_KEY en el servidor.
        </p>
      ) : null}
      {save.isError ? (
        <ErrorMessage message="No fue posible guardar la conexión" />
      ) : null}
      {save.isSuccess ? (
        <p role="status" className="text-sm text-foreground">
          Borrador guardado. Prueba y activa la conexión para utilizarla.
        </p>
      ) : null}
      <IntegrationLifecycle />
    </section>
  );
}
