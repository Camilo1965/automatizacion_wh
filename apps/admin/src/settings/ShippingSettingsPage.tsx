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
import { ErrorMessage } from '../components/ErrorMessage';
import { LocalityPicker } from '../components/LocalityPicker';

const DEFAULT_POLICY: ShippingPolicy = {
  preferredCarrier: null,
  fallbackPolicy: 'allow',
  offerMode: 'customer_choice',
  protectedInsurance: 'standard',
};

function PolicyFields({
  prefix,
  policy,
  carriers,
  onChange,
}: {
  prefix: string;
  policy: ShippingPolicy;
  carriers: readonly string[];
  onChange: (policy: ShippingPolicy) => void;
}) {
  return (
    <div className="policy-grid">
      <label htmlFor={`${prefix}-carrier`}>Transportadora preferida</label>
      <select
        id={`${prefix}-carrier`}
        value={policy.preferredCarrier ?? ''}
        onChange={(event) =>
          onChange({
            ...policy,
            preferredCarrier:
              event.target.value.trim() === '' ? null : event.target.value,
          })
        }
      >
        <option value="">Automática (recomendado)</option>
        {carriers.map((carrier) => (
          <option key={carrier} value={carrier}>
            {carrier}
          </option>
        ))}
      </select>
      <label htmlFor={`${prefix}-fallback`}>Si no aparece la preferida</label>
      <select
        id={`${prefix}-fallback`}
        value={policy.fallbackPolicy}
        onChange={(event) =>
          onChange({
            ...policy,
            fallbackPolicy: event.target
              .value as ShippingPolicy['fallbackPolicy'],
          })
        }
      >
        <option value="allow">Usar otra transportadora</option>
        <option value="block">Detener y pedir atención</option>
      </select>
      <label htmlFor={`${prefix}-offer`}>Opciones para el cliente</label>
      <select
        id={`${prefix}-offer`}
        value={policy.offerMode}
        onChange={(event) =>
          onChange({
            ...policy,
            offerMode: event.target.value as ShippingPolicy['offerMode'],
          })
        }
      >
        <option value="customer_choice">Económico y protegido</option>
        <option value="economy_only">Solo económico</option>
        <option value="protected_only">Siempre protegido</option>
      </select>
      <label htmlFor={`${prefix}-insurance`}>Seguro protegido</label>
      <select
        id={`${prefix}-insurance`}
        value={policy.protectedInsurance}
        disabled={policy.offerMode === 'economy_only'}
        onChange={(event) =>
          onChange({
            ...policy,
            protectedInsurance: event.target
              .value as ShippingPolicy['protectedInsurance'],
          })
        }
      >
        <option value="standard">Seguro 99 estándar</option>
        <option value="plus">Seguro 99 Plus</option>
      </select>
    </div>
  );
}

