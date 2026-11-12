import { useState } from 'react';

/**
 * Bouton d'annulation à confirmer.
 */

/** Bouton d'annulation à deux temps : un premier clic demande confirmation. */
export function CancelButton({
  label,
  pending,
  onConfirm,
}: {
  label: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button className="btn-ghost" disabled={pending} onClick={() => setConfirming(true)}>
        Annuler
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button className="btn-danger" disabled={pending} onClick={onConfirm}>
        {pending ? 'Annulation…' : label}
      </button>
      <button className="btn-ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Non
      </button>
    </span>
  );
}
