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
import { ErrorMessage } from '@/components/ErrorMessage';
import { LocalityPicker } from '@/components/LocalityPicker';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ShippingSimulator } from './ShippingSimulator';

const selectClassName =
  'h-11 w-full rounded-[1.125rem] border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

const checkboxClassName =
  'size-4 shrink-0 rounded border border-input accent-foreground';

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
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}-carrier`}>Transportadora preferida</Label>
        <select
          id={`${prefix}-carrier`}
          className={selectClassName}
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
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-fallback`}>Si no aparece la preferida</Label>
        <select
          id={`${prefix}-fallback`}
          className={selectClassName}
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
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-offer`}>Política automática de seguro</Label>
        <select
          id={`${prefix}-offer`}
          className={selectClassName}
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
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}-insurance`}>Seguro protegido</Label>
        <select
          id={`${prefix}-insurance`}
          className={selectClassName}
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
      <fieldset className="space-y-3 rounded-[1.125rem] border border-border p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-foreground">
          Transportadoras permitidas
        </legend>
        <p className="text-sm text-muted-foreground">
          Sin restricciones se consideran todas las transportadoras disponibles
          en la cotización.
        </p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className={checkboxClassName}
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
          />
          Limitar a una lista de transportadoras
        </label>
        {policy.allowedCarriers !== undefined &&
          carriers.map((carrier) => (
            <label
              key={carrier}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                className={checkboxClassName}
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
              />
              {carrierName(carrier)}
            </label>
          ))}
      </fieldset>
      <fieldset className="space-y-3 rounded-[1.125rem] border border-border p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-foreground">
          Transportadoras excluidas
        </legend>
        {carriers.map((carrier) => (
          <label
            key={carrier}
            className="flex items-center gap-2 text-sm text-foreground"
          >
            <input
              type="checkbox"
              className={checkboxClassName}
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
      <div className="space-y-3 sm:col-span-2">
        <Label htmlFor={`${prefix}-secondary`}>Transportadora secundaria</Label>
        <div className="space-y-2">
          {(policy.orderedCarriers ?? []).map((carrier, index) => (
            <div className="flex flex-wrap items-center gap-2" key={carrier}>
              <span className="text-sm text-foreground">
                {index + 1}. {carrierName(carrier)}
              </span>
              <Button
                type="button"
                variant="secondary"
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
              </Button>
              <Button
                type="button"
                variant="ghost"
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
              </Button>
            </div>
          ))}
        </div>
        <select
          id={`${prefix}-secondary`}
          className={selectClassName}
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
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}-threshold`}>
          Asegurar desde este valor del producto (COP)
        </Label>
        <Input
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
          className="h-11 rounded-[1.125rem] bg-muted"
        />
      </div>
      <fieldset className="space-y-3 rounded-[1.125rem] border border-border p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-foreground">
          Paquete para cotizar
        </legend>
        <div className="space-y-2">
          <Label>Contenido declarado</Label>
          <Input
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
            className="h-11 rounded-[1.125rem] bg-muted"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['weightKg', 'lengthCm', 'widthCm', 'heightCm'] as const).map(
            (key) => (
              <div className="space-y-2" key={key}>
                <Label>
                  {
                    {
                      weightKg: 'Peso (kg)',
                      lengthCm: 'Largo (cm)',
                      widthCm: 'Ancho (cm)',
                      heightCm: 'Alto (cm)',
                    }[key]
                  }
                </Label>
                <Input
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
                  className="h-11 rounded-[1.125rem] bg-muted"
                />
              </div>
            ),
          )}
        </div>
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
    <section className="space-y-6" aria-labelledby="settings-title">
      <PageHeader
        eyebrow="Configuración"
        title="Preferencias de envío"
        titleId="settings-title"
        description="Define la transportadora, el seguro y qué hacer cuando una transportadora no tiene cobertura. El cliente no selecciona el envío."
      />
      <dl className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de envío">
        <div className="space-y-1 rounded-[1.125rem] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Regla general
          </dt>
          <dd className="text-sm text-foreground">
            {describePolicy(globalPolicy)}
          </dd>
        </div>
        <div className="space-y-1 rounded-[1.125rem] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Seguro
          </dt>
          <dd className="text-sm text-foreground">
            {policyModeLabel(globalPolicy)}
          </dd>
        </div>
        <div className="space-y-1 rounded-[1.125rem] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
            Excepciones activas
          </dt>
          <dd className="text-sm text-foreground">
            {rules.filter((rule) => rule.active).length}
          </dd>
        </div>
      </dl>

      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <form onSubmit={(event) => void saveGlobal(event)}>
          <CardHeader>
            <p className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
              Regla general
            </p>
            <CardTitle className="text-lg">
              Municipios sin una regla propia
            </CardTitle>
            <CardDescription>{describePolicy(globalPolicy)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <details className="rounded-[1.125rem] border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Editar transportadora, seguro y paquete
              </summary>
              <div className="mt-4">
                <PolicyFields
                  prefix="global"
                  policy={globalPolicy}
                  carriers={carriers}
                  onChange={setGlobalPolicy}
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
          </CardContent>
        </form>
      </Card>

      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <form onSubmit={(event) => void saveMunicipality(event)}>
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
              onChange={(locality) => {
                setSelectedLocality(locality);
                setLocalityCarrierCode(locality?.carrierCode ?? '');
              }}
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
                  onChange={setMunicipalPolicy}
                />
              </div>
            </details>
            {invalidBlockedRule ? (
              <ErrorMessage message="Elige una transportadora antes de bloquear el fallback." />
            ) : null}
            {error === null ? null : <ErrorMessage message={error} />}
            {saved ? (
              <p role="status" className="text-sm text-foreground">
                {saved}
              </p>
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
                onClick={() => void simulatePolicy()}
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

      <ShippingSimulator />

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
                        normalizedName:
                          rule.locality.toLocaleLowerCase('es-CO'),
                      });
                      setSaved(
                        'Regla cargada para editar. Guarda para aplicar los cambios.',
                      );
                    }}
                  >
                    Editar regla de {rule.locality}
                  </Button>
                  {rule.active && (
                    <Button
                      type="button"
                      variant="danger"
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
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
