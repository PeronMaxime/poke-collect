import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DUNGEON_DIFFICULTIES } from '@poke/content';
import type { Dungeon } from '@poke/content';
import { dungeonStatus } from '@poke/game-core';
import type { DungeonStatus, GameContext } from '@poke/game-core';
import type { ClaimDungeonResponse, DungeonRecordDto, DungeonRunDto } from '@poke/shared';
import { PokemonSprite, TypeBadge, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, serverOffset, useDungeons, usePlayerProgress } from '../../lib/game';
import {
  formatCountdown,
  itemIcon,
  itemName,
  speciesName,
  unlockConditionText,
} from '../../lib/labels';
import { CombatWindow, OngoingCombatBanner, useCombatWindow } from './CombatWindow';
import { DungeonCombat } from './DungeonCombat';
import { DungeonDifficultyBadge } from './DungeonDifficultyBadge';
import { DungeonResult } from './DungeonResult';
import { LaunchDungeonDialog } from './LaunchDungeonDialog';
import { RegionTabs, currentRegionTab, useSavedRegionTab, visibleRegions } from './RegionTabs';
import { WeatherIcon } from './WeatherIcon';

/** Au-delà, le résultat d'une tentative réclamée en l'absence du joueur n'est plus montré. */
const RESULT_MAX_AGE_MS = 3 * 24 * 3600_000;

/** Onglet regroupant les donjons de toutes les régions débloquées, avant les onglets de région. */
const ALL_TAB = { id: '__tous', label: 'Tous' };

