/**
 * Onglet « Donjons » : un donjon par Méga-Évolution, la tentative en cours, le départ et le résultat.
 */
import type { Dungeon } from '@poke/content';
import type { DungeonStatus, GameContext } from '@poke/game-core';
import type { ClaimDungeonResponse, DungeonRecordDto, DungeonRunDto } from '@poke/shared';
import { PokemonSprite, TypeBadge } from '../../components/ui';
import { COMBAT_API, keys } from '../../lib/queries';
import {
  formatCountdown,
  itemIcon,
  itemName,
  speciesName,
  unlockConditionText,
} from '../../lib/labels';
import { CombatWindow, OngoingCombatBanner } from '../common/CombatWindow';
import { DungeonCombat } from '../common/DungeonCombat';
import { DungeonDifficultyBadge } from './DungeonDifficultyBadge';
import { DungeonResult } from './DungeonResult';
import { LaunchDungeonDialog } from './LaunchDungeonDialog';
import { RegionTabs } from '../common/RegionTabs';
import { WeatherIcon } from '../common/WeatherIcon';
import { ALL_TAB, useDungeonsPage } from './useDungeonsPage';

/**
 * Onglet « Donjons » : un donjon par Méga-Évolution, révélé par la capture d'un Pokémon de sa
 * lignée ; la tentative en cours, le départ et le résultat.
 */
export function DungeonsPage({ ctx }: { ctx: GameContext }) {
  const page = useDungeonsPage(ctx);
  const {
    progress,
    regionId,
    isAllTab,
    listed,
    hiddenCount,
    records,
    serverNow,
    active,
    offset,
    combatOpen,
    showCombat,
    markOver,
    overRun,
    claimRun,
    setClaimRun,
    launch,
    setLaunch,
    setResult,
    shownResult,
    closeResult,
    setSelectedRegion,
  } = page;
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            apiBase={COMBAT_API.dungeons}
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

/** Carte d'un donjon : son boss, sa gemme, la lignée à capturer, puis l'entrée ou ce qui l'empêche. */
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
