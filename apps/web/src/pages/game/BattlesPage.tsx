import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BattleRules, Trainer } from '@poke/content';
import { isTrainerRevealed, trainerStatus } from '@poke/game-core';
import type { GameContext, TrainerStatus } from '@poke/game-core';
import type { BattleDto, ClaimBattleResponse, TrainerRecordDto } from '@poke/shared';
import { PokemonSprite, TypeBadge, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, serverOffset, useBattles, usePlayerProgress, useQuests } from '../../lib/queries';
import {
  TYPE_COLORS,
  formatCountdown,
  formatMoney,
  itemIcon,
  itemName,
  trainerName,
  unlockConditionText,
} from '../../lib/labels';
import { BattleResult } from './BattleResult';
import { BuildingSection, EMPTY_PLACE, Notice, StateTag } from './BuildingParts';
import { CombatWindow, OngoingCombatBanner, useCombatWindow } from './CombatWindow';
import { DungeonCombat } from './DungeonCombat';
import { SECTION_TITLE } from './dialogParts';
import { LaunchBattleDialog } from './LaunchBattleDialog';
import { RegionTabs, currentRegionTab, useSavedRegionTab } from './RegionTabs';
import { ZoneWeatherIcon } from './WeatherIcon';
import { BANNER_LABEL, CHECKER, TINTED_BANNER, zoneSpecies, zoneTint } from './zoneBanner';

/**
 * Grille des dresseurs : jusqu'à 3 tuiles par ligne, selon la largeur réellement disponible
 * (celle-ci dépend de la colonne des widgets, d'où une requête de conteneur plutôt que d'écran).
 */
const TRAINER_GRID = 'grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3';

/** Ancre de la tuile d'un Champion, pour y descendre depuis la boîte à badges. */
const trainerAnchor = (trainerId: string) => `trainer-${trainerId}`;

/** Lien vers le combat d'un dresseur (`#battles/<dresseur>`), depuis une étape de quête. */
export const trainerBattleLink = (trainerId: string) => `#battles/${encodeURIComponent(trainerId)}`;

