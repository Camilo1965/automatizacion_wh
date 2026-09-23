import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { LocalityPublic } from '@camila/contracts';

import { IntegrationLifecycleResponseSchema } from '@camila/contracts';

import { apiRequest } from '../api/client';
import {
  getIntegrationHealth,
  getIntegrationSettings,
  updateIntegrationSettings,
} from '../api/operations-api';
import { ErrorMessage } from '@/components/ErrorMessage';
import { LoadingState } from '@/components/LoadingState';
import { OperationalOutcome } from '@/components/OperationalOutcome';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IntegrationLifecyclePanel } from './integrations/IntegrationLifecyclePanel';
import { IntegrationOverview } from './integrations/IntegrationOverview';
import { NinetyNineEnviosIntegrationPanel } from './integrations/NinetyNineEnviosIntegrationPanel';
import { WhatsAppIntegrationPanel } from './integrations/WhatsAppIntegrationPanel';

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
  const lifecycle = useQuery({
    queryKey: ['integration-lifecycle'],
    queryFn: () =>
      apiRequest('/integrations/lifecycle', {
        schema: IntegrationLifecycleResponseSchema,
      }),
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
      <section className="space-y-4">
        <ErrorMessage message="No se pudo comprobar el estado de las integraciones" />
        <OperationalOutcome
          tone="danger"
          outcome="La comprobación de salud falló de forma recuperable."
          nextStep="reintenta desde esta página o revisa la API y el worker."
        />
      </section>
    );

  const drafts = lifecycle.data?.data.drafts ?? [];
  const versions = lifecycle.data?.data.versions ?? [];
  const whatsappDraft = drafts.find((draft) => draft.provider === 'whatsapp');
  const shippingDraft = drafts.find((draft) => draft.provider === 'shipping');
  const whatsappActive = versions.some(
    (version) => version.provider === 'whatsapp' && version.status === 'active',
  );
  const shippingActive = versions.some(
    (version) => version.provider === 'shipping' && version.status === 'active',
  );

  return (
    <section className="space-y-6">
      <PageHeader
        title="Integraciones"
        description="Comprobaciones seguras que no envían mensajes ni crean guías."
      />
      <IntegrationOverview health={query.data} />
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
            <WhatsAppIntegrationPanel
              settings={settings.data.whatsapp}
              save={save}
              tested={whatsappDraft?.tested ?? false}
              active={whatsappActive}
            />
          </TabsContent>
          <TabsContent value="shipping">
            <NinetyNineEnviosIntegrationPanel
              settings={settings.data.shipping}
              origin={origin}
              onOriginChange={setOrigin}
              save={save}
              tested={shippingDraft?.tested ?? false}
              active={shippingActive}
            />
          </TabsContent>
        </Tabs>
      ) : null}
      {settings.isError ? (
        <OperationalOutcome
          tone="warning"
          outcome="La edición de credenciales está bloqueada por permisos o cifrado."
          nextStep="configura la clave de cifrado KAIRO_CONFIG_ENCRYPTION_KEY en el servidor."
        />
      ) : null}
      {settings.isPending ? (
        <LoadingState label="Cargando credenciales…" />
      ) : null}
      {save.isError ? (
        <OperationalOutcome
          tone="danger"
          outcome="No fue posible guardar la conexión."
          nextStep="corrige los campos o el conflicto de revisión y vuelve a guardar."
        />
      ) : null}
      {save.isSuccess ? (
        <OperationalOutcome
          tone="success"
          outcome="Borrador guardado."
          nextStep="probar la conexión de forma segura (sin mensajes ni guías)."
        />
      ) : null}
      <IntegrationLifecyclePanel />
    </section>
  );
}
