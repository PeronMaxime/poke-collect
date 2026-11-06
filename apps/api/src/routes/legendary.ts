import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type { Db } from '@poke/db';
import {
  combatItemInputSchema,
  legendaryCaptureInputSchema,
  startLegendaryBattleInputSchema,
  switchDungeonInputSchema,
} from '@poke/shared';
import type {
  ClaimLegendaryBattleResponse,
  LegendaryBattleDto,
  ReleaseLegendaryResponse,
  LegendaryBattlesResponse,
  LegendaryCaptureResponse,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  activeLegendaryBattle,
  captureLegendary,
  claimLegendaryBattle,
  fleeLegendaryBattle,
  lastLegendaryBattle,
  legendaryQuestStates,
  markLegendaryResultSeen,
  releaseLegendary,
  startLegendaryBattle,
  switchLegendaryMember,
  toLegendaryBattleDto,
  useLegendaryItem,
} from '../game/legendary';
import { requireStartedProfile } from '../game/expeditions';
import { toPokemonDto } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const uuidParams = z.object({ id: z.uuid() });
const questParams = z.object({ id: slugSchema });

/** Combats légendaires : lancement depuis une quête, changements, fuite, réglage, Ball. */
export async function legendaryRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/legendary-battles', async (request): Promise<LegendaryBattlesResponse> => {
    const userId = request.user!.id;
    const ctx = await content.get();
    const at = now();
    const [active, last, quests] = await Promise.all([
      activeLegendaryBattle(db, userId),
      lastLegendaryBattle(db, userId),
      legendaryQuestStates(db, ctx, userId, at),
    ]);
    return {
      serverTime: at.toISOString(),
      active: active ? toLegendaryBattleDto(ctx, active) : null,
      last: last ? toLegendaryBattleDto(ctx, last) : null,
      quests,
    };
  });

  app.post('/api/quests/:id/battle', async (request, reply) => {
    const { id } = questParams.parse(request.params);
    const input = startLegendaryBattleInputSchema.parse(request.body);
    const userId = request.user!.id;
    // Un combat terminé pendant l'absence du joueur ne bloque pas le suivant.
    await hooks.settleAll(userId);
    const row = await startLegendaryBattle(db, content, userId, id, input, now());
    hooks.invalidateSettle(userId);
    return reply.code(201).send(toLegendaryBattleDto(await content.get(), row));
  });

  app.post('/api/legendary-battles/:id/switch', async (request): Promise<LegendaryBattleDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = switchDungeonInputSchema.parse(request.body);
    const row = await switchLegendaryMember(db, request.user!.id, id, input, now());
    return toLegendaryBattleDto(await content.get(), row);
  });

  /** Baie Sitrus (ou autre objet de soin) donnée au Pokémon actif. */
  app.post('/api/legendary-battles/:id/item', async (request): Promise<LegendaryBattleDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = combatItemInputSchema.parse(request.body);
    const row = await useLegendaryItem(db, content, request.user!.id, id, input, now());
    return toLegendaryBattleDto(await content.get(), row);
  });

  /** Fuite, puis réglage (aucune XP). */
  app.post(
    '/api/legendary-battles/:id/flee',
    async (request): Promise<ClaimLegendaryBattleResponse> => {
      const { id } = uuidParams.parse(request.params);
      const userId = request.user!.id;
      await fleeLegendaryBattle(db, userId, id, now());
      const battle = await claimLegendaryBattle(db, content, userId, id, now());
      return { battle: toLegendaryBattleDto(await content.get(), battle) };
    },
  );

  app.post(
    '/api/legendary-battles/:id/claim',
    async (request): Promise<ClaimLegendaryBattleResponse> => {
      const { id } = uuidParams.parse(request.params);
      const userId = request.user!.id;
      await requireStartedProfile(db, userId);
      const battle = await claimLegendaryBattle(db, content, userId, id, now());
      return { battle: toLegendaryBattleDto(await content.get(), battle) };
    },
  );

  /** Ball lancée sur le légendaire vaincu. */
  app.post(
    '/api/legendary-battles/:id/capture',
    async (request): Promise<LegendaryCaptureResponse> => {
      const { id } = uuidParams.parse(request.params);
      const input = legendaryCaptureInputSchema.parse(request.body);
      const { battle, captured } = await captureLegendary(
        db,
        content,
        request.user!.id,
        id,
        input,
        now(),
      );
      return {
        battle: toLegendaryBattleDto(await content.get(), battle),
        pokemon: captured ? toPokemonDto(captured) : null,
      };
    },
  );

  /** Légendaire relâché depuis le PC : sa quête le propose de nouveau (aucun Bonbon). */
  app.post('/api/pokemon/:id/release', async (request): Promise<ReleaseLegendaryResponse> => {
    const { id } = uuidParams.parse(request.params);
    return releaseLegendary(db, content, request.user!.id, id);
  });

  /** Fenêtre du résultat fermée : elle ne réapparaît pas sur un autre appareil. */
  app.post('/api/legendary-battles/:id/seen', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    await markLegendaryResultSeen(db, request.user!.id, id, now());
    return reply.code(204).send();
  });
}
