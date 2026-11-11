/**
 * Dresseurs d'une région à montrer dans l'onglet des combats, et leur rang dans la Ligue.
 */
import type { Trainer } from '@poke/content';
import { isTrainerRevealed } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { TrainerRecordDto } from '@poke/shared';

/** Dresseurs mis en avant : Champion d'arène (il donne un badge), Conseil 4, Maître de la Ligue. */
export type LeagueRank = 'gym' | 'elite' | 'master';

/** Le Conseil 4 et le Maître sont reconnus à leur classe (« Conseil 4 », « Maître de la Ligue »). */
export function leagueRank(trainer: Trainer): LeagueRank | null {
  if (/^conseil\b/i.test(trainer.trainerClass)) return 'elite';
  if (/^ma[iî]tre(sse)? de la ligue/i.test(trainer.trainerClass)) return 'master';
  return trainer.badge ? 'gym' : null;
}

/**
 * Dresseurs d'une région : ceux de l'histoire (`trainers`), dont seuls sont montrés (`shown`) ceux
 * qui précèdent le prochain Champion, membre du Conseil 4 ou Maître pas encore battu, celui-ci
 * compris ; les dresseurs de quêtes, à part, une fois leur étape atteinte.
 */
export function trainerLists(
  ctx: GameContext,
  regionId: string,
  progress: Parameters<typeof isTrainerRevealed>[2],
  records: ReadonlyMap<string, TrainerRecordDto>,
) {
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
  const gyms = trainers.filter((t) => leagueRank(t) === 'gym' && t.badge);
  return { trainers, questTrainers, elites, shown, hiddenCount, gyms };
}
