import {
  ShippingPreferencesResponseSchema,
  ShippingCarriersResponseSchema,
  ShippingPolicyPreviewResponseSchema,
  ShippingRulesResponseSchema,
  type ShippingPolicy,
  type ShippingRulePublic,
  type LocalityPublic,
} from '@camila/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import {
  apiRequest,
  apiRequestNoContent,
  getErrorMessage,
} from '../api/client';
import { PageHeader } from '@/components/PageHeader';
import { GeneralShippingPolicy } from './shipping/GeneralShippingPolicy';
import { LocalityExceptions } from './shipping/LocalityExceptions';
import { ShippingDecisionSimulator } from './shipping/ShippingDecisionSimulator';
import { ShippingOperationsStatus } from './shipping/ShippingOperationsStatus';
import {
  copyGlobalForMunicipality,
  DEFAULT_POLICY,
  policyValidationMessage,
} from './shipping/policy-utils';

function policyFromRule(rule: ShippingRulePublic): ShippingPolicy {
  return {
    revision: rule.revision ?? 0,
    preferredCarrier: rule.preferredCarrier,
    fallbackPolicy: rule.fallbackPolicy,
    offerMode: rule.offerMode,
    protectedInsurance: rule.protectedInsurance,
    allowedCarriers: rule.allowedCarriers,
    excludedCarriers: rule.excludedCarriers,
    orderedCarriers: rule.orderedCarriers,
    insuranceThresholdCop: rule.insuranceThresholdCop,
    packageDefaults: rule.packageDefaults,
  };
}

