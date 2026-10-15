import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { DUNGEON_DIFFICULTIES } from '@poke/content';
import type { Dungeon } from '@poke/content';
import { dungeonStatus } from '@poke/game-core';
import type { DungeonStatus, GameContext } from '@poke/game-core';
import type { DungeonRecordDto, DungeonRunDto } from '@poke/shared';
import { PokemonSprite, TypeBadge, useNow } from '../../components/ui';
import { serverOffset, useDungeons, usePlayerProgress } from '../../lib/game';
import {
  formatCountdown,
  itemIcon,
  itemName,
  speciesName,
  unlockConditionText,
} from '../../lib/labels';
import { DungeonCombat } from './DungeonCombat';
import { DungeonDifficultyBadge } from './DungeonDifficultyBadge';
import { DungeonResult } from './DungeonResult';
import { LaunchDungeonDialog } from './LaunchDungeonDialog';
import { RegionTabs, currentRegionTab, useSavedRegionTab } from './RegionTabs';
import { pillClass } from './TeamPicker';

/** Dernière tentative dont le joueur a vu le résultat (une réclamée en son absence s'affiche une fois). */
const SEEN_KEY = 'dungeon-result-seen';
/** Au-delà, le résultat d'une tentative réclamée en l'absence du joueur n'est plus montré. */
const RESULT_MAX_AGE_MS = 3 * 24 * 3600_000;

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

const SORTS = { order: 'Pokédex', difficulty: 'Difficulté' } as const;
type Sort = keyof typeof SORTS;
/** Tri choisi par le joueur, retenu d'une visite à l'autre. */
const SORT_KEY = 'dungeon-sort';

function readSort(): Sort {
  try {
    return localStorage.getItem(SORT_KEY) === 'difficulty' ? 'difficulty' : 'order';
  } catch {
    return 'order';
  }
}

function saveSort(sort: Sort) {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // Stockage indisponible : le tri revient à l'ordre par défaut à la prochaine visite.
  }
}

/** Tentative dont le joueur a fermé la fenêtre du combat (rouverte via le bouton de la liste). */
const HIDDEN_KEY = 'dungeon-combat-hidden';

function readHidden(): string | null {
  try {
    return sessionStorage.getItem(HIDDEN_KEY);
  } catch {
    return null;
  }
}

function saveHidden(id: string | null) {
  try {
    if (id) sessionStorage.setItem(HIDDEN_KEY, id);
    else sessionStorage.removeItem(HIDDEN_KEY);
  } catch {
    // Stockage indisponible : la fenêtre se rouvrira au prochain passage sur la page.
  }
}

function markSeen(id: string) {
  try {
    localStorage.setItem(SEEN_KEY, id);
  } catch {
    // Stockage indisponible : le résultat pourra s'afficher de nouveau.
  }
}

