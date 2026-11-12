/**
 * Nouveautés (changelog), en popup ouverte depuis n'importe quel écran, même sans être connecté.
 * Les entrées elles-mêmes sont dans `releases.ts`.
 */
import { useSyncExternalStore } from 'react';
import { Modal } from '../components/ui';
import { LAUNCH_DIALOG_CLASS, ResultFrame } from '../features/common/dialogParts';
import { RELEASES } from './releases';

/** Ancienne adresse de la page des nouveautés : ouvre la popup (liens déjà partagés). */
export const CHANGELOG_PATH = '/nouveautes';

/** Dernière mise à jour vue par le joueur sur cet appareil (date de l'entrée du haut). */
const SEEN_KEY = 'dexpedition.changelogSeen';
const LATEST = RELEASES[0]?.date;

function readUnseen(): boolean {
  try {
    return !!LATEST && localStorage.getItem(SEEN_KEY) !== LATEST;
  } catch {
    return false;
  }
}

/** État partagé de la popup : ouverte ou non, et dernière mise à jour pas encore vue. */
let state = { open: false, unseen: readUnseen() };
const listeners = new Set<() => void>();

function setState(next: Partial<typeof state>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Ouvre la popup des nouveautés, et marque la dernière mise à jour comme vue. */
export function openChangelog() {
  try {
    if (LATEST) localStorage.setItem(SEEN_KEY, LATEST);
  } catch {
    // Stockage indisponible (navigation privée) : l'indicateur reviendra au prochain chargement.
  }
  setState({ open: true, unseen: false });
}

/** Vrai tant que le joueur n'a pas ouvert les nouveautés depuis la dernière mise à jour. */
export function useUnseenChangelog(): boolean {
  return useSyncExternalStore(subscribe, () => state.unseen);
}

const close = () => setState({ open: false });

/** Popup des nouveautés, posée une fois à la racine de l'application. */
export function ChangelogDialog() {
  const open = useSyncExternalStore(subscribe, () => state.open);
  return (
    <Modal open={open} onClose={close} wide className={LAUNCH_DIALOG_CLASS}>
      <ResultFrame
        title="Nouveautés"
        onClose={close}
        footer={
          <button className="btn-primary px-6 py-3" onClick={close}>
            Fermer
          </button>
        }
      >
        <div className="space-y-6 text-sm leading-relaxed">
          {RELEASES.map((release) => (
            <section
              key={release.date + release.title}
              className="space-y-3 border-t border-slate-200 pt-6 first-of-type:border-t-0 first-of-type:pt-0 dark:border-slate-800"
            >
              <h3 className="text-lg font-bold">
                {release.title}{' '}
                <span className="text-sm font-normal text-slate-500">— {release.date}</span>
              </h3>
              {release.changes.map(({ section, items }) => (
                <div key={section}>
                  <h4 className="font-medium">{section}</h4>
                  <ul className="list-disc space-y-1 pl-5">
                    {items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      </ResultFrame>
    </Modal>
  );
}
