import { createHash } from 'node:crypto';
import { getPublishedVersion, loadContent } from '@poke/db';
import type { Db } from '@poke/db';
import { createGameContext, playableContent } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { currentTransaction } from './game/tx';

/**
 * Le contenu du jeu en mémoire : la version publiée et les versions encore utilisées par des
 * expéditions en cours.
 */

/** Contenu publié déjà sérialisé et son ETag (le JSON fait plusieurs centaines de Ko). */
export interface PublicContentBody {
  body: string;
  etag: string;
}

/**
 * Contenu gardé en mémoire. La version publiée est invalidée à chaque publication ;
 * les versions déjà publiées ne changent plus, on peut donc les garder (expéditions en cours).
 *
 * Appelé pour la première fois dans une transaction (juste après une publication), le chargement
 * passe par la connexion de cette transaction : en réclamer une autre au pool le bloquerait dès
 * que toutes ses connexions attendent le contenu (et PGlite, à connexion unique, tout de suite).
 */
export class ContentCache {
  private published: Promise<GameContext> | null = null;
  private readonly versions = new Map<number, Promise<GameContext>>();
  private publicBody: Promise<PublicContentBody> | null = null;

  constructor(private readonly db: Db) {}

  /**
   * Contenu publié tel que le voient les joueurs : sans les régions, zones, dresseurs et quêtes
   * désactivés (voir `playableContent`), on ne peut donc ni les lancer ni les afficher.
   */
  get(): Promise<GameContext> {
    if (!this.published) {
      this.published = getPublishedVersion(this.reader()).then(async (v) => {
        if (!v) throw new Error('Aucune version de contenu publiée');
        return createGameContext(playableContent((await this.version(v.id)).content));
      });
      // En cas d'échec, on réessaiera au prochain appel.
      this.published.catch(() => {
        this.published = null;
      });
    }
    return this.published;
  }

  /**
   * Contenu complet d'une version donnée (celle active au départ d'une expédition) : une
   * expédition ou un combat lancé avant la désactivation de sa zone ou de son dresseur se termine.
   */
  version(id: number): Promise<GameContext> {
    let ctx = this.versions.get(id);
    if (!ctx) {
      ctx = loadContent(this.reader(), id).then(createGameContext);
      ctx.catch(() => this.versions.delete(id));
      this.versions.set(id, ctx);
    }
    return ctx;
  }

  /**
   * Contenu publié en JSON, sérialisé une seule fois par version publiée. L'ETag porte le numéro
   * de version : le jeu ne recharge le contenu que s'il a changé (réponse 304 sinon).
   */
  publicJson(): Promise<PublicContentBody> {
    if (!this.publicBody) {
      this.publicBody = this.get().then((ctx) => {
        const body = JSON.stringify(ctx.content);
        // Le numéro de version ne suffit pas : une migration peut corriger le contenu publié sans
        // en créer une nouvelle, et le navigateur garderait alors l'ancien (réponse 304).
        const hash = createHash('sha1').update(body).digest('base64url');
        return { body, etag: `W/"content-${ctx.content.versionId}-${hash}"` };
      });
      this.publicBody.catch(() => {
        this.publicBody = null;
      });
    }
    return this.publicBody;
  }

  /** Connexion de la transaction en cours s'il y en a une, sinon le pool. */
  private reader(): Db {
    return currentTransaction() ?? this.db;
  }

  invalidate(): void {
    this.published = null;
    this.publicBody = null;
  }
}
