/**
 * Pièces d'une tuile de dresseur : portrait, badge, décor, météo, équipe, conditions, gains, bouton.
 */
import type { CSSProperties } from 'react';
import type { BattleRules, Trainer } from '@poke/content';
import type { GameContext, TrainerStatus } from '@poke/game-core';
import type { TrainerRecordDto } from '@poke/shared';
import { PokemonSprite, TypeBadge } from '../../components/ui';
import {
  TYPE_COLORS,
  formatCountdown,
  formatMoney,
  itemIcon,
  itemName,
  unlockConditionText,
} from '../../lib/labels';
import { StateTag } from '../buildings/BuildingParts';
import { ZoneWeatherIcon } from '../common/WeatherIcon';
import { CHECKER, TINTED_BANNER, zoneSpecies, zoneTint } from '../common/zoneBanner';

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

/** Ce que reçoit la tuile d'un dresseur. */
export interface TrainerCardProps {
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
export const unlockText = (ctx: GameContext, trainer: Trainer) =>
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
export function TrainerWeather({
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
export function TrainerTeam({
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
export function TrainerRewards({
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
export function TrainerAction({
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