export function ShippingSettingsPage() {
  const [globalPolicy, setGlobalPolicy] =
    useState<ShippingPolicy>(DEFAULT_POLICY);
  const [municipalPolicy, setMunicipalPolicy] =
    useState<ShippingPolicy>(DEFAULT_POLICY);
  const [localityCarrierCode, setLocalityCarrierCode] = useState('');
  const [selectedLocality, setSelectedLocality] =
    useState<LocalityPublic | null>(null);
  const [rules, setRules] = useState<readonly ShippingRulePublic[]>([]);
  const [carriers, setCarriers] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<{
    source: 'global' | 'municipality';
    policy: ShippingPolicy;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSaved, setGlobalSaved] = useState<string | null>(null);

  async function load() {
    setLoadState('loading');
    try {
      const [preferences, rulePage, carrierPage] = await Promise.all([
        apiRequest('/shipping/preferences', {
          schema: ShippingPreferencesResponseSchema,
        }),
        apiRequest('/shipping/rules', { schema: ShippingRulesResponseSchema }),
        apiRequest('/shipping/carriers', {
          schema: ShippingCarriersResponseSchema,
        }),
      ]);
      setGlobalPolicy(preferences.data);
      setRules(rulePage.data.items);
      setCarriers(carrierPage.data.items);
      setLoadError(null);
      setLoadState('ready');
    } catch (caught) {
      setLoadError(
        getErrorMessage(caught, 'No se pudieron cargar las preferencias'),
      );
      setLoadState('error');
    }
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  async function saveGlobal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadState !== 'ready') return;
    const validationError = policyValidationMessage(globalPolicy);
    if (validationError) {
      setGlobalError(validationError);
      return;
    }
    setPending(true);
    setGlobalError(null);
    setGlobalSaved(null);
    try {
      const response = await apiRequest('/shipping/preferences', {
        method: 'PATCH',
        body: {
          ...globalPolicy,
          preferredCarrier:
            globalPolicy.preferredCarrier?.trim().toLowerCase() ?? null,
        },
        schema: ShippingPreferencesResponseSchema,
      });
      setGlobalPolicy(response.data);
      setGlobalSaved('Preferencia general guardada');
    } catch (caught) {
      setGlobalError(
        getErrorMessage(caught, 'No se pudo guardar la preferencia general'),
      );
    } finally {
      setPending(false);
    }
  }

  async function saveMunicipality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadState !== 'ready') return;
    const validationError = policyValidationMessage(municipalPolicy);
    if (validationError) {
      setError(validationError);
      return;
    }
    setPending(true);
    setError(null);
    setSaved(null);
    try {
      await apiRequestNoContent('/shipping/rules', {
        method: 'POST',
        body: {
          localityCarrierCode: localityCarrierCode.trim(),
          ...municipalPolicy,
          preferredCarrier:
            municipalPolicy.preferredCarrier?.trim().toLowerCase() ?? null,
        },
      });
      setSaved('Regla guardada');
      setMunicipalPolicy({
        ...municipalPolicy,
        revision: (municipalPolicy.revision ?? 0) + 1,
      });
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, 'No se pudo guardar la regla'));
    } finally {
      setPending(false);
    }
  }

  async function simulatePolicy() {
    setError(null);
    try {
      const response = await apiRequest('/shipping/rules/preview', {
        method: 'POST',
        body: { localityCarrierCode },
        schema: ShippingPolicyPreviewResponseSchema,
      });
      setPreview(response.data);
      setSaved('Simulación lista. Revisa el origen efectivo abajo.');
    } catch (caught) {
      setError(getErrorMessage(caught, 'No se pudo simular la regla'));
    }
  }

  const globalValidationError = policyValidationMessage(globalPolicy);
  const municipalValidationError = policyValidationMessage(municipalPolicy);

  return (
    <section className="space-y-6" aria-labelledby="settings-title">
      <PageHeader
        eyebrow="Configuración"
        title="Preferencias de envío"
        titleId="settings-title"
        description="Define la transportadora, el seguro y qué hacer cuando una transportadora no tiene cobertura. El cliente no selecciona el envío."
      />
      <ShippingOperationsStatus
        globalPolicy={globalPolicy}
        rules={rules}
        loadError={loadError}
        loading={loadState === 'loading'}
        onRetry={() => void load()}
      />
      <GeneralShippingPolicy
        policy={globalPolicy}
        carriers={carriers}
        pending={pending}
        disabled={loadState !== 'ready'}
        validationError={globalValidationError}
        onChange={setGlobalPolicy}
        onSave={(event) => void saveGlobal(event)}
        saved={globalSaved}
        error={globalError}
      />
      <LocalityExceptions
        municipalPolicy={municipalPolicy}
        carriers={carriers}
        selectedLocality={selectedLocality}
        localityCarrierCode={localityCarrierCode}
        rules={rules}
        pending={pending}
        disabled={loadState !== 'ready'}
        validationError={municipalValidationError}
        error={error}
        saved={saved}
        preview={preview}
        onMunicipalChange={setMunicipalPolicy}
        onLocalityChange={(locality) => {
          setSelectedLocality(locality);
          setLocalityCarrierCode(locality?.carrierCode ?? '');
          setPreview(null);
          setSaved(null);
          const existingRule = rules.find(
            (rule) => rule.localityCarrierCode === locality?.carrierCode,
          );
          setMunicipalPolicy(
            existingRule
              ? policyFromRule(existingRule)
              : copyGlobalForMunicipality(globalPolicy),
          );
        }}
        onCopyGlobal={() =>
          setMunicipalPolicy(
            copyGlobalForMunicipality(
              globalPolicy,
              municipalPolicy.revision ?? 0,
            ),
          )
        }
        onSave={(event) => void saveMunicipality(event)}
        onSimulate={() => void simulatePolicy()}
        onEditRule={(rule) => {
          setMunicipalPolicy(policyFromRule(rule));
          setLocalityCarrierCode(rule.localityCarrierCode);
          setSelectedLocality({
            carrierCode: rule.localityCarrierCode,
            department: rule.department,
            locality: rule.locality,
            country: 'CO',
            normalizedName: rule.locality.toLocaleLowerCase('es-CO'),
          });
          setSaved(
            'Regla cargada para editar. Guarda para aplicar los cambios.',
          );
        }}
        onDeactivate={(rule) => {
          if (
            window.confirm(
              `¿Desactivar la regla de ${rule.locality}? Se utilizará la preferencia general.`,
            )
          ) {
            setPending(true);
            void apiRequestNoContent(
              `/shipping/rules/${rule.localityCarrierCode}/deactivate`,
              { method: 'POST' },
            )
              .then(load)
              .catch((caught) =>
                setError(
                  getErrorMessage(caught, 'No se pudo desactivar la regla.'),
                ),
              )
              .finally(() => setPending(false));
          }
        }}
      />
      <ShippingDecisionSimulator />
    </section>
  );
}
