import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@poke/db';
import {
  startBattleInputSchema,
  switchDungeonInputSchema,
  combatItemInputSchema,
} from '@poke/shared';
import type { BattleDto, BattlesResponse, ClaimBattleResponse } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  activeBattle,
  claimBattle,
  fleeBattle,
  lastBattle,
  markBattleResultSeen,
  settleFinishedBattle,
  startBattle,
  switchBattleMember,
  useBattleItem,
  toBattleDto,
  toRecordDto,
  trainerRecords,
} from '../game/battles';
import { requireStartedProfile } from '../game/expeditions';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const uuidParams = z.object({ id: z.uuid() });

/** Combats de dresseurs : lancement, changements de Pokémon, fuite, réclamation, bilan. */
export async function battleRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/battles', async (request): Promise<BattlesResponse> => {
    const userId = request.user!.id;
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
    const userId = request.user!.id;
    // Un combat terminé pendant l'absence du joueur ne bloque pas le suivant.
    await settleFinishedBattle(db, content, userId, now());
    const row = await startBattle(db, content, userId, input, now());
    return reply.code(201).send(toBattleDto(row));
  });

  app.post('/api/battles/:id/switch', async (request): Promise<BattleDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = switchDungeonInputSchema.parse(request.body);
    return toBattleDto(await switchBattleMember(db, request.user!.id, id, input, now()));
  });

  /** Baie Sitrus (ou autre objet de soin) donnée au Pokémon actif. */
  app.post('/api/battles/:id/item', async (request): Promise<BattleDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = combatItemInputSchema.parse(request.body);
    return toBattleDto(await useBattleItem(db, content, request.user!.id, id, input, now()));
  });

  /** Fuite, puis réclamation (aucune récompense). */
  app.post('/api/battles/:id/flee', async (request): Promise<ClaimBattleResponse> => {
    const { id } = uuidParams.parse(request.params);
    const userId = request.user!.id;
    await fleeBattle(db, userId, id, now());
    const { battle, currency } = await claimBattle(db, content, userId, id, now());
    return { battle: toBattleDto(battle), currency };
  });

  app.post('/api/battles/:id/claim', async (request): Promise<ClaimBattleResponse> => {
    const { id } = uuidParams.parse(request.params);
    const userId = request.user!.id;
    await requireStartedProfile(db, userId);
    const { battle, currency } = await claimBattle(db, content, userId, id, now());
    return { battle: toBattleDto(battle), currency };
  });

  /** Fenêtre du résultat fermée : elle ne réapparaît pas sur un autre appareil. */
  app.post('/api/battles/:id/seen', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    await markBattleResultSeen(db, request.user!.id, id, now());
    return reply.code(204).send();
  });
}
