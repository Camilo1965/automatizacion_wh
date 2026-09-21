import { useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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
    <div className="relative space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Input
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
          className="h-11 rounded-[1.125rem] bg-muted pr-10"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
            if (event.target.value === '') onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
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
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      {open && filtered.length > 0 ? (
        <ul
          id={listId}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[1.125rem] border border-border bg-popover p-1 shadow-[var(--shadow-card)]"
          role="listbox"
        >
          {filtered.map((option, index) => (
            <li
              id={`${listId}-${index}`}
              key={option.id}
              role="option"
              aria-selected={option.id === value}
              className={cn(
                'cursor-pointer rounded-[0.875rem] px-3 py-2 text-sm',
                index === activeIndex || option.id === value
                  ? 'bg-muted text-foreground'
                  : 'text-foreground hover:bg-muted',
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
            >
              <span className="block font-medium">{option.label}</span>
              {option.description ? (
                <small className="block text-xs text-muted-foreground">
                  {option.description}
                </small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
