import { simulateDungeon } from './simulation';
import { healReadyAt } from './types';
import type { DungeonCommand, DungeonSetup } from './types';

/**
 * Commande de soin (baie) : vérifiée contre l'état du combat avant d'être enregistrée.
 */

/**
 * Objet de soin utilisable maintenant sur le Pokémon actif : le combat doit continuer, l'objet
 * ne pas être en recharge (`cooldownMs` après sa dernière utilisation), et le Pokémon être
 * debout sans tous ses PV. Renvoie la commande à enregistrer, ou l'erreur.
 */
export function healCommand(
  setup: DungeonSetup,
  commands: readonly DungeonCommand[],
  fledAtMs: number | null,
  atMs: number,
  itemId: string,
  fraction: number,
  cooldownMs = 0,
): { command: DungeonCommand } | { error: 'FINISHED' | 'FULL_HP' | 'MEMBER_KO' | 'COOLDOWN' } {
  const { state } = simulateDungeon(setup, commands, fledAtMs, atMs);
  if (state.outcome !== null) return { error: 'FINISHED' };
  if (healReadyAt(commands, itemId, cooldownMs) > atMs) return { error: 'COOLDOWN' };
  const hp = state.hp[state.active] ?? 0;
  if (hp === 0) return { error: 'MEMBER_KO' };
  if (hp >= setup.team[state.active]!.maxHp) return { error: 'FULL_HP' };
  return { command: { atMs, itemId, heal: fraction } };
}
