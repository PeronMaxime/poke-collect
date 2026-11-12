import {
  CHEST_RARITIES,
  CHEST_RARITY_LABELS,
  GUILD_QUEST_DIFFICULTIES,
  GUILD_QUEST_DIFFICULTY_LABELS,
  GUILD_QUEST_PERIODS,
} from '../schemas';
import { KNOWN_TYPES } from './context';
import type { IntegrityCheck } from './context';

/** Guildes : modèles de quêtes, lots des coffres, quantités demandées par les réglages. */
export function checkGuilds(check: IntegrityCheck): void {
  const { content, add, checkUnlock, itemIds } = check;
  for (const quest of content.guildQuests) {
    const { objective } = quest;
    if (
      objective.type === 'catchPokemon' &&
      objective.pokemonType &&
      !KNOWN_TYPES.has(objective.pokemonType)
    ) {
      add('error', 'guildQuest', quest.id, `Type « ${objective.pokemonType} » inconnu`);
    }
    if (quest.enabled && !quest.daily && !quest.weekly) {
      add('warning', 'guildQuest', quest.id, 'Ni quête du jour ni de la semaine : jamais tirée');
    }
  }
  for (const entry of content.chestEntries) {
    if (!itemIds.has(entry.itemId)) {
      add('error', 'chestEntry', entry.id, `Objet « ${entry.itemId} » inconnu`);
    }
    checkUnlock('chestEntry', entry.id, entry.unlock);
  }
  for (const difficulty of GUILD_QUEST_DIFFICULTIES) {
    const label = GUILD_QUEST_DIFFICULTY_LABELS[difficulty].toLowerCase();
    for (const period of GUILD_QUEST_PERIODS) {
      const quests = content.guildQuests.filter(
        (q) => q.enabled && q.difficulty === difficulty && q[period],
      ).length;
      const wanted = content.balance.guilds.quests[period][difficulty].count;
      if (quests < wanted) {
        add(
          'warning',
          'guildQuest',
          null,
          `${wanted} quête(s) ${label}(s) ${period === 'daily' ? 'par jour' : 'par semaine'}, mais ${quests} modèle(s) actif(s) : il y en aura moins`,
        );
      }
    }
  }
  for (const rarity of CHEST_RARITIES) {
    const label = `« ${CHEST_RARITY_LABELS[rarity]} »`;
    const entries = content.chestEntries.filter((e) => e.enabled && e.rarity === rarity);
    if (!entries.some((e) => e.unlock.type === 'always')) {
      add(
        'warning',
        'chestEntry',
        null,
        `Coffre ${label} : aucun lot sans condition, un débutant peut ne rien pouvoir en tirer`,
      );
    }
  }
}
