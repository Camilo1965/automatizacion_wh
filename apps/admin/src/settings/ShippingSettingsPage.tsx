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
import { ShippingSimulator } from './ShippingSimulator';

function carrierName(value: string): string {
  const names: Record<string, string> = {
    interrapidisimo: 'Interrapidísimo',
    tcc: 'TCC',
    servientrega: 'Servientrega',
    coordinadora: 'Coordinadora',
    envia: 'Envia',
  };
  return names[value.toLowerCase()] ?? value;
}

const DEFAULT_POLICY: ShippingPolicy = {
  revision: 0,
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
            {carrierName(carrier)}
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
      <label htmlFor={`${prefix}-offer`}>Política automática de seguro</label>
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
        <option value="customer_choice">Elegir el envío económico</option>
        <option value="economy_only">Sin seguro adicional</option>
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
      <fieldset>
        <legend>Transportadoras permitidas</legend>
        <p>
          Sin restricciones se consideran todas las transportadoras disponibles
          en la cotización.
        </p>
        <label>
          <input
            type="checkbox"
            checked={policy.allowedCarriers !== undefined}
            onChange={(event) =>
              onChange({
                ...policy,
                allowedCarriers: event.target.checked
                  ? carriers.filter(
                      (carrier) => !policy.excludedCarriers?.includes(carrier),
                    )
                  : undefined,
              })
            }
          />{' '}
          Limitar a una lista de transportadoras
        </label>
        {policy.allowedCarriers !== undefined &&
          carriers.map((carrier) => (
            <label key={carrier}>
              <input
                type="checkbox"
                disabled={policy.excludedCarriers?.includes(carrier)}
                checked={policy.allowedCarriers?.includes(carrier) ?? false}
                onChange={(event) =>
                  onChange({
                    ...policy,
                    allowedCarriers: event.target.checked
                      ? [...(policy.allowedCarriers ?? []), carrier]
                      : (policy.allowedCarriers ?? []).filter(
                          (value) => value !== carrier,
                        ),
                  })
                }
              />{' '}
              {carrierName(carrier)}
            </label>
          ))}
      </fieldset>
      <fieldset>
        <legend>Transportadoras excluidas</legend>
        {carriers.map((carrier) => (
          <label key={carrier}>
            <input
              type="checkbox"
              checked={policy.excludedCarriers?.includes(carrier) ?? false}
              onChange={(event) =>
                onChange({
                  ...policy,
                  excludedCarriers: event.target.checked
                    ? [...(policy.excludedCarriers ?? []), carrier]
                    : (policy.excludedCarriers ?? []).filter(
                        (value) => value !== carrier,
                      ),
                })
              }
            />
            {carrierName(carrier)}
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${prefix}-secondary`}>Transportadora secundaria</label>
      <div className="stack">
        {(policy.orderedCarriers ?? []).map((carrier, index) => (
          <div className="button-row" key={carrier}>
            <span>
              {index + 1}. {carrierName(carrier)}
            </span>
            <button
              type="button"
              disabled={index === 0}
              aria-label={`Subir prioridad de ${carrierName(carrier)}`}
              onClick={() => {
                const ordered = [...(policy.orderedCarriers ?? [])];
                [ordered[index - 1], ordered[index]] = [
                  ordered[index]!,
                  ordered[index - 1]!,
                ];
                onChange({ ...policy, orderedCarriers: ordered });
              }}
            >
              Subir
            </button>
            <button
              type="button"
              aria-label={`Quitar preferencia ${carrierName(carrier)}`}
              onClick={() =>
                onChange({
                  ...policy,
                  orderedCarriers: (policy.orderedCarriers ?? []).filter(
                    (value) => value !== carrier,
                  ),
                })
              }
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
      <select
        id={`${prefix}-secondary`}
        value=""
        onChange={(event) =>
          onChange({
            ...policy,
            orderedCarriers: event.target.value
              ? [
                  ...new Set([
                    ...(policy.orderedCarriers ?? []),
                    event.target.value,
                  ]),
                ]
              : (policy.orderedCarriers ?? []),
          })
        }
      >
        <option value="">
          Añadir preferencia (sin preferencias se elige la más económica)
        </option>
        {carriers.map((carrier) => (
          <option key={carrier} value={carrier}>
            {carrierName(carrier)}
          </option>
        ))}
      </select>
      <label htmlFor={`${prefix}-threshold`}>
        Asegurar desde este valor del producto (COP)
      </label>
      <input
        id={`${prefix}-threshold`}
        type="number"
        min={0}
        step={1}
        value={policy.insuranceThresholdCop ?? ''}
        onChange={(event) =>
          onChange({
            ...policy,
            insuranceThresholdCop:
              event.target.value === '' ? null : Number(event.target.value),
          })
        }
      />
      <fieldset>
        <legend>Paquete para cotizar</legend>
        <label>
          Contenido declarado
          <input
            value={policy.packageDefaults?.contents ?? ''}
            maxLength={200}
            placeholder="Calzado (se completará con la referencia y talla)"
            onChange={(event) =>
              onChange({
                ...policy,
                packageDefaults: {
                  weightKg: 1,
                  lengthCm: 30,
                  widthCm: 20,
                  heightCm: 12,
                  ...policy.packageDefaults,
                  contents: event.target.value || undefined,
                },
              })
            }
          />
        </label>
        {(['weightKg', 'lengthCm', 'widthCm', 'heightCm'] as const).map(
          (key) => (
            <label key={key}>
              {
                {
                  weightKg: 'Peso (kg)',
                  lengthCm: 'Largo (cm)',
                  widthCm: 'Ancho (cm)',
                  heightCm: 'Alto (cm)',
                }[key]
              }
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={
                  (policy.packageDefaults ?? {
                    weightKg: 1,
                    lengthCm: 30,
                    widthCm: 20,
                    heightCm: 12,
                  })[key]
                }
                onChange={(event) =>
                  onChange({
                    ...policy,
                    packageDefaults: {
                      ...(policy.packageDefaults ?? {
                        weightKg: 1,
                        lengthCm: 30,
                        widthCm: 20,
                        heightCm: 12,
                      }),
                      [key]: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
          ),
        )}
      </fieldset>
    </div>
  );
}

function describePolicy(policy: ShippingPolicy): string {
  const carrier = policy.preferredCarrier
    ? carrierName(policy.preferredCarrier)
    : 'la mejor transportadora disponible';
  const fallback =
    policy.fallbackPolicy === 'allow'
      ? 'permite otra transportadora si hace falta'
      : 'se detiene si no está disponible';
  const offer =
    policy.offerMode === 'customer_choice'
      ? 'selecciona automáticamente la alternativa económica'
      : policy.offerMode === 'economy_only'
        ? 'envía sin seguro adicional'
        : `exige envío protegido con seguro ${policy.protectedInsurance === 'plus' ? 'Plus' : 'estándar'}`;
  return `Prefiere ${carrier}, ${fallback} y ${offer}.`;
}

function policyModeLabel(policy: ShippingPolicy): string {
  if (policy.offerMode === 'economy_only') {
    return 'Sin seguro adicional';
  }
  if (policy.offerMode === 'protected_only') {
    return `Protegido ${policy.protectedInsurance === 'plus' ? 'Plus' : 'estándar'}`;
  }
  return 'Económico automático';
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
    } catch (caught) {
      setError(getErrorMessage(caught, 'No se pudo simular la regla'));
    }
  }

  const invalidBlockedRule =
    municipalPolicy.fallbackPolicy === 'block' &&
    municipalPolicy.preferredCarrier === null;

  return (
    <section className="operational-config" aria-labelledby="settings-title">
      <p className="eyebrow">Configuración</p>
      <h2 id="settings-title">Preferencias de envío</h2>
      <p className="muted">
        Define la transportadora, el seguro y qué hacer cuando una
        transportadora no tiene cobertura. El cliente no selecciona el envío.
      </p>
      <dl className="settings-overview" aria-label="Resumen de envío">
        <div>
          <dt>Regla general</dt>
          <dd>{describePolicy(globalPolicy)}</dd>
        </div>
        <div>
          <dt>Seguro</dt>
          <dd>{policyModeLabel(globalPolicy)}</dd>
        </div>
        <div>
          <dt>Excepciones activas</dt>
          <dd>{rules.filter((rule) => rule.active).length}</dd>
        </div>
      </dl>
      <form
        className="card settings-card"
        onSubmit={(event) => void saveGlobal(event)}
      >
        <div>
          <p className="eyebrow">Regla general</p>
          <h3>Municipios sin una regla propia</h3>
        </div>
        <p className="policy-explanation">{describePolicy(globalPolicy)}</p>
        <details className="settings-disclosure">
          <summary>Editar transportadora, seguro y paquete</summary>
          <PolicyFields
            prefix="global"
            policy={globalPolicy}
            carriers={carriers}
            onChange={setGlobalPolicy}
          />
        </details>
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
            setLocalityCarrierCode(locality?.carrierCode ?? '');
          }}
        />
        <p className="policy-explanation">{describePolicy(municipalPolicy)}</p>
        <details className="settings-disclosure">
          <summary>Editar excepción municipal</summary>
          <PolicyFields
            prefix="municipal"
            policy={municipalPolicy}
            carriers={carriers}
            onChange={setMunicipalPolicy}
          />
        </details>
        {invalidBlockedRule ? (
          <ErrorMessage message="Elige una transportadora antes de bloquear el fallback." />
        ) : null}
        {error === null ? null : <ErrorMessage message={error} />}
        {saved ? <p role="status">{saved}</p> : null}
        <button
          className="button-primary"
          disabled={pending || invalidBlockedRule || selectedLocality === null}
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

      <ShippingSimulator />
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
                  <strong>
                    {rule.locality}, {rule.department}
                  </strong>
                  <p>{describePolicy(rule)}</p>
                </div>
                <span className={`status-pill ${rule.active ? '' : 'muted'}`}>
                  {rule.active ? 'Activa' : 'Inactiva'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMunicipalPolicy({
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
                    });
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
                >
                  Editar regla de {rule.locality}
                </button>
                {rule.active && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
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
                              getErrorMessage(
                                caught,
                                'No se pudo desactivar la regla.',
                              ),
                            ),
                          )
                          .finally(() => setPending(false));
                      }
                    }}
                  >
                    Desactivar regla
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
