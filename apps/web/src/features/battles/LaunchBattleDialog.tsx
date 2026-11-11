import type { Trainer } from '@poke/content';
import { battleCooldownMinutes } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { HoverBubble, Modal, PokemonSprite } from '../../components/ui';
import { errorText, formatDuration, formatMoney, trainerName } from '../../lib/labels';
import {
  BadgeIcon,
  TrainerBackdrop,
  TrainerFacts,
  TrainerRules,
  TrainerSprite,
  formatTimeLimit,
} from './trainerParts';
import { CrossIcon, LAUNCH_DIALOG_CLASS, SheetSection, StatusPill } from '../common/dialogParts';
import { BANNER_LABEL } from '../common/zoneBanner';
import { CombatFoes, EnemyInfo } from '../common/CombatTeamOrder';
import { TeamPicker } from '../common/TeamPicker';
import { WeatherIcon } from '../common/WeatherIcon';
import { TeamSection } from '../common/TeamSection';
import { formatXp } from '../common/XpPreview';
import { ruleText, useLaunchBattle } from './launch/useLaunchBattle';
import type { LaunchBattleModel } from './launch/useLaunchBattle';

/** Fenêtre de départ d'un combat de dresseur : adversaires, équipe, récompenses, puis « Combattre ». */
export function LaunchBattleDialog(props: {
  ctx: GameContext;
  trainer: Trainer;
  onClose: () => void;
}) {
  const d = useLaunchBattle(props);
  return (
    <Modal open onClose={d.onClose} wide className={LAUNCH_DIALOG_CLASS}>
      <BattleBanner d={d} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
        <FoesSection d={d} />
        <TeamBlock d={d} />
        <RewardsSection d={d} />
      </div>
      <LaunchBar d={d} />
    </Modal>
  );
}

/** Bandeau : le dresseur sur le décor de sa zone, son nom, la météo du combat. */
function BattleBanner({ d }: { d: LaunchBattleModel }) {
  const { ctx, trainer, onClose, weather, placeWeather, forecast, weatherNote } = d;
  return (
    <header className="relative flex min-h-28 shrink-0 items-end gap-3 border-b-[3px] border-ink px-3 pt-3 pb-2 sm:px-4">
      <TrainerBackdrop ctx={ctx} trainer={trainer} />
      <span className="relative -mb-2 shrink-0">
        <TrainerSprite trainer={trainer} size={88} />
      </span>
      <div className="relative flex min-w-0 flex-1 flex-col items-start gap-1 pb-1">
        <span className="pixel-label max-w-full truncate rounded border-2 border-ink bg-win px-1.5 text-[8px] text-slate-600 dark:text-slate-300">
          {trainer.trainerClass}
        </span>
        <span className="flex max-w-full items-center gap-1.5">
          <h2 className={`min-w-0 truncate ${BANNER_LABEL}`}>{trainerName(trainer)}</h2>
          {(weather || placeWeather || forecast) && (
            <WeatherIcon
              weather={weather ?? 'clear'}
              activity="battle"
              note={weatherNote}
              forecast={forecast}
              className="rounded border-2 border-ink bg-win px-1 text-base leading-snug"
            />
          )}
        </span>
      </div>
      <button
        type="button"
        className="btn-ghost relative self-start px-2.5 py-2"
        aria-label="Fermer"
        onClick={onClose}
      >
        <CrossIcon />
      </button>
    </header>
  );
}

/** Pokémon du dresseur (fiche au survol), ses informations et ses conditions. */
function FoesSection({ d }: { d: LaunchBattleModel }) {
  const { ctx, trainer, enemies } = d;
  return (
    <SheetSection
      title="Adversaires"
      aside={
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {enemies.length} Pokémon · {formatTimeLimit(trainer.timeLimitSeconds)} pour gagner
        </span>
      }
    >
      <ul className="flex flex-wrap gap-x-1.5 gap-y-2.5 pb-1">
        {trainer.team.map((m, i) => (
          <li key={i}>
            <HoverBubble
              className="sprite-well relative size-14"
              width={232}
              height={420}
              content={enemies[i] && <EnemyInfo fighter={enemies[i]} />}
            >
              <PokemonSprite speciesId={m.speciesId} formId={m.formId} size={52} />
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded border-2 border-ink bg-win px-0.5 font-pixel text-[8px] leading-tight whitespace-nowrap">
                N.{m.level}
              </span>
            </HoverBubble>
          </li>
        ))}
      </ul>
      <TrainerFacts ctx={ctx} trainer={trainer} record={undefined} className="mt-3" />
      <TrainerRules rules={trainer.rules} className="mt-2" />
    </SheetSection>
  );
}

