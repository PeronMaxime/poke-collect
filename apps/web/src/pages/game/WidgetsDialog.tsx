import { Modal } from '../../components/ui';
import { WIDGET_LABELS, setWidgetVisible, useWidgetSettings, widgetTab } from '../../lib/widgets';

/**
 * Fenêtre « Widgets » (bandeau du haut) : afficher ou masquer chaque widget de la colonne de
 * droite. Les widgets d'un bâtiment verrouillé restent listés, grisés.
 */
export function WidgetsDialog({
  open,
  onClose,
  lockedTabs,
}: {
  open: boolean;
  onClose: () => void;
  lockedTabs: ReadonlySet<string>;
}) {
  const { order, hidden } = useWidgetSettings();
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-xl font-bold">Widgets</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Choisis les widgets affichés dans la colonne de droite. Pour changer leur ordre, fais-les
        glisser par la poignée de leur en-tête.
      </p>
      <ul className="mt-4 space-y-1">
        {order.map((id) => {
          const locked = lockedTabs.has(widgetTab(id));
          return (
            <li key={id}>
              <label
                className={`flex items-center gap-3 rounded-md px-2 py-2 ${
                  locked
                    ? 'opacity-50'
                    : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!hidden.has(id)}
                  disabled={locked}
                  onChange={(e) => setWidgetVisible(id, e.target.checked)}
                />
                <span className="flex-1 font-medium">{WIDGET_LABELS[id]}</span>
                {locked && <span className="text-xs text-slate-500">Pas encore débloqué</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex justify-end">
        <button className="btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
