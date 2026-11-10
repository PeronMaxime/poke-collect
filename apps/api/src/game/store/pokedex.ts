import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { pokedex, pokedexForms } from '@poke/db';
import type { Db } from '@poke/db';
import type { CaughtDex, DexCatches, PokemonInstance } from '@poke/game-core';
import type { PokedexEntryDto, PokedexFormEntryDto } from '@poke/shared';

/**
 * Le Pokédex d'un joueur : espèces vues et capturées, formes capturées.
 *
 * `recordPokedex` est le seul point d'écriture : toute capture, éclosion ou évolution y passe, et
 * il renvoie ce qui est nouveau pour le joueur.
 */

/** Nouveautés du Pokédex après une capture, une éclosion, une évolution… */
export interface NewInDex {
  newSpeciesIds: number[];
  newFormIds: number[];
}

/** Pokémon rencontré (expédition, combat) : son espèce, sa forme et sa version shiny sont vues. */
export type SeenPokemon = Pick<PokemonInstance, 'speciesId' | 'formId' | 'isShiny'>;

/**
 * Met à jour le Pokédex : espèces et formes vues, Pokémon capturés (espèce, forme, shiny).
 * Retourne les espèces et les formes capturées pour la première fois.
 */
export async function recordPokedex(
  db: Db,
  ownerId: string,
  {
    seen = [],
    seenShiny = [],
    met = [],
    caught,
    at,
  }: {
    seen?: Iterable<number>;
    /** Espèces rencontrées en version shiny (capturées ou non). */
    seenShiny?: Iterable<number>;
    /** Pokémon rencontrés, capturés ou non : espèce, forme et version shiny vues. */
    met?: readonly SeenPokemon[];
    caught: readonly Pick<PokemonInstance, 'speciesId' | 'formId' | 'isShiny'>[];
    at: Date;
  },
): Promise<NewInDex> {
  const caughtSet = new Set(caught.map((p) => p.speciesId));
  const shinySet = new Set(caught.filter((p) => p.isShiny).map((p) => p.speciesId));
  const seenShinySet = new Set([
    ...seenShiny,
    ...shinySet,
    ...met.filter((p) => p.isShiny).map((p) => p.speciesId),
  ]);
  const all = new Set([...seen, ...met.map((p) => p.speciesId), ...seenShinySet, ...caughtSet]);
  if (all.size === 0) return { newSpeciesIds: [], newFormIds: [] };
  // Formes vues par espèce (rencontrées ou capturées).
  const seenForms = new Map<number, { all: Set<number>; shiny: Set<number> }>();
  for (const p of [...met, ...caught]) {
    if (p.formId == null) continue;
    const forms = seenForms.get(p.speciesId) ?? { all: new Set(), shiny: new Set() };
    forms.all.add(p.formId);
    if (p.isShiny) forms.shiny.add(p.formId);
    seenForms.set(p.speciesId, forms);
  }

  const before = await db
    .select({ speciesId: pokedex.speciesId })
    .from(pokedex)
    .where(
      and(
        eq(pokedex.ownerId, ownerId),
        eq(pokedex.caught, true),
        inArray(pokedex.speciesId, [...all]),
      ),
    );
  const alreadyCaught = new Set(before.map((r) => r.speciesId));

  for (const speciesId of all) {
    const isCaught = caughtSet.has(speciesId);
    const isShiny = shinySet.has(speciesId);
    const forms = seenForms.get(speciesId);
    await db
      .insert(pokedex)
      .values({
        ownerId,
        speciesId,
        seen: true,
        caught: isCaught,
        caughtShiny: isShiny,
        seenShiny: seenShinySet.has(speciesId),
        seenFormIds: [...(forms?.all ?? [])],
        seenShinyFormIds: [...(forms?.shiny ?? [])],
        firstCaughtAt: isCaught ? at : null,
      })
      .onConflictDoUpdate({
        target: [pokedex.ownerId, pokedex.speciesId],
        set: {
          seen: true,
          caught: sql`${pokedex.caught} or excluded.caught`,
          caughtShiny: sql`${pokedex.caughtShiny} or excluded.caught_shiny`,
          seenShiny: sql`${pokedex.seenShiny} or excluded.seen_shiny`,
          seenFormIds: sql`array(select distinct unnest(${pokedex.seenFormIds} || excluded.seen_form_ids) order by 1)`,
          seenShinyFormIds: sql`array(select distinct unnest(${pokedex.seenShinyFormIds} || excluded.seen_shiny_form_ids) order by 1)`,
          firstCaughtAt: sql`coalesce(${pokedex.firstCaughtAt}, excluded.first_caught_at)`,
        },
      });
  }

  const formsShiny = new Map<number, boolean>();
  for (const p of caught) {
    if (p.formId != null)
      formsShiny.set(p.formId, (formsShiny.get(p.formId) ?? false) || p.isShiny);
  }
  const formsBefore =
    formsShiny.size === 0
      ? []
      : await db
          .select({ formId: pokedexForms.formId })
          .from(pokedexForms)
          .where(
            and(
              eq(pokedexForms.ownerId, ownerId),
              inArray(pokedexForms.formId, [...formsShiny.keys()]),
            ),
          );
  const formsAlreadyCaught = new Set(formsBefore.map((r) => r.formId));
  for (const [formId, isShiny] of formsShiny) {
    await db
      .insert(pokedexForms)
      .values({ ownerId, formId, caughtShiny: isShiny, firstCaughtAt: at })
      .onConflictDoUpdate({
        target: [pokedexForms.ownerId, pokedexForms.formId],
        set: { caughtShiny: sql`${pokedexForms.caughtShiny} or excluded.caught_shiny` },
      });
  }
  return {
    newSpeciesIds: [...caughtSet].filter((id) => !alreadyCaught.has(id)),
    newFormIds: [...formsShiny.keys()].filter((id) => !formsAlreadyCaught.has(id)),
  };
}

