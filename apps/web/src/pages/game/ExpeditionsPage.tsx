import { Fragment, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Zone } from '@poke/content';
import {
  chainMultiplier,
  chainPerfectIvs,
  isUnlocked,
  isUnlockedSoon,
  isZoneUnlocked,
  regionDexProgress,
} from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  ClaimExpeditionResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  PlayerProfileDto,
  PokemonDto,
  ShinyChainDto,
} from '@poke/shared';
import { CancelButton, PokemonSprite, ProgressBar, TypeBadge, useNow } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  keys,
  useExpeditions,
  usePlayerProgress,
  usePokedex,
  usePokedexForms,
  usePokemon,
} from '../../lib/game';
import {
  GAME_ERRORS,
  formatCountdown,
  formatDuration,
  formatMultiplier,
  itemName,
  speciesName,
  unlockConditionText,
} from '../../lib/labels';
import { LaunchExpeditionDialog } from './LaunchExpeditionDialog';
import { LegendaryEncounterDialog } from './LegendaryEncounterDialog';
import { LootReveal } from './LootReveal';
import { RegionStarterCard } from './RegionStarterCard';
import { RegionTabs, currentRegionTab, useSavedRegionTab } from './RegionTabs';

/** Lien vers une zone (`#expeditions/<zone>`), depuis le Pokédex. */
export const zoneLink = (zoneId: string) => `#expeditions/${zoneId}`;

function zoneFromHash(): string | null {
  const [tab, zoneId] = window.location.hash.slice(1).split('/');
  return tab === 'expeditions' && zoneId ? decodeURIComponent(zoneId) : null;
}

