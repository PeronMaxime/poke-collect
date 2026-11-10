import { describe, test } from 'vitest';
import { seedContent } from '@poke/content/seed';
import { createGameContext } from './context';
import { buildDungeonSetup, simulateDungeon } from './dungeon';
import { resolveExpedition } from './expedition';
import { member, testContext } from './test-helpers';

/**
 * Mesures de vitesse des calculs les plus lourds (docs/plans/PLAN-QUALITE.md, étape 3.5) :
 * `pnpm --filter @poke/game-core bench`.
 *
 * Ce ne sont pas des tests : rien n'échoue, et `pnpm test` ne les lance pas. Les chiffres servent
 * de référence (ils sont notés dans le README du paquet) pour juger une optimisation ou repérer
 * un ralentissement. On n'optimise que ce qu'une mesure désigne.
 */

const ctx = testContext();
/** Équipe complète de niveau 50, sans talent : le cas courant. */
const team = [1, 4, 7, 25, 133, 143].map((speciesId, i) => member(`m${i}`, speciesId, 50));

describe('expédition', () => {
  const zone = ctx.zones[0]!;
  const balls = { itemId: 'poke-ball', quantity: 9_999 };

  // Le serveur rejoue l'expédition depuis son départ chaque fois qu'il la met à jour (Balls
  // retirées du sac, récupération) : c'est le calcul le plus fréquent du jeu.
  test('24 heures, rejouée du départ à la fin', async ({ bench }) => {
    await bench('expédition de 24 h', () => {
      resolveExpedition(ctx, {
        zone,
        elapsedMinutes: 1_440,
        seed: 12_345,
        team,
        balls,
        berries: null,
        pity: {},
      });
    }).run();
  });

  test('1 heure', async ({ bench }) => {
    await bench('expédition de 1 h', () => {
      resolveExpedition(ctx, {
        zone,
        elapsedMinutes: 60,
        seed: 12_345,
        team,
        balls,
        berries: null,
        pity: {},
      });
    }).run();
  });
});

describe('donjon', () => {
  const dungeon = ctx.dungeons[0]!;
  const moves = team.map((m) => ({ ...m, move: null }));
  const setup = buildDungeonSetup(ctx, dungeon, moves, 12_345, 12);

  test('mise en place', async ({ bench }) => {
    await bench('mise en place du donjon', () => {
      buildDungeonSetup(ctx, dungeon, moves, 12_345, 12);
    }).run();
  });

  // Le navigateur rejoue le combat depuis le départ à chaque rafraîchissement de l'écran, le
  // serveur à chaque ordre du joueur : ici jusqu'au bout du temps imparti.
  test('combat complet, rejoué du départ à la fin', async ({ bench }) => {
    await bench('combat de donjon complet', () => {
      simulateDungeon(setup, [], null, setup.timeLimitMs);
    }).run();
  });
});

describe('contenu', () => {
  // Fait une fois par version publiée (et par test), jamais par requête.
  test('construction du contexte de jeu', async ({ bench }) => {
    await bench('contexte de jeu', () => {
      createGameContext({ versionId: 1, ...structuredClone(seedContent) });
    }).run();
  });
});
