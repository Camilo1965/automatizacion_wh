import { useId, useMemo, useState } from 'react';

import { ChevronDownIcon } from '../design/icons';

export type ComboboxOption = Readonly<{
  id: string;
  label: string;
  description?: string;
}>;

type SearchComboboxProps = {
  label: string;
  value: string | null;
  options: readonly ComboboxOption[];
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function SearchCombobox({
  label,
  value,
  options,
  onChange,
  placeholder = 'Buscar…',
  disabled = false,
}: SearchComboboxProps) {
  const inputId = useId();
  const listId = useId();
  const selected = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return normalized === '' || selected?.label === query
      ? options
      : options.filter((option) =>
          option.label.toLocaleLowerCase('es').includes(normalized),
        );
  }, [options, query, selected?.label]);

  function selectOption(option: ComboboxOption) {
    setQuery(option.label);
    setOpen(false);
    setActiveIndex(-1);
    onChange(option.id);
  }

  return (
    <div className="combobox">
      <label htmlFor={inputId}>{label}</label>
      <div className="combobox-control">
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
            if (event.target.value === '') onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                Math.min(current + 1, filtered.length - 1),
              );
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault();
              const option = filtered[activeIndex];
              if (option) selectOption(option);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <ChevronDownIcon className="combobox-chevron" />
      </div>
      {open && filtered.length > 0 ? (
        <ul id={listId} className="combobox-list" role="listbox">
          {filtered.map((option, index) => (
            <li
              id={`${listId}-${index}`}
              key={option.id}
              role="option"
              aria-selected={option.id === value}
              className={index === activeIndex ? 'active' : ''}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
            >
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
