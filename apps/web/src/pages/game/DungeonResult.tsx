import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import type { DungeonOutcome, GameContext, TeamMemberResult } from '@poke/game-core';
import type { ItemStack } from '@poke/content';
import type { DungeonRunDto } from '@poke/shared';
import { Modal, PokemonSprite, ShinySparkles, ShinyStar } from '../../components/ui';
import { usePokemon } from '../../lib/game';
import { formatDuration, formatMoney, itemIcon, itemName, speciesName } from '../../lib/labels';

/** Issue d'un combat en temps réel (donjon ou dresseur). */
export const OUTCOME_TITLES = {
  win: { text: 'Victoire !', className: 'text-emerald-600' },
  loss: { text: 'Défaite…', className: 'text-red-600' },
  timeout: { text: 'Temps écoulé…', className: 'text-red-600' },
  fled: { text: 'Fuite', className: 'text-slate-500' },
} as const;

/** Résultat d'une tentative de donjon : issue, Méga-Gemme, argent, butin, XP et K.O. */
export function DungeonResult({
  ctx,
  run,
  currency,
  onClose,
}: {
  ctx: GameContext;
  run: DungeonRunDto | null;
  /** Poké Dollars après la tentative (inconnu pour une tentative réclamée en ton absence). */
  currency: number | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!run?.result} onClose={onClose} wide>
      {run?.result && <ResultContent ctx={ctx} run={run} currency={currency} onClose={onClose} />}
    </Modal>
  );
}

function ResultContent({
  ctx,
  run,
  currency,
  onClose,
}: {
  ctx: GameContext;
  run: DungeonRunDto;
  currency: number | null;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const result = run.result!;
  const dungeon = ctx.dungeon(run.dungeonId);
  const boss = run.setup.enemies.at(-1);
  const title = OUTCOME_TITLES[result.outcome];
  const win = result.outcome === 'win';
  const gemChance = dungeon ? Math.round(dungeon.gemChance * 100) : null;

  return (
    <div>
      <h2 className="text-xl font-bold">Donjon : {dungeon?.name ?? run.dungeonId}</h2>
      <div className="mt-3 flex items-center justify-center gap-4">
        {boss && (
          <PokemonSprite
            speciesId={boss.speciesId}
            formId={boss.formId}
            size={96}
            kind="artwork"
            className={win ? 'opacity-40 grayscale' : ''}
          />
        )}
        <div className="text-center">
          <motion.p
            className={`text-3xl font-black ${title.className}`}
            initial={reduced ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.3, 1], opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {title.text}
          </motion.p>
          <p className="text-sm text-slate-500">
            {result.defeated} / {run.setup.enemies.length} adversaires vaincus
          </p>
        </div>
      </div>

      {win && dungeon?.gemItemId && (
        <motion.div
          className={`relative mx-auto mt-4 flex max-w-sm items-center gap-3 rounded-2xl p-3 ${
            result.gemItemId
              ? 'bg-gradient-to-br from-amber-100 to-fuchsia-100 dark:from-amber-950 dark:to-fuchsia-950'
              : 'bg-slate-100 dark:bg-slate-800/60'
          }`}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <span className="relative grid h-14 w-14 shrink-0 place-items-center">
            <motion.img
              src={itemIcon(ctx, dungeon.gemItemId)}
              alt=""
              className={`h-12 w-12 [image-rendering:pixelated] ${result.gemItemId ? '' : 'opacity-40 grayscale'}`}
              initial={reduced || !result.gemItemId ? false : { scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.9, type: 'spring' }}
            />
            {result.gemItemId && <ShinySparkles delay={1.1} radius={40} />}
          </span>
          {result.gemItemId ? (
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {itemName(ctx, result.gemItemId)} obtenue ! Elle rejoint ton sac.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              {itemName(ctx, dungeon.gemItemId)} n’est pas tombée cette fois-ci
              {gemChance !== null && ` (${gemChance} % de chances)`}.
            </p>
          )}
        </motion.div>
      )}

      <CombatResultDetails ctx={ctx} result={result} currency={currency} />

      <div className="mt-6 text-right">
        <button className="btn-primary" onClick={onClose}>
          Continuer
        </button>
      </div>
    </div>
  );
}

/** Résultat d'un combat en temps réel, à afficher. */
export interface CombatResultView {
  outcome: DungeonOutcome;
  money: number;
  loot: ItemStack[];
  team: TeamMemberResult[];
  knockedOut: string[];
  koMinutes: number;
  koUntil: string | null;
}

/** Récompenses (argent, butin, `extraRewards`) et équipe : XP, niveaux, K.O. */
export function CombatResultDetails({
  ctx,
  result,
  currency,
  extraRewards,
}: {
  ctx: GameContext;
  result: CombatResultView;
  /** Poké Dollars après le combat (inconnu pour un combat réclamé en ton absence). */
  currency: number | null;
  /** Récompense en plus (badge…). */
  extraRewards?: ReactNode;
}) {
  const pokemon = usePokemon();
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const win = result.outcome === 'win';
  const knockedOut = new Set(result.knockedOut);
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold">Récompenses</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {result.money > 0 && <li className="text-lg font-bold">+{formatMoney(result.money)}</li>}
          {result.loot.map((l) => (
            <li key={l.itemId} className="flex items-center gap-2">
              <img src={itemIcon(ctx, l.itemId)} alt="" className="h-7 w-7" />
              {itemName(ctx, l.itemId)} <span className="font-semibold">× {l.quantity}</span>
            </li>
          ))}
          {extraRewards}
          {result.money === 0 && result.loot.length === 0 && !extraRewards && (
            <li className="text-slate-500">
              {result.outcome === 'fled'
                ? 'Aucune récompense : tu as pris la fuite.'
                : win
                  ? 'Rien d’autre cette fois-ci.'
                  : 'Aucune récompense, mais l’XP des adversaires vaincus est acquise.'}
            </li>
          )}
        </ul>
        {currency !== null && (
          <p className="mt-2 text-xs text-slate-500">Argent : {formatMoney(currency)}</p>
        )}
        {result.koUntil && (
          <p className="mt-2 text-xs text-red-600">
            Les Pokémon mis K.O. se reposent {formatDuration(result.koMinutes)}.
          </p>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Équipe</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {result.team.map((m) => {
            const p = pokemonById.get(m.id);
            return (
              p && (
                <li key={m.id} className="flex items-center gap-2">
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={p.formId}
                    shiny={p.isShiny}
                    size={32}
                  />
                  <span className="flex-1 truncate">
                    {speciesName(ctx, p.speciesId, p.formId)} {p.isShiny && <ShinyStar />}
                  </span>
                  <span className="text-slate-500">+{m.xpGained} XP</span>
                  {m.levelAfter > m.levelBefore && (
                    <span className="rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      Niveau {m.levelAfter} !
                    </span>
                  )}
                  {knockedOut.has(m.id) && (
                    <span className="rounded bg-red-100 px-1 text-[10px] text-red-700 dark:bg-red-950 dark:text-red-300">
                      K.O.
                    </span>
                  )}
                </li>
              )
            );
          })}
        </ul>
      </div>
    </div>
  );
}
