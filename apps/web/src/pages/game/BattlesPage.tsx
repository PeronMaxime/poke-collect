import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BattleRules, Trainer } from '@poke/content';
import { trainerPower, trainerStatus } from '@poke/game-core';
import type { GameContext, TrainerStatus } from '@poke/game-core';
import type { BattleDto, ClaimBattleResponse, TrainerRecordDto } from '@poke/shared';
import { PokemonSprite, TypeBadge, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, serverOffset, useBattles, usePlayerProgress } from '../../lib/game';
import {
  formatCountdown,
  formatMoney,
  itemIcon,
  itemName,
  unlockConditionText,
} from '../../lib/labels';
import { BattleResult } from './BattleResult';
import { CombatWindow, OngoingCombatBanner, useCombatWindow } from './CombatWindow';
import { DungeonCombat } from './DungeonCombat';
import { LaunchBattleDialog } from './LaunchBattleDialog';
import { RegionTabs, currentRegionTab, useSavedRegionTab } from './RegionTabs';
import { ZoneWeatherIcon } from './WeatherIcon';

/** Au-delà, le résultat d'un combat réclamé en l'absence du joueur n'est plus montré. */
const RESULT_MAX_AGE_MS = 3 * 24 * 3600_000;

/** Temps imparti lisible : 1 min 30 s, 2 min. */
export function formatTimeLimit(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** Portrait d'un dresseur (sprite, ou initiale à défaut). */
export function TrainerSprite({ trainer, size = 64 }: { trainer: Trainer; size?: number }) {
  return trainer.sprite ? (
    <img
      src={trainer.sprite}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 object-contain [image-rendering:pixelated]"
    />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-slate-200 font-bold text-slate-500 dark:bg-slate-800"
      style={{ width: size, height: size, fontSize: size / 2.5 }}
    >
      {trainer.name.charAt(0)}
    </span>
  );
}

/** Badge (image de l'admin, ou médaille dessinée). */
export function BadgeIcon({
  badge,
  size = 28,
  className = '',
}: {
  badge: NonNullable<Trainer['badge']>;
  size?: number;
  className?: string;
}) {
  return badge.image ? (
    <img
      src={badge.image}
      alt={badge.name}
      title={badge.name}
      width={size}
      height={size}
      className={className}
    />
  ) : (
    <span
      title={badge.name}
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-200 to-amber-500 text-amber-900 shadow-inner ${className}`}
      style={{ width: size, height: size, fontSize: size / 2 }}
    >
      ★
    </span>
  );
}

/** Conditions d'équipe d'un dresseur (rien s'il n'en impose aucune). */
export function TrainerRules({
  rules,
  className = '',
}: {
  rules: BattleRules;
  className?: string;
}) {
  if (
    !rules.teamSize &&
    !rules.maxLevel &&
    rules.minPower === 0 &&
    rules.requiredTypes.length === 0 &&
    rules.forbiddenTypes.length === 0
  )
    return null;
  return (
    <ul
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 ${className}`}
    >
      {rules.teamSize && <li>{rules.teamSize} Pokémon exactement</li>}
      {rules.maxLevel && <li>Niveau ≤ {rules.maxLevel}</li>}
      {rules.minPower > 0 && <li>PE ≥ {rules.minPower}</li>}
      {rules.requiredTypes.map((r) => (
        <li key={r.type} className="flex items-center gap-1">
          {r.count} × <TypeBadge type={r.type} />
        </li>
      ))}
      {rules.forbiddenTypes.length > 0 && (
        <li className="flex items-center gap-1">
          Interdits :
          {rules.forbiddenTypes.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </li>
      )}
    </ul>
  );
}

export function BattlesPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const battles = useBattles();
  const progress = usePlayerProgress();
  const now = useNow();
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('battles');
  const [launch, setLaunch] = useState<Trainer | null>(null);
  const [result, setResult] = useState<{ battle: BattleDto; currency: number | null } | null>(null);
  // Résultat fermé à l'instant, en attendant que le serveur le marque comme vu.
  const [seen, setSeen] = useState<string | null>(null);
  // Combat terminé, et celui dont le joueur a demandé le résultat.
  const [overBattle, setOverBattle] = useState<string | null>(null);
  const [claimBattle, setClaimBattle] = useState<string | null>(null);

  const offset = serverOffset(battles.data, battles.dataUpdatedAt);
  const serverNow = now + offset;
  const active = battles.data?.active ?? null;
  const last = battles.data?.last ?? null;
  const records = new Map(battles.data?.records.map((r) => [r.trainerId, r]));
  const regionId = currentRegionTab(ctx, progress, selectedRegion);
  const region = ctx.regions.find((r) => r.id === regionId);
  const trainers = ctx.trainers.filter((t) => t.regionId === regionId);
  const badges = trainers.filter((t) => t.badge);
  const badgesEarned = badges.filter((t) => (records.get(t.id)?.wins ?? 0) > 0).length;
  const elites = trainers.filter((t) => leagueRank(t) === 'elite');
  // Rien n'est montré au-delà du prochain Champion, membre du Conseil 4 ou Maître pas encore battu.
  const nextFeatured = trainers.findIndex(
    (t) => leagueRank(t) && (records.get(t.id)?.wins ?? 0) === 0,
  );
  const shown = nextFeatured < 0 ? trainers : trainers.slice(0, nextFeatured + 1);
  const hiddenCount = trainers.length - shown.length;

  // Combat réclamé en l'absence du joueur (ou dont la fenêtre n'a pas été fermée) : son
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
  const shownResult = result ?? (unseen ? { battle: unseen, currency: null } : null);

  const activeId = active?.id ?? null;
  const { open: combatOpen, show: showCombat } = useCombatWindow('battle-combat-hidden', activeId);
  const markOver = useCallback(() => setOverBattle(activeId), [activeId]);
  const activeTrainer = active ? ctx.trainer(active.trainerId) : undefined;
  const activeTitle = activeTrainer
    ? `Combat contre ${activeTrainer.trainerClass} ${activeTrainer.name}`
    : 'Combat de dresseur';

  function closeResult() {
    if (shownResult) {
      const id = shownResult.battle.id;
      setSeen(id);
      api(`/api/battles/${id}/seen`, { method: 'POST' })
        .then(() => queryClient.invalidateQueries({ queryKey: keys.battles }))
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
          title={activeTitle}
          portrait={activeTrainer && <TrainerSprite trainer={activeTrainer} size={72} />}
          over={overBattle === active.id}
          claiming={claimBattle === active.id}
          onShow={() => {
            if (overBattle === active.id) setClaimBattle(active.id);
            else showCombat(true);
          }}
        />
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Dresseurs{region ? ` de ${region.name}` : ''}
            {badges.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                {badgesEarned} / {badges.length} badges
              </span>
            )}
          </h2>
          <RegionTabs
            ctx={ctx}
            progress={progress}
            selected={regionId}
            onSelect={setSelectedRegion}
          />
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Les Pokémon du dresseur entrent en combat un par un : bats-les tous avant la fin du temps
          imparti. Un dresseur répétable se repose après chaque combat ; un Champion d’arène ne se
          bat qu’une fois, mais se retente aussitôt après une défaite.
        </p>
        {trainers.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun dresseur dans cette région pour le moment.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((trainer) => {
              const card = {
                ctx,
                trainer,
                status: trainerStatus(ctx, trainer, progress, records.get(trainer.id), serverNow),
                record: records.get(trainer.id),
                fighting: active?.trainerId === trainer.id,
                busy: !!active,
                serverNow,
                onLaunch: () => setLaunch(trainer),
              };
              const rank = leagueRank(trainer);
              return rank ? (
                <FeaturedTrainerCard
                  key={trainer.id}
                  {...card}
                  rank={rank}
                  eliteIndex={elites.indexOf(trainer)}
                  eliteCount={elites.length}
                />
              ) : (
                <TrainerCard key={trainer.id} {...card} />
              );
            })}
          </div>
        )}
        {hiddenCount > 0 && (
          <p className="mt-3 text-center text-sm text-slate-500">
            🔒 Bats {shown[shown.length - 1]!.name} pour découvrir la suite.
          </p>
        )}
      </section>

      {active && (
        <CombatWindow open={combatOpen} onClose={() => showCombat(false)}>
          <DungeonCombat<BattleDto, ClaimBattleResponse>
            key={active.id}
            ctx={ctx}
            title={activeTitle}
            apiBase="/api/battles"
            queryKey={keys.battles}
            run={active}
            offsetMs={offset}
            visible={combatOpen}
            onHide={() => showCombat(false)}
            claimRequested={claimBattle === active.id}
            onOver={markOver}
            onClaimError={() => {
              setClaimBattle(null);
              showCombat(true);
            }}
            onFinished={(data) => setResult({ battle: data.battle, currency: data.currency })}
          />
        </CombatWindow>
      )}
      {launch && <LaunchBattleDialog ctx={ctx} trainer={launch} onClose={() => setLaunch(null)} />}
      <BattleResult
        ctx={ctx}
        battle={shownResult?.battle ?? null}
        currency={shownResult?.currency ?? null}
        onClose={closeResult}
      />
    </div>
  );
}

