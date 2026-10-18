import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { STAT_NAMES } from '@poke/data';
import { MAX_IV, earnedBadges, pokemonPower } from '@poke/game-core';
import type { GameContext, PlayerProgress } from '@poke/game-core';
import { FEATURED_POKEMON_MAX } from '@poke/shared';
import type {
  FeaturedPokemonDto,
  FeaturedPokemonInput,
  PlayerProfileDto,
  TrainerCardResponse,
  TrainerProfileResponse,
} from '@poke/shared';
import { Modal, PokemonSprite, ShinyStar, useNow } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  keys,
  useDexCatches,
  usePlayerProgress,
  usePokemon,
  useTrainerCard,
  useTrainerPokedex,
  useTrainerProfile,
  useTrainerSearch,
} from '../../lib/game';
import { abilityLabel, errorText, formatMoney, natureLabel } from '../../lib/labels';
import { BadgeIcon } from './BattlesPage';
import { GENDER_LABELS, PcFilterBar, PcPokemonCard, usePcBrowser } from './PcBrowser';
import { DexView } from './PokedexPage';
import { visibleRegions } from './RegionTabs';

/** Fiche d'un dresseur (`#trainer/<nom>`), ou son Pokédex (`#trainer/<nom>/pokedex`). */
export const trainerLink = (name: string, pokedex = false) =>
  `#trainer/${encodeURIComponent(name)}${pokedex ? '/pokedex' : ''}`;

interface Route {
  /** Dresseur consulté ; null = sa propre fiche. */
  name: string | null;
  pokedex: boolean;
}

function routeFromHash(): Route {
  const [, name, sub] = window.location.hash.slice(1).split('/');
  return { name: name ? decodeURIComponent(name) : null, pokedex: sub === 'pokedex' };
}

/**
 * Fiche Dresseur : la sienne (avec ses Pokémon mis en avant), ou celle d'un autre joueur trouvé
 * par la recherche ou depuis les classements, avec son Pokédex.
 */
export function TrainerCardPage({ ctx, profile }: { ctx: GameContext; profile: PlayerProfileDto }) {
  const [route, setRoute] = useState(routeFromHash);
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const own = !route.name || route.name.toLowerCase() === profile.trainerName.toLowerCase();

  return (
    <div className="space-y-6">
      <TrainerSearch />
      {route.pokedex ? (
        <TrainerPokedex ctx={ctx} name={route.name ?? profile.trainerName} />
      ) : own ? (
        <OwnTrainerCard ctx={ctx} profile={profile} />
      ) : (
        <OtherTrainerCard key={route.name} ctx={ctx} name={route.name!} />
      )}
    </div>
  );
}

