import { useState } from 'react';
import { DEFAULT_BAG_SECTION_TITLES, DEFAULT_BAG_TABS, normalizeBag } from '@poke/content';
import type { BagSectionId, BagSettings, BagTab } from '@poke/content';
import { VersionBanner } from '../../components/EntityPage';
import type { WorkingVersion } from '../../lib/content';
import { errorMessage, useSaveBalance, useWorkingVersion } from '../../lib/content';

/** Longueur maximale d'un titre d'onglet ou de rubrique (comme le menu). */
const MAX_TITLE = 30;

export function BagPage() {
  const working = useWorkingVersion();
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  return <BagEditor key={working.data.version.id} working={working.data} />;
}

const copyTabs = (tabs: BagTab[]): BagTab[] =>
  tabs.map((t) => ({ title: t.title, sections: [...t.sections] }));

function BagEditor({ working }: { working: WorkingVersion }) {
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

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Sac du jeu</h1>
          <p className="mt-1 text-slate-500">
            Onglets du Sac et rubriques qu’ils regroupent, affichées l’une sous l’autre dans le jeu
            (repliables, fermées par défaut). Une rubrique est une catégorie d’objets (réglée sur
            chaque objet), les œufs ramassés ou les Bonbons de lignée. L’onglet « Tout » s’ajoute
            toujours en premier ; un onglet sans objet chez le joueur est masqué.
          </p>
        </div>
        {editable && (
          <div className="flex gap-2">
            <button
              className="btn-ghost"
              disabled={isDefault}
              onClick={() => {
                setTabs(copyTabs(DEFAULT_BAG_TABS));
                setTitles({});
              }}
            >
              Sac par défaut
            </button>
            <button
              className="btn-ghost"
              disabled={!dirty}
              onClick={() => {
                setTabs(copyTabs(initialTabs));
                setTitles(initialTitles);
              }}
            >
              Annuler
            </button>
            <button
              className="btn-primary"
              disabled={!dirty || !tabTitlesValid || !sectionTitlesValid || save.isPending}
              onClick={submit}
            >
              Enregistrer
            </button>
          </div>
        )}
      </div>
      <VersionBanner working={working} />
      {save.error && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
      {(!tabTitlesValid || !sectionTitlesValid) && (
        <p className="text-sm text-red-600">
          Chaque onglet doit avoir un titre, et les titres font {MAX_TITLE} caractères au plus.
        </p>
      )}

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
    </div>
  );
}
