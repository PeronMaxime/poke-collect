/**
 * Petites pièces des sélecteurs de Pokémon (équipe, PC, pension, vitrine) : filtre par type, recherche
 * par nom, bouton de sélection automatique, pastilles de filtre et règle « un seul Méga par équipe ».
 */
import { types } from '@poke/data';
import { MAX_MEGAS_PER_TEAM, isMegaForm, megaCount } from '@poke/game-core';
import { searchKey } from '@poke/shared';
import type { PokemonDto } from '@poke/shared';
import { typeLabel } from '../../../lib/labels';

/** Types de Pokémon, sans les types techniques des données (Stellaire, ???, Obscur). */
const NON_POKEMON_TYPES = new Set(['stellar', 'unknown', 'shadow']);
const POKEMON_TYPES = types.filter((t) => !NON_POKEMON_TYPES.has(t.name));

/** Filtre par type (sélecteurs d'équipe, PC) : `all` ou le nom d'un type. */
export function TypeFilterSelect({
  value,
  onChange,
  className = 'ml-1 py-0.5 text-xs',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select
      className={`input w-auto ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrer par type"
    >
      <option value="all">Tous les types</option>
      {POKEMON_TYPES.map((t) => (
        <option key={t.name} value={t.name}>
          {typeLabel(t.name)}
        </option>
      ))}
    </select>
  );
}

/** Recherche par nom, insensible à la casse et aux accents (« evoli » trouve « Évoli »). */
export function nameMatcher(search: string) {
  const needle = searchKey(search.trim());
  return (name: string) => !needle || searchKey(name).includes(needle);
}

/** Champ de recherche par nom des sélecteurs d'équipe. */
export function NameSearch({
  value,
  onChange,
  className = 'ml-1 w-32 py-0.5 text-xs',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      type="search"
      className={`input ${className}`}
      placeholder="Rechercher un Pokémon…"
      aria-label="Rechercher par nom"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Bouton « Sélection auto » : les plus forts en affinité, puis les plus forts sans affinité
 * (types requis servis d'abord). Grisé sans Pokémon disponible.
 */
export function AutoSelectButton({
  onClick,
  disabled = false,
  className = 'btn-ghost',
  label = '⚡ Sélection auto',
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title="Choisir d’un clic les Pokémon les plus forts en affinité, puis les plus forts sans affinité (types requis compris)"
    >
      {label}
    </button>
  );
}

/**
 * Un seul Pokémon Méga-Évolué par équipe : une fois l'un choisi, les autres sont grisés.
 * `members` = membres déjà choisis.
 */
export function megaLocked(p: PokemonDto, members: readonly PokemonDto[]): boolean {
  return (
    isMegaForm(p.formId) &&
    !members.some((m) => m.id === p.id) &&
    megaCount(members) >= MAX_MEGAS_PER_TEAM
  );
}

export const MEGA_LOCKED_TITLE = 'Un seul Pokémon Méga-Évolué par équipe';

/** Pastille de choix allumée ou non (simulateur de l'admin). */
export const pillClass = (active: boolean) =>
  `rounded-full px-2 py-0.5 ${
    active
      ? 'bg-brand-500 text-white'
      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
  }`;

/** Filtre allumé ou non de la barre de recherche (♥ Favoris, ✦ Talent actif…). */
export const filterPill = (active: boolean) =>
  `rounded-full border-2 px-2.5 py-0.5 text-sm whitespace-nowrap transition ${
    active
      ? 'border-ink bg-[#48a8e8] font-semibold text-[#10203a]'
      : 'border-well-line text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
  }`;
