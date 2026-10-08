import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trainer } from '@poke/content';
import {
  battleDurationMinutes,
  battleKoMinutes,
  checkBattleTeam,
  estimateBattle,
  pokemonPower,
} from '@poke/game-core';
import type { BattleError, GameContext } from '@poke/game-core';
import type { BattleDto, PokemonDto, StartBattleInput } from '@poke/shared';
import { Modal, PokemonSprite, ShinyStar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, isUsable, usePokemon } from '../../lib/game';
import { errorText, formatDuration, formatMoney, typeLabel } from '../../lib/labels';
import { TrainerSprite } from './BattlesPage';

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
    case 'LEVEL_TOO_HIGH':
      return `Niveau ${e.maxLevel} maximum.`;
    case 'FORBIDDEN_TYPES':
      return `Types interdits : ${e.types.map(typeLabel).join(', ')}.`;
    case 'MISSING_TYPES':
      return `Il manque : ${e.missing.map((m) => `${m.count} × ${typeLabel(m.type)}`).join(', ')}.`;
    case 'POWER_TOO_LOW':
      return `PE de l’équipe insuffisante pour lancer le combat (${e.power} / ${e.minPower}).`;
  }
}

function advantageText(advantage: number): { label: string; className: string } {
  if (advantage > 0.25) return { label: 'Avantage de types', className: 'text-emerald-600' };
  if (advantage < -0.25) return { label: 'Désavantage de types', className: 'text-red-600' };
  return { label: 'Types neutres', className: 'text-slate-500' };
}

/** Jauge de chances de victoire (rouge → vert). */
export function WinGauge({ probability }: { probability: number }) {
  const pct = Math.round(probability * 100);
  const color =
    probability >= 0.7 ? 'bg-emerald-500' : probability >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">Chances de victoire</span>
        <span className="font-mono text-lg font-bold">{pct} %</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
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
  const pokemon = usePokemon();
  const now = useNow(10_000);
  const [team, setTeam] = useState<string[]>([]);

  const start = useMutation({
    mutationFn: (input: StartBattleInput) =>
      api<BattleDto>('/api/battles', { method: 'POST', json: input }),
    onSuccess: () => {
      onClose();
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const available = (pokemon.data ?? [])
    .filter((p) => isUsable(p, now))
    .map((p) => ({ p, power: pokemonPower(ctx.species(p.speciesId, p.formId)!, p) }))
    .sort((a, b) => b.power - a.power);
  const members = team.flatMap((id) => available.find((a) => a.p.id === id)?.p ?? []);
  const maxSize = trainer.rules.teamSize ?? ctx.balance.battles.maxTeamSize;
  const errors = checkBattleTeam(ctx, trainer, members);
  const estimate = estimateBattle(ctx, trainer, members);
  const advantage = advantageText(estimate.advantage);
  const ko = battleKoMinutes(ctx, trainer);
  const duration = battleDurationMinutes(ctx, trainer);

  function toggle(p: PokemonDto) {
    setTeam((t) =>
      t.includes(p.id) ? t.filter((id) => id !== p.id) : t.length < maxSize ? [...t, p.id] : t,
    );
  }

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex items-center gap-3">
        <TrainerSprite trainer={trainer} size={80} />
        <div>
          <p className="text-sm text-slate-500">{trainer.trainerClass}</p>
          <h2 className="text-xl font-bold">{trainer.name}</h2>
          <p className="text-sm text-slate-500">
            PE {estimate.trainerPower} · {formatDuration(duration)} ·{' '}
            {trainer.money > 0 ? formatMoney(trainer.money) : 'Aucun argent'}
            {trainer.badge && ` · ${trainer.badge.name}`}
          </p>
        </div>
        <div className="ml-auto hidden gap-1 sm:flex">
          {trainer.team.map((m, i) => (
            <span key={i} className="flex flex-col items-center text-[10px] text-slate-500">
              <PokemonSprite speciesId={m.speciesId} formId={m.formId} size={48} />
              N.{m.level}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">
          Ton équipe ({team.length} / {maxSize})
        </h3>
        <span className="text-sm text-slate-500">PE {estimate.playerPower}</span>
      </div>
      <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
        {available.map(({ p, power }) => {
          const selected = team.includes(p.id);
          const species = ctx.species(p.speciesId, p.formId);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              className={`flex flex-col items-center rounded-xl border p-1 text-xs transition ${
                selected
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
              }`}
            >
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={56}
              />
              <span className="truncate">
                {species?.nameFr} {p.isShiny && <ShinyStar />}
              </span>
              <span className="text-slate-500">
                N.{p.level} · PE {power}
              </span>
            </button>
          );
        })}
        {available.length === 0 && (
          <p className="col-span-full text-sm text-slate-500">
            Tous tes Pokémon sont occupés ou K.O.
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-4 rounded-xl bg-slate-100 p-4 sm:grid-cols-[1fr_auto] dark:bg-slate-800/60">
        <WinGauge probability={estimate.winProbability} />
        <div className="text-sm sm:text-right">
          <p className={advantage.className}>{members.length > 0 ? advantage.label : '—'}</p>
          <p className="text-slate-500">
            PE effective {Math.round(estimate.effectivePower)} / {estimate.trainerPower}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Estimation calculée par le serveur au moment du combat. En cas de défaite, l’équipe est K.O.
        pendant {formatDuration(ko)} et ne gagne
        {ctx.balance.battles.lossXpFraction > 0
          ? ` que ${Math.round(ctx.balance.battles.lossXpFraction * 100)} % de l’XP`
          : ' aucune XP'}
        .
      </p>

      {team.length > 0 && errors.length > 0 && (
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
          onClick={() => start.mutate({ trainerId: trainer.id, team })}
        >
          Combattre ({formatDuration(duration)})
        </button>
      </div>
    </Modal>
  );
}
