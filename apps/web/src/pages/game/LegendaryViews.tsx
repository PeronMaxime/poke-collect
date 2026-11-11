import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import type { Quest, QuestPokemon } from '@poke/content';
import { typeWeaknesses } from '@poke/data';
import {
  chainMultiplier,
  checkLegendaryTeam,
  legendaryBattleLevel,
  legendaryBoss,
  legendaryEnv,
  legendaryMaxXp,
  pokemonPower,
} from '@poke/game-core';
import type { DungeonMove, ExpeditionSite, GameContext } from '@poke/game-core';
import type { LegendaryBattleDto, StartLegendaryBattleInput } from '@poke/shared';
import { HoverBubble, Modal, PokemonSprite, ShinySparkles, ShinyStar } from '../../components/ui';
import {
  captureLegendary,
  keys,
  refresh,
  startLegendaryBattle,
  useInventory,
} from '../../lib/queries';
import {
  errorText,
  formatDuration,
  formatMultiplier,
  itemIcon,
  itemName,
  speciesName,
} from '../../lib/labels';
import { formatTimeLimit } from './BattlesPage';
import { CombatFoes, EnemyInfo, combatMove } from './CombatTeamOrder';
import { ruleText } from './LaunchBattleDialog';
import { TeamPicker, useTeamPicker } from './TeamPicker';
import { TeamSection } from './TeamSection';
import { formatXp, usePlayerBonuses } from './XpPreview';

/**
 * Combats légendaires : lancement depuis une quête réclamée, puis capture du légendaire vaincu
 * (une seule Ball, chance fixe, Master Ball assurée).
 */

