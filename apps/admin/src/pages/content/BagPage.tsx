import { useState } from 'react';
import { DEFAULT_BAG_SECTION_TITLES, DEFAULT_BAG_TABS, normalizeBag } from '@poke/content';
import type { BagSectionId, BagSettings, BagTab } from '@poke/content';
import { WithWorkingVersion } from '../../components/EntityPage';
import { SettingsPage } from '../../components/SettingsPage';
import type { WorkingVersion } from '../../lib/content';
import { useSaveBalance } from '../../lib/content';

/** Longueur maximale d'un titre d'onglet ou de rubrique (comme le menu). */
const MAX_TITLE = 30;

export function BagPage() {
  return (
    <WithWorkingVersion>{(w) => <BagEditor key={w.version.id} working={w} />}</WithWorkingVersion>
  );
}

const copyTabs = (tabs: BagTab[]): BagTab[] =>
  tabs.map((t) => ({ title: t.title, sections: [...t.sections] }));

/** État de l'éditeur du Sac : onglets et rubriques réordonnés, titres, enregistrement. */
function useBagEditor({ working }: { working: WorkingVersion }) {
  const balance = working.content.balance;
  const initialTabs = normalizeBag(balance.bag).tabs;
  const initialTitles = balance.bag?.sectionTitles ?? {};
  const [tabs, setTabs] = useState<BagTab[]>(() => copyTabs(initialTabs));
  const [titles, setTitles] = useState<Record<string, string>>(initialTitles);
  const save = useSaveBalance(working.version.id);
  const editable = working.editable;

  const dirty =
    JSON.stringify(tabs) !== JSON.stringify(initialTabs) ||
    JSON.stringify(titles) !== JSON.stringify(initialTitles);
  const isDefault =
    JSON.stringify(tabs) === JSON.stringify(DEFAULT_BAG_TABS) && Object.keys(titles).length === 0;
  const tabTitlesValid = tabs.every(
    (t) => t.sections.length === 0 || (t.title.trim().length > 0 && t.title.length <= MAX_TITLE),
  );
  const sectionTitlesValid = Object.values(titles).every((t) => t.length <= MAX_TITLE);

  function moveTab(index: number, delta: number) {
    const next = copyTabs(tabs);
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved!);
    setTabs(next);
  }

  /** Déplace une rubrique dans son onglet (`delta`) ou vers un autre onglet (à la fin). */
  function moveSection(id: BagSectionId, from: number, to: number, delta = 0) {
    const next = copyTabs(tabs);
    const list = next[from]!.sections;
    const i = list.indexOf(id);
    list.splice(i, 1);
    if (to === from) list.splice(i + delta, 0, id);
    else next[to]!.sections.push(id);
    setTabs(next);
  }

  function setSectionTitle(id: BagSectionId, value: string) {
    const { [id]: _previous, ...rest } = titles;
    setTitles(value === '' ? rest : { ...rest, [id]: value });
  }

  function submit() {
    const sectionTitles = Object.fromEntries(
      Object.entries(titles)
        .map(([id, t]) => [id, t.trim()] as const)
        .filter(([id, t]) => t !== '' && t !== DEFAULT_BAG_SECTION_TITLES[id as BagSectionId]),
    );
    const bag: BagSettings = {
      tabs: tabs
        .filter((t) => t.sections.length > 0)
        .map((t) => ({ title: t.title.trim(), sections: t.sections })),
      sectionTitles,
    };
    save.mutate({ ...balance, bag });
  }

  const resetToDefault = () => {
    setTabs(copyTabs(DEFAULT_BAG_TABS));
    setTitles({});
  };
  const cancel = () => {
    setTabs(copyTabs(initialTabs));
    setTitles(initialTitles);
  };

  return {
    resetToDefault,
    cancel,
    working,
    tabs,
    setTabs,
    titles,
    save,
    editable,
    dirty,
    isDefault,
    tabTitlesValid,
    sectionTitlesValid,
    moveTab,
    moveSection,
    setSectionTitle,
    submit,
  };
}

/** Ce qu'affichent les pièces de `BagEditor`. */
type BagEditorModel = ReturnType<typeof useBagEditor>;

