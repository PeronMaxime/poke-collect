/**
 * Popup du tutoriel, ouverte une fois quand le joueur choisit son tout premier starter (compte
 * principal comme profil secondaire). Elle reprend le tutoriel du wiki et rappelle qu'il y reste
 * accessible.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Modal } from '../../components/ui';
import { useGameContext } from '../../lib/queries';
import { LAUNCH_DIALOG_CLASS, ResultFrame } from '../common/dialogParts';
import { TutorialContent } from './WikiTutorialPage';
import { wikiLink } from './wiki';

/** Popup ouverte ou non : un état partagé, car l'écran du starter disparaît juste après le choix. */
let open = false;
const listeners = new Set<() => void>();

function setOpen(next: boolean) {
  open = next;
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Ouvre la popup du tutoriel (appelé quand le premier starter vient d'être choisi). */
export function openTutorial() {
  setOpen(true);
}

const close = () => setOpen(false);

/** Popup du tutoriel, posée une fois à la racine de l'application. */
export function TutorialDialog() {
  const isOpen = useSyncExternalStore(subscribe, () => open);
  return (
    <Modal open={isOpen} onClose={close} wide className={LAUNCH_DIALOG_CLASS}>
      <TutorialFrame />
    </Modal>
  );
}

/** Contenu de la popup, monté seulement à l'ouverture (le contenu du jeu est alors chargé). */
function TutorialFrame() {
  const ctx = useGameContext();
  // Suivre un lien du tutoriel (onglet du jeu, page du wiki) change l'ancre : la popup s'efface.
  useEffect(() => {
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);
  return (
    <ResultFrame
      title="Tutoriel"
      onClose={close}
      note={
        <p className="text-left text-slate-500">
          Ce tutoriel reste accessible à tout moment depuis le{' '}
          <a
            href={wikiLink('tutoriel')}
            className="font-medium text-brand-600 hover:underline dark:text-brand-500"
          >
            Wiki
          </a>
          , en haut de l’écran.
        </p>
      }
      footer={
        <button className="btn-primary px-6 py-3" onClick={close}>
          Masquer
        </button>
      }
    >
      {ctx ? (
        <TutorialContent ctx={ctx} />
      ) : (
        <p className="text-center text-slate-500">Chargement…</p>
      )}
    </ResultFrame>
  );
}
