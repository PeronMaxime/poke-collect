import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trainer } from '@poke/content';
import { typeWeaknesses } from '@poke/data';
import {
  battleCooldownMinutes,
  battleEnv,
  battleMaxXp,
  battleWeather,
  checkBattleTeam,
  imposedWeather,
  pokemonPower,
  trainerEnemies,
  zoneWeather,
} from '@poke/game-core';
import type { BattleError, DungeonMove, ExpeditionSite, GameContext } from '@poke/game-core';
import type { StartBattleInput } from '@poke/shared';
import { HoverBubble, Modal, PokemonSprite, useNow } from '../../components/ui';
import { keys, refresh, startBattle } from '../../lib/queries';
import { errorText, formatDuration, formatMoney, trainerName, typeLabel } from '../../lib/labels';
import {
  BadgeIcon,
  TrainerBackdrop,
  TrainerFacts,
  TrainerRules,
  TrainerSprite,
  formatTimeLimit,
} from './BattlesPage';
import { CrossIcon, LAUNCH_DIALOG_CLASS, SheetSection, StatusPill } from './dialogParts';
import type { StatusTone } from './dialogParts';
import { BANNER_LABEL } from './zoneBanner';
import { CombatFoes, EnemyInfo, combatMove } from './CombatTeamOrder';
import { TeamPicker, useTeamPicker } from './TeamPicker';
import { TEAM_WEATHER_NOTE, WeatherIcon, zoneWeatherForecast } from './WeatherIcon';
import { TeamSection } from './TeamSection';
import { formatXp, usePlayerBonuses } from './XpPreview';

export function ruleText(e: BattleError): string {
  switch (e.code) {
    case 'TEAM_EMPTY':
      return 'Choisis au moins un Pokémon.';
    case 'TEAM_TOO_LARGE':
      return `Au plus ${e.max} Pokémon.`;
    case 'TEAM_SIZE':
      return `Ce dresseur exige exactement ${e.required} Pokémon.`;
    case 'DUPLICATE_MEMBER':
      return 'Un Pokémon est sélectionné deux fois.';
    case 'TOO_MANY_MEGAS':
      return 'Un seul Pokémon Méga-Évolué par équipe.';
    case 'WRONG_REGION':
      return 'Seuls les Pokémon du Pokédex de la région peuvent affronter ce dresseur.';
    case 'LEVEL_TOO_HIGH':
      return `Niveau ${e.maxLevel} maximum.`;
    case 'FORBIDDEN_TYPES':
      return `Types interdits : ${e.types.map(typeLabel).join(', ')}.`;
    case 'MISSING_TYPES':
      return `Il manque : ${e.missing.map((m) => `${m.count} × ${typeLabel(m.type)}`).join(', ')}.`;
    case 'POWER_TOO_LOW':
      return `PE de l’équipe insuffisante pour lancer le combat (${e.power} / ${e.minPower}).`;
    case 'INVALID_MOVE':
      return 'Une attaque choisie n’est pas d’un type du Pokémon.';
  }
}

export function LaunchBattleDialog({
  ctx,
  trainer,
  onClose,
}: {
  ctx: GameContext;
  trainer: Trainer;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const enemies = trainerEnemies(ctx, trainer);
  // Les Pokémon dont un type est efficace contre un Pokémon du dresseur sont mis en évidence.
  const site: ExpeditionSite = {
    regionId: trainer.regionId,
    minPower: trainer.rules.minPower,
    requiredTypes: trainer.rules.requiredTypes,
    affinityTypes: [...new Set(enemies.flatMap((e) => typeWeaknesses(e.types)))],
  };
  const picker = useTeamPicker(ctx, site, undefined, {
    forbiddenTypes: trainer.rules.forbiddenTypes,
    maxLevel: trainer.rules.maxLevel,
  });
  const [moves, setMoves] = useState<Record<string, DungeonMove>>({});
  const maxTeamSize = trainer.rules.teamSize ?? ctx.balance.battles.maxTeamSize;
  const bonuses = usePlayerBonuses(ctx);

  const start = useMutation({
    mutationFn: (input: StartBattleInput) => startBattle(input),
    onSuccess: () => {
      onClose();
      return refresh(queryClient, keys.battles, keys.pokemon);
    },
  });

  const members = picker.members;
  // Talents, météo et conditions : évalués à l'instant présent (celui du départ).
  const now = useNow(10_000);
  const hour = new Date(now).getHours();
  const withMoves = members.map((p) => ({ ...p, move: combatMove(ctx, p, moves) }));
  const errors = checkBattleTeam(ctx, trainer, withMoves, hour, now);
  const env = battleEnv(ctx, trainer, members, hour, now);
  const power = members.reduce(
    (sum, p) => sum + pokemonPower(ctx.species(p.speciesId, p.formId)!, p),
    0,
  );
  const maxXp = battleMaxXp(ctx, trainer, bonuses, members, hour);
  const zone = trainer.zoneId ? ctx.zone(trainer.zoneId) : undefined;
  const weather = battleWeather(ctx, trainer, members, hour, now);
  const placeWeather = zone ? zoneWeather(zone, now) : null;
  const forecast = zone && zoneWeatherForecast(zone, now);
  const weatherNote = imposedWeather(ctx, { activity: 'battle', team: members })
    ? TEAM_WEATHER_NOTE
    : weather !== placeWeather
      ? 'Imposée par le talent d’un adversaire.'
      : undefined;
  const targets = enemies.map((e) => ({
    name: ctx.species(e.speciesId, e.formId)?.nameFr ?? `#${e.speciesId}`,
    types: e.types,
  }));

  const status: { tone: StatusTone; text: string } =
    members.length === 0
      ? { tone: 'idle', text: 'Aucun Pokémon choisi' }
      : errors.length > 0
        ? { tone: 'bad', text: ruleText(errors[0]!) }
        : { tone: 'ok', text: 'Équipe prête' };

  return (
    <Modal open onClose={onClose} wide className={LAUNCH_DIALOG_CLASS}>
      {/* Bandeau : le dresseur sur le décor de sa zone, son nom, la météo du combat. */}
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
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
              <span className="font-semibold">XP gagnée :</span> jusqu’à {formatXp(maxXp)} par
              Pokémon si toute son équipe est vaincue
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Chaque Pokémon adverse vaincu rapporte de l’XP à toute l’équipe, même en cas de
              défaite (pas en cas de fuite). Les Pokémon mis K.O. le restent jusqu’à leurs soins au
              Centre Pokémon.{' '}
              {trainer.repeatable
                ? `Après chaque combat, ${trainer.name} se repose pendant ${formatDuration(battleCooldownMinutes(ctx, trainer))}.`
                : `${trainer.name} ne se bat qu’une fois : en cas de défaite, tu peux le défier de nouveau aussitôt.`}
            </p>
          </div>
        </SheetSection>
      </div>

      {/* Barre de départ : état de l'équipe, puis Annuler / Combattre. */}
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
    </Modal>
  );
}
