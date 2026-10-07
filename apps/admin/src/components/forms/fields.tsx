import { useId } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

/**
 * Champs de formulaire guidés : libellé, unité, bornes, message d'erreur.
 * La validation vient des schémas Zod partagés avec le serveur.
 */

export type FieldErrors = ReadonlyMap<string, string>;

/** Valide une valeur avec un schéma et indexe les erreurs par chemin (`encounters.0.weight`). */
export function validate<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  const errors = new Map<string, string>();
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (!errors.has(path)) errors.set(path, issue.message);
    }
  }
  return { valid: result.success, errors: errors as FieldErrors, data: result.data };
}

/** Erreurs dont le chemin commence par `prefix` (pour un sous-formulaire). */
export function errorsUnder(errors: FieldErrors, prefix: string): string[] {
  return [...errors].filter(([p]) => p === prefix || p.startsWith(`${prefix}.`)).map(([, m]) => m);
}

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  disabled,
  placeholder,
  multiline = false,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  return multiline ? (
    <textarea
      className="input min-h-20"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  ) : (
    <input
      className="input"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Texte optionnel : une chaîne vide devient `null`. */
export function NullableTextInput({
  value,
  onChange,
  ...rest
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <TextInput value={value ?? ''} onChange={(v) => onChange(v.trim() ? v : null)} {...rest} />
  );
}

/**
 * Nombre borné avec unité. `scale` adapte l'affichage (ex. 100 pour saisir 5 % au lieu de 0.05).
 * Un champ vidé donne NaN, signalé par la validation Zod.
 */
export function NumberInput({
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  scale = 1,
  disabled,
  className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  scale?: number;
  disabled?: boolean;
  className?: string;
}) {
  const shown = Number.isFinite(value) ? Number((value * scale).toPrecision(12)) : '';
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="number"
        className="input"
        value={shown}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.valueAsNumber / scale)}
      />
      {unit && <span className="shrink-0 text-xs text-slate-500">{unit}</span>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <span className="flex items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
    </span>
  );
}

export function SelectInput<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      className="input"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="card space-y-4">
      <legend className="sr-only">{title}</legend>
      <h2 className="font-semibold">{title}</h2>
      {children}
    </fieldset>
  );
}

/** Nombre optionnel : un champ vide donne `null` (valeur par défaut affichée en indication). */
export function NullableNumberInput({
  value,
  onChange,
  placeholder,
  ...rest
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${rest.className ?? ''}`}>
      <input
        type="number"
        className="input"
        value={value ?? ''}
        min={rest.min}
        max={rest.max}
        placeholder={placeholder}
        disabled={rest.disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
      />
      {rest.unit && <span className="shrink-0 text-xs text-slate-500">{rest.unit}</span>}
    </div>
  );
}