/** Pokédex normal et shiny et formes capturées (collections, complétions d'expédition). */
export async function dexCatches(db: Db, ownerId: string): Promise<Required<DexCatches>> {
  const rows = await db
    .select({ speciesId: pokedex.speciesId, shiny: pokedex.caughtShiny })
    .from(pokedex)
    .where(and(eq(pokedex.ownerId, ownerId), eq(pokedex.caught, true)));
  const forms = await db
    .select({ formId: pokedexForms.formId, shiny: pokedexForms.caughtShiny })
    .from(pokedexForms)
    .where(eq(pokedexForms.ownerId, ownerId));
  return {
    caughtSpeciesIds: new Set(rows.map((r) => r.speciesId)),
    caughtShinySpeciesIds: new Set(rows.filter((r) => r.shiny).map((r) => r.speciesId)),
    caughtFormIds: new Set(forms.map((r) => r.formId)),
    caughtShinyFormIds: new Set(forms.filter((r) => r.shiny).map((r) => r.formId)),
  };
}

/** Espèces et formes déjà capturées (filtre de capture « nouveaux Pokémon »). */
export async function caughtDex(db: Db, ownerId: string): Promise<CaughtDex> {
  const forms = await db
    .select({ formId: pokedexForms.formId })
    .from(pokedexForms)
    .where(eq(pokedexForms.ownerId, ownerId));
  return {
    speciesIds: await caughtSpeciesIds(db, ownerId),
    formIds: new Set(forms.map((r) => r.formId)),
  };
}

/** Numéros des espèces que le joueur a capturées au moins une fois. */
export async function caughtSpeciesIds(db: Db, ownerId: string): Promise<Set<number>> {
  const rows = await db
    .select({ speciesId: pokedex.speciesId })
    .from(pokedex)
    .where(and(eq(pokedex.ownerId, ownerId), eq(pokedex.caught, true)));
  return new Set(rows.map((r) => r.speciesId));
}

/** Entrées du Pokédex d'un joueur (espèces vues ou capturées), par numéro. */
export async function listPokedex(db: Db, ownerId: string): Promise<PokedexEntryDto[]> {
  const rows = await db
    .select()
    .from(pokedex)
    .where(eq(pokedex.ownerId, ownerId))
    .orderBy(asc(pokedex.speciesId));
  return rows.map(({ ownerId: _, firstCaughtAt, ...r }) => ({
    ...r,
    firstCaughtAt: firstCaughtAt?.toISOString() ?? null,
  }));
}

/** Formes capturées par un joueur (régionales, Méga, formes naturelles…), par identifiant. */
export async function listPokedexForms(db: Db, ownerId: string): Promise<PokedexFormEntryDto[]> {
  const rows = await db
    .select()
    .from(pokedexForms)
    .where(eq(pokedexForms.ownerId, ownerId))
    .orderBy(asc(pokedexForms.formId));
  return rows.map(({ ownerId: _, firstCaughtAt, ...r }) => ({
    ...r,
    firstCaughtAt: firstCaughtAt.toISOString(),
  }));
}
