import { ASSISTANT_POST_PLACES, assistantSlotCount } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { PokemonSprite, useNow } from '../../components/ui';
import { centerState, useHeal, usePokemon } from '../../lib/game';
import { errorText, formatCountdown, formatDuration, speciesName } from '../../lib/labels';
import { AssistantCard } from './AssistantCard';

/**
 * Centre Pokémon : les Pokémon mis K.O. en combat y sont soignés, quelques-uns à la fois. Une fois
 * les soins finis, ils redeviennent libres d'eux-mêmes.
 */
export function CenterPage({ ctx }: { ctx: GameContext }) {
  const pokemon = usePokemon();
  const now = useNow();
  const heal = useHeal();
  const { slots, healing, knockedOut, free } = centerState(ctx, pokemon.data ?? [], now);
  const waiting = [...knockedOut].sort((a, b) => b.level - a.level);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Centre Pokémon{' '}
            <span className="text-sm font-normal text-slate-500">
              {healing.length} / {slots}
            </span>
          </h2>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Les Pokémon mis K.O. en combat le restent jusqu’à ce que tu les confies au Centre : leurs
          soins durent {formatDuration(ctx.balance.center.healMinutes)}, puis ils sont de nouveau
          prêts. L’assistant d’un Centre agit sur les soins des Pokémon qu’on y dépose.
        </p>
        <div className="space-y-4">
          {Array.from({ length: assistantSlotCount('center', slots) }, (_, center) => {
            const size = ASSISTANT_POST_PLACES.center;
            const first = center * size;
            return (
              <div key={center} className="space-y-2">
                {slots > size && <h3 className="text-sm font-semibold">Centre {center + 1}</h3>}
                <AssistantCard ctx={ctx} post="center" slot={center} standalone />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {Array.from({ length: Math.min(size, slots - first) }, (_, i) => {
                    const p = healing.find((h) => h.healSlot === first + i);
                    return p ? (
                      <PatientCard key={p.id} ctx={ctx} p={p} now={now} />
                    ) : (
                      <div
                        key={`empty-${i}`}
                        className="grid min-h-32 place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700"
                      >
                        Place libre
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Pokémon K.O.{' '}
            <span className="text-sm font-normal text-slate-500">{waiting.length}</span>
          </h2>
          {waiting.length > 1 && (
            <button
              className="btn-primary"
              disabled={free === 0 || heal.isPending}
              onClick={() => heal.mutate(waiting.slice(0, free).map((p) => p.id))}
            >
              {free === 0 || free >= waiting.length
                ? 'Tout soigner'
                : free === 1
                  ? 'Soigner le plus haut niveau'
                  : `Soigner les ${free} plus hauts niveaux`}
            </button>
          )}
        </div>
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun Pokémon K.O. : toute ton équipe est en forme.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {waiting.map((p) => (
              <li key={p.id} className="card flex items-center gap-3 p-3">
                <PokemonSprite
                  speciesId={p.speciesId}
                  formId={p.formId}
                  shiny={p.isShiny}
                  size={48}
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{speciesName(ctx, p.speciesId, p.formId)}</p>
                  <p className="text-xs text-slate-500">Niveau {p.level}</p>
                </div>
                <button
                  className="btn-primary"
                  disabled={free === 0 || heal.isPending}
                  title={free === 0 ? 'Toutes les places du Centre sont occupées.' : undefined}
                  onClick={() => heal.mutate([p.id])}
                >
                  Soigner
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {heal.error && <p className="text-sm text-red-600">{errorText(heal.error)}</p>}
    </div>
  );
}

function PatientCard({ ctx, p, now }: { ctx: GameContext; p: PokemonDto; now: number }) {
  return (
    <div className="card flex flex-col items-center gap-1 p-3 text-center">
      <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={64} />
      <p className="text-sm font-medium">
        {speciesName(ctx, p.speciesId, p.formId)}{' '}
        <span className="text-xs text-slate-500">niv. {p.level}</span>
      </p>
      <p className="font-mono text-xs text-pink-600 dark:text-pink-400">
        Soins : {formatCountdown(Date.parse(p.healUntil!) - now)}
      </p>
    </div>
  );
}
