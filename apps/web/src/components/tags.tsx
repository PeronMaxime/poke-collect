import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TAG_LABEL_MAX } from '@poke/shared';
import type { PokemonDto, PokemonTagDto, TagInput } from '@poke/shared';
import { api } from '../lib/api';
import { keys, usePokemon, useTags } from '../lib/game';
import { errorText } from '../lib/labels';
import { Modal } from './ui';

/** Étiquettes du joueur : badge, filtre, tri et gestion (PC, fiche, équipes d'expédition et de combat). */

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
  '#1e293b',
];

/** Texte sombre sur fond clair, clair sur fond sombre (luminance relative WCAG). */
function textColor(background: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(background.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4 ? '#0f172a' : '#ffffff';
}

export function TagBadge({ tag, className = '' }: { tag: PokemonTagDto; className?: string }) {
  return (
    <span
      className={`inline-block max-w-full truncate rounded px-1 text-[10px] leading-4 font-semibold ${className}`}
      style={{ backgroundColor: tag.color, color: textColor(tag.color) }}
      title={`Étiquette : ${tag.label}`}
    >
      {tag.label}
    </span>
  );
}

/** Étiquette d'un Pokémon, s'il en porte une. */
export function PokemonTagBadge({
  pokemon,
  tags,
  className,
}: {
  pokemon: Pick<PokemonDto, 'tagId'>;
  tags: readonly PokemonTagDto[];
  className?: string;
}) {
  const tag = pokemon.tagId ? tags.find((t) => t.id === pokemon.tagId) : undefined;
  return tag ? <TagBadge tag={tag} className={className} /> : null;
}

/** `all` = tous les Pokémon, `none` = sans étiquette, sinon l'identifiant d'une étiquette. */
export type TagFilter = 'all' | 'none' | (string & {});

/** Filtre d'étiquette (revient à « toutes » si l'étiquette choisie a été supprimée). */
export function useTagFilter() {
  const tags = useTags().data ?? [];
  const [selected, setFilter] = useState<TagFilter>('all');
  const filter =
    selected === 'all' || selected === 'none' || tags.some((t) => t.id === selected)
      ? selected
      : 'all';
  const matches = (p: Pick<PokemonDto, 'tagId'>) =>
    filter === 'all' || (filter === 'none' ? p.tagId === null : p.tagId === filter);
  /** Comparaison pour le tri : ordre des étiquettes, Pokémon sans étiquette à la fin. */
  const compare = (a: Pick<PokemonDto, 'tagId'>, b: Pick<PokemonDto, 'tagId'>) => {
    const rank = (p: Pick<PokemonDto, 'tagId'>) => {
      const i = tags.findIndex((t) => t.id === p.tagId);
      return i < 0 ? tags.length : i;
    };
    return rank(a) - rank(b);
  };
  return { tags, filter, setFilter, matches, compare };
}

export function TagFilterSelect({
  tags,
  value,
  onChange,
  className = '',
}: {
  tags: readonly PokemonTagDto[];
  value: TagFilter;
  onChange: (value: TagFilter) => void;
  className?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <select
      className={`input w-auto ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrer par étiquette"
    >
      <option value="all">Toutes les étiquettes</option>
      <option value="none">Sans étiquette</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

/** Choix de l'étiquette d'un Pokémon, dans sa fiche. */
export function TagPicker({ pokemon: p }: { pokemon: PokemonDto }) {
  const queryClient = useQueryClient();
  const tags = useTags().data ?? [];
  const assign = useMutation({
    mutationFn: (tagId: string | null) =>
      api<PokemonDto>(`/api/pokemon/${p.id}`, { method: 'PATCH', json: { tagId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.pokemon }),
  });
  if (tags.length === 0) {
    return (
      <p className="mt-3 text-xs text-slate-500">
        Crée des étiquettes depuis le bouton « Étiquettes » du PC pour classer tes Pokémon.
      </p>
    );
  }
  const choice = (active: boolean) =>
    `rounded transition ${active ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900' : 'opacity-60 hover:opacity-100'}`;

  return (
    <div className="mt-3 w-full text-left">
      <p className="mb-1 text-xs text-slate-500">Étiquette</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={assign.isPending}
          onClick={() => assign.mutate(null)}
          className={`${choice(p.tagId === null)} border border-dashed border-slate-400 px-1 text-[10px] leading-4 text-slate-500`}
        >
          Aucune
        </button>
        {tags.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={assign.isPending}
            onClick={() => assign.mutate(t.id)}
            className={choice(p.tagId === t.id)}
          >
            <TagBadge tag={t} className="text-xs" />
          </button>
        ))}
      </div>
      {assign.error && <p className="mt-1 text-xs text-red-600">{errorText(assign.error)}</p>}
    </div>
  );
}

/** Fenêtre de gestion des étiquettes : création, modification, suppression. */
export function TagManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const tags = useTags().data ?? [];
  const pokemon = usePokemon().data ?? [];
  // null = formulaire de création, sinon l'étiquette en cours de modification.
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: TagInput }) =>
      id
        ? api<PokemonTagDto>(`/api/tags/${id}`, { method: 'PUT', json: input })
        : api<PokemonTagDto>('/api/tags', { method: 'POST', json: input }),
    onSuccess: () => {
      setEditing(null);
      return queryClient.invalidateQueries({ queryKey: keys.tags });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/api/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirmDelete(null);
      setEditing(null);
      return Promise.all(
        [keys.tags, keys.pokemon].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
  const editedTag = tags.find((t) => t.id === editing);

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-xl font-bold">Étiquettes</h2>
      <p className="text-sm text-slate-500">
        Colle une étiquette sur tes Pokémon depuis leur fiche, puis filtre-les ou trie-les dans le
        PC et au départ des expéditions et des combats.
      </p>

      <ul className="mt-4 space-y-2">
        {tags.map((t) => {
          const used = pokemon.filter((p) => p.tagId === t.id).length;
          return (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <TagBadge tag={t} className="text-sm leading-6 px-2" />
              <span className="flex-1 text-xs text-slate-500">{used} Pokémon</span>
              {confirmDelete === t.id ? (
                <>
                  <span className="text-xs text-red-600">Supprimer ?</span>
                  <button
                    className="btn-danger py-1"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(t.id)}
                  >
                    Oui
                  </button>
                  <button className="btn-ghost py-1" onClick={() => setConfirmDelete(null)}>
                    Non
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-ghost py-1" onClick={() => setEditing(t.id)}>
                    Modifier
                  </button>
                  <button className="btn-ghost py-1" onClick={() => setConfirmDelete(t.id)}>
                    Supprimer
                  </button>
                </>
              )}
            </li>
          );
        })}
        {tags.length === 0 && <li className="text-sm text-slate-500">Aucune étiquette.</li>}
      </ul>
      {remove.error && <p className="mt-2 text-sm text-red-600">{errorText(remove.error)}</p>}

      <TagForm
        key={editing ?? 'new'}
        tag={editedTag}
        pending={save.isPending}
        error={save.error}
        onCancel={editedTag ? () => setEditing(null) : undefined}
        onSubmit={(input) => save.mutate({ id: editedTag?.id ?? null, input })}
      />

      <div className="mt-6 flex justify-end">
        <button className="btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}

function TagForm({
  tag,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  tag: PokemonTagDto | undefined;
  pending: boolean;
  error: unknown;
  onCancel?: () => void;
  onSubmit: (input: TagInput) => void;
}) {
  const [label, setLabel] = useState(tag?.label ?? '');
  const [color, setColor] = useState(tag?.color ?? PRESET_COLORS[5]!);
  const trimmed = label.trim();

  return (
    <form
      className="mt-5 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSubmit({ label: trimmed, color });
      }}
    >
      <p className="mb-2 text-sm font-medium">
        {tag ? 'Modifier l’étiquette' : 'Nouvelle étiquette'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-40"
          placeholder="Texte"
          maxLength={TAG_LABEL_MAX}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Texte de l’étiquette"
        />
        <span className="text-xs text-slate-500">
          {label.length} / {TAG_LABEL_MAX}
        </span>
        <TagBadge
          tag={{ id: '', label: trimmed || 'Aperçu', color }}
          className="ml-auto px-2 text-sm leading-6"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`h-6 w-6 rounded-full border border-slate-300 dark:border-slate-700 ${
              color === c ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900' : ''
            }`}
            style={{ backgroundColor: c }}
            aria-label={`Couleur ${c}`}
          />
        ))}
        <label className="ml-1 flex items-center gap-1 text-xs text-slate-500">
          Autre
          <input
            type="color"
            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
      </div>
      {!!error && <p className="mt-2 text-sm text-red-600">{errorText(error)}</p>}
      <div className="mt-3 flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Annuler
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={!trimmed || pending}>
          {tag ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </form>
  );
}