interface TrainerCardProps {
  ctx: GameContext;
  trainer: Trainer;
  status: TrainerStatus;
  record: TrainerRecordDto | undefined;
  /** Combat en cours contre ce dresseur. */
  fighting: boolean;
  /** Un combat de dresseur est déjà en cours. */
  busy: boolean;
  serverNow: number;
  onLaunch: () => void;
}

/** Un dresseur sans condition n'est verrouillé que par sa région. */
const unlockText = (ctx: GameContext, trainer: Trainer) =>
  unlockConditionText(ctx, trainer.unlock) ?? 'Région verrouillée';

/** Classe, nom, météo de sa zone, puis zone, temps imparti et bilan. */
function TrainerHeading({
  ctx,
  trainer,
  status,
  record,
  serverNow,
  large = false,
}: Pick<TrainerCardProps, 'ctx' | 'trainer' | 'status' | 'record' | 'serverNow'> & {
  large?: boolean;
}) {
  const zone = trainer.zoneId ? ctx.zone(trainer.zoneId) : undefined;
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{trainer.trainerClass}</p>
      <h3 className={`font-semibold ${large ? 'text-xl' : ''}`}>
        {trainer.name} {status.state === 'defeated' && <span className="text-emerald-600">✓</span>}
        {zone && (
          <ZoneWeatherIcon
            zone={zone}
            at={serverNow}
            activity="battle"
            className="ml-1 text-base"
          />
        )}
      </h3>
      <p className="text-xs text-slate-500">
        {zone ? `${zone.name} · ` : ''}
        {formatTimeLimit(trainer.timeLimitSeconds)}
        {' · '}
        {trainer.repeatable ? 'Répétable' : 'Unique'}
        {record && (record.wins > 0 || record.losses > 0) && (
          <>
            {' · '}
            {record.wins} V / {record.losses} D
          </>
        )}
      </p>
    </div>
  );
}

