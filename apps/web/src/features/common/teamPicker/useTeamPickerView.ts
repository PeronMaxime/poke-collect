/**
 * État de la fenêtre de choix d'équipe : ce que la boîte et la colonne de l'équipe affichent à partir
 * du choix en cours (`useTeamPicker`) et des règles de l'activité.
 */
import { useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  abilityEffectText,
  activityAbilityEffects,
  dungeonTypeEffectiveness,
  possibleAbilityEffects,
} from '@poke/game-core';
import type { AbilityEnv, DungeonMove, ExpeditionSite, GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import type { CombatTarget } from '../CombatTeamOrder';
import { megaLocked } from './filters';
import type { useTeamPicker } from './useTeamPicker';
import { teamConditions, teamStatus } from './conditions';

/** Combat : ordre d'entrée et attaque de chaque Pokémon, réglés dans la colonne de l'équipe. */
interface CombatSetup {
  moves: Readonly<Record<string, DungeonMove>>;
  setMoves: Dispatch<SetStateAction<Record<string, DungeonMove>>>;
  /** Adversaires contre lesquels l'efficacité des attaques est affichée. */
  targets: readonly CombatTarget[];
}

/** Meilleure efficacité des types d'un Pokémon contre l'un des adversaires (null sans adversaire). */
function bestEffectiveness(types: readonly string[], targets: readonly CombatTarget[]) {
  if (targets.length === 0) return null;
  return Math.max(
    ...types.flatMap((t) => targets.map((target) => dungeonTypeEffectiveness(t, target.types))),
  );
}

/** Ce que reçoit le choix d'équipe. */
export interface TeamPickerProps {
  ctx: GameContext;
  zone: ExpeditionSite;
  picker: ReturnType<typeof useTeamPicker>;
  /** PE de l'équipe choisie. */
  power: number;
  /** Taille maximale (par défaut, celle des expéditions). */
  maxTeamSize?: number;
  /** Propose le tri par statistique et les statistiques au survol (combats, où elles comptent). */
  statSort?: boolean;
  /** Activité de l'équipe : talents qui y agiraient ; son équipe = les membres choisis. */
  abilityEnv: AbilityEnv;
  /** Règles non respectées par l'équipe choisie. */
  errors: readonly string[];
  /** Bouton « Valider ». */
  onDone: () => void;
  /** Combat : ordre d'entrée et attaques dans les cases de l'équipe. */
  combat?: CombatSetup;
  /** Légende du bord vert (Pokémon en affinité). */
  affinityHint?: string;
  /** Contenu ajouté sous la grille (PC fictif du simulateur de l'admin). */
  extra?: ReactNode;
}

/** Tout ce qu'affichent les pièces du choix d'équipe. */
export type TeamPickerModel = ReturnType<typeof useTeamPickerView>;

/**
 * Boîte filtrée (talents actifs, Pokémon hors des règles grisés et mis en fin de liste), talents
 * de l'équipe qui agissent ici et conditions de départ.
 */
export function useTeamPickerView({
  ctx,
  zone,
  picker,
  power,
  maxTeamSize = ctx.balance.expeditions.maxTeamSize,
  statSort = false,
  abilityEnv,
  errors,
  onDone,
  combat,
  affinityHint = 'En affinité avec la zone',
  extra,
}: TeamPickerProps) {
  const { team, setTeam, activeFilters, resetFilters, abilityOnly, members, limits } = picker;
  const candidates = picker.available;
  const [view, setView] = useState<'box' | 'team'>('box');
  const [hideBlocked, setHideBlocked] = useState(false);
  const region = zone.regionId ? ctx.region(zone.regionId) : undefined;
  const from = region ? ` de ${region.name}` : '';
  const forbidden = new Set(limits.forbiddenTypes ?? []);
  const maxLevel = limits.maxLevel ?? null;
  const hasLimits = maxLevel !== null || forbidden.size > 0;

  const withInfo = candidates.map((c) => {
    const effects = possibleAbilityEffects(ctx, abilityEnv, c.p);
    const chosen = team.includes(c.p.id);
    // Hors des règles de l'activité (niveau, types) : grisé, sauf s'il est déjà choisi.
    const blocked = chosen
      ? null
      : maxLevel !== null && c.p.level > maxLevel
        ? `Niveau ${c.p.level} : ${maxLevel} maximum ici`
        : c.species.types.some((t) => forbidden.has(t))
          ? 'Type interdit ici'
          : null;
    return {
      ...c,
      activeAbility: effects.length > 0,
      // Seulement les effets qui joueraient ici.
      abilityText: effects.map(abilityEffectText).join(' · '),
      blocked,
      effectiveness: combat ? bestEffectiveness(c.species.types, combat.targets) : null,
    };
  });
  const available = withInfo
    .filter(
      (c) =>
        (!abilityOnly || c.activeAbility || team.includes(c.p.id)) && !(hideBlocked && c.blocked),
    )
    // Les Pokémon hors des règles passent en fin de liste (tri stable : l'ordre choisi reste).
    .sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked));
  const filterCount = activeFilters + Number(hideBlocked);
  const resetAll = () => {
    resetFilters();
    setHideBlocked(false);
  };

  function toggle(p: PokemonDto) {
    if (megaLocked(p, members)) return;
    setTeam((t) =>
      t.includes(p.id) ? t.filter((id) => id !== p.id) : t.length < maxTeamSize ? [...t, p.id] : t,
    );
  }
  const remove = (id: string) => setTeam((t) => t.filter((m) => m !== id));

  // Talents de l'équipe qui agissent ici, par membre.
  const active = activityAbilityEffects(ctx, abilityEnv);
  const effectsOf = (i: number) => active.filter((a) => a.holder === i).map((a) => a.effect);
  const holders = new Set(active.map((a) => a.holder)).size;

  return {
    ...picker,
    ctx,
    zone,
    power,
    maxTeamSize,
    statSort,
    combat,
    affinityHint,
    extra,
    onDone,
    view,
    setView,
    hideBlocked,
    setHideBlocked,
    region,
    from,
    forbidden,
    maxLevel,
    hasLimits,
    available,
    filterCount,
    resetAll,
    toggle,
    remove,
    active,
    effectsOf,
    holders,
    // Conditions remplies (✓), puis règles non respectées (✗, textes de l'activité).
    met: teamConditions(ctx, zone, members, power, maxLevel, forbidden),
    failed: members.length > 0 ? errors : [],
    status: teamStatus(members.length, errors),
    teamTitle: combat ? 'Ordre d’entrée' : 'Ton équipe',
  };
}
