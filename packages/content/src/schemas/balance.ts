import { z } from 'zod';
import { combatSettingsSchema, dungeonSettingsSchema } from './combat';
import { itemStackSchema, slugSchema } from './common';
import { facilityUnlocksSchema } from './facilities';
import { DEFAULT_GUILD_SETTINGS, guildSettingsSchema } from './guilds';
import { probabilitySchema } from './internal';
import { bagSettingsSchema, menuSettingsSchema, tabUnlocksSchema } from './menu';
import { expeditionCompletionSchema } from './rewards';

/**
 * Équilibrage : tous les réglages globaux du jeu (`content.balance`).
 */

/** Combats contre les légendaires des quêtes (le combat suit `combat`) et fuyards. */
export const legendarySettingsSchema = z.object({
  /** Délai avant de retenter le combat après une tentative sans capture (défaite, fuite, Ball ratée). */
  retryCooldownMinutes: z.int().min(0),
  /** XP par membre = XP du légendaire vaincu × multiplicateur. */
  xpMultiplier: z.number().min(0),
  /** Multiplicateur de la chance de capture d'un fuyard (expéditions). */
  roamerCaptureMultiplier: z.number().min(1).max(100),
});

export type LegendarySettings = z.infer<typeof legendarySettingsSchema>;

export const DEFAULT_LEGENDARY_SETTINGS: LegendarySettings = {
  retryCooldownMinutes: 60,
  xpMultiplier: 1,
  roamerCaptureMultiplier: 3,
};

