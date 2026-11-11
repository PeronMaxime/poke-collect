/**
 * Réglages préparés pour une zone (équipe, Balls, baies, transfert automatique), retenus sur cet
 * appareil à chaque changement, même sans lancer l'expédition.
 */
import { useEffect, useState } from 'react';
import type { BallPlan } from '@poke/game-core';
import { readStoredJson, writeStoredJson } from '../../../lib/storage';
import {
  effectiveAutoTransfer,
  loadGlobalAutoTransfer,
  parseFilter,
} from '../AutoTransferSettings';
import type { ZoneAutoTransfer } from '../AutoTransferSettings';

/** Réglages retenus pour une zone ; chaque champ absent prend sa valeur par défaut. */
interface ZoneSettings {
  team?: string[];
  /** Choix explicites seulement : une catégorie absente prend la Ball par défaut. */
  balls?: Partial<BallPlan>;
  berryItemId?: string | null;
  berryCount?: number;
  /** Sélecteurs par nombre d'IV parfaits affichés (sinon : Ball de « déjà capturé »). */
  showIvBalls?: boolean;
  encounterBerryItemId?: string | null;
  encounterBerryCount?: number;
  /** Transfert automatique : absent = filtre global. */
  autoTransfer?: ZoneAutoTransfer;
}

const settingsKey = (zoneId: string) => `expedition-settings:${zoneId}`;

/** Réglages retenus pour la zone ; vides s'il n'y en a pas. */
export function storedZoneSettings(zoneId: string): ZoneSettings {
  return (readStoredJson(settingsKey(zoneId)) as ZoneSettings | null) ?? {};
}

/** Met à jour une partie des réglages retenus pour la zone. */
export function storeZoneSettings(zoneId: string, patch: ZoneSettings) {
  writeStoredJson(settingsKey(zoneId), { ...storedZoneSettings(zoneId), ...patch });
}

/**
 * Choix du formulaire de départ : Balls par catégorie, baies et transfert automatique. Avec
 * `remember` (le jeu, pas le simulateur), ils reprennent ceux du dernier passage dans la zone et
 * sont retenus à chaque changement ; sans, le transfert automatique est coupé (`autoTransfer`
 * vaut `null`). Ce qui n'est plus dans le sac est écarté par l'appelant, pas ici.
 */
export function useLaunchSettings(zoneId: string, remember: boolean) {
  const [saved] = useState<ZoneSettings>(() => (remember ? storedZoneSettings(zoneId) : {}));
  const [ballChoice, setBallChoice] = useState<Partial<BallPlan>>(saved.balls ?? {});
  // Sélecteurs par nombre d'IV parfaits : masqués, ces Pokémon prennent la Ball de « déjà
  // capturé » ; affichés, chacun a la sienne (par défaut, celle de « déjà capturé »).
  const [showIvBalls, setShowIvBalls] = useState(saved.showIvBalls ?? false);
  const [berryChoice, setBerryId] = useState(saved.berryItemId ?? null);
  const [berryCount, setBerryCount] = useState(saved.berryCount ?? 1);
  const [encounterBerryChoice, setEncounterBerryId] = useState(saved.encounterBerryItemId ?? null);
  const [encounterBerryCount, setEncounterBerryCount] = useState(saved.encounterBerryCount ?? 1);
  // Transfert automatique : filtre global, ou celui retenu pour la zone.
  const [globalAutoTransfer] = useState(loadGlobalAutoTransfer);
  const [zoneAutoTransfer, setZoneAutoTransfer] = useState<ZoneAutoTransfer>(() =>
    saved.autoTransfer?.custom
      ? { custom: true, filter: parseFilter(saved.autoTransfer.filter) }
      : { custom: false },
  );
  useEffect(() => {
    if (!remember) return;
    storeZoneSettings(zoneId, {
      autoTransfer: zoneAutoTransfer,
      balls: ballChoice,
      showIvBalls,
      berryItemId: berryChoice,
      berryCount,
      encounterBerryItemId: encounterBerryChoice,
      encounterBerryCount,
    });
  }, [
    remember,
    zoneId,
    zoneAutoTransfer,
    ballChoice,
    showIvBalls,
    berryChoice,
    berryCount,
    encounterBerryChoice,
    encounterBerryCount,
  ]);
  return {
    ballChoice,
    setBallChoice,
    showIvBalls,
    setShowIvBalls,
    berryChoice,
    setBerryId,
    berryCount,
    setBerryCount,
    encounterBerryChoice,
    setEncounterBerryId,
    encounterBerryCount,
    setEncounterBerryCount,
    globalAutoTransfer,
    zoneAutoTransfer,
    setZoneAutoTransfer,
    autoTransfer: remember ? effectiveAutoTransfer(zoneAutoTransfer, globalAutoTransfer) : null,
  };
}
