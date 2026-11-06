import { memberPower } from './abilities';
import type { GameContext } from './context';
import { copiesZoneAffinity } from './expedition';
import type { TeamMember } from './expedition';
import { MAX_MEGAS_PER_TEAM, isMegaForm } from './mega';

/** Règles d'une activité que la sélection automatique respecte. */
export interface AutoTeamRules {
  /** Nombre de Pokémon à choisir (au plus). */
  size: number;
  /** Types en affinité (zone, faiblesses de l'adversaire). */
  affinityTypes: readonly string[];
  /** Types exigés (« 2 Pokémon Eau ») : servis en premier. */
  requiredTypes?: readonly { type: string; count: number }[];
  /** PE minimale : si l'équipe en affinité n'y arrive pas, l'équipe la plus forte est prise. */
  minPower?: number;
  /** Types interdits (règles d'un dresseur). */
  forbiddenTypes?: readonly string[];
  /** Niveau maximal (règles d'un dresseur) ; null = aucun. */
  maxLevel?: number | null;
}

/** Un Pokémon est en affinité s'il a un type de la liste (ou copie l'affinité de la zone). */
export function hasAffinity(
  ctx: GameContext,
  pokemon: Pick<TeamMember, 'speciesId' | 'formId' | 'ability'>,
  affinityTypes: readonly string[],
): boolean {
  if (affinityTypes.length === 0) return false;
  const types = ctx.species(pokemon.speciesId, pokemon.formId)?.types ?? [];
  return types.some((t) => affinityTypes.includes(t)) || copiesZoneAffinity(ctx, pokemon);
}

/**
 * Sélection automatique d'une équipe parmi `candidates` (Pokémon disponibles) : les types
 * requis d'abord, puis les plus forts en affinité, puis les plus forts sans affinité. Un seul
 * Méga-Évolué ; types interdits et niveau trop haut écartés. Renvoie les identifiants, dans
 * l'ordre de l'équipe (affinité puis PE).
 */
export function autoTeam<P extends TeamMember>(
  ctx: GameContext,
  candidates: readonly P[],
  rules: AutoTeamRules,
): string[] {
  const forbidden = new Set(rules.forbiddenTypes ?? []);
  const maxLevel = rules.maxLevel ?? null;
  const pool = candidates
    .map((p) => ({
      p,
      types: ctx.species(p.speciesId, p.formId)?.types ?? [],
      power: memberPower(ctx, p),
      affinity: hasAffinity(ctx, p, rules.affinityTypes),
    }))
    .filter(({ types }) => types.length > 0 && !types.some((t) => forbidden.has(t)))
    .filter(({ p }) => maxLevel === null || p.level <= maxLevel);

  type Entry = (typeof pool)[number];
  const byPower = (a: Entry, b: Entry) => b.power - a.power;
  const byAffinity = (a: Entry, b: Entry) =>
    Number(b.affinity) - Number(a.affinity) || byPower(a, b);

  const pick = (ordered: Entry[]) => {
    const team: Entry[] = [];
    const fits = (e: Entry) =>
      !team.includes(e) &&
      (!isMegaForm(e.p.formId) ||
        team.filter((m) => isMegaForm(m.p.formId)).length < MAX_MEGAS_PER_TEAM);
    // Types requis : le premier qui convient dans l'ordre, jusqu'au compte (sans dépasser la taille).
    for (const r of rules.requiredTypes ?? []) {
      let missing = r.count - team.filter((m) => m.types.includes(r.type)).length;
      for (const e of ordered) {
        if (missing <= 0 || team.length >= rules.size) break;
        if (e.types.includes(r.type) && fits(e)) {
          team.push(e);
          missing--;
        }
      }
    }
    for (const e of ordered) {
      if (team.length >= rules.size) break;
      if (fits(e)) team.push(e);
    }
    return team.sort(byAffinity);
  };

  let team = pick([...pool].sort(byAffinity));
  const minPower = rules.minPower ?? 0;
  const total = (t: Entry[]) => t.reduce((sum, e) => sum + e.power, 0);
  if (minPower > 0 && total(team) < minPower) {
    const strongest = pick([...pool].sort(byPower));
    if (total(strongest) > total(team)) team = strongest;
  }
  return team.map((e) => e.p.id);
}
