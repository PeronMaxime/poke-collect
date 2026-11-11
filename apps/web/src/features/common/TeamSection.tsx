import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  abilityEffectText,
  activityAbilityEffects,
  applyTeamXp,
  effectiveAbility,
} from '@poke/game-core';
import type { AbilityEnv, ExpeditionSite, GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { Modal, PokemonSprite, ShinyStar, TypeBadge } from '../../components/ui';
import { abilityLabel, speciesName } from '../../lib/labels';
import { CrossIcon, FULL_DIALOG_CLASS } from './dialogParts';
import { AutoSelectButton } from './teamPicker/filters';
import { formatXp, usePlayerBonuses } from './XpPreview';
import { BANNER_LABEL } from './zoneBanner';

/**
 * Équipe d'une activité (donjon, combat) : la fiche n'en montre que le récapitulatif (membres,
 * talents, XP gagnée) ; le choix se fait dans une grande fenêtre. `children` reçoit de quoi la
 * fermer (bouton « Valider » du sélecteur) ; `header`, ce qui reste visible pendant le choix
 * (adversaires, règles).
 */
export function TeamSection({
  ctx,
  title,
  header,
  env,
  members,
  xp,
  maxTeamSize,
  power,
  minPower = 0,
  xpNote,
  onAutoSelect,
  children,
}: {
  ctx: GameContext;
  /** Titre de la fenêtre du choix. */
  title: string;
  /** En-tête de la fenêtre du choix, après le titre. */
  header?: ReactNode;
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
  /** Sélection automatique de l'équipe, sans ouvrir la fenêtre (absente = pas de bouton). */
  onAutoSelect?: () => void;
  /** Choix de l'équipe (sélecteur), avec de quoi fermer la fenêtre. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
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
      <TeamPickerDialog open={open} onClose={close} title={title} header={header}>
        {children(close)}
      </TeamPickerDialog>
    </>
  );
}

/**
 * Grande fenêtre du choix de l'équipe : titre, `header` (règles, adversaires…) et fermeture en
 * haut, puis le sélecteur (`children`, un `TeamPicker`), qui remplit le reste.
 */
export function TeamPickerDialog({
  open,
  onClose,
  title,
  header,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} wide="xl" className={FULL_DIALOG_CLASS}>
      <header className="flex shrink-0 items-start gap-2 border-b-[3px] border-ink px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2 className={`${BANNER_LABEL} truncate uppercase sm:text-xs`}>{title}</h2>
          {header}
        </div>
        <button
          type="button"
          className="btn-ghost shrink-0 px-2.5 py-2"
          aria-label="Fermer"
          onClick={onClose}
        >
          <CrossIcon />
        </button>
      </header>
      {children}
    </Modal>
  );
}

/** En-tête du choix de l'équipe d'un lieu : PE minimale et types en affinité. */
export function SiteChips({ site }: { site: ExpeditionSite }) {
  return (
    <>
      {site.minPower > 0 && <span className={BANNER_LABEL}>PE ≥ {site.minPower}</span>}
      {site.affinityTypes.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
          Affinité
          {site.affinityTypes.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </span>
      )}
    </>
  );
}

/**
 * Récapitulatif de l'équipe choisie : chaque membre avec son talent (et ses effets s'il agit
 * ici) et l'XP qu'il gagnera, avec le niveau atteint.
 */
function TeamRecap({
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

/**
 * Équipe en cases (lancement d'expédition) : chaque membre avec son niveau après l'XP prévue et
 * son talent (en vert s'il agit ici), puis les places libres. Toucher une case ouvre le choix.
 * Sur un écran étroit, seuls les sprites restent.
 */
export function TeamSlots({
  ctx,
  env,
  members,
  xp,
  maxTeamSize,
  onOpen,
}: {
  ctx: GameContext;
  /** Environnement des talents ; son équipe = `members`, dans le même ordre. */
  env: AbilityEnv;
  members: readonly PokemonDto[];
  /** XP par membre. */
  xp: number;
  maxTeamSize: number;
  onOpen: () => void;
}) {
  const bonuses = usePlayerBonuses(ctx);
  const results = applyTeamXp(ctx, members, xp, 0, bonuses);
  const active = activityAbilityEffects(ctx, env);
  const free = Math.max(0, maxTeamSize - members.length);
  return (
    <ul className="grid grid-cols-6 gap-1.5 sm:gap-2">
      {members.map((p, i) => {
        const r = results[i]!;
        const effects = active.filter((a) => a.holder === i).map((a) => a.effect);
        const name = speciesName(ctx, p.speciesId, p.formId);
        const ability = abilityLabel(effectiveAbility(ctx, p));
        return (
          <li key={p.id} className="min-w-0">
            <button
              type="button"
              onClick={onOpen}
              className="flex w-full min-w-0 flex-col items-center gap-0.5 text-center"
              title={
                effects.length > 0
                  ? `${name} · ${ability} : ${effects.map(abilityEffectText).join(' · ')}`
                  : `${name} · ${ability}`
              }
            >
              <span
                className={`sprite-well relative aspect-square w-full max-w-20 ${p.isShiny ? 'shiny-well' : ''} ${
                  effects.length > 0 ? 'border-emerald-500 dark:border-emerald-400' : ''
                }`}
              >
                <PokemonSprite
                  speciesId={p.speciesId}
                  formId={p.formId}
                  shiny={p.isShiny}
                  size={64}
                  className="h-auto w-[85%]"
                  alt={name}
                />
              </span>
              <span className="hidden w-full truncate text-xs font-medium sm:block">
                {name} {p.isShiny && <ShinyStar />}
              </span>
              <span className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
                N.{r.levelBefore}
                {r.levelAfter > r.levelBefore && (
                  <>
                    {' → '}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {r.levelAfter}
                    </strong>
                  </>
                )}
                {r.xpGained === 0 && xp > 0 && ' (max)'}
              </span>
              <span
                className={`hidden w-full truncate text-xs sm:block ${
                  effects.length > 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {effects.length > 0 && '✦ '}
                {ability}
              </span>
            </button>
          </li>
        );
      })}
      {Array.from({ length: free }, (_, i) => (
        <li key={`free-${i}`} className="flex min-w-0 flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={onOpen}
            aria-label="Ajouter un Pokémon"
            className="grid aspect-square w-full max-w-20 place-items-center rounded-md border-2 border-dashed border-well-line font-pixel text-base text-slate-500 hover:border-slate-500 dark:text-slate-400"
          >
            +
          </button>
          <span className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">Libre</span>
        </li>
      ))}
    </ul>
  );
}
