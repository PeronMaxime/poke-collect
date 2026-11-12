import { useState } from 'react';
import { formatCountdown } from '../../lib/labels';
import { useDungeonCombat } from './combat/useDungeonCombat';
import type { CombatModel, CombatRun, DungeonCombatProps } from './combat/useDungeonCombat';
import { Arena } from './combat/Arena';
import { CombatTeam } from './combat/CombatTeam';

/**
 * Fenêtre d'un combat en temps réel (donjon, dresseur ou légendaire) : bandeau, arène, équipe du
 * joueur et barre de fuite. Fermée, le combat continue et se réclame à sa fin.
 */
export function DungeonCombat<R extends CombatRun, C>(props: DungeonCombatProps<R, C>) {
  const d = useDungeonCombat(props);
  return (
    <div className="flex flex-col">
      <CombatHeader d={d} />
      <Arena d={d} />
      <CombatTeam d={d} />
      <FleeBar d={d} />
    </div>
  );
}

/** Bandeau du combat : adversaire en cours, titre, temps restant, fermeture. */
function CombatHeader({ d }: { d: CombatModel }) {
  const { title, onHide, setup, shown, timeLeft } = d;
  return (
    <header className="flex shrink-0 items-center gap-2 border-b-[3px] border-ink bg-hud px-3 py-2.5 text-white sm:gap-3 sm:px-4">
      <span
        className="pixel-label shrink-0 rounded border-2 border-hud-line bg-hud-pill px-1.5 text-[9px]"
        title="Adversaire en cours"
      >
        {Math.min(shown.enemyIndex + 1, setup.enemies.length)} / {setup.enemies.length}
      </span>
      <h2 className="min-w-0 flex-1 truncate font-pixel text-[10px] text-[#f8d030] uppercase sm:text-xs">
        {title}
      </h2>
      <span
        className={`pixel-label shrink-0 rounded border-2 px-2 py-0.5 text-[10px] tabular-nums ${
          timeLeft < 30_000
            ? 'border-[#0b0f1e] bg-brand-500 text-white'
            : 'border-hud-line bg-hud-pill text-white'
        }`}
        title="Temps restant"
      >
        ⏱ {formatCountdown(timeLeft)}
      </span>
      <button
        type="button"
        onClick={onHide}
        className="btn size-9 shrink-0 border-[#0b0f1e] bg-brand-500 p-0 text-white"
        title="Fermer (le combat continue)"
        aria-label="Fermer la fenêtre du combat"
      >
        ✕
      </button>
    </header>
  );
}

/** Barre du bas : rappel que le combat continue, fuite (confirmée dans la barre). */
function FleeBar({ d }: { d: CombatModel }) {
  const { outcome, flee } = d;
  const [confirmFlee, setConfirmFlee] = useState(false);
  return (
    <footer className="flex items-center justify-between gap-2 border-t-[3px] border-ink bg-slate-50 px-3 py-2.5 sm:px-4 dark:bg-hud-pill">
      <p className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
        {confirmFlee
          ? 'Fuir met fin au combat, sans récompense.'
          : 'Le combat continue même si tu fermes cette fenêtre ou quittes la page.'}
      </p>
      {confirmFlee ? (
        <span className="flex shrink-0 items-center gap-2">
          <button
            className="btn-danger"
            disabled={flee.isPending || outcome !== null}
            onClick={() => flee.mutate()}
          >
            {flee.isPending ? 'Fuite…' : 'Fuir'}
          </button>
          <button className="btn-ghost" onClick={() => setConfirmFlee(false)}>
            Rester
          </button>
        </span>
      ) : (
        <button
          className="btn-ghost shrink-0"
          disabled={outcome !== null}
          onClick={() => setConfirmFlee(true)}
        >
          Fuir
        </button>
      )}
    </footer>
  );
}
