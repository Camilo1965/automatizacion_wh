import {
  DepartmentsResponseSchema,
  LocalitiesResponseSchema,
  type DepartmentPublic,
  type LocalityPublic,
} from '@camila/contracts';
import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useId, useState } from 'react';

import { apiRequest, getErrorMessage } from '../api/client';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const selectClassName =
  'h-11 w-full rounded-[1.125rem] border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

async function loadMunicipalities(
  department: string,
): Promise<readonly LocalityPublic[]> {
  const collected: LocalityPublic[] = [];
  let afterCode: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({
      department,
      limit: '100',
    });
    if (afterCode) query.set('afterCode', afterCode);
    const response = await apiRequest(`/localities?${query}`, {
      schema: LocalitiesResponseSchema,
    });
    collected.push(...response.data.items);
    if (!response.data.nextAfterCode) break;
    afterCode = response.data.nextAfterCode;
  }
  return collected;
}

export function LocalityPicker({
  value,
  onChange,
}: {
  value: LocalityPublic | null;
  onChange: (value: LocalityPublic | null) => void;
}) {
  const id = useId();
  const [chosenDepartment, setDepartment] = useState<string | null>(null);
  const department = chosenDepartment ?? value?.department ?? '';
  const [departments, setDepartments] = useState<readonly DepartmentPublic[]>(
    [],
  );
  const [municipalities, setMunicipalities] = useState<
    readonly LocalityPublic[]
  >([]);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false);
  const [error, setError] = useState('');
  const [catalogEmpty, setCatalogEmpty] = useState(false);

  useEffect(() => {
    void apiRequest('/localities/departments', {
      schema: DepartmentsResponseSchema,
    })
      .then((response) => {
        setDepartments(response.data.items);
        setCatalogEmpty(response.data.items.length === 0);
        setError('');
      })
      .catch(() =>
        setError(
          'No fue posible cargar los departamentos. Vuelve a abrir esta sección.',
        ),
      );
  }, []);

  useEffect(() => {
    if (department === '') {
      setMunicipalities([]);
      return;
    }
    const controller = new AbortController();
    setLoadingMunicipalities(true);
    void loadMunicipalities(department)
      .then((items) => {
        if (controller.signal.aborted) return;
        setMunicipalities(items);
        setError('');
      })
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(
            getErrorMessage(caught, 'No fue posible cargar los municipios'),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMunicipalities(false);
      });
    return () => controller.abort();
  }, [department]);

  return (
    <div className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <p className="text-sm font-medium text-foreground">
        Departamento y municipio
      </p>
      {catalogEmpty ? (
        <p
          className="rounded-[1.125rem] border border-dashed border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          No hay catálogo de municipios publicado.{' '}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to="/settings/localities"
          >
            Publicar departamentos y municipios
          </Link>{' '}
          para poder elegir destinos.
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor={`${id}-department`}>Departamento</Label>
        <select
          id={`${id}-department`}
          aria-label="Departamento"
          value={department}
          disabled={catalogEmpty}
          className={selectClassName}
          onChange={(event) => {
            setDepartment(event.target.value);
            if (value !== null) onChange(null);
          }}
        >
          <option value="">Selecciona un departamento</option>
          {departments.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({item.localityCount})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-municipality`}>Municipio</Label>
        <select
          id={`${id}-municipality`}
          aria-label="Municipio"
          value={value?.carrierCode ?? ''}
          disabled={department === '' || loadingMunicipalities || catalogEmpty}
          className={selectClassName}
          onChange={(event) => {
            const next = municipalities.find(
              (item) => item.carrierCode === event.target.value,
            );
            onChange(next ?? null);
          }}
        >
          <option value="">
            {loadingMunicipalities
              ? 'Cargando municipios…'
              : department === ''
                ? 'Primero elige un departamento'
                : municipalities.length === 0
                  ? 'Sin municipios en este departamento'
                  : 'Selecciona un municipio'}
          </option>
          {municipalities.map((item) => (
            <option key={item.carrierCode} value={item.carrierCode}>
              {item.locality}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {value ? (
        <p
          className={cn(
            'flex items-center gap-2 rounded-[1.125rem] border border-border bg-muted px-3 py-2 text-sm text-foreground',
          )}
        >
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          Seleccionado:{' '}
          <strong className="font-medium">
            {value.locality}, {value.department}
          </strong>
        </p>
      ) : null}
    </div>
  );
}
