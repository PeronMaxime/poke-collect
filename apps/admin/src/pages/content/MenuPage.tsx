/**
 * Page « Menu du jeu » : ordre des onglets, sections et leurs titres, conditions de déblocage des
 * onglets.
 */
import { useState } from 'react';
import { DEFAULT_MENU_GROUPS, DEFAULT_MENU_TITLES, MENU_TABS, normalizeMenu } from '@poke/content';
import type { MenuSection, MenuTabId, TabUnlocks, UnlockCondition } from '@poke/content';
import { WithWorkingVersion } from '../../components/EntityPage';
import { SettingsPage } from '../../components/SettingsPage';
import { UnlockEditor } from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';
import { useSaveBalance } from '../../lib/content';

const LABELS = Object.fromEntries(MENU_TABS.map((t) => [t.id, t.label])) as Record<
  MenuTabId,
  string
>;

/** Page « Menu du jeu » (voir l'en-tête du fichier). */
export function MenuPage() {
  return (
    <WithWorkingVersion>{(w) => <MenuEditor key={w.version.id} working={w} />}</WithWorkingVersion>
  );
}

/** Ce qu'on fait glisser : un onglet, ou un groupe entier (par sa poignée). */
type Drag = { kind: 'tab'; id: MenuTabId } | { kind: 'group'; index: number };
/** Où le lâcher : avant l'onglet `index` du groupe `group` (index = longueur → à la fin). */
type Target =
  | { kind: 'tab'; group: number; index: number }
  | { kind: 'new-group' }
  | { kind: 'group'; index: number };

const DEFAULT_SECTIONS: MenuSection[] = DEFAULT_MENU_GROUPS.map((tabs, i) => ({
  title: DEFAULT_MENU_TITLES[i] ?? `Section ${i + 1}`,
  tabs: [...tabs],
}));

/** État de l'éditeur du menu : sections et onglets réordonnés, glisser-déposer, conditions de déblocage, enregistrement. */
function useMenuEditor({ working }: { working: WorkingVersion }) {
  const balance = working.content.balance;
  const initial = normalizeMenu(balance.menu);
  const [sections, setSections] = useState<MenuSection[]>(initial);
  const groups = sections.map((s) => s.tabs);
  const initialUnlocks = balance.tabUnlocks ?? {};
  const [unlocks, setUnlocks] = useState<TabUnlocks>(initialUnlocks);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const save = useSaveBalance(working.version.id);
  const editable = working.editable;
  const dirty =
    JSON.stringify(sections) !== JSON.stringify(initial) ||
    JSON.stringify(unlocks) !== JSON.stringify(initialUnlocks);
  const isDefault = JSON.stringify(sections) === JSON.stringify(DEFAULT_SECTIONS);
  const titlesValid = sections.every((s) => s.title.trim().length > 0 && s.title.length <= 30);

  function endDrag() {
    setDrag(null);
    setTarget(null);
  }

  /** Applique le dépôt en cours, puis retire les groupes devenus vides. */
  function drop() {
    if (!drag || !target) return endDrag();
    const next = sections.map((s) => ({ ...s, tabs: [...s.tabs] }));
    if (drag.kind === 'tab') {
      // Position d'arrivée calculée avant de retirer l'onglet de son groupe d'origine.
      let insert = target.kind === 'tab' ? target.index : 0;
      if (target.kind === 'tab') {
        const from = next[target.group]!.tabs.indexOf(drag.id);
        if (from !== -1 && from < insert) insert--;
      }
      for (const { tabs } of next) {
        const i = tabs.indexOf(drag.id);
        if (i !== -1) tabs.splice(i, 1);
      }
      if (target.kind === 'tab') next[target.group]!.tabs.splice(insert, 0, drag.id);
      else if (target.kind === 'new-group')
        next.push({ title: 'Nouvelle section', tabs: [drag.id] });
    } else if (target.kind === 'group') {
      const [moved] = next.splice(drag.index, 1);
      next.splice(target.index > drag.index ? target.index - 1 : target.index, 0, moved!);
    }
    setSections(next.filter((s) => s.tabs.length > 0));
    endDrag();
  }

  /** Survol d'un onglet : avant ou après selon la moitié de la ligne survolée. */
  function overTab(e: React.DragEvent, group: number, index: number) {
    if (drag?.kind !== 'tab') return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setTarget({ kind: 'tab', group, index: after ? index + 1 : index });
  }

  /** Survol d'un groupe : un onglet va à sa fin ; un groupe se place avant ou après lui. */
  function overGroup(e: React.DragEvent, group: number) {
    if (!drag) return;
    e.preventDefault();
    if (drag.kind === 'tab') {
      setTarget({ kind: 'tab', group, index: groups[group]!.length });
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      setTarget({ kind: 'group', index: after ? group + 1 : group });
    }
  }

  const groupLine = (index: number) =>
    target?.kind === 'group' &&
    target.index === index &&
    drag?.kind === 'group' &&
    index !== drag.index &&
    index !== drag.index + 1 && <div className="h-1 rounded bg-brand-500" />;

  const resetToDefault = () =>
    setSections(DEFAULT_SECTIONS.map((s) => ({ ...s, tabs: [...s.tabs] })));
  const cancel = () => {
    setSections(initial);
    setUnlocks(initialUnlocks);
  };
  const submit = () =>
    save.mutate({
      ...balance,
      menu: { groups, titles: sections.map((s) => s.title.trim()) },
      tabUnlocks: unlocks,
    });

  return {
    resetToDefault,
    cancel,
    submit,
    working,
    sections,
    setSections,
    groups,
    unlocks,
    setUnlocks,
    drag,
    setDrag,
    target,
    setTarget,
    save,
    editable,
    dirty,
    isDefault,
    titlesValid,
    endDrag,
    drop,
    overTab,
    overGroup,
    groupLine,
  };
}

