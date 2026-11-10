import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type { ItemStack } from '@poke/content';
import { STAT_NAMES } from '@poke/data';
import type {
  AutoTransferFilter,
  BallPlan,
  CaptureFilter,
  ExpeditionError,
  ExpeditionPace,
  ExpeditionResult,
} from '@poke/game-core';
import { utcOffsetSchema } from './internal';
import type { PokemonDto } from './pokemon';

/**
 * Expéditions : départ, état, réclamation, chaînes et Pokémon fuyards.
 */

/** Ball à lancer pour chaque catégorie de Pokémon rencontré ; null = pas de capture. */
export const ballPlanSchema = z.object({
  new: slugSchema.nullable(),
  shiny: slugSchema.nullable(),
  caught: slugSchema.nullable(),
  /** Déjà capturés avec au moins N IV parfaits ; absent = non réglé. */
  iv1: slugSchema.nullable().optional(),
  iv2: slugSchema.nullable().optional(),
  iv3: slugSchema.nullable().optional(),
  iv4: slugSchema.nullable().optional(),
  iv5: slugSchema.nullable().optional(),
  iv6: slugSchema.nullable().optional(),
});

/** Filtre du transfert automatique (voir `AutoTransferFilter`). */
export const autoTransferFilterSchema = z.object({
  maxPerfectIvs: z.int().min(0).max(STAT_NAMES.length),
}) satisfies z.ZodType<AutoTransferFilter>;

export const startExpeditionInputSchema = z.object({
  zoneId: slugSchema,
  team: z.array(z.uuid()).min(1).max(6),
  /** Balls retirées du sac au fil de l'expédition, à chaque rencontre. */
  balls: ballPlanSchema,
  /** Baie de capture et nombre emporté (absent : une). */
  berryItemId: slugSchema.nullable(),
  berryCount: z.int().positive().optional(),
  /** Baie de rencontres et nombre emporté (absent : une). */
  encounterBerryItemId: slugSchema.nullable().optional(),
  encounterBerryCount: z.int().positive().optional(),
  /**
   * Transfert automatique au retour : captures déjà au Pokédex avec au plus N IV parfaits ;
   * null ou absent = aucun.
   */
  autoTransfer: autoTransferFilterSchema.nullable().optional(),
  /** Heure locale du joueur (talents de jour ou de nuit). */
  utcOffsetMinutes: utcOffsetSchema.optional(),
});

export type StartExpeditionInput = z.infer<typeof startExpeditionInputSchema>;

/** Résultat stocké : chaque Pokémon capturé reçoit son identifiant en base. */
export interface StoredExpeditionResult extends ExpeditionResult {
  encounters: (ExpeditionResult['encounters'][number] & {
    pokemonId?: string;
    /** Capture transférée automatiquement au retour. */
    transferred?: true;
    /** Pokémon échappé ni nouveau, ni chromatique, ni fuyard : résumé, pas affiché. */
    filtered?: true;
  })[];
  /** Espèces capturées pour la première fois. */
  newSpeciesIds: number[];
  /** Formes capturées pour la première fois (absent des expéditions anciennes). */
  newFormIds?: number[];
  /**
   * Captures transférées automatiquement au retour (rencontres marquées `transferred`, sans
   * `pokemonId`) et Bonbons gagnés ; absent = aucun transfert.
   */
  autoTransferred?: { count: number; candies: { lineageId: number; quantity: number }[] };
  /** Objets de quête trouvés pendant l'expédition ; absent = aucun. */
  questItems?: ItemStack[];
}

export interface ExpeditionDto {
  id: string;
  /** Zone explorée ; null pour une expédition légendaire. */
  zoneId: string | null;
  /** Expédition légendaire de cette quête ; null = expédition normale. */
  questId: string | null;
  slotIndex: number;
  team: string[];
  /** Durée minimum tant que l'expédition court, temps réellement passé une fois réclamée. */
  durationMinutes: number;
  ballItemId: string | null;
  balls: number;
  berryItemId: string | null;
  berries: number;
  encounterBerryItemId: string | null;
  encounterBerries: number;
  /** Anciennes expéditions : Pokémon à tenter de capturer ; null = tous. */
  captureFilter: CaptureFilter | null;
  /** Ball de chaque catégorie ; null = ancienne expédition (Balls réservées dans `balls`). */
  ballPlan: BallPlan | null;
  /** Transfert automatique au retour, figé au départ ; null = aucun. */
  autoTransfer: AutoTransferFilter | null;
  /** Balls retirées du sac jusqu'ici, au fil des rencontres. */
  ballsUsed: { itemId: string; quantity: number }[];
  contentVersionId: number;
  startedAt: string;
  /** À partir de cette date, l'expédition peut être arrêtée et récupérée. */
  minEndsAt: string;
  /** Fin de l'expédition : au-delà, le temps ne compte plus. */
  endsAt: string;
  claimedAt: string | null;
  /** Maillon de la chaîne de zone au départ (bonus shiny). */
  shinyChain: number;
  /** Heure locale du joueur au départ (talents de jour ou de nuit) ; null = inconnue. */
  localHour: number | null;
  /** Quêtes des fuyards présents dans la zone au départ (à croiser pendant l'expédition). */
  roamerQuestIds: string[];
  /** Fuyards déjà croisés pendant l'expédition (l'issue de la capture reste secrète). */
  roamersMet: string[];
  /**
   * Rythme des rencontres et du butin, calculé par le serveur (contenu et équipe du départ) :
   * le client en tire le nombre exact de rencontres. null = expédition légendaire ou terminée.
   */
  pace: ExpeditionPace | null;
  result: StoredExpeditionResult | null;
}

/** Pokémon fuyard en fuite et la zone où il se cache jusqu'à l'heure pleine suivante. */
export interface RoamerDto {
  questId: string;
  speciesId: number;
  formId: number | null;
  zoneId: string;
  /** Chances (%) que chaque rencontre de la zone soit lui. */
  encounterChance: number;
  movesAt: string;
}

/** Chaîne de zone en cours : maillon qu'aurait une expédition lancée maintenant. */
export interface ShinyChainDto {
  zoneId: string;
  chain: number;
  /** Date où la chaîne retombe à 0 faute de relance ; null si une expédition est en cours. */
  expiresAt: string | null;
}

export interface ExpeditionsResponse {
  slots: number;
  /** Heure du serveur, pour caler les comptes à rebours du client. */
  serverTime: string;
  active: ExpeditionDto[];
  /** Chaînes de zone actives (les zones absentes repartent de 0). */
  chains: ShinyChainDto[];
  /** Zones mises en favori, dans l'ordre où elles ont été ajoutées. */
  favoriteZoneIds: string[];
  /** Pokémon fuyards en fuite et leur zone actuelle. */
  roamers: RoamerDto[];
}

export const favoriteZoneInputSchema = z.object({ favorite: z.boolean() });

export type FavoriteZoneInput = z.infer<typeof favoriteZoneInputSchema>;

export interface ClaimExpeditionResponse {
  expedition: ExpeditionDto;
  captured: PokemonDto[];
}

export interface ExpeditionTeamErrorBody {
  error: 'TEAM_INVALID';
  errors: ExpeditionError[];
}
