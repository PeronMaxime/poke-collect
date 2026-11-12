/**
 * Les combats : dresseurs, légendaires et donjons.
 */
import { utcOffsetMinutes } from './clock';
import { useQuery } from '@tanstack/react-query';
import type {
  BattleDto,
  BattlesResponse,
  DungeonRunDto,
  DungeonsResponse,
  LegendaryBattleDto,
  LegendaryBattlesResponse,
  LegendaryCaptureResponse,
  StartBattleInput,
  StartDungeonInput,
  StartLegendaryBattleInput,
} from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/** Combats de dresseurs : celui en cours, le dernier réglé et le bilan contre chaque dresseur. */
export const useBattles = () =>
  useQuery({ queryKey: keys.battles, queryFn: () => api<BattlesResponse>('/api/battles') });

/** Combat légendaire en cours, dernier combat réglé et état de chaque légendaire à combattre. */
export const useLegendaryBattles = () =>
  useQuery({
    queryKey: keys.legendaryBattles,
    queryFn: () => api<LegendaryBattlesResponse>('/api/legendary-battles'),
  });

/** Donjon en cours, dernière tentative et bilan de chaque donjon. */
export const useDungeons = () =>
  useQuery({ queryKey: keys.dungeons, queryFn: () => api<DungeonsResponse>('/api/dungeons') });

// --- Requêtes d'action ---------------------------------------------------------------------

/** Lance un combat contre un dresseur. */
export const startBattle = (input: StartBattleInput) =>
  api<BattleDto>('/api/battles', {
    method: 'POST',
    json: { ...input, utcOffsetMinutes: utcOffsetMinutes() },
  });

/** Lance un donjon. */
export const startDungeon = (input: StartDungeonInput) =>
  api<DungeonRunDto>('/api/dungeons', {
    method: 'POST',
    json: { ...input, utcOffsetMinutes: utcOffsetMinutes() },
  });

/** Lance le combat légendaire d'une quête. */
export const startLegendaryBattle = (questId: string, input: StartLegendaryBattleInput) =>
  api<LegendaryBattleDto>(`/api/quests/${questId}/battle`, {
    method: 'POST',
    json: { ...input, utcOffsetMinutes: utcOffsetMinutes() },
  });

/** Lance une Ball sur le légendaire vaincu. */
export const captureLegendary = (battleId: string, ballItemId: string) =>
  api<LegendaryCaptureResponse>(`/api/legendary-battles/${battleId}/capture`, {
    method: 'POST',
    json: { ballItemId },
  });

/** Marque comme vu le résultat d'un combat réglé pendant l'absence du joueur. */
export const markBattleSeen = (id: string) => api(`/api/battles/${id}/seen`, { method: 'POST' });

/** Marque comme vu le résultat d'un donjon réglé pendant l'absence du joueur. */
export const markDungeonSeen = (id: string) => api(`/api/dungeons/${id}/seen`, { method: 'POST' });

/**
 * Les trois familles de combats en temps réel partagent le même écran et les mêmes ordres
 * (`sendCombatOrder`, `endCombat`) : seule la racine de leurs routes change.
 */
export const COMBAT_API = {
  battles: '/api/battles',
  dungeons: '/api/dungeons',
  legendary: '/api/legendary-battles',
} as const;
/** Chemin de base de l'une des trois familles de combats. */
export type CombatApi = (typeof COMBAT_API)[keyof typeof COMBAT_API];

/** Ordre donné pendant un combat : changer de Pokémon (`switch`) ou utiliser un objet (`item`). */
export const sendCombatOrder = <R>(
  base: CombatApi,
  runId: string,
  order: 'switch' | 'item',
  input: object,
) => api<R>(`${base}/${runId}/${order}`, { method: 'POST', json: input });

/** Fin d'un combat : en réclamer le résultat (`claim`) ou fuir (`flee`). */
export const endCombat = <C>(base: CombatApi, runId: string, how: 'claim' | 'flee') =>
  api<C>(`${base}/${runId}/${how}`, { method: 'POST' });
