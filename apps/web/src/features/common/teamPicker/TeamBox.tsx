/**
 * La « boîte » du choix d'équipe : Pokémon disponibles, avec recherche, tri, filtres et équipes
 * enregistrées.
 */
import { useState } from 'react';
import { STAT_NAMES } from '@poke/data';
import type { StatName } from '@poke/data';
import { effectiveAbility } from '@poke/game-core';
import { PokemonTagBadges, TagFilterSelect } from '../../../components/tags';
import { ProgressiveItems } from '../../../components/ProgressiveGrid';
import {
  HoverBubble,
  PokemonSprite,
  ShinyStar,
  StatLines,
  TypeBadge,
} from '../../../components/ui';
import { STAT_LABELS, abilityLabel, speciesName, typeLabel } from '../../../lib/labels';
import { effectivenessLabel } from '../CombatTeamOrder';
import { PowerGauge, SECTION_TITLE, SELECTED_CELL, SLOT_BADGE } from '../dialogParts';
import { MEGA_LOCKED_TITLE, NameSearch, TypeFilterSelect, filterPill, megaLocked } from './filters';
import { SORTS } from './useTeamPicker';
import type { Sort } from './useTeamPicker';
import { SavedTeamsBar } from './SavedTeamsBar';
import type { TeamPickerModel } from './useTeamPickerView';

