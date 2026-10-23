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
  trainerPower,
  zoneWeather,
} from '@poke/game-core';
import type { BattleError, DungeonMove, ExpeditionSite, GameContext } from '@poke/game-core';
import type { BattleDto, StartBattleInput } from '@poke/shared';
import { HoverBubble, Modal, PokemonSprite, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, utcOffsetMinutes } from '../../lib/game';
import { errorText, formatDuration, formatMoney, typeLabel } from '../../lib/labels';
import { BadgeIcon, TrainerRules, TrainerSprite, formatTimeLimit } from './BattlesPage';
import { CombatTeamOrder, EnemyInfo, combatMove } from './CombatTeamOrder';
import { TeamPicker, useTeamPicker } from './TeamPicker';
import { TEAM_WEATHER_NOTE, WeatherIcon, zoneWeatherForecast } from './WeatherIcon';
import { XpPreview, formatXp, usePlayerBonuses } from './XpPreview';

function ruleText(e: BattleError): string {
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
    durationsMinutes: [],
  };
  const picker = useTeamPicker(ctx, site);
  const [moves, setMoves] = useState<Record<string, DungeonMove>>({});
  const maxTeamSize = trainer.rules.teamSize ?? ctx.balance.battles.maxTeamSize;
  const bonuses = usePlayerBonuses(ctx);

  const start = useMutation({
    mutationFn: (input: StartBattleInput) =>
      api<BattleDto>('/api/battles', {
        method: 'POST',
        json: { ...input, utcOffsetMinutes: utcOffsetMinutes() },
      }),
    onSuccess: () => {
      onClose();
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
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

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-3">
        <TrainerSprite trainer={trainer} size={88} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500">{trainer.trainerClass}</p>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            {trainer.name}
            {(weather || placeWeather || forecast) && (
              <WeatherIcon
                weather={weather ?? 'clear'}
                activity="battle"
                note={weatherNote}
                forecast={forecast}
              />
            )}
          </h2>
          <p className="text-sm text-slate-500">
            {zone ? `${zone.name} · ` : ''}
            {enemies.length} Pokémon · PE {trainerPower(ctx, trainer)} ·{' '}
            {formatTimeLimit(trainer.timeLimitSeconds)} pour gagner
          </p>
          <TrainerRules rules={trainer.rules} className="mt-1" />
        </div>
        <div className="flex gap-0.5">
          {trainer.team.map((m, i) => (
            <HoverBubble
              key={i}
              className="flex flex-col items-center text-[10px] text-slate-500"
              width={232}
              height={420}
              content={enemies[i] && <EnemyInfo fighter={enemies[i]} />}
            >
              <PokemonSprite speciesId={m.speciesId} formId={m.formId} size={44} />
              N.{m.level}
            </HoverBubble>
          ))}
        </div>
      </div>

      <TeamPicker
        ctx={ctx}
        zone={site}
        picker={picker}
        power={power}
        maxTeamSize={maxTeamSize}
        statSort
        abilityEnv={env}
      />
      <p className="mt-1 text-xs text-slate-500">
        Encadrés en vert : un de leurs types est efficace contre un Pokémon du dresseur.
      </p>

      {members.length > 0 && (
        <CombatTeamOrder
          ctx={ctx}
          members={members}
          moves={moves}
          setMoves={setMoves}
          setTeam={picker.setTeam}
          targets={targets}
        />
      )}

      <div className="mt-5 grid gap-1 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800/60">
        <p className="flex flex-wrap items-center gap-x-1">
          <span className="font-semibold">Victoire :</span>{' '}
          {trainer.money > 0 ? formatMoney(trainer.money) : 'aucun argent'}
          {trainer.badge && (
            <span className="ml-1 inline-flex items-center gap-1">
              · <BadgeIcon badge={trainer.badge} size={18} /> {trainer.badge.name}
            </span>
          )}
        </p>
        <XpPreview ctx={ctx} members={members} xp={maxXp}>
          jusqu’à {formatXp(maxXp)} par Pokémon si toute son équipe est vaincue
        </XpPreview>
        <p className="mt-2 text-xs text-slate-500">
          Chaque Pokémon adverse vaincu rapporte de l’XP à toute l’équipe, même en cas de défaite
          (pas en cas de fuite). Les Pokémon mis K.O. le restent jusqu’à leurs soins au Centre
          Pokémon.{' '}
          {trainer.repeatable
            ? `Après chaque combat, ${trainer.name} se repose pendant ${formatDuration(battleCooldownMinutes(ctx, trainer))}.`
            : `${trainer.name} ne se bat qu’une fois : en cas de défaite, tu peux le défier de nouveau aussitôt.`}
        </p>
      </div>

      {members.length > 0 && errors.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-red-600">
          {errors.map((e) => (
            <li key={e.code}>{ruleText(e)}</li>
          ))}
        </ul>
      )}
      {start.error && <p className="mt-4 text-sm text-red-600">{errorText(start.error)}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
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
    </Modal>
  );
}