/** Équipe du dresseur, dans l'ordre d'entrée (silhouettes tant qu'il est verrouillé). */
function TrainerTeam({
  ctx,
  trainer,
  locked,
  size = 44,
}: {
  ctx: GameContext;
  trainer: Trainer;
  locked: boolean;
  size?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {trainer.team.map((m, i) => (
        <span key={i} className="flex flex-col items-center text-[10px] text-slate-500">
          <PokemonSprite
            speciesId={m.speciesId}
            formId={m.formId}
            size={size}
            silhouette={locked}
            alt={locked ? '?' : ctx.species(m.speciesId, m.formId)?.nameFr}
          />
          N.{m.level}
        </span>
      ))}
    </div>
  );
}

/** Argent et butin possible d'une victoire. */
function TrainerRewards({ ctx, trainer }: { ctx: GameContext; trainer: Trainer }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
      {trainer.money > 0 && <span className="font-semibold">{formatMoney(trainer.money)}</span>}
      {trainer.lootTableId &&
        trainer.lootRolls > 0 &&
        ctx
          .lootTable(trainer.lootTableId)
          ?.entries.slice(0, 4)
          .map((e) => (
            <img
              key={e.itemId}
              src={itemIcon(ctx, e.itemId)}
              alt={itemName(ctx, e.itemId)}
              title={`${itemName(ctx, e.itemId)} (${Math.round(e.chance * 100)} %)`}
              className="h-6 w-6"
            />
          ))}
    </div>
  );
}