function trainerFromHash(): string | null {
  const [tab, trainerId] = window.location.hash.slice(1).split('/');
  return tab === 'battles' && trainerId ? decodeURIComponent(trainerId) : null;
}

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
      // Cadre carré imposé : sans lui, `height: auto` étirerait un badge plus haut que large.
      style={{ width: size, height: size }}
      className={`shrink-0 object-contain ${className}`}
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
  const quests = useQuests();
  const now = useNow();
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('battles');
  const [launch, setLaunch] = useState<Trainer | null>(null);
  const [result, setResult] = useState<{ battle: BattleDto; currency: number | null } | null>(null);
  // Résultat fermé à l'instant, en attendant que le serveur le marque comme vu.
  const [seen, setSeen] = useState<string | null>(null);
  // Combat terminé, et celui dont le joueur a demandé le résultat.
  const [overBattle, setOverBattle] = useState<string | null>(null);
  const [claimBattle, setClaimBattle] = useState<string | null>(null);
  // Arrivée par le lien d'un dresseur (étape de quête), et ce qui empêche de le défier.
  const [linkedTrainerId, setLinkedTrainerId] = useState(trainerFromHash);
  const [notice, setNotice] = useState<string | null>(null);

  const offset = serverOffset(battles.data, battles.dataUpdatedAt);
  const serverNow = now + offset;
  const active = battles.data?.active ?? null;
  const last = battles.data?.last ?? null;
  const records = new Map(battles.data?.records.map((r) => [r.trainerId, r]));
  const regionId = currentRegionTab(ctx, progress, selectedRegion);
  const region = ctx.regions.find((r) => r.id === regionId);
  const regionTrainers = ctx.trainers.filter((t) => t.regionId === regionId);
  const trainers = regionTrainers.filter((t) => !t.questId);
  // Dresseurs de quêtes : à part, en bas, et seulement une fois leur étape atteinte.
  const questTrainers = regionTrainers.filter(
    (t) => t.questId && isTrainerRevealed(ctx, t, progress),
  );
  const elites = trainers.filter((t) => leagueRank(t) === 'elite');
  // Rien n'est montré au-delà du prochain Champion, membre du Conseil 4 ou Maître pas encore battu.
  const nextFeatured = trainers.findIndex(
    (t) => leagueRank(t) && (records.get(t.id)?.wins ?? 0) === 0,
  );
  const shown = nextFeatured < 0 ? trainers : trainers.slice(0, nextFeatured + 1);
  const hiddenCount = trainers.length - shown.length;
  const beaten = (t: Trainer) => (records.get(t.id)?.wins ?? 0) > 0;

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
    ? `Combat contre ${activeTrainer.trainerClass} ${trainerName(activeTrainer)}`
    : 'Combat de dresseur';

  const trainerCard = (trainer: Trainer) => ({
    ctx,
    trainer,
    status: trainerStatus(ctx, trainer, progress, records.get(trainer.id), serverNow),
    record: records.get(trainer.id),
    fighting: active?.trainerId === trainer.id,
    busy: !!active,
    serverNow,
    onLaunch: () => setLaunch(trainer),
  });

  const gyms = trainers.filter((t) => leagueRank(t) === 'gym' && t.badge);

  // Lien d'un dresseur : l'ancre est consommée, puis, une fois les combats et les quêtes connus,
  // sa région s'affiche et le départ s'ouvre s'il peut être défié (sinon, ce qui l'en empêche).
  useEffect(() => {
    const consume = () => {
      const trainerId = trainerFromHash();
      if (trainerId) history.replaceState(null, '', '#battles');
      return trainerId;
    };
    consume();
    const onHash = () => setLinkedTrainerId(consume());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (linkedTrainerId && battles.data && quests.data) {
    setLinkedTrainerId(null);
    const trainer = ctx.trainer(linkedTrainerId);
    if (trainer) {
      const card = trainerCard(trainer);
      setSelectedRegion(trainer.regionId);
      setNotice(linkNotice(ctx, trainer, card));
      if (card.fighting) showCombat(true);
      else if (!card.busy && card.status.state === 'available') setLaunch(trainer);
    }
  }

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
    <div className="space-y-4">
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

      {notice && (
        <Notice tone="warn" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      <BuildingSection
        id="battles.trainers"
        title={`Dresseurs${region ? ` de ${region.name}` : ''}`}
        label="les dresseurs de la région"
        count={shown.length > 0 ? `${shown.filter(beaten).length} / ${shown.length}` : undefined}
        countTitle="Dresseurs déjà battus"
        actions={
          <RegionTabs
            ctx={ctx}
            progress={progress}
            selected={regionId}
            onSelect={setSelectedRegion}
          />
        }
        intro="Les Pokémon du dresseur entrent en combat un par un : bats-les tous avant la fin du temps imparti. Un dresseur répétable se repose après chaque combat ; un Champion d’arène ne se bat qu’une fois, mais se retente aussitôt après une défaite."
        className="space-y-3 @container"
      >
        {gyms.length > 0 && (
          <BadgeCase gyms={gyms} revealed={new Set(shown.map((t) => t.id))} won={beaten} />
        )}
        {trainers.length === 0 ? (
          <div
            className={`grid min-h-24 place-items-center p-4 text-center text-sm ${EMPTY_PLACE}`}
          >
            Aucun dresseur dans cette région pour le moment.
          </div>
        ) : (
          <div className={TRAINER_GRID}>
            {shown.map((trainer) => {
              const card = trainerCard(trainer);
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
          <div className={`grid place-items-center px-4 py-3 text-center text-sm ${EMPTY_PLACE}`}>
            🔒 Bats {shown[shown.length - 1]!.name} pour découvrir la suite.
          </div>
        )}
      </BuildingSection>

      {questTrainers.length > 0 && (
        <BuildingSection
          id="battles.quests"
          title="Dresseurs de quêtes"
          label="les dresseurs de quêtes"
          count={questTrainers.length}
          countTitle="Dresseurs de quêtes apparus"
          intro="Ils n’apparaissent qu’à l’étape de quête qui demande de les battre, et ne se battent qu’une fois (une défaite se retente aussitôt)."
          className="@container"
        >
          <div className={TRAINER_GRID}>
            {questTrainers.map((trainer) => (
              <TrainerCard key={trainer.id} {...trainerCard(trainer)} />
            ))}
          </div>
        </BuildingSection>
      )}

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

/**
 * Boîte à badges de la région : une case par badge, en couleur une fois gagné, grisé sinon. Un clic
 * descend jusqu'au Champion ; ceux qui ne sont pas encore découverts restent une case « ? ».
 */
function BadgeCase({
  gyms,
  revealed,
  won,
}: {
  gyms: Trainer[];
  revealed: Set<string>;
  won: (trainer: Trainer) => boolean;
}) {
  const count = gyms.filter(won).length;
  return (
    <div className="tile flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <p className="flex shrink-0 items-center gap-2">
        <span className={SECTION_TITLE}>Badges</span>
        <span className="count-badge">
          {count} / {gyms.length}
        </span>
      </p>
      <ul className="grid w-full grid-cols-4 gap-1.5 sm:flex sm:w-auto sm:flex-wrap">
        {gyms.map((trainer) => {
          const badge = trainer.badge!;
          if (!revealed.has(trainer.id)) {
            return (
              <li key={trainer.id}>
                <span
                  title="Badge à découvrir"
                  className="sprite-well h-12 w-full border-dashed sm:size-10 font-pixel text-[10px] text-slate-400 dark:text-slate-500"
                >
                  ?
                </span>
              </li>
            );
          }
          const got = won(trainer);
          return (
            <li key={trainer.id}>
              <button
                type="button"
                title={`${badge.name} · ${trainerName(trainer)}${got ? ' (obtenu)' : ''}`}
                aria-label={`${badge.name}, ${got ? 'obtenu' : 'pas encore obtenu'}`}
                className={`sprite-well h-12 w-full transition sm:size-10 hover:-translate-y-0.5 ${
                  got ? 'shiny-well' : ''
                }`}
                onClick={() =>
                  document
                    .getElementById(trainerAnchor(trainer.id))
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                <BadgeIcon badge={badge} size={30} className={got ? '' : 'opacity-35 grayscale'} />
              </button>
            </li>
          );
        })}
      </ul>
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

/** Ce qui empêche de défier le dresseur d'un lien (rien s'il peut l'être ou s'il est en cours). */
function linkNotice(
  ctx: GameContext,
  trainer: Trainer,
  {
    status,
    fighting,
    busy,
    serverNow,
  }: Pick<TrainerCardProps, 'status' | 'fighting' | 'busy' | 'serverNow'>,
): string | null {
  const name = trainerName(trainer);
  if (fighting) return null;
  switch (status.state) {
    case 'locked':
      return trainer.questId
        ? `${name} n’est pas encore apparu : avance dans sa quête.`
        : `${name} est verrouillé : ${unlockText(ctx, trainer)}.`;
    case 'defeated':
      return `${name} est déjà battu.`;
    case 'cooldown':
      return `${name} se repose encore ${formatCountdown(status.until.getTime() - serverNow)}.`;
    case 'available':
      return busy ? `Tu affrontes déjà un dresseur : termine ce combat pour défier ${name}.` : null;
  }
}

/** Un dresseur sans condition n'est verrouillé que par sa région. */
const unlockText = (ctx: GameContext, trainer: Trainer) =>
  unlockConditionText(ctx, trainer.unlock) ?? 'Région verrouillée';

/**
 * Décor du bandeau d'un dresseur : l'image de sa zone, ou le damier teinté du type le plus présent
 * parmi les Pokémon de la zone, comme les cartes des expéditions.
 */
export function TrainerBackdrop({ ctx, trainer }: { ctx: GameContext; trainer: Trainer }) {
  const zone = trainer.zoneId ? ctx.zone(trainer.zoneId) : undefined;
  if (zone?.image) {
    return (
      <img
        src={zone.image}
        alt=""
        className="absolute inset-0 h-full w-full object-cover dark:brightness-75"
      />
    );
  }
  const tint = zone ? zoneTint(zoneSpecies(ctx, zone)) : TYPE_COLORS.normal;
  return (
    <span
      aria-hidden
      className={`absolute inset-0 ${TINTED_BANNER}`}
      style={{ '--tint': tint, ...CHECKER } as CSSProperties}
    />
  );
}

/** Météo actuelle de la zone du dresseur, dans une petite case du bandeau. */
function TrainerWeather({
  ctx,
  trainer,
  serverNow,
}: Pick<TrainerCardProps, 'ctx' | 'trainer' | 'serverNow'>) {
  const zone = trainer.zoneId ? ctx.zone(trainer.zoneId) : undefined;
  if (!zone) return null;
  return (
    <ZoneWeatherIcon
      zone={zone}
      at={serverNow}
      activity="battle"
      className="rounded border-2 border-ink bg-win px-1 text-base leading-snug"
    />
  );
}

/** Zone, temps imparti, répétable ou unique, et bilan : petites étiquettes. */
export function TrainerFacts({
  ctx,
  trainer,
  record,
  className = '',
}: Pick<TrainerCardProps, 'ctx' | 'trainer' | 'record'> & { className?: string }) {
  const zone = trainer.zoneId ? ctx.zone(trainer.zoneId) : undefined;
  const facts = [
    zone?.name,
    `⏱ ${formatTimeLimit(trainer.timeLimitSeconds)}`,
    trainer.repeatable ? 'Répétable' : 'Unique',
    record && (record.wins > 0 || record.losses > 0)
      ? `${record.wins} V / ${record.losses} D`
      : undefined,
  ].filter((fact) => fact !== undefined);
  return (
    <ul className={`flex flex-wrap gap-1 ${className}`}>
      {facts.map((fact, i) => (
        <li
          key={i}
          className="rounded border-2 border-well-line px-1.5 text-xs whitespace-nowrap text-slate-600 dark:text-slate-300"
        >
          {fact}
        </li>
      ))}
    </ul>
  );
}

/** Équipe du dresseur, dans l'ordre d'entrée (silhouettes tant qu'il est verrouillé). */
function TrainerTeam({
  ctx,
  trainer,
  locked,
  large = false,
  className = '',
}: {
  ctx: GameContext;
  trainer: Trainer;
  locked: boolean;
  large?: boolean;
  className?: string;
}) {
  return (
    <ul className={`flex flex-wrap gap-x-1.5 gap-y-2.5 ${className}`}>
      {trainer.team.map((m, i) => {
        const name = locked ? '?' : (ctx.species(m.speciesId, m.formId)?.nameFr ?? '?');
        return (
          <li
            key={i}
            title={`${name} · N.${m.level}`}
            className={`sprite-well relative ${large ? 'size-14' : 'size-12'}`}
          >
            <PokemonSprite
              speciesId={m.speciesId}
              formId={m.formId}
              size={large ? 52 : 44}
              silhouette={locked}
              alt={name}
            />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded border-2 border-ink bg-win px-0.5 font-pixel text-[8px] leading-tight whitespace-nowrap">
              N.{m.level}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Argent et butin possible d'une victoire. */
function TrainerRewards({
  ctx,
  trainer,
  className = '',
}: {
  ctx: GameContext;
  trainer: Trainer;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      {trainer.money > 0 && (
        <span className="text-sm font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">
          {formatMoney(trainer.money)}
        </span>
      )}
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
  trainer,
  status,
  fighting,
  busy,
  serverNow,
  onLaunch,
  epic = false,
}: Pick<TrainerCardProps, 'trainer' | 'status' | 'fighting' | 'busy' | 'serverNow' | 'onLaunch'> & {
  /**
   * Champion, Conseil 4 ou Maître : bouton plus grand, rouge à liseré doré avec un reflet qui
   * passe, sur toute la largeur sur téléphone.
   */
  epic?: boolean;
}) {
  if (status.state === 'locked') {
    return <StateTag tone="idle">🔒 {trainer.questId ? 'À venir' : 'Verrouillé'}</StateTag>;
  }
  if (status.state === 'defeated') return <StateTag tone="ok">✓ Déjà battu</StateTag>;
  if (status.state === 'cooldown') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        Au repos
        <StateTag tone="idle">{formatCountdown(status.until.getTime() - serverNow)}</StateTag>
      </span>
    );
  }
  if (fighting) return <StateTag tone="heal">Combat en cours</StateTag>;
  return (
    <button
      className={epic ? 'btn-epic w-full sm:w-auto' : 'btn-primary'}
      disabled={busy}
      title={busy ? 'Tu affrontes déjà un dresseur.' : undefined}
      onClick={onLaunch}
    >
      Défier
    </button>
  );
}

/** Ligne du bas d'une tuile : gains à gauche, « Défier » (ou ce qui l'en empêche) à droite. */
const TILE_FOOTER =
  'mt-auto flex flex-wrap items-center justify-between gap-2 border-t-2 border-well-line px-3 py-2';

function TrainerCard(props: TrainerCardProps) {
  const { ctx, trainer, status } = props;
  const locked = status.state === 'locked';
  const done = status.state === 'defeated';
  return (
    <div className={`tile flex flex-col overflow-hidden ${locked ? 'opacity-60' : ''}`}>
      {/* Bandeau : le dresseur sur le décor de sa zone, son nom et la météo. */}
      <div className="relative flex items-center gap-2 border-b-[3px] border-ink px-2.5 py-1.5">
        <TrainerBackdrop ctx={ctx} trainer={trainer} />
        <span className="relative shrink-0">
          <TrainerSprite trainer={trainer} size={64} />
        </span>
        <div className="relative flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="pixel-label max-w-full truncate rounded border-2 border-ink bg-win px-1.5 text-[8px] text-slate-600 dark:text-slate-300">
            {trainer.trainerClass}
          </span>
          <h3 className={`max-w-full truncate ${BANNER_LABEL}`}>
            {trainerName(trainer)}
            {done && <span className="ml-1.5 text-emerald-600">✓</span>}
          </h3>
        </div>
        <span className="relative shrink-0">
          <TrainerWeather {...props} />
        </span>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <TrainerFacts {...props} />
        <TrainerTeam ctx={ctx} trainer={trainer} locked={locked} className="pb-1" />
        <TrainerRules rules={trainer.rules} />
        {locked && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            🔒 {unlockText(ctx, trainer)}
          </p>
        )}
      </div>
      <div className={TILE_FOOTER}>
        <TrainerRewards ctx={ctx} trainer={trainer} />
        {/* Hauteur du bouton « Défier » réservée : la barre ne change pas de hauteur sans lui. */}
        <div className="ml-auto flex min-h-10 shrink-0 items-center">
          <TrainerAction {...props} />
        </div>
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

/**
 * Couleurs de chaque rang : liseré intérieur de la tuile, étiquette du rang et emblème. Un
 * Champion battu passe au vert, comme son badge obtenu.
 */
const RANK_STYLES: Record<LeagueRank, { ring: string; done?: string; tag: string; medal: string }> =
  {
    gym: {
      ring: 'shadow-[inset_0_0_0_3px_#f5d061] dark:shadow-[inset_0_0_0_3px_#8a6414]',
      done: 'shadow-[inset_0_0_0_3px_#6ccf98] dark:shadow-[inset_0_0_0_3px_#1f7a4c]',
      tag: 'border-amber-600 bg-done text-amber-800 dark:text-[#f8d878]',
      medal: '',
    },
    elite: {
      ring: 'shadow-[inset_0_0_0_3px_#b9a4f5] dark:shadow-[inset_0_0_0_3px_#5b3fa8]',
      tag: 'border-violet-600 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-950 dark:text-violet-300',
      medal: 'bg-violet-600 text-white',
    },
    master: {
      ring: 'shadow-[inset_0_0_0_3px_#f5d061,inset_0_0_0_6px_#e8707a] dark:shadow-[inset_0_0_0_3px_#8a6414,inset_0_0_0_6px_#9c3f48]',
      tag: 'border-rose-600 bg-rose-50 text-rose-700 dark:border-rose-400 dark:bg-rose-950 dark:text-rose-300',
      medal: 'bg-gradient-to-br from-yellow-300 to-rose-500 text-white',
    },
  };

/**
 * Champion d'arène, membre du Conseil 4 ou Maître de la Ligue : toute une ligne, qui clôt la
 * section des dresseurs qui mènent à lui. À gauche, le dresseur devant une Poké Ball et son badge
 * (ou l'emblème du Conseil et du Maître), grisés tant qu'il n'est pas battu ; « Défier » à droite.
 */
function FeaturedTrainerCard(
  props: TrainerCardProps & { rank: LeagueRank; eliteIndex: number; eliteCount: number },
) {
  const { ctx, trainer, status, record, rank, eliteIndex, eliteCount } = props;
  const locked = status.state === 'locked';
  const won = (record?.wins ?? 0) > 0;
  const style = RANK_STYLES[rank];
  const dim = won ? '' : 'opacity-40 grayscale';
  const label =
    rank === 'gym'
      ? 'Champion d’arène'
      : rank === 'elite'
        ? `Conseil 4${eliteIndex >= 0 ? ` · ${eliteIndex + 1} / ${eliteCount}` : ''}`
        : 'Maître de la Ligue';
  return (
    <div
      id={trainerAnchor(trainer.id)}
      className={`tile col-span-full scroll-mt-4 overflow-hidden ${
        won && style.done ? style.done : style.ring
      } ${locked ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-col sm:flex-row">
        {/* À gauche : le dresseur devant une Poké Ball (en couleur une fois battu), son badge
            à droite sur téléphone, dessous ailleurs. */}
        <div className="flex shrink-0 flex-row items-center justify-center gap-4 border-b-[3px] border-ink p-3 sm:w-56 sm:flex-col sm:gap-2 sm:border-r-[3px] sm:border-b-0">
          <span
            className={`relative grid place-items-center ${rank === 'master' ? 'size-32' : 'size-28'}`}
          >
            <PokeBall
              className={`absolute inset-0 size-full ${won ? '' : 'opacity-25 grayscale'}`}
            />
            <span className="relative">
              <TrainerSprite trainer={trainer} size={rank === 'master' ? 112 : 96} />
            </span>
          </span>
          <span className="grid size-14 place-items-center rounded-md border-2 border-ink bg-win shadow-[2px_2px_0_rgb(0_0_0/0.25)]">
            {rank === 'gym' && trainer.badge ? (
              <BadgeIcon badge={trainer.badge} size={44} className={dim} />
            ) : (
              <span
                className={`grid size-10 place-items-center rounded border-2 border-ink font-pixel text-sm ${style.medal} ${dim}`}
                aria-hidden
              >
                {rank === 'master' ? '♛' : eliteIndex >= 0 ? eliteIndex + 1 : '★'}
              </span>
            )}
          </span>
        </div>

        {/* Au centre : rang, nom et météo, informations, équipe et conditions. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`pixel-label shrink-0 rounded border-2 px-1.5 text-[8px] uppercase ${style.tag}`}
            >
              {label}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {trainer.trainerClass}
            </span>
          </div>
          <div className="-mt-1 flex items-center gap-2">
            <h3 className="font-pixel text-xs text-title uppercase sm:text-sm">
              {trainerName(trainer)}
              {won && <span className="ml-2 text-emerald-600">✓</span>}
            </h3>
            <TrainerWeather {...props} />
          </div>
          <TrainerFacts {...props} />
          <TrainerTeam ctx={ctx} trainer={trainer} locked={locked} large className="pb-1" />
          <TrainerRules rules={trainer.rules} />
          {locked && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              🔒 {unlockText(ctx, trainer)}
            </p>
          )}
        </div>

        {/* À droite : « Défier », ou ce qui l'empêche (déjà battu, verrou…). */}
        <div className="flex shrink-0 items-center justify-center border-t-2 border-well-line p-3 sm:w-44 sm:border-t-0 sm:pr-4 sm:pl-0">
          <TrainerAction {...props} epic />
        </div>
      </div>
    </div>
  );
}

/** Poké Ball dessinée, derrière le sprite d'un dresseur mis en avant. */
function PokeBall({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="29" fill="#fbfaf2" />
      <path d="M3 32a29 29 0 0 1 58 0z" fill="#d83828" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="#283048" strokeWidth="4" />
      <path d="M3 32h58" stroke="#283048" strokeWidth="4" />
      <circle cx="32" cy="32" r="9" fill="#fbfaf2" stroke="#283048" strokeWidth="4" />
      <circle cx="32" cy="32" r="4" fill="none" stroke="#b4bede" strokeWidth="2" />
    </svg>
  );
}