export function DungeonsPage({ ctx }: { ctx: GameContext }) {
  const dungeons = useDungeons();
  const progress = usePlayerProgress();
  const now = useNow();
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('dungeons');
  const [launch, setLaunch] = useState<Dungeon | null>(null);
  const [result, setResult] = useState<{ run: DungeonRunDto; currency: number | null } | null>(
    null,
  );
  const queryClient = useQueryClient();
  // Résultat fermé à l'instant, en attendant que le serveur le marque comme vu.
  const [seen, setSeen] = useState<string | null>(null);
  // Tentative dont le combat est terminé, et celle dont le joueur a demandé le résultat.
  const [overRun, setOverRun] = useState<string | null>(null);
  const [claimRun, setClaimRun] = useState<string | null>(null);

  const offset = serverOffset(dungeons.data, dungeons.dataUpdatedAt);
  const serverNow = now + offset;
  const active = dungeons.data?.active ?? null;
  const last = dungeons.data?.last ?? null;
  const records = new Map(dungeons.data?.records.map((r) => [r.dungeonId, r]));
  const regionId = currentRegionTab(ctx, progress, selectedRegion, [ALL_TAB]);
  const isAllTab = regionId === ALL_TAB.id;
  const unlockedRegionIds = visibleRegions(ctx, progress).unlocked.map((r) => r.id);
  const inRegion = ctx.dungeons.filter((d) =>
    isAllTab ? unlockedRegionIds.includes(d.regionId) : d.regionId === regionId,
  );
  const listed = inRegion
    .map((d) => ({
      dungeon: d,
      status: dungeonStatus(ctx, d, progress, records.get(d.id), serverNow),
    }))
    .filter((d) => d.status.state !== 'hidden');
  // Du plus facile au plus difficile ; à difficulté égale, région par région puis l'ordre du Pokédex.
  const difficultyRank = (d: Dungeon) => DUNGEON_DIFFICULTIES.indexOf(d.difficulty);
  const regionRank = (d: Dungeon) => unlockedRegionIds.indexOf(d.regionId);
  listed.sort(
    ({ dungeon: a }, { dungeon: b }) =>
      difficultyRank(a) - difficultyRank(b) || regionRank(a) - regionRank(b) || a.order - b.order,
  );
  const hiddenCount = inRegion.length - listed.length;

  // Tentative réclamée en l'absence du joueur (ou dont la fenêtre n'a pas été fermée) : son
  // résultat s'affiche jusqu'à ce que le joueur le ferme, sur n'importe quel appareil.
  const unseen =
    !active &&
    !result &&
    last?.result &&
    !last.resultSeenAt &&
    last.id !== seen &&
    last.claimedAt &&
    serverNow - Date.parse(last.claimedAt) < RESULT_MAX_AGE_MS
      ? last
      : null;
  const shownResult = result ?? (unseen ? { run: unseen, currency: null } : null);

  // Fenêtre du combat : ouverte d'office pour une nouvelle tentative, sauf si le joueur l'a fermée.
  const activeId = active?.id ?? null;
  const { open: combatOpen, show: showCombat } = useCombatWindow('dungeon-combat-hidden', activeId);
  const markOver = useCallback(() => setOverRun(activeId), [activeId]);

  function closeResult() {
    if (shownResult) {
      const id = shownResult.run.id;
      setSeen(id);
      api(`/api/dungeons/${id}/seen`, { method: 'POST' })
        .then(() => queryClient.invalidateQueries({ queryKey: keys.dungeons }))
        .catch(() => {
          // Échec : le résultat pourra s'afficher de nouveau au prochain passage.
        });
    }
    setResult(null);
  }

  return (
    <div className="space-y-6">
      {active && !combatOpen && (
        <OngoingCombatBanner
          title={`Donjon : ${ctx.dungeon(active.dungeonId)?.name ?? active.dungeonId}`}
          portrait={
            active.setup.enemies.at(-1) && (
              <PokemonSprite
                speciesId={active.setup.enemies.at(-1)!.speciesId}
                formId={active.setup.enemies.at(-1)!.formId}
                size={72}
                className="shrink-0"
              />
            )
          }
          over={overRun === active.id}
          claiming={claimRun === active.id}
          onShow={() => {
            if (overRun === active.id) setClaimRun(active.id);
            else showCombat(true);
          }}
        />
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Donjons</h2>
          <RegionTabs
            ctx={ctx}
            progress={progress}
            selected={regionId}
            onSelect={setSelectedRegion}
            leading={[ALL_TAB]}
          />
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Chaque donjon abrite une Méga-Évolution. Capture toute la lignée de son Pokémon pour y
          entrer, puis bats ses adversaires un à un jusqu’au boss pour tenter de remporter sa
          Méga-Gemme : elle permet de méga-évoluer ton Pokémon au PC.
        </p>
        {listed.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            Aucun donjon découvert {isAllTab ? 'pour l’instant' : 'dans cette région'}. Capture un
            Pokémon d’une lignée capable de méga-évoluer pour révéler son donjon.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {listed.map(({ dungeon, status }) => (
              <DungeonCard
                key={dungeon.id}
                ctx={ctx}
                dungeon={dungeon}
                status={status}
                record={records.get(dungeon.id)}
                caught={progress.caughtSpeciesIds}
                serverNow={serverNow}
                busy={!!active}
                onEnter={() => setLaunch(dungeon)}
              />
            ))}
          </div>
        )}
        {hiddenCount > 0 && (
          <p className="mt-3 text-center text-xs text-slate-500">
            {hiddenCount} donjon{hiddenCount > 1 ? 's' : ''} encore caché
            {hiddenCount > 1 ? 's' : ''} {isAllTab ? 'dans tes régions' : 'dans cette région'}.
          </p>
        )}
      </section>

      {active && (
        <CombatWindow open={combatOpen} onClose={() => showCombat(false)}>
          <DungeonCombat<DungeonRunDto, ClaimDungeonResponse>
            key={active.id}
            ctx={ctx}
            title={`Donjon : ${ctx.dungeon(active.dungeonId)?.name ?? active.dungeonId}`}
            apiBase="/api/dungeons"
            queryKey={keys.dungeons}
            bossLast
            run={active}
            offsetMs={offset}
            visible={combatOpen}
            onHide={() => showCombat(false)}
            claimRequested={claimRun === active.id}
            onOver={markOver}
            onClaimError={() => {
              setClaimRun(null);
              showCombat(true);
            }}
            onFinished={(data) => {
              setResult({ run: data.run, currency: data.currency });
            }}
          />
        </CombatWindow>
      )}
      {launch && <LaunchDungeonDialog ctx={ctx} dungeon={launch} onClose={() => setLaunch(null)} />}
      <DungeonResult
        ctx={ctx}
        run={shownResult?.run ?? null}
        currency={shownResult?.currency ?? null}
        onClose={closeResult}
      />
    </div>
  );
}

function DungeonCard({
  ctx,
  dungeon,
  status,
  record,
  caught,
  serverNow,
  busy,
  onEnter,
}: {
  ctx: GameContext;
  dungeon: Dungeon;
  status: DungeonStatus;
  record: DungeonRecordDto | undefined;
  caught: ReadonlySet<number>;
  serverNow: number;
  busy: boolean;
  onEnter: () => void;
}) {
  const boss = ctx.species(dungeon.boss.speciesId, dungeon.boss.formId);
  const locked = status.state === 'locked';
  const gems = record?.gems ?? 0;
  const condition =
    status.state === 'locked' && !status.conditionMet
      ? unlockConditionText(ctx, dungeon.unlock)
      : null;

  return (
    <div className={`card flex flex-col gap-3 p-4 ${locked ? 'opacity-80' : ''}`}>
      <div className="flex items-start gap-3">
        <PokemonSprite
          speciesId={dungeon.boss.speciesId}
          formId={dungeon.boss.formId}
          size={72}
          kind="artwork"
          silhouette={locked}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1 font-semibold">
            <span className="truncate">{dungeon.name}</span>
            {dungeon.weather && (
              <WeatherIcon weather={dungeon.weather} activity="dungeon" className="text-base" />
            )}
          </h3>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {boss?.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <DungeonDifficultyBadge ctx={ctx} dungeon={dungeon} />
            {dungeon.opponents.length + 1} combats · boss N.{dungeon.boss.level}
          </p>
        </div>
        {dungeon.gemItemId && (
          <span
            className="flex shrink-0 flex-col items-center text-[10px] text-slate-500"
            title={
              gems > 0
                ? `${itemName(ctx, dungeon.gemItemId)} obtenue ${gems} fois`
                : `${itemName(ctx, dungeon.gemItemId)} : pas encore obtenue`
            }
          >
            <img
              src={itemIcon(ctx, dungeon.gemItemId)}
              alt=""
              className={`h-8 w-8 [image-rendering:pixelated] ${gems > 0 ? '' : 'opacity-30 grayscale'}`}
            />
            {gems > 0 ? `× ${gems}` : '?'}
          </span>
        )}
      </div>

      <div>
        <p className="text-xs text-slate-500">Lignée à capturer</p>
        <div className="flex flex-wrap items-center gap-0.5">
          {dungeon.familySpeciesIds.map((id) => (
            <span
              key={id}
              title={`${speciesName(ctx, id)}${caught.has(id) ? '' : ' (pas encore capturé)'}`}
            >
              <PokemonSprite speciesId={id} size={40} silhouette={!caught.has(id)} />
            </span>
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {record ? `${record.wins} victoire${record.wins > 1 ? 's' : ''}` : 'Jamais exploré'}
        </span>
        {status.state === 'available' && (
          <button
            className="btn-primary"
            disabled={busy}
            title={busy ? 'Tu explores déjà un donjon.' : undefined}
            onClick={onEnter}
          >
            Entrer
          </button>
        )}
        {status.state === 'cooldown' && (
          <span className="text-sm text-slate-500">
            Rouvre dans {formatCountdown(status.until.getTime() - serverNow)}
          </span>
        )}
        {status.state === 'locked' && (
          <span className="text-right text-xs text-slate-500">
            🔒{' '}
            {status.missingSpeciesIds.length > 0
              ? `Capture encore ${status.missingSpeciesIds.map((id) => speciesName(ctx, id)).join(', ')}`
              : condition}
          </span>
        )}
      </div>
    </div>
  );
}