/** Bouton « Défier », ou ce qui l'empêche (verrou, recharge, combat en cours…). */
function TrainerAction({
  ctx,
  trainer,
  status,
  fighting,
  busy,
  serverNow,
  onLaunch,
}: Pick<
  TrainerCardProps,
  'ctx' | 'trainer' | 'status' | 'fighting' | 'busy' | 'serverNow' | 'onLaunch'
>) {
  if (status.state === 'locked') {
    return <p className="text-center text-sm text-slate-500">🔒 {unlockText(ctx, trainer)}</p>;
  }
  if (status.state === 'defeated') {
    return <p className="text-center text-sm font-semibold text-emerald-600">Déjà battu</p>;
  }
  if (status.state === 'cooldown') {
    return (
      <p className="text-center text-sm text-slate-500">
        Au repos encore{' '}
        <span className="font-mono">{formatCountdown(status.until.getTime() - serverNow)}</span>
      </p>
    );
  }
  if (fighting) return <p className="text-center text-sm text-brand-600">Combat en cours…</p>;
  return (
    <button
      className="btn-primary w-full"
      disabled={busy}
      title={busy ? 'Tu affrontes déjà un dresseur.' : undefined}
      onClick={onLaunch}
    >
      Défier
    </button>
  );
}

function TrainerCard(props: TrainerCardProps) {
  const { ctx, trainer, status } = props;
  const locked = status.state === 'locked';
  return (
    <div className={`card flex flex-col gap-3 p-4 ${locked ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <TrainerSprite trainer={trainer} size={64} />
        <div className="min-w-0 flex-1">
          <TrainerHeading {...props} />
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          PE {trainerPower(ctx, trainer)}
        </span>
      </div>
      <TrainerTeam ctx={ctx} trainer={trainer} locked={locked} />
      <TrainerRewards ctx={ctx} trainer={trainer} />
      <TrainerRules rules={trainer.rules} />
      <div className="mt-auto">
        <TrainerAction {...props} />
      </div>
    </div>
  );
}

/** Dresseurs mis en avant : Champion d'arène (il donne un badge), Conseil 4, Maître de la Ligue. */
type LeagueRank = 'gym' | 'elite' | 'master';

/** Le Conseil 4 et le Maître sont reconnus à leur classe (« Conseil 4 », « Maître de la Ligue »). */
function leagueRank(trainer: Trainer): LeagueRank | null {
  if (/^conseil\b/i.test(trainer.trainerClass)) return 'elite';
  if (/^ma[iî]tre(sse)? de la ligue/i.test(trainer.trainerClass)) return 'master';
  return trainer.badge ? 'gym' : null;
}

/** Couleurs de chaque rang ; un Champion battu passe au vert, comme son badge obtenu. */
const RANK_STYLES: Record<
  LeagueRank,
  { card: string; done?: string; label: string; medal: string }
> = {
  gym: {
    card: 'border-amber-400/80 from-amber-50 via-white to-amber-100/60 dark:border-amber-700 dark:from-amber-950/50 dark:via-slate-900 dark:to-amber-950/30',
    done: 'border-emerald-400/70 from-emerald-50 via-white to-amber-50 dark:border-emerald-700 dark:from-emerald-950/60 dark:via-slate-900 dark:to-amber-950/40',
    label: 'text-amber-700 dark:text-amber-300',
    medal: '',
  },
  elite: {
    card: 'border-violet-400/80 from-violet-50 via-white to-indigo-100/70 dark:border-violet-700 dark:from-violet-950/60 dark:via-slate-900 dark:to-indigo-950/40',
    label: 'text-violet-700 dark:text-violet-300',
    medal:
      'bg-gradient-to-br from-violet-500 to-indigo-700 text-white ring-2 ring-violet-200 dark:ring-violet-800',
  },
  master: {
    card: 'border-rose-500/80 from-rose-50 via-amber-50 to-yellow-100/80 ring-2 ring-yellow-300/60 ring-offset-2 ring-offset-white dark:border-rose-700 dark:from-rose-950/60 dark:via-slate-900 dark:to-yellow-950/40 dark:ring-yellow-700/50 dark:ring-offset-slate-950',
    label: 'text-rose-700 dark:text-rose-300',
    medal:
      'bg-gradient-to-br from-yellow-300 via-amber-400 to-rose-500 text-white ring-2 ring-yellow-200 dark:ring-yellow-800',
  },
};

/**
 * Champion d'arène, membre du Conseil 4 ou Maître de la Ligue : toute une ligne, qui clôt la
 * section des dresseurs qui mènent à lui. Le badge du Champion (ou l'emblème du Conseil et du
 * Maître) est mis en avant, grisé tant que le dresseur n'est pas battu.
 */
function FeaturedTrainerCard(
  props: TrainerCardProps & { rank: LeagueRank; eliteIndex: number; eliteCount: number },
) {
  const { ctx, trainer, status, record, rank, eliteIndex, eliteCount } = props;
  const locked = status.state === 'locked';
  const won = (record?.wins ?? 0) > 0;
  const style = RANK_STYLES[rank];
  const dim = won ? 'drop-shadow-md' : 'opacity-40 grayscale';
  const label =
    rank === 'gym' && trainer.badge
      ? trainer.badge.name
      : rank === 'elite'
        ? `Conseil 4${eliteIndex >= 0 ? ` · ${eliteIndex + 1} / ${eliteCount}` : ''}`
        : 'Maître de la Ligue';
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 bg-gradient-to-r p-4 shadow-sm md:col-span-2 ${
        won && style.done ? style.done : style.card
      } ${locked ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <TrainerSprite trainer={trainer} size={rank === 'master' ? 112 : 96} />
          <div className="flex flex-col items-center gap-1">
            {rank === 'gym' && trainer.badge ? (
              <BadgeIcon badge={trainer.badge} size={48} className={dim} />
            ) : (
              <span
                className={`grid h-12 w-12 place-items-center rounded-full text-lg font-black shadow ${style.medal} ${dim}`}
                aria-hidden
              >
                {rank === 'master' ? '♛' : eliteIndex >= 0 ? eliteIndex + 1 : '★'}
              </span>
            )}
            <span
              className={`max-w-24 text-center text-[11px] leading-tight font-semibold ${style.label}`}
            >
              {label}
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <TrainerHeading {...props} large />
            <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
              PE {trainerPower(ctx, trainer)}
            </span>
          </div>
          <TrainerTeam ctx={ctx} trainer={trainer} locked={locked} size={56} />
          <TrainerRules rules={trainer.rules} />
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:w-48">
          <TrainerRewards ctx={ctx} trainer={trainer} />
          <TrainerAction {...props} />
        </div>
      </div>
    </div>
  );
}