export const balanceSettingsSchema = z.object({
  expeditions: z.object({
    initialSlots: z.int().min(1).max(6),
    maxSlots: z.int().min(1).max(9),
    maxTeamSize: z.int().min(1).max(6),
    /** Durée au-delà de laquelle une expédition s'arrête d'elle-même. */
    maxDurationMinutes: z.int().positive(),
    /** Une rencontre toutes les N minutes pendant la première heure. */
    encounterIntervalMinutes: z.number().positive(),
    /** Minutes ajoutées à cet intervalle à chaque heure passée (par palier) ; 0 = rythme constant. */
    encounterIntervalGrowthMinutes: z.number().min(0).default(0),
    /** Un tirage de butin toutes les N minutes. */
    lootIntervalMinutes: z.number().positive(),
    /** Temps d'effet d'une baie emportée (rencontres ou capture). */
    berryDurationMinutes: z.number().positive(),
  }),
  capture: z.object({
    /** Multiplicateur global de la probabilité de capture. */
    globalMultiplier: z.number().positive(),
    /** PV restants supposés du Pokémon sauvage (1 = pleine santé), comme dans la formule officielle. */
    assumedHpFraction: z.number().min(0).max(1),
    /** Bonus de capture par membre de l'équipe ayant un type en affinité avec la zone. */
    affinityBonusPerPokemon: z.number().min(0),
    hiddenAbilityChance: probabilitySchema,
  }),
  shiny: z.object({
    /** Taux de base = 1 / baseRateDenominator (rencontres et éclosions). */
    baseRateDenominator: z.int().min(1),
    /**
     * Chaîne de zone : bonus par expédition relancée de suite dans la même zone
     * (0.25 = +25 % par maillon), plafonné par `chainMaxMultiplier`.
     */
    chainBonusPerExpedition: z.number().min(0),
    chainMaxMultiplier: z.number().min(1),
    /** Délai pour relancer la zone après avoir récupéré l'expédition précédente. */
    chainWindowMinutes: z.int().min(1),
    /**
     * Maillons à atteindre pour garantir des IV parfaits aux Pokémon sauvages de la zone :
     * le n-ième palier (ordre croissant) garantit n IV à 31.
     */
    chainPerfectIvThresholds: z
      .array(z.int().positive())
      .max(6, 'Six paliers au plus (un par statistique)')
      .refine(
        (t) => t.every((v, i) => i === 0 || v > t[i - 1]!),
        'Paliers croissants et distincts',
      ),
    /** Élevage : parents d'origines différentes (régions de capture), comme la méthode Masuda. */
    masudaMultiplier: z.number().min(1),
  }),
  pity: z.object({
    /** Bonus de poids de rencontre par échec (0.05 = +5 %). */
    weightBonusPerMiss: z.number().min(0),
    maxMultiplier: z.number().min(1),
  }),
  xp: z.object({
    /** XP par rencontre = XP de base de l'espèce × niveau / 7 × multiplicateur. */
    multiplier: z.number().min(0),
    happinessPerExpedition: z.int().min(0).max(255),
  }),
  breeding: z.object({
    /** Temps d'éclosion = cycles d'éclosion de l'espèce (`hatch_counter`) × cette durée. */
    hatchMinutesPerCounter: z.number().positive(),
    /** Un couple en pension pond un œuf toutes les `eggMinutes` minutes. */
    eggMinutes: z.number().positive(),
    /** Places des couveuses au départ (6 par couveuse, + `facilityUnlocks`). */
    maxEggs: z.int().min(1).max(30),
    /** Œufs en attente dans une pension au maximum : pleine, elle arrête de pondre. */
    pensionMaxEggs: z.int().min(1).max(50),
    /** XP gagnée par heure par chaque parent en pension (reçue au retrait). */
    parentXpPerHour: z.number().min(0),
    /** IV transmis par les parents sans objet (3 dans les jeux récents). */
    inheritedIvCount: z.int().min(0).max(6),
    /** Chance de transmettre le talent caché de la mère (ou du parent non Métamorph). */
    hiddenAbilityInheritChance: probabilitySchema,
    eggLevel: z.int().min(1).max(100),
  }),
  transfer: z.object({
    /** Bonbons de lignée reçus par Pokémon transféré. */
    candiesPerPokemon: z.int().min(0),
    /** Bonus pour un Pokémon shiny (s'ajoute). */
    shinyBonusCandies: z.int().min(0),
    /**
     * Bonbons de lignée pour passer un niveau : `candiesPerLevelStart` au niveau 1, puis en ligne
     * droite jusqu'à `candiesPerLevelEnd` au niveau 99. Un Bonbon donne 1/N du niveau en cours.
     */
    candiesPerLevelStart: z.int().min(1),
    candiesPerLevelEnd: z.int().min(1),
  }),
  daycare: z.object({
    /** Pensions au départ (+ récompenses et `facilityUnlocks`, sans maximum). */
    initialSlots: z.int().min(0),
  }),
  museum: z.object({
    /** Fossiles en cours de restauration au Musée en même temps, au départ (+ `facilityUnlocks`). */
    slots: z.int().min(1),
  }),
  /** Ferme à baies ; absent = toutes les parcelles du champ ouvertes. */
  farm: z
    .object({
      /** Parcelles ouvertes au départ (+ `facilityUnlocks`). */
      initialPlots: z.int().min(0),
    })
    .optional(),
  /** Centre Pokémon : les Pokémon mis K.O. y sont soignés. */
  center: z.object({
    /** Pokémon en soins en même temps, au départ (6 par Centre, + `facilityUnlocks`). */
    slots: z.int().min(1),
    /** Durée des soins (talents compris : Médic Nature, Cœur Soin…). */
    healMinutes: z.int().min(1),
  }),
  /** Combats de dresseurs (le combat suit `combat`). */
  battles: z.object({
    maxTeamSize: z.int().min(1).max(6),
    /** IV des Pokémon des dresseurs quand l'admin n'en fixe pas. */
    defaultTrainerIv: z.int().min(0).max(31),
    /** Temps de recharge d'un dresseur répétable après chaque combat (surchargeable). */
    cooldownMinutes: z.int().min(0),
    /** XP par membre = Σ (XP de base × niveau / 7) des Pokémon adverses vaincus × multiplicateur. */
    xpMultiplier: z.number().min(0),
    happinessOnWin: z.int().min(-255).max(255),
    happinessOnLoss: z.int().min(-255).max(255),
  }),
  /** Combats contre les légendaires des quêtes et capture des fuyards. */
  legendary: legendarySettingsSchema.default(DEFAULT_LEGENDARY_SETTINGS),
  /** Réglages communs aux combats en temps réel (donjons et dresseurs). */
  combat: combatSettingsSchema,
  dungeons: dungeonSettingsSchema,
  evolution: z.object({
    /** Objet qui remplace l'échange (Câble Link) ; null = évolutions par échange impossibles. */
    tradeItemId: slugSchema.nullable(),
    /** Heure locale du joueur (0 à 23) où commence le jour, puis la nuit. */
    dayStartHour: z.int().min(0).max(23),
    nightStartHour: z.int().min(0).max(23),
  }),
  newPlayer: z.object({
    starterLevel: z.int().min(1).max(100),
    startingCurrency: z.int().min(0),
    startingInventory: z.array(itemStackSchema),
  }),
  /** Guildes : création, membres, quêtes quotidiennes et hebdomadaires, coffres. */
  guilds: guildSettingsSchema.default(DEFAULT_GUILD_SETTINGS),
  /** Menu du jeu ; absent = `DEFAULT_MENU_GROUPS`. */
  menu: menuSettingsSchema.optional(),
  /** Rangement du Sac en onglets et rubriques ; absent = `DEFAULT_BAG_TABS`. */
  bag: bagSettingsSchema.optional(),
  /** Déblocage des onglets du menu ; absent = tous ouverts. */
  tabUnlocks: tabUnlocksSchema.optional(),
  /** Pensions, places du Musée, parcelles et Centres en plus selon la progression ; absent = aucun. */
  facilityUnlocks: facilityUnlocksSchema.optional(),
  /** Récompenses de complétion des expéditions ; absent = aucune. */
  expeditionCompletions: z
    .array(expeditionCompletionSchema)
    .refine((list) => new Set(list.map((c) => c.id)).size === list.length, 'Identifiant en double')
    .optional(),
});

export type BalanceSettings = z.infer<typeof balanceSettingsSchema>;
