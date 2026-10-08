import { getForm, getSpecies, natures, types as typeData } from '@poke/data';
import { gameContentStructureSchema, unlockParts } from './schemas';
import type {
  BaseUnlockCondition,
  GameContentData,
  ProgressReward,
  QuestCondition,
  QuestReward,
  UnlockCondition,
} from './schemas';

/** Forme qui n'appartient pas à l'espèce (message d'erreur), ou null si tout va bien. */
function formError(p: { speciesId: number; formId?: number | null }): string | null {
  if (p.formId == null) return null;
  const form = getForm(p.formId);
  if (!form) return `Forme ${p.formId} inconnue`;
  if (form.speciesId !== p.speciesId) {
    return `${form.nameFr} n'est pas une forme de l'espèce ${p.speciesId}`;
  }
  return null;
}

/**
 * Cohérence du contenu : références croisées (zone → région, butin → objet…) et alertes.
 * Les erreurs bloquent la publication ; les avertissements s'affichent dans le tableau de bord.
 */

export type ContentEntityKind =
  | 'balance'
  | 'region'
  | 'speciesOverride'
  | 'item'
  | 'lootTable'
  | 'zone'
  | 'trainer'
  | 'shopCategory'
  | 'shopEntry'
  | 'evolutionOverride'
  | 'dexMilestone'
  | 'collection'
  | 'quest';

export interface ContentIssue {
  severity: 'error' | 'warning';
  entity: ContentEntityKind;
  entityId: string | null;
  message: string;
}

const KNOWN_TYPES = new Set(typeData.map((t) => t.name));
const KNOWN_NATURES = new Set(natures.map((n) => n.name));

function duplicates(ids: readonly (string | number)[]): Set<string | number> {
  const seen = new Set<string | number>();
  const dups = new Set<string | number>();
  for (const id of ids) (seen.has(id) ? dups : seen).add(id);
  return dups;
}

