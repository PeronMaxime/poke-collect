import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type { BreedingError } from '@poke/game-core';
import type { PokemonDto } from './pokemon';

/**
 * Pension, œufs et couveuses.
 */

export const depositDaycareInputSchema = z.object({
  parentAId: z.uuid(),
  parentBId: z.uuid(),
  heldItemAId: slugSchema.nullable(),
  heldItemBId: slugSchema.nullable(),
  /** Pension choisie ; par défaut, la première libre. */
  slotIndex: z.int().min(0).max(999).optional(),
});

export type DepositDaycareInput = z.infer<typeof depositDaycareInputSchema>;

/** Un parent déposé seul dans une pension (à la place de celui qui y était, s'il y en a un). */
export const setDaycareParentInputSchema = z.object({
  pokemonId: z.uuid(),
  heldItemId: slugSchema.nullable().default(null),
});

export type SetDaycareParentInput = z.infer<typeof setDaycareParentInputSchema>;

/** Ramasser (`bag`) range les œufs dans le sac ; couver (`incubator`) remplit la couveuse d'abord. */
export const collectEggsInputSchema = z.object({
  to: z.enum(['bag', 'incubator']).default('incubator'),
});

export type CollectEggsInput = z.infer<typeof collectEggsInputSchema>;

/** Œufs du sac à mettre en couveuse (autant que de places libres, dans l'ordre donné). */
export const incubateEggsInputSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
});

export type IncubateEggsInput = z.infer<typeof incubateEggsInputSchema>;

export interface DaycareDto {
  slotIndex: number;
  parentAId: string | null;
  parentBId: string | null;
  heldItemAId: string | null;
  heldItemBId: string | null;
  /** Début du cycle de ponte en cours. */
  startedAt: string;
  /** Dépôt de chaque parent : il gagne de l'XP depuis ce moment (reçue au retrait). */
  parentADepositedAt: string | null;
  parentBDepositedAt: string | null;
  /** Espèce des œufs pondus (null si un parent a disparu). */
  eggSpeciesId: number | null;
  /** Forme des œufs pondus (régionale, héritée de la mère). */
  eggFormId: number | null;
  /** Minutes entre deux œufs (talents des parents et de l'assistant compris). */
  eggMinutes: number;
  /** Les parents peuvent s'accoupler. Sinon la pension ne pond pas : ils ne font que gagner de l'XP. */
  breeds: boolean;
}

/** Un œuf en couveuse ne révèle rien de son contenu avant l'éclosion, à part l'espèce. */
export interface EggDto {
  id: string;
  speciesId: number;
  formId: number | null;
  /** Place de la couveuse. */
  slotIndex: number;
  /** Mise en couveuse. */
  incubatedAt: string;
  hatchAt: string;
}

/** Œuf rangé dans le sac, en attente d'une place en couveuse. */
export interface BagEggDto {
  id: string;
  speciesId: number;
  formId: number | null;
  laidAt: string;
}

export interface DaycareResponse {
  slots: number;
  maxEggs: number;
  /** Œufs éclos depuis le début (conditions de déblocage). */
  eggsHatched: number;
  serverTime: string;
  pensions: DaycareDto[];
  /** Œufs en couveuse. */
  eggs: EggDto[];
  /** Œufs rangés dans le sac, du plus ancien au plus récent. */
  bagEggs: BagEggDto[];
}

/** XP gagnée par un parent pendant son séjour en pension (reçue au retrait). */
export interface DaycareXpDto {
  pokemonId: string;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
}

export interface CollectEggsResponse {
  /** Œufs mis en couveuse. */
  incubated: EggDto[];
  /** Œufs rangés dans le sac (ramassés, ou faute de place dans la couveuse). */
  bagged: number;
  /** Retrait de parents : XP gagnée par chacun. */
  parents?: DaycareXpDto[];
}

export interface IncubateEggsResponse {
  incubated: EggDto[];
}

export interface HatchEggsResponse {
  hatched: PokemonDto[];
  /** Espèces obtenues pour la première fois. */
  newSpeciesIds: number[];
  /** Formes (régionales, Méga…) obtenues pour la première fois. */
  newFormIds: number[];
}

export interface DaycareErrorBody {
  error: 'INCOMPATIBLE_PARENTS';
  errors: BreedingError[];
}
