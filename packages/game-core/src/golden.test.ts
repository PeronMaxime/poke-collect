import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildBattleSetup, resolveBattle } from './battle';
import { resolveEgg } from './breeding';
import type { DaycareParent } from './breeding';
import { buildDungeonSetup, resolveDungeonRun, simulateDungeon } from './dungeon';
import type { DungeonCommand, DungeonSetup } from './dungeon';
import { resolveExpedition } from './expedition';
import type { TeamMember } from './expedition';
import { buildLegendarySetup, resolveLegendaryBattle } from './legendary';
import { createRng } from './rng';
import type { Rng } from './rng';
import { member, testContext } from './test-helpers';

/**
 * Tests « à graine égale » (docs/plans/PLAN-QUALITE.md, étape 0.2).
 *
 * Toute la logique de jeu est pilotée par une graine : à entrées égales, le résultat est le même
 * au bit près. Ces tests rejouent quelques centaines de situations tirées au hasard (zones,
 * dresseurs, donjons, équipes, talents, ordres donnés en combat) et comparent l'empreinte de
 * chaque résultat à celle enregistrée dans `__snapshots__/golden.test.ts.snap`.
 *
 * - Ils ne disent pas si une règle est juste (c'est le rôle des autres tests), seulement que
 *   **rien n'a changé** : c'est le filet des découpages et des réécritures sans changement de règle.
 * - Un changement voulu (règle, équilibrage, contenu de test) les fait échouer à dessein :
 *   relire les lignes modifiées, puis `pnpm --filter @poke/game-core test -- -u` pour les
 *   réenregistrer, dans le même commit que le changement.
 */

const ctx = testContext();
const STARTED_AT = new Date('2026-10-07T12:00:00Z');
/** Les équipes sont tirées parmi les espèces des générations I à IV. */
const MAX_SPECIES = 493;
const NATURES = ['hardy', 'adamant', 'modest', 'jolly', 'timid', 'bold', 'calm'];
const ABILITIES = ['none', ...ctx.content.abilities.map((a) => a.id)];
const BALLS = ctx.content.items.filter((i) => i.category === 'ball').map((i) => i.id);
const BERRIES = ctx.content.items.filter((i) => i.category === 'berry').map((i) => i.id);

