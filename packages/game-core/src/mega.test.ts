import { describe, expect, it } from 'vitest';
import { checkBattleTeam } from './battle';
import { checkDungeonTeam } from './dungeon';
import { checkTeam } from './expedition';
import { effectiveAbility } from './abilities/env';
import {
  checkHeldItemForm,
  formItemForm,
  formItemOptions,
  heldItemForm,
  isMegaForm,
  megaCount,
  megaOptions,
  megaStoneForm,
} from './mega';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const MEGA_X = 10034;
const MEGA_Y = 10035;
const PRIMAL_KYOGRE = 10077;
const DEOXYS_ATTACK = 10001;
const DEOXYS_DEFENSE = 10002;
const DEOXYS_SPEED = 10003;

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
    expect(checkHeldItemForm(ctx, dracaufeu, 'charizardite-x')).toMatchObject({
      form: { id: MEGA_X },
    });
    expect(checkHeldItemForm(ctx, { ...dracaufeu, speciesId: 3 }, 'charizardite-x')).toEqual({
      error: 'WRONG_MEGA_STONE',
    });
    expect(checkHeldItemForm(ctx, dracaufeu, 'poke-ball')).toEqual({
      error: 'NOT_A_MEGA_STONE',
    });
    expect(
      checkHeldItemForm(
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
    expect(checkTeam(ctx, zone, team).errors).toContainEqual(tooMany);
    expect(checkTeam(ctx, zone, team.slice(1)).errors).not.toContainEqual(tooMany);

    const trainer = ctx.trainers.find((t) => t.regionId === 'kanto')!;
    expect(checkBattleTeam(ctx, trainer, team)).toContainEqual(tooMany);
    expect(checkDungeonTeam(ctx, ctx.dungeon('mega-dracaufeu-x')!, team)).toContainEqual(tooMany);
  });
});

describe('Objets de forme', () => {
  it('relie chaque objet de forme à sa forme, sans le confondre avec une Méga-Gemme', () => {
    expect(formItemForm(ctx, 'blue-orb')?.id).toBe(PRIMAL_KYOGRE);
    expect(formItemForm(ctx, 'charizardite-x')).toBeUndefined();
    expect(megaStoneForm(ctx, 'blue-orb')).toBeUndefined();
    expect(heldItemForm(ctx, 'blue-orb')?.id).toBe(PRIMAL_KYOGRE);
    expect(heldItemForm(ctx, 'charizardite-x')?.id).toBe(MEGA_X);
    expect(formItemOptions(ctx, 386).map((o) => [o.form.id, o.itemIds])).toEqual([
      [DEOXYS_ATTACK, ['meteorite-attaque']],
      [DEOXYS_DEFENSE, ['meteorite-defense']],
      [DEOXYS_SPEED, ['meteorite-vitesse']],
    ]);
    expect(megaOptions(ctx, 386)).toEqual([]);
  });

  it('ne se tient que par la forme normale de la bonne espèce', () => {
    const deoxys = { speciesId: 386, formId: null, megaStone: null };
    expect(checkHeldItemForm(ctx, deoxys, 'meteorite-vitesse')).toMatchObject({
      form: { id: DEOXYS_SPEED },
    });
    expect(checkHeldItemForm(ctx, { ...deoxys, speciesId: 382 }, 'meteorite-vitesse')).toEqual({
      error: 'WRONG_MEGA_STONE',
    });
    expect(
      checkHeldItemForm(
        ctx,
        { ...deoxys, formId: DEOXYS_ATTACK, megaStone: 'meteorite-attaque' },
        'meteorite-vitesse',
      ),
    ).toEqual({ error: 'ALREADY_MEGA' });
  });

  it('Primo-Résurgence : talent de la forme, hors de la limite des Méga', () => {
    const kyogre = member('k', 382, 70, { formId: PRIMAL_KYOGRE, ability: 'drizzle' });
    expect(effectiveAbility(ctx, kyogre)).toBe('primordial-sea');
    expect(megaCount([kyogre, member('d', 6, 50, { formId: MEGA_X })])).toBe(1);
    // Deoxys garde son propre talent dans ses autres formes.
    const deoxys = member('x', 386, 70, { formId: DEOXYS_ATTACK, ability: '' });
    expect(effectiveAbility(ctx, deoxys)).toBe('');
  });
});
