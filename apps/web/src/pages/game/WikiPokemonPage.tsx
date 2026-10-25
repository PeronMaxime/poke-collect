import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { STAT_NAMES, TYPE_COLORS, directLineage, eggGroups, getForm, habitats } from '@poke/data';
import type { StatName } from '@poke/data';
import {
  abilityEffectSummary,
  baseSpeciesId,
  counterpartFormId,
  dungeonTypeEffectiveness,
  encounterProbabilities,
  evolutionOptions,
  isBreedable,
  megaOptions,
} from '@poke/game-core';
import type { GameContext, GameSpecies } from '@poke/game-core';
import { PokemonSprite, TypeBadge } from '../../components/ui';
import { usePokedex, usePokedexForms } from '../../lib/game';
import {
  STAT_LABELS,
  abilityLabel,
  evolutionMethodText,
  itemName,
  typeLabel,
} from '../../lib/labels';
import { WikiBreadcrumb } from './WikiBreadcrumb';
import { searchKey, wikiAbilityLink, wikiEntries, wikiLink, wikiPokemonLink } from './wiki';
import type { WikiEntry } from './wiki';

type SortKey = 'id' | 'name' | 'total' | StatName;

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'id', label: 'Numéro' },
  { id: 'name', label: 'Nom' },
  { id: 'total', label: 'Total des stats' },
  ...STAT_NAMES.map((s) => ({ id: s, label: STAT_LABELS[s] })),
];

const CATEGORIES = {
  all: 'Toutes catégories',
  regular: 'Ni légendaire ni fabuleux',
  legendary: 'Légendaires',
  mythical: 'Fabuleux',
  baby: 'Bébés',
} as const;

const FORM_FILTERS = {
  all: 'Espèces et formes',
  base: 'Espèces seules',
  forms: 'Formes seules',
} as const;

const DEX_FILTERS = {
  all: 'Tous',
  caught: 'Capturés',
  missing: 'Pas encore capturés',
} as const;

export interface PokemonFilters {
  search: string;
  regionId: string;
  type: string;
  category: keyof typeof CATEGORIES;
  forms: keyof typeof FORM_FILTERS;
  dex: keyof typeof DEX_FILTERS;
  sort: SortKey;
  descending: boolean;
}

export const DEFAULT_POKEMON_FILTERS: PokemonFilters = {
  search: '',
  regionId: 'all',
  type: 'all',
  category: 'all',
  forms: 'all',
  dex: 'all',
  sort: 'id',
  descending: false,
};

const ATTACK_TYPES = Object.keys(TYPE_COLORS);

const statTotal = (s: GameSpecies) => STAT_NAMES.reduce((sum, stat) => sum + s.baseStats[stat], 0);

const formatPercent = (p: number) =>
  `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: p < 0.01 ? 2 : 1 })} %`;

const dexNumber = (id: number) => `N° ${String(id).padStart(3, '0')}`;

/** Pokémon capturés par le joueur (espèces et formes), pour le filtre et les pastilles. */
function useCaught() {
  const pokedex = usePokedex();
  const forms = usePokedexForms();
  return useMemo(() => {
    const species = new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId));
    const formIds = new Set(forms.data?.map((f) => f.formId));
    return (e: { speciesId: number; formId: number | null }) =>
      e.formId === null ? species.has(e.speciesId) : formIds.has(e.formId);
  }, [pokedex.data, forms.data]);
}

