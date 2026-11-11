/**
 * Fenêtre de dépôt d'un Pokémon à la pension.
 */
import { ViewTabs } from '../../components/ui';
import { errorText } from '../../lib/labels';
import { StatusPill } from '../common/dialogParts';
import { TeamPickerDialog } from '../common/TeamSection';
import { useDepositDialog } from './deposit/useDepositDialog';
import type { DepositDialogProps, DepositModel } from './deposit/useDepositDialog';
import { DepositBox } from './deposit/DepositBox';
import { PensionPanel } from './deposit/PensionPanel';

/**
 * Choix d'un Pokémon (et de son objet tenu) pour une place de pension, dans la même fenêtre que
 * le choix d'une équipe : à gauche la « boîte » des Pokémon disponibles (recherche, tri, filtres),
 * à droite la pension (le Pokémon choisi, son partenaire, l'aperçu de l'œuf) ; en bas, l'état du
 * couple et Annuler · Déposer. Sur téléphone, la boîte et la pension passent en onglets.
 * S'il y avait déjà un Pokémon à cette place, il est remplacé.
 */
export function DepositDialog(props: DepositDialogProps) {
  const d = useDepositDialog(props);
  const { slotIndex, onClose, pairing, current, partner, picked, partnerLabel, view, setView } = d;
  return (
    <TeamPickerDialog
      open
      onClose={onClose}
      title={
        pairing ? 'Choisir un partenaire' : current ? 'Changer de Pokémon' : 'Déposer un Pokémon'
      }
      header={
        <span className="text-sm text-slate-600 dark:text-slate-300">
          Pension {slotIndex + 1}
          {partner && <> · avec {partnerLabel}</>}
        </span>
      }
    >
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:overflow-hidden">
        <ViewTabs
          className="mb-3 lg:hidden"
          tabs={[
            { id: 'box', label: 'Pokémon' },
            { id: 'pension', label: 'Pension', badge: picked ? '1/1' : '0/1' },
          ]}
          selected={view}
          onSelect={setView}
        />

        <DepositBox d={d} />
        <PensionPanel d={d} />
      </div>

      <DepositFooter d={d} />
    </TeamPickerDialog>
  );
}
/** Barre du bas : état du couple, puis « Annuler » (ou « Terminer ») et « Déposer ». */
function DepositFooter({ d }: { d: DepositModel }) {
  const {
    onClose,
    pairing,
    partner,
    item,
    deposit,
    picked,
    name,
    partnerLabel,
    status,
    actionLabel,
  } = d;
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
      <StatusPill tone={status.tone} text={status.text} />
      <span className="hidden min-w-0 flex-1 truncate text-sm text-slate-600 sm:block dark:text-slate-300">
        {picked && (partner ? `${name(picked)} + ${partnerLabel}` : `${name(picked)} seul`)}
      </span>
      {deposit.error && (
        <span className="w-full text-sm text-red-600 sm:w-auto">{errorText(deposit.error)}</span>
      )}
      <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
        <button type="button" className="btn-ghost" onClick={onClose}>
          {pairing ? 'Terminer' : 'Annuler'}
        </button>
        <button
          type="button"
          className="btn-primary px-6"
          disabled={!picked || deposit.isPending}
          onClick={() => deposit.mutate({ pokemonId: picked!.id, heldItemId: item })}
        >
          {actionLabel}
        </button>
      </div>
    </footer>
  );
}
