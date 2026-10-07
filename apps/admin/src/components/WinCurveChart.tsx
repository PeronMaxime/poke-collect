import { useState } from 'react';
import { winProbabilityForRatio } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';

const W = 560;
const H = 220;
const PAD = { top: 12, right: 16, bottom: 34, left: 44 };
const MAX_RATIO = 3;
const STEPS = 120;

/**
 * Courbe de probabilité de victoire selon le rapport des PE (réglages de combat du contexte).
 * Avec `trainerPower`, l'axe horizontal est exprimé en PE de l'équipe du joueur.
 * `advantage` (−1 à +1) décale la courbe comme le ferait l'avantage de types.
 */
export function WinCurveChart({
  ctx,
  trainerPower,
  advantage = 0,
  marker,
}: {
  ctx: GameContext;
  trainerPower?: number;
  advantage?: number;
  /** Rapport des PE mis en évidence (équipe testée). */
  marker?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const factor = 1 + ctx.balance.battles.typeAdvantageWeight * advantage;
  const p = (ratio: number) => winProbabilityForRatio(ctx, ratio * factor);
  const x = (ratio: number) => PAD.left + (ratio / MAX_RATIO) * (W - PAD.left - PAD.right);
  const y = (prob: number) => PAD.top + (1 - prob) * (H - PAD.top - PAD.bottom);
  const points = Array.from({ length: STEPS + 1 }, (_, i) => (i / STEPS) * MAX_RATIO);
  const path = points.map((r, i) => `${i ? 'L' : 'M'}${x(r).toFixed(1)},${y(p(r)).toFixed(1)}`);
  const xLabel = (ratio: number) =>
    trainerPower ? `${Math.round(ratio * trainerPower)}` : `×${ratio.toFixed(ratio % 1 ? 1 : 0)}`;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = ((px - PAD.left) / (W - PAD.left - PAD.right)) * MAX_RATIO;
    setHover(ratio >= 0 && ratio <= MAX_RATIO ? ratio : null);
  }

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label="Probabilité de victoire selon la PE de l’équipe"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              className="stroke-slate-200 dark:stroke-slate-800"
            />
            <text
              x={PAD.left - 6}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-slate-500 text-[11px]"
            >
              {v * 100} %
            </text>
          </g>
        ))}
        {[0, 0.5, 1, 1.5, 2, 2.5, 3].map((r) => (
          <text
            key={r}
            x={x(r)}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            className="fill-slate-500 text-[11px]"
          >
            {xLabel(r)}
          </text>
        ))}
        <text
          x={(PAD.left + W - PAD.right) / 2}
          y={H - 4}
          textAnchor="middle"
          className="fill-slate-500 text-[11px]"
        >
          {trainerPower ? 'PE de l’équipe du joueur' : 'Rapport PE joueur / PE dresseur'}
        </text>
        {/* PE égale */}
        <line
          x1={x(1)}
          x2={x(1)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          strokeDasharray="4 4"
          className="stroke-slate-400 dark:stroke-slate-600"
        />
        <path d={path.join('')} fill="none" strokeWidth={2} className="stroke-brand-500" />
        {marker !== undefined && marker <= MAX_RATIO && (
          <circle
            cx={x(marker)}
            cy={y(p(marker))}
            r={5}
            strokeWidth={2}
            className="fill-brand-500 stroke-white dark:stroke-slate-900"
          />
        )}
        {hover !== null && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              className="stroke-slate-400"
            />
            <circle
              cx={x(hover)}
              cy={y(p(hover))}
              r={4}
              strokeWidth={2}
              className="fill-brand-500 stroke-white dark:stroke-slate-900"
            />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow dark:border-slate-700 dark:bg-slate-900"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: hover > MAX_RATIO / 2 ? 'translateX(-105%)' : 'translateX(5%)',
          }}
        >
          <div className="text-slate-500">
            {trainerPower
              ? `PE ${Math.round(hover * trainerPower)} (×${hover.toFixed(2)})`
              : `Rapport ×${hover.toFixed(2)}`}
          </div>
          <div className="font-semibold">{(p(hover) * 100).toFixed(1)} % de victoire</div>
        </div>
      )}
      <table className="mt-2 w-full text-xs">
        <caption className="sr-only">Points clés de la courbe</caption>
        <tbody>
          <tr className="text-slate-500">
            <th className="text-left font-normal">Rapport des PE</th>
            {[0.5, 0.67, 1, 1.5, 2].map((r) => (
              <td key={r} className="text-right font-mono">
                ×{r}
              </td>
            ))}
          </tr>
          <tr>
            <th className="text-left font-normal text-slate-500">Victoire</th>
            {[0.5, 0.67, 1, 1.5, 2].map((r) => (
              <td key={r} className="text-right font-mono">
                {Math.round(p(r) * 100)} %
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </figure>
  );
}
