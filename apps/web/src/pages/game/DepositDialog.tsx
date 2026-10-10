import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eggGroups } from '@poke/data';
import { checkBreedingPair, hatchMinutes, inheritanceRules, isBreedable } from '@poke/game-core';
import type { BreedingError, GameContext } from '@poke/game-core';
import type { DaycareDto, DepositDaycareInput, PokemonDto } from '@poke/shared';
import { Modal, PokemonSprite, ShinyStar, useNow } from '../../components/ui';
import { PokemonTagBadges, TagFilterSelect, useTagFilter } from '../../components/tags';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, isUsable, useInventory, usePokemon } from '../../lib/game';
import { errorText, formatDuration, speciesName } from '../../lib/labels';
import { pillClass } from './LaunchExpeditionDialog';

const GENDER_LABELS = { male: '♂', female: '♀', genderless: '' } as const;

const GENDER_FILTERS = {
  all: 'Tous les sexes',
  male: '♂ Mâles',
  female: '♀ Femelles',
  genderless: 'Asexués',
} as const;
type GenderFilter = keyof typeof GENDER_FILTERS;

const SORTS = {
  dex: 'N° Pokédex',
  level: 'Niveau',
  recent: 'Récents',
  tag: 'Étiquette',
} as const;
type Sort = keyof typeof SORTS;

const EGG_GROUP_NAMES = new Map(eggGroups.map((g) => [g.name, g.nameFr]));
const eggGroupName = (name: string) => EGG_GROUP_NAMES.get(name) ?? name;

function breedingErrorText(ctx: GameContext, e: BreedingError): string {
  switch (e.code) {
    case 'SAME_POKEMON':
      return 'Choisis deux Pokémon différents.';
    case 'NOT_BREEDABLE':
      return `${speciesName(ctx, e.speciesId)} ne peut pas avoir d’œuf.`;
    case 'TWO_DITTOS':
      return 'Deux Métamorph ne peuvent pas avoir d’œuf ensemble.';
    case 'NO_COMMON_EGG_GROUP':
      return 'Aucun groupe d’œufs en commun.';
    case 'INCOMPATIBLE_GENDERS':
      return 'Il faut un mâle et une femelle (ou un Métamorph).';
  }
}

