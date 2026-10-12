import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Quest, QuestPokemon } from '@poke/content';
import { captureProbability, checkTeam, legendarySite, shinyProbability } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { ExpeditionDto, StartQuestExpeditionInput } from '@poke/shared';
import { Modal, PokemonSprite, TypeBadge } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { PLAYER_STATE_KEYS, useInventory, useShinyCharm } from '../../lib/game';
import {
  GAME_ERRORS,
  formatDuration,
  formatShinyRate,
  itemIcon,
  itemName,
  speciesName,
} from '../../lib/labels';
import { teamErrorText } from './LaunchExpeditionDialog';
import { TeamPicker, useTeamPicker } from './TeamPicker';

/**
 * Expédition légendaire (lancée depuis les quêtes) : une seule Ball lancée. Les membres de
 * l'équipe en affinité (par défaut, les faiblesses du légendaire) et la baie font la différence.
 */
export function QuestExpeditionDialog({
  ctx,
  quest,
  target,
  onClose,
}: {
  ctx: GameContext;
  quest: Quest;
  /** Pokémon visé : le prochain de la récompense pas encore capturé. */
  target: QuestPokemon;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const charm = useShinyCharm(ctx);
  const inventory = useInventory();
  const zone = legendarySite(quest, target);
  const { durationMinutes } = target.expedition;
  const picker = useTeamPicker(ctx, zone);
  const owned = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
  // De la Ball la plus forte à la plus faible : un légendaire mérite la meilleure.
  const balls = ctx.content.items
    .filter((i) => ctx.itemEffect(i.id, 'ball') && (owned.get(i.id) ?? 0) > 0)
    .sort(
      (a, b) =>
        ctx.itemEffect(b.id, 'ball')!.catchMultiplier -
        ctx.itemEffect(a.id, 'ball')!.catchMultiplier,
    );
  const berries = ctx.content.items
    .filter((i) => ctx.itemEffect(i.id, 'captureBoost') && (owned.get(i.id) ?? 0) > 0)
    .sort(
      (a, b) =>
        ctx.itemEffect(b.id, 'captureBoost')!.multiplier -
        ctx.itemEffect(a.id, 'captureBoost')!.multiplier,
    );
  // undefined = choix par défaut (meilleure Ball, meilleure baie possédées).
  const [ballId, setBallId] = useState<string | undefined>(undefined);
  const [berryId, setBerryId] = useState<string | null | undefined>(undefined);
  const selectedBall = ballId ?? balls[0]?.id ?? null;
  const selectedBerry = berryId === undefined ? (berries[0]?.id ?? null) : berryId;

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

  const species = ctx.species(target.speciesId, target.formId)!;
  const check = checkTeam(ctx, zone, durationMinutes, picker.members);
  const { errors } = check;
  const ball = selectedBall ? ctx.itemEffect(selectedBall, 'ball') : undefined;
  const boost = selectedBerry ? ctx.itemEffect(selectedBerry, 'captureBoost') : undefined;
  const chance = ball
    ? captureProbability(ctx, {
        captureRate: species.captureRate,
        ballMultiplier: ball.catchMultiplier,
        boostMultiplier: boost?.multiplier,
        affinityCount: check.affinityCount,
      })
    : 0;
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
            {formatDuration(durationMinutes)} et <strong>une seule Ball sera lancée</strong> : en
            cas d’échec, il s’enfuit et tu pourras retenter. Prépare une équipe en affinité et une
            baie.
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Ball</h3>
          {balls.length > 0 ? (
            <select
              className="input mt-2"
              value={selectedBall ?? ''}
              onChange={(e) => setBallId(e.target.value)}
            >
              {balls.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (× {owned.get(b.id)})
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-2 text-sm text-red-600">Tu n’as aucune Ball.</p>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">Baie (optionnelle)</h3>
          <select
            className="input mt-2"
            value={selectedBerry ?? ''}
            onChange={(e) => setBerryId(e.target.value || null)}
          >
            <option value="">Aucune</option>
            {berries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} (× {owned.get(b.id)})
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        Chance de capture : <strong>{(chance * 100).toFixed(1)} %</strong>
        {check.affinityCount > 0 && ` (${check.affinityCount} Pokémon en affinité)`} · taux shiny{' '}
        {formatShinyRate(shinyProbability(ctx, { charm }))}
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
        {selectedBall && (
          <img
            src={itemIcon(ctx, selectedBall)}
            alt={itemName(ctx, selectedBall)}
            className="h-8"
          />
        )}
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
          disabled={
            picker.team.length === 0 || errors.length > 0 || !selectedBall || start.isPending
          }
          onClick={() =>
            selectedBall &&
            start.mutate({
              team: picker.team,
              ballItemId: selectedBall,
              berryItemId: selectedBerry,
            })
          }
        >
          Partir ({formatDuration(durationMinutes)})
        </button>
      </div>
    </Modal>
  );
}
