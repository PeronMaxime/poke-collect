import { KNOWN_TYPES, KNOWN_ABILITIES } from './context';
import type { IntegrityCheck } from './context';

/** Talents : connus de PokéAPI, types cités valides. */
export function checkAbilities(check: IntegrityCheck): void {
  const { content, add } = check;
  for (const ability of content.abilities) {
    if (!KNOWN_ABILITIES.has(ability.id)) add('error', 'ability', ability.id, 'Talent inconnu');
    const usedTypes = ability.effects.flatMap((e) => [
      ...(e.type === 'attractType' ? [e.pokemonType] : []),
      ...e.conditions.flatMap((c) => ('types' in c ? c.types : [])),
    ]);
    for (const t of new Set(usedTypes)) {
      if (!KNOWN_TYPES.has(t)) add('error', 'ability', ability.id, `Type « ${t} » inconnu`);
    }
  }
}
