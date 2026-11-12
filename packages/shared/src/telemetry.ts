import { z } from 'zod';

/**
 * Télémétrie d'équilibrage (admin).
 */

export const telemetryQuerySchema = z.object({
  /** Période d'observation des combats, expéditions et achats. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/** Répartition d'une durée (en heures) sur les joueurs concernés. */
export interface DurationStats {
  players: number;
  medianHours: number | null;
  p90Hours: number | null;
}

export type TelemetryStepKind =
  'expedition' | 'region' | 'trainer' | 'dungeon' | 'reward' | 'quest';

/** Étape de progression : combien de joueurs l'ont atteinte, en combien de temps (inscription). */
export interface TelemetryStep extends DurationStats {
  kind: TelemetryStepKind;
  id: string;
  label: string;
  /** Part des joueurs (ayant choisi leur starter) qui l'ont atteinte. */
  reachedPercent: number;
}

export interface TelemetryTrainer {
  trainerId: string;
  label: string;
  /** Combats récupérés sur la période, par issue. */
  battles: number;
  wins: number;
  /** Défaites et temps écoulés. */
  losses: number;
  fled: number;
  /** Joueurs qui ont perdu sans jamais gagner (goulet potentiel). */
  stuckPlayers: number;
}

export interface TelemetryZone {
  zoneId: string;
  label: string;
  expeditions: number;
  players: number;
  avgDurationMinutes: number | null;
  encounters: number;
  captures: number;
}

export interface TelemetryDungeon {
  dungeonId: string;
  label: string;
  /** Nom du niveau de difficulté (réglages d'équilibrage). */
  difficulty: string;
  /** Tentatives récupérées sur la période, par issue. */
  runs: number;
  players: number;
  wins: number;
  /** Défaites et temps écoulés. */
  losses: number;
  fled: number;
  /** Méga-Gemmes obtenues sur la période. */
  gems: number;
  /** Joueurs qui ont échoué sans jamais gagner (goulet potentiel). */
  stuckPlayers: number;
}

/** Possession d'une Méga-Gemme : dans les sacs et tenue par un Pokémon (Méga-Évolué). */
export interface TelemetryMegaStone {
  itemId: string;
  label: string;
  /** Joueurs qui en possèdent au moins une (sac ou tenue). */
  owners: number;
  inBags: number;
  held: number;
  /** Total obtenu dans les donjons depuis le lancement. */
  dropped: number;
}

export interface TelemetryQuest {
  questId: string;
  label: string;
  started: number;
  completed: number;
  /** Joueurs actuellement bloqués à chaque étape, et depuis combien de temps. */
  steps: (DurationStats & { index: number; name: string })[];
}

export interface TelemetryResponse {
  generatedAt: string;
  days: number;
  players: {
    total: number;
    withStarter: number;
    new7d: number;
    /** Joueurs ayant lancé une action (expédition, combat, donjon, achat) récemment. */
    active1d: number;
    active7d: number;
  };
  /** Parcours : étapes dans l'ordre du contenu. */
  steps: TelemetryStep[];
  trainers: TelemetryTrainer[];
  zones: TelemetryZone[];
  dungeons: TelemetryDungeon[];
  megaStones: TelemetryMegaStone[];
  quests: TelemetryQuest[];
  /** Joueurs par tranche de Pokédex national capturé (en %). */
  dexDistribution: { label: string; players: number }[];
  economy: {
    /** Poké Dollars gagnés en combat (dresseurs et donjons) sur la période. */
    earned: number;
    /** Poké Dollars dépensés en boutique sur la période. */
    spent: number;
    medianBalance: number | null;
  };
}
