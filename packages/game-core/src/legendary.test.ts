import { describe, expect, it } from 'vitest';
import { DUNGEON_STATS } from '@poke/content';
import { enemyFighters, simulateDungeon } from './dungeon';
import {
  buildLegendarySetup,
  checkLegendaryTeam,
  legendaryBoss,
  legendaryCaptureChance,
  legendaryRetryAt,
  legendaryTarget,
  resolveLegendaryBattle,
} from './legendary';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const quest = (id: string) => ctx.quest(id)!;
const artikodin = quest('artikodin');
const target = artikodin.rewards.pokemon[0]!;
const strongTeam = [9, 59, 68, 65, 94, 143].map((id, i) => member(`m${i}`, id, 100));
const withMoves = (team: typeof strongTeam) => team.map((m) => ({ ...m, move: null }));

describe('combat légendaire', () => {
  it('cible le légendaire non fuyard pas encore capturé', () => {
    expect(legendaryTarget(artikodin, 0)?.speciesId).toBe(144);
    expect(legendaryTarget(artikodin, 1)).toBeUndefined();
    const roaming = ctx.quests.find((q) => q.rewards.pokemon.some((p) => p.roaming !== null))!;
    const index = roaming.rewards.pokemon.findIndex((p) => p.roaming !== null);
    expect(legendaryTarget(roaming, index)).toBeUndefined();
  });

  it('renforce le légendaire : niveau, PV et statistiques du combat', () => {
    const boss = legendaryBoss(ctx, target)!;
    const { battle } = target;
    const [plain] = enemyFighters(
      ctx,
      [{ speciesId: 144, formId: null, level: battle.level!, iv: battle.iv, nature: null }],
      battle.iv,
      1,
    );
    expect(boss.level).toBe(battle.level);
    expect(boss.maxHp).toBeCloseTo(plain!.maxHp * battle.hpMultiplier, -1);
    for (const stat of DUNGEON_STATS) {
      expect(boss.stats[stat]).toBe(Math.round(plain!.stats[stat] * battle.statMultiplier));
    }
    expect(boss.enrage).toEqual({
      hpFraction: battle.enrageHpFraction,
      percent: battle.enragePercent,
    });
    expect(legendaryBoss(ctx, target, true)!.isShiny).toBe(true);
  });

  it('se déchaîne une seule fois sous la moitié de ses PV', () => {
    const setup = buildLegendarySetup(ctx, target, withMoves(strongTeam), 42, 12);
    const { events } = simulateDungeon(setup, [], null, setup.timeLimitMs);
    const enrages = events.filter((e) => e.kind === 'enrage');
    expect(enrages).toHaveLength(1);
    expect(enrages[0]).toMatchObject({ index: 0, percent: target.battle.enragePercent });
    // Sans déchaînement configuré, aucun événement.
    const calm = testContext((c) => {
      c.quests.find((q) => q.id === 'artikodin')!.rewards.pokemon[0]!.battle.enragePercent = 0;
    });
    const calmTarget = calm.quest('artikodin')!.rewards.pokemon[0]!;
    const calmSetup = buildLegendarySetup(calm, calmTarget, withMoves(strongTeam), 42, 12);
    expect(
      simulateDungeon(calmSetup, [], null, calmSetup.timeLimitMs).events.some(
        (e) => e.kind === 'enrage',
      ),
    ).toBe(false);
  });

  it('vaincu : XP pour l’équipe ; fuite : aucune XP', () => {
    const setup = buildLegendarySetup(ctx, target, withMoves(strongTeam), 42, 12);
    const input = { target, setup, commands: [], team: strongTeam };
    const win = resolveLegendaryBattle(ctx, { ...input, fledAtMs: null });
    expect(win.outcome).toBe('win');
    expect(win.xpPerMember).toBeGreaterThan(0);
    const fled = resolveLegendaryBattle(ctx, { ...input, fledAtMs: 1_000 });
    expect(fled).toMatchObject({ outcome: 'fled', xpPerMember: 0 });
  });

  it('équipe faible : défaite, Pokémon mis K.O.', () => {
    const weak = [member('w', 19, 10)];
    const setup = buildLegendarySetup(ctx, target, withMoves(weak), 1, 12);
    const result = resolveLegendaryBattle(ctx, {
      target,
      setup,
      commands: [],
      team: weak,
      fledAtMs: null,
    });
    expect(result.outcome).toBe('loss');
    expect(result.xpPerMember).toBe(0);
    expect(result.knockedOut).toEqual(['w']);
  });

  it('vérifie l’équipe : région de la quête, types requis', () => {
    expect(checkLegendaryTeam(ctx, artikodin, target, strongTeam)).toEqual([]);
    expect(checkLegendaryTeam(ctx, artikodin, target, [member('c', 152, 50)])).toContainEqual(
      expect.objectContaining({ code: 'WRONG_REGION' }),
    );
    const typed = {
      ...target,
      battle: { ...target.battle, requiredTypes: [{ type: 'dragon', count: 1 }] },
    };
    expect(checkLegendaryTeam(ctx, artikodin, typed, strongTeam)).toContainEqual(
      expect.objectContaining({ code: 'MISSING_TYPES' }),
    );
    expect(checkLegendaryTeam(ctx, artikodin, target, [])).toContainEqual({ code: 'TEAM_EMPTY' });
  });

  it('capture à chance fixe, quelle que soit la Ball ; Master Ball garantie', () => {
    const chance = target.battle.captureChance / 100;
    expect(legendaryCaptureChance(ctx, target, 'poke-ball')).toBeCloseTo(chance);
    expect(legendaryCaptureChance(ctx, target, 'ultra-ball')).toBeCloseTo(chance);
    expect(legendaryCaptureChance(ctx, target, 'master-ball')).toBe(1);
    expect(legendaryCaptureChance(ctx, target, 'potion')).toBe(0);
  });

  it('météo et statuts : pertes calculées sur ses PV d’avant renfort', () => {
    const boss = legendaryBoss(ctx, target)!;
    expect(boss.maxHp).toBeGreaterThan(boss.percentHp! * 3);
    const setup = {
      ...buildLegendarySetup(ctx, target, withMoves(strongTeam), 42, 12),
      weather: 'sand' as const,
    };
    const { events } = simulateDungeon(setup, [], null, setup.timeLimitMs);
    const losses = events.filter(
      (e) => e.kind === 'status' && e.side === 'enemy' && e.change === 'damage',
    );
    expect(losses.length).toBeGreaterThan(0);
    for (const e of losses) {
      expect(e).toMatchObject({ amount: Math.round(boss.percentHp! / 16) });
    }
  });

  it('retente le combat après le délai', () => {
    const endedAt = new Date('2026-11-05T10:00:00Z');
    const minutes = ctx.balance.legendary.retryCooldownMinutes;
    expect(legendaryRetryAt(ctx, undefined, endedAt)).toBeNull();
    expect(legendaryRetryAt(ctx, { endedAt }, endedAt.getTime() + 1_000)).toEqual(
      new Date(endedAt.getTime() + minutes * 60_000),
    );
    expect(legendaryRetryAt(ctx, { endedAt }, endedAt.getTime() + minutes * 60_000)).toBeNull();
  });
});
