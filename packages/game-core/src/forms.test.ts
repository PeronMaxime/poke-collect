import { describe, expect, it } from 'vitest';
import { forms } from '@poke/data';
import type { Zone } from '@poke/content';
import { checkBreedingPair, resolveEgg } from './breeding';
import { typeAdvantage } from './battle';
import { evolutionOptions, evolvePokemon } from './evolution';
import { resolveExpedition } from './expedition';
import { canEvolveInForm, counterpartFormId } from './forms';
import { generatePokemon, pokemonPower } from './pokemon';
import { createRng } from './rng';
import { member, testContext } from './test-helpers';

const formId = (name: string) => forms.find((f) => f.name === name)!.id;

describe('formes alternatives et régionales', () => {
  const ctx = testContext();
  const alolanVulpix = formId('vulpix-alola');

  it('applique les types, statistiques et talents de la forme', () => {
    const vulpix = ctx.species(37)!;
    const alolan = ctx.species(37, alolanVulpix)!;
    expect(vulpix.types).toEqual(['fire']);
    expect(alolan.types).toEqual(['ice']);
    expect(alolan.form?.formName).toBe('alola');
    expect(alolan.nameFr).toMatch(/Alola/);
    expect(alolan.captureRate).toBe(vulpix.captureRate);
    // Une forme d'une autre espèce est ignorée.
    expect(ctx.species(25, alolanVulpix)?.form).toBeNull();
  });

  it('génère un Pokémon dans la forme demandée', () => {
    const p = generatePokemon(ctx, createRng(1), 37, 10, {
      shinyProbability: 0,
      formId: alolanVulpix,
    });
    expect(p.formId).toBe(alolanVulpix);
    expect(ctx.species(37, alolanVulpix)!.abilities.map((a) => a.name)).toContain(p.ability);
    // Sans forme : mêmes tirages, forme par défaut.
    const plain = generatePokemon(ctx, createRng(1), 37, 10, { shinyProbability: 0 });
    expect(plain.formId).toBeNull();
    expect(plain.ivs).toEqual(p.ivs);
  });

  it('tient compte de la forme pour la PE et l’avantage de types', () => {
    const geodude = member('a', 74, 30);
    const alolan = { ...geodude, formId: formId('geodude-alola') };
    expect(pokemonPower(ctx.species(74, alolan.formId)!, alolan)).toBe(
      pokemonPower(ctx.species(74)!, geodude),
    );
    // Racaillou d'Alola (Roche/Électrik) face à Léviator (Eau/Vol).
    const gyarados = [{ speciesId: 130 }];
    expect(typeAdvantage(ctx, [alolan], gyarados)).toBeGreaterThan(
      typeAdvantage(ctx, [geodude], gyarados),
    );
  });

  it('rencontre la forme indiquée par la zone', () => {
    const zone: Zone = {
      ...ctx.zone('route-1')!,
      encounters: [{ speciesId: 37, formId: alolanVulpix, weight: 1, minLevel: 5, maxLevel: 5 }],
    };
    const result = resolveExpedition(ctx, {
      seed: 3,
      zone,
      durationMinutes: 60,
      team: [member('a', 1, 20)],
      pity: {},
      balls: { itemId: 'poke-ball', quantity: 99 },
      berries: null,
    });
    expect(result.encounters.length).toBeGreaterThan(0);
    for (const e of result.encounters) {
      expect(e.formId).toBe(alolanVulpix);
      if (e.pokemon) expect(e.pokemon.formId).toBe(alolanVulpix);
    }
  });

  it('transmet la forme le long de la lignée', () => {
    expect(counterpartFormId(formId('rattata-alola'), 20)).toBe(formId('raticate-alola'));
    expect(counterpartFormId(formId('raichu-alola'), 172)).toBeNull();
    expect(counterpartFormId(null, 20)).toBeNull();
    // Miaouss de Galar n'évolue pas en Persian mais en Berserkatt ; Miaouss d'Alola, en Persian.
    expect(canEvolveInForm(formId('meowth-galar'), 53)).toBe(false);
    expect(canEvolveInForm(formId('meowth-alola'), 53)).toBe(true);
    expect(evolutionOptions(ctx, 52, formId('meowth-galar')).map((o) => o.toSpeciesId)).toEqual([
      863,
    ]);
    expect(evolutionOptions(ctx, 52).map((o) => o.toSpeciesId)).toEqual([53]);

    const rattata = {
      ...member('r', 19, 25, { ability: 'hustle' }),
      formId: formId('rattata-alola'),
    };
    const raticate = evolvePokemon(ctx, rattata, 20);
    expect(raticate.formId).toBe(formId('raticate-alola'));
    expect(ctx.species(20, raticate.formId)!.abilities.map((a) => a.name)).toContain(
      raticate.ability,
    );
  });

  it('applique les conditions PokéAPI propres à une forme', () => {
    // Miaouss d'Alola évolue par le bonheur (et non au niveau 28) en Persian d'Alola.
    const [alolan] = evolutionOptions(ctx, 52, formId('meowth-alola'));
    expect(alolan).toMatchObject({ toSpeciesId: 53, toFormId: formId('persian-alola') });
    expect(alolan!.methods.every((m) => m.minLevel === null && m.minHappiness !== null)).toBe(true);
    // Pikachu évolue au choix en Raichu ou en Raichu d'Alola.
    const raichus = evolutionOptions(ctx, 25).map((o) => [o.toSpeciesId, o.toFormId]);
    expect(raichus).toEqual([
      [26, null],
      [26, formId('raichu-alola')],
    ]);
    const pikachu = { ...member('p', 25, 30), formId: null };
    expect(evolvePokemon(ctx, pikachu, 26, formId('raichu-alola')).formId).toBe(
      formId('raichu-alola'),
    );
  });

  it('ne fait pas évoluer les Méga-Évolutions ni les Gigamax, garde les formes d’apparence', () => {
    expect(evolutionOptions(ctx, 25, formId('pikachu-gmax'))).toEqual([]);
    expect(canEvolveInForm(formId('pikachu-gmax'), 26)).toBe(false);
    // Sancoki Orient → Tritosor Orient (même suffixe).
    const [east] = evolutionOptions(ctx, 422, formId('shellos-east'));
    expect(east).toMatchObject({ toSpeciesId: 423, toFormId: formId('gastrodon-east') });
  });

  it('pond un œuf de la forme régionale de la mère', () => {
    const mother = { speciesId: 38, formId: formId('ninetales-alola'), gender: 'female' as const };
    const check = checkBreedingPair(ctx, mother, { speciesId: 58, gender: 'male' });
    expect(check).toMatchObject({ ok: true, eggSpeciesId: 37, eggFormId: alolanVulpix });

    const parent = (p: Partial<ReturnType<typeof member>>) => ({
      ...member('p', 38, 30, p),
      heldItemId: null,
    });
    const child = resolveEgg(ctx, {
      seed: 5,
      speciesId: 37,
      formId: alolanVulpix,
      parents: [
        parent({ formId: formId('ninetales-alola'), gender: 'female' }),
        parent({ speciesId: 58, gender: 'male' }),
      ],
      motherIndex: 0,
    });
    expect(child.formId).toBe(alolanVulpix);
  });
});
