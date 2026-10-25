import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { countAffinity, expeditionEnv, playerBonuses, questCaptureChance } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  ClaimExpeditionInput,
  ClaimExpeditionResponse,
  ExpeditionDto,
  LegendaryEncounterDto,
} from '@poke/shared';
import { GenderSymbol, Modal, PokemonSprite, ShinySparkles, ShinyStar } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, useClaimedRewards, useInventory, usePokemon } from '../../lib/game';
import { errorText, formatShinyRate, itemIcon, itemName, speciesName } from '../../lib/labels';
import { ActiveAbilities } from './ActiveAbilities';

/**
 * Retour d'une expédition légendaire : le légendaire apparaît (shiny ou non), puis le joueur
 * lance une seule Ball, avec une baie s'il le souhaite, ou prend la fuite. Fuir permet de
 * relancer l'expédition depuis les Quêtes et d'allonger la chaîne shiny de la quête.
 */
export function LegendaryEncounterDialog({
  ctx,
  expedition,
  onClose,
  onClaimed,
}: {
  ctx: GameContext;
  expedition: ExpeditionDto;
  onClose: () => void;
  onClaimed: (data: ClaimExpeditionResponse) => void;
}) {
  const encounter = useQuery({
    queryKey: ['legendary-encounter', expedition.id],
    queryFn: () => api<LegendaryEncounterDto>(`/api/expeditions/${expedition.id}/encounter`),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <Modal open onClose={onClose} wide>
      {encounter.data ? (
        <EncounterContent
          ctx={ctx}
          expedition={expedition}
          encounter={encounter.data}
          onClose={onClose}
          onClaimed={onClaimed}
        />
      ) : encounter.error ? (
        <p className="text-sm text-red-600">{errorText(encounter.error)}</p>
      ) : (
        <p className="text-sm text-slate-500">Le légendaire approche…</p>
      )}
    </Modal>
  );
}

function EncounterContent({
  ctx,
  expedition,
  encounter: e,
  onClose,
  onClaimed,
}: {
  ctx: GameContext;
  expedition: ExpeditionDto;
  encounter: LegendaryEncounterDto;
  onClose: () => void;
  onClaimed: (data: ClaimExpeditionResponse) => void;
}) {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const inventory = useInventory();
  const pokemon = usePokemon();
  const claimed = useClaimedRewards();
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

  const claim = useMutation({
    mutationFn: (input: ClaimExpeditionInput) =>
      api<ClaimExpeditionResponse>(`/api/expeditions/${expedition.id}/claim`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: (data) => {
      onClaimed(data);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  // formId absent du contenu (undefined) quand l'API renvoie null : on compare les deux à null.
  const target = ctx
    .quest(e.questId)
    ?.rewards.pokemon.find((p) => p.speciesId === e.speciesId && (p.formId ?? null) === e.formId);
  const team = expedition.team.flatMap((id) => pokemon.data?.find((p) => p.id === id) ?? []);
  // Talents de l'équipe à l'heure du départ, comme au serveur.
  const hour = expedition.localHour;
  const affinityCount = target ? countAffinity(ctx, target.expedition, team, hour) : 0;
  const ball = selectedBall ? ctx.itemEffect(selectedBall, 'ball') : undefined;
  const chance =
    ball && target && selectedBall
      ? questCaptureChance(ctx, {
          target,
          team,
          ballItemId: selectedBall,
          berryItemId: selectedBerry,
          bonuses: playerBonuses(ctx, claimed),
          hour,
        })
      : 0;
  const env = target && expeditionEnv(target.expedition, team, hour, 'quest');
  const name = speciesName(ctx, e.speciesId, e.formId);

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <p className="text-xs font-medium text-amber-600">✦ Expédition légendaire</p>
        <h2 className="text-xl font-bold">Un {name} sauvage apparaît !</h2>
        <motion.div
          className="relative mt-2"
          initial={reduced ? false : { opacity: 0, scale: 0.5 }}
          animate={
            e.isShiny && !reduced
              ? {
                  opacity: 1,
                  scale: 1,
                  filter: ['brightness(1)', 'brightness(1.8)', 'brightness(1)'],
                }
              : { opacity: 1, scale: 1 }
          }
          transition={{ type: 'spring', stiffness: 200, damping: 16 }}
        >
          {e.isShiny && <ShinySparkles loop radius={100} delay={0.3} />}
          <PokemonSprite
            speciesId={e.speciesId}
            formId={e.formId}
            shiny={e.isShiny}
            kind="artwork"
            size={160}
          />
        </motion.div>
        <p className="font-medium">
          {name} <GenderSymbol gender={e.gender} /> {e.isShiny && <ShinyStar />} · N.{e.level}
        </p>
        {e.isShiny ? (
          <motion.p
            className="mt-2 rounded-xl bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 px-3 py-1.5 font-bold text-amber-900 dark:from-amber-900 dark:via-amber-800 dark:to-amber-900 dark:text-amber-100"
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: [0.8, 1.08, 1] }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            ✨ Il est chromatique ! ✨
          </motion.p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Pas chromatique cette fois. Fuis puis relance l’expédition depuis les Quêtes pour
            allonger la chaîne et augmenter tes chances.
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          Taux chromatique {formatShinyRate(e.shinyChance)}
          {e.shinyChain > 0 && ` (chaîne ${e.shinyChain})`}
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Ball</h3>
          {balls.length > 0 ? (
            <select
              className="input mt-2"
              value={selectedBall ?? ''}
              onChange={(ev) => setBallId(ev.target.value)}
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
            onChange={(ev) => setBerryId(ev.target.value || null)}
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

      {ball && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Chance de capture : <strong>{(chance * 100).toFixed(1)} %</strong>
          {affinityCount > 0 && ` (${affinityCount} Pokémon en affinité)`}. Une seule Ball : en cas
          d’échec, il s’enfuit.
        </p>
      )}
      {env && <ActiveAbilities ctx={ctx} env={env} members={team} className="mt-2 text-xs" />}
      {claim.error && <p className="mt-3 text-sm text-red-600">{errorText(claim.error)}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <button className="btn-ghost mr-auto" onClick={onClose}>
          Plus tard
        </button>
        <button
          className="btn-ghost"
          title="Le légendaire s’en va ; ton équipe ne gagne pas d’XP"
          disabled={claim.isPending}
          onClick={() => claim.mutate({ ballItemId: null, berryItemId: null })}
        >
          Fuir
        </button>
        <button
          className="btn-primary flex items-center gap-2"
          disabled={!selectedBall || claim.isPending}
          onClick={() =>
            selectedBall && claim.mutate({ ballItemId: selectedBall, berryItemId: selectedBerry })
          }
        >
          {selectedBall && <img src={itemIcon(ctx, selectedBall)} alt="" className="-my-2 h-7" />}
          Lancer {selectedBall ? `la ${itemName(ctx, selectedBall)}` : 'une Ball'}
        </button>
      </div>
    </div>
  );
}
