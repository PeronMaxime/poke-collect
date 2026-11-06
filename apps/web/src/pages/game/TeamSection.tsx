import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  abilityEffectText,
  activityAbilityEffects,
  applyTeamXp,
  effectiveAbility,
} from '@poke/game-core';
import type { AbilityEnv, GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { Modal, PokemonSprite, ShinyStar } from '../../components/ui';
import { abilityLabel, speciesName } from '../../lib/labels';
import { ActiveAbilities } from './ActiveAbilities';
import { AutoSelectButton } from './TeamPicker';
import { formatXp, usePlayerBonuses } from './XpPreview';

/**
 * Équipe d'une activité (expédition, donjon, combat) : la fiche n'en montre que le
 * récapitulatif (membres, talents, XP gagnée) ; le choix se fait dans un popup (`children`).
 */
export function TeamSection({
  ctx,
  title,
  env,
  members,
  xp,
  maxTeamSize,
  power,
  minPower = 0,
  xpNote,
  errors,
  onAutoSelect,
  children,
}: {
  ctx: GameContext;
  /** Titre du popup. */
  title: string;
  /** Environnement des talents de l'activité ; son équipe = `members`, dans le même ordre. */
  env: AbilityEnv;
  members: readonly PokemonDto[];
  /** XP par membre (estimation ou maximum). */
  xp: number;
  maxTeamSize: number;
  /** PE de l'équipe choisie. */
  power: number;
  /** PE minimale exigée (0 = aucune). */
  minPower?: number;
  /** Texte sous le récapitulatif (« ≈ 120 XP par Pokémon par heure »…). */
  xpNote?: ReactNode;
  /** Règles non respectées par l'équipe, rappelées dans le popup. */
  errors: readonly string[];
  /** Sélection automatique de l'équipe, sans ouvrir le popup (absente = pas de bouton). */
  onAutoSelect?: () => void;
  /** Choix de l'équipe (sélecteur, ordre, attaques…). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Équipe ({members.length} / {maxTeamSize})
          <span
            className={`ml-2 font-medium ${power >= minPower ? 'text-emerald-600' : 'text-red-600'}`}
          >
            PE {power}
            {minPower > 0 && ` / ${minPower}`}
          </span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {onAutoSelect && <AutoSelectButton onClick={onAutoSelect} />}
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            {members.length > 0 ? 'Gérer l’équipe' : 'Choisir l’équipe'}
          </button>
        </div>
      </div>
      <TeamRecap ctx={ctx} env={env} members={members} xp={xp} />
      {members.length > 0 && xpNote && <p className="mt-1 text-xs text-slate-500">{xpNote}</p>}
      <Modal open={open} onClose={() => setOpen(false)} wide>
        <h2 className="text-xl font-bold">{title}</h2>
        {children}
        {members.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Talents actifs</h3>
            <ActiveAbilities
              ctx={ctx}
              env={env}
              members={members}
              className="mt-1 text-xs"
              empty={
                <p className="mt-1 text-xs text-slate-500">Aucun talent de l’équipe n’agit ici.</p>
              }
            />
          </>
        )}
        {members.length > 0 && errors.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-red-600">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
            Valider
          </button>
        </div>
      </Modal>
    </>
  );
}

/**
 * Récapitulatif de l'équipe choisie : chaque membre avec son talent (et ses effets s'il agit
 * ici) et l'XP qu'il gagnera, avec le niveau atteint.
 */
export function TeamRecap({
  ctx,
  env,
  members,
  xp,
}: {
  ctx: GameContext;
  env: AbilityEnv;
  /** Équipe de `env`, dans le même ordre. */
  members: readonly PokemonDto[];
  /** XP par membre. */
  xp: number;
}) {
  const bonuses = usePlayerBonuses(ctx);
  if (members.length === 0) {
    return (
      <p className="mt-2 rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">
        Aucun Pokémon choisi.
      </p>
    );
  }
  const results = applyTeamXp(ctx, members, xp, 0, bonuses);
  const active = activityAbilityEffects(ctx, env);
  return (
    <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {members.map((p, i) => {
        const r = results[i]!;
        const effects = active.filter((a) => a.holder === i).map((a) => a.effect);
        return (
          <li
            key={p.id}
            className={`flex min-w-0 items-center gap-2 rounded-xl border p-1.5 text-xs ${
              effects.length > 0
                ? 'border-emerald-400 dark:border-emerald-600'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <PokemonSprite
              speciesId={p.speciesId}
              formId={p.formId}
              shiny={p.isShiny}
              size={56}
              className="shrink-0"
            />
            <div className="min-w-0">
              <p className="truncate font-medium">
                {speciesName(ctx, p.speciesId, p.formId)} {p.isShiny && <ShinyStar />}
              </p>
              <p
                className={`truncate ${effects.length > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}
                title={effects.length > 0 ? effects.map(abilityEffectText).join(' · ') : undefined}
              >
                {effects.length > 0 && '✦ '}
                {abilityLabel(effectiveAbility(ctx, p))}
              </p>
              <p title={`+${formatXp(r.xpGained)}`}>
                N.{r.levelBefore}
                {r.levelAfter > r.levelBefore ? (
                  <>
                    {' → '}
                    <strong className="text-emerald-600">N.{r.levelAfter}</strong>
                  </>
                ) : r.xpGained === 0 && xp > 0 ? (
                  <span className="text-slate-500"> (max)</span>
                ) : null}
                {r.xpGained > 0 && (
                  <span className="text-slate-500"> · +{formatXp(r.xpGained)}</span>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
