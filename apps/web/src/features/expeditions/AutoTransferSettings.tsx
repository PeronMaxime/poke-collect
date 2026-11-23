import { useState } from 'react';
import { STAT_NAMES } from '@poke/data';
import { MAX_IV } from '@poke/game-core';
import type { AutoTransferFilter, GameContext } from '@poke/game-core';
import { Modal, PokemonSprite } from '../../components/ui';
import { speciesName } from '../../lib/labels';
import { readStoredJson, writeStoredJson } from '../../lib/storage';

/**
 * Transfert automatique des captures au retour d'expédition : un filtre global (page des
 * expéditions), que chaque zone peut remplacer par le sien, avec des espèces à toujours garder.
 * Retenus sur cet appareil, comme les
 * Balls choisies ; le filtre retenu part avec l'expédition au lancement.
 */

const GLOBAL_KEY = 'expedition-auto-transfer';

/** Filtre global ; null = désactivé (par défaut). */
export function loadGlobalAutoTransfer(): AutoTransferFilter | null {
  return parseFilter(readStoredJson(GLOBAL_KEY));
}

const saveGlobalAutoTransfer = (filter: AutoTransferFilter | null) =>
  writeStoredJson(GLOBAL_KEY, filter);

/** Filtre lu du stockage, ramené dans les bornes ; null = désactivé ou illisible. */
export function parseFilter(raw: unknown): AutoTransferFilter | null {
  const stored = raw as Partial<AutoTransferFilter> | null;
  const max = stored?.maxPerfectIvs;
  if (typeof max !== 'number') return null;
  const filter: AutoTransferFilter = {
    maxPerfectIvs: Math.min(STAT_NAMES.length, Math.max(0, Math.round(max))),
  };
  const keep = Array.isArray(stored?.keepSpeciesIds)
    ? stored.keepSpeciesIds.filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (keep.length > 0) filter.keepSpeciesIds = [...new Set(keep)];
  return filter;
}

/** Réglage d'une zone : le filtre global, ou un filtre propre à la zone. */
export type ZoneAutoTransfer =
  { custom: false } | { custom: true; filter: AutoTransferFilter | null };

/** Transfert automatique qui s'applique à une zone : son réglage propre, sinon le réglage général. */
export const effectiveAutoTransfer = (
  zone: ZoneAutoTransfer,
  global: AutoTransferFilter | null,
): AutoTransferFilter | null => (zone.custom ? zone.filter : global);

/** Résumé lisible d'un réglage de transfert automatique (« Désactivé » sans réglage). */
export function autoTransferLabel(filter: AutoTransferFilter | null): string {
  if (!filter) return 'Désactivé';
  const kept = filter.keepSpeciesIds?.length ?? 0;
  const s = kept > 1 ? 's' : '';
  return ivLabel(filter.maxPerfectIvs) + (kept > 0 ? ` · ${kept} espèce${s} gardée${s}` : '');
}

function ivLabel(maxPerfectIvs: number): string {
  if (maxPerfectIvs === 0) return 'Déjà capturés sans IV parfait';
  if (maxPerfectIvs >= STAT_NAMES.length) return 'Tous les déjà capturés';
  return `Déjà capturés, jusqu'à ${maxPerfectIvs} IV parfait${maxPerfectIvs > 1 ? 's' : ''}`;
}

/**
 * Options du nombre d'IV parfaits autorisés (transfert automatique, doublons). Libellés courts :
 * la liste déroulante du navigateur prend la largeur de l'option la plus longue et sortait de
 * l'écran sur mobile ; le détail est donné sous le sélecteur par `maxPerfectIvsHint`.
 */
export function MaxPerfectIvsOptions() {
  return Array.from({ length: STAT_NAMES.length + 1 }, (_, n) => (
    <option key={n} value={n}>
      {n === 0 ? 'Aucun' : `Jusqu'à ${n}`}
    </option>
  ));
}