/** Recherche d'un dresseur par son nom (résultats après une courte pause de frappe). */
function TrainerSearch() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(text.trim()), 250);
    return () => window.clearTimeout(id);
  }, [text]);
  const search = useTrainerSearch(query);
  const results = query ? (search.data ?? []) : [];

  function open(name: string) {
    window.location.hash = trainerLink(name);
    setText('');
    setQuery('');
  }

  return (
    <div className="relative max-w-sm">
      <input
        className="input w-full"
        type="search"
        value={text}
        maxLength={16}
        placeholder="Chercher un dresseur…"
        aria-label="Chercher un dresseur"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) open(results[0].trainerName);
          if (e.key === 'Escape') setText('');
        }}
      />
      {query && text.trim() && (
        <div className="card absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto p-1 shadow-lg">
          {search.isPending ? (
            <p className="px-3 py-2 text-sm text-slate-500">Recherche…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Aucun dresseur trouvé.</p>
          ) : (
            results.map((r) => (
              <button
                key={r.trainerName}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => open(r.trainerName)}
              >
                {r.starterSpeciesId !== null && (
                  <PokemonSprite speciesId={r.starterSpeciesId} size={32} />
                )}
                <span className="truncate">{r.trainerName}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Sa propre fiche : Pokémon mis en avant modifiables. */
function OwnTrainerCard({ ctx, profile }: { ctx: GameContext; profile: PlayerProfileDto }) {
  const progress = usePlayerProgress();
  const dex = useDexCatches();
  const card = useTrainerCard();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <TrainerCardView
        ctx={ctx}
        trainer={profile}
        progress={progress}
        shinySpecies={dex.caughtShinySpeciesIds.size}
        card={card.data}
        featured={
          <FeaturedSection
            ctx={ctx}
            pokemon={card.data?.featured}
            action={
              <button className="btn-ghost py-1" onClick={() => setEditing(true)}>
                Modifier
              </button>
            }
            empty={`Mets en avant jusqu’à ${FEATURED_POKEMON_MAX} Pokémon de ton PC : les autres dresseurs les verront sur ta fiche.`}
          />
        }
      />
      {editing && card.data && (
        <FeaturedEditor
          ctx={ctx}
          initial={card.data.featured.map((p) => p.id)}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

/** Fiche d'un autre dresseur, en lecture seule. */
function OtherTrainerCard({ ctx, name }: { ctx: GameContext; name: string }) {
  const query = useTrainerProfile(name);
  const data = query.data;
  const progress = useForeignProgress(data);
  if (query.isError) return <NotFound error={query.error} />;
  if (!data || !progress) return <p className="text-slate-500">Chargement…</p>;
  return (
    <TrainerCardView
      ctx={ctx}
      trainer={data}
      progress={progress}
      shinySpecies={data.progress.caughtShinySpeciesIds.length}
      card={data.card}
      actions={
        <a className="btn-primary" href={trainerLink(data.trainerName, true)}>
          Voir son Pokédex
        </a>
      }
      featured={
        data.card.featured.length > 0 && <FeaturedSection ctx={ctx} pokemon={data.card.featured} />
      }
    />
  );
}

/** Pokédex d'un dresseur, en lecture seule. */
function TrainerPokedex({ ctx, name }: { ctx: GameContext; name: string }) {
  const trainer = useTrainerProfile(name);
  const dex = useTrainerPokedex(name);
  const progress = useForeignProgress(trainer.data);
  const error = trainer.error ?? dex.error;
  if (error) return <NotFound error={error} />;
  if (!trainer.data || !dex.data || !progress) return <p className="text-slate-500">Chargement…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Pokédex de {trainer.data.trainerName}</h2>
        <a className="btn-ghost" href={trainerLink(trainer.data.trainerName)}>
          ← Sa fiche
        </a>
      </div>
      <DexView ctx={ctx} foreign={{ ...dex.data, progress }} />
    </div>
  );
}

function NotFound({ error }: { error: unknown }) {
  return (
    <div className="card space-y-2 p-5">
      <p className={error instanceof ApiError && error.status === 404 ? '' : 'text-red-600'}>
        {errorText(error)}
      </p>
      <a className="btn-ghost inline-block" href="#trainer">
        ← Ma fiche
      </a>
    </div>
  );
}

/** Avancement d'un autre dresseur, au format de `game-core`. */
function useForeignProgress(data: TrainerProfileResponse | undefined): PlayerProgress | undefined {
  return useMemo(
    () =>
      data && {
        caughtSpeciesIds: new Set(data.progress.caughtSpeciesIds),
        defeatedTrainerIds: new Set(data.progress.defeatedTrainerIds),
        eggsHatched: data.progress.eggsHatched,
        questSteps: new Map(Object.entries(data.progress.questSteps)),
      },
    [data],
  );
}

/** Identité, argent, Pokémon mis en avant, badges par région et statistiques cumulées. */
function TrainerCardView({
  ctx,
  trainer,
  progress,
  shinySpecies,
  card: s,
  actions,
  featured,
}: {
  ctx: GameContext;
  trainer: Pick<PlayerProfileDto, 'trainerName' | 'starterSpeciesId' | 'createdAt' | 'currency'>;
  progress: PlayerProgress;
  /** Espèces capturées en chromatique. */
  shinySpecies: number;
  card: TrainerCardResponse | undefined;
  actions?: ReactNode;
  featured?: ReactNode;
}) {
  const { unlocked } = visibleRegions(ctx, progress);
  const earned = new Set(earnedBadges(ctx, progress).map((t) => t.id));
  const starter = trainer.starterSpeciesId;

  const stats: { label: string; value: string | number | undefined; hint?: string }[] = [
    { label: 'Espèces capturées', value: progress.caughtSpeciesIds.size, hint: 'Pokédex' },
    { label: 'Espèces chromatiques', value: shinySpecies, hint: 'Pokédex' },
    { label: 'Pokémon capturés', value: s?.captures, hint: 'En expédition' },
    { label: 'Pokémon possédés', value: s?.pokemonOwned, hint: 'Dans le PC' },
    { label: 'Chromatiques possédés', value: s?.shiniesOwned },
    { label: 'Shiny ratés', value: s?.shiniesMissed, hint: 'Rencontrés, pas capturés' },
    { label: 'Expéditions terminées', value: s?.expeditionsCompleted },
    { label: 'Combats gagnés', value: s?.battlesWon },
    { label: 'Combats perdus', value: s?.battlesLost },
    { label: 'Dresseurs battus', value: s?.trainersDefeated, hint: 'Différents' },
    { label: 'Donjons réussis', value: s?.dungeonsCleared },
    { label: 'Méga-Gemmes', value: s?.megaStonesOwned, hint: 'Différentes possédées' },
    { label: 'Œufs éclos', value: s?.eggsHatched },
    { label: 'Fossiles restaurés', value: s?.fossilsRevived },
    { label: 'Quêtes accomplies', value: s?.questsCompleted },
    {
      label: 'Dépenses en boutique',
      value: s ? formatMoney(s.moneySpent) : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center gap-5 p-5">
        {starter !== null && <PokemonSprite speciesId={starter} size={96} />}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">Dresseur</p>
          <h2 className="text-2xl font-bold">{trainer.trainerName}</h2>
          <p className="text-sm text-slate-500">
            Aventure commencée le{' '}
            {new Date(trainer.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Argent</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
            {formatMoney(trainer.currency)}
          </p>
        </div>
        {actions && <div className="flex w-full flex-wrap gap-2">{actions}</div>}
      </section>

      {featured}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Badges</h2>
        <div className="space-y-3">
          {unlocked.map((region) => {
            const badges = ctx.trainers.filter((t) => t.badge && t.regionId === region.id);
            if (badges.length === 0) return null;
            const count = badges.filter((t) => earned.has(t.id)).length;
            return (
              <div key={region.id} className="card p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="font-semibold">{region.name}</h3>
                  <span className="text-sm text-slate-500">
                    {count} / {badges.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {badges.map((t) => (
                    <div
                      key={t.id}
                      className={`flex items-center gap-2 text-sm ${earned.has(t.id) ? '' : 'opacity-30 grayscale'}`}
                      title={earned.has(t.id) ? `Remporté contre ${t.name}` : `Battre ${t.name}`}
                    >
                      <BadgeIcon badge={t.badge!} size={36} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.badge!.name}</span>
                        <span className="block truncate text-xs text-slate-500">{t.name}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Statistiques</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="card p-4">
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {stat.value === undefined
                  ? '…'
                  : typeof stat.value === 'number'
                    ? stat.value.toLocaleString('fr-FR')
                    : stat.value}
              </p>
              {stat.hint && <p className="text-xs text-slate-400">{stat.hint}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Vitrine des Pokémon mis en avant. */
function FeaturedSection({
  ctx,
  pokemon,
  action,
  empty,
}: {
  ctx: GameContext;
  pokemon: FeaturedPokemonDto[] | undefined;
  action?: ReactNode;
  /** Texte affiché sans Pokémon mis en avant. */
  empty?: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Pokémon mis en avant</h2>
        {action}
      </div>
      {!pokemon ? (
        <p className="text-slate-500">Chargement…</p>
      ) : pokemon.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {pokemon.map((p) => (
            <FeaturedPokemonCard key={p.id} ctx={ctx} pokemon={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function FeaturedPokemonCard({
  ctx,
  pokemon: p,
}: {
  ctx: GameContext;
  pokemon: FeaturedPokemonDto;
}) {
  const species = ctx.species(p.speciesId, p.formId);
  const perfect = STAT_NAMES.filter((stat) => p.ivs[stat] === MAX_IV).length;
  return (
    <div
      className={`card flex flex-col items-center p-3 text-center text-xs ${
        p.isShiny ? 'ring-1 ring-amber-300 dark:ring-amber-700' : ''
      }`}
    >
      <PokemonSprite
        speciesId={p.speciesId}
        formId={p.formId}
        shiny={p.isShiny}
        kind="artwork"
        size={88}
      />
      <span className="mt-1 max-w-full truncate text-sm font-semibold">
        {species?.nameFr}
        {p.gender !== 'genderless' && (
          <span className={p.gender === 'male' ? 'text-sky-500' : 'text-pink-500'}>
            {' '}
            {GENDER_LABELS[p.gender]}
          </span>
        )}{' '}
        {p.isShiny && <ShinyStar />}
      </span>
      <span className="text-slate-500">
        N.{p.level}
        {species && ` · PE ${pokemonPower(species, p)}`}
      </span>
      <span className="text-slate-500">
        {natureLabel(p.nature)} · {abilityLabel(p.ability)}
      </span>
      {perfect > 0 && (
        <span className="mt-0.5 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {perfect} IV parfait{perfect > 1 ? 's' : ''}
        </span>
      )}
      <span className="mt-0.5 text-[10px] text-slate-400">
        Obtenu le {new Date(p.caughtAt).toLocaleDateString('fr-FR')}
      </span>
    </div>
  );
}

/** Choix des Pokémon du PC mis en avant (au plus `FEATURED_POKEMON_MAX`, dans l'ordre du clic). */
function FeaturedEditor({
  ctx,
  initial,
  onClose,
}: {
  ctx: GameContext;
  initial: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pokemon = usePokemon();
  const browser = usePcBrowser(ctx, pokemon.data ?? []);
  const now = useNow();
  const [ids, setIds] = useState(initial);
  const byId = new Map((pokemon.data ?? []).map((p) => [p.id, p]));
  const save = useMutation({
    mutationFn: (pokemonIds: string[]) =>
      api<FeaturedPokemonDto[]>('/api/trainer-card/featured', {
        method: 'PUT',
        json: { pokemonIds } satisfies FeaturedPokemonInput,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.trainerCard });
      onClose();
    },
  });

  function toggle(id: string) {
    setIds((list) =>
      list.includes(id)
        ? list.filter((x) => x !== id)
        : list.length < FEATURED_POKEMON_MAX
          ? [...list, id]
          : list,
    );
  }

  return (
    <Modal open onClose={onClose} wide className="flex max-h-[90vh] flex-col p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Pokémon mis en avant</h2>
        <span className="text-sm text-slate-500">
          {ids.length} / {FEATURED_POKEMON_MAX}
        </span>
      </div>
      <p className="mb-2 text-sm text-slate-500">
        Touche les Pokémon de ton PC à montrer sur ta fiche. Un Pokémon transféré en disparaît.
      </p>
      <div className="mb-3 grid grid-cols-6 gap-1">
        {Array.from({ length: FEATURED_POKEMON_MAX }, (_, i) => {
          const p = byId.get(ids[i] ?? '');
          return p ? (
            <button
              key={p.id}
              type="button"
              className="rounded-lg border border-brand-500 bg-brand-500/10"
              onClick={() => toggle(p.id)}
              title="Retirer"
            >
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={44}
              />
            </button>
          ) : (
            <span
              key={i}
              className="aspect-square rounded-lg border border-dashed border-slate-300 dark:border-slate-700"
            />
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PcFilterBar ctx={ctx} browser={browser} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {browser.filtered.map((entry) => {
            const index = ids.indexOf(entry.p.id);
            return (
              <PcPokemonCard
                key={entry.p.id}
                entry={entry}
                tags={browser.tagFilter.tags}
                now={now}
                onSelect={() => toggle(entry.p.id)}
                topLeft={
                  index >= 0 && (
                    <span className="absolute top-1.5 left-2 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                  )
                }
                className={index >= 0 ? 'ring-2 ring-brand-500' : ''}
              />
            );
          })}
        </div>
      </div>
      {save.error && <p className="mt-2 text-sm text-red-600">{errorText(save.error)}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate(ids)}>
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}
