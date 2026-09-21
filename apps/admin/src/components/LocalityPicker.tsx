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
    <div className="locality-picker locality-picker--cascade">
      <p className="locality-picker-label">Departamento y municipio</p>
      {catalogEmpty ? (
        <p className="locality-empty" role="status">
          No hay catálogo de municipios publicado.{' '}
          <Link to="/settings/localities">
            Publicar departamentos y municipios
          </Link>{' '}
          para poder elegir destinos.
        </p>
      ) : null}
      <label htmlFor={`${id}-department`}>Departamento</label>
      <select
        id={`${id}-department`}
        aria-label="Departamento"
        value={department}
        disabled={catalogEmpty}
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
      <label htmlFor={`${id}-municipality`}>Municipio</label>
      <select
        id={`${id}-municipality`}
        aria-label="Municipio"
        value={value?.carrierCode ?? ''}
        disabled={department === '' || loadingMunicipalities || catalogEmpty}
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
      {error ? <p role="alert">{error}</p> : null}
      {value ? (
        <p className="selected-locality">
          <MapPin aria-hidden="true" size={16} /> Seleccionado:{' '}
          <strong>
            {value.locality}, {value.department}
          </strong>
        </p>
      ) : null}
    </div>
  );
}