export function DungeonsPage({ ctx }: { ctx: GameContext }) {
  const dungeons = useDungeons();
  const progress = usePlayerProgress();
  const now = useNow();
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('dungeons');
  const [launch, setLaunch] = useState<Dungeon | null>(null);
  const [result, setResult] = useState<{ run: DungeonRunDto; currency: number | null } | null>(
    null,
  );
  const [seen, setSeen] = useState(readSeen);
  const [sort, setSort] = useState(readSort);
  const [hiddenRun, setHiddenRun] = useState(readHidden);
  // Tentative dont le combat est terminé, et celle dont le joueur a demandé le résultat.
  const [overRun, setOverRun] = useState<string | null>(null);
  const [claimRun, setClaimRun] = useState<string | null>(null);

  const offset = serverOffset(dungeons.data, dungeons.dataUpdatedAt);
  const serverNow = now + offset;
  const active = dungeons.data?.active ?? null;
  const last = dungeons.data?.last ?? null;
  const records = new Map(dungeons.data?.records.map((r) => [r.dungeonId, r]));
  const regionId = currentRegionTab(ctx, progress, selectedRegion);
  const inRegion = ctx.dungeons.filter((d) => d.regionId === regionId);
  const listed = inRegion
    .map((d) => ({
      dungeon: d,
      status: dungeonStatus(ctx, d, progress, records.get(d.id), serverNow),
    }))
    .filter((d) => d.status.state !== 'hidden');
  // Du plus facile au plus difficile, dans l'ordre habituel à difficulté égale.
  if (sort === 'difficulty') {
    const rank = (d: Dungeon) => DUNGEON_DIFFICULTIES.indexOf(d.difficulty);
    listed.sort((a, b) => rank(a.dungeon) - rank(b.dungeon) || a.dungeon.order - b.dungeon.order);
  }
  const hiddenCount = inRegion.length - listed.length;

  // Tentative réclamée en l'absence du joueur : son résultat s'affiche une fois.
  const unseen =
    !active &&
    !result &&
    last?.result &&
    last.id !== seen &&
    last.claimedAt &&
    serverNow - Date.parse(last.claimedAt) < RESULT_MAX_AGE_MS
      ? last
      : null;
  const shownResult = result ?? (unseen ? { run: unseen, currency: null } : null);

  // Fenêtre du combat : ouverte d'office pour une nouvelle tentative, sauf si le joueur l'a fermée.
  const combatOpen = !!active && hiddenRun !== active.id;
  function showCombat(open: boolean) {
    const id = open ? null : (active?.id ?? null);
    saveHidden(id);
    setHiddenRun(id);
  }
  const activeId = active?.id ?? null;
  const markOver = useCallback(() => setOverRun(activeId), [activeId]);

  function closeResult() {
    if (shownResult) {
      markSeen(shownResult.run.id);
      setSeen(shownResult.run.id);
    }
    setResult(null);
  }

  return (
    <div className="space-y-6">
      {active && !combatOpen && (
        <OngoingCombatBanner
          ctx={ctx}
          run={active}
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
          />
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Chaque donjon abrite une Méga-Évolution. Capture toute la lignée de son Pokémon pour y
          entrer, puis bats ses adversaires un à un jusqu’au boss pour tenter de remporter sa
          Méga-Gemme : elle permet de méga-évoluer ton Pokémon au PC.
        </p>
        {listed.length > 1 && (
          <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
            <span className="text-slate-500">Trier par</span>
            {(Object.keys(SORTS) as Sort[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSort(key);
                  saveSort(key);
                }}
                className={pillClass(sort === key)}
              >
                {SORTS[key]}
              </button>
            ))}
          </div>
        )}

        {listed.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            Aucun donjon découvert dans cette région. Capture un Pokémon d’une lignée capable de
            méga-évoluer pour révéler son donjon.
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
            {hiddenCount > 1 ? 's' : ''} dans cette région.
          </p>
        )}
      </section>

      {active && (
        <CombatWindow open={combatOpen} onClose={() => showCombat(false)}>
          <DungeonCombat
            key={active.id}
            ctx={ctx}
            dungeon={ctx.dungeon(active.dungeonId)}
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
              markSeen(data.run.id);
              setSeen(data.run.id);
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

/**
 * Fenêtre du combat. Contrairement à `Modal`, son contenu reste monté une fois fermée :
 * le combat continue de tourner (et se réclame à sa fin) pendant que le joueur parcourt la liste.
 */
function CombatWindow({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={
        open
          ? 'fixed inset-0 z-50 grid animate-[dungeon-fade_150ms_ease-out] place-items-center overflow-y-auto bg-slate-950/60 p-4'
          : 'hidden'
      }
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Rappel du combat en cours, bien visible en haut de la liste, pour rouvrir sa fenêtre ;
 * une fois le combat terminé, pour en voir le résultat.
 */
function OngoingCombatBanner({
  ctx,
  run,
  over,
  claiming,
  onShow,
}: {
  ctx: GameContext;
  run: DungeonRunDto;
  over: boolean;
  claiming: boolean;
  onShow: () => void;
}) {
  const dungeon = ctx.dungeon(run.dungeonId);
  const boss = run.setup.enemies.at(-1);
  return (
    <button
      type="button"
      onClick={onShow}
      disabled={claiming}
      className="group flex w-full items-center gap-4 rounded-2xl border-2 border-brand-500 bg-brand-500/10 p-4 text-left shadow-lg transition hover:bg-brand-500/20"
    >
      {boss && (
        <PokemonSprite
          speciesId={boss.speciesId}
          formId={boss.formId}
          size={72}
          className="shrink-0"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand-600 uppercase">
          <span className="relative flex h-2.5 w-2.5">
            {!over && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
            )}
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
          </span>
          {over ? 'Combat terminé' : 'Combat en cours'}
        </span>
        <span className="block truncate text-lg font-bold">
          Donjon : {dungeon?.name ?? run.dungeonId}
        </span>
      </span>
      <span className="btn-primary shrink-0 px-5 py-3 text-base">
        {claiming ? 'Résultat…' : over ? '🏁 Voir le résultat' : '⚔️ Afficher le combat'}
      </span>
    </button>
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
          <h3 className="truncate font-semibold">{dungeon.name}</h3>
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
