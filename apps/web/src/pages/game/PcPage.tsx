import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { STAT_NAMES } from '@poke/data';
import type { StatName } from '@poke/data';
import {
  MAX_IV,
  MAX_LEVEL,
  candiesToMaxLevel,
  computeStats,
  expeditionPower,
  getNature,
  isKnockedOut,
  isRegionalSpecies,
  itemUseOptions,
  lineageId,
  pokemonPower,
  transferCandies,
  xpForLevel,
} from '@poke/game-core';
import type { EvolutionCheck, EvolutionOption, GameContext } from '@poke/game-core';
import type {
  EvolveResponse,
  PokemonActivity,
  PokemonDto,
  TransferPokemonResponse,
  UseItemInput,
  UseItemResponse,
} from '@poke/shared';
import {
  Modal,
  PokemonSprite,
  ProgressBar,
  ShinySparkles,
  ShinyStar,
  TypeBadge,
  useNow,
} from '../../components/ui';
import {
  PokemonTagBadge,
  TagFilterSelect,
  TagManagerDialog,
  TagPicker,
  useTagFilter,
} from '../../components/tags';
import { api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  isUsable,
  keys,
  useCandies,
  useEvolutionChecker,
  useInventory,
  usePlayerProgress,
  usePokemon,
  useTags,
  utcOffsetMinutes,
} from '../../lib/game';
import {
  STAT_LABELS,
  abilityLabel,
  candyName,
  effectText,
  errorText,
  evolutionMethodText,
  formatCountdown,
  itemIcon,
  itemName,
  natureLabel,
  requirementText,
  speciesName,
} from '../../lib/labels';
import { EvolutionReveal } from './EvolutionReveal';
import { RegionTabs, currentRegionTab } from './RegionTabs';

type Sort = 'recent' | 'level' | 'power' | 'dex' | 'tag';

const SORTS: Record<Sort, string> = {
  recent: 'Plus récents',
  level: 'Niveau',
  power: 'PE',
  dex: 'N° Pokédex',
  tag: 'Étiquette',
};

const ORIGIN_LABELS: Record<PokemonDto['origin'], string> = {
  starter: 'Starter',
  capture: 'Capturé',
  egg: 'Éclos',
  quest: 'Récompense de quête',
  fossil: 'Fossile restauré',
};

/** Onglet de tout le PC, avant les onglets de région (Pokédex régional de chaque espèce). */
const ALL_TAB = { id: '__tous', label: 'Tous' };

const GENDER_LABELS = { male: '♂', female: '♀', genderless: '' } as const;

const ACTIVITY_LABELS: Record<PokemonActivity, string> = {
  expedition: 'En route',
  battle: 'Combat',
  daycare: 'Pension',
};

/** Pastille « K.O. » avec le temps de repos restant. */
export function KoBadge({ koUntil, now }: { koUntil: string | null; now: number }) {
  if (!isKnockedOut(koUntil, now)) return null;
  return (
    <span
      className="rounded bg-red-100 px-1 font-mono text-[10px] text-red-700 dark:bg-red-950 dark:text-red-300"
      title="K.O. après une défaite : indisponible jusqu’à la fin du repos"
    >
      K.O. {formatCountdown(Date.parse(koUntil!) - now)}
    </span>
  );
}

const canTransfer = (p: PokemonDto) => !p.locked && !p.busy;

/**
 * Doublons à transférer : pour chaque espèce (et forme), on garde le Pokémon de plus forte PE,
 * les favoris, les shiny et les Pokémon occupés ; tous les autres sont proposés.
 */
function duplicates(ctx: GameContext, list: readonly PokemonDto[]): string[] {
  const bySpecies = new Map<string, PokemonDto[]>();
  for (const p of list) {
    const key = `${p.speciesId}:${p.formId ?? ''}`;
    bySpecies.set(key, [...(bySpecies.get(key) ?? []), p]);
  }
  const ids: string[] = [];
  for (const group of bySpecies.values()) {
    if (group.length < 2) continue;
    const species = ctx.species(group[0]!.speciesId, group[0]!.formId)!;
    const best = group.reduce((x, y) =>
      pokemonPower(species, y) > pokemonPower(species, x) ? y : x,
    );
    for (const p of group) if (p !== best && canTransfer(p) && !p.isShiny) ids.push(p.id);
  }
  return ids;
}

