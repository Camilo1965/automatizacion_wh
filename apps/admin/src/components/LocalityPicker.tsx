import {
  DepartmentsResponseSchema,
  LocalitiesResponseSchema,
  type DepartmentPublic,
  type LocalityPublic,
} from '@camila/contracts';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { apiRequest, getErrorMessage } from '../api/client';

export function LocalityPicker({
  value,
  onChange,
}: {
  value: LocalityPublic | null;
  onChange: (value: LocalityPublic | null) => void;
}) {
  const id = useId();
  const [search, setQuery] = useState<string | null>(null);
  const query =
    search ?? (value ? `${value.locality}, ${value.department}` : '');
  const [chosenDepartment, setDepartment] = useState<string | null>(null);
  const department = chosenDepartment ?? value?.department ?? '';
  const [departments, setDepartments] = useState<readonly DepartmentPublic[]>(
    [],
  );
  const [items, setItems] = useState<readonly LocalityPublic[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiRequest('/localities/departments', {
      schema: DepartmentsResponseSchema,
    })
      .then((response) => setDepartments(response.data.items))
      .catch(() =>
        setError(
          'No fue posible cargar los departamentos. Vuelve a abrir esta sección.',
        ),
      );
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const selectedLabel = value
      ? `${value.locality}, ${value.department}`
      : null;
    if (normalizedQuery.length < 2 || normalizedQuery === selectedLabel) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void apiRequest(
        `/localities?query=${encodeURIComponent(normalizedQuery)}&limit=20${
          department === ''
            ? ''
            : `&department=${encodeURIComponent(department)}`
        }`,
        { schema: LocalitiesResponseSchema, signal: controller.signal },
      )
        .then((response) => {
          if (controller.signal.aborted) return;
          setItems(response.data.items);
          setError('');
        })
        .catch((caught) => {
          if (!controller.signal.aborted)
            setError(
              getErrorMessage(caught, 'No fue posible buscar municipios'),
            );
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [department, query, value]);

  const showResults = query.trim().length >= 2 && items.length > 0;

  return (
    <div className="locality-picker">
      <label htmlFor={`${id}-search`}>Departamento y municipio</label>
      <select
        aria-label="Departamento"
        value={department}
        onChange={(event) => {
          setDepartment(event.target.value);
          setQuery('');
          setItems([]);
          if (value !== null) onChange(null);
        }}
      >
        <option value="">Todos los departamentos</option>
        {departments.map((item) => (
          <option key={item.name} value={item.name}>
            {item.name} ({item.localityCount})
          </option>
        ))}
      </select>
      <div className="input-with-icon">
        <Search aria-hidden="true" size={18} />
        <input
          id={`${id}-search`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setItems([]);
            if (value !== null) onChange(null);
          }}
          placeholder="Busca Medellín, Antioquia…"
          autoComplete="off"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              document
                .getElementById(`${id}-results`)
                ?.querySelector<HTMLButtonElement>('button')
                ?.focus();
            }
            if (event.key === 'Escape') setItems([]);
          }}
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {showResults ? (
        <ul
          id={`${id}-results`}
          className="locality-results"
          aria-label="Municipios encontrados"
        >
          {items.map((item) => (
            <li key={item.carrierCode}>
              <button
                type="button"
                onClick={() => {
                  onChange(item);
                  setQuery(null);
                  setItems([]);
                }}
              >
                <MapPin aria-hidden="true" />
                <span>
                  <strong>{item.locality}</strong>
                  <small>{item.department}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
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