export function ExpeditionsPage({ ctx, profile }: { ctx: GameContext; profile: PlayerProfileDto }) {
  const queryClient = useQueryClient();
  const expeditions = useExpeditions();
  const pokedex = usePokedex();
  const pokedexForms = usePokedexForms();
  const pokemon = usePokemon();
  const now = useNow();
  const [launchZone, setLaunchZone] = useState<Zone | null>(null);
  const [reveal, setReveal] = useState<ClaimExpeditionResponse | null>(null);
  const [encounter, setEncounter] = useState<ExpeditionDto | null>(null);
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('expeditions');
  const [linkedZoneId, setLinkedZoneId] = useState(zoneFromHash);
  const [notice, setNotice] = useState<string | null>(null);

  const claim = useMutation({
    mutationFn: (id: string) =>
      api<ClaimExpeditionResponse>(`/api/expeditions/${id}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      setReveal(data);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const favorite = useMutation({
    mutationFn: ({ zoneId, on }: { zoneId: string; on: boolean }) =>
      api<{ favoriteZoneIds: string[] }>(`/api/expeditions/favorites/${zoneId}`, {
        method: 'PUT',
        json: { favorite: on },
      }),
    onSuccess: ({ favoriteZoneIds }) =>
      queryClient.setQueryData<ExpeditionsResponse>(
        keys.expeditions,
        (data) => data && { ...data, favoriteZoneIds },
      ),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api<void>(`/api/expeditions/${id}/cancel`, { method: 'POST' }),
    onSuccess: () =>
      Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });

  const progress = usePlayerProgress();
  const seen = new Set(pokedex.data?.filter((d) => d.seen).map((d) => d.speciesId));
  const caught = new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId));
  const caughtForms = new Set(pokedexForms.data?.map((f) => f.formId));
  // Décalage entre l'horloge du serveur et celle du navigateur, pour des comptes à rebours justes.
  const offset = expeditions.data
    ? Date.parse(expeditions.data.serverTime) - expeditions.dataUpdatedAt
    : 0;
  const serverNow = now + offset;
  const active = expeditions.data?.active ?? [];
  const slots = expeditions.data?.slots ?? 0;
  const freeSlots = slots - active.length;
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const chains = new Map(expeditions.data?.chains.map((c) => [c.zoneId, c]));
  // Favoris : affichage optimiste pendant l'enregistrement.
  const favoriteIds = new Set(expeditions.data?.favoriteZoneIds);
  if (favorite.isPending) {
    if (favorite.variables.on) favoriteIds.add(favorite.variables.zoneId);
    else favoriteIds.delete(favorite.variables.zoneId);
  }
  const favoriteZones = [...favoriteIds].flatMap((id) => ctx.zone(id) ?? []);

  // Arrivée par un lien de zone : l'ancre est consommée, puis le lancement s'ouvre (une fois les
  // emplacements connus) s'il en reste un de libre.
  useEffect(() => {
    const consume = () => {
      const zoneId = zoneFromHash();
      if (zoneId) history.replaceState(null, '', '#expeditions');
      return zoneId;
    };
    consume();
    const onHash = () => setLinkedZoneId(consume());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (linkedZoneId && expeditions.data) {
    setLinkedZoneId(null);
    const zone = ctx.zone(linkedZoneId);
    if (zone) {
      setSelectedRegion(zone.regionId);
      setNotice(
        freeSlots > 0
          ? null
          : `Aucun emplacement libre pour partir vers ${zone.name} : récupère ou annule une expédition en cours.`,
      );
      if (freeSlots > 0) setLaunchZone(zone);
    }
  }

  // Région suivante débloquée : son starter, à choisir une fois.
  const needsStarter = (id: string) => {
    const r = ctx.region(id);
    return (
      !!r &&
      r.id !== profile.regionUnlocked &&
      r.starterSpeciesIds.length > 0 &&
      !(r.id in profile.regionStarters) &&
      isUnlocked(ctx, r.unlock, progress)
    );
  };
  const regionId = currentRegionTab(ctx, progress, selectedRegion);
  const region = ctx.region(regionId);
  const dex = regionDexProgress(ctx, regionId, progress);
  // Zones débloquées et celles du prochain badge ; les autres apparaîtront plus tard.
  const regionZones = ctx.zones
    .filter((z) => z.regionId === regionId)
    .map((zone) => ({ zone, unlocked: isZoneUnlocked(ctx, zone, progress) }));
  const visibleZones = regionZones.filter(
    ({ zone, unlocked }) => unlocked || isUnlockedSoon(ctx, zone.unlock, progress),
  );
  const hiddenZones = regionZones.length - visibleZones.length;
  const zoneCard = (zone: Zone, unlocked: boolean) => (
    <ZoneCard
      key={zone.id}
      ctx={ctx}
      zone={zone}
      seen={seen}
      caught={caught}
      caughtForms={caughtForms}
      unlocked={unlocked}
      canLaunch={freeSlots > 0}
      chain={chains.get(zone.id)}
      serverNow={serverNow}
      onLaunch={() => setLaunchZone(zone)}
      favorite={favoriteIds.has(zone.id)}
      onFavorite={(on) => favorite.mutate({ zoneId: zone.id, on })}
    />
  );

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Expéditions en cours</h2>
          <span className="text-sm text-slate-500">
            {active.length} / {slots} emplacements
          </span>
        </div>
        {notice && (
          <p className="mb-3 flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {notice}
            <button onClick={() => setNotice(null)} aria-label="Fermer">
              ✕
            </button>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: slots }, (_, slot) => {
            const exp = active.find((e) => e.slotIndex === slot);
            return exp ? (
              <ActiveExpedition
                key={exp.id}
                ctx={ctx}
                expedition={exp}
                serverNow={serverNow}
                teamSpecies={exp.team.map((id) => pokemonById.get(id))}
                claiming={claim.isPending && claim.variables === exp.id}
                onClaim={() =>
                  // Expédition légendaire : on découvre le légendaire avant de lancer la Ball.
                  exp.questId && exp.balls === 0 ? setEncounter(exp) : claim.mutate(exp.id)
                }
                cancelling={cancel.isPending && cancel.variables === exp.id}
                onCancel={() => cancel.mutate(exp.id)}
              />
            ) : (
              <div
                key={slot}
                className="grid min-h-32 place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700"
              >
                Emplacement libre — choisis une zone ci-dessous.
              </div>
            );
          })}
        </div>
        {[claim.error, cancel.error, favorite.error].map(
          (error, i) =>
            error && (
              <p key={i} className="mt-2 text-sm text-red-600">
                {error instanceof ApiError
                  ? (GAME_ERRORS[error.code] ?? error.code)
                  : 'Erreur inconnue'}
              </p>
            ),
        )}
      </section>

      {favoriteZones.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">★ Favoris</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {favoriteZones.map((zone) => zoneCard(zone, isZoneUnlocked(ctx, zone, progress)))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <RegionTabs
          ctx={ctx}
          progress={progress}
          selected={regionId}
          onSelect={setSelectedRegion}
          marker={(id) => (needsStarter(id) ? 'Starter à choisir' : null)}
        />
        {region && (
          <>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Zones de {region.name}</h2>
              <span className="text-sm text-slate-500">
                Pokédex : {dex.caught} / {dex.total}
              </span>
            </div>
            {needsStarter(region.id) && <RegionStarterCard ctx={ctx} region={region} />}
            <div className="grid gap-3 md:grid-cols-2">
              {visibleZones.map(({ zone, unlocked }) => zoneCard(zone, unlocked))}
            </div>
            {hiddenZones > 0 && (
              <p className="text-center text-sm text-slate-500">
                {hiddenZones} autre{hiddenZones > 1 ? 's' : ''} zone{hiddenZones > 1 ? 's' : ''} à
                découvrir en progressant dans l’aventure.
              </p>
            )}
          </>
        )}
      </section>

      {launchZone && (
        <LaunchExpeditionDialog
          ctx={ctx}
          zone={launchZone}
          chain={chains.get(launchZone.id)?.chain ?? 0}
          onClose={() => setLaunchZone(null)}
        />
      )}
      {encounter && (
        <LegendaryEncounterDialog
          ctx={ctx}
          expedition={encounter}
          onClose={() => setEncounter(null)}
          onClaimed={(data) => {
            setEncounter(null);
            setReveal(data);
          }}
        />
      )}
      <LootReveal ctx={ctx} data={reveal} onClose={() => setReveal(null)} />
    </div>
  );
}

function ActiveExpedition({
  ctx,
  expedition,
  serverNow,
  teamSpecies,
  claiming,
  onClaim,
  cancelling,
  onCancel,
}: {
  ctx: GameContext;
  expedition: ExpeditionDto;
  serverNow: number;
  teamSpecies: (PokemonDto | undefined)[];
  claiming: boolean;
  onClaim: () => void;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const start = Date.parse(expedition.startedAt);
  const end = Date.parse(expedition.endsAt);
  const done = serverNow >= end;
  const zone = expedition.zoneId ? ctx.zone(expedition.zoneId) : undefined;
  const quest = expedition.questId ? ctx.quest(expedition.questId) : undefined;
  const legendary = !!expedition.questId && expedition.balls === 0;
  return (
    <div
      className={`card group/exp relative p-4 ${done ? 'ring-2 ring-brand-500/50' : ''}`}
      tabIndex={0}
    >
      <ExpeditionSummary ctx={ctx} expedition={expedition} />
      <div className="flex items-start justify-between gap-2">
        <div>
          {expedition.questId && (
            <p className="text-xs font-medium text-amber-600">✦ Expédition légendaire</p>
          )}
          <p className="font-semibold">
            {zone?.name ?? quest?.name ?? expedition.zoneId ?? expedition.questId}
          </p>
          <p className="text-xs text-slate-500">
            {formatDuration(expedition.durationMinutes)}
            {expedition.shinyChain > 0 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                · ✦ chaîne {expedition.shinyChain}
              </span>
            )}
            {expedition.captureFilter && ' · captures filtrées'}
          </p>
        </div>
        <div className="flex -space-x-3">
          {teamSpecies.map((p, i) =>
            p ? (
              <PokemonSprite
                key={i}
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={48}
              />
            ) : null,
          )}
        </div>
      </div>
      <ProgressBar className="mt-3" value={(serverNow - start) / (end - start)} />
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-sm text-slate-500">
          {done ? 'Terminée !' : formatCountdown(end - serverNow)}
        </span>
        {done ? (
          <button className="btn-primary" disabled={claiming} onClick={onClaim}>
            {claiming ? 'Ouverture…' : legendary ? 'Découvrir le légendaire' : 'Récupérer'}
          </button>
        ) : (
          <CancelButton label="Annuler l’expédition" pending={cancelling} onConfirm={onCancel} />
        )}
      </div>
    </div>
  );
}

const SHINY_FILTER_LABELS = {
  any: null,
  always: 'shiny toujours tentés',
  only: 'shiny uniquement',
} as const;

/** Résumé d'une expédition en cours, au survol : équipe, Balls, baies et filtres de capture. */
function ExpeditionSummary({
  ctx,
  expedition: e,
}: {
  ctx: GameContext;
  expedition: ExpeditionDto;
}) {
  const filter = e.captureFilter;
  const time = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const legendary = !!e.questId && e.balls === 0;
  const rows: [string, string][] = [
    ['Durée', `${formatDuration(e.durationMinutes)} · retour ${time(e.endsAt)}`],
  ];
  if (legendary) rows.push(['Ball', 'au choix au retour (une seule lancée)']);
  else {
    rows.push([
      'Balls',
      e.ballItemId ? `${e.balls} × ${itemName(ctx, e.ballItemId)}` : 'aucune (observation)',
    ]);
    rows.push([
      'Baies',
      e.berryItemId ? `${e.berries} × ${itemName(ctx, e.berryItemId)}` : 'aucune',
    ]);
  }
  if (e.shinyChain > 0) {
    rows.push([
      'Chaîne',
      `${e.shinyChain} (shiny ${formatMultiplier(chainMultiplier(ctx, e.shinyChain))})`,
    ]);
  }
  const filters = filter
    ? [
        filter.newOnly && 'absents du Pokédex',
        filter.minPerfectIvs > 0 &&
          `au moins ${filter.minPerfectIvs} IV parfait${filter.minPerfectIvs > 1 ? 's' : ''}`,
        SHINY_FILTER_LABELS[filter.shiny],
      ].filter((f): f is string => !!f)
    : [];
  return (
    <div className="invisible absolute top-full left-0 z-30 mt-1 w-full min-w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs opacity-0 shadow-xl transition-opacity group-focus-within/exp:visible group-focus-within/exp:opacity-100 group-hover/exp:visible group-hover/exp:opacity-100 dark:border-slate-700 dark:bg-slate-900">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
        {!legendary && (
          <>
            <dt className="text-slate-500">Captures</dt>
            <dd>
              {filter && filter.speciesIds.length > 0 && (
                <span className="mb-0.5 flex flex-wrap gap-0.5">
                  {filter.speciesIds.map((id) => (
                    <PokemonSprite key={id} speciesId={id} size={32} alt={speciesName(ctx, id)} />
                  ))}
                </span>
              )}
              {filters.length > 0
                ? filters.join(' · ')
                : !filter?.speciesIds.length && 'tous les Pokémon rencontrés'}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

export function ZoneCard({
  ctx,
  zone,
  seen,
  caught,
  caughtForms,
  unlocked,
  canLaunch,
  chain,
  serverNow,
  onLaunch,
  favorite,
  onFavorite,
}: {
  ctx: GameContext;
  zone: Zone;
  seen: Set<number>;
  caught: Set<number>;
  /** Formes (régionales, Méga…) capturées : distinctes de l'espèce de base. */
  caughtForms: Set<number>;
  unlocked: boolean;
  canLaunch: boolean;
  chain: ShinyChainDto | undefined;
  serverNow: number;
  onLaunch: () => void;
  favorite: boolean;
  onFavorite: (on: boolean) => void;
}) {
  const expiresIn = chain?.expiresAt ? Date.parse(chain.expiresAt) - serverNow : null;
  const perfectIvs = chain ? chainPerfectIvs(ctx, chain.chain) : 0;
  // Espèces et formes rencontrées : en couleur une fois capturées, en gris si seulement vues,
  // une silhouette tant que l'espèce n'a pas été vue.
  const species = [
    ...new Map(
      zone.encounters
        .filter((e) => ctx.species(e.speciesId)?.enabled)
        .map((e) => [`${e.speciesId}:${e.formId ?? ''}`, e] as const),
    ).values(),
  ];
  const unlock = zone.unlock;
  return (
    <div className={`card flex flex-col p-4 ${unlocked ? '' : 'opacity-60'}`}>
      {zone.image && (
        <img src={zone.image} alt="" className="-mx-4 -mt-4 mb-3 h-28 rounded-t-2xl object-cover" />
      )}
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1 font-semibold">
          <button
            type="button"
            className={`-ml-1 rounded-full px-1 text-lg leading-none transition hover:scale-125 ${
              favorite
                ? 'text-amber-400'
                : 'text-slate-300 hover:text-amber-400 dark:text-slate-600'
            }`}
            onClick={() => onFavorite(!favorite)}
            title={favorite ? 'Retirer des favoris' : 'Mettre en favori (affichée en tête de page)'}
            aria-label={favorite ? 'Retirer des favoris' : 'Mettre en favori'}
            aria-pressed={favorite}
          >
            {favorite ? '★' : '☆'}
          </button>
          {zone.name}
        </h3>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          PE ≥ {zone.minPower}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{zone.description}</p>
      {chain && (expiresIn === null || expiresIn > 0) && (
        <p
          className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          title="Relance la zone avant la fin du délai pour allonger la chaîne."
        >
          ✦ Chaîne {chain.chain} : shiny {formatMultiplier(chainMultiplier(ctx, chain.chain))}
          {perfectIvs > 0 && ` · ${perfectIvs} IV parfait${perfectIvs > 1 ? 's' : ''}`}
          {expiresIn !== null && ` · à relancer sous ${formatCountdown(expiresIn)}`}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        {zone.requiredTypes.map((r) => (
          <span key={r.type} className="flex items-center gap-1">
            Requis : {r.count} × <TypeBadge type={r.type} />
          </span>
        ))}
        {zone.affinityTypes.length > 0 && <span className="ml-1">Affinité :</span>}
        {zone.affinityTypes.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {species.map(({ speciesId: id, formId }) => (
          <PokemonSprite
            key={`${id}:${formId ?? ''}`}
            speciesId={id}
            formId={formId}
            size={40}
            silhouette={!seen.has(id)}
            className={
              seen.has(id) && !(formId != null ? caughtForms.has(formId) : caught.has(id))
                ? 'opacity-50 grayscale'
                : ''
            }
            alt={seen.has(id) ? ctx.species(id, formId)?.nameFr : '?'}
          />
        ))}
      </div>
      <div className="mt-auto pt-3">
        {unlocked ? (
          <button className="btn-primary w-full" disabled={!canLaunch} onClick={onLaunch}>
            {canLaunch ? 'Envoyer une équipe' : 'Aucun emplacement libre'}
          </button>
        ) : (
          <p className="text-center text-sm text-slate-500">
            🔒 {unlockConditionText(ctx, unlock) ?? 'Région verrouillée'}
          </p>
        )}
      </div>
    </div>
  );
}