/** Liste des Pokémon du wiki (recherche, filtres, tris), ou fiche d'un Pokémon. */
export function WikiPokemonPage({
  ctx,
  selected,
  filters,
  onFiltersChange,
}: {
  ctx: GameContext;
  selected: { speciesId: number; formId: number | null } | null;
  filters: PokemonFilters;
  onFiltersChange: (filters: PokemonFilters) => void;
}) {
  const entries = useMemo(() => wikiEntries(ctx), [ctx]);
  const isCaught = useCaught();
  if (selected) {
    const entry = entries.find(
      (e) => e.speciesId === selected.speciesId && e.formId === selected.formId,
    );
    return entry ? (
      <PokemonSheet ctx={ctx} entry={entry} entries={entries} />
    ) : (
      <div className="space-y-4">
        <WikiBreadcrumb items={[{ label: 'Pokémon', href: wikiLink('pokemon') }]} />
        <p className="text-slate-500">
          Ce Pokémon n’est pas disponible dans les régions actuelles.
        </p>
      </div>
    );
  }
  return (
    <PokemonList
      ctx={ctx}
      entries={entries}
      isCaught={isCaught}
      filters={filters}
      onChange={(patch) => onFiltersChange({ ...filters, ...patch })}
    />
  );
}

function PokemonList({
  ctx,
  entries,
  isCaught,
  filters: f,
  onChange,
}: {
  ctx: GameContext;
  entries: WikiEntry[];
  isCaught: (e: WikiEntry) => boolean;
  filters: PokemonFilters;
  onChange: (patch: Partial<PokemonFilters>) => void;
}) {
  const query = searchKey(f.search.trim());
  const sortValue = (e: WikiEntry) =>
    f.sort === 'total'
      ? statTotal(e.species)
      : f.sort in STAT_LABELS
        ? e.species.baseStats[f.sort as StatName]
        : 0;
  const list = entries
    .filter((e) => {
      const s = e.species;
      if (
        query &&
        !searchKey(s.nameFr).includes(query) &&
        String(e.speciesId) !== query.replace(/^0+/, '')
      )
        return false;
      if (f.regionId !== 'all' && !e.regionIds.includes(f.regionId)) return false;
      if (f.type !== 'all' && !s.types.includes(f.type)) return false;
      if (f.forms === 'base' && e.formId !== null) return false;
      if (f.forms === 'forms' && e.formId === null) return false;
      if (f.category === 'legendary' && !s.isLegendary) return false;
      if (f.category === 'mythical' && !s.isMythical) return false;
      if (f.category === 'baby' && !s.isBaby) return false;
      if (f.category === 'regular' && (s.isLegendary || s.isMythical)) return false;
      if (f.dex !== 'all' && isCaught(e) !== (f.dex === 'caught')) return false;
      return true;
    })
    .sort((a, b) => {
      const order =
        f.sort === 'id'
          ? a.speciesId - b.speciesId || (a.formId ?? 0) - (b.formId ?? 0)
          : f.sort === 'name'
            ? a.species.nameFr.localeCompare(b.species.nameFr, 'fr')
            : sortValue(a) - sortValue(b) || a.speciesId - b.speciesId;
      return f.descending ? -order : order;
    });
  const showValue = f.sort !== 'id' && f.sort !== 'name';
  const filtered =
    query !== '' ||
    f.regionId !== 'all' ||
    f.type !== 'all' ||
    f.category !== 'all' ||
    f.forms !== 'all' ||
    f.dex !== 'all';

  return (
    <div className="space-y-4">
      <WikiBreadcrumb items={[{ label: 'Pokémon' }]} />
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-64"
            placeholder="Nom ou numéro…"
            value={f.search}
            onChange={(e) => onChange({ search: e.target.value })}
          />
          <Select
            value={f.regionId}
            onChange={(regionId) => onChange({ regionId })}
            options={[
              ['all', 'Toutes les régions'],
              ...ctx.regions.map((r): [string, string] => [r.id, `Pokédex de ${r.name}`]),
            ]}
          />
          <Select
            value={f.type}
            onChange={(type) => onChange({ type })}
            options={[
              ['all', 'Tous les types'],
              ...ATTACK_TYPES.map((t): [string, string] => [t, typeLabel(t)]),
            ]}
          />
          <Select
            value={f.category}
            onChange={(category) => onChange({ category: category as PokemonFilters['category'] })}
            options={Object.entries(CATEGORIES)}
          />
          <Select
            value={f.forms}
            onChange={(forms) => onChange({ forms: forms as PokemonFilters['forms'] })}
            options={Object.entries(FORM_FILTERS)}
          />
          <Select
            value={f.dex}
            onChange={(dex) => onChange({ dex: dex as PokemonFilters['dex'] })}
            options={Object.entries(DEX_FILTERS)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Trier par</span>
          <Select
            value={f.sort}
            onChange={(sort) => onChange({ sort: sort as SortKey })}
            options={SORTS.map((s): [string, string] => [s.id, s.label])}
          />
          <button
            className="btn-ghost py-1.5"
            onClick={() => onChange({ descending: !f.descending })}
            title="Inverser l’ordre"
          >
            {f.descending ? '↓ Décroissant' : '↑ Croissant'}
          </button>
          {filtered && (
            <button
              className="text-brand-600 hover:underline dark:text-brand-500"
              onClick={() =>
                onChange({ ...DEFAULT_POKEMON_FILTERS, sort: f.sort, descending: f.descending })
              }
            >
              Réinitialiser les filtres
            </button>
          )}
          <span className="ml-auto text-slate-500">{list.length} Pokémon</span>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-slate-500">Aucun Pokémon ne correspond à ces critères.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {list.map((e) => (
            <a
              key={`${e.speciesId}:${e.formId}`}
              href={wikiPokemonLink(e.speciesId, e.formId)}
              className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 transition hover:border-brand-500/60 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <PokemonSprite speciesId={e.speciesId} formId={e.formId} size={56} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-400">{dexNumber(e.speciesId)}</p>
                <p className="truncate text-sm font-medium" title={e.species.nameFr}>
                  {e.species.nameFr}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {e.species.types.map((t) => (
                    <TypeBadge key={t} type={t} />
                  ))}
                </div>
              </div>
              {showValue && (
                <span className="absolute top-1.5 right-2 text-xs font-semibold text-slate-500">
                  {sortValue(e)}
                </span>
              )}
              {isCaught(e) && (
                <span
                  className="absolute right-2 bottom-2 h-2 w-2 rounded-full bg-brand-500"
                  title="Capturé"
                />
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <select className="input w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  );
}

// --- Fiche d'un Pokémon -------------------------------------------------------------------

function Section({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 ${className}`}>
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function PokemonSheet({
  ctx,
  entry,
  entries,
}: {
  ctx: GameContext;
  entry: WikiEntry;
  entries: WikiEntry[];
}) {
  const { species, speciesId, formId } = entry;
  const index = entries.indexOf(entry);
  const previous = entries[index - 1];
  const next = entries[index + 1];
  const variants = entries.filter((e) => e.speciesId === speciesId);
  const form = formId !== null ? getForm(formId) : undefined;
  const regionNames = entry.regionIds.map((id) => ctx.region(id)?.name ?? id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <WikiBreadcrumb
          items={[{ label: 'Pokémon', href: wikiLink('pokemon') }, { label: species.nameFr }]}
        />
        <div className="flex gap-2">
          {previous && (
            <a
              className="btn-ghost py-1.5"
              href={wikiPokemonLink(previous.speciesId, previous.formId)}
            >
              ← {previous.species.nameFr}
            </a>
          )}
          {next && (
            <a className="btn-ghost py-1.5" href={wikiPokemonLink(next.speciesId, next.formId)}>
              {next.species.nameFr} →
            </a>
          )}
        </div>
      </div>

      <div className="card flex flex-col items-center gap-4 p-5 sm:flex-row sm:items-start">
        <PokemonSprite speciesId={speciesId} formId={formId} kind="artwork" size={160} />
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <div>
            <p className="text-sm text-slate-400">{dexNumber(speciesId)}</p>
            <h2 className="text-2xl font-bold">{species.nameFr}</h2>
            {form && <p className="text-sm text-slate-500">{form.formNameFr}</p>}
          </div>
          <div className="flex flex-wrap justify-center gap-1 sm:justify-start">
            {species.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
            {species.isLegendary && (
              <Tag className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Légendaire
              </Tag>
            )}
            {species.isMythical && (
              <Tag className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                Fabuleux
              </Tag>
            )}
            {species.isBaby && (
              <Tag className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">Bébé</Tag>
            )}
          </div>
          <p className="text-sm text-slate-500">
            Pokédex de {regionNames.join(', ')} · {species.heightDm / 10} m ·{' '}
            {(species.weightHg / 10).toLocaleString('fr-FR')} kg
          </p>
          {variants.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1.5 pt-1 sm:justify-start">
              {variants.map((v) => (
                <a
                  key={v.formId ?? 0}
                  href={wikiPokemonLink(v.speciesId, v.formId)}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs ${
                    v === entry
                      ? 'border-brand-500 bg-brand-500/10 font-semibold text-brand-600 dark:text-brand-500'
                      : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <PokemonSprite speciesId={v.speciesId} formId={v.formId} size={28} />
                  {v.formId === null ? 'Forme normale' : getForm(v.formId)?.formNameFr}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Statistiques de base">
          <BaseStats species={species} />
        </Section>
        <Section title="Talents">
          <Abilities ctx={ctx} species={species} />
        </Section>
        <Section title="Localisation">
          <Locations ctx={ctx} entry={entry} />
        </Section>
        <Section title="Sexe et reproduction">
          <GenderAndBreeding species={species} />
        </Section>
        <Section title="Évolutions" className="md:col-span-2">
          <Evolutions ctx={ctx} entry={entry} entries={entries} />
        </Section>
        <Section title="Faiblesses et résistances" className="md:col-span-2">
          <TypeDefenses types={species.types} />
        </Section>
      </div>
    </div>
  );
}

function Tag({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${className}`}>
      {children}
    </span>
  );
}

function statColor(value: number) {
  if (value < 50) return 'bg-red-400';
  if (value < 80) return 'bg-amber-400';
  if (value < 110) return 'bg-emerald-500';
  return 'bg-sky-500';
}

function BaseStats({ species }: { species: GameSpecies }) {
  return (
    <div className="space-y-1.5 text-sm">
      {STAT_NAMES.map((stat) => {
        const value = species.baseStats[stat];
        return (
          <div key={stat} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-slate-500">{STAT_LABELS[stat]}</span>
            <span className="w-8 shrink-0 text-right font-semibold">{value}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span
                className={`block h-full rounded-full ${statColor(value)}`}
                style={{ width: `${Math.min(100, (value / 200) * 100)}%` }}
              />
            </span>
          </div>
        );
      })}
      <div className="flex items-center gap-2 border-t border-slate-200 pt-1.5 dark:border-slate-800">
        <span className="w-20 shrink-0 font-medium">Total</span>
        <span className="w-8 shrink-0 text-right font-bold">{statTotal(species)}</span>
      </div>
    </div>
  );
}

function Abilities({ ctx, species }: { ctx: GameContext; species: GameSpecies }) {
  if (species.abilities.length === 0)
    return <p className="text-sm text-slate-500">Aucun talent.</p>;
  return (
    <ul className="space-y-3 text-sm">
      {species.abilities.map((a) => {
        const effect = abilityEffectSummary(ctx, a.name);
        return (
          <li key={a.name}>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <a
                href={wikiAbilityLink(a.name)}
                className="font-semibold text-brand-600 hover:underline dark:text-brand-500"
              >
                {abilityLabel(a.name)}
              </a>
              {a.isHidden && (
                <span className="text-xs text-violet-600 dark:text-violet-400">talent caché</span>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {a.isHidden ? 'Patch Talent' : 'Pilule Talent'}
              </span>
            </p>
            <p className={effect ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 italic'}>
              {effect ?? 'Pas encore d’effet en jeu.'}
            </p>
          </li>
        );
      })}
      <li className="text-xs text-slate-400">
        Les Pokémon arrivent sans talent : une Pilule Talent donne un talent normal au hasard (puis
        l’autre), un Patch Talent le talent caché.
      </li>
    </ul>
  );
}

function GenderAndBreeding({ species }: { species: GameSpecies }) {
  const female = species.genderRate < 0 ? null : species.genderRate / 8;
  const groups = new Map(eggGroups.map((g) => [g.name, g.nameFr]));
  const habitat = habitats.find((h) => h.name === species.habitat)?.nameFr;
  const breedable = isBreedable(species);
  return (
    <div className="space-y-3 text-sm">
      {female === null ? (
        <p>Asexué (ni mâle ni femelle)</p>
      ) : (
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-sky-600 dark:text-sky-400">♂ {formatPercent(1 - female)}</span>
            <span className="text-pink-600 dark:text-pink-400">♀ {formatPercent(female)}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <span className="bg-sky-500" style={{ width: `${(1 - female) * 100}%` }} />
            <span className="bg-pink-500" style={{ width: `${female * 100}%` }} />
          </div>
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-500">Reproduction</dt>
        <dd>
          {breedable
            ? species.eggGroups.map((g) => groups.get(g) ?? g).join(', ')
            : 'Ne se reproduit pas'}
        </dd>
        <dt className="text-slate-500">Taux de capture</dt>
        <dd>{species.captureRate} / 255</dd>
        {habitat && (
          <>
            <dt className="text-slate-500">Habitat</dt>
            <dd className="first-letter:uppercase">{habitat}</dd>
          </>
        )}
        <dt className="text-slate-500">Croissance</dt>
        <dd>{GROWTH_LABELS[species.growthRate] ?? species.growthRate}</dd>
        {species.baseExperience !== null && (
          <>
            <dt className="text-slate-500">XP de base</dt>
            <dd>{species.baseExperience}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

const GROWTH_LABELS: Record<string, string> = {
  fast: 'Rapide',
  medium: 'Moyenne',
  'medium-slow': 'Parabolique',
  slow: 'Lente',
  'fast-then-very-slow': 'Fluctuante',
  'slow-then-very-fast': 'Erratique',
};

/** Façons d'obtenir le Pokémon : zones d'expédition, quêtes, fossiles, œufs, évolution, Méga. */
function Locations({ ctx, entry }: { ctx: GameContext; entry: WikiEntry }) {
  const { speciesId, formId, species } = entry;
  const same = (p: { speciesId: number; formId?: number | null }) =>
    p.speciesId === speciesId && (p.formId ?? null) === formId;
  const zones = ctx.zones.flatMap((zone) => {
    const probability = encounterProbabilities(ctx, zone).find(same)?.probability;
    const encounters = zone.encounters.filter(same);
    if (!probability || encounters.length === 0) return [];
    const min = Math.min(...encounters.map((e) => e.minLevel));
    const max = Math.max(...encounters.map((e) => e.maxLevel));
    return [{ zone, probability, levels: min === max ? `N.${min}` : `N.${min}–${max}` }];
  });
  const quests = ctx.quests.flatMap((q) =>
    q.rewards.pokemon
      .filter(same)
      .map((p) => ({ quest: q, level: p.level, roaming: p.roaming != null })),
  );
  const fossils = ctx.content.items.filter((i) => {
    const effect = ctx.itemEffect(i.id, 'fossil');
    return !!effect && same(effect);
  });
  const form = formId !== null ? getForm(formId) : undefined;
  const megaOf =
    form?.kind === 'mega'
      ? megaOptions(ctx, speciesId).find((o) => o.form.id === formId)
      : undefined;
  // Les œufs contiennent la première espèce de la lignée (forme régionale comprise).
  const fromEgg =
    isBreedable(species) &&
    baseSpeciesId(ctx, speciesId) === speciesId &&
    (form === undefined || form.kind === 'regional');
  // Une Méga-Évolution ou une forme de combat ne s'obtient pas par évolution.
  const parent =
    species.evolvesFromSpeciesId !== null && (form === undefined || form.kind === 'regional')
      ? ctx.species(species.evolvesFromSpeciesId)
      : undefined;

  const lines: ReactNode[] = [];
  if (zones.length > 0) {
    lines.push(
      <div key="zones">
        <p className="mb-1 font-medium">Expéditions</p>
        <ul className="space-y-0.5">
          {zones.map(({ zone, probability, levels }) => (
            <li key={zone.id} className="flex flex-wrap justify-between gap-x-2">
              <span>
                {zone.name}{' '}
                <span className="text-slate-400">
                  ({ctx.region(zone.regionId)?.name ?? zone.regionId})
                </span>
              </span>
              <span className="text-slate-500">
                {levels} · {formatPercent(probability)} des rencontres
              </span>
            </li>
          ))}
        </ul>
      </div>,
    );
  }
  for (const { quest, level, roaming } of quests) {
    lines.push(
      <p key={`q-${quest.id}`}>
        Récompense de la quête <strong>{quest.name}</strong> (N.{level}), puis{' '}
        {roaming
          ? 'capture en expédition : c’est un fuyard, qui change de zone à chaque heure.'
          : 'capture lors d’une expédition légendaire.'}
      </p>,
    );
  }
  for (const item of fossils) {
    lines.push(
      <p key={`f-${item.id}`}>
        Ranimé au Musée à partir du fossile <strong>{itemName(ctx, item.id)}</strong>.
      </p>,
    );
  }
  if (megaOf) {
    lines.push(
      <p key="mega">
        Méga-Évolution de {ctx.species(speciesId)?.nameFr} avec{' '}
        {megaOf.itemIds.map((id) => itemName(ctx, id)).join(' ou ')}.
      </p>,
    );
  }
  if (parent) {
    lines.push(
      <p key="evo">
        Évolution de{' '}
        <a
          href={wikiPokemonLink(parent.id, counterpartFormId(formId, parent.id))}
          className="font-medium text-brand-600 hover:underline dark:text-brand-500"
        >
          {ctx.species(parent.id, counterpartFormId(formId, parent.id))?.nameFr}
        </a>
        .
      </p>,
    );
  }
  if (fromEgg) lines.push(<p key="egg">Éclosion d’un œuf de la Pension.</p>);

  return lines.length > 0 ? (
    <div className="space-y-2 text-sm">{lines}</div>
  ) : (
    <p className="text-sm text-slate-500">Introuvable pour l’instant.</p>
  );
}

/** Lignée complète, depuis la première espèce, avec les conditions de chaque évolution. */
function Evolutions({
  ctx,
  entry,
  entries,
}: {
  ctx: GameContext;
  entry: WikiEntry;
  entries: WikiEntry[];
}) {
  const form = entry.formId !== null ? getForm(entry.formId) : undefined;
  // Méga-Évolutions et formes de combat : lignée de la forme normale.
  const lineageForm = form?.kind === 'regional' ? entry.formId : null;
  const rootId = directLineage(entry.speciesId)[0] ?? entry.speciesId;
  const rootForm = counterpartFormId(lineageForm, rootId);
  const known = new Set(entries.map((e) => `${e.speciesId}:${e.formId}`));
  const megas = megaOptions(ctx, entry.speciesId);
  const hasEvolutions = evolutionOptions(ctx, rootId, rootForm).length > 0;

  return (
    <div className="space-y-3">
      {hasEvolutions ? (
        <div className="overflow-x-auto pb-1">
          <EvolutionNode
            ctx={ctx}
            speciesId={rootId}
            formId={rootForm}
            current={entry}
            known={known}
            depth={0}
          />
        </div>
      ) : (
        <p className="text-sm text-slate-500">Ce Pokémon n’évolue pas.</p>
      )}
      {megas.length > 0 && (
        <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
          {megas.map(({ form: mega, itemIds }) => (
            <span key={mega.id} className="flex items-center gap-2">
              <span className="text-slate-500">
                Méga-Évolution ({itemIds.map((id) => itemName(ctx, id)).join(' ou ')}) →
              </span>
              <EvolutionMon
                ctx={ctx}
                speciesId={mega.speciesId}
                formId={mega.id}
                current={entry}
                known={known}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EvolutionNode({
  ctx,
  speciesId,
  formId,
  current,
  known,
  depth,
}: {
  ctx: GameContext;
  speciesId: number;
  formId: number | null;
  current: WikiEntry;
  known: Set<string>;
  depth: number;
}) {
  const options = depth < 4 ? evolutionOptions(ctx, speciesId, formId) : [];
  return (
    <div className="flex items-center gap-2">
      <EvolutionMon
        ctx={ctx}
        speciesId={speciesId}
        formId={formId}
        current={current}
        known={known}
      />
      {options.length > 0 && (
        <div className="flex flex-col gap-2">
          {options.map((o) => (
            <div key={`${o.toSpeciesId}:${o.toFormId}`} className="flex items-center gap-2">
              <span className="flex w-24 shrink-0 flex-col items-center text-center text-[11px] leading-tight text-slate-500">
                <span>
                  {o.methods.length === 0
                    ? 'Impossible pour l’instant'
                    : o.methods.map((m) => evolutionMethodText(ctx, m) || '?').join(' ou ')}
                </span>
                <span className="text-base text-slate-300 dark:text-slate-600">→</span>
              </span>
              <EvolutionNode
                ctx={ctx}
                speciesId={o.toSpeciesId}
                formId={o.toFormId}
                current={current}
                known={known}
                depth={depth + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvolutionMon({
  ctx,
  speciesId,
  formId,
  current,
  known,
}: {
  ctx: GameContext;
  speciesId: number;
  formId: number | null;
  current: WikiEntry;
  known: Set<string>;
}) {
  const species = ctx.species(speciesId, formId);
  const isCurrent = current.speciesId === speciesId && current.formId === formId;
  const content = (
    <>
      <PokemonSprite speciesId={speciesId} formId={formId} size={64} />
      <span className="max-w-24 truncate text-xs font-medium">{species?.nameFr ?? '?'}</span>
    </>
  );
  const className = `flex w-24 shrink-0 flex-col items-center rounded-xl border p-1 ${
    isCurrent ? 'border-brand-500 bg-brand-500/10' : 'border-slate-200 dark:border-slate-800'
  }`;
  // Espèce d'une région pas encore disponible : affichée sans lien.
  if (!known.has(`${speciesId}:${formId}`)) {
    return (
      <span className={`${className} opacity-50`} title="Pas encore disponible dans le jeu">
        {content}
      </span>
    );
  }
  return (
    <a
      href={wikiPokemonLink(speciesId, formId)}
      className={`${className} hover:border-brand-500/60`}
    >
      {content}
    </a>
  );
}

const DEFENSE_GROUPS = [
  { label: 'Très vulnérable (×4)', test: (m: number) => m >= 4 },
  { label: 'Vulnérable (×2)', test: (m: number) => m === 2 },
  { label: 'Neutre (×1)', test: (m: number) => m === 1 },
  { label: 'Résistant (×½)', test: (m: number) => m === 0.5 },
  { label: 'Très résistant (×¼)', test: (m: number) => m === 0.25 },
  { label: 'Extrêmement résistant (×⅛ ou moins)', test: (m: number) => m < 0.25 },
];

/**
 * Multiplicateur des attaques de chaque type contre le Pokémon (talents non compris), comme en
 * combat : une immunité de la table des types divise les dégâts par 4.
 */
function TypeDefenses({ types }: { types: string[] }) {
  const multipliers = ATTACK_TYPES.map((t) => ({ type: t, m: dungeonTypeEffectiveness(t, types) }));
  return (
    <div className="space-y-2 text-sm">
      {DEFENSE_GROUPS.map((group) => {
        const list = multipliers.filter((x) => group.test(x.m));
        if (list.length === 0) return null;
        return (
          <div
            key={group.label}
            className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span className="w-40 shrink-0 text-slate-500">{group.label}</span>
            <span className="flex flex-wrap gap-1">
              {list.map((x) => (
                <TypeBadge key={x.type} type={x.type} />
              ))}
            </span>
          </div>
        );
      })}
      <p className="text-xs text-slate-400">
        Dégâts reçus des attaques de chaque type, sans tenir compte des talents. En combat, une
        immunité (×0 dans les jeux) divise les dégâts par 4.
      </p>
    </div>
  );
}
