import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trainer } from '@poke/content';
import { battleDurationMinutes, trainerPower, trainerStatus } from '@poke/game-core';
import type { GameContext, TrainerStatus } from '@poke/game-core';
import type { BattleDto, ClaimBattleResponse, PokemonDto } from '@poke/shared';
import { CancelButton, PokemonSprite, ProgressBar, TypeBadge, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  serverOffset,
  useBattles,
  usePlayerProgress,
  usePokemon,
} from '../../lib/game';
import {
  errorText,
  formatCountdown,
  formatDuration,
  formatMoney,
  itemIcon,
  itemName,
  unlockConditionText,
} from '../../lib/labels';
import { BattleReveal } from './BattleReveal';
import { LaunchBattleDialog } from './LaunchBattleDialog';

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
}: {
  badge: NonNullable<Trainer['badge']>;
  size?: number;
}) {
  return badge.image ? (
    <img src={badge.image} alt={badge.name} title={badge.name} width={size} height={size} />
  ) : (
    <span
      title={badge.name}
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-200 to-amber-500 text-amber-900 shadow-inner"
      style={{ width: size, height: size, fontSize: size / 2 }}
    >
      ★
    </span>
  );
}

export function BattlesPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const battles = useBattles();
  const pokemon = usePokemon();
  const progress = usePlayerProgress();
  const now = useNow();
  const [launch, setLaunch] = useState<Trainer | null>(null);
  const [reveal, setReveal] = useState<ClaimBattleResponse | null>(null);

  const claim = useMutation({
    mutationFn: (id: string) =>
      api<ClaimBattleResponse>(`/api/battles/${id}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      setReveal(data);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api<void>(`/api/battles/${id}/cancel`, { method: 'POST' }),
    onSuccess: () =>
      Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });

  const serverNow = now + serverOffset(battles.data, battles.dataUpdatedAt);
  const active = battles.data?.active ?? [];
  const slots = battles.data?.slots ?? 0;
  const freeSlots = slots - active.length;
  const records = new Map(battles.data?.records.map((r) => [r.trainerId, r]));
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Combats en cours</h2>
          <span className="text-sm text-slate-500">
            {active.length} / {slots} emplacements
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: slots }, (_, slot) => {
            const battle = active.find((b) => b.slotIndex === slot);
            return battle ? (
              <ActiveBattle
                key={battle.id}
                ctx={ctx}
                battle={battle}
                serverNow={serverNow}
                team={battle.team.map((id) => pokemonById.get(id))}
                claiming={claim.isPending && claim.variables === battle.id}
                onClaim={() => claim.mutate(battle.id)}
                cancelling={cancel.isPending && cancel.variables === battle.id}
                onCancel={() => cancel.mutate(battle.id)}
              />
            ) : (
              <div
                key={slot}
                className="grid min-h-32 place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700"
              >
                Emplacement libre — défie un dresseur ci-dessous.
              </div>
            );
          })}
        </div>
        {claim.error && <p className="mt-2 text-sm text-red-600">{errorText(claim.error)}</p>}
        {cancel.error && <p className="mt-2 text-sm text-red-600">{errorText(cancel.error)}</p>}
      </section>

      {ctx.regions.map((region) => {
        const trainers = ctx.trainers.filter((t) => t.regionId === region.id);
        if (trainers.length === 0) return null;
        return (
          <section key={region.id}>
            <h2 className="mb-3 text-lg font-semibold">Dresseurs de {region.name}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {trainers.map((trainer) => (
                <TrainerCard
                  key={trainer.id}
                  ctx={ctx}
                  trainer={trainer}
                  status={trainerStatus(ctx, trainer, progress, records.get(trainer.id), serverNow)}
                  record={records.get(trainer.id)}
                  fighting={active.some((b) => b.trainerId === trainer.id)}
                  serverNow={serverNow}
                  canLaunch={freeSlots > 0}
                  onLaunch={() => setLaunch(trainer)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {launch && <LaunchBattleDialog ctx={ctx} trainer={launch} onClose={() => setLaunch(null)} />}
      <BattleReveal ctx={ctx} data={reveal} onClose={() => setReveal(null)} />
    </div>
  );
}

function ActiveBattle({
  ctx,
  battle,
  serverNow,
  team,
  claiming,
  onClaim,
  cancelling,
  onCancel,
}: {
  ctx: GameContext;
  battle: BattleDto;
  serverNow: number;
  team: (PokemonDto | undefined)[];
  claiming: boolean;
  onClaim: () => void;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const start = Date.parse(battle.startedAt);
  const end = Date.parse(battle.endsAt);
  const done = serverNow >= end;
  const trainer = ctx.trainer(battle.trainerId);
  return (
    <div className={`card p-4 ${done ? 'ring-2 ring-brand-500/50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex -space-x-3">
          {team.map((p, i) =>
            p ? (
              <PokemonSprite
                key={i}
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={48}
              />
            ) : null,
          )}
        </div>
        <span className="text-xs font-bold text-slate-400">VS</span>
        <div className="flex items-center gap-2 text-right">
          <div>
            <p className="font-semibold">{trainer?.name ?? battle.trainerId}</p>
            <p className="text-xs text-slate-500">{trainer?.trainerClass}</p>
          </div>
          {trainer && <TrainerSprite trainer={trainer} size={48} />}
        </div>
      </div>
      <ProgressBar className="mt-3" value={(serverNow - start) / (end - start)} />
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-sm text-slate-500">
          {done ? 'Combat terminé !' : formatCountdown(end - serverNow)}
        </span>
        {done ? (
          <button className="btn-primary" disabled={claiming} onClick={onClaim}>
            {claiming ? 'Ouverture…' : 'Voir le résultat'}
          </button>
        ) : (
          <CancelButton label="Abandonner le combat" pending={cancelling} onConfirm={onCancel} />
        )}
      </div>
    </div>
  );
}

/** Un dresseur sans condition n'est verrouillé que par sa région. */
const unlockText = (ctx: GameContext, trainer: Trainer) =>
  unlockConditionText(ctx, trainer.unlock) ?? 'Région verrouillée';

function TrainerCard({
  ctx,
  trainer,
  status,
  record,
  fighting,
  serverNow,
  canLaunch,
  onLaunch,
}: {
  ctx: GameContext;
  trainer: Trainer;
  status: TrainerStatus;
  record: { wins: number; losses: number } | undefined;
  fighting: boolean;
  serverNow: number;
  canLaunch: boolean;
  onLaunch: () => void;
}) {
  const locked = status.state === 'locked';
  const zone = trainer.zoneId ? ctx.zone(trainer.zoneId) : undefined;
  const { rules } = trainer;
  return (
    <div className={`card flex flex-col p-4 ${locked ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <TrainerSprite trainer={trainer} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500">{trainer.trainerClass}</p>
              <h3 className="font-semibold">
                {trainer.name}{' '}
                {status.state === 'defeated' && <span className="text-emerald-600">✓</span>}
              </h3>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              PE {trainerPower(ctx, trainer)}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {zone ? `${zone.name} · ` : ''}
            {formatDuration(battleDurationMinutes(ctx, trainer))}
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
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {trainer.team.map((m, i) => (
          <span key={i} className="flex flex-col items-center text-[10px] text-slate-500">
            <PokemonSprite
              speciesId={m.speciesId}
              formId={m.formId}
              size={44}
              silhouette={locked}
              alt={locked ? '?' : ctx.species(m.speciesId, m.formId)?.nameFr}
            />
            N.{m.level}
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        {trainer.money > 0 && <span className="font-semibold">{formatMoney(trainer.money)}</span>}
        {trainer.badge && (
          <span className="flex items-center gap-1">
            <BadgeIcon badge={trainer.badge} size={18} /> {trainer.badge.name}
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

      {(rules.teamSize ||
        rules.maxLevel ||
        rules.minPower > 0 ||
        rules.requiredTypes.length > 0 ||
        rules.forbiddenTypes.length > 0) && (
        <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
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
      )}

      <div className="mt-auto pt-3">
        {status.state === 'locked' ? (
          <p className="text-center text-sm text-slate-500">🔒 {unlockText(ctx, trainer)}</p>
        ) : status.state === 'defeated' ? (
          <p className="text-center text-sm text-emerald-600">Déjà battu</p>
        ) : status.state === 'cooldown' ? (
          <p className="text-center text-sm text-slate-500">
            Au repos encore{' '}
            <span className="font-mono">{formatCountdown(status.until.getTime() - serverNow)}</span>
          </p>
        ) : fighting ? (
          <p className="text-center text-sm text-slate-500">Combat en cours…</p>
        ) : (
          <button className="btn-primary w-full" disabled={!canLaunch} onClick={onLaunch}>
            {canLaunch ? 'Défier' : 'Aucun emplacement de combat libre'}
          </button>
        )}
      </div>
    </div>
  );
}
