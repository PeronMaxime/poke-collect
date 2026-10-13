import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Quest, QuestPokemon } from '@poke/content';
import { chainMultiplier, checkTeam, legendarySite, shinyProbability } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { ExpeditionDto, StartQuestExpeditionInput } from '@poke/shared';
import { Modal, PokemonSprite, TypeBadge } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { PLAYER_STATE_KEYS, useShinyCharm } from '../../lib/game';
import {
  GAME_ERRORS,
  formatDuration,
  formatMultiplier,
  formatShinyRate,
  speciesName,
} from '../../lib/labels';
import { teamErrorText } from './LaunchExpeditionDialog';
import { TeamPicker, useTeamPicker } from './TeamPicker';

/**
 * Expédition légendaire (lancée depuis les quêtes) : l'équipe seulement. La Ball et la baie se
 * choisissent au retour, une fois le légendaire découvert ; les membres de l'équipe en affinité
 * (par défaut, les faiblesses du légendaire) augmentent la chance de capture.
 */
export function QuestExpeditionDialog({
  ctx,
  quest,
  target,
  chain,
  onClose,
}: {
  ctx: GameContext;
  quest: Quest;
  /** Pokémon visé : le prochain de la récompense pas encore capturé. */
  target: QuestPokemon;
  /** Maillon de la chaîne de la quête qu'aurait l'expédition lancée maintenant. */
  chain: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const charm = useShinyCharm(ctx);
  const zone = legendarySite(quest, target);
  const { durationMinutes } = target.expedition;
  const picker = useTeamPicker(ctx, zone);
  const start = useMutation({
    mutationFn: (input: StartQuestExpeditionInput) =>
      api<ExpeditionDto>(`/api/quests/${quest.id}/expedition`, { method: 'POST', json: input }),
    onSuccess: () => {
      onClose();
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const check = checkTeam(ctx, zone, durationMinutes, picker.members);
  const { errors } = check;
  const name = speciesName(ctx, target.speciesId, target.formId);

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex items-center gap-4">
        <PokemonSprite
          speciesId={target.speciesId}
          formId={target.formId}
          kind="artwork"
          size={96}
          silhouette
        />
        <div>
          <h2 className="text-xl font-bold">Expédition légendaire : {quest.name}</h2>
          <p className="text-sm text-slate-500">
            Pars à la recherche de {name} (N.{target.level}). L’expédition dure{' '}
            {formatDuration(durationMinutes)}. Au retour, tu découvres s’il est shiny, puis tu
            choisis ta Ball et ta baie (<strong>une seule Ball lancée</strong>) ou tu prends la
            fuite (sans XP pour l’équipe). Relancer de suite allonge la chaîne shiny. Une équipe en
            affinité augmente la chance de capture.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        {zone.requiredTypes.map((r) => (
          <span key={r.type} className="flex items-center gap-1">
            Requis : {r.count} × <TypeBadge type={r.type} />
          </span>
        ))}
        {zone.affinityTypes.length > 0 && <span className="ml-1">Affinité :</span>}
        {zone.affinityTypes.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
      </div>

      <TeamPicker ctx={ctx} zone={zone} picker={picker} power={check.power} />

      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        {check.affinityCount > 0
          ? `${check.affinityCount} Pokémon en affinité`
          : 'Aucun Pokémon en affinité'}{' '}
        · taux shiny {formatShinyRate(shinyProbability(ctx, { chain, charm }))}
        {chain > 0 && (
          <>
            {' '}
            · ✦ chaîne {chain} ({formatMultiplier(chainMultiplier(ctx, chain))})
          </>
        )}
      </p>

      {picker.team.length > 0 && errors.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-red-600">
          {errors.map((e) => (
            <li key={e.code}>{teamErrorText(e)}</li>
          ))}
        </ul>
      )}
      {start.error && (
        <p className="mt-4 text-sm text-red-600">
          {start.error instanceof ApiError
            ? (GAME_ERRORS[start.error.code] ?? start.error.code)
            : 'Erreur inconnue'}
        </p>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
          disabled={picker.team.length === 0 || errors.length > 0 || start.isPending}
          onClick={() => start.mutate({ team: picker.team })}
        >
          Partir ({formatDuration(durationMinutes)})
        </button>
      </div>
    </Modal>
  );
}
