import { ASSISTANT_POST_PLACES, assistantSlotCount } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { PokemonSprite, ShinyStar, useNow } from '../../components/ui';
import {
  assistantPlaces,
  centerState,
  shownPlaces,
  useAssistants,
  useHeal,
  usePlayerProgress,
  usePokemon,
} from '../../lib/queries';
import { errorText, formatCountdown, formatDuration, speciesName } from '../../lib/labels';
import { AssistantCard } from './AssistantCard';
import { BuildingSection, EMPTY_PLACE, Notice, StateTag } from './BuildingParts';
import { SECTION_TITLE } from './dialogParts';

/** Grille des places et des Pokémon K.O. : autant de colonnes que la largeur le permet. */
const PLACE_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3';

/**
 * Centre Pokémon : les Pokémon mis K.O. en combat y sont soignés, quelques-uns à la fois. Une fois
 * les soins finis, ils redeviennent libres d'eux-mêmes.
 */
export function CenterPage({ ctx }: { ctx: GameContext }) {
  const pokemon = usePokemon();
  const now = useNow();
  const heal = useHeal();
  const progress = usePlayerProgress();
  const assistants = useAssistants();
  const { slots, healing, knockedOut, free } = centerState(ctx, pokemon.data ?? [], now, progress);
  const shown = shownPlaces(slots, [
    ...healing.map((p) => p.healSlot ?? 0),
    ...assistantPlaces(assistants.data, 'center'),
  ]);
  const waiting = [...knockedOut].sort((a, b) => b.level - a.level);
  const centers = assistantSlotCount('center', shown);

  return (
    <div className="space-y-5">
      <BuildingSection
        id="center.places"
        title="Centre Pokémon"
        label="le Centre Pokémon"
        count={`${healing.length}/${slots}`}
        countTitle="Pokémon en soins / places"
        intro={
          <>
            Les Pokémon mis K.O. en combat le restent jusqu’à ce que tu les confies au Centre :
            leurs soins durent {formatDuration(ctx.balance.center.healMinutes)}, puis ils sont de
            nouveau prêts. L’assistant d’un Centre agit sur les soins des Pokémon qu’on y dépose.
          </>
        }
        className="space-y-5"
      >
        {Array.from({ length: centers }, (_, center) => {
          const size = ASSISTANT_POST_PLACES.center;
          const first = center * size;
          return (
            <div key={center} className="space-y-3">
              {centers > 1 && <h3 className={SECTION_TITLE}>Centre {center + 1}</h3>}
              <AssistantCard
                ctx={ctx}
                post="center"
                slot={center}
                frame="tile"
                closed={first >= slots}
              />
              <div className={PLACE_GRID}>
                {Array.from({ length: Math.min(size, shown - first) }, (_, i) => {
                  const p = healing.find((h) => h.healSlot === first + i);
                  return p ? (
                    <PatientCard key={p.id} ctx={ctx} p={p} now={now} />
                  ) : (
                    <div
                      key={`empty-${i}`}
                      className={`grid min-h-36 place-items-center p-3 text-center text-sm ${EMPTY_PLACE}`}
                    >
                      {first + i < slots ? 'Place libre' : 'Place fermée'}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </BuildingSection>

      <BuildingSection
        id="center.knocked-out"
        title="Pokémon K.O."
        label="les Pokémon K.O."
        count={waiting.length}
        countTitle="Pokémon K.O. en attente de soins"
        actions={
          waiting.length > 1 && (
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
          )
        }
      >
        {heal.error && <Notice tone="bad">{errorText(heal.error)}</Notice>}
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aucun Pokémon K.O. : toute ton équipe est en forme.
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-2.5">
            {waiting.map((p) => (
              <li key={p.id} className="tile flex items-center gap-3 p-2.5">
                <span className="sprite-well size-14 shrink-0 overflow-hidden">
                  <span className="opacity-60 grayscale">
                    <PokemonSprite
                      speciesId={p.speciesId}
                      formId={p.formId}
                      shiny={p.isShiny}
                      size={48}
                    />
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {speciesName(ctx, p.speciesId, p.formId)} {p.isShiny && <ShinyStar />}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    N.{p.level} <StateTag tone="idle">K.O.</StateTag>
                  </p>
                </div>
                <button
                  className="btn-primary px-3 py-2"
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
      </BuildingSection>
    </div>
  );
}

function PatientCard({ ctx, p, now }: { ctx: GameContext; p: PokemonDto; now: number }) {
  return (
    <div className="tile flex flex-col items-center gap-2 p-2.5 text-center">
      <span className="sprite-well relative h-20 w-full overflow-hidden">
        <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={64} />
        <span className="absolute top-1 right-1">
          <StateTag tone="heal">✚ Soins</StateTag>
        </span>
      </span>
      <p className="w-full truncate text-sm font-medium">
        {speciesName(ctx, p.speciesId, p.formId)}{' '}
        <span className="text-xs font-normal text-slate-500">N.{p.level}</span>
      </p>
      <p className="font-mono text-xs text-pink-600 dark:text-pink-400">
        {formatCountdown(Date.parse(p.healUntil!) - now)}
      </p>
    </div>
  );
}
