import type { ReactNode } from 'react';

type FormFieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
};

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: FormFieldProps) {
  return (
    <div className="form-field">
      <label htmlFor={htmlFor}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
