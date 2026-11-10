import { z } from 'zod';
import { unlockConditionSchema } from './unlock';

/**
 * Bâtiments à débloquer : emplacements d'expédition, pensions, couveuses, places du Musée…
 */

/** Bâtiments dont le nombre de places grandit avec la progression. */
export const FACILITIES = [
  {
    id: 'expedition',
    label: 'Emplacements d’expédition',
    unit: 'emplacement d’expédition',
    units: 'emplacements d’expédition',
  },
  { id: 'daycare', label: 'Pensions', unit: 'pension', units: 'pensions' },
  { id: 'incubator', label: 'Couveuses', unit: 'couveuse', units: 'couveuses' },
  {
    id: 'museum',
    label: 'Places du Musée',
    unit: 'place de restauration',
    units: 'places de restauration',
  },
  { id: 'farm', label: 'Parcelles de la ferme', unit: 'parcelle', units: 'parcelles' },
  { id: 'center', label: 'Centres Pokémon', unit: 'Centre Pokémon', units: 'Centres Pokémon' },
] as const;

export type FacilityId = (typeof FACILITIES)[number]['id'];

/** Palier : `amount` emplacements d'expédition, pensions, couveuses, places, parcelles ou Centres en plus quand la condition est remplie. */
export const facilityUnlockSchema = z.object({
  amount: z.int().min(1).max(10),
  unlock: unlockConditionSchema,
});

export type FacilityUnlock = z.infer<typeof facilityUnlockSchema>;

export const facilityUnlocksSchema = z.object({
  expedition: z.array(facilityUnlockSchema).default([]),
  daycare: z.array(facilityUnlockSchema).default([]),
  incubator: z.array(facilityUnlockSchema).default([]),
  museum: z.array(facilityUnlockSchema).default([]),
  farm: z.array(facilityUnlockSchema).default([]),
  center: z.array(facilityUnlockSchema).default([]),
});

export type FacilityUnlocks = z.infer<typeof facilityUnlocksSchema>;
