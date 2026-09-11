import {
  LocalitiesResponseSchema,
  type LocalityPublic,
} from '@camila/contracts';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { apiRequest, getErrorMessage } from '../api/client';

export function LocalityPicker({
  value,
  onChange,
}: {
  value: LocalityPublic | null;
  onChange: (value: LocalityPublic | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly LocalityPublic[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const normalizedQuery = query.trim();
    const selectedLabel = value
      ? `${value.locality}, ${value.department}`
      : null;
    if (normalizedQuery.length < 2 || normalizedQuery === selectedLabel) return;
    const timer = window.setTimeout(() => {
      void apiRequest(
        `/localities?query=${encodeURIComponent(normalizedQuery)}&limit=20`,
        { schema: LocalitiesResponseSchema },
      )
        .then((response) => {
          setItems(response.data.items);
          setError('');
        })
        .catch((caught) =>
          setError(getErrorMessage(caught, 'No fue posible buscar municipios')),
        );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, value]);

  const showResults = query.trim().length >= 2 && items.length > 0;

  return (
    <div className="locality-picker">
      <label htmlFor="locality-search">Departamento y municipio</label>
      <div className="input-with-icon">
        <Search aria-hidden="true" size={18} />
        <input
          id="locality-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value !== null) onChange(null);
          }}
          placeholder="Busca Medellín, Antioquia…"
          autoComplete="off"
          required
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {showResults ? (
        <ul className="locality-results" aria-label="Municipios encontrados">
          {items.map((item) => (
            <li key={item.carrierCode}>
              <button
                type="button"
                onClick={() => {
                  onChange(item);
                  setQuery(`${item.locality}, ${item.department}`);
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
