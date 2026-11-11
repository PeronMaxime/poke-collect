import { ViewTabs } from '../../components/ui';
import { speciesName } from '../../lib/labels';
import { StatusPill } from './dialogParts';
import { AutoSelectButton } from './teamPicker/filters';
import { useTeamPickerView } from './teamPicker/useTeamPickerView';
import type { TeamPickerModel, TeamPickerProps } from './teamPicker/useTeamPickerView';
import { TeamBox } from './teamPicker/TeamBox';
import { TeamPanel } from './teamPicker/TeamPanel';

/**
 * Choix de l'équipe, dans la fenêtre `TeamPickerDialog` : à gauche la « boîte » des Pokémon
 * disponibles (recherche, tri, filtres, équipes enregistrées), à droite l'équipe en cases
 * (en combat : ordre d'entrée et attaques), ses talents actifs et les conditions de départ ;
 * en bas, l'état de l'équipe et Vider · Auto · Valider. Sur téléphone, la boîte et l'équipe
 * passent en onglets.
 */
export function TeamPicker(props: TeamPickerProps) {
  const v = useTeamPickerView(props);
  const { combat, members, maxTeamSize, view, setView } = v;
  return (
    <>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:overflow-hidden">
        <ViewTabs
          className="mb-3 lg:hidden"
          tabs={[
            { id: 'box', label: 'Pokémon' },
            {
              id: 'team',
              label: combat ? 'Ordre et attaques' : 'Équipe',
              badge: `${members.length}/${maxTeamSize}`,
            },
          ]}
          selected={view}
          onSelect={setView}
        />

        <TeamBox v={v} />
        <TeamPanel v={v} />
      </div>
      <TeamPickerFooter v={v} />
    </>
  );
}

/** Barre du bas : état de l'équipe, puis Vider · Auto · Valider. */
function TeamPickerFooter({ v }: { v: TeamPickerModel }) {
  const {
    team,
    setTeam,
    autoSelect,
    members,
    usable,
    ctx,
    power,
    maxTeamSize,
    combat,
    onDone,
    status,
  } = v;
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
      <StatusPill tone={status.tone} text={status.text} />
      <span className="hidden min-w-0 flex-1 truncate text-sm text-slate-600 sm:block dark:text-slate-300">
        {members.length > 0 &&
          (combat
            ? `${members.length} Pokémon · ${speciesName(ctx, members[0]!.speciesId, members[0]!.formId)} entre en premier`
            : `${members.length} Pokémon · PE ${power}`)}
      </span>
      <div className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setTeam([])}
          disabled={team.length === 0}
        >
          Vider
        </button>
        <AutoSelectButton
          onClick={() => autoSelect(maxTeamSize)}
          disabled={usable.size === 0}
          label="⚡ Auto"
        />
        <button type="button" className="btn-primary px-6" onClick={onDone}>
          Valider
        </button>
      </div>
    </footer>
  );
}