export function contentIssues(content: GameContentData): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const add = (
    severity: ContentIssue['severity'],
    entity: ContentEntityKind,
    entityId: string | number | null,
    message: string,
  ) =>
    issues.push({
      severity,
      entity,
      entityId: entityId == null ? null : String(entityId),
      message,
    });

  const regionIds = new Set(content.regions.map((r) => r.id));
  const itemIds = new Set(content.items.map((i) => i.id));
  const lootTableIds = new Set(content.lootTables.map((t) => t.id));
  const zoneIds = new Set(content.zones.map((z) => z.id));
  const trainerIds = new Set(content.trainers.map((t) => t.id));
  const shopCategoryIds = new Set(content.shopCategories.map((c) => c.id));
  const questsById = new Map(content.quests.map((q) => [q.id, q]));
  const disabled = new Set(
    content.speciesOverrides.filter((o) => !o.enabled).map((o) => o.speciesId),
  );

  for (const id of duplicates(content.regions.map((r) => r.id)))
    add('error', 'region', id, 'Identifiant de région en double');
  for (const id of duplicates(content.zones.map((z) => z.id)))
    add('error', 'zone', id, 'Identifiant de zone en double');
  for (const id of duplicates(content.items.map((i) => i.id)))
    add('error', 'item', id, 'Identifiant d’objet en double');
  for (const id of duplicates(content.lootTables.map((t) => t.id)))
    add('error', 'lootTable', id, 'Identifiant de table de butin en double');
  for (const id of duplicates(content.trainers.map((t) => t.id)))
    add('error', 'trainer', id, 'Identifiant de dresseur en double');
  for (const id of duplicates(content.speciesOverrides.map((o) => o.speciesId)))
    add('error', 'speciesOverride', id, 'Surcharge d’espèce en double');
  for (const id of duplicates(content.shopCategories.map((c) => c.id)))
    add('error', 'shopCategory', id, 'Identifiant de catégorie de boutique en double');
  for (const id of duplicates(content.shopEntries.map((e) => e.id)))
    add('error', 'shopEntry', id, 'Identifiant d’article de boutique en double');
  for (const id of duplicates(content.evolutionOverrides.map((o) => o.id)))
    add('error', 'evolutionOverride', id, 'Surcharge d’évolution en double');
  for (const id of duplicates(content.dexMilestones.map((m) => m.id)))
    add('error', 'dexMilestone', id, 'Identifiant de palier en double');
  for (const id of duplicates(content.collections.map((c) => c.id)))
    add('error', 'collection', id, 'Identifiant de collection en double');
  for (const id of duplicates(content.quests.map((q) => q.id)))
    add('error', 'quest', id, 'Identifiant de quête en double');

  const checkUnlockPart = (entity: ContentEntityKind, id: string, unlock: BaseUnlockCondition) => {
    if (unlock.type === 'regionDexPercent' && !regionIds.has(unlock.regionId)) {
      add('error', entity, id, `Condition de déblocage : région « ${unlock.regionId} » inconnue`);
    }
    if (unlock.type === 'trainerDefeated') {
      if (!trainerIds.has(unlock.trainerId)) {
        add(
          'error',
          entity,
          id,
          `Condition de déblocage : dresseur « ${unlock.trainerId} » inconnu`,
        );
      } else if (entity === 'trainer' && unlock.trainerId === id) {
        add('error', entity, id, 'Condition de déblocage : le dresseur dépend de lui-même');
      }
    }
    if (unlock.type === 'questStepsDone' || unlock.type === 'questCompleted') {
      const quest = questsById.get(unlock.questId);
      if (!quest) {
        add('error', entity, id, `Condition de déblocage : quête « ${unlock.questId} » inconnue`);
      } else if (entity === 'quest' && unlock.questId === id) {
        add('error', entity, id, 'Condition de déblocage : la quête dépend d’elle-même');
      } else if (unlock.type === 'questStepsDone' && unlock.count > quest.steps.length) {
        add(
          'error',
          entity,
          id,
          `Condition de déblocage : ${unlock.count} étape(s) requise(s), la quête « ${quest.name} » en a ${quest.steps.length}`,
        );
      }
    }
    if (unlock.type === 'badgeCount') {
      const { regionId } = unlock;
      if (regionId !== undefined && !regionIds.has(regionId)) {
        add('error', entity, id, `Condition de déblocage : région « ${regionId} » inconnue`);
      }
      const badges = content.trainers.filter(
        (t) => t.badge && (regionId === undefined || t.regionId === regionId),
      ).length;
      if (unlock.count > badges) {
        add(
          'error',
          entity,
          id,
          `Condition de déblocage : ${unlock.count} badge(s) requis, ${badges} existent${regionId ? ` dans cette région` : ''}`,
        );
      }
    }
  };
  const checkUnlock = (entity: ContentEntityKind, id: string, unlock: UnlockCondition) => {
    for (const part of unlockParts(unlock)) checkUnlockPart(entity, id, part);
  };

  const checkReward = (entity: ContentEntityKind, id: string, reward: ProgressReward) => {
    for (const stack of reward.items) {
      if (!itemIds.has(stack.itemId)) {
        add('error', entity, id, `Récompense : objet « ${stack.itemId} » inconnu`);
      }
    }
    const types = reward.bonuses.map((b) => b.type);
    if (new Set(types).size !== types.length) {
      add('warning', entity, id, 'Plusieurs bonus du même type (ils s’additionnent)');
    }
  };

  const { balance } = content;

  /** Condition d'étape de quête : brique de déblocage ou action (captures, expédition). */
  const checkQuestCondition = (id: string, step: number, condition: QuestCondition) => {
    const report = (severity: ContentIssue['severity'], message: string) =>
      add(severity, 'quest', id, `Étape ${step + 1} : ${message}`);
    switch (condition.type) {
      case 'catchPokemon': {
        if (condition.pokemonType && !KNOWN_TYPES.has(condition.pokemonType)) {
          report('error', `type « ${condition.pokemonType} » inconnu`);
        }
        if (condition.speciesId === null) break;
        const species = getSpecies(condition.speciesId);
        if (!species) {
          report('error', `espèce ${condition.speciesId} inconnue`);
        } else if (condition.pokemonType && !species.types.includes(condition.pokemonType)) {
          report('error', `${species.nameFr} n’est pas du type demandé`);
        } else if (
          !content.zones.some((z) => z.encounters.some((e) => e.speciesId === species.id))
        ) {
          report('warning', `${species.nameFr} n’apparaît dans aucune zone`);
        }
        break;
      }
      case 'expedition':
        if (!zoneIds.has(condition.zoneId))
          report('error', `zone « ${condition.zoneId} » inconnue`);
        if (condition.memberType && !KNOWN_TYPES.has(condition.memberType)) {
          report('error', `type « ${condition.memberType} » inconnu`);
        }
        if (condition.memberCount > balance.expeditions.maxTeamSize) {
          report('error', 'plus de Pokémon requis que la taille d’équipe maximale');
        }
        break;
      default:
        checkUnlock('quest', id, condition);
    }
  };

  const checkQuestReward = (id: string, reward: QuestReward) => {
    checkReward('quest', id, reward);
    for (const p of reward.pokemon) {
      if (!getSpecies(p.speciesId)) {
        add('error', 'quest', id, `Récompense : espèce ${p.speciesId} inconnue`);
      }
      const formIssue = formError(p);
      if (formIssue) add('error', 'quest', id, `Récompense : ${formIssue}`);
    }
  };

  // Équilibrage
  if (balance.expeditions.initialSlots > balance.expeditions.maxSlots) {
    add('error', 'balance', null, 'Expéditions : emplacements initiaux > maximum');
  }
  if (balance.daycare.initialSlots > balance.daycare.maxSlots) {
    add('error', 'balance', null, 'Pensions : emplacements initiaux > maximum');
  }
  if (balance.battles.initialSlots > balance.battles.maxSlots) {
    add('error', 'balance', null, 'Combats : emplacements initiaux > maximum');
  }
  if (balance.battles.minWinChance > balance.battles.maxWinChance) {
    add('error', 'balance', null, 'Combats : probabilité de victoire minimale > maximale');
  }
  for (const stack of balance.newPlayer.startingInventory) {
    if (!itemIds.has(stack.itemId)) {
      add('error', 'balance', null, `Inventaire de départ : objet « ${stack.itemId} » inconnu`);
    }
  }
  if (balance.evolution.tradeItemId && !itemIds.has(balance.evolution.tradeItemId)) {
    add(
      'error',
      'balance',
      null,
      `Évolutions : objet de remplacement de l’échange « ${balance.evolution.tradeItemId} » inconnu`,
    );
  }
  if (balance.evolution.dayStartHour === balance.evolution.nightStartHour) {
    add('error', 'balance', null, 'Évolutions : le jour et la nuit commencent à la même heure');
  }
  const ballIds = new Set(
    content.items.filter((i) => i.effects.some((e) => e.type === 'ball')).map((i) => i.id),
  );
  if (ballIds.size === 0)
    add('warning', 'item', null, 'Aucun objet n’a l’effet « Ball » : capture impossible');
  if (!balance.newPlayer.startingInventory.some((s) => ballIds.has(s.itemId))) {
    add('warning', 'balance', null, 'Les nouveaux joueurs ne reçoivent aucune Ball');
  }

  // Régions
  const sortedRegions = [...content.regions].sort((a, b) => a.order - b.order);
  if (sortedRegions.length === 0) add('error', 'region', null, 'Aucune région');
  for (const region of content.regions) {
    const unknown = region.speciesIds.filter((id) => !getSpecies(id));
    if (unknown.length > 0) {
      add('error', 'region', region.id, `Espèces inconnues : ${unknown.join(', ')}`);
    }
    const included = new Set(region.speciesIds);
    const outside = region.starterSpeciesIds.filter((id) => !included.has(id));
    if (outside.length > 0) {
      add('error', 'region', region.id, `Starters hors de la région : ${outside.join(', ')}`);
    }
    checkUnlock('region', region.id, region.unlock);
    if (!content.zones.some((z) => z.regionId === region.id)) {
      add('warning', 'region', region.id, 'Aucune zone d’expédition dans cette région');
    }
  }
  // Les nouveaux joueurs commencent dans la première région active.
  const first = sortedRegions.find((r) => r.enabled);
  if (sortedRegions.length > 0 && !first) add('error', 'region', null, 'Aucune région active');
  if (first && first.starterSpeciesIds.length === 0) {
    add('error', 'region', first.id, 'La première région active doit proposer au moins un starter');
  }

  // Surcharges d'espèces
  for (const o of content.speciesOverrides) {
    if (!getSpecies(o.speciesId)) add('error', 'speciesOverride', o.speciesId, 'Espèce inconnue');
  }

  // Objets
  for (const item of content.items) {
    const types = item.effects.map((e) => e.type);
    if (new Set(types).size !== types.length) {
      add('warning', 'item', item.id, 'Plusieurs effets du même type');
    }
    for (const effect of item.effects) {
      if (effect.type === 'mint' && !KNOWN_NATURES.has(effect.nature)) {
        add('error', 'item', item.id, `Aromate : nature « ${effect.nature} » inconnue`);
      }
      if (effect.type === 'fossil') {
        if (!getSpecies(effect.speciesId)) {
          add('error', 'item', item.id, `Fossile : espèce ${effect.speciesId} inconnue`);
        }
        const form = formError(effect);
        if (form) add('error', 'item', item.id, `Fossile : ${form}`);
      }
    }
  }

  // Tables de butin
  for (const table of content.lootTables) {
    for (const entry of table.entries) {
      if (!itemIds.has(entry.itemId)) {
        add('error', 'lootTable', table.id, `Objet « ${entry.itemId} » inconnu`);
      }
    }
    if (table.entries.length === 0) add('warning', 'lootTable', table.id, 'Table vide');
    const used =
      content.zones.some((z) => z.lootTableId === table.id) ||
      content.trainers.some((t) => t.lootTableId === table.id);
    if (!used) {
      add('warning', 'lootTable', table.id, 'Table utilisée nulle part');
    }
  }

  // Zones
  const durations = new Set(balance.expeditions.durationsMinutes);
  for (const zone of content.zones) {
    const region = content.regions.find((r) => r.id === zone.regionId);
    if (!region) add('error', 'zone', zone.id, `Région « ${zone.regionId} » inconnue`);
    if (zone.lootTableId && !lootTableIds.has(zone.lootTableId)) {
      add('error', 'zone', zone.id, `Table de butin « ${zone.lootTableId} » inconnue`);
    }
    if (!zone.lootTableId) add('warning', 'zone', zone.id, 'Aucune table de butin');
    for (const t of [...zone.affinityTypes, ...zone.requiredTypes.map((r) => r.type)]) {
      if (!KNOWN_TYPES.has(t)) add('error', 'zone', zone.id, `Type « ${t} » inconnu`);
    }
    const requiredCount = zone.requiredTypes.reduce((sum, r) => sum + r.count, 0);
    if (requiredCount > balance.expeditions.maxTeamSize) {
      add('error', 'zone', zone.id, 'Plus de Pokémon requis que la taille d’équipe maximale');
    }
    const odd = zone.durationsMinutes.filter((d) => !durations.has(d));
    if (odd.length > 0) {
      add('warning', 'zone', zone.id, `Durées hors des réglages globaux : ${odd.join(', ')} min`);
    }
    checkUnlock('zone', zone.id, zone.unlock);

    // Les Pokémon des régions précédentes peuvent apparaître (Kanto à Johto), pas les suivants.
    const included = new Set(
      content.regions
        .filter((r) => region && (r.id === region.id || r.order < region.order))
        .flatMap((r) => r.speciesIds),
    );
    let enabledCount = 0;
    for (const e of zone.encounters) {
      const species = getSpecies(e.speciesId);
      if (!species) {
        add('error', 'zone', zone.id, `Espèce ${e.speciesId} inconnue`);
        continue;
      }
      const formIssue = formError(e);
      if (formIssue) add('error', 'zone', zone.id, formIssue);
      if (disabled.has(e.speciesId)) {
        add('warning', 'zone', zone.id, `${species.nameFr} est désactivé : rencontre ignorée`);
      } else {
        enabledCount++;
      }
      if (species.isLegendary || species.isMythical) {
        add(
          'warning',
          'zone',
          zone.id,
          `${species.nameFr} est légendaire/mythique (réservé aux quêtes)`,
        );
      }
      if (region && !included.has(e.speciesId)) {
        add(
          'warning',
          'zone',
          zone.id,
          `${species.nameFr} n’appartient ni à la région ni à une région précédente`,
        );
      }
    }
    if (enabledCount === 0) add('error', 'zone', zone.id, 'Aucune rencontre active');
  }

  // Dresseurs
  for (const trainer of content.trainers) {
    const report = (severity: ContentIssue['severity'], message: string) =>
      add(severity, 'trainer', trainer.id, message);
    if (!regionIds.has(trainer.regionId))
      report('error', `Région « ${trainer.regionId} » inconnue`);
    if (trainer.zoneId && !zoneIds.has(trainer.zoneId)) {
      report('error', `Zone « ${trainer.zoneId} » inconnue`);
    }
    if (trainer.lootTableId && !lootTableIds.has(trainer.lootTableId)) {
      report('error', `Table de butin « ${trainer.lootTableId} » inconnue`);
    }
    if (trainer.lootTableId && trainer.lootRolls === 0) {
      report('warning', 'Table de butin choisie mais aucun tirage');
    }
    for (const member of trainer.team) {
      if (!getSpecies(member.speciesId)) report('error', `Espèce ${member.speciesId} inconnue`);
      const formIssue = formError(member);
      if (formIssue) report('error', formIssue);
      if (member.nature && !KNOWN_NATURES.has(member.nature)) {
        report('error', `Nature « ${member.nature} » inconnue`);
      }
    }
    const { rules } = trainer;
    for (const t of [...rules.forbiddenTypes, ...rules.requiredTypes.map((r) => r.type)]) {
      if (!KNOWN_TYPES.has(t)) report('error', `Type « ${t} » inconnu`);
    }
    if (rules.requiredTypes.some((r) => rules.forbiddenTypes.includes(r.type))) {
      report('error', 'Un type est à la fois imposé et interdit');
    }
    if (rules.teamSize && rules.teamSize > balance.battles.maxTeamSize) {
      report('error', 'Nombre de Pokémon imposé supérieur à la taille d’équipe maximale');
    }
    const places = rules.teamSize ?? balance.battles.maxTeamSize;
    if (rules.requiredTypes.reduce((sum, r) => sum + r.count, 0) > places) {
      report('error', 'Plus de Pokémon de types imposés que de places dans l’équipe');
    }
    if (trainer.badge && trainer.repeatable) {
      report(
        'warning',
        'Badge sur un dresseur répétable : il n’est donné qu’à la première victoire',
      );
    }
    if (trainer.money === 0 && !trainer.lootTableId && !trainer.badge) {
      report('warning', 'Aucune récompense de victoire');
    }
    checkUnlock('trainer', trainer.id, trainer.unlock);
  }

  // Boutique
  for (const category of content.shopCategories) {
    if (!content.shopEntries.some((e) => e.categoryId === category.id)) {
      add('warning', 'shopCategory', category.id, 'Catégorie sans article');
    }
  }
  for (const entry of content.shopEntries) {
    const report = (severity: ContentIssue['severity'], message: string) =>
      add(severity, 'shopEntry', entry.id, message);
    if (!itemIds.has(entry.itemId)) report('error', `Objet « ${entry.itemId} » inconnu`);
    if (!shopCategoryIds.has(entry.categoryId)) {
      report('error', `Catégorie « ${entry.categoryId} » inconnue`);
    }
    if (entry.price === 0) report('warning', 'Article gratuit');
    if (entry.enabled && entry.availableUntil && Date.parse(entry.availableUntil) < Date.now()) {
      report('warning', 'Date de fin dépassée : l’article n’est plus proposé');
    }
    checkUnlock('shopEntry', entry.id, entry.unlock);
  }

  // Évolutions
  for (const o of content.evolutionOverrides) {
    const report = (severity: ContentIssue['severity'], message: string) =>
      add(severity, 'evolutionOverride', o.id, message);
    if (!getSpecies(o.fromSpeciesId)) report('error', `Espèce ${o.fromSpeciesId} inconnue`);
    if (!getSpecies(o.toSpeciesId)) report('error', `Espèce ${o.toSpeciesId} inconnue`);
    for (const m of o.methods) {
      if (m.itemId && !itemIds.has(m.itemId)) report('error', `Objet « ${m.itemId} » inconnu`);
    }
  }

  // Progression
  for (const m of content.dexMilestones) {
    if (m.regionId && !regionIds.has(m.regionId)) {
      add('error', 'dexMilestone', m.id, `Région « ${m.regionId} » inconnue`);
    }
    checkReward('dexMilestone', m.id, m.rewards);
  }
  for (const c of content.collections) {
    const unknown = c.speciesIds.filter((id) => !getSpecies(id));
    if (unknown.length > 0) {
      add('error', 'collection', c.id, `Espèces inconnues : ${unknown.join(', ')}`);
    }
    if (new Set(c.speciesIds).size !== c.speciesIds.length) {
      add('warning', 'collection', c.id, 'Espèce en double dans la liste');
    }
    checkReward('collection', c.id, c.rewards);
  }
  // Quêtes
  for (const quest of content.quests) {
    if (quest.regionId && !regionIds.has(quest.regionId)) {
      add('error', 'quest', quest.id, `Région « ${quest.regionId} » inconnue`);
    }
    checkUnlock('quest', quest.id, quest.unlock);
    quest.steps.forEach((step, i) => checkQuestCondition(quest.id, i, step.condition));
    checkQuestReward(quest.id, quest.rewards);
  }

  const rewards = [...content.dexMilestones, ...content.collections, ...content.quests].map(
    (r) => r.rewards,
  );
  const slotTotal = (key: 'expeditionSlots' | 'battleSlots' | 'daycareSlots') =>
    rewards.reduce((sum, r) => sum + r[key], 0);
  for (const [key, group, label] of [
    ['expeditionSlots', balance.expeditions, 'd’expédition'],
    ['battleSlots', balance.battles, 'de combat'],
    ['daycareSlots', balance.daycare, 'de pension'],
  ] as const) {
    const unreachable = group.initialSlots + slotTotal(key) - group.maxSlots;
    if (unreachable > 0) {
      add(
        'warning',
        'balance',
        null,
        `Progression : ${unreachable} emplacement(s) ${label} au-delà du maximum (sans effet)`,
      );
    }
  }

  return issues;
}

