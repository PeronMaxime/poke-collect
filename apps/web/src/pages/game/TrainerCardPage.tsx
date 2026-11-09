import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Reorder } from 'motion/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { STAT_NAMES } from '@poke/data';
import { MAX_IV, earnedBadges, memberPower, pokemonPower } from '@poke/game-core';
import type { GameContext, PlayerProgress } from '@poke/game-core';
import { FEATURED_POKEMON_MAX } from '@poke/shared';
import type {
  FavoritePokemonDto,
  FeaturedPokemonDto,
  FeaturedPokemonInput,
  PlayerProfileDto,
  PokemonDto,
  TrainerCardResponse,
  TrainerProfileResponse,
} from '@poke/shared';
import { PokemonSprite, ShinyStar, ViewTabs } from '../../components/ui';
import { PokemonTagBadges, TagFilterSelect } from '../../components/tags';
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
import { abilityLabel, errorText, formatMoney, natureLabel, speciesName } from '../../lib/labels';
import { BadgeIcon } from './BattlesPage';
import { ProgressiveItems } from '../../components/ProgressiveGrid';
import {
  CrossIcon,
  SECTION_TITLE,
  SELECTED_CELL,
  SLOT_BADGE,
  SLOT_BUTTON,
  SLOT_CLASS,
  StatusPill,
} from './dialogParts';
import { AbilityFilterSelect, GENDER_LABELS, PcSortSelect, usePcBrowser } from './PcBrowser';
import { TeamPickerDialog } from './TeamSection';
import { NameSearch, TypeFilterSelect, filterPill } from './TeamPicker';
import { DexView } from './PokedexPage';
import { visibleRegions } from './RegionTabs';
import { FavoritePicker } from './FavoritePicker';

/** Fiche d'un dresseur (`#trainer/<nom>`), ou son Pokédex (`#trainer/<nom>/pokedex`). */
export const trainerLink = (name: string, pokedex = false) =>
  `#trainer/${encodeURIComponent(name)}${pokedex ? '/pokedex' : ''}`;

