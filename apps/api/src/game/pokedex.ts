/**
 * Pokédex d'un joueur : espèces vues et capturées, et formes capturées.
 */
import { asc, eq } from 'drizzle-orm';
import { pokedex, pokedexForms } from '@poke/db';
import type { Db } from '@poke/db';
import type { PokedexEntryDto, PokedexFormEntryDto } from '@poke/shared';

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
