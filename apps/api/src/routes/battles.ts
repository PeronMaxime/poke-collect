import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  startBattleInputSchema,
  switchDungeonInputSchema,
  combatItemInputSchema,
} from '@poke/shared';
import type { BattleDto, BattlesResponse, ClaimBattleResponse } from '@poke/shared';
import {
  activeBattle,
  claimBattle,
  fleeBattle,
  lastBattle,
  markBattleResultSeen,
  startBattle,
  switchBattleMember,
  useBattleItem,
  toBattleDto,
  toRecordDto,
  trainerRecords,
} from '../game/battles';
import { requireStartedProfile } from '../game/expeditions';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

/**
 * Routes des combats de dresseurs (/api/battles) : lancer, changer de Pokémon, utiliser un objet,
 * fuir, réclamer. Chaque route valide sa requête, appelle le module de jeu et répond.
 */

const uuidParams = z.object({ id: z.uuid() });

/** Combats de dresseurs : lancement, changements de Pokémon, fuite, réclamation, bilan. */
export async function battleRoutes(app: FastifyInstance, { db, content, hooks, now }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/battles', async (request): Promise<BattlesResponse> => {
    const userId = currentUserId(request);
    const [active, records, last] = await Promise.all([
      activeBattle(db, userId),
      trainerRecords(db, userId),
      lastBattle(db, userId),
    ]);
    return {
      serverTime: now().toISOString(),
      active: active ? toBattleDto(active) : null,
      last: last ? toBattleDto(last) : null,
      records: records.map(toRecordDto),
    };
  });

  app.post('/api/battles', async (request, reply) => {
    const input = startBattleInputSchema.parse(request.body);
    const userId = currentUserId(request);
    // Un combat terminé pendant l'absence du joueur ne bloque pas le suivant.
    await hooks.settleAll(userId);
    const row = await startBattle(db, content, userId, input, now());
    hooks.invalidateSettle(userId);
    return reply.code(201).send(toBattleDto(row));
  });

  app.post('/api/battles/:id/switch', async (request): Promise<BattleDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = switchDungeonInputSchema.parse(request.body);
    return toBattleDto(await switchBattleMember(db, currentUserId(request), id, input, now()));
  });

  /** Baie Sitrus (ou autre objet de soin) donnée au Pokémon actif. */
  app.post('/api/battles/:id/item', async (request): Promise<BattleDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = combatItemInputSchema.parse(request.body);
    return toBattleDto(await useBattleItem(db, content, currentUserId(request), id, input, now()));
  });

  /** Fuite, puis réclamation (aucune récompense). */
  app.post('/api/battles/:id/flee', async (request): Promise<ClaimBattleResponse> => {
    const { id } = uuidParams.parse(request.params);
    const userId = currentUserId(request);
    await fleeBattle(db, userId, id, now());
    const { battle, currency } = await claimBattle(db, content, userId, id, now());
    return { battle: toBattleDto(battle), currency };
  });

  app.post('/api/battles/:id/claim', async (request): Promise<ClaimBattleResponse> => {
    const { id } = uuidParams.parse(request.params);
    const userId = currentUserId(request);
    await requireStartedProfile(db, userId);
    const { battle, currency } = await claimBattle(db, content, userId, id, now());
    return { battle: toBattleDto(battle), currency };
  });

  /** Fenêtre du résultat fermée : elle ne réapparaît pas sur un autre appareil. */
  app.post('/api/battles/:id/seen', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    await markBattleResultSeen(db, currentUserId(request), id, now());
    return reply.code(204).send();
  });
}
