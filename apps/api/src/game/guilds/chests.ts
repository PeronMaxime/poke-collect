import { randomInt } from 'node:crypto';
import type { Db } from '@poke/db';
import { MAX_SEED, chestCandidates, openGuildChests } from '@poke/game-core';
import type { OpenChestInput, OpenChestResponse } from '@poke/shared';
import type { ContentCache } from '../../content-cache';
import { GameError } from '../errors';
import { requireStartedProfile } from '../expeditions';
import { addItems, playerProgress, takeItems } from '../store';
import { playerTransaction } from '../tx';

/**
 * Ouverture des coffres de guilde gagnés par les quêtes.
 */

/** Ouvre des coffres de guilde du sac : lots tirés selon la progression du joueur. */
export async function openChests(
  db: Db,
  content: ContentCache,
  userId: string,
  input: OpenChestInput,
): Promise<OpenChestResponse> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const effect = ctx.itemEffect(input.itemId, 'guildChest');
  if (!effect) throw new GameError(400, 'NOT_A_CHEST');
  const progress = await playerProgress(db, ctx, userId);
  if (chestCandidates(ctx, effect.rarity, progress).length === 0) {
    throw new GameError(409, 'CHEST_EMPTY');
  }
  const loot = openGuildChests(
    ctx,
    effect.rarity,
    progress,
    input.count,
    randomInt(0, MAX_SEED + 1),
  );
  await playerTransaction(db, userId, async (tx) => {
    if (!(await takeItems(tx, userId, input.itemId, input.count))) {
      throw new GameError(409, 'NOT_ENOUGH_ITEMS');
    }
    await addItems(tx, userId, loot);
  });
  return { itemId: input.itemId, opened: input.count, loot };
}
