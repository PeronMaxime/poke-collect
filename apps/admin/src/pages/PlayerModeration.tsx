/**
 * Section « Modération » de la fiche d'un joueur : suspension (durée, motif montré au joueur),
 * levée, et renommage du dresseur. Chaque action est journalisée par le serveur.
 */
import { useState } from 'react';
import { SUSPENSION_REASON_MAX } from '@poke/shared';
import type { AccountSuspensionDto, AdminPlayerDetailResponse } from '@poke/shared';
import { formatDate } from '../lib/format';
import { moderationError, usePlayerModeration } from '../lib/moderation';

/** Durées proposées, en heures ; null : définitive. */
const DURATIONS: { hours: number | null; label: string }[] = [
  { hours: 1, label: '1 heure' },
  { hours: 24, label: '1 jour' },
  { hours: 72, label: '3 jours' },
  { hours: 168, label: '7 jours' },
  { hours: 720, label: '30 jours' },
  { hours: null, label: 'Définitive' },
];

/** « jusqu'au 25 nov. 2026, 10:00 », ou « définitive ». */
function suspensionLabel(s: AccountSuspensionDto): string {
  return s.permanent ? 'définitive' : `jusqu’au ${formatDate(s.until)}`;
}

/** Étiquette « Suspendu » de la liste des joueurs ; la fin et le motif au survol. */
export function SuspendedPill({ suspension }: { suspension: AccountSuspensionDto }) {
  return (
    <span
      className="ml-2 rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-600"
      title={`Suspendu, ${suspensionLabel(suspension)} : ${suspension.reason}`}
    >
      Suspendu
    </span>
  );
}

/** Suspendre, lever, renommer : pour un joueur (jamais pour un compte administrateur). */
export function PlayerModerationSection({ detail }: { detail: AdminPlayerDetailResponse }) {
  const { player, profile } = detail;
  const { suspend, lift, rename } = usePlayerModeration(player.id);
  const [hours, setHours] = useState<number | null>(24);
  const [reason, setReason] = useState('');
  const [name, setName] = useState(profile?.trainerName ?? '');
  const suspension = player.suspension;
  const error = [suspend, lift, rename].find((m) => m.isError)?.error;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="font-semibold">Modération</h3>

      {suspension ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm dark:bg-red-950/40">
          <div>
            <p className="font-medium text-red-700 dark:text-red-400">
              Compte suspendu, {suspensionLabel(suspension)}
            </p>
            <p className="text-slate-600 dark:text-slate-300">Motif : {suspension.reason}</p>
          </div>
          <button className="btn-ghost" disabled={lift.isPending} onClick={() => lift.mutate()}>
            Lever la suspension
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Compte actif. Une suspension le déconnecte tout de suite ; le jeu lui affiche ensuite la
          date de fin et le motif.
        </p>
      )}

      <form
        className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          suspend.mutate({ hours, reason: reason.trim() }, { onSuccess: () => setReason('') });
        }}
      >
        <label className="block text-sm">
          <span className="text-xs text-slate-500">Durée</span>
          <select
            className="input w-full"
            value={hours ?? ''}
            onChange={(e) => setHours(e.target.value ? Number(e.target.value) : null)}
          >
            {DURATIONS.map((d) => (
              <option key={d.label} value={d.hours ?? ''}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-slate-500">Motif (montré au joueur)</span>
          <input
            className="input w-full"
            value={reason}
            maxLength={SUSPENSION_REASON_MAX}
            placeholder="Ex. : propos injurieux dans la discussion de guilde"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn-danger"
          disabled={suspend.isPending || reason.trim().length < 3}
        >
          {suspension ? 'Remplacer la suspension' : 'Suspendre'}
        </button>
      </form>

      {profile && (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            rename.mutate(name.trim());
          }}
        >
          <label className="block text-sm">
            <span className="text-xs text-slate-500">Nom de dresseur</span>
            <input
              className="input w-full"
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn-ghost"
            disabled={rename.isPending || name.trim() === profile.trainerName}
          >
            Renommer
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{moderationError(error)}</p>}
    </section>
  );
}
