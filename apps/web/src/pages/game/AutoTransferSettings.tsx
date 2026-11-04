import { useState } from 'react';
import { STAT_NAMES } from '@poke/data';
import { MAX_IV } from '@poke/game-core';
import type { AutoTransferFilter } from '@poke/game-core';
import { Modal } from '../../components/ui';

/**
 * Transfert automatique des captures au retour d'expédition : un filtre global (page des
 * expéditions), que chaque zone peut remplacer par le sien. Retenus sur cet appareil, comme les
 * Balls choisies ; le filtre retenu part avec l'expédition au lancement.
 */

const GLOBAL_KEY = 'expedition-auto-transfer';

/** Filtre global ; null = désactivé (par défaut). */
export function loadGlobalAutoTransfer(): AutoTransferFilter | null {
  try {
    return parseFilter(JSON.parse(localStorage.getItem(GLOBAL_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

export function saveGlobalAutoTransfer(filter: AutoTransferFilter | null) {
  try {
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(filter));
  } catch {
    // Stockage indisponible : le réglage vaut pour cette visite seulement.
  }
}

/** Filtre lu du stockage, ramené dans les bornes ; null = désactivé ou illisible. */
export function parseFilter(raw: unknown): AutoTransferFilter | null {
  const max = (raw as Partial<AutoTransferFilter> | null)?.maxPerfectIvs;
  if (typeof max !== 'number') return null;
  return { maxPerfectIvs: Math.min(STAT_NAMES.length, Math.max(0, Math.round(max))) };
}

/** Réglage d'une zone : le filtre global, ou un filtre propre à la zone. */
export type ZoneAutoTransfer =
  { custom: false } | { custom: true; filter: AutoTransferFilter | null };

export const effectiveAutoTransfer = (
  zone: ZoneAutoTransfer,
  global: AutoTransferFilter | null,
): AutoTransferFilter | null => (zone.custom ? zone.filter : global);

export function autoTransferLabel(filter: AutoTransferFilter | null): string {
  if (!filter) return 'Désactivé';
  if (filter.maxPerfectIvs === 0) return 'Déjà capturés sans IV parfait';
  if (filter.maxPerfectIvs >= STAT_NAMES.length) return 'Tous les déjà capturés';
  return `Déjà capturés, jusqu'à ${filter.maxPerfectIvs} IV parfait${filter.maxPerfectIvs > 1 ? 's' : ''}`;
}

/** Bouton qui affiche le filtre et ouvre son réglage. */
export function AutoTransferButton({
  label,
  filter,
  onClick,
  className = '',
}: {
  label: string;
  filter: AutoTransferFilter | null;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn-ghost text-sm ${className}`}
      onClick={onClick}
      title="Captures transférées contre des Bonbons au retour de l'expédition"
    >
      ♻ {label} : <span className="font-medium">{autoTransferLabel(filter)}</span>
    </button>
  );
}

/** Réglage du filtre global : enregistré à la validation. */
export function GlobalAutoTransferDialog({
  open,
  filter,
  onClose,
  onSave,
}: {
  open: boolean;
  filter: AutoTransferFilter | null;
  onClose: () => void;
  onSave: (filter: AutoTransferFilter | null) => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      {open && (
        <AutoTransferForm
          title="Transfert automatique (toutes les expéditions)"
          initial={{ custom: true, filter }}
          onClose={onClose}
          onSave={(next) => {
            const value = next.custom ? next.filter : null;
            saveGlobalAutoTransfer(value);
            onSave(value);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

/** Réglage d'une zone : filtre global ou filtre propre à la zone. */
export function ZoneAutoTransferDialog({
  open,
  zoneName,
  value,
  globalFilter,
  onClose,
  onSave,
}: {
  open: boolean;
  zoneName: string;
  value: ZoneAutoTransfer;
  globalFilter: AutoTransferFilter | null;
  onClose: () => void;
  onSave: (value: ZoneAutoTransfer) => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      {open && (
        <AutoTransferForm
          title={`Transfert automatique · ${zoneName}`}
          initial={value}
          globalFilter={globalFilter}
          onClose={onClose}
          onSave={(next) => {
            onSave(next);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

function AutoTransferForm({
  title,
  initial,
  globalFilter,
  onClose,
  onSave,
}: {
  title: string;
  initial: ZoneAutoTransfer;
  /** Présent pour une zone : choix entre le filtre global et un filtre propre. */
  globalFilter?: AutoTransferFilter | null;
  onClose: () => void;
  onSave: (value: ZoneAutoTransfer) => void;
}) {
  const forZone = globalFilter !== undefined;
  const [custom, setCustom] = useState(initial.custom);
  // Point de départ d'un filtre propre : le filtre global.
  const [filter, setFilter] = useState<AutoTransferFilter | null>(
    initial.custom ? initial.filter : (globalFilter ?? null),
  );
  const editable = !forZone || custom;
  const shown = editable ? filter : (globalFilter ?? null);

  return (
    <div className="space-y-5 text-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-slate-500">
        Au retour de l'expédition, les captures déjà présentes dans ton Pokédex sont transférées
        contre des Bonbons de lignée, sans passer par le PC. Le récap n'affiche que les Pokémon
        gardés.
      </p>

      {forZone && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-medium">Filtre utilisé</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              className="mt-1"
              checked={!custom}
              onChange={() => setCustom(false)}
            />
            <span>
              Filtre global
              <span className="block text-xs text-slate-500">
                {autoTransferLabel(globalFilter ?? null)} · se règle depuis la page des expéditions.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              className="mt-1"
              checked={custom}
              onChange={() => setCustom(true)}
            />
            <span>
              Filtre propre à cette zone
              <span className="block text-xs text-slate-500">
                Remplace le filtre global pour les expéditions de cette zone.
              </span>
            </span>
          </label>
        </fieldset>
      )}

      <fieldset disabled={!editable} className={`space-y-3 ${editable ? '' : 'opacity-50'}`}>
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={!!shown}
            onChange={(e) => setFilter(e.target.checked ? { maxPerfectIvs: 0 } : null)}
          />
          Transférer automatiquement au retour
        </label>
        <div>
          <label className="mb-1 block font-medium" htmlFor="auto-transfer-max-iv">
            IV parfaits ({MAX_IV}) autorisés
          </label>
          <select
            id="auto-transfer-max-iv"
            className="input w-auto py-1"
            disabled={!shown}
            value={shown?.maxPerfectIvs ?? 0}
            onChange={(e) => setFilter({ maxPerfectIvs: Number(e.target.value) })}
          >
            {Array.from({ length: STAT_NAMES.length + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0
                  ? 'Aucun (garder tout Pokémon avec un IV parfait)'
                  : n === STAT_NAMES.length
                    ? `Jusqu'à ${n} (aucune protection)`
                    : `Jusqu'à ${n}`}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Une capture qui a plus d'IV parfaits que ce nombre est gardée.
          </p>
        </div>
      </fieldset>

      <p className="text-xs text-slate-500">
        Jamais transférés : les nouveaux Pokémon du Pokédex (la première capture de chaque espèce ou
        forme), les chromatiques, les légendaires et fabuleux, les fuyards et les rencontres
        spéciales. Les captures transférées comptent pour le Pokédex, les quêtes et la guilde. Le
        filtre est figé au lancement de l'expédition.
      </p>

      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
          onClick={() => onSave(forZone && !custom ? { custom: false } : { custom: true, filter })}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
