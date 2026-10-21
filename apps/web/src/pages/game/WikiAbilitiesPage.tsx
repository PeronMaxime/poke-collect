import { useMemo, useState } from 'react';
import { abilities as abilityData } from '@poke/data';
import { ABILITY_ACTIVITY_LABELS, abilityEffectSummary, effectActivities } from '@poke/game-core';
import type { AbilityActivity, GameContext } from '@poke/game-core';
import { PokemonSprite } from '../../components/ui';
import { abilityLabel } from '../../lib/labels';
import { WikiBreadcrumb } from './WikiBreadcrumb';
import { searchKey, wikiAbilities, wikiAbilityLink, wikiLink, wikiPokemonLink } from './wiki';
import type { AbilityHolderEntry } from './wiki';

const ACTIVITIES = Object.keys(ABILITY_ACTIVITY_LABELS) as AbilityActivity[];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const gameDescriptions = new Map(abilityData.map((a) => [a.name, a.descriptionFr]));

/** Talent tel que présenté au joueur : effet en jeu et activités où il agit. */
interface WikiAbility {
  id: string;
  name: string;
  effect: string | null;
  activities: AbilityActivity[];
  holders: AbilityHolderEntry[];
}

function useWikiAbilities(ctx: GameContext): WikiAbility[] {
  return useMemo(
    () =>
      wikiAbilities(ctx)
        .map(({ id, holders }) => ({
          id,
          name: abilityLabel(id),
          effect: abilityEffectSummary(ctx, id),
          activities: [
            ...new Set(ctx.ability(id)?.effects.flatMap((e) => effectActivities(e)) ?? []),
          ].sort((a, b) => ACTIVITIES.indexOf(a) - ACTIVITIES.indexOf(b)),
          holders,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [ctx],
  );
}

/** Talents des Pokémon des régions activées, ou détail d'un talent (`selected`). */
export function WikiAbilitiesPage({
  ctx,
  selected,
}: {
  ctx: GameContext;
  selected: string | null;
}) {
  const all = useWikiAbilities(ctx);
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState<AbilityActivity | 'all' | 'none'>('all');
  const [sort, setSort] = useState<'name' | 'holders'>('name');

  if (selected) {
    const ability = all.find((a) => a.id === selected);
    return (
      <div className="space-y-4">
        <WikiBreadcrumb
          items={[
            { label: 'Talents', href: wikiLink('talents') },
            { label: ability?.name ?? abilityLabel(selected) },
          ]}
        />
        {ability ? (
          <AbilityCard ability={ability} detailed />
        ) : (
          <p className="text-slate-500">Aucun Pokémon des régions actuelles n’a ce talent.</p>
        )}
      </div>
    );
  }

  const query = searchKey(search.trim());
  const list = all
    .filter(
      (a) =>
        (!query || searchKey(a.name).includes(query)) &&
        (activity === 'all' ||
          (activity === 'none' ? a.effect === null : a.activities.includes(activity))),
    )
    .sort((a, b) => (sort === 'holders' ? b.holders.length - a.holders.length : 0));

  return (
    <div className="space-y-4">
      <WikiBreadcrumb items={[{ label: 'Talents' }]} />
      <div className="card space-y-2 p-4">
        <p className="text-sm text-slate-500">
          Chaque Pokémon a un talent, tiré à sa rencontre parmi ceux de son espèce. Certains
          agissent en expédition, d’autres en combat, en donjon ou à la Pension.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-64"
            placeholder="Rechercher un talent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input w-auto"
            value={activity}
            onChange={(e) => setActivity(e.target.value as typeof activity)}
          >
            <option value="all">Toutes les activités</option>
            {ACTIVITIES.map((a) => (
              <option key={a} value={a}>
                {capitalize(ABILITY_ACTIVITY_LABELS[a])}
              </option>
            ))}
            <option value="none">Sans effet en jeu</option>
          </select>
          <select
            className="input w-auto"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="name">Trier par nom</option>
            <option value="holders">Trier par nombre de Pokémon</option>
          </select>
          <span className="ml-auto text-sm text-slate-500">{list.length} talents</span>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-slate-500">Aucun talent ne correspond à ces critères.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((a) => (
            <AbilityCard key={a.id} ability={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Nombre de porteurs affichés sur la liste (tous sur la page du talent). */
const PREVIEW_HOLDERS = 10;

function AbilityCard({ ability, detailed = false }: { ability: WikiAbility; detailed?: boolean }) {
  const holders = detailed ? ability.holders : ability.holders.slice(0, PREVIEW_HOLDERS);
  const more = ability.holders.length - holders.length;
  const description = gameDescriptions.get(ability.id);
  return (
    <section className="card space-y-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={detailed ? 'text-xl font-bold' : 'font-semibold'}>
          {detailed ? (
            ability.name
          ) : (
            <a href={wikiAbilityLink(ability.id)} className="hover:text-brand-600 hover:underline">
              {ability.name}
            </a>
          )}
        </h3>
        <span className="flex flex-wrap gap-1">
          {ability.activities.map((a) => (
            <span
              key={a}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {capitalize(ABILITY_ACTIVITY_LABELS[a])}
            </span>
          ))}
        </span>
      </div>
      <p className={`text-sm ${ability.effect ? '' : 'text-slate-400 italic'}`}>
        {ability.effect ?? 'Pas encore d’effet en jeu.'}
      </p>
      {detailed && description && (
        <p className="text-xs text-slate-400">Dans les jeux Pokémon : {description}</p>
      )}
      <div>
        <p className="mb-1 text-xs text-slate-500">
          {ability.holders.length} Pokémon {ability.holders.length > 1 ? 'peuvent' : 'peut'} l’avoir
          {detailed && ' (en violet : talent caché)'}
        </p>
        <div className="flex flex-wrap gap-1">
          {holders.map(({ entry, hidden }) => (
            <a
              key={`${entry.speciesId}:${entry.formId}`}
              href={wikiPokemonLink(entry.speciesId, entry.formId)}
              title={`${entry.species.nameFr}${hidden ? ' (talent caché)' : ''}`}
              className={`flex items-center rounded-lg border ${
                detailed ? 'gap-1 py-0.5 pr-2 text-xs' : ''
              } ${
                hidden
                  ? 'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40'
                  : 'border-slate-200 dark:border-slate-800'
              } hover:border-brand-500/60`}
            >
              <PokemonSprite speciesId={entry.speciesId} formId={entry.formId} size={40} />
              {detailed && entry.species.nameFr}
            </a>
          ))}
          {more > 0 && (
            <a
              href={wikiAbilityLink(ability.id)}
              className="grid min-w-10 place-items-center rounded-lg border border-dashed border-slate-300 px-2 text-xs text-slate-500 hover:border-brand-500/60 dark:border-slate-700"
            >
              +{more}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
