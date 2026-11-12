/**
 * Talent d'un Pokémon sur sa fiche du PC : ses effets, grisés hors de l'activité en cours.
 */
import { ASSISTANT_POST_INFO, abilityEffectText, effectActivities } from '@poke/game-core';
import type { AbilityActivity, GameContext } from '@poke/game-core';
import type { AssistantDto, PokemonDto } from '@poke/shared';
import { abilityLabel } from '../../../lib/labels';
import { wikiAbilityLink } from '../../wiki/wiki';

/**
 * Activité où le talent d'un Pokémon occupé agit en ce moment (expédition, combat,
 * donjon, pension, poste d'assistant) ; undefined = Pokémon libre.
 */
export function busyAbilityActivities(
  p: PokemonDto,
  assistants: readonly AssistantDto[] | undefined,
): AbilityActivity[] | undefined {
  switch (p.activity) {
    case 'expedition':
      return ['expedition'];
    case 'battle':
    case 'dungeon':
      return [p.activity];
    case 'daycare':
      return ['breeding'];
    case 'assistant': {
      const post = assistants?.find((a) => a.pokemonId === p.id)?.post;
      return post ? [ASSISTANT_POST_INFO[post].activity] : undefined;
    }
    default:
      return undefined;
  }
}

/** Description du talent et chacun de ses effets ; `active` : agit dans l'activité en cours. */
interface AbilityDetails {
  description: string;
  effects: { text: string; active: boolean }[];
}

/**
 * Tous les effets du talent, même ceux d'autres activités : un Pokémon occupé (en expédition…)
 * voit les autres grisés au lieu de les perdre.
 */
export function abilityDetails(
  ctx: GameContext,
  ability: string,
  activities: readonly AbilityActivity[] | undefined,
): AbilityDetails | null {
  const entry = ctx.ability(ability);
  if (!entry) return null;
  const effects = entry.effects.map((e) => ({
    text: abilityEffectText(e),
    active: !activities || activities.some((a) => effectActivities(e).includes(a)),
  }));
  const description = entry.description.trim();
  return description || effects.length > 0 ? { description, effects } : null;
}

/**
 * Talent : nom (lien vers le Wiki), puis ses effets en clair, grisés hors de l'activité en cours.
 */
export function AbilityDetail({
  name,
  hidden,
  summary,
  note,
}: {
  name: string;
  hidden?: boolean;
  summary: AbilityDetails | null;
  note?: string;
}) {
  return (
    <>
      {name ? (
        <a
          href={wikiAbilityLink(name)}
          className="font-semibold text-brand-600 hover:underline dark:text-brand-500"
        >
          {abilityLabel(name)}
        </a>
      ) : (
        <span className="font-semibold">{abilityLabel(name)}</span>
      )}
      {hidden && (
        <span className="pixel-label ml-1.5 rounded border-2 border-ink bg-slate-100 px-1 text-[8px] dark:bg-slate-800">
          Caché
        </span>
      )}
      {note && <span className="block text-xs text-slate-500">{note}</span>}
      {summary && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {summary.description && summary.effects.length === 0 && (
            <li className="text-slate-500">{summary.description}</li>
          )}
          {summary.effects.map((e, i) => (
            <li
              key={i}
              className={e.active ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}
            >
              {e.active ? '● ' : '○ '}
              {e.text}
            </li>
          ))}
          {summary.effects.some((e) => !e.active) && (
            <li className="text-slate-400 italic">Grisés : sans effet sur son activité en cours</li>
          )}
        </ul>
      )}
    </>
  );
}