/** Ce qu'affichent les pièces de `MenuEditor`. */
type MenuEditorModel = ReturnType<typeof useMenuEditor>;

function MenuEditor({ working }: { working: WorkingVersion }) {
  const m = useMenuEditor({ working });
  const { save, dirty, isDefault, titlesValid, resetToDefault, cancel, submit } = m;
  return (
    <SettingsPage
      title="Menu du jeu"
      description="Ordre des onglets et sections du menu : chaque section a un titre et se replie dans le jeu (accordéon). Glisser un onglet pour le déplacer, une section par sa poignée ⠿ pour la réordonner."
      working={working}
      save={save}
      dirty={dirty}
      valid={titlesValid}
      onCancel={cancel}
      onSave={submit}
      extraActions={
        <button className="btn-ghost" disabled={isDefault} onClick={resetToDefault}>
          Menu par défaut
        </button>
      }
    >
      {!titlesValid && (
        <p className="text-sm text-red-600">
          Chaque section doit avoir un titre (30 caractères au plus).
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_14rem]">
        <MenuSectionsEditor m={m} />

        <MenuPreview m={m} />
      </div>

      <TabUnlocksSection m={m} />
    </SettingsPage>
  );
}

/** Sections du menu et leurs onglets, à réordonner par glisser-déposer ; ajout d'une section. */
function MenuSectionsEditor({ m }: { m: MenuEditorModel }) {
  const {
    sections,
    setSections,
    groups,
    drag,
    setDrag,
    target,
    setTarget,
    editable,
    endDrag,
    drop,
    overTab,
    overGroup,
    groupLine,
  } = m;
  return (
    <div className="space-y-2" onDragEnd={endDrag}>
      {groups.map((group, g) => (
        <div key={g} className="space-y-2">
          {groupLine(g)}
          <div
            onDragOver={(e) => overGroup(e, g)}
            onDrop={(e) => {
              e.preventDefault();
              drop();
            }}
            className={`rounded-lg border bg-white p-2 dark:bg-slate-900 ${
              drag?.kind === 'group' && drag.index === g
                ? 'border-dashed border-brand-500 opacity-50'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div
              draggable={editable}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                setDrag({ kind: 'group', index: g });
              }}
              className={`mb-1 flex items-center gap-2 px-1 text-xs font-semibold text-slate-400 select-none ${
                editable ? 'cursor-grab' : ''
              }`}
            >
              {editable && <span aria-hidden>⠿</span>}
              <input
                className="input h-7 flex-1 py-0 text-sm font-semibold text-slate-700 dark:text-slate-200"
                value={sections[g]!.title}
                maxLength={30}
                placeholder={`Section ${g + 1}`}
                disabled={!editable}
                aria-label={`Titre de la section ${g + 1}`}
                // Le champ ne fait pas glisser la section (sélection du texte à la souris).
                draggable={false}
                onDragStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onChange={(e) =>
                  setSections(
                    sections.map((s, i) => (i === g ? { ...s, title: e.target.value } : s)),
                  )
                }
              />
            </div>
            <ul>
              {group.map((id, i) => (
                <li key={id} onDragOver={(e) => overTab(e, g, i)}>
                  {target?.kind === 'tab' && target.group === g && target.index === i && (
                    <div className="my-0.5 h-0.5 rounded bg-brand-500" />
                  )}
                  <div
                    draggable={editable}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.effectAllowed = 'move';
                      setDrag({ kind: 'tab', id });
                    }}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none ${
                      editable ? 'cursor-grab hover:bg-slate-100 dark:hover:bg-slate-800' : ''
                    } ${drag?.kind === 'tab' && drag.id === id ? 'opacity-40' : ''}`}
                  >
                    {editable && (
                      <span className="text-slate-400" aria-hidden>
                        ⠿
                      </span>
                    )}
                    {LABELS[id]}
                    <span className="ml-auto font-mono text-xs text-slate-400">#{id}</span>
                  </div>
                </li>
              ))}
              {target?.kind === 'tab' && target.group === g && target.index === group.length && (
                <div className="my-0.5 h-0.5 rounded bg-brand-500" />
              )}
            </ul>
          </div>
        </div>
      ))}
      {groupLine(groups.length)}

      {editable && (
        <div
          onDragOver={(e) => {
            if (drag?.kind === 'tab') {
              e.preventDefault();
              setTarget({ kind: 'new-group' });
            } else if (drag?.kind === 'group') {
              e.preventDefault();
              setTarget({ kind: 'group', index: groups.length });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop();
          }}
          className={`rounded-lg border-2 border-dashed p-4 text-center text-sm transition ${
            target?.kind === 'new-group'
              ? 'border-brand-500 bg-brand-500/10 text-brand-600'
              : 'border-slate-300 text-slate-400 dark:border-slate-700'
          }`}
        >
          Déposer un onglet ici pour créer un nouveau groupe
        </div>
      )}
    </div>
  );
}

