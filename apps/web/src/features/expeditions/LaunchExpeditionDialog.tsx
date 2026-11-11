/**
 * Fenêtre de départ en expédition du jeu : le formulaire de `launch/`, branché sur les données du
 * joueur (sac, Pokédex, fuyards, équipe préparée pour la zone) et sur le départ lui-même.
 */
import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Zone } from '@poke/content';
import type { GameContext } from '@poke/game-core';
import type { StartExpeditionInput } from '@poke/shared';
import { Modal } from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  refreshAfterExpeditionStart,
  startExpedition,
  useDexCatches,
  useExpeditions,
  useInventory,
  usePokemon,
  useShinyCharm,
} from '../../lib/queries';
import { errorMessage } from '../../lib/labels';
import { TeamPicker } from '../common/TeamPicker';
import { useTeamPicker } from '../common/teamPicker/useTeamPicker';
import { usePlayerBonuses } from '../common/XpPreview';
import { LAUNCH_DIALOG_CLASS } from '../common/dialogParts';
import { LaunchExpeditionForm } from './launch/LaunchExpeditionForm';
import { storeZoneSettings, storedZoneSettings } from './launch/zoneSettings';

/** Fenêtre de départ pour une zone : ferme dès que l'expédition est lancée. */
export function LaunchExpeditionDialog({
  ctx,
  zone,
  chain,
  onClose,
}: {
  ctx: GameContext;
  zone: Zone;
  /** Maillon de la chaîne de zone qu'aurait cette expédition. */
  chain: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const charm = useShinyCharm(ctx);
  const inventory = useInventory();
  // Équipe préparée pour la zone : reprise à l'ouverture (Pokémon toujours disponibles), puis
  // retenue à chaque changement, comme les Balls et baies.
  const pokemon = usePokemon().data;
  const picker = useTeamPicker(ctx, zone, () => {
    const saved = storedZoneSettings(zone.id).team ?? [];
    if (!pokemon) return saved;
    const available = new Set(pokemon.filter((p) => !p.busy && !p.knockedOut).map((p) => p.id));
    return saved.filter((id) => available.has(id));
  });
  // Retenue seulement une fois modifiée : l'ouverture n'efface pas l'équipe préparée (Pokémon
  // encore en expédition…).
  const openingTeam = useRef(picker.team);
  const bonuses = usePlayerBonuses(ctx);
  const owned = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
  const roamers = useExpeditions().data?.roamers.filter((r) => r.zoneId === zone.id);
  const dex = useDexCatches();
  useEffect(() => {
    if (picker.team !== openingTeam.current) storeZoneSettings(zone.id, { team: picker.team });
  }, [picker.team, zone.id]);

  const start = useMutation({
    mutationFn: (input: StartExpeditionInput) => startExpedition(input),
    onSuccess: () => {
      // Fermer avant le rechargement : l'équipe envoyée devient « occupée » et sortirait de la liste.
      onClose();
      return refreshAfterExpeditionStart(queryClient);
    },
  });

  return (
    <Modal open onClose={onClose} wide="xl" className={LAUNCH_DIALOG_CLASS}>
      <LaunchExpeditionForm
        ctx={ctx}
        zone={zone}
        chain={chain}
        charm={charm}
        owned={(itemId) => owned.get(itemId) ?? 0}
        bonuses={bonuses}
        roamers={roamers}
        caught={{ speciesIds: dex.caughtSpeciesIds, formIds: dex.caughtFormIds }}
        team={picker.team}
        members={picker.members}
        renderTeam={({ power, env, errors, onDone }) => (
          <TeamPicker
            ctx={ctx}
            zone={zone}
            picker={picker}
            power={power}
            abilityEnv={env}
            errors={errors}
            onDone={onDone}
          />
        )}
        onAutoTeam={() => picker.autoSelect(ctx.balance.expeditions.maxTeamSize)}
        pending={start.isPending}
        error={
          start.error &&
          (start.error instanceof ApiError ? errorMessage(start.error.code) : 'Erreur inconnue')
        }
        onCancel={onClose}
        rememberSettings
        onSubmit={(input) => start.mutate(input)}
      />
    </Modal>
  );
}
