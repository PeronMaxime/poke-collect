import { getPublishedVersion, loadContent } from '@poke/db';
import type { Db } from '@poke/db';
import { createGameContext } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';

/**
 * Contenu gardé en mémoire. La version publiée est invalidée à chaque publication ;
 * les versions déjà publiées ne changent plus, on peut donc les garder (expéditions en cours).
 */
export class ContentCache {
  private published: Promise<GameContext> | null = null;
  private readonly versions = new Map<number, Promise<GameContext>>();

  constructor(private readonly db: Db) {}

  /** Contenu publié (celui que voient les joueurs). */
  get(): Promise<GameContext> {
    if (!this.published) {
      this.published = getPublishedVersion(this.db).then((v) => {
        if (!v) throw new Error('Aucune version de contenu publiée');
        return this.version(v.id);
      });
      // En cas d'échec, on réessaiera au prochain appel.
      this.published.catch(() => {
        this.published = null;
      });
    }
    return this.published;
  }

  /** Contenu d'une version donnée (celle active au départ d'une expédition). */
  version(id: number): Promise<GameContext> {
    let ctx = this.versions.get(id);
    if (!ctx) {
      ctx = loadContent(this.db, id).then(createGameContext);
      ctx.catch(() => this.versions.delete(id));
      this.versions.set(id, ctx);
    }
    return ctx;
  }

  invalidate(): void {
    this.published = null;
  }
}
