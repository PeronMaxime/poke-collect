/**
 * Barre de départ du formulaire de départ en expédition.
 */
import type { ReactNode } from 'react';
import type { StartExpeditionInput } from '@poke/shared';
import { formatXp } from '../../common/XpPreview';
import { StatusPill } from '../../common/dialogParts';
import type { LaunchModel } from './useLaunchExpedition';

/**
 * Barre de départ, toujours visible : état de l'équipe, résumé, et boutons « Annuler » et « Partir
 * ».
 */
export function LaunchFooter({
  launch,
  pending,
  error,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  launch: LaunchModel;
  pending: boolean;
  error: ReactNode;
  /** Libellé du bouton de départ (par défaut « Partir »). */
  submitLabel?: string;
  onCancel: () => void;
  /** Reçoit le départ préparé et le temps d'expédition des estimations, en minutes. */
  onSubmit: (input: StartExpeditionInput, minutes: number) => void;
}) {
  const {
    zone,
    team,
    members,
    rememberSettings,
    duration,
    ballPlan,
    berryId,
    berriesTaken,
    encounterBerryId,
    encounterBerriesTaken,
    autoTransfer,
    check,
    xp,
    captureText,
    status,
  } = launch;
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
      {error && (
        <p className="order-first w-full text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <StatusPill tone={status.tone} text={status.text} />
      <span className="hidden min-w-0 flex-1 truncate text-sm text-slate-600 sm:block dark:text-slate-300">
        {[
          members.length > 0 && `${members.length} Pokémon · ≈ ${formatXp(xp)} par Pokémon`,
          captureText,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {rememberSettings && (
        <span className="hidden text-right text-[11px] leading-tight text-slate-500 xl:block dark:text-slate-400">
          Réglages retenus
          <br />
          pour {zone.name}
        </span>
      )}
      <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="btn-primary px-6 py-3"
          disabled={check.errors.length > 0 || pending}
          onClick={() =>
            onSubmit(
              {
                zoneId: zone.id,
                team,
                balls: ballPlan,
                berryItemId: berryId,
                ...(berryId ? { berryCount: berriesTaken } : {}),
                encounterBerryItemId: encounterBerryId,
                ...(encounterBerryId ? { encounterBerryCount: encounterBerriesTaken } : {}),
                autoTransfer,
              },
              duration,
            )
          }
        >
          {submitLabel ?? 'Partir'}
        </button>
      </div>
    </footer>
  );
}
