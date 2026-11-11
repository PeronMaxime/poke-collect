import { Fragment, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SpecialEncounter, Zone } from '@poke/content';
import {
  IV_BALL_CATEGORIES,
  WEATHER_LABELS,
  abilityMultiplier,
  chainMultiplier,
  chainPerfectIvs,
  expeditionEnv,
  isRegionUnlocked,
  isUnlockedSoon,
  isZoneUnlocked,
  planAfter,
  resolveWeather,
  shinyProbability,
  specialEncountersFor,
  zoneWeather,
} from '@poke/game-core';
import type { AbilityEnv, GameContext } from '@poke/game-core';
import type {
  ClaimExpeditionResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  PlayerProfileDto,
  PokemonDto,
  RoamerDto,
  ShinyChainDto,
} from '@poke/shared';
import { CollapseBody, CollapseButton, useCollapsedSection } from '../../components/Collapsible';
import {
  CancelButton,
  PokemonSprite,
  ProgressBar,
  ShinyStar,
  TypeBadge,
  useNow,
} from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  cancelExpedition,
  claimExpedition,
  keys,
  refreshAfterExpeditionClaim,
  refreshAfterExpeditionStart,
  setFavoriteZone,
  shownPlaces,
  useExpeditions,
  usePlayerProgress,
  usePokedex,
  usePokedexForms,
  usePokemon,
  useShinyBonus,
  useShinyCharm,
} from '../../lib/queries';
import {
  errorMessage,
  formatCountdown,
  formatDuration,
  formatMultiplier,
  formatShinyRate,
  itemIcon,
  itemName,
  speciesName,
  unlockConditionText,
} from '../../lib/labels';
import { ActiveAbilities } from './ActiveAbilities';
import { ExpeditionTrail } from './ExpeditionTrail';
import { LaunchExpeditionDialog } from './LaunchExpeditionDialog';
import { LootReveal } from './LootReveal';
import { BANNER_LABEL, CHECKER, TINTED_BANNER, zoneSpecies, zoneTint } from '../common/zoneBanner';
import {
  AutoTransferButton,
  GlobalAutoTransferDialog,
  autoTransferLabel,
  loadGlobalAutoTransfer,
} from './AutoTransferSettings';
import { RegionStarterCard } from './RegionStarterCard';
import { roamerName } from './RoamerSightingNotice';
import { RegionTabs, currentRegionTab, useSavedRegionTab } from '../common/RegionTabs';
import { WEATHER_ICONS, ZoneWeatherIcon } from '../common/WeatherIcon';

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
  const charm = useShinyCharm(ctx);
  const now = useNow();
  const [launchZone, setLaunchZone] = useState<Zone | null>(null);
  const [reveal, setReveal] = useState<ClaimExpeditionResponse | null>(null);
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('expeditions');
  const [linkedZoneId, setLinkedZoneId] = useState(zoneFromHash);
  const [notice, setNotice] = useState<string | null>(null);
  // Filtre global du transfert automatique (chaque zone peut avoir le sien au lancement).
  const [autoTransfer, setAutoTransfer] = useState(loadGlobalAutoTransfer);
  const [autoTransferOpen, setAutoTransferOpen] = useState(false);
  // Sections repliables en accordéon, comme les widgets (gardé dans le navigateur).
  const [activeCollapsed, toggleActive] = useCollapsedSection('expeditions.active');
  const [zonesCollapsed, toggleZones] = useCollapsedSection('expeditions.zones');
  const [favoritesCollapsed, toggleFavorites] = useCollapsedSection('expeditions.favorites');

  const claim = useMutation({
    mutationFn: (id: string) => claimExpedition(id),
    onSuccess: (data) => {
      setReveal(data);
      return refreshAfterExpeditionClaim(queryClient);
    },
  });

  const favorite = useMutation({
    mutationFn: ({ zoneId, on }: { zoneId: string; on: boolean }) => setFavoriteZone(zoneId, on),
    onSuccess: ({ favoriteZoneIds }) =>
      queryClient.setQueryData<ExpeditionsResponse>(
        keys.expeditions,
        (data) => data && { ...data, favoriteZoneIds },
      ),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelExpedition(id),
    onSuccess: () => refreshAfterExpeditionStart(queryClient),
  });

  const progress = usePlayerProgress();
  const seen = new Set(pokedex.data?.filter((d) => d.seen).map((d) => d.speciesId));
  const caught = new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId));
  const caughtForms = new Set(pokedexForms.data?.map((f) => f.formId));
  const caughtShiny = new Set(pokedex.data?.filter((d) => d.caughtShiny).map((d) => d.speciesId));
  const caughtShinyForms = new Set(
    pokedexForms.data?.filter((f) => f.caughtShiny).map((f) => f.formId),
  );
  // Décalage entre l'horloge du serveur et celle du navigateur, pour des comptes à rebours justes.
  const offset = expeditions.data
    ? Date.parse(expeditions.data.serverTime) - expeditions.dataUpdatedAt
    : 0;
  const serverNow = now + offset;
  const active = expeditions.data?.active ?? [];
  const slots = expeditions.data?.slots ?? 0;
  const freeSlots = slots - active.filter((e) => e.slotIndex < slots).length;
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  /** Talents d'une expédition en cours, à l'heure du départ (zone explorée) ; undefined = inconnu. */
  const abilityEnvOf = (e: ExpeditionDto, team: PokemonDto[]): AbilityEnv | undefined => {
    const zone = e.zoneId ? ctx.zone(e.zoneId) : undefined;
    if (zone) {
      const site = { ...zone, weather: zoneWeather(zone, Date.parse(e.startedAt)) };
      return expeditionEnv(site, team, e.localHour);
    }
    return undefined;
  };
  const chains = new Map(expeditions.data?.chains.map((c) => [c.zoneId, c]));
  const roamers = expeditions.data?.roamers ?? [];
  // Les fuyards changent de zone à l'heure pleine : on recharge à ce moment-là.
  const nextMove = Math.min(...roamers.map((r) => Date.parse(r.movesAt)));
  useEffect(() => {
    if (!Number.isFinite(nextMove)) return;
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: keys.expeditions }),
      Math.max(0, nextMove - serverNow) + 1000,
    );
    return () => clearTimeout(timer);
    // serverNow avance chaque seconde : seule l'échéance compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextMove, queryClient]);
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
      isRegionUnlocked(ctx, r, progress)
    );
  };
  const regionId = currentRegionTab(ctx, progress, selectedRegion);
  const region = ctx.region(regionId);
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
      caughtShiny={caughtShiny}
      caughtShinyForms={caughtShinyForms}
      unlocked={unlocked}
      canLaunch={freeSlots > 0}
      chain={chains.get(zone.id)}
      roamers={roamers.filter((r) => r.zoneId === zone.id)}
      specials={specialEncountersFor(ctx, zone, pokemon.data ?? [])}
      serverNow={serverNow}
      onLaunch={() => setLaunchZone(zone)}
      favorite={favoriteIds.has(zone.id)}
      onFavorite={(on) => favorite.mutate({ zoneId: zone.id, on })}
    />
  );

  return (
    <div className="space-y-5">
      <section className="card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <CollapseButton
              collapsed={activeCollapsed}
              onToggle={toggleActive}
              label="les expéditions en cours"
            />
            <h2>Expéditions en cours</h2>
            {activeCollapsed && (
              <span className="count-badge" title="Expéditions en cours / emplacements">
                {active.length}/{slots}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <AutoTransferButton
              label="Transfert auto"
              filter={autoTransfer}
              onClick={() => setAutoTransferOpen(true)}
            />
          </div>
        </div>
        {notice && (
          <p className="mt-3 flex items-start justify-between gap-2 rounded-md border-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-[#a07a20] dark:bg-[#3d3416] dark:text-[#f8d878]">
            {notice}
            <button onClick={() => setNotice(null)} aria-label="Fermer">
              ✕
            </button>
          </p>
        )}
        <CollapseBody
          open={!activeCollapsed}
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3.5 pt-4"
        >
          {Array.from(
            {
              length: shownPlaces(
                slots,
                active.map((e) => e.slotIndex),
              ),
            },
            (_, slot) => {
              const exp = active.find((e) => e.slotIndex === slot);
              const team = exp?.team.flatMap((id) => pokemonById.get(id) ?? []) ?? [];
              return exp ? (
                <ActiveExpedition
                  key={exp.id}
                  ctx={ctx}
                  expedition={exp}
                  serverNow={serverNow}
                  teamSpecies={exp.team.map((id) => pokemonById.get(id))}
                  team={team}
                  abilityEnv={abilityEnvOf(exp, team)}
                  charm={charm}
                  claiming={claim.isPending && claim.variables === exp.id}
                  onClaim={() => claim.mutate(exp.id)}
                  cancelling={cancel.isPending && cancel.variables === exp.id}
                  onCancel={() => cancel.mutate(exp.id)}
                />
              ) : (
                <div
                  key={slot}
                  className="grid min-h-32 place-items-center rounded-lg border-[3px] border-dashed border-slate-400 p-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400"
                >
                  {slot < slots
                    ? 'Emplacement libre — choisis une zone ci-dessous.'
                    : 'Emplacement fermé.'}
                </div>
              );
            },
          )}
        </CollapseBody>
        {[claim.error, cancel.error, favorite.error].map(
          (error, i) =>
            error && (
              <p key={i} className="mt-2 text-sm text-red-600">
                {error instanceof ApiError ? errorMessage(error.code) : 'Erreur inconnue'}
              </p>
            ),
        )}
      </section>

      {favoriteZones.length > 0 && (
        <section className="card p-4 md:p-5">
          <div className="flex items-center gap-2">
            <CollapseButton
              collapsed={favoritesCollapsed}
              onToggle={toggleFavorites}
              label="les zones favorites"
            />
            <h2>★ Favoris</h2>
            {favoritesCollapsed && (
              <span className="count-badge" title="Zones favorites">
                {favoriteZones.length}
              </span>
            )}
          </div>
          <CollapseBody open={!favoritesCollapsed} className={`${ZONE_GRID} pt-4`}>
            {favoriteZones.map((zone) => zoneCard(zone, isZoneUnlocked(ctx, zone, progress)))}
          </CollapseBody>
        </section>
      )}

      <section className="card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {region && (
            <div className="flex items-center gap-2">
              <CollapseButton
                collapsed={zonesCollapsed}
                onToggle={toggleZones}
                label={`les zones de ${region.name}`}
              />
              <h2>Zones de {region.name}</h2>
            </div>
          )}
          <RegionTabs
            ctx={ctx}
            progress={progress}
            selected={regionId}
            onSelect={setSelectedRegion}
            marker={(id) => (needsStarter(id) ? 'Starter à choisir' : null)}
          />
        </div>
        {region && (
          <CollapseBody open={!zonesCollapsed} className="space-y-4 pt-4">
            {needsStarter(region.id) && <RegionStarterCard ctx={ctx} region={region} />}
            <div className={ZONE_GRID}>
              {visibleZones.map(({ zone, unlocked }) => zoneCard(zone, unlocked))}
            </div>
            {hiddenZones > 0 && (
              <p className="text-center text-sm text-slate-500">
                {hiddenZones} autre{hiddenZones > 1 ? 's' : ''} zone{hiddenZones > 1 ? 's' : ''} à
                découvrir en progressant dans l’aventure.
              </p>
            )}
          </CollapseBody>
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
      <LootReveal ctx={ctx} data={reveal} onClose={() => setReveal(null)} />
      <GlobalAutoTransferDialog
        open={autoTransferOpen}
        filter={autoTransfer}
        onClose={() => setAutoTransferOpen(false)}
        onSave={setAutoTransfer}
      />
    </div>
  );
}

/** Grille des zones : autant de colonnes que la largeur le permet. */
const ZONE_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4';

function ActiveExpedition({
  ctx,
  expedition,
  serverNow,
  teamSpecies,
  team,
  abilityEnv,
  charm,
  claiming,
  onClaim,
  cancelling,
  onCancel,
}: {
  ctx: GameContext;
  expedition: ExpeditionDto;
  serverNow: number;
  teamSpecies: (PokemonDto | undefined)[];
  /** Membres de l'équipe encore au PC, dans l'ordre (ceux de `abilityEnv`). */
  team: PokemonDto[];
  abilityEnv: AbilityEnv | undefined;
  /** Multiplicateur du Charme Chroma (compté au retour). */
  charm: number;
  claiming: boolean;
  onClaim: () => void;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const start = Date.parse(expedition.startedAt);
  const minEnd = Date.parse(expedition.minEndsAt);
  const end = Date.parse(expedition.endsAt);
  const done = serverNow >= end;
  const stoppable = serverNow >= minEnd;
  const zone = expedition.zoneId ? ctx.zone(expedition.zoneId) : undefined;
  const quest = expedition.questId ? ctx.quest(expedition.questId) : undefined;
  // Compté au rythme calculé par le serveur (contenu, équipe et météo du départ) : exact.
  const elapsedMinutes = (Math.min(serverNow, end) - start) / 60_000;
  const sofar = expedition.pace ? planAfter(expedition.pace, Math.max(0, elapsedMinutes)) : null;
  // Fuyards pas encore croisés : ceux déjà rencontrés ont leur propre ligne.
  const tracked = expedition.roamerQuestIds.filter((id) => !expedition.roamersMet.includes(id));
  return (
    <div className={`tile group/exp relative p-3.5 ${done ? 'bg-done' : ''}`} tabIndex={0}>
      <ExpeditionSummary
        ctx={ctx}
        expedition={expedition}
        team={team}
        abilityEnv={abilityEnv}
        charm={charm}
      />
      <div className="min-w-0">
        {expedition.questId && (
          <p className="text-xs font-medium text-amber-600">✦ Ancienne expédition légendaire</p>
        )}
        {tracked.length > 0 && (
          <p className="text-xs font-medium text-amber-600">
            ✦ Sur la piste de {tracked.map((id) => roamerName(ctx, id)).join(' et ')}
          </p>
        )}
        {expedition.roamersMet.map((id) => (
          <p key={id} className="text-xs font-semibold text-amber-600">
            ✦ {roamerName(ctx, id)} a été rencontré !
          </p>
        ))}
        <p className="text-lg leading-tight font-bold">
          {zone?.name ?? quest?.name ?? expedition.zoneId ?? expedition.questId}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {formatDuration(Math.floor(elapsedMinutes))} écoulées
          {expedition.shinyChain > 0 && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              · ✦ chaîne {expedition.shinyChain}
            </span>
          )}
          {expedition.captureFilter && ' · captures filtrées'}
        </p>
      </div>
      <ExpeditionTrail
        habitat={zone?.habitat}
        team={teamSpecies.filter((p) => p !== undefined)}
        done={done}
      />
      {sofar && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          {sofar.encounters} rencontre{sofar.encounters > 1 ? 's' : ''} · {sofar.lootRolls} tirage
          {sofar.lootRolls > 1 ? 's' : ''} de butin
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-sm ${done ? 'font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
          {done ? (
            'Terminée !'
          ) : stoppable ? (
            <>
              Retour de lui-même dans{' '}
              <span className="font-mono">{formatCountdown(end - serverNow)}</span>
            </>
          ) : (
            <>
              Arrêt possible dans{' '}
              <span className="font-mono">{formatCountdown(minEnd - serverNow)}</span>
            </>
          )}
        </span>
        {stoppable ? (
          <button className="btn-primary" disabled={claiming} onClick={onClaim}>
            {claiming ? 'Ouverture…' : done ? 'Récupérer' : 'Arrêter et récupérer'}
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
  always: 'chromatiques toujours tentés',
  only: 'chromatiques uniquement',
} as const;

/** Image d'un objet (Ball, baie), avec sa quantité et son nom si demandés ; nom complet au survol. */
function ItemChip({
  ctx,
  itemId,
  quantity,
  showName = false,
}: {
  ctx: GameContext;
  itemId: string;
  quantity?: number;
  showName?: boolean;
}) {
  const name = itemName(ctx, itemId);
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap" title={name}>
      <img
        src={itemIcon(ctx, itemId)}
        alt={name}
        className="size-6 shrink-0 [image-rendering:pixelated]"
      />
      {quantity !== undefined && <span className="font-semibold">×{quantity}</span>}
      {showName && <span>{name}</span>}
    </span>
  );
}

const NONE = <span className="text-slate-400 dark:text-slate-500">aucune</span>;

/**
 * Résumé d'une expédition en cours, au survol, en trois blocs : durée, météo et taux
 * chromatique ; Balls et baies (en images) ; règles de capture, transfert auto et talents.
 */
function ExpeditionSummary({
  ctx,
  expedition: e,
  team,
  abilityEnv,
  charm,
}: {
  ctx: GameContext;
  expedition: ExpeditionDto;
  team: PokemonDto[];
  abilityEnv: AbilityEnv | undefined;
  charm: number;
}) {
  const shinyBonus = useShinyBonus();
  const filter = e.captureFilter;
  const time = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  // Météo figée au départ (talents compris) : celle de la zone a pu changer depuis.
  const weather = e.zoneId && abilityEnv ? (resolveWeather(ctx, abilityEnv) ?? 'clear') : null;
  // Comme au serveur : chaîne du départ, Charme Chroma et bonus permanent au retour et, hors
  // expédition légendaire, talents de l'équipe.
  const shinyRate = Math.min(
    1,
    shinyProbability(ctx, { chain: e.shinyChain, charm, bonus: shinyBonus }) *
      (abilityEnv && !e.questId ? abilityMultiplier(ctx, abilityEnv, 'shinyChance') : 1),
  );
  const plan = e.ballPlan;
  const planRows: [string, string | null][] = plan
    ? [
        ['Nouveau', plan.new],
        ['Shiny', plan.shiny],
        ['Déjà capturé', plan.caught],
        ...IV_BALL_CATEGORIES.flatMap((category, i): [string, string | null][] =>
          plan[category] !== undefined
            ? [[`Déjà capturé, ${i + 1} IV parfait${i > 0 ? 's' : ''}`, plan[category] ?? null]]
            : [],
        ),
      ]
    : [];
  const berries = [
    e.berryItemId && { itemId: e.berryItemId, quantity: e.berries },
    e.encounterBerryItemId && { itemId: e.encounterBerryItemId, quantity: e.encounterBerries },
  ].filter((b): b is { itemId: string; quantity: number } => !!b);
  const filters = filter
    ? [
        filter.newOnly && 'absents du Pokédex',
        filter.minPerfectIvs > 0 &&
          `au moins ${filter.minPerfectIvs} IV parfait${filter.minPerfectIvs > 1 ? 's' : ''}`,
        SHINY_FILTER_LABELS[filter.shiny],
      ].filter((f): f is string => !!f)
    : [];
  const label = (text: string) => <dt className="text-slate-500">{text}</dt>;
  const divider = (
    <div className="col-span-2 my-1 border-t border-dashed border-slate-300 dark:border-slate-600" />
  );
  return (
    <div className="invisible absolute top-full left-0 z-30 mt-1 w-full min-w-[min(16rem,calc(100vw-2rem))] rounded-md border-2 border-ink bg-win p-3 text-xs opacity-0 shadow-xl transition-opacity group-focus-within/exp:visible group-focus-within/exp:opacity-100 group-hover/exp:visible group-hover/exp:opacity-100">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
        {/* Durée, météo, taux chromatique. */}
        {label(e.minEndsAt === e.endsAt ? 'Retour' : 'Arrêt possible')}
        <dd>{time(e.minEndsAt)}</dd>
        {e.minEndsAt !== e.endsAt && (
          <>
            {label('Au plus tard')}
            <dd>{time(e.endsAt)}</dd>
          </>
        )}
        {weather && (
          <>
            {label('Météo')}
            <dd className="flex items-center gap-1" title="Météo au départ de l’expédition">
              <span aria-hidden className="text-base leading-none">
                {WEATHER_ICONS[weather]}
              </span>
              {WEATHER_LABELS[weather]}
            </dd>
          </>
        )}
        {label('Chromatique')}
        <dd className="flex items-center gap-1">
          <ShinyStar /> {formatShinyRate(shinyRate)}
        </dd>

        {divider}
        {/* Balls et baies. */}
        {plan ? (
          <>
            {planRows.map(([text, itemId]) => (
              <Fragment key={text}>
                {label(text)}
                <dd>{itemId ? <ItemChip ctx={ctx} itemId={itemId} showName /> : NONE}</dd>
              </Fragment>
            ))}
            {label('Balls lancées')}
            <dd className="flex flex-wrap gap-x-2">
              {e.ballsUsed.length > 0
                ? e.ballsUsed.map((b) => (
                    <ItemChip key={b.itemId} ctx={ctx} itemId={b.itemId} quantity={b.quantity} />
                  ))
                : NONE}
            </dd>
          </>
        ) : (
          <>
            {label('Balls')}
            <dd>
              {e.ballItemId ? (
                <ItemChip ctx={ctx} itemId={e.ballItemId} quantity={e.balls} showName />
              ) : (
                <span className="text-slate-400 dark:text-slate-500">aucune (observation)</span>
              )}
            </dd>
          </>
        )}
        {label('Baies')}
        <dd className="flex flex-col gap-0.5">
          {berries.length > 0
            ? berries.map((b) => (
                <ItemChip
                  key={b.itemId}
                  ctx={ctx}
                  itemId={b.itemId}
                  quantity={b.quantity}
                  showName
                />
              ))
            : NONE}
        </dd>

        {(!plan || e.zoneId) && divider}
        {/* Règles de capture et transfert. */}
        {!plan && (
          <>
            {label('Captures')}
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
        {e.zoneId && (
          <>
            {label('Transfert auto')}
            <dd>{autoTransferLabel(e.autoTransfer)}</dd>
          </>
        )}
        {/* Talents : toute la largeur, titre centré au-dessus. */}
        {abilityEnv && (
          <>
            {divider}
            <dt className="col-span-2 text-center text-slate-500">Talents</dt>
            <dd className="col-span-2">
              <ActiveAbilities ctx={ctx} env={abilityEnv} members={team} empty="aucun actif" />
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
  caughtShiny,
  caughtShinyForms,
  unlocked,
  canLaunch,
  chain,
  roamers = [],
  specials = [],
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
  /** Espèces et formes dont la version shiny est capturée : affichées en shiny, avec un halo. */
  caughtShiny: Set<number>;
  caughtShinyForms: Set<number>;
  unlocked: boolean;
  canLaunch: boolean;
  chain: ShinyChainDto | undefined;
  /** Pokémon fuyards cachés dans la zone en ce moment. */
  roamers?: RoamerDto[];
  /** Rencontres spéciales qu'ouvrent les Pokémon du joueur (affichées avec les autres). */
  specials?: SpecialEncounter[];
  serverNow: number;
  onLaunch: () => void;
  favorite: boolean;
  onFavorite: (on: boolean) => void;
}) {
  const expiresIn = chain?.expiresAt ? Date.parse(chain.expiresAt) - serverNow : null;
  const perfectIvs = chain ? chainPerfectIvs(ctx, chain.chain) : 0;
  // Espèces et formes rencontrées : en couleur une fois capturées, en gris si seulement vues,
  // une silhouette tant que l'espèce n'a pas été vue.
  const species = zoneSpecies(ctx, zone);
  const caughtCount = species.filter(({ speciesId: id, formId }) =>
    formId != null ? caughtForms.has(formId) : caught.has(id),
  ).length;
  const shinyCount = species.filter(({ speciesId: id, formId }) =>
    formId != null ? caughtShinyForms.has(formId) : caughtShiny.has(id),
  ).length;
  const unlock = zone.unlock;
  // Bandeau teinté selon le type le plus présent parmi les Pokémon de la zone.
  const tint = zoneTint(species);
  return (
    <div className={`tile flex flex-col overflow-hidden ${unlocked ? '' : 'opacity-60'}`}>
      <div
        className={`relative flex flex-col justify-end gap-1.5 border-b-[3px] border-ink p-2.5 ${zone.image ? 'h-28' : 'min-h-[4.5rem]'}`}
      >
        {zone.image ? (
          <img
            src={zone.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover dark:brightness-75"
          />
        ) : (
          <span
            aria-hidden
            className={`absolute inset-0 ${TINTED_BANNER}`}
            style={{ '--tint': tint, ...CHECKER } as CSSProperties}
          />
        )}
        {/* Ligne 1 : le nom de la zone, centré. Ligne 2 : PE requis à gauche, météo (et fuyards)
            au milieu, favori à droite. */}
        <h3 className={`relative max-w-full self-center text-center ${BANNER_LABEL}`}>
          {zone.name}
        </h3>
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
          {/* Même étiquette que le nom de la zone (bordure, police, hauteur). Le « ≥ » en police
              normale ne doit pas agrandir la ligne : `leading-none` dans un `inline-flex`. */}
          <span className="inline-flex items-center gap-1 justify-self-start rounded border-2 border-ink bg-win px-2 py-1 font-pixel text-[10px] leading-normal whitespace-nowrap">
            PE <span className="font-sans text-sm leading-none">≥</span> {zone.minPower}
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <ZoneWeatherIcon
              zone={zone}
              at={serverNow}
              activity="expedition"
              className="rounded border-2 border-ink bg-win px-1 text-base leading-snug"
            />
            {roamers.map((r) => (
              <span
                key={r.questId}
                className="relative -my-2 flex"
                // Heure fixe plutôt qu'un compte à rebours : un titre qui change chaque seconde fait
                // clignoter l'infobulle.
                title={`${speciesName(ctx, r.speciesId, r.formId)} se cache ici jusqu’à ${new Date(r.movesAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (fuyard : ${r.encounterChance} % de chances par rencontre)`}
              >
                <PokemonSprite
                  speciesId={r.speciesId}
                  formId={r.formId}
                  size={40}
                  className="animate-pulse"
                  alt={speciesName(ctx, r.speciesId, r.formId)}
                />
              </span>
            ))}
          </div>
          <button
            type="button"
            className={`justify-self-end rounded border-2 border-ink bg-win px-1.5 text-lg leading-tight transition hover:scale-110 ${
              favorite
                ? 'text-amber-500'
                : 'text-slate-400 hover:text-amber-500 dark:text-slate-500'
            }`}
            onClick={() => onFavorite(!favorite)}
            title={favorite ? 'Retirer des favoris' : 'Mettre en favori (affichée en tête de page)'}
            aria-label={favorite ? 'Retirer des favoris' : 'Mettre en favori'}
            aria-pressed={favorite}
          >
            {favorite ? '★' : '☆'}
          </button>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-sm leading-snug text-slate-600 dark:text-slate-300">
          {zone.description}
        </p>
        {/* Phrase énigmatique : seulement quand le joueur possède le Pokémon requis. */}
        {specials
          .filter((s) => s.hint)
          .map((s, i) => (
            <p key={i} className="mt-1 text-xs text-violet-700 italic dark:text-violet-300">
              ✧ {s.hint}
            </p>
          ))}
        {chain && (expiresIn === null || expiresIn > 0) && (
          <p
            className="mt-2 rounded-md border-2 border-dashed border-amber-600 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-[#a07a20] dark:bg-[#3d3416] dark:text-[#f8d878]"
            title="Relance la zone avant la fin du délai pour allonger la chaîne."
          >
            ✦ Chaîne {chain.chain} : chromatique{' '}
            {formatMultiplier(chainMultiplier(ctx, chain.chain))}
            {perfectIvs > 0 && ` · ${perfectIvs} IV parfait${perfectIvs > 1 ? 's' : ''}`}
            {expiresIn !== null && ` · à relancer sous ${formatCountdown(expiresIn)}`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
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
        {/* Grille justifiée : la place restante est répartie entre les colonnes, pour la même
            marge à gauche et à droite. */}
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,3rem)] justify-between gap-1">
          {species.map(({ speciesId: id, formId }) => {
            const shiny = formId != null ? caughtShinyForms.has(formId) : caughtShiny.has(id);
            const sprite = (
              <PokemonSprite
                speciesId={id}
                formId={formId}
                size={44}
                shiny={shiny}
                silhouette={!seen.has(id)}
                className={
                  !shiny &&
                  seen.has(id) &&
                  !(formId != null ? caughtForms.has(formId) : caught.has(id))
                    ? 'opacity-50 grayscale'
                    : ''
                }
                alt={seen.has(id) ? ctx.species(id, formId)?.nameFr : '?'}
              />
            );
            const key = `${id}:${formId ?? ''}`;
            const name = seen.has(id) ? speciesName(ctx, id, formId) : '?';
            return (
              <span
                key={key}
                className={`sprite-well relative size-12 ${shiny ? 'shiny-well' : ''}`}
                title={shiny ? `${name} (chromatique capturé)` : name}
              >
                {sprite}
              </span>
            );
          })}
          {specials.map((s) => {
            const own = s.formId != null ? caughtForms.has(s.formId) : caught.has(s.speciesId);
            const name = speciesName(ctx, s.speciesId, s.formId);
            return (
              <span
                key={`special:${s.speciesId}:${s.formId ?? ''}`}
                className="sprite-well relative size-12 border-violet-400"
                title={`Rencontre spéciale : ${name}, avec ${speciesName(ctx, s.requiredSpeciesId, s.requiredFormId)} dans l’équipe (${s.chance} % de chances par rencontre)`}
              >
                <PokemonSprite
                  speciesId={s.speciesId}
                  formId={s.formId}
                  size={44}
                  className={own ? '' : 'opacity-50 grayscale'}
                  alt={name}
                />
              </span>
            );
          })}
        </div>
        {species.length > 0 && (
          <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <span>Capturés</span>
            <ProgressBar value={caughtCount / species.length} />
            <span className="text-right tabular-nums">
              {caughtCount} / {species.length}
            </span>
            <span className="text-amber-600 dark:text-amber-400">✦ Chromatique</span>
            <ProgressBar value={shinyCount / species.length} barClassName="bg-amber-400" />
            <span className="text-right tabular-nums">
              {shinyCount} / {species.length}
            </span>
          </div>
        )}
        <div className="mt-auto pt-3">
          {unlocked ? (
            <button className="btn-primary w-full" disabled={!canLaunch} onClick={onLaunch}>
              {canLaunch ? 'Envoyer une équipe' : 'Aucun emplacement libre'}
            </button>
          ) : (
            <p className="text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
              🔒 {unlockConditionText(ctx, unlock) ?? 'Région verrouillée'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