function BagEditor({ working }: { working: WorkingVersion }) {
  const m = useBagEditor({ working });
  const {
    save,
    dirty,
    isDefault,
    tabTitlesValid,
    sectionTitlesValid,
    resetToDefault,
    cancel,
    submit,
  } = m;
  return (
    <SettingsPage
      title="Sac du jeu"
      description="Onglets du Sac et rubriques qu’ils regroupent, affichées l’une sous l’autre dans le jeu (repliables, fermées par défaut). Une rubrique est une catégorie d’objets (réglée sur chaque objet), les œufs ramassés ou les Bonbons de lignée. L’onglet « Tout » s’ajoute toujours en premier ; un onglet sans objet chez le joueur est masqué."
      working={working}
      save={save}
      dirty={dirty}
      valid={tabTitlesValid && sectionTitlesValid}
      onCancel={cancel}
      onSave={submit}
      extraActions={
        <button className="btn-ghost" disabled={isDefault} onClick={resetToDefault}>
          Sac par défaut
        </button>
      }
    >
      {(!tabTitlesValid || !sectionTitlesValid) && (
        <p className="text-sm text-red-600">
          Chaque onglet doit avoir un titre, et les titres font {MAX_TITLE} caractères au plus.
        </p>
      )}

      <BagTabsEditor m={m} />
    </SettingsPage>
  );
}

/** Onglets du Sac et leurs rubriques : titres, ordre, déplacement d'un onglet à l'autre ; ajout d'un onglet. */
function BagTabsEditor({ m }: { m: BagEditorModel }) {
  const { tabs, setTabs, titles, editable, moveTab, moveSection, setSectionTitle } = m;
  return (
    <div className="space-y-3">
      {tabs.map((tab, t) => (
        <div
          key={t}
          className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-2 flex items-center gap-2">
            <input
              className="input h-8 flex-1 py-0 font-semibold"
              value={tab.title}
              maxLength={MAX_TITLE}
              placeholder={`Onglet ${t + 1}`}
              disabled={!editable}
              aria-label={`Titre de l’onglet ${t + 1}`}
              onChange={(e) =>
                setTabs(tabs.map((x, i) => (i === t ? { ...x, title: e.target.value } : x)))
              }
            />
            {editable && (
              <>
                <button
                  className="btn-ghost px-2"
                  disabled={t === 0}
                  title="Monter l’onglet"
                  onClick={() => moveTab(t, -1)}
                >
                  ↑
                </button>
                <button
                  className="btn-ghost px-2"
                  disabled={t === tabs.length - 1}
                  title="Descendre l’onglet"
                  onClick={() => moveTab(t, 1)}
                >
                  ↓
                </button>
                <button
                  className="btn-ghost px-2"
                  disabled={tab.sections.length > 0}
                  title={
                    tab.sections.length > 0
                      ? 'Déplacer d’abord ses rubriques dans un autre onglet'
                      : 'Supprimer l’onglet'
                  }
                  onClick={() => setTabs(tabs.filter((_, i) => i !== t))}
                >
                  ✕
                </button>
              </>
            )}
          </div>
          {tab.sections.length === 0 ? (
            <p className="px-2 py-1 text-sm text-slate-400">
              Onglet vide : il ne sera pas enregistré.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {tab.sections.map((id, i) => (
                <li key={id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                  <input
                    className="input h-8 min-w-40 flex-1 py-0"
                    value={titles[id] ?? ''}
                    maxLength={MAX_TITLE}
                    placeholder={DEFAULT_BAG_SECTION_TITLES[id]}
                    disabled={!editable}
                    aria-label={`Titre de la rubrique ${DEFAULT_BAG_SECTION_TITLES[id]}`}
                    onChange={(e) => setSectionTitle(id, e.target.value)}
                  />
                  <span className="w-24 font-mono text-xs text-slate-400">#{id}</span>
                  {editable && (
                    <>
                      <button
                        className="btn-ghost px-2"
                        disabled={i === 0}
                        title="Monter la rubrique"
                        onClick={() => moveSection(id, t, t, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="btn-ghost px-2"
                        disabled={i === tab.sections.length - 1}
                        title="Descendre la rubrique"
                        onClick={() => moveSection(id, t, t, 1)}
                      >
                        ↓
                      </button>
                      <select
                        className="input h-8 w-36 py-0"
                        value={t}
                        aria-label="Onglet de la rubrique"
                        onChange={(e) => moveSection(id, t, Number(e.target.value))}
                      >
                        {tabs.map((x, j) => (
                          <option key={j} value={j}>
                            {x.title.trim() || `Onglet ${j + 1}`}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {editable && (
        <button
          className="btn-ghost w-full border-2 border-dashed"
          onClick={() => setTabs([...copyTabs(tabs), { title: 'Nouvel onglet', sections: [] }])}
        >
          + Ajouter un onglet
        </button>
      )}
    </div>
  );
}