/** Équipe du joueur et fenêtre de son choix. */
function TeamBlock({ d }: { d: LaunchBattleModel }) {
  const {
    ctx,
    trainer,
    enemies,
    site,
    picker,
    moves,
    setMoves,
    maxTeamSize,
    members,
    errors,
    env,
    power,
    maxXp,
    targets,
  } = d;
  return (
    <section className="card p-3 [&>:first-child]:mt-0">
      <TeamSection
        ctx={ctx}
        title={`Équipe · ${trainerName(trainer)}`}
        env={env}
        members={members}
        xp={maxXp}
        maxTeamSize={maxTeamSize}
        power={power}
        minPower={trainer.rules.minPower}
        header={
          <>
            <TrainerRules rules={trainer.rules} />
            <CombatFoes
              ctx={ctx}
              foes={enemies.map((e) => ({
                speciesId: e.speciesId,
                formId: e.formId,
                level: e.level,
                types: e.types,
                info: <EnemyInfo fighter={e} />,
              }))}
            />
          </>
        }
        onAutoSelect={() => picker.autoSelect(maxTeamSize)}
      >
        {(close) => (
          <TeamPicker
            ctx={ctx}
            zone={site}
            picker={picker}
            power={power}
            maxTeamSize={maxTeamSize}
            statSort
            abilityEnv={env}
            errors={errors.map(ruleText)}
            onDone={close}
            combat={{ moves, setMoves, targets }}
            affinityHint={`Efficace contre un Pokémon de ${trainerName(trainer)}`}
          />
        )}
      </TeamSection>
    </section>
  );
}

/** Gains d'une victoire et rappel des règles d'XP et de K.O. */
function RewardsSection({ d }: { d: LaunchBattleModel }) {
  const { ctx, trainer, maxXp } = d;
  return (
    <SheetSection title="Récompenses">
      <div className="grid gap-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-1">
          <span className="font-semibold">Victoire :</span>{' '}
          {trainer.money > 0 ? formatMoney(trainer.money) : 'aucun argent'}
          {trainer.badge && (
            <span className="ml-1 inline-flex items-center gap-1">
              · <BadgeIcon badge={trainer.badge} size={18} /> {trainer.badge.name}
            </span>
          )}
        </p>
        <p>
          <span className="font-semibold">XP gagnée :</span> jusqu’à {formatXp(maxXp)} par Pokémon
          si toute son équipe est vaincue
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Chaque Pokémon adverse vaincu rapporte de l’XP à toute l’équipe, même en cas de défaite
          (pas en cas de fuite). Les Pokémon mis K.O. le restent jusqu’à leurs soins au Centre
          Pokémon.{' '}
          {trainer.repeatable
            ? `Après chaque combat, ${trainer.name} se repose pendant ${formatDuration(battleCooldownMinutes(ctx, trainer))}.`
            : `${trainer.name} ne se bat qu’une fois : en cas de défaite, tu peux le défier de nouveau aussitôt.`}
        </p>
      </div>
    </SheetSection>
  );
}

/** Barre de départ : état de l'équipe, puis Annuler / Combattre. */
function LaunchBar({ d }: { d: LaunchBattleModel }) {
  const { trainer, onClose, start, members, withMoves, errors, status } = d;
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
      {start.error && (
        <p className="order-first w-full text-sm font-medium text-red-600 dark:text-red-400">
          {errorText(start.error)}
        </p>
      )}
      <span className="min-w-0 flex-1" title={errors.map(ruleText).join('\n') || undefined}>
        <StatusPill tone={status.tone} text={status.text} />
        {members.length > 0 && errors.length > 1 && (
          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
            + {errors.length - 1} autre{errors.length > 2 ? 's' : ''}
          </span>
        )}
      </span>
      <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className="btn-primary px-6 py-3"
          disabled={errors.length > 0 || start.isPending}
          onClick={() =>
            start.mutate({
              trainerId: trainer.id,
              team: members.map((p) => p.id),
              moves: withMoves.map((m) => m.move),
            })
          }
        >
          Combattre
        </button>
      </div>
    </footer>
  );
}
