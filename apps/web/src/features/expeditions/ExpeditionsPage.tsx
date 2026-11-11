/**
 * Onglet Expéditions : les expéditions en cours, les zones favorites et les zones de la région
 * choisie, d'où partent les nouvelles expéditions.
 */
import { useState } from 'react';
import type { Zone } from '@poke/content';
import {
  expeditionEnv,
  isRegionUnlocked,
  isUnlockedSoon,
  isZoneUnlocked,
  specialEncountersFor,
  zoneWeather,
} from '@poke/game-core';
import type { AbilityEnv, GameContext } from '@poke/game-core';
import type {
  ClaimExpeditionResponse,
  ExpeditionDto,
  PlayerProfileDto,
  PokemonDto,
} from '@poke/shared';
import { CollapseBody, CollapseButton, useCollapsedSection } from '../../components/Collapsible';
import { useNow } from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  shownPlaces,
  useExpeditions,
  usePlayerProgress,
  usePokemon,
  useShinyCharm,
} from '../../lib/queries';
import { errorMessage } from '../../lib/labels';
import { LaunchExpeditionDialog } from './LaunchExpeditionDialog';
import { LootReveal } from './LootReveal';
import {
  AutoTransferButton,
  GlobalAutoTransferDialog,
  loadGlobalAutoTransfer,
} from './AutoTransferSettings';
import { RegionStarterCard } from './RegionStarterCard';
import { RegionTabs, currentRegionTab, useSavedRegionTab } from '../common/RegionTabs';
import { ActiveExpedition } from './ActiveExpedition';
import { ZoneCard, useZoneDex } from './ZoneCard';
import { useExpeditionActions, useRoamerRefresh } from './useExpeditionActions';
import type { ExpeditionActions } from './useExpeditionActions';
import { useLinkedZone } from './zoneLink';
import type { ReactNode } from 'react';
import type { PlayerProgress } from '@poke/game-core';