/** Contenu complet : structure + références croisées (erreurs bloquantes). */
export const gameContentSchema = gameContentStructureSchema.superRefine((content, ctx) => {
  for (const issue of contentIssues(content)) {
    if (issue.severity !== 'error') continue;
    ctx.addIssue({
      code: 'custom',
      message: issue.message,
      path: issue.entityId ? [issue.entity, issue.entityId] : [issue.entity],
    });
  }
});

/**
 * Entités qui portent une condition de déblocage, et étapes de quête (avec un libellé pour les
 * usages).
 */
const unlockables = (content: GameContentData): { unlock: QuestCondition; name: string }[] =>
  [
    ...content.regions,
    ...content.zones,
    ...content.trainers,
    ...content.shopEntries.map((e) => ({
      unlock: e.unlock,
      name: `Article ${content.items.find((i) => i.id === e.itemId)?.name ?? e.itemId} (${e.id})`,
    })),
    ...content.quests,
    ...content.quests.flatMap((q) =>
      q.steps.map((s, i) => ({ unlock: s.condition, name: `Quête ${q.name}, étape ${i + 1}` })),
    ),
  ].flatMap((e) => unlockParts(e.unlock).map((unlock) => ({ unlock, name: e.name })));

/** Où une entité est-elle utilisée ? (avant suppression : intégrité des références) */
export function findUsages(
  content: GameContentData,
  entity: ContentEntityKind,
  id: string | number,
): string[] {
  const usages: string[] = [];
  switch (entity) {
    case 'item':
      if (content.balance.newPlayer.startingInventory.some((s) => s.itemId === id)) {
        usages.push('Équilibrage : inventaire de départ');
      }
      for (const t of content.lootTables) {
        if (t.entries.some((e) => e.itemId === id)) usages.push(`Table de butin « ${t.name} »`);
      }
      for (const e of content.shopEntries) {
        if (e.itemId === id) usages.push(`Article de boutique « ${e.id} »`);
      }
      if (content.balance.evolution.tradeItemId === id) {
        usages.push('Équilibrage : objet qui remplace l’échange');
      }
      for (const o of content.evolutionOverrides) {
        if (o.methods.some((m) => m.itemId === id)) usages.push(`Évolution « ${o.id} »`);
      }
      for (const m of content.dexMilestones) {
        if (m.rewards.items.some((s) => s.itemId === id)) usages.push(`Palier « ${m.name} »`);
      }
      for (const c of content.collections) {
        if (c.rewards.items.some((s) => s.itemId === id)) usages.push(`Collection « ${c.name} »`);
      }
      for (const q of content.quests) {
        if (q.rewards.items.some((s) => s.itemId === id)) usages.push(`Quête « ${q.name} »`);
      }
      break;
    case 'shopCategory':
      for (const e of content.shopEntries) {
        if (e.categoryId === id) usages.push(`Article de boutique « ${e.id} »`);
      }
      break;
    case 'lootTable':
      for (const z of content.zones) {
        if (z.lootTableId === id) usages.push(`Zone « ${z.name} »`);
      }
      for (const t of content.trainers) {
        if (t.lootTableId === id) usages.push(`Dresseur « ${t.name} »`);
      }
      break;
    case 'region': {
      for (const z of content.zones) {
        if (z.regionId === id) usages.push(`Zone « ${z.name} »`);
      }
      for (const t of content.trainers) {
        if (t.regionId === id) usages.push(`Dresseur « ${t.name} »`);
      }
      for (const m of content.dexMilestones) {
        if (m.regionId === id) usages.push(`Palier « ${m.name} »`);
      }
      for (const q of content.quests) {
        if (q.regionId === id) usages.push(`Quête « ${q.name} »`);
      }
      const unlocks = unlockables(content).filter(
        (e) => e.unlock.type === 'regionDexPercent' && e.unlock.regionId === id,
      );
      for (const e of unlocks) usages.push(`Condition de déblocage de « ${e.name} »`);
      break;
    }
    case 'zone': {
      for (const t of content.trainers) {
        if (t.zoneId === id) usages.push(`Dresseur « ${t.name} »`);
      }
      const steps = unlockables(content).filter(
        (e) => e.unlock.type === 'expedition' && e.unlock.zoneId === id,
      );
      for (const e of steps) usages.push(e.name);
      break;
    }
    case 'quest': {
      const unlocks = unlockables(content).filter(
        (e) =>
          (e.unlock.type === 'questStepsDone' || e.unlock.type === 'questCompleted') &&
          e.unlock.questId === id,
      );
      for (const e of unlocks) usages.push(`Condition de « ${e.name} »`);
      break;
    }
    case 'trainer': {
      const unlocks = unlockables(content).filter(
        (e) => e.unlock.type === 'trainerDefeated' && e.unlock.trainerId === id,
      );
      for (const e of unlocks) usages.push(`Condition de déblocage de « ${e.name} »`);
      break;
    }
    case 'speciesOverride':
    case 'shopEntry':
    case 'evolutionOverride':
    case 'dexMilestone':
    case 'collection':
    case 'balance':
      break;
  }
  return usages;
}