/** Empreinte courte d'un résultat complet (le JSON entier ferait des dizaines de Mo). */
function fingerprint(value: unknown): string {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

const pick = <T>(rng: Rng, values: readonly T[]): T => values[rng.int(0, values.length - 1)]!;

/** Espèce existante et activée, tirée au hasard. */
function randomSpeciesId(rng: Rng): number {
  for (;;) {
    const id = rng.int(1, MAX_SPECIES);
    if (ctx.species(id)?.enabled) return id;
  }
}

function randomMember(rng: Rng, id: string): TeamMember {
  const iv = () => rng.int(0, 31);
  return member(id, randomSpeciesId(rng), rng.int(1, 100), {
    ivs: {
      hp: iv(),
      attack: iv(),
      defense: iv(),
      'special-attack': iv(),
      'special-defense': iv(),
      speed: iv(),
    },
    nature: pick(rng, NATURES),
    ability: pick(rng, ABILITIES),
    gender: pick(rng, ['male', 'female'] as const),
    happiness: rng.int(0, 255),
  });
}

function randomTeam(rng: Rng): TeamMember[] {
  return Array.from({ length: rng.int(1, 6) }, (_, i) => randomMember(rng, `m${i}`));
}

const withMoves = (team: readonly TeamMember[]) => team.map((m) => ({ ...m, move: null }));

/** Ordres du joueur pendant un combat : quelques relais, à des instants croissants. */
function randomCommands(rng: Rng, setup: DungeonSetup): DungeonCommand[] {
  if (setup.team.length < 2 || rng.chance(0.5)) return [];
  let atMs = 0;
  return Array.from({ length: rng.int(1, 4) }, () => {
    atMs += rng.int(500, 8_000);
    return { atMs, member: rng.int(0, setup.team.length - 1) };
  });
}

const randomFlee = (rng: Rng) => (rng.chance(0.15) ? rng.int(100, 20_000) : null);

/** Une ligne par situation : « graine : repères lisibles, empreinte du résultat complet ». */
function cases(count: number, run: (rng: Rng, seed: number) => [summary: string, result: unknown]) {
  return Array.from({ length: count }, (_, seed) => {
    const [summary, result] = run(createRng(seed * 7919 + 1), seed);
    return `${String(seed).padStart(3, '0')} ${summary} ${fingerprint(result)}`;
  });
}

describe('résultats à graine égale', () => {
  it('expéditions', () => {
    const lines = cases(200, (rng, seed) => {
      const zone = pick(rng, ctx.zones);
      const minutes = pick(rng, [5, 30, 60, 240, 720, 1440]);
      const result = resolveExpedition(ctx, {
        zone,
        elapsedMinutes: minutes,
        seed,
        team: randomTeam(rng),
        balls: rng.chance(0.8) ? { itemId: pick(rng, BALLS), quantity: rng.int(1, 200) } : null,
        berries: rng.chance(0.4) ? { itemId: pick(rng, BERRIES), quantity: rng.int(1, 10) } : null,
        pity: rng.chance(0.3) ? { [randomSpeciesId(rng)]: rng.int(1, 30) } : {},
        shiny: rng.chance(0.3) ? { chain: rng.int(0, 40), charm: 2 } : undefined,
        bonuses: rng.chance(0.3) ? { capture: 1.1, xp: 1.2, money: 1.3, shiny: 1.5 } : undefined,
        weather: rng.chance(0.3) ? pick(rng, ['rain', 'sun', 'sand', 'hail'] as const) : undefined,
        hour: rng.chance(0.5) ? rng.int(0, 23) : undefined,
      });
      const captured = result.encounters.filter((e) => e.outcome === 'captured').length;
      return [`${zone.id} ${minutes}min ${result.encounters.length}r ${captured}c`, result];
    });
    expect(lines).toMatchSnapshot();
  });

  it('combats de dresseurs', () => {
    const lines = cases(150, (rng, seed) => {
      const trainer = pick(rng, ctx.trainers);
      const team = randomTeam(rng);
      const hour = rng.chance(0.5) ? rng.int(0, 23) : null;
      const setup = buildBattleSetup(ctx, trainer, withMoves(team), seed, hour, STARTED_AT);
      const result = resolveBattle(ctx, {
        trainer,
        setup,
        commands: randomCommands(rng, setup),
        fledAtMs: randomFlee(rng),
        team,
      });
      return [`${trainer.id} ${result.outcome}`, { setup, result }];
    });
    expect(lines).toMatchSnapshot();
  });

  it('donjons', () => {
    const lines = cases(150, (rng, seed) => {
      const dungeon = pick(rng, ctx.dungeons);
      const team = randomTeam(rng);
      const hour = rng.chance(0.5) ? rng.int(0, 23) : null;
      const setup = buildDungeonSetup(ctx, dungeon, withMoves(team), seed, hour);
      const commands = randomCommands(rng, setup);
      const fledAtMs = randomFlee(rng);
      // Le déroulé complet (événements, état final) compte autant que le résultat.
      const replay = simulateDungeon(setup, commands, fledAtMs, setup.timeLimitMs);
      const result = resolveDungeonRun(ctx, { dungeon, setup, commands, fledAtMs, team, hour });
      return [
        `${dungeon.id} ${result.outcome} ${replay.events.length}e`,
        { setup, replay, result },
      ];
    });
    expect(lines).toMatchSnapshot();
  });

  it('combats légendaires', () => {
    const targets = ctx.quests.flatMap((q) => q.rewards.pokemon.filter((p) => p.roaming === null));
    const lines = cases(100, (rng, seed) => {
      const target = pick(rng, targets);
      const team = randomTeam(rng);
      const hour = rng.chance(0.5) ? rng.int(0, 23) : null;
      const setup = buildLegendarySetup(ctx, target, withMoves(team), seed, hour, rng.chance(0.1));
      const commands = randomCommands(rng, setup);
      const fledAtMs = randomFlee(rng);
      const replay = simulateDungeon(setup, commands, fledAtMs, setup.timeLimitMs);
      const result = resolveLegendaryBattle(ctx, { target, setup, commands, fledAtMs, team });
      return [`${target.speciesId} ${result.outcome}`, { setup, replay, result }];
    });
    expect(lines).toMatchSnapshot();
  });

  it('œufs', () => {
    const parent = (rng: Rng, gender: 'male' | 'female'): DaycareParent => {
      const { id: _, ...instance } = randomMember(rng, 'p');
      return {
        ...instance,
        gender,
        heldItemId: pick(rng, [null, null, 'destiny-knot', 'everstone']),
        originRegion: pick(rng, ['kanto', 'johto', null]),
      };
    };
    const lines = cases(200, (rng, seed) => {
      const mother = parent(rng, 'female');
      const egg = resolveEgg(ctx, {
        seed,
        speciesId: mother.speciesId,
        parents: [mother, parent(rng, 'male')],
        motherIndex: 0,
        shinyCharm: rng.chance(0.3) ? 2 : undefined,
      });
      return [`${egg.speciesId} ${egg.nature}${egg.isShiny ? ' shiny' : ''}`, egg];
    });
    expect(lines).toMatchSnapshot();
  });
});
