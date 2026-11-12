/**
 * Équipes enregistrées proposées d'un clic dans le choix d'équipe.
 */
import type { GameContext } from '@poke/game-core';
import type { PokemonDto, PokemonTeamDto } from '@poke/shared';
import { PokemonSprite } from '../../../components/ui';
import { SECTION_TITLE } from '../dialogParts';

/**
 * Équipes enregistrées (page « Équipe Pkmn »), en onglets : un clic remplace la sélection par les
 * membres d'une équipe qui peuvent partir (`usable`), dans l'ordre de l'équipe et dans la limite
 * de taille. Au survol, l'aperçu de ses membres.
 */
export function SavedTeamsBar({
  ctx,
  teams,
  pokemon,
  usable,
  maxSize,
  current,
  onPick,
}: {
  ctx: GameContext;
  teams: readonly PokemonTeamDto[];
  /** Pokémon du joueur, pour l'aperçu des équipes au survol. */
  pokemon: readonly PokemonDto[];
  usable: ReadonlySet<string>;
  maxSize: number;
  /** Sélection en cours, pour marquer l'équipe choisie. */
  current: readonly string[];
  onPick: (ids: string[]) => void;
}) {
  const shown = teams.filter((t) => t.pokemonIds.length > 0);
  if (shown.length === 0) return null;
  const byId = new Map(pokemon.map((p) => [p.id, p]));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <h3 className={`${SECTION_TITLE} mr-1`}>Équipes</h3>
      {shown.map((t) => {
        const ids = t.pokemonIds.filter((id) => usable.has(id)).slice(0, maxSize);
        const missing = t.pokemonIds.length - ids.length;
        const active =
          ids.length > 0 &&
          ids.length === current.length &&
          ids.every((id, i) => current[i] === id);
        const members = t.pokemonIds.flatMap((id) => byId.get(id) ?? []);
        return (
          <div key={t.id} className="group relative">
            <button
              type="button"
              disabled={ids.length === 0}
              onClick={() => onPick(ids)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-md border-2 border-ink px-2.5 py-1 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'bg-brand-500 text-white'
                  : 'bg-white hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600'
              }`}
            >
              <span className="font-semibold">{t.name}</span>
              <span
                className={`text-xs ${active ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {ids.length}
                {missing > 0 && ` · ${missing} indisponible${missing > 1 ? 's' : ''}`}
              </span>
            </button>
            {/* Aperçu au survol : les membres qui ne peuvent pas partir sont grisés. */}
            <div className="tile pointer-events-none invisible absolute top-full left-0 z-20 mt-1 w-max max-w-[18rem] p-2 opacity-0 shadow-[3px_3px_0_rgb(0_0_0/0.3)] transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="flex flex-wrap gap-1">
                {members.map((p) => {
                  const ok = ids.includes(p.id);
                  return (
                    <span
                      key={p.id}
                      className={`flex w-14 flex-col items-center text-[10px] ${
                        ok ? 'text-slate-600 dark:text-slate-300' : 'opacity-40 grayscale'
                      }`}
                    >
                      <PokemonSprite
                        speciesId={p.speciesId}
                        formId={p.formId}
                        shiny={p.isShiny}
                        size={48}
                      />
                      <span className="line-clamp-2 w-full text-center leading-tight break-words">
                        {ctx.species(p.speciesId, p.formId)?.nameFr}
                      </span>
                      N.{p.level}
                    </span>
                  );
                })}
              </div>
              {missing > 0 && (
                <p className="mt-1 text-[10px] text-slate-500">
                  Grisés : occupés, K.O., hors du Pokédex régional ou en trop.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
