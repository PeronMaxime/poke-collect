import type { IntegrityCheck } from './context';

/**
 * Emplacements d'expédition promis (récompenses et paliers) au-delà du maximum réglé. Contrôle
 * transversal, fait en dernier.
 */
export function checkExpeditionSlots(check: IntegrityCheck): void {
  const { content, balance, add } = check;
  const rewards = [...content.collections, ...content.quests].map((r) => r.rewards);
  const unreachable =
    balance.expeditions.initialSlots +
    rewards.reduce((sum, r) => sum + r.expeditionSlots, 0) +
    (balance.facilityUnlocks?.expedition ?? []).reduce((sum, step) => sum + step.amount, 0) -
    balance.expeditions.maxSlots;
  if (unreachable > 0) {
    add(
      'warning',
      'balance',
      null,
      `Progression : ${unreachable} emplacement(s) d’expédition au-delà du maximum (sans effet)`,
    );
  }
}