/** Aperçu du menu tel que les joueurs le verront. */
function MenuPreview({ m }: { m: MenuEditorModel }) {
  const { sections } = m;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-400 uppercase">Aperçu</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
        {sections.map(({ title, tabs: group }, g) => (
          <div
            key={g}
            className={g > 0 ? 'mt-2 border-t border-slate-200 pt-2 dark:border-slate-800' : ''}
          >
            <p className="px-3 py-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              {title || '—'} ▾
            </p>
            {group.map((id) => (
              <p key={id} className="rounded-lg px-3 py-1.5 text-sm text-slate-500">
                {LABELS[id]}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Condition de déblocage de chaque onglet. */
function TabUnlocksSection({ m }: { m: MenuEditorModel }) {
  const { working, unlocks, setUnlocks, editable } = m;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Déblocage des onglets</h2>
      <p className="text-sm text-slate-500">
        Un onglet verrouillé s’affiche « ??? » avec un cadenas dans le menu et ne s’ouvre pas ; sa
        condition apparaît au survol (au toucher sur mobile). Il reste ouvert au joueur qui y a
        encore quelque chose en cours (œufs, fossiles, baies, donjon, quête commencée).
      </p>
      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {MENU_TABS.map(({ id, label }) => (
          <div key={id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="w-36 text-sm font-medium">{label}</span>
            <UnlockEditor
              value={unlocks[id] ?? { type: 'always' }}
              onChange={(v: UnlockCondition) => {
                const { [id]: _previous, ...rest } = unlocks;
                setUnlocks(v.type === 'always' ? rest : { ...rest, [id]: v });
              }}
              regions={working.content.regions}
              trainers={working.content.trainers}
              quests={working.content.quests}
              disabled={!editable}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