function describePolicy(policy: ShippingPolicy): string {
  const carrier =
    policy.preferredCarrier ?? 'la mejor transportadora disponible';
  const fallback =
    policy.fallbackPolicy === 'allow'
      ? 'permite otra transportadora si hace falta'
      : 'se detiene si no está disponible';
  const offer =
    policy.offerMode === 'customer_choice'
      ? `ofrece económico y protegido con seguro ${policy.protectedInsurance === 'plus' ? 'Plus' : 'estándar'}`
      : policy.offerMode === 'economy_only'
        ? 'ofrece únicamente envío económico'
        : `exige envío protegido con seguro ${policy.protectedInsurance === 'plus' ? 'Plus' : 'estándar'}`;
  return `Prefiere ${carrier}, ${fallback} y ${offer}.`;
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

  async function load() {
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
    } catch (caught) {
      setError(
        getErrorMessage(caught, 'No se pudieron cargar las preferencias'),
      );
    }
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  async function saveGlobal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(null);
    try {
      await apiRequest('/shipping/preferences', {
        method: 'PATCH',
        body: {
          ...globalPolicy,
          preferredCarrier:
            globalPolicy.preferredCarrier?.trim().toLowerCase() ?? null,
        },
        schema: ShippingPreferencesResponseSchema,
      });
      setSaved('Preferencia general guardada');
    } catch (caught) {
      setError(
        getErrorMessage(caught, 'No se pudo guardar la preferencia general'),
      );
    } finally {
      setPending(false);
    }
  }

  async function saveMunicipality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    } catch (caught) {
      setError(getErrorMessage(caught, 'No se pudo simular la regla'));
    }
  }

  const invalidBlockedRule =
    municipalPolicy.fallbackPolicy === 'block' &&
    municipalPolicy.preferredCarrier === null;

  return (
    <section aria-labelledby="settings-title">
      <p className="eyebrow">Configuración</p>
      <h2 id="settings-title">Preferencias de envío</h2>
      <p className="muted">
        Controla qué opciones recibe cada cliente y qué hacer cuando una
        transportadora no tiene cobertura.
      </p>
      <form
        className="card settings-card"
        onSubmit={(event) => void saveGlobal(event)}
      >
        <div>
          <p className="eyebrow">Regla general</p>
          <h3>Municipios sin una regla propia</h3>
        </div>
        <PolicyFields
          prefix="global"
          policy={globalPolicy}
          carriers={carriers}
          onChange={setGlobalPolicy}
        />
        <p className="policy-explanation">{describePolicy(globalPolicy)}</p>
        <button className="button-secondary" disabled={pending} type="submit">
          Guardar preferencia general
        </button>
      </form>

      <form
        className="card settings-card"
        onSubmit={(event) => void saveMunicipality(event)}
      >
        <div>
          <p className="eyebrow">Excepción por municipio</p>
          <h3>Nueva regla municipal</h3>
        </div>
        <LocalityPicker
          value={selectedLocality}
          onChange={(locality) => {
            setSelectedLocality(locality);
            setLocalityCarrierCode(locality.carrierCode);
          }}
        />
        <PolicyFields
          prefix="municipal"
          policy={municipalPolicy}
          carriers={carriers}
          onChange={setMunicipalPolicy}
        />
        <p className="policy-explanation">{describePolicy(municipalPolicy)}</p>
        {invalidBlockedRule ? (
          <ErrorMessage message="Elige una transportadora antes de bloquear el fallback." />
        ) : null}
        {error === null ? null : <ErrorMessage message={error} />}
        {saved ? <p role="status">{saved}</p> : null}
        <button
          className="button-primary"
          disabled={pending || invalidBlockedRule}
          type="submit"
        >
          Guardar regla
        </button>
        <button
          className="button-secondary"
          disabled={!/^\d{8}$/.test(localityCarrierCode)}
          type="button"
          onClick={() => void simulatePolicy()}
        >
          Simular regla efectiva
        </button>
        {preview ? (
          <aside
            className="policy-preview"
            aria-label="Resultado de simulación"
          >
            <strong>
              Origen:{' '}
              {preview.source === 'municipality'
                ? 'regla municipal'
                : 'regla general'}
            </strong>
            <p>{describePolicy(preview.policy)}</p>
            <small>Esta simulación no crea cotizaciones ni guías.</small>
          </aside>
        ) : null}
      </form>

      <section
        className="card settings-card"
        aria-labelledby="active-rules-title"
      >
        <h3 id="active-rules-title">Reglas guardadas</h3>
        {rules.length === 0 ? (
          <p className="muted">Todavía no hay excepciones municipales.</p>
        ) : (
          <div className="rules-list">
            {rules.map((rule) => (
              <article key={rule.localityCarrierCode} className="rule-row">
                <div>
                  <strong>Municipio configurado</strong>
                  <p>{describePolicy(rule)}</p>
                </div>
                <span className={`status-pill ${rule.active ? '' : 'muted'}`}>
                  {rule.active ? 'Activa' : 'Inactiva'}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