/** Choix d'un couple, de leurs objets tenus, et aperçu de l'œuf avant le dépôt. */
export function DepositDialog({ ctx, onClose }: { ctx: GameContext; onClose: () => void }) {
  const queryClient = useQueryClient();
  const pokemon = usePokemon();
  const inventory = useInventory();
  const [parents, setParents] = useState<[string | null, string | null]>([null, null]);
  const [items, setItems] = useState<[string | null, string | null]>([null, null]);

  const deposit = useMutation({
    mutationFn: (input: DepositDaycareInput) =>
      api<DaycareDto>('/api/daycare', { method: 'POST', json: input }),
    onSuccess: async () => {
      await Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      onClose();
    },
  });

  const now = useNow(10_000);
  const tagFilter = useTagFilter();
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [eggGroup, setEggGroup] = useState('all');
  const [onlyShiny, setOnlyShiny] = useState(false);
  const [sort, setSort] = useState<Sort>('dex');

  const breedable = (pokemon.data ?? []).filter(
    (p) => isUsable(p, now) && isBreedable(ctx.species(p.speciesId, p.formId)!),
  );
  const byId = new Map(breedable.map((p) => [p.id, p]));
  const [a, b] = parents.map((id) => (id ? byId.get(id) : undefined));
  /** Une fois un parent choisi, seuls ses partenaires possibles restent proposés. */
  const partnerOf = a ?? b;
  const groupsInPc = [
    ...new Set(breedable.flatMap((p) => ctx.species(p.speciesId, p.formId)!.eggGroups)),
  ].sort((x, y) => eggGroupName(x).localeCompare(eggGroupName(y)));
  const needle = search.trim().toLowerCase();
  const available = breedable
    .filter(
      (p) =>
        parents.includes(p.id) ||
        ((!partnerOf || checkBreedingPair(ctx, partnerOf, p).ok) &&
          (!needle || speciesName(ctx, p.speciesId, p.formId).toLowerCase().includes(needle)) &&
          (gender === 'all' || p.gender === gender) &&
          (eggGroup === 'all' ||
            ctx.species(p.speciesId, p.formId)!.eggGroups.includes(eggGroup)) &&
          (!onlyShiny || p.isShiny) &&
          tagFilter.matches(p)),
    )
    .sort((x, y) => {
      switch (sort) {
        case 'dex':
          return x.speciesId - y.speciesId || y.level - x.level;
        case 'level':
          return y.level - x.level || x.speciesId - y.speciesId;
        case 'recent':
          return Date.parse(y.caughtAt) - Date.parse(x.caughtAt);
        case 'tag':
          return tagFilter.compare(x, y) || x.speciesId - y.speciesId;
      }
    });
  const check = a && b ? checkBreedingPair(ctx, a, b) : null;
  const owned = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
  const breedingItems = ctx.content.items.filter(
    (i) =>
      (ctx.itemEffect(i.id, 'breedingIvs') || ctx.itemEffect(i.id, 'breedingNature')) &&
      (owned.get(i.id) ?? 0) > 0,
  );
  const rules = inheritanceRules(ctx, items);
  const sameItemTwice = items[0] !== null && items[0] === items[1];
  const notEnough = sameItemTwice && (owned.get(items[0]!) ?? 0) < 2;

  function pick(p: PokemonDto) {
    setParents(([first, second]) => {
      if (first === p.id) return [second, null];
      if (second === p.id) return [first, null];
      if (!first) return [p.id, second];
      return [first, p.id];
    });
  }

  return (
    <Modal open onClose={onClose} wide>
      <h2 className="text-xl font-bold">Déposer un couple</h2>
      <p className="text-sm text-slate-500">
        Choisis deux Pokémon. L’œuf contiendra la forme de base de la mère (ou du parent qui n’est
        pas Métamorph).
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[a, b].map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          >
            {p ? (
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={56}
              />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                ?
              </div>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                {p ? (
                  <>
                    {speciesName(ctx, p.speciesId, p.formId)} {GENDER_LABELS[p.gender]} · N.
                    {p.level}
                  </>
                ) : (
                  `Parent ${i + 1}`
                )}
              </p>
              {p && (
                <p className="text-xs text-slate-500">
                  {ctx.species(p.speciesId, p.formId)!.eggGroups.map(eggGroupName).join(' · ')}
                </p>
              )}
              <select
                className="input mt-1 py-1"
                value={items[i] ?? ''}
                onChange={(e) =>
                  setItems((cur) => {
                    const next: [string | null, string | null] = [...cur];
                    next[i] = e.target.value || null;
                    return next;
                  })
                }
              >
                <option value="">Aucun objet tenu</option>
                {breedingItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} (× {owned.get(item.id)})
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <input
          className="input max-w-44 py-1"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input w-auto py-1"
          value={gender}
          onChange={(e) => setGender(e.target.value as GenderFilter)}
          aria-label="Filtrer par sexe"
        >
          {Object.entries(GENDER_FILTERS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="input w-auto py-1"
          value={eggGroup}
          onChange={(e) => setEggGroup(e.target.value)}
          aria-label="Filtrer par groupe d’œufs"
        >
          <option value="all">Tous les groupes d’œufs</option>
          {groupsInPc.map((g) => (
            <option key={g} value={g}>
              {eggGroupName(g)}
            </option>
          ))}
        </select>
        <TagFilterSelect
          tags={tagFilter.tags}
          value={tagFilter.filter}
          onChange={tagFilter.setFilter}
          className="py-1"
        />
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={onlyShiny}
            onChange={(e) => setOnlyShiny(e.target.checked)}
          />
          Shiny
        </label>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500">Trier par</span>
          {(Object.keys(SORTS) as Sort[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={pillClass(sort === key)}
            >
              {SORTS[key]}
            </button>
          ))}
        </div>
      </div>
      {partnerOf && (
        <p className="mt-2 text-xs text-slate-500">
          Seuls les partenaires compatibles avec{' '}
          {speciesName(ctx, partnerOf.speciesId, partnerOf.formId)}{' '}
          {GENDER_LABELS[partnerOf.gender]} sont affichés.
        </p>
      )}

      <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
        {available.map((p) => {
          const selected = parents.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className={`relative flex flex-col items-center rounded-xl border p-1 text-xs transition ${
                selected
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
              }`}
            >
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={56}
              />
              <span className="truncate">
                {speciesName(ctx, p.speciesId, p.formId)} {GENDER_LABELS[p.gender]}{' '}
                {p.isShiny && <ShinyStar />}
              </span>
              <span className="text-slate-500">N.{p.level}</span>
              <PokemonTagBadges pokemon={p} tags={tagFilter.tags} />
            </button>
          );
        })}
        {available.length === 0 && (
          <p className="col-span-full text-sm text-slate-500">
            {breedable.length === 0
              ? 'Aucun Pokémon disponible et élevable.'
              : 'Aucun Pokémon ne correspond à ces filtres.'}
          </p>
        )}
      </div>

      {check?.ok && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-950/40">
          <PokemonSprite speciesId={check.eggSpeciesId} size={48} />
          <div>
            <p className="font-medium">Œufs de {speciesName(ctx, check.eggSpeciesId)}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Un œuf toutes les {formatDuration(ctx.balance.breeding.eggMinutes)} · éclosion en{' '}
              {formatDuration(hatchMinutes(ctx, check.eggSpeciesId))} · {rules.ivCount} IV hérités
              des parents
              {rules.natureChance.map((chance, i) =>
                chance > 0
                  ? ` · nature du parent ${i + 1}${chance < 1 ? ` (${Math.round(chance * 100)} %)` : ''}`
                  : '',
              )}
            </p>
          </div>
        </div>
      )}
      {check && !check.ok && (
        <ul className="mt-4 space-y-1 text-sm text-red-600">
          {check.errors.map((e) => (
            <li key={e.code}>{breedingErrorText(ctx, e)}</li>
          ))}
        </ul>
      )}
      {notEnough && (
        <p className="mt-2 text-sm text-red-600">Il te faut deux exemplaires de cet objet.</p>
      )}
      {deposit.error && <p className="mt-4 text-sm text-red-600">{errorText(deposit.error)}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
          disabled={!check?.ok || notEnough || deposit.isPending}
          onClick={() =>
            deposit.mutate({
              parentAId: parents[0]!,
              parentBId: parents[1]!,
              heldItemAId: items[0],
              heldItemBId: items[1],
            })
          }
        >
          Déposer
        </button>
      </div>
    </Modal>
  );
}