export function PcPage({ ctx }: { ctx: GameContext }) {
  const pokemon = usePokemon();
  const now = useNow();
  const evolutionsOf = useEvolutionChecker(ctx);
  const progress = usePlayerProgress();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyShiny, setOnlyShiny] = useState(false);
  const tagFilter = useTagFilter();
  const [tagsOpen, setTagsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transferMode, setTransferMode] = useState(false);
  const [toTransfer, setToTransfer] = useState<Set<string>>(new Set());
  const [transferResult, setTransferResult] = useState<TransferPokemonResponse | null>(null);
  const queryClient = useQueryClient();
  const transfer = useMutation({
    mutationFn: (ids: string[]) =>
      api<TransferPokemonResponse>('/api/pokemon/transfer', { method: 'POST', json: { ids } }),
    onSuccess: (data) => {
      setTransferResult(data);
      setToTransfer(new Set());
      setTransferMode(false);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const list = (pokemon.data ?? []).map((p) => ({
    p,
    species: ctx.species(p.speciesId, p.formId),
    power: pokemonPower(ctx.species(p.speciesId, p.formId)!, p),
  }));
  const tab = currentRegionTab(ctx, progress, selectedRegion ?? ALL_TAB.id, [ALL_TAB]);
  const needle = search.trim().toLowerCase();
  const inTab = list.filter(
    ({ p }) => tab === ALL_TAB.id || isRegionalSpecies(ctx, tab, p.speciesId),
  );
  const tabPokemon = inTab.map(({ p }) => p);
  const filtered = inTab
    .filter(({ species }) => !needle || species?.nameFr.toLowerCase().includes(needle))
    .filter(({ p }) => (!onlyFavorites || p.locked) && (!onlyShiny || p.isShiny))
    .filter(({ p }) => tagFilter.matches(p))
    .sort((a, b) => {
      switch (sort) {
        case 'recent':
          return Date.parse(b.p.caughtAt) - Date.parse(a.p.caughtAt);
        case 'level':
          return b.p.level - a.p.level;
        case 'power':
          return b.power - a.power;
        case 'dex':
          return a.p.speciesId - b.p.speciesId;
        case 'tag':
          return tagFilter.compare(a.p, b.p) || b.power - a.power;
      }
    });
  const selected = pokemon.data?.find((p) => p.id === selectedId);
  const transferList = (pokemon.data ?? []).filter((p) => toTransfer.has(p.id));
  const candiesGained = transferList.reduce((sum, p) => sum + transferCandies(ctx, p), 0);

  function toggleTransfer(p: PokemonDto) {
    if (!canTransfer(p)) return;
    setToTransfer((cur) => {
      const next = new Set(cur);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  }

  return (
    <div>
      {ctx.regions.length > 1 && (
        <div className="mb-4">
          <RegionTabs
            ctx={ctx}
            progress={progress}
            selected={tab}
            onSelect={setSelectedRegion}
            leading={[ALL_TAB]}
          />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-56"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input w-auto"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={onlyFavorites}
            onChange={(e) => setOnlyFavorites(e.target.checked)}
          />
          Favoris
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={onlyShiny}
            onChange={(e) => setOnlyShiny(e.target.checked)}
          />
          Shiny
        </label>
        <TagFilterSelect
          tags={tagFilter.tags}
          value={tagFilter.filter}
          onChange={tagFilter.setFilter}
        />
        <span className="ml-auto text-sm text-slate-500">
          {tab === ALL_TAB.id ? list.length : `${filtered.length} / ${list.length}`} Pokémon
        </span>
        <button className="btn-ghost" onClick={() => setTagsOpen(true)}>
          Étiquettes
        </button>
        <button
          className={transferMode ? 'btn-primary' : 'btn-ghost'}
          onClick={() => {
            setTransferMode(!transferMode);
            setToTransfer(new Set());
            setTransferResult(null);
          }}
        >
          {transferMode ? 'Terminer' : 'Transférer…'}
        </button>
      </div>

      {transferMode && (
        <div className="card mb-4 flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="flex-1">
            Touche les Pokémon à transférer contre des Bonbons de lignée (favoris et Pokémon occupés
            exclus). <strong>{toTransfer.size}</strong> sélectionné(s), +{candiesGained} Bonbon
            {candiesGained > 1 ? 's' : ''}.
          </span>
          <button
            className="btn-ghost"
            onClick={() => setToTransfer(new Set(duplicates(ctx, tabPokemon)))}
          >
            Sélectionner les doublons
          </button>
          <button
            className="btn-danger"
            disabled={toTransfer.size === 0 || transfer.isPending}
            onClick={() => transfer.mutate([...toTransfer])}
          >
            Transférer ({toTransfer.size})
          </button>
          {transfer.error && <p className="w-full text-red-600">{errorText(transfer.error)}</p>}
        </div>
      )}
      {transferResult && (
        <p className="mb-4 text-sm text-emerald-600">
          {transferResult.transferred} Pokémon transféré(s) :{' '}
          {transferResult.gained
            .map((g) => `${g.quantity} × ${candyName(ctx, g.lineageId)}`)
            .join(', ')}
          .
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {filtered.map(({ p, species, power }) => (
          <button
            key={p.id}
            type="button"
            onClick={() => (transferMode ? toggleTransfer(p) : setSelectedId(p.id))}
            className={`card relative flex flex-col items-center p-2 text-xs transition hover:-translate-y-0.5 ${
              transferMode && toTransfer.has(p.id) ? 'ring-2 ring-red-500' : ''
            } ${transferMode && !canTransfer(p) ? 'opacity-40' : ''}`}
          >
            {p.locked && <span className="absolute top-1.5 left-2 text-amber-500">♥</span>}
            <span className="absolute top-1.5 right-2 flex flex-col items-end gap-0.5">
              {p.activity && (
                <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  {ACTIVITY_LABELS[p.activity]}
                </span>
              )}
              <KoBadge koUntil={p.koUntil} now={now} />
              {evolutionsOf(p).some((e) => e.method) && (
                <span
                  className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  title="Peut évoluer"
                >
                  Évol. ↑
                </span>
              )}
            </span>
            <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={72} />
            <span className="truncate font-medium">
              {species?.nameFr} {p.isShiny && <ShinyStar />}
            </span>
            <span className="text-slate-500">
              N.{p.level} · PE {power}
            </span>
            <PokemonTagBadge pokemon={p} tags={tagFilter.tags} className="mt-0.5" />
          </button>
        ))}
      </div>
      {filtered.length === 0 && !pokemon.isPending && (
        <p className="text-sm text-slate-500">Aucun Pokémon ne correspond.</p>
      )}

      <TagManagerDialog open={tagsOpen} onClose={() => setTagsOpen(false)} />
      <Modal open={!!selected} onClose={() => setSelectedId(null)} wide>
        {selected && (
          <PokemonDetail ctx={ctx} pokemon={selected} evolutions={evolutionsOf(selected)} />
        )}
      </Modal>
    </div>
  );
}

function KoDetail({ koUntil }: { koUntil: string | null }) {
  const now = useNow();
  if (!isKnockedOut(koUntil, now)) return null;
  return (
    <p className="mt-1 text-sm text-red-600">
      K.O. : au repos encore {formatCountdown(Date.parse(koUntil!) - now)}
    </p>
  );
}

function PokemonDetail({
  ctx,
  pokemon: p,
  evolutions,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  evolutions: EvolutionCheck[];
}) {
  const queryClient = useQueryClient();
  const tags = useTags().data ?? [];
  const [reveal, setReveal] = useState<EvolveResponse | null>(null);
  const evolve = useMutation({
    mutationFn: ({ toSpeciesId, toFormId }: Pick<EvolutionOption, 'toSpeciesId' | 'toFormId'>) =>
      api<EvolveResponse>(`/api/pokemon/${p.id}/evolve`, {
        method: 'POST',
        json: { toSpeciesId, toFormId, utcOffsetMinutes: utcOffsetMinutes() },
      }),
    onSuccess: (data) => {
      setReveal(data);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
  const species = ctx.species(p.speciesId, p.formId)!;
  const stats = computeStats(species, p);
  const nature = getNature(p.nature);
  const levelXp = xpForLevel(species.growthRate, p.level);
  const nextXp = xpForLevel(species.growthRate, Math.min(MAX_LEVEL, p.level + 1));
  const ivTotal = STAT_NAMES.reduce((sum, s) => sum + p.ivs[s], 0);

  const toggleLock = useMutation({
    mutationFn: () =>
      api<PokemonDto>(`/api/pokemon/${p.id}`, { method: 'PATCH', json: { locked: !p.locked } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.pokemon }),
  });

  const candies = useCandies();
  const lineage = lineageId(ctx, p.speciesId);
  const ownedCandies = candies.data?.find((c) => c.lineageId === lineage)?.quantity ?? 0;
  const usefulCandies = Math.min(ownedCandies, candiesToMaxLevel(ctx, p));
  const [candyCount, setCandyCount] = useState(1);
  const feed = useMutation({
    mutationFn: (count: number) =>
      api<PokemonDto>(`/api/pokemon/${p.id}/candies`, { method: 'POST', json: { count } }),
    onSuccess: () =>
      Promise.all(
        [keys.pokemon, keys.candies].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  if (reveal) {
    return <EvolutionReveal ctx={ctx} data={reveal} onDone={() => setReveal(null)} />;
  }

  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          {p.isShiny && <ShinySparkles loop radius={110} />}
          <PokemonSprite
            speciesId={p.speciesId}
            formId={p.formId}
            shiny={p.isShiny}
            kind="artwork"
            size={180}
          />
        </div>
        <h2 className="mt-2 text-xl font-bold">
          {species.nameFr} <span className="text-slate-400">{GENDER_LABELS[p.gender]}</span>{' '}
          {p.isShiny && <ShinyStar />}
        </h2>
        <p className="text-sm text-slate-500">
          N° {String(p.speciesId).padStart(3, '0')} · Niveau {p.level}
        </p>
        <PokemonTagBadge pokemon={p} tags={tags} className="mt-1 px-2 text-xs leading-5" />
        <KoDetail koUntil={p.koUntil} />
        <div className="mt-2 flex gap-1">
          {species.types.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </div>
        <button
          className="btn-ghost mt-4"
          disabled={toggleLock.isPending}
          onClick={() => toggleLock.mutate()}
        >
          {p.locked ? '♥ Retirer des favoris' : '♡ Ajouter aux favoris'}
        </button>
        <TagPicker pokemon={p} />

        {lineage !== undefined && (
          <div className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-left text-xs dark:border-slate-800">
            <p className="font-medium">
              {candyName(ctx, lineage)} : {ownedCandies}
            </p>
            <p className="text-slate-500">{ctx.balance.transfer.xpPerCandy} XP par Bonbon.</p>
            {usefulCandies > 0 && (
              <div className="mt-2 flex items-center gap-1">
                <input
                  type="number"
                  className="input w-20 py-1"
                  min={1}
                  max={usefulCandies}
                  value={Math.min(candyCount, usefulCandies)}
                  onChange={(e) => setCandyCount(Math.max(1, Number(e.target.value) || 1))}
                />
                <button
                  className="btn-ghost py-1"
                  disabled={feed.isPending}
                  onClick={() => feed.mutate(Math.min(candyCount, usefulCandies))}
                >
                  Donner
                </button>
              </div>
            )}
            {feed.error && <p className="mt-1 text-red-600">{errorText(feed.error)}</p>}
          </div>
        )}
      </div>

      <div className="space-y-4 text-sm">
        <EvolutionPanel
          ctx={ctx}
          pokemon={p}
          evolutions={evolutions}
          pending={evolve.isPending}
          error={evolve.error}
          onEvolve={(option) => evolve.mutate(option)}
        />
        <ItemUsePanel ctx={ctx} pokemon={p} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-slate-500">Nature</dt>
          <dd>
            {natureLabel(p.nature)}
            {nature?.increasedStat && nature.increasedStat !== nature.decreasedStat && (
              <span className="text-xs text-slate-500">
                {' '}
                (+{STAT_LABELS[nature.increasedStat]}, −{STAT_LABELS[nature.decreasedStat!]})
              </span>
            )}
            {p.originalNature && (
              <span className="block text-xs text-slate-500">
                Aromate · d’origine {natureLabel(p.originalNature)}
              </span>
            )}
          </dd>
          <dt className="text-slate-500">Talent</dt>
          <dd>
            {abilityLabel(p.ability)}
            {species.abilities.find((a) => a.name === p.ability)?.isHidden && (
              <span className="ml-1 text-xs text-violet-600">(caché)</span>
            )}
          </dd>
          <dt className="text-slate-500">Puissance (PE)</dt>
          <dd className="font-semibold">{expeditionPower(stats)}</dd>
          <dt className="text-slate-500">Bonheur</dt>
          <dd>{p.happiness} / 255</dd>
          <dt className="text-slate-500">Origine</dt>
          <dd>
            {ORIGIN_LABELS[p.origin]}
            {p.originRegion && ` · ${ctx.region(p.originRegion)?.name ?? p.originRegion}`}
          </dd>
          <dt className="text-slate-500">Obtenu le</dt>
          <dd>
            {new Date(p.caughtAt).toLocaleString('fr-FR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </dd>
        </dl>

        <div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>
              XP {p.xp - levelXp} / {nextXp - levelXp}
            </span>
            <span>{p.level >= MAX_LEVEL ? 'Niveau max' : `→ N.${p.level + 1}`}</span>
          </div>
          <ProgressBar value={p.level >= MAX_LEVEL ? 1 : (p.xp - levelXp) / (nextXp - levelXp)} />
        </div>

        <table className="w-full text-left">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1 font-normal">Stat</th>
              <th className="py-1 font-normal">Base</th>
              <th className="py-1 font-normal">IV</th>
              <th className="py-1 text-right font-normal">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {STAT_NAMES.map((s) => {
              const up = nature?.increasedStat === s && nature.decreasedStat !== s;
              const down = nature?.decreasedStat === s && nature.increasedStat !== s;
              return (
                <tr key={s} className="border-t border-slate-100 dark:border-slate-800">
                  <td className={`py-1 ${up ? 'text-red-600' : down ? 'text-sky-600' : ''}`}>
                    {STAT_LABELS[s]}
                  </td>
                  <td className="py-1 text-slate-500">{species.baseStats[s]}</td>
                  <td className="py-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 ${p.ivs[s] === MAX_IV ? 'font-bold text-amber-600' : ''}`}
                      >
                        {p.ivs[s]}
                      </span>
                      <ProgressBar className="w-20" value={p.ivs[s] / MAX_IV} />
                    </div>
                  </td>
                  <td className="py-1 text-right font-mono">{stats[s]}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="text-xs text-slate-500">
            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-1">Total</td>
              <td />
              <td className="py-1">
                {ivTotal} / {MAX_IV * 6}
              </td>
              <td className="py-1 text-right font-mono">{expeditionPower(stats)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Évolutions du Pokémon : conditions de chaque méthode, bouton quand l'une est remplie. */
function EvolutionPanel({
  ctx,
  pokemon: p,
  evolutions,
  pending,
  error,
  onEvolve,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  evolutions: EvolutionCheck[];
  pending: boolean;
  error: unknown;
  onEvolve: (option: EvolutionOption) => void;
}) {
  const now = useNow();
  if (evolutions.length === 0) return null;
  const usable = isUsable(p, now);

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="mb-2 font-medium">Évolution</p>
      <ul className="space-y-2">
        {evolutions.map(({ option, method, methods }) => (
          <li
            key={`${option.toSpeciesId}:${option.toFormId ?? ''}`}
            className="flex items-center gap-3"
          >
            <PokemonSprite
              speciesId={option.toSpeciesId}
              formId={option.toFormId}
              shiny={p.isShiny}
              size={48}
              silhouette={!method}
            />
            <div className="min-w-0 flex-1 text-xs">
              <p className="text-sm font-medium">
                {speciesName(ctx, option.toSpeciesId, option.toFormId)}
              </p>
              {methods.length === 0 && (
                <p className="text-slate-500">Pas encore possible dans le jeu.</p>
              )}
              {methods.map(({ method: m, missing }, i) => (
                <p
                  key={i}
                  className={`flex flex-wrap items-center gap-1 ${
                    missing.length === 0 ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                >
                  {m.itemId && <img src={itemIcon(ctx, m.itemId)} alt="" width={18} height={18} />}
                  <span>
                    {i > 0 && 'ou '}
                    {evolutionMethodText(ctx, m)}
                  </span>
                  {missing.length > 0 && (
                    <span className="text-slate-400">
                      — manque : {missing.map((r) => requirementText(ctx, r)).join(', ')}
                    </span>
                  )}
                </p>
              ))}
            </div>
            {method && (
              <button
                className="btn-primary shrink-0 py-1"
                disabled={pending || !usable}
                title={usable ? undefined : 'Le Pokémon doit être disponible (ni occupé, ni K.O.)'}
                onClick={() => onEvolve(option)}
              >
                Faire évoluer
              </button>
            )}
          </li>
        ))}
      </ul>
      {!!error && <p className="mt-2 text-xs text-red-600">{errorText(error)}</p>}
    </div>
  );
}

/**
 * Objets endgame du sac utilisables sur ce Pokémon (Capsules, Aromates, Pilule / Patch Talent) :
 * le serveur vérifie de nouveau et consomme l'objet.
 */
function ItemUsePanel({ ctx, pokemon: p }: { ctx: GameContext; pokemon: PokemonDto }) {
  const queryClient = useQueryClient();
  const inventory = useInventory();
  const [stat, setStat] = useState<StatName | ''>('');
  const [abilities, setAbilities] = useState<Record<string, string>>({});
  const use = useMutation({
    mutationFn: (input: UseItemInput) =>
      api<UseItemResponse>(`/api/pokemon/${p.id}/use-item`, { method: 'POST', json: input }),
    onSuccess: () => {
      setStat('');
      return Promise.all(
        [keys.pokemon, keys.inventory].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const target = { ...p, originalNature: p.originalNature ?? p.nature };
  const items = (inventory.data ?? [])
    .filter((i) => i.quantity > 0)
    .flatMap((i) => {
      const options = itemUseOptions(ctx, target, i.itemId);
      return options ? [{ ...i, options }] : [];
    });
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="mb-2 font-medium">Objets</p>
      <ul className="space-y-2">
        {items.map(({ itemId, quantity, options }) => {
          const { effect } = options;
          const needsStat = effect.type === 'ivCap' && !effect.all;
          const ability = abilities[itemId] ?? options.abilities[0];
          const ready = options.usable && (!needsStat || stat !== '');
          return (
            <li key={itemId} className="flex flex-wrap items-center gap-2 text-xs">
              <img src={itemIcon(ctx, itemId)} alt="" width={24} height={24} />
              <div className="min-w-32 flex-1">
                <p className="text-sm font-medium">
                  {itemName(ctx, itemId)} <span className="text-slate-400">× {quantity}</span>
                </p>
                <p className="text-slate-500">
                  {options.usable ? effectText(effect) : 'Sans effet sur ce Pokémon'}
                </p>
              </div>
              {options.usable && needsStat && (
                <select
                  className="input w-auto py-1 text-xs"
                  value={stat}
                  onChange={(e) => setStat(e.target.value as StatName | '')}
                >
                  <option value="">IV à monter…</option>
                  {options.stats.map((s) => (
                    <option key={s} value={s}>
                      {STAT_LABELS[s]} ({p.ivs[s]})
                    </option>
                  ))}
                </select>
              )}
              {options.usable && options.abilities.length > 1 && (
                <select
                  className="input w-auto py-1 text-xs"
                  value={ability}
                  onChange={(e) => setAbilities({ ...abilities, [itemId]: e.target.value })}
                >
                  {options.abilities.map((a) => (
                    <option key={a} value={a}>
                      {abilityLabel(a)}
                    </option>
                  ))}
                </select>
              )}
              {options.usable && (
                <button
                  className="btn-primary shrink-0 py-1"
                  disabled={!ready || use.isPending || p.busy}
                  title={p.busy ? 'Le Pokémon doit être disponible (ni en activité)' : undefined}
                  onClick={() =>
                    use.mutate({
                      itemId,
                      ...(needsStat && stat && { stat }),
                      ...(effect.type === 'abilityChange' && ability && { ability }),
                    })
                  }
                >
                  Utiliser
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!!use.error && <p className="mt-2 text-xs text-red-600">{errorText(use.error)}</p>}
    </div>
  );
}
