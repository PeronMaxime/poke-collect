import { useQuery } from '@tanstack/react-query';
import type { BattlesResponse, LegendaryBattlesResponse, DungeonsResponse } from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * Les combats : dresseurs, légendaires et donjons.
 */

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
