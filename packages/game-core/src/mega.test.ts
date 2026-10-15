import { describe, expect, it } from 'vitest';
import { checkBattleTeam } from './battle';
import { checkDungeonTeam } from './dungeon';
import { checkTeam } from './expedition';
import { checkMegaEvolution, isMegaForm, megaCount, megaOptions, megaStoneForm } from './mega';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const MEGA_X = 10034;
const MEGA_Y = 10035;

describe('Méga-Évolution', () => {
  it('relie chaque Méga-Gemme à sa forme Méga', () => {
    expect(megaStoneForm(ctx, 'charizardite-x')?.id).toBe(MEGA_X);
    expect(megaStoneForm(ctx, 'charizardite-y')?.id).toBe(MEGA_Y);
    expect(megaStoneForm(ctx, 'poke-ball')).toBeUndefined();
    expect(megaOptions(ctx, 6).map((o) => [o.form.id, o.itemIds])).toEqual([
      [MEGA_X, ['charizardite-x']],
      [MEGA_Y, ['charizardite-y']],
    ]);
    expect(megaOptions(ctx, 5)).toEqual([]);
  });

  it('ne Méga-Évolue que la forme normale de la bonne espèce', () => {
    const dracaufeu = { speciesId: 6, formId: null, megaStone: null };
    expect(checkMegaEvolution(ctx, dracaufeu, 'charizardite-x')).toMatchObject({
      form: { id: MEGA_X },
    });
    expect(checkMegaEvolution(ctx, { ...dracaufeu, speciesId: 3 }, 'charizardite-x')).toEqual({
      error: 'WRONG_MEGA_STONE',
    });
    expect(checkMegaEvolution(ctx, dracaufeu, 'poke-ball')).toEqual({
      error: 'NOT_A_MEGA_STONE',
    });
    expect(
      checkMegaEvolution(
        ctx,
        { ...dracaufeu, formId: MEGA_X, megaStone: 'charizardite-x' },
        'charizardite-y',
      ),
    ).toEqual({ error: 'ALREADY_MEGA' });
  });

  it('refuse plus d’un Pokémon Méga-Évolué par équipe', () => {
    const team = [
      member('a', 6, 50, { formId: MEGA_X }),
      member('b', 6, 50, { formId: MEGA_Y }),
      member('c', 3, 50),
    ];
    expect(isMegaForm(MEGA_X)).toBe(true);
    expect(megaCount(team)).toBe(2);
    const tooMany = { code: 'TOO_MANY_MEGAS', max: 1 };

    const zone = ctx.zones.find((z) => z.regionId === 'kanto')!;
    expect(checkTeam(ctx, zone, zone.durationsMinutes[0]!, team).errors).toContainEqual(tooMany);
    expect(
      checkTeam(ctx, zone, zone.durationsMinutes[0]!, team.slice(1)).errors,
    ).not.toContainEqual(tooMany);

    const trainer = ctx.trainers.find((t) => t.regionId === 'kanto')!;
    expect(checkBattleTeam(ctx, trainer, team)).toContainEqual(tooMany);
    expect(checkDungeonTeam(ctx, ctx.dungeon('mega-dracaufeu-x')!, team)).toContainEqual(tooMany);
  });
});