/** Fiche publique d'une guilde (`#guild/<id>`), depuis une fiche dresseur ou le classement. */
export const guildLink = (id: string) => `#guild/${encodeURIComponent(id)}`;

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
                {r.favorite && (
                  <PokemonSprite
                    speciesId={r.favorite.speciesId}
                    formId={r.favorite.formId}
                    shiny={r.favorite.shiny}
                    size={32}
                  />
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
  const [choosingFavorite, setChoosingFavorite] = useState(false);
  const favorite =
    profile.favorite ??
    (profile.starterSpeciesId === null
      ? null
      : { speciesId: profile.starterSpeciesId, formId: null, shiny: false });
  return (
    <>
      <TrainerCardView
        ctx={ctx}
        trainer={profile}
        favorite={favorite}
        onChangeFavorite={() => setChoosingFavorite(true)}
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
      {choosingFavorite && (
        <FavoritePicker
          ctx={ctx}
          starterSpeciesId={profile.starterSpeciesId}
          current={profile.favorite}
          onClose={() => setChoosingFavorite(false)}
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
      favorite={data.favorite}
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
        openedRegionIds: new Set(data.progress.openedRegionIds),
      },
    [data],
  );
}

/** Identité, argent, Pokémon mis en avant, badges par région et statistiques cumulées. */
function TrainerCardView({
  ctx,
  trainer,
  favorite,
  onChangeFavorite,
  progress,
  shinySpecies,
  card: s,
  actions,
  featured,
}: {
  ctx: GameContext;
  trainer: Pick<PlayerProfileDto, 'trainerName' | 'createdAt' | 'currency'>;
  /** Pokémon favori (le starter s'il n'en a pas choisi). */
  favorite: FavoritePokemonDto | null;
  /** Sa propre fiche : ouvre le choix du favori. */
  onChangeFavorite?: () => void;
  progress: PlayerProgress;
  /** Espèces capturées en chromatique. */
  shinySpecies: number;
  card: TrainerCardResponse | undefined;
  actions?: ReactNode;
  featured?: ReactNode;
}) {
  const { unlocked } = visibleRegions(ctx, progress);
  const earned = new Set(earnedBadges(ctx, progress).map((t) => t.id));

  const stats: { label: string; value: string | number | undefined; hint?: string }[] = [
    { label: 'Espèces capturées', value: progress.caughtSpeciesIds.size, hint: 'Pokédex' },
    { label: 'Espèces chromatiques', value: shinySpecies, hint: 'Pokédex' },
    { label: 'Pokémon capturés', value: s?.captures, hint: 'En expédition' },
    { label: 'Pokémon possédés', value: s?.pokemonOwned, hint: 'Dans le PC' },
    { label: 'Chromatiques possédés', value: s?.shiniesOwned },
    { label: 'Chromatiques ratés', value: s?.shiniesMissed, hint: 'Rencontrés, pas capturés' },
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
      {/*
       * Mobile : sprite et identité sur une ligne, l'argent sur une bande pleine largeur dessous.
       * À partir de `sm` : trois colonnes, l'argent à droite.
       */}
      <section className="card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-5 sm:p-5">
        {favorite ? (
          <FavoriteWell ctx={ctx} favorite={favorite} onChange={onChangeFavorite} />
        ) : (
          <span />
        )}
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Dresseur</p>
          <h2 className="truncate text-2xl font-bold">{trainer.trainerName}</h2>
          {s?.guild && (
            <p className="truncate text-sm">
              Guilde :{' '}
              <a
                href={guildLink(s.guild.id)}
                className="font-medium text-brand-600 hover:underline dark:text-brand-500"
              >
                {s.guild.name}
              </a>
            </p>
          )}
          <p className="text-sm text-slate-500">
            Aventure commencée le{' '}
            {new Date(trainer.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
          </p>
        </div>
        <div className="col-span-2 flex min-w-0 items-baseline justify-between gap-3 border-t-2 border-ink/20 pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:text-right dark:border-slate-700">
          <p className="text-xs text-slate-500">Argent</p>
          <p className="min-w-0 text-right text-xl font-bold break-words text-amber-700 tabular-nums sm:text-2xl dark:text-amber-400">
            {formatMoney(trainer.currency)}
          </p>
        </div>
        {actions && <div className="col-span-full flex flex-wrap gap-2">{actions}</div>}
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

/** Pokémon favori de la fiche ; sur la sienne, un clic ouvre son choix. */
function FavoriteWell({
  ctx,
  favorite: f,
  onChange,
}: {
  ctx: GameContext;
  favorite: FavoritePokemonDto;
  onChange?: () => void;
}) {
  const name = `${speciesName(ctx, f.speciesId, f.formId)}${f.shiny ? ' chromatique' : ''}`;
  const sprite = (
    <PokemonSprite
      speciesId={f.speciesId}
      formId={f.formId}
      shiny={f.shiny}
      size={96}
      alt={onChange ? '' : name}
      className="size-16 sm:size-22"
    />
  );
  const well = `sprite-well size-18 sm:size-24 ${f.shiny ? 'shiny-well' : ''}`;
  if (!onChange) {
    return (
      <div className={well} title={name}>
        {sprite}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onChange}
      title={`${name} : changer de Pokémon favori`}
      aria-label={`Pokémon favori : ${name}. Changer`}
      className={`${well} group relative transition hover:brightness-105`}
    >
      {sprite}
      <span className="absolute -right-1.5 -bottom-1.5 rounded-md border-2 border-ink bg-tile px-1 font-pixel text-[8px] leading-4 uppercase group-hover:bg-selected">
        Changer
      </span>
    </button>
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
        p.isShiny ? 'shiny-card' : ''
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
  const [ids, setIds] = useState(initial);
  const [view, setView] = useState<'box' | 'showcase'>('box');
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const b = browser;
  const chosen = ids.flatMap((id) => byId.get(id) ?? []);
  // Ordre de la vitrine sans les Pokémon disparus du PC (transférés) : celui du glisser.
  const chosenIds = chosen.map((p) => p.id);

  /** Déplacement au clavier (flèches haut et bas sur une ligne de la vitrine). */
  function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (to < 0 || to >= chosenIds.length) return;
    const next = [...chosenIds];
    next.splice(to, 0, ...next.splice(index, 1));
    setIds(next);
  }
  const full = ids.length >= FEATURED_POKEMON_MAX;
  const filteredOut = b.filtered.length !== b.list.length;

  return (
    <TeamPickerDialog open onClose={onClose} title="Pokémon mis en avant">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:overflow-hidden">
        <ViewTabs
          className="mb-3 lg:hidden"
          tabs={[
            { id: 'box', label: 'Pokémon' },
            { id: 'showcase', label: 'Vitrine', badge: `${ids.length}/${FEATURED_POKEMON_MAX}` },
          ]}
          selected={view}
          onSelect={setView}
        />

        {/* La boîte : tous les Pokémon du PC. */}
        <div
          className={`flex min-w-0 flex-col gap-2.5 lg:min-h-0 ${view === 'showcase' ? 'max-lg:hidden' : ''}`}
        >
          {/* Téléphone : la vitrine en mini-cases, toucher l'une ouvre son onglet. */}
          <div className="tile flex flex-col gap-2 p-2.5 lg:hidden">
            <h3 className={SECTION_TITLE}>
              Vitrine {ids.length}/{FEATURED_POKEMON_MAX}
            </h3>
            <ol className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: FEATURED_POKEMON_MAX }, (_, i) => {
                const p = chosen[i];
                return (
                  <li key={p?.id ?? `free-${i}`} className="min-w-0">
                    {p ? (
                      <button
                        type="button"
                        onClick={() => setView('showcase')}
                        aria-label={`${speciesName(ctx, p.speciesId, p.formId)} : voir la vitrine`}
                        className={`sprite-well relative aspect-square w-full ${p.isShiny ? 'shiny-well' : ''}`}
                      >
                        <PokemonSprite
                          speciesId={p.speciesId}
                          formId={p.formId}
                          shiny={p.isShiny}
                          size={48}
                          className="h-auto w-[85%]"
                        />
                        <span className={`${SLOT_BADGE} absolute -top-1.5 -right-1.5`}>
                          {i + 1}
                        </span>
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
          </div>

          {/* Recherche, tri, puis filtres (repliés derrière un bouton sur téléphone). */}
          <section className="tile flex flex-col gap-2 p-2.5">
            <div className="flex items-center gap-2">
              <NameSearch
                value={b.search}
                onChange={b.setSearch}
                className="min-w-0 flex-1 py-1.5"
              />
              <button
                type="button"
                className="btn-ghost px-3 py-2 sm:hidden"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                Filtres{b.activeFilterCount > 0 && ` (${b.activeFilterCount})`}
              </button>
              <label className="hidden items-center gap-1.5 text-sm text-slate-500 sm:flex dark:text-slate-400">
                Trier
                <PcSortSelect browser={b} className="input w-auto py-1 text-sm" />
              </label>
            </div>
            <div
              className={`${filtersOpen ? 'flex' : 'hidden'} flex-wrap items-center gap-1.5 sm:flex`}
            >
              <label className="flex w-full items-center gap-1.5 text-sm text-slate-500 sm:hidden dark:text-slate-400">
                Trier
                <PcSortSelect browser={b} className="input w-auto py-1 text-sm" />
              </label>
              <TypeFilterSelect value={b.type} onChange={b.setType} className="py-1 text-sm" />
              <AbilityFilterSelect
                list={b.list}
                value={b.ability}
                onChange={b.setAbility}
                className="input w-auto py-1 text-sm"
              />
              <TagFilterSelect
                tags={b.tagFilter.tags}
                value={b.tagFilter.filter}
                onChange={b.tagFilter.setFilter}
                className="py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => b.setOnlyFavorites(!b.onlyFavorites)}
                title="Seulement les Pokémon marqués en favoris"
                aria-pressed={b.onlyFavorites}
                className={filterPill(b.onlyFavorites)}
              >
                ♥ Favoris
              </button>
              <button
                type="button"
                onClick={() => b.setOnlyShiny(!b.onlyShiny)}
                title="Seulement les Pokémon chromatiques"
                aria-pressed={b.onlyShiny}
                className={filterPill(b.onlyShiny)}
              >
                ★ Chromatiques
              </button>
              {b.activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={b.resetFilters}
                  className="text-sm text-brand-600 hover:underline dark:text-brand-400"
                >
                  Effacer les filtres ({b.activeFilterCount})
                </button>
              )}
              <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
                {filteredOut ? `${b.filtered.length} / ${b.list.length}` : b.list.length} Pokémon
              </span>
            </div>
          </section>

          <section
            aria-label="Pokémon du PC"
            className="tile p-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]">
              <ProgressiveItems items={b.filtered} resetKey={b.viewKey}>
                {({ p, species, power }) => {
                  const index = ids.indexOf(p.id);
                  const selected = index >= 0;
                  const locked = !selected && full;
                  const name = species?.nameFr ?? '';
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      disabled={locked}
                      aria-pressed={selected}
                      title={
                        locked
                          ? `Vitrine pleine (${FEATURED_POKEMON_MAX} Pokémon)`
                          : `${selected ? 'Retirer' : 'Ajouter'} ${name}`
                      }
                      className={`relative flex w-full min-w-0 flex-col items-center gap-0.5 rounded-md border-2 p-1 text-center transition disabled:cursor-not-allowed ${
                        selected
                          ? SELECTED_CELL
                          : 'border-transparent enabled:hover:border-well-line enabled:hover:bg-well/40'
                      }`}
                    >
                      <span
                        className={`sprite-well size-14 sm:size-16 ${p.isShiny ? 'shiny-well' : ''} ${
                          locked ? 'opacity-60' : ''
                        }`}
                      >
                        <PokemonSprite
                          speciesId={p.speciesId}
                          formId={p.formId}
                          shiny={p.isShiny}
                          size={56}
                          className="h-auto w-[92%]"
                        />
                      </span>
                      <span className="w-full truncate text-xs font-semibold">
                        {name} {p.isShiny && <ShinyStar />}
                      </span>
                      <span className="max-w-full truncate text-[11px] text-slate-500 dark:text-slate-400">
                        N.{p.level} ·<span className="max-sm:hidden"> PE</span> {power}
                      </span>
                      <PokemonTagBadges pokemon={p} tags={b.tagFilter.tags} />
                      {selected && (
                        <span className={`${SLOT_BADGE} absolute top-0.5 right-0.5`}>
                          {index + 1}
                        </span>
                      )}
                    </button>
                  );
                }}
              </ProgressiveItems>
              {b.filtered.length === 0 && (
                <p className="col-span-full p-3 text-sm text-slate-500 dark:text-slate-400">
                  {b.activeFilterCount === 0 ? (
                    'Aucun Pokémon dans ton PC.'
                  ) : (
                    <>
                      Aucun Pokémon avec ces filtres.{' '}
                      <button
                        type="button"
                        onClick={b.resetFilters}
                        className="text-brand-600 hover:underline dark:text-brand-400"
                      >
                        Effacer les filtres
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* La vitrine : l'ordre de la fiche, modifiable. */}
        <aside
          className={`tile flex min-w-0 flex-col gap-2.5 p-3 lg:min-h-0 ${view === 'box' ? 'max-lg:hidden' : ''}`}
        >
          <h3 className={SECTION_TITLE}>
            Vitrine {ids.length} / {FEATURED_POKEMON_MAX}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Les autres dresseurs les voient sur ta fiche, dans cet ordre. Un Pokémon transféré en
            disparaît.
          </p>
          <div className="flex flex-col gap-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <Reorder.Group
              as="ol"
              axis="y"
              values={chosenIds}
              onReorder={setIds}
              className="flex flex-col gap-1.5"
            >
              {chosen.map((p, i) => (
                <FeaturedSlotRow
                  key={p.id}
                  ctx={ctx}
                  pokemon={p}
                  n={i + 1}
                  onMove={(delta) => move(i, delta)}
                  onRemove={() => toggle(p.id)}
                />
              ))}
            </Reorder.Group>
            {chosen.length > 1 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Glisse une ligne pour changer l’ordre.
              </p>
            )}
            <ol className="flex flex-col gap-1.5">
              {Array.from({ length: Math.max(0, FEATURED_POKEMON_MAX - chosen.length) }, (_, i) => (
                <li
                  key={`free-${i}`}
                  className="flex min-h-14 items-center gap-2 rounded-md border-2 border-dashed border-well-line px-1.5 text-sm text-slate-500 dark:text-slate-400"
                >
                  <span className="w-5 text-center font-pixel text-[10px]">
                    {chosen.length + i + 1}
                  </span>
                  Case libre : touche un Pokémon
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
        {save.error ? (
          <StatusPill tone="bad" text={errorText(save.error)} />
        ) : (
          <StatusPill
            tone={ids.length > 0 ? 'ok' : 'idle'}
            text={
              ids.length > 0
                ? `${ids.length} Pokémon en vitrine`
                : 'Touche les Pokémon à mettre en avant'
            }
          />
        )}
        <span className="hidden min-w-0 flex-1 sm:block" />
        <div className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setIds([])}
            disabled={ids.length === 0}
          >
            Vider
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary px-6"
            disabled={save.isPending}
            onClick={() => save.mutate(ids)}
          >
            Enregistrer
          </button>
        </div>
      </footer>
    </TeamPickerDialog>
  );
}

/**
 * Ligne de la vitrine : se glisse (souris ou doigt) pour changer l'ordre de la fiche, ou se
 * déplace au clavier avec les flèches haut et bas.
 */
function FeaturedSlotRow({
  ctx,
  pokemon: p,
  n,
  onMove,
  onRemove,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  n: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const name = speciesName(ctx, p.speciesId, p.formId);
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const row = e.currentTarget;
    onMove(e.key === 'ArrowUp' ? -1 : 1);
    // La ligne change de place dans le DOM : elle garde le focus.
    requestAnimationFrame(() => row.focus());
  };
  return (
    <Reorder.Item
      as="li"
      value={p.id}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      aria-label={`${n}. ${name} (flèches haut et bas pour changer l’ordre)`}
      title="Glisser pour changer l’ordre"
      // Image du sprite inerte : sinon le navigateur lance son propre glisser d'image.
      className={`${SLOT_CLASS} relative grid min-h-14 cursor-grab touch-none grid-cols-[1.25rem_3.25rem_minmax(0,1fr)_auto_auto] items-center gap-2 border-well-line p-1.5 select-none [&_img]:pointer-events-none ${
        dragging ? 'z-10 cursor-grabbing border-amber-600 shadow-xl dark:border-[#f8d878]' : ''
      }`}
    >
      <span className="text-center font-pixel text-[10px] text-slate-500 dark:text-slate-400">
        {n}
      </span>
      <span className={`sprite-well size-13 ${p.isShiny ? 'shiny-well' : ''}`}>
        <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={48} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">
          {name} {p.isShiny && <ShinyStar />}
        </span>
        <span className="truncate text-xs text-slate-500 dark:text-slate-400">
          N.{p.level} · PE {memberPower(ctx, p)}
        </span>
      </span>
      <svg
        viewBox="0 0 6 10"
        width="9"
        height="15"
        shapeRendering="crispEdges"
        className="text-slate-400"
        aria-hidden
      >
        <path
          d="M0 0h2v2h-2zM4 0h2v2h-2zM0 4h2v2h-2zM4 4h2v2h-2zM0 8h2v2h-2zM4 8h2v2h-2z"
          fill="currentColor"
        />
      </svg>
      <button
        type="button"
        className={`${SLOT_BUTTON} hover:border-red-500 hover:text-red-600 dark:hover:text-red-400`}
        // Un appui sur la croix ne lance pas le glisser de la ligne.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-label={`Retirer ${name}`}
      >
        <CrossIcon className="size-2.5" />
      </button>
    </Reorder.Item>
  );
}