/** Page des expéditions du joueur. */
export function ExpeditionsPage({ ctx, profile }: { ctx: GameContext; profile: PlayerProfileDto }) {
  const expeditions = useExpeditions();
  const pokemon = usePokemon();
  const progress = usePlayerProgress();
  const dex = useZoneDex();
  const now = useNow();
  const [launchZone, setLaunchZone] = useState<Zone | null>(null);
  const [reveal, setReveal] = useState<ClaimExpeditionResponse | null>(null);
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('expeditions');
  const [linkedZoneId, clearLinkedZone] = useLinkedZone();
  const [notice, setNotice] = useState<string | null>(null);
  // Filtre global du transfert automatique (chaque zone peut avoir le sien au lancement).
  const [autoTransfer, setAutoTransfer] = useState(loadGlobalAutoTransfer);
  const [autoTransferOpen, setAutoTransferOpen] = useState(false);
  const actions = useExpeditionActions(setReveal);
  const { favorite } = actions;

  // Décalage entre l'horloge du serveur et celle du navigateur, pour des comptes à rebours justes.
  const offset = expeditions.data
    ? Date.parse(expeditions.data.serverTime) - expeditions.dataUpdatedAt
    : 0;
  const serverNow = now + offset;
  const active = expeditions.data?.active ?? [];
  const slots = expeditions.data?.slots ?? 0;
  const freeSlots = slots - active.filter((e) => e.slotIndex < slots).length;
  const chains = new Map(expeditions.data?.chains.map((c) => [c.zoneId, c]));
  const roamers = expeditions.data?.roamers ?? [];
  useRoamerRefresh(roamers, serverNow);
  // Favoris : affichage optimiste pendant l'enregistrement.
  const favoriteIds = new Set(expeditions.data?.favoriteZoneIds);
  if (favorite.isPending) {
    if (favorite.variables.on) favoriteIds.add(favorite.variables.zoneId);
    else favoriteIds.delete(favorite.variables.zoneId);
  }
  const favoriteZones = [...favoriteIds].flatMap((id) => ctx.zone(id) ?? []);

  // Arrivée par un lien de zone : le lancement s'ouvre (une fois les emplacements connus) s'il
  // reste un emplacement libre.
  if (linkedZoneId && expeditions.data) {
    clearLinkedZone();
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

  const regionId = currentRegionTab(ctx, progress, selectedRegion);
  const zoneCard = (zone: Zone, unlocked: boolean) => (
    <ZoneCard
      key={zone.id}
      ctx={ctx}
      zone={zone}
      {...dex}
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
      <ActiveSection
        ctx={ctx}
        active={active}
        slots={slots}
        serverNow={serverNow}
        actions={actions}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        autoTransfer={autoTransfer}
        onAutoTransfer={() => setAutoTransferOpen(true)}
      />
      <FavoritesSection
        favoriteZones={favoriteZones}
        renderZone={(zone) => zoneCard(zone, isZoneUnlocked(ctx, zone, progress))}
      />
      <RegionZonesSection
        ctx={ctx}
        profile={profile}
        progress={progress}
        regionId={regionId}
        onSelectRegion={setSelectedRegion}
        zoneCard={zoneCard}
      />

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

/** Expéditions en cours, une case par emplacement, et accès au transfert automatique global. */
function ActiveSection({
  ctx,
  active,
  slots,
  serverNow,
  actions,
  notice,
  onDismissNotice,
  autoTransfer,
  onAutoTransfer,
}: {
  ctx: GameContext;
  active: ExpeditionDto[];
  /** Nombre d'emplacements ouverts au joueur. */
  slots: number;
  serverNow: number;
  actions: ExpeditionActions;
  /** Message à afficher sous le titre (départ impossible depuis un lien de zone). */
  notice: string | null;
  onDismissNotice: () => void;
  /** Filtre global du transfert automatique. */
  autoTransfer: ReturnType<typeof loadGlobalAutoTransfer>;
  onAutoTransfer: () => void;
}) {
  // Sections repliables en accordéon, comme les widgets (gardé dans le navigateur).
  const [activeCollapsed, toggleActive] = useCollapsedSection('expeditions.active');
  const pokemon = usePokemon();
  const charm = useShinyCharm(ctx);
  const { claim, cancel, favorite } = actions;
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
  return (
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
            onClick={onAutoTransfer}
          />
        </div>
      </div>
      {notice && (
        <p className="mt-3 flex items-start justify-between gap-2 rounded-md border-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-[#a07a20] dark:bg-[#3d3416] dark:text-[#f8d878]">
          {notice}
          <button onClick={onDismissNotice} aria-label="Fermer">
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
  );
}

/** Zones mises en favori, en tête de page ; rien s'il n'y en a pas. */
function FavoritesSection({
  favoriteZones,
  renderZone,
}: {
  favoriteZones: Zone[];
  renderZone: (zone: Zone) => ReactNode;
}) {
  const [favoritesCollapsed, toggleFavorites] = useCollapsedSection('expeditions.favorites');
  if (favoriteZones.length === 0) return null;
  return (
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
        {favoriteZones.map(renderZone)}
      </CollapseBody>
    </section>
  );
}

/**
 * Zones de la région choisie : celles débloquées et celles du prochain badge (les autres
 * apparaîtront plus tard), avec le starter d'une région tout juste débloquée, à choisir une fois.
 */
function RegionZonesSection({
  ctx,
  profile,
  progress,
  regionId,
  onSelectRegion,
  zoneCard,
}: {
  ctx: GameContext;
  profile: PlayerProfileDto;
  progress: PlayerProgress;
  regionId: string;
  onSelectRegion: (regionId: string) => void;
  zoneCard: (zone: Zone, unlocked: boolean) => ReactNode;
}) {
  const [zonesCollapsed, toggleZones] = useCollapsedSection('expeditions.zones');
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
  const region = ctx.region(regionId);
  // Zones débloquées et celles du prochain badge ; les autres apparaîtront plus tard.
  const regionZones = ctx.zones
    .filter((z) => z.regionId === regionId)
    .map((zone) => ({ zone, unlocked: isZoneUnlocked(ctx, zone, progress) }));
  const visibleZones = regionZones.filter(
    ({ zone, unlocked }) => unlocked || isUnlockedSoon(ctx, zone.unlock, progress),
  );
  const hiddenZones = regionZones.length - visibleZones.length;
  return (
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
          onSelect={onSelectRegion}
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
  );
}