/** Précision sous le sélecteur selon le choix : `kept` = « Une capture », « Un doublon »… */
export function maxPerfectIvsHint(n: number, kept: string, gender: 'm' | 'f' = 'f'): string {
  const keptWord = gender === 'f' ? 'gardée' : 'gardé';
  if (n === 0) return `${kept} qui a au moins un IV parfait est ${keptWord}.`;
  if (n >= STAT_NAMES.length) return 'Aucune protection : les IV parfaits ne comptent pas.';
  return `${kept} qui a plus de ${n} IV parfait${n > 1 ? 's' : ''} est ${keptWord}.`;
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
      // `flex-wrap` : sur un écran étroit, la valeur passe sous le libellé au lieu de déborder.
      className={`btn-ghost flex-wrap gap-1 px-3 py-1.5 text-xs ${className}`}
      onClick={onClick}
      title="Captures transférées contre des Bonbons au retour de l'expédition"
    >
      {/* Espace insécable : les deux points ne passent jamais seuls à la ligne, mais le libellé
          peut se couper sur un écran étroit. */}
      <span>♻ {label}&nbsp;:</span>
      <span className="font-medium">{autoTransferLabel(filter)}</span>
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

/** Espèce proposée parmi celles à garder ; sa forme ne sert qu'au sprite. */
export interface KeepCandidate {
  speciesId: number;
  formId: number | null;
}

/**
 * Réglage d'une zone : filtre global ou filtre propre à la zone ; ce dernier peut garder des
 * espèces (`candidates` : celles de la zone qui se transfèrent).
 */
export function ZoneAutoTransferDialog({
  open,
  ctx,
  zoneName,
  candidates,
  value,
  globalFilter,
  onClose,
  onSave,
}: {
  open: boolean;
  ctx: GameContext;
  zoneName: string;
  candidates: KeepCandidate[];
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
          keep={{ ctx, candidates }}
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
  keep,
  onClose,
  onSave,
}: {
  title: string;
  initial: ZoneAutoTransfer;
  /** Présent pour une zone : choix entre le filtre global et un filtre propre. */
  globalFilter?: AutoTransferFilter | null;
  /** Présent pour une zone : espèces à garder, à cocher parmi celles de la zone. */
  keep?: { ctx: GameContext; candidates: KeepCandidate[] };
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
            // Pleine largeur sur mobile : à sa taille naturelle (la plus longue option), la
            // liste élargissait la fenêtre au-delà de l'écran.
            className="input w-full py-1 sm:w-auto"
            disabled={!shown}
            value={shown?.maxPerfectIvs ?? 0}
            onChange={(e) => setFilter({ ...filter, maxPerfectIvs: Number(e.target.value) })}
          >
            <MaxPerfectIvsOptions />
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {maxPerfectIvsHint(shown?.maxPerfectIvs ?? 0, 'Une capture')}
          </p>
        </div>
        {keep && editable && (
          <KeepSpeciesPicker
            ctx={keep.ctx}
            candidates={keep.candidates}
            filter={filter}
            onChange={setFilter}
          />
        )}
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

/**
 * Espèces de la zone à ne jamais transférer : un bouton par espèce, enfoncé = gardée. Une espèce
 * gardée qui n'est plus dans la zone reste affichée pour pouvoir être retirée.
 */
function KeepSpeciesPicker({
  ctx,
  candidates,
  filter,
  onChange,
}: {
  ctx: GameContext;
  candidates: KeepCandidate[];
  filter: AutoTransferFilter | null;
  onChange: (filter: AutoTransferFilter) => void;
}) {
  const kept = filter?.keepSpeciesIds ?? [];
  const shown: KeepCandidate[] = [
    ...candidates,
    ...kept
      .filter((id) => !candidates.some((c) => c.speciesId === id))
      .map((speciesId) => ({ speciesId, formId: null })),
  ];
  if (shown.length === 0) return null;
  const toggle = (speciesId: number) => {
    if (!filter) return;
    const next = kept.includes(speciesId)
      ? kept.filter((id) => id !== speciesId)
      : [...kept, speciesId];
    onChange(
      next.length > 0
        ? { ...filter, keepSpeciesIds: next }
        : { maxPerfectIvs: filter.maxPerfectIvs },
    );
  };
  return (
    <div>
      <p className="mb-1 font-medium">Espèces à garder</p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map(({ speciesId, formId }) => {
          const on = kept.includes(speciesId);
          const name = speciesName(ctx, speciesId);
          return (
            <li key={speciesId}>
              <button
                type="button"
                aria-pressed={on}
                disabled={!filter}
                title={on ? `${name} : jamais transféré` : `${name} : transféré`}
                className={`flex items-center gap-1 rounded-md border-2 py-0.5 pr-2 pl-0.5 text-xs ${
                  on
                    ? 'border-emerald-600 bg-emerald-50 font-medium dark:bg-emerald-950'
                    : 'border-slate-300 opacity-70 dark:border-slate-600'
                }`}
                onClick={() => toggle(speciesId)}
              >
                <PokemonSprite speciesId={speciesId} formId={formId} size={28} alt="" />
                {on && '✓ '}
                {name}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-slate-500">
        Les espèces cochées ne sont jamais transférées au retour d'une expédition dans cette zone,
        quels que soient leurs IV.
      </p>
    </div>
  );
}
