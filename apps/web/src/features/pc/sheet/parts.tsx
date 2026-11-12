/**
 * Petites pièces de la fiche d'un Pokémon du PC : classes, étiquette d'état, K.O. et soins.
 */
import { getNature, isHealing } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonActivity, PokemonDto } from '@poke/shared';
import { useNow } from '../../../components/ui';
import {
  centerState,
  useHeal,
  usePlayerProgress,
  usePokemon,
  useRevive,
  useReviveStacks,
} from '../../../lib/queries';
import { errorText, formatCountdown } from '../../../lib/labels';

/** Espèce (ou forme) d'un Pokémon, telle que la donne le contenu. */
export type SheetSpecies = NonNullable<ReturnType<GameContext['species']>>;

/** D'où vient un Pokémon, en clair. */
export const ORIGIN_LABELS: Record<PokemonDto['origin'], string> = {
  starter: 'Starter',
  capture: 'Capturé',
  egg: 'Éclos',
  quest: 'Récompense de quête',
  fossil: 'Fossile restauré',
  admin: 'Lot de test',
};

/** Taille fixe : l'en-tête et ses ‹ › restent au même endroit d'une fiche à l'autre. */
export const PC_SHEET_CLASS = 'flex h-[min(64rem,calc(100dvh-2rem))] flex-col overflow-hidden p-0';

/** Pastille du bandeau de la fiche (numéro, niveau, PE). */
export const HUD_PILL =
  'pixel-label shrink-0 rounded border-2 border-hud-line bg-hud-pill px-1.5 text-[9px]';

const SHEET_ACTIVITY_LABELS: Record<PokemonActivity, string> = {
  expedition: 'En expédition',
  battle: 'En combat',
  daycare: 'À la pension',
  dungeon: 'En donjon',
  assistant: 'Assistant',
};

const STATUS_TONES = {
  ok: 'border-emerald-700 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300',
  busy: 'border-sky-700 bg-sky-50 text-sky-800 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-300',
  heal: 'border-pink-600 bg-pink-50 text-pink-700 dark:border-pink-400 dark:bg-pink-950 dark:text-pink-300',
  bad: 'border-red-700 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300',
} as const;

/** État du Pokémon, dans le coin de l'illustration : disponible, occupé, K.O. ou en soins. */
export function StatusTag({ p }: { p: PokemonDto }) {
  const now = useNow();
  const [text, tone]: [string, keyof typeof STATUS_TONES] = p.knockedOut
    ? ['K.O.', 'bad']
    : isHealing(p.healUntil, now)
      ? [`Soins ${formatCountdown(Date.parse(p.healUntil!) - now)}`, 'heal']
      : p.activity
        ? [SHEET_ACTIVITY_LABELS[p.activity], 'busy']
        : ['Disponible', 'ok'];
  return (
    <span
      className={`pixel-label absolute top-2 right-2 rounded border-2 px-1.5 text-[8px] ${STATUS_TONES[tone]}`}
    >
      ● {text}
    </span>
  );
}
/** K.O. (avec l'envoi au Centre Pokémon s'il reste de la place) ou en soins. */
export function KoDetail({ ctx, p }: { ctx: GameContext; p: PokemonDto }) {
  const now = useNow();
  const pokemon = usePokemon();
  const heal = useHeal();
  const revive = useRevive();
  const [reviveStack] = useReviveStacks(ctx);
  const progress = usePlayerProgress();
  if (p.knockedOut) {
    const { free } = centerState(ctx, pokemon.data ?? [], now, progress);
    const pending = heal.isPending || revive.isPending;
    const error = heal.error ?? revive.error;
    return (
      <div className="rounded-lg border-[3px] border-red-600 bg-red-50 p-3 text-sm dark:border-red-400 dark:bg-red-950/40">
        <p className="font-semibold text-red-700 dark:text-red-300">
          K.O. : à soigner au Centre Pokémon.
        </p>
        {(free > 0 || reviveStack) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {free > 0 && (
              <button
                className="btn-primary flex-1"
                disabled={pending}
                onClick={() => heal.mutate([p.id])}
              >
                Envoyer au Centre
              </button>
            )}
            {reviveStack && (
              <button
                className="btn-ghost flex-1"
                disabled={pending}
                onClick={() => revive.mutate({ itemId: reviveStack.itemId, pokemonIds: [p.id] })}
              >
                Rappel ({reviveStack.quantity})
              </button>
            )}
          </div>
        )}
        {free === 0 && (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Le Centre Pokémon est plein pour l’instant.
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{errorText(error)}</p>}
      </div>
    );
  }
  if (!isHealing(p.healUntil, now)) return null;
  return (
    <p className="rounded-lg border-[3px] border-pink-500 bg-pink-50 p-3 text-sm font-semibold text-pink-700 dark:border-pink-400 dark:bg-pink-950/40 dark:text-pink-300">
      En soins au Centre Pokémon encore {formatCountdown(Date.parse(p.healUntil!) - now)}
    </p>
  );
}
/** Nombre écrit à la française (espaces entre les milliers). */
export const formatNumber = (n: number) => n.toLocaleString('fr-FR');

/** Stat que la nature augmente et celle qu'elle baisse ; aucune pour une nature neutre. */
export function natureShift(natureId: string) {
  const nature = getNature(natureId);
  const natureUp =
    nature?.increasedStat && nature.increasedStat !== nature.decreasedStat
      ? nature.increasedStat
      : undefined;
  const natureDown = natureUp ? nature?.decreasedStat : undefined;
  return { natureUp, natureDown };
}