/** Pastille verte d'un Pokémon en affinité avec le lieu. */
function AffinityMark({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid place-items-center rounded border-2 border-ink bg-emerald-400 ${className}`}
    >
      <svg viewBox="0 0 10 10" className="size-2.5">
        <path d="M5 1L9 7H1z" fill="#10203a" />
      </svg>
    </span>
  );
}

/** Colonne de la boîte : équipe en mini-cases (téléphone), filtres, équipes enregistrées, grille et légende. */
export function TeamBox({ v }: { v: TeamPickerModel }) {
  const { team, setTeam, usable, savedTeams, pokemon, ctx, maxTeamSize, view } = v;
  return (
    <div
      className={`flex min-w-0 flex-col gap-2.5 lg:min-h-0 ${view === 'team' ? 'max-lg:hidden' : ''}`}
    >
      <TeamSummary v={v} />

      <BoxFilters v={v} />

      <SavedTeamsBar
        ctx={ctx}
        teams={savedTeams}
        pokemon={pokemon}
        usable={usable}
        maxSize={maxTeamSize}
        current={team}
        onPick={setTeam}
      />

      <BoxGrid v={v} />

      <BoxLegend v={v} />
    </div>
  );
}

/** Téléphone : l'équipe en mini-cases, toucher l'une ouvre l'onglet de l'équipe. */
function TeamSummary({ v }: { v: TeamPickerModel }) {
  const { members, ctx, zone, power, maxTeamSize, setView, active, effectsOf, holders } = v;
  return (
    <div className="tile flex flex-col gap-2 p-2.5 lg:hidden">
      <div className="flex items-center gap-2">
        <h3 className={SECTION_TITLE}>
          Équipe {members.length}/{maxTeamSize}
        </h3>
        {zone.minPower > 0 && (
          <PowerGauge power={power} minPower={zone.minPower} className="min-w-12 flex-1" />
        )}
        <span
          className={`ml-auto text-sm font-bold whitespace-nowrap ${
            power >= zone.minPower
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          PE {power}
        </span>
      </div>
      <ol className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: maxTeamSize }, (_, i) => {
          const p = members[i];
          return (
            <li key={p?.id ?? `free-${i}`} className="min-w-0">
              {p ? (
                <button
                  type="button"
                  onClick={() => setView('team')}
                  aria-label={`${speciesName(ctx, p.speciesId, p.formId)} : voir l’équipe`}
                  className={`sprite-well relative aspect-square w-full ${p.isShiny ? 'shiny-well' : ''} ${
                    effectsOf(i).length > 0 ? 'border-emerald-500 dark:border-emerald-400' : ''
                  }`}
                >
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={p.formId}
                    shiny={p.isShiny}
                    size={48}
                    className="h-auto w-[85%]"
                  />
                  <span className={`${SLOT_BADGE} absolute -top-1.5 -right-1.5`}>{i + 1}</span>
                </button>
              ) : (
                <span className="grid aspect-square w-full place-items-center rounded-md border-2 border-dashed border-well-line font-pixel text-[9px] text-slate-500 dark:text-slate-400">
                  {i + 1}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {members.length > 0 && holders > 0 && (
        <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">
          ✦ {holders} talent{holders > 1 ? 's' : ''} actif{holders > 1 ? 's' : ''} :{' '}
          {[...new Set(active.map((a) => a.holder))]
            .map((i) => members[i] && speciesName(ctx, members[i].speciesId, members[i].formId))
            .join(', ')}
        </p>
      )}
    </div>
  );
}

/** Recherche, tri, puis filtres (repliés derrière un bouton sur téléphone). */
function BoxFilters({ v }: { v: TeamPickerModel }) {
  const {
    search,
    setSearch,
    type,
    setType,
    abilityOnly,
    setAbilityOnly,
    favoritesOnly,
    setFavoritesOnly,
    affinityOnly,
    setAffinityOnly,
    tagFilter,
    available,
    zone,
    combat,
    hideBlocked,
    setHideBlocked,
    from,
    forbidden,
    maxLevel,
    hasLimits,
    filterCount,
    resetAll,
  } = v;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sortSelect = <SortSelect v={v} />;
  return (
    <section className="tile flex flex-col gap-2 p-2.5">
      <div className="flex items-center gap-2">
        <NameSearch value={search} onChange={setSearch} className="min-w-0 flex-1 py-1.5" />
        <button
          type="button"
          className="btn-ghost px-3 py-2 sm:hidden"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Filtres{filterCount > 0 && ` (${filterCount})`}
        </button>
        <span className="hidden sm:block">{sortSelect}</span>
      </div>
      <div className={`${filtersOpen ? 'flex' : 'hidden'} flex-wrap items-center gap-1.5 sm:flex`}>
        <span className="w-full sm:hidden">{sortSelect}</span>
        <TypeFilterSelect value={type} onChange={setType} className="py-1 text-sm" />
        <TagFilterSelect
          tags={tagFilter.tags}
          value={tagFilter.filter}
          onChange={tagFilter.setFilter}
          className="py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          title="N'afficher que les Pokémon favoris (♥)"
          aria-pressed={favoritesOnly}
          className={filterPill(favoritesOnly)}
        >
          ♥ Favoris
        </button>
        <button
          type="button"
          onClick={() => setAbilityOnly(!abilityOnly)}
          title="N'afficher que les Pokémon dont le talent agit ici (lieu, heure, météo, équipiers)"
          aria-pressed={abilityOnly}
          className={filterPill(abilityOnly)}
        >
          ✦ Talent actif
        </button>
        {zone.affinityTypes.length > 0 && (
          <button
            type="button"
            onClick={() => setAffinityOnly(!affinityOnly)}
            title={`N'afficher que les Pokémon en affinité (${zone.affinityTypes
              .map(typeLabel)
              .join(', ')})`}
            aria-pressed={affinityOnly}
            className={`${filterPill(affinityOnly)} inline-flex items-center gap-1.5`}
          >
            {combat ? (
              <span
                aria-hidden
                className="inline-block size-3 rounded-sm border-2 border-emerald-500 dark:border-emerald-400"
              />
            ) : (
              <AffinityMark className="size-4" />
            )}
            {combat ? 'Efficaces' : 'Affinité'}
          </button>
        )}
        {hasLimits && (
          <button
            type="button"
            onClick={() => setHideBlocked(!hideBlocked)}
            title="Masquer les Pokémon que les règles excluent (niveau, types interdits)"
            aria-pressed={hideBlocked}
            className={filterPill(hideBlocked)}
          >
            {maxLevel !== null && forbidden.size === 0
              ? `Masquer niv. > ${maxLevel}`
              : 'Masquer les exclus'}
          </button>
        )}
        {filterCount > 0 && (
          <button
            type="button"
            onClick={resetAll}
            className="text-sm text-brand-600 hover:underline dark:text-brand-400"
          >
            Effacer les filtres ({filterCount})
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
          {available.length} Pokémon{from}
        </span>
      </div>
      {zone.requiredTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Requis</span>
          {zone.requiredTypes.map((r) => (
            <button
              key={r.type}
              type="button"
              onClick={() => setType(type === r.type ? 'all' : r.type)}
              aria-pressed={type === r.type}
              title={
                type === r.type
                  ? 'Retirer le filtre'
                  : `N'afficher que les Pokémon de type ${typeLabel(r.type)}`
              }
              className={`${filterPill(type === r.type)} inline-flex items-center gap-1 py-0.5 pl-1`}
            >
              <TypeBadge type={r.type} />
              {r.count > 1 && <span>× {r.count}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Choix du tri ; les statistiques ne sont proposées que là où elles comptent (`statSort`). */
function SortSelect({ v }: { v: TeamPickerModel }) {
  const { sort, setSort, stat, setStat, statSort } = v;
  return (
    <label className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
      Trier
      <select
        className="input w-auto py-1 text-sm"
        value={sort === 'stat' ? `stat:${stat}` : sort}
        onChange={(e) => {
          const value = e.target.value;
          if (value.startsWith('stat:')) {
            setStat(value.slice(5) as StatName);
            setSort('stat');
          } else setSort(value as Sort);
        }}
      >
        {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((key) => (
          <option key={key} value={key}>
            {SORTS[key]}
          </option>
        ))}
        {statSort && (
          <optgroup label="Statistique">
            {STAT_NAMES.map((s) => (
              <option key={s} value={`stat:${s}`}>
                {STAT_LABELS[s]}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

/** Grille des Pokémon disponibles. */
function BoxGrid({ v }: { v: TeamPickerModel }) {
  const {
    sort,
    stat,
    search,
    type,
    abilityOnly,
    favoritesOnly,
    affinityOnly,
    tagFilter,
    available,
    extra,
    hideBlocked,
    from,
    filterCount,
    resetAll,
  } = v;
  return (
    <section
      aria-label="Pokémon disponibles"
      className="tile p-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]">
        <ProgressiveItems
          items={available}
          resetKey={[
            sort,
            stat,
            search,
            type,
            abilityOnly,
            favoritesOnly,
            affinityOnly,
            hideBlocked,
            tagFilter.filter,
          ].join('|')}
        >
          {(entry) => <PokemonCell key={entry.p.id} v={v} entry={entry} />}
        </ProgressiveItems>
        {available.length === 0 && (
          <p className="col-span-full p-3 text-sm text-slate-500 dark:text-slate-400">
            {filterCount === 0 ? (
              `Aucun Pokémon${from} disponible : ils sont occupés, K.O., ou pas encore capturés.`
            ) : (
              <>
                Aucun Pokémon{from} disponible avec ces filtres.{' '}
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-brand-600 hover:underline dark:text-brand-400"
                >
                  Effacer les filtres
                </button>
              </>
            )}
          </p>
        )}
      </div>
      {extra}
    </section>
  );
}

/** Un Pokémon de la boîte : sprite, niveau et PE (ou la statistique triée), talent actif, étiquettes. */
function PokemonCell({
  v,
  entry,
}: {
  v: TeamPickerModel;
  entry: TeamPickerModel['available'][number];
}) {
  const { team, sort, stat, tagFilter, members, ctx, statSort, combat, maxLevel, toggle } = v;
  const { p, species, power, stats, affinity, activeAbility, abilityText, blocked, effectiveness } =
    entry;
  const index = team.indexOf(p.id);
  const selected = index >= 0;
  const mega = megaLocked(p, members);
  const locked = mega || !!blocked;
  const eff = effectiveness !== null && effectiveness !== 1 ? effectiveness : null;
  const card = (
    <button
      key={p.id}
      type="button"
      onClick={() => toggle(p)}
      disabled={locked}
      aria-pressed={selected}
      title={
        mega
          ? MEGA_LOCKED_TITLE
          : (blocked ??
            `${selected ? 'Retirer' : 'Ajouter'} ${species.nameFr}${affinity ? ' · en affinité' : ''}${
              eff !== null ? ` · ${effectivenessLabel(eff)} au mieux` : ''
            }`)
      }
      className={`relative flex w-full min-w-0 flex-col items-center gap-0.5 rounded-md border-2 p-1 text-center transition disabled:cursor-not-allowed ${
        selected
          ? SELECTED_CELL
          : 'border-transparent enabled:hover:border-well-line enabled:hover:bg-well/40'
      }`}
    >
      <span
        className={`sprite-well size-14 sm:size-16 ${p.isShiny ? 'shiny-well' : ''} ${
          affinity && !locked
            ? 'border-emerald-500 ring-2 ring-emerald-500/30 dark:border-emerald-400'
            : ''
        } ${locked ? 'opacity-45 grayscale' : ''}`}
      >
        <PokemonSprite
          speciesId={p.speciesId}
          formId={p.formId}
          shiny={p.isShiny}
          size={56}
          className="h-auto w-[92%]"
        />
      </span>
      <span className={`w-full truncate text-xs font-semibold ${locked ? 'opacity-60' : ''}`}>
        {species.nameFr} {p.isShiny && <ShinyStar />}
      </span>
      <span
        className={`max-w-full truncate text-[11px] ${
          blocked
            ? 'text-red-600 dark:text-red-400'
            : sort === 'stat'
              ? 'font-medium text-[#2a78c0] dark:text-[#48a8e8]'
              : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {blocked && maxLevel !== null && p.level > maxLevel ? (
          `N.${p.level} · trop haut`
        ) : blocked ? (
          'Type interdit'
        ) : sort === 'stat' ? (
          `${STAT_LABELS[stat]} ${stats[stat]}`
        ) : (
          <>
            N.{p.level} ·<span className="max-sm:hidden"> PE</span> {power}
          </>
        )}
      </span>
      {activeAbility && (
        <span
          className="w-full truncate text-[10px] text-emerald-700 dark:text-emerald-400"
          title={abilityText}
        >
          ✦ {abilityLabel(effectiveAbility(ctx, p))}
        </span>
      )}
      <PokemonTagBadges pokemon={p} tags={tagFilter.tags} />
      {selected && <span className={`${SLOT_BADGE} absolute top-0.5 right-0.5`}>{index + 1}</span>}
      {combat
        ? eff !== null &&
          !locked && (
            <span
              className={`absolute top-0.5 left-0.5 rounded border-2 border-ink px-1 text-[11px] leading-4 font-bold ${
                eff > 1
                  ? 'bg-emerald-400 text-[#10203a]'
                  : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
              }`}
            >
              {effectivenessLabel(eff)}
            </span>
          )
        : affinity && !locked && <AffinityMark className="absolute top-0.5 left-0.5 size-5" />}
    </button>
  );
  return statSort ? (
    <HoverBubble
      key={p.id}
      className="grid"
      focusable={false}
      height={140}
      content={<StatLines values={stats} total={power} />}
    >
      {card}
    </HoverBubble>
  ) : (
    card
  );
}

/** Légende de la grille. */
function BoxLegend({ v }: { v: TeamPickerModel }) {
  const { zone, statSort, combat, affinityHint, region } = v;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      {zone.affinityTypes.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          {combat ? (
            <span
              aria-hidden
              className="inline-block size-3.5 rounded border-2 border-emerald-500 dark:border-emerald-400"
            />
          ) : (
            <AffinityMark className="size-4" />
          )}
          {affinityHint}
        </span>
      )}
      {combat && (
        <span>
          <b className="text-emerald-600 dark:text-emerald-400">×2</b> /{' '}
          <b className="text-red-600 dark:text-red-400">×½</b> : meilleure efficacité
        </span>
      )}
      <span>
        <b className="text-emerald-600 dark:text-emerald-400">✦</b> talent qui agit ici
      </span>
      {statSort && <span className="max-sm:hidden">Statistiques au survol</span>}
      {region && <span>Pokédex de {region.name} seulement</span>}
    </p>
  );
}
