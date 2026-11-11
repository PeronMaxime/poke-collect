/**
 * Section « Équipe » du formulaire de départ en expédition.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { TypeBadge } from '../../../components/ui';
import { AutoSelectButton } from '../../common/TeamPicker';
import { SiteChips, TeamPickerDialog, TeamSlots } from '../../common/TeamSection';
import { formatXp } from '../../common/XpPreview';
import { PowerGauge, SECTION_TITLE } from '../../common/dialogParts';
import type { AbilityEnv } from '@poke/game-core';
import { teamErrorText } from './preview';
import type { LaunchModel } from './useLaunchExpedition';

/** Ce que reçoit le choix de l'équipe du formulaire de départ. */
export interface TeamChoice {
  power: number;
  env: AbilityEnv;
  errors: string[];
  onDone: () => void;
}

/**
 * Équipe choisie, sa PE face à celle qu'exige la zone, les règles non respectées, et la fenêtre du
 * choix.
 */
export function LaunchTeam({
  launch,
  renderTeam,
  onAutoTeam,
}: {
  launch: LaunchModel;
  /** Choix de l'équipe (un `TeamPicker`) ; `onDone` ferme la fenêtre du choix. */
  renderTeam: (team: TeamChoice) => ReactNode;
  /** Sélection automatique de l'équipe (bouton à côté de « Gérer »). */
  onAutoTeam?: () => void;
}) {
  const { ctx, zone, team, members, per, maxTeamSize, env, check, powerOk, xp, activeAbilities } =
    launch;
  const [teamOpen, setTeamOpen] = useState(false);
  return (
    <section className="tile p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className={SECTION_TITLE}>
          Équipe {members.length} / {maxTeamSize}
        </h3>
        <PowerGauge
          power={check.power}
          minPower={zone.minPower}
          className="order-2 w-full sm:order-none sm:w-auto sm:min-w-16 sm:flex-1"
        />
        <span
          className={`order-1 ml-auto text-sm font-bold whitespace-nowrap sm:order-none sm:ml-0 ${
            powerOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          PE {check.power}
          {zone.minPower > 0 && ` / ${zone.minPower}`}
        </span>
        <div className="order-3 grid w-full grid-cols-2 gap-2 sm:order-none sm:flex sm:w-auto">
          {onAutoTeam && <AutoSelectButton onClick={onAutoTeam} label="⚡ Auto" />}
          <button type="button" className="btn-primary" onClick={() => setTeamOpen(true)}>
            {members.length > 0 ? 'Gérer' : 'Choisir'}
          </button>
        </div>
      </div>
      {(zone.requiredTypes.length > 0 || zone.affinityTypes.length > 0) && (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          {zone.requiredTypes.map((r) => (
            <span key={r.type} className="flex items-center gap-1">
              Requis : {r.count} × <TypeBadge type={r.type} />
            </span>
          ))}
          {zone.affinityTypes.length > 0 && <span className="ml-1">Affinité :</span>}
          {zone.affinityTypes.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </p>
      )}
      <div className="mt-3">
        <TeamSlots
          ctx={ctx}
          env={env}
          members={members}
          xp={xp}
          maxTeamSize={maxTeamSize}
          onOpen={() => setTeamOpen(true)}
        />
      </div>
      {members.length > 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          ≈ <strong className="text-slate-900 dark:text-slate-100">{formatXp(xp)}</strong> par
          Pokémon {per} (moyenne, selon les rencontres)
          {activeAbilities.length > 0 && (
            <>
              {' · '}
              <span className="text-emerald-700 dark:text-emerald-400">✦ talent actif ici</span>
            </>
          )}
        </p>
      )}
      {team.length > 0 && check.errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm font-medium text-red-600 dark:text-red-400">
          {check.errors.map((e) => (
            <li key={e.code}>{teamErrorText(e)}</li>
          ))}
        </ul>
      )}
      <TeamPickerDialog
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        title={`Équipe · ${zone.name}`}
        header={<SiteChips site={zone} />}
      >
        {renderTeam({
          power: check.power,
          env,
          errors: check.errors.map(teamErrorText),
          onDone: () => setTeamOpen(false),
        })}
      </TeamPickerDialog>
    </section>
  );
}
