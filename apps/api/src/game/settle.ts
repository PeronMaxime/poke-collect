import type { Db } from '@poke/db';
import type { ContentCache } from '../content-cache';
import { settleFinishedBattle } from './battles';
import { settleClosedPlaces } from './closed-places';
import { settleFinishedDungeonRun } from './dungeons';
import { settleFinishedLegendaryBattle } from './legendary';
import { nextExpeditionThrow, settleExpeditionBalls } from './expeditions';

/** Au plus tard, un joueur est revérifié après ce délai (ce que rien ne date : places fermées…). */
const RECHECK_MS = 30_000;

/**
 * Ce que le rattrapage couvre : `balls` (les Balls des expéditions, avant toute requête de jeu) ou
 * `all` (en plus : combat ou donjon terminé, places fermées), pour les lectures et départs qui en
 * dépendent. Les routes qui réclament un combat ou un donjon ne rattrapent que les Balls : elles
 * rendent elles-mêmes le résultat au joueur.
 */
export type SettleScope = 'balls' | 'all';

/**
 * Rattrapage du temps écoulé pour un joueur : combat ou donjon terminé pendant son absence, places
 * de pension et du Musée fermées depuis, Balls des expéditions lancées depuis le dernier passage.
 *
 * Appelé souvent, mais sans toucher la base tant qu'il n'y a rien à faire : la prochaine échéance
 * de chaque joueur est gardée en mémoire (prochaine rencontre d'expédition, sinon un contrôle
 * toutes les 30 s). Un combat ou un donjon en cours est revérifié à chaque appel (sa fin dépend
 * d'une simulation). Les appels simultanés d'un même joueur partagent un seul rattrapage (le
 * chargement du jeu envoie une dizaine de requêtes d'un coup).
 */
export class PlayerSettler {
  private readonly nextCheck: Record<SettleScope, Map<string, number>> = {
    balls: new Map(),
    all: new Map(),
  };
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly db: Db,
    private readonly content: ContentCache,
    private readonly now: () => Date,
  ) {}

  /** À appeler quand une action crée de quoi rattraper (départ d'expédition, de combat…). */
  invalidate(userId: string): void {
    this.nextCheck.balls.delete(userId);
    this.nextCheck.all.delete(userId);
  }

  async settle(userId: string, scope: SettleScope = 'balls'): Promise<void> {
    const at = this.now().getTime();
    if (at < (this.nextCheck[scope].get(userId) ?? 0)) return;
    const key = `${scope}:${userId}`;
    const pending = this.running.get(key);
    if (pending) return pending;
    const run = this.run(userId, scope).finally(() => this.running.delete(key));
    this.running.set(key, run);
    return run;
  }

  private async run(userId: string, scope: SettleScope): Promise<void> {
    const { db, content } = this;
    const now = this.now();
    // Un échec laisse l'échéance en l'état : le prochain appel réessaie.
    for (const due of Object.values(this.nextCheck)) {
      due.delete(userId);
      if (due.size > 2000) {
        for (const [id, at] of due) if (at <= now.getTime()) due.delete(id);
      }
    }
    let busy = false;
    if (scope === 'all') {
      // Les rattrapages se suivent : ils peuvent réclamer les mêmes Pokémon.
      const dungeon = await settleFinishedDungeonRun(db, content, userId, now);
      const battle = await settleFinishedBattle(db, content, userId, now);
      const legendary = await settleFinishedLegendaryBattle(db, content, userId, now);
      busy = dungeon || battle || legendary;
      await settleClosedPlaces(db, content, userId, now);
    }
    await settleExpeditionBalls(db, content, userId, now);

    const recheck = now.getTime() + RECHECK_MS;
    const throwAt = await nextExpeditionThrow(db, userId);
    const balls = throwAt ? Math.min(recheck, throwAt.getTime()) : recheck;
    this.nextCheck.balls.set(userId, balls);
    if (scope === 'all') this.nextCheck.all.set(userId, busy ? 0 : balls);
  }
}