/** Chance de capture d'une Ball ordinaire, en pourcentage lisible. */
export const formatCaptureChance = (target: QuestPokemon) =>
  `${target.battle.captureChance.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

export function LaunchLegendaryDialog({
  ctx,
  quest,
  target,
  attempts,
  onClose,
}: {
  ctx: GameContext;
  quest: Quest;
  target: QuestPokemon;
  /** Combats déjà livrés contre ce légendaire (chaîne chromatique). */
  attempts: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const boss = legendaryBoss(ctx, target);
  const { battle } = target;
  const site: ExpeditionSite = {
    regionId: quest.regionId,
    minPower: battle.minPower,
    requiredTypes: battle.requiredTypes,
    affinityTypes: boss ? typeWeaknesses(boss.types) : [],
  };
  const picker = useTeamPicker(ctx, site);
  const [moves, setMoves] = useState<Record<string, DungeonMove>>({});
  const maxTeamSize = ctx.balance.battles.maxTeamSize;
  const bonuses = usePlayerBonuses(ctx);

  const start = useMutation({
    mutationFn: (input: StartLegendaryBattleInput) => startLegendaryBattle(quest.id, input),
    onSuccess: () => {
      onClose();
      return refresh(queryClient, keys.legendaryBattles, keys.pokemon);
    },
  });

  const members = picker.members;
  const hour = new Date().getHours();
  const withMoves = members.map((p) => ({ ...p, move: combatMove(ctx, p, moves) }));
  const errors = checkLegendaryTeam(ctx, quest, target, withMoves, hour);
  const env = legendaryEnv(ctx, target, members, hour);
  const power = members.reduce(
    (sum, p) => sum + pokemonPower(ctx.species(p.speciesId, p.formId)!, p),
    0,
  );
  const maxXp = legendaryMaxXp(ctx, target, bonuses, members, hour);
  const name = speciesName(ctx, target.speciesId, target.formId);
  const level = legendaryBattleLevel(target);

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-3">
        <HoverBubble
          width={232}
          height={420}
          content={boss && <EnemyInfo fighter={boss} />}
          className="grid size-24 shrink-0 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800"
        >
          <PokemonSprite
            speciesId={target.speciesId}
            formId={target.formId}
            kind="artwork"
            size={88}
          />
        </HoverBubble>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-amber-600">✦ Combat légendaire · {quest.name}</p>
          <h2 className="text-xl font-bold">
            {name} N.{level}
          </h2>
          <p className="text-sm text-slate-500">
            Seul contre ton équipe · PV ×{battle.hpMultiplier} ·{' '}
            {formatTimeLimit(battle.timeLimitSeconds)} pour le vaincre
          </p>
          {battle.enragePercent > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Sous {Math.round(battle.enrageHpFraction * 100)} % de ses PV, il se déchaîne : +
              {battle.enragePercent} % à ses statistiques.
            </p>
          )}
        </div>
      </div>

      <TeamSection
        ctx={ctx}
        title={`Équipe · ${name}`}
        env={env}
        members={members}
        xp={maxXp}
        maxTeamSize={maxTeamSize}
        power={power}
        minPower={battle.minPower}
        header={
          boss && (
            <CombatFoes
              ctx={ctx}
              foes={[
                {
                  speciesId: target.speciesId,
                  formId: target.formId,
                  level,
                  types: boss.types,
                  info: <EnemyInfo fighter={boss} />,
                },
              ]}
            />
          )
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
            combat={{ moves, setMoves, targets: boss ? [{ name, types: boss.types }] : [] }}
            affinityHint={`Efficace contre ${name}`}
          />
        )}
      </TeamSection>

      <div className="mt-5 grid gap-1 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800/60">
        <p>
          <span className="font-semibold">Victoire :</span> {formatXp(maxXp)} par Pokémon, puis une
          seule Ball : {formatCaptureChance(target)} de chances de le capturer (100 % avec une
          Master Ball).
        </p>
        <p>
          <span className="font-semibold">Chromatique :</span>{' '}
          {attempts > 0
            ? `chaîne ${attempts} (${formatMultiplier(chainMultiplier(ctx, attempts))})`
            : 'chaque combat livré allonge la chaîne'}
          , décidé dès l’entrée en combat.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Défaite, fuite ou Ball ratée : tu pourras le défier de nouveau dans{' '}
          {formatDuration(ctx.balance.legendary.retryCooldownMinutes)}. Les Pokémon mis K.O. le
          restent jusqu’à leurs soins au Centre Pokémon. Une fois capturé, il arrive au niveau{' '}
          {target.level} avec {target.perfectIvs} IV parfaits.
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
              team: members.map((p) => p.id),
              moves: withMoves.map((m) => m.move),
            })
          }
        >
          Affronter {name}
        </button>
      </div>
    </Modal>
  );
}

/** Durée de l'animation de la Ball (secousses) avant d'annoncer l'issue. */
const THROW_MS = 2400;

/**
 * Légendaire vaincu : le joueur choisit sa Ball (une seule). La chance ne dépend pas de la Ball,
 * sauf la Master Ball (capture assurée). Animation de la Ball, puis capture ou fuite.
 */
export function LegendaryCaptureDialog({
  ctx,
  battleId,
  target,
  isShiny,
  onClose,
}: {
  ctx: GameContext;
  battleId: string;
  target: QuestPokemon;
  isShiny: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const inventory = useInventory();
  const owned = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
  // La Ball ne change rien (hors Master Ball) : la moins précieuse d'abord, Master Ball en dernier.
  const balls = ctx.content.items
    .filter((i) => ctx.itemEffect(i.id, 'ball') && (owned.get(i.id) ?? 0) > 0)
    .sort((a, b) => {
      const ea = ctx.itemEffect(a.id, 'ball')!;
      const eb = ctx.itemEffect(b.id, 'ball')!;
      return (
        Number(!!ea.guaranteed) - Number(!!eb.guaranteed) || ea.catchMultiplier - eb.catchMultiplier
      );
    });
  const [ballId, setBallId] = useState<string | undefined>(undefined);
  const selected = ballId ?? balls[0]?.id ?? null;
  const guaranteed = selected ? !!ctx.itemEffect(selected, 'ball')?.guaranteed : false;
  // Issue affichée une fois l'animation de la Ball terminée.
  const [thrownAt, setThrownAt] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const capture = useMutation({
    mutationFn: (ballItemId: string) => captureLegendary(battleId, ballItemId),
    onSuccess: () =>
      refresh(
        queryClient,
        keys.legendaryBattles,
        keys.quests,
        keys.pokemon,
        keys.inventory,
        keys.pokedex,
      ),
    onError: () => setThrownAt(null),
  });
  useEffect(() => {
    if (thrownAt === null || !capture.isSuccess) return;
    const left = reduced ? 0 : Math.max(0, THROW_MS - (Date.now() - thrownAt));
    const timer = window.setTimeout(() => setRevealed(true), left);
    return () => window.clearTimeout(timer);
  }, [thrownAt, capture.isSuccess, reduced]);

  const name = speciesName(ctx, target.speciesId, target.formId);
  const caught = capture.data?.pokemon ?? null;
  const throwing = thrownAt !== null && !revealed;

  return (
    <Modal open onClose={throwing ? () => {} : onClose}>
      <div className="flex flex-col items-center text-center">
        <p className="text-xs font-medium text-amber-600">✦ Légendaire vaincu</p>
        <h2 className="text-xl font-bold">
          {revealed
            ? caught
              ? `${name} est capturé !`
              : `${name} s’est enfui…`
            : `${name} est à terre !`}
        </h2>

        <div className="relative mt-3 grid h-44 w-44 place-items-center">
          {thrownAt === null || (revealed && !caught) ? (
            <motion.div
              initial={reduced ? false : { opacity: 0, scale: 0.6 }}
              animate={revealed ? { opacity: 0, x: 120 } : { opacity: 1, scale: 1 }}
              transition={{ duration: revealed ? 0.8 : 0.4 }}
              className="relative"
            >
              {isShiny && <ShinySparkles loop radius={90} />}
              <PokemonSprite
                speciesId={target.speciesId}
                formId={target.formId}
                shiny={isShiny}
                kind="artwork"
                size={160}
              />
            </motion.div>
          ) : (
            <motion.img
              src={selected ? itemIcon(ctx, selected) : ''}
              alt=""
              className="h-16 w-16 [image-rendering:pixelated]"
              initial={reduced ? false : { y: -120, scale: 0.6 }}
              animate={
                revealed
                  ? { y: 0, scale: [1, 1.3, 1], rotate: 0 }
                  : { y: 0, scale: 1, rotate: [0, -25, 25, -25, 25, 0, 0, -25, 25, 0] }
              }
              transition={
                revealed
                  ? { duration: 0.5 }
                  : { y: { duration: 0.5 }, rotate: { delay: 0.6, duration: 1.8 } }
              }
            />
          )}
          {revealed && caught && (
            <motion.div
              className="absolute inset-0 grid place-items-center"
              initial={reduced ? false : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring' }}
            >
              {caught.isShiny && <ShinySparkles loop radius={90} />}
              <PokemonSprite
                speciesId={caught.speciesId}
                formId={caught.formId}
                shiny={caught.isShiny}
                kind="artwork"
                size={160}
              />
            </motion.div>
          )}
        </div>

        {isShiny && !revealed && (
          <p className="mt-1 rounded-xl bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 px-3 py-1 font-bold text-amber-900 dark:from-amber-900 dark:via-amber-800 dark:to-amber-900 dark:text-amber-100">
            ✨ Il est chromatique ! ✨
          </p>
        )}

        {revealed ? (
          caught ? (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              {name} {caught.isShiny && <ShinyStar />} N.{caught.level} rejoint ton PC, avec{' '}
              {Object.values(caught.ivs).filter((iv) => iv === 31).length} IV parfaits.
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              La Ball n’a pas tenu. Tu pourras de nouveau le défier dans{' '}
              {formatDuration(ctx.balance.legendary.retryCooldownMinutes)}.
            </p>
          )
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Une seule Ball : <strong>{guaranteed ? '100 %' : formatCaptureChance(target)}</strong>{' '}
              de chances de le capturer. En cas d’échec, il s’enfuit.
            </p>
            {balls.length > 0 ? (
              <select
                className="input mt-3 max-w-xs"
                value={selected ?? ''}
                disabled={thrownAt !== null}
                onChange={(e) => setBallId(e.target.value)}
              >
                {balls.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (× {owned.get(b.id)})
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-3 text-sm text-red-600">
                Tu n’as aucune Ball : achètes-en à la boutique, il t’attendra.
              </p>
            )}
          </>
        )}
        {capture.error && <p className="mt-3 text-sm text-red-600">{errorText(capture.error)}</p>}

        <div className="mt-6 flex justify-center gap-2">
          {revealed ? (
            <button className="btn-primary" onClick={onClose}>
              Continuer
            </button>
          ) : (
            <>
              <button className="btn-ghost" disabled={throwing} onClick={onClose}>
                Plus tard
              </button>
              <button
                className="btn-primary flex items-center gap-2"
                disabled={!selected || thrownAt !== null}
                onClick={() => {
                  if (!selected) return;
                  setThrownAt(Date.now());
                  capture.mutate(selected);
                }}
              >
                {selected && <img src={itemIcon(ctx, selected)} alt="" className="-my-2 h-7" />}
                Lancer {selected ? `la ${itemName(ctx, selected)}` : 'une Ball'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Combat légendaire perdu ou fui : rien à capturer, nouveau délai. */
export function LegendaryDefeatDialog({
  ctx,
  battle,
  onClose,
}: {
  ctx: GameContext;
  battle: LegendaryBattleDto | null;
  onClose: () => void;
}) {
  const target = battle && ctx.quest(battle.questId)?.rewards.pokemon[battle.pokemonIndex];
  const name = target ? speciesName(ctx, target.speciesId, target.formId) : 'Le légendaire';
  return (
    <Modal open={!!battle} onClose={onClose}>
      {battle && (
        <div className="text-center">
          <h2 className="text-xl font-bold">
            {battle.outcome === 'fled' ? 'Tu as pris la fuite' : `${name} est trop fort…`}
          </h2>
          {target && (
            <div className="mt-3 flex justify-center">
              <PokemonSprite
                speciesId={target.speciesId}
                formId={target.formId}
                shiny={battle.isShiny}
                kind="artwork"
                size={120}
              />
            </div>
          )}
          <p className="mt-3 text-sm text-slate-500">
            {battle.outcome === 'timeout' && 'Le temps est écoulé. '}
            Soigne ton équipe et prépare-la mieux : tu pourras le défier de nouveau dans{' '}
            {formatDuration(ctx.balance.legendary.retryCooldownMinutes)}.
          </p>
          <button className="btn-primary mt-6" onClick={onClose}>
            Continuer
          </button>
        </div>
      )}
    </Modal>
  );
}
