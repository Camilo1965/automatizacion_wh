import type { ShippingPolicy } from '@camila/contracts';

import { Button } from '@/components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  carrierName,
  checkboxClassName,
  selectClassName,
} from './policy-utils';

export function PolicyFields({
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
