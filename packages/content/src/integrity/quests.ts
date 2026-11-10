import { getSpecies, pokemonTypes } from '@poke/data';
import { isRoamingZone, unlockParts } from '../schemas';
import type { QuestCondition, QuestReward } from '../schemas';
import { KNOWN_TYPES, formError } from './context';
import type { IntegrityCheck } from './context';
import type { ContentIssue } from './types';

type Report = (severity: ContentIssue['severity'], message: string) => void;
type CatchStep = Extract<QuestCondition, { type: 'catchPokemon' }>;
type ExpeditionStep = Extract<QuestCondition, { type: 'expedition' | 'questItem' }>;
type UnlockStep = Exclude<QuestCondition, CatchStep | ExpeditionStep>;

/** Étape « capturer » : type, zone et espèce connus, et le Pokémon demandé apparaît bien. */
function checkCatchStep(
  check: IntegrityCheck,
  regionId: string | null,
  condition: CatchStep,
  report: Report,
): void {
  const { content } = check;
  if (condition.pokemonType && !KNOWN_TYPES.has(condition.pokemonType)) {
    report('error', `type « ${condition.pokemonType} » inconnu`);
  }
  const zone = condition.zoneId ? content.zones.find((z) => z.id === condition.zoneId) : undefined;
  if (condition.zoneId && !zone) report('error', `zone « ${condition.zoneId} » inconnue`);
  // Sans zone précise, les captures ne comptent que dans la région de la quête.
  const places = zone
    ? [zone]
    : content.zones.filter((z) => regionId === null || z.regionId === regionId);
  const where = zone ? zone.name : regionId === null ? 'aucune zone' : `la région ${regionId}`;
  if (condition.speciesId === null) {
    if (
      (zone || !condition.zoneId) &&
      condition.pokemonType &&
      !places.some((z) =>
        z.encounters.some((e) =>
          pokemonTypes(e.speciesId, e.formId).includes(condition.pokemonType!),
        ),
      )
    ) {
      report('warning', `aucun Pokémon du type demandé n’apparaît dans ${where}`);
    }
    return;
  }
  const species = getSpecies(condition.speciesId);
  if (!species) {
    report('error', `espèce ${condition.speciesId} inconnue`);
  } else if (condition.pokemonType && !species.types.includes(condition.pokemonType)) {
    report('error', `${species.nameFr} n’est pas du type demandé`);
  } else if (
    (zone || !condition.zoneId) &&
    !places.some((z) => z.encounters.some((e) => e.speciesId === species.id))
  ) {
    report('warning', `${species.nameFr} n’apparaît pas dans ${where}`);
  }
}

/** Étape « partir en expédition » (ou y trouver un objet de quête) : zone, équipe exigée, météo. */
function checkExpeditionStep(
  check: IntegrityCheck,
  condition: ExpeditionStep,
  report: Report,
): void {
  const { content, balance, zoneIds } = check;
  if (!zoneIds.has(condition.zoneId)) report('error', `zone « ${condition.zoneId} » inconnue`);
  if (condition.memberType && !KNOWN_TYPES.has(condition.memberType)) {
    report('error', `type « ${condition.memberType} » inconnu`);
  }
  if (
    Math.max(condition.memberCount, condition.speciesIds.length) > balance.expeditions.maxTeamSize
  ) {
    report('error', 'plus de Pokémon requis que la taille d’équipe maximale');
  }
  const zone = content.zones.find((z) => z.id === condition.zoneId);
  // Seuls les Pokémon du Pokédex de la région de la zone partent en expédition.
  const zoneRegion = content.regions.find((r) => r.id === zone?.regionId);
  for (const speciesId of condition.speciesIds) {
    const species = getSpecies(speciesId);
    if (!species) report('error', `espèce ${speciesId} inconnue`);
    else if (zoneRegion && !zoneRegion.speciesIds.includes(speciesId)) {
      report(
        'warning',
        `${species.nameFr} n’est pas du Pokédex de ${zoneRegion.name} : il ne peut pas y partir en expédition`,
      );
    }
  }
  for (const w of condition.weathers) {
    if (w !== 'clear' && zone && !zone.weathers.some((zw) => zw.weather === w && zw.weight > 0)) {
      report('warning', `la météo « ${w} » ne tombe jamais sur ${zone.name}`);
    }
  }
  if (condition.type === 'questItem') {
    const item = content.items.find((i) => i.id === condition.itemId);
    if (!item) report('error', `objet « ${condition.itemId} » inconnu`);
    else if (item.category !== 'quest') {
      report('warning', `« ${item.name} » n’est pas un objet de quête`);
    }
  }
}

/** Étape faite d'une condition de déblocage ; seuls les dresseurs de la quête s'y affrontent. */
function checkUnlockStep(
  check: IntegrityCheck,
  id: string,
  condition: UnlockStep,
  report: Report,
): void {
  const { content, checkUnlock } = check;
  checkUnlock('quest', id, condition);
  // Seuls les dresseurs de la quête s'affrontent dans ses étapes (pas de Champion…).
  for (const part of unlockParts(condition)) {
    if (part.type !== 'trainerDefeated') continue;
    const trainer = content.trainers.find((t) => t.id === part.trainerId);
    if (trainer && trainer.questId !== id) {
      report('error', `« ${trainer.name} » n’est pas un dresseur de cette quête`);
    }
  }
}

/** Condition d'étape de quête : brique de déblocage ou action (captures, expédition). */
function checkQuestCondition(
  check: IntegrityCheck,
  id: string,
  regionId: string | null,
  step: number,
  condition: QuestCondition,
): void {
  const report: Report = (severity, message) =>
    check.add(severity, 'quest', id, `Étape ${step + 1} : ${message}`);
  switch (condition.type) {
    case 'catchPokemon':
      return checkCatchStep(check, regionId, condition, report);
    case 'expedition':
    case 'questItem':
      return checkExpeditionStep(check, condition, report);
    default:
      return checkUnlockStep(check, id, condition, report);
  }
}

/** Récompense d'une quête : objets et bonus, puis espèces et formes des Pokémon offerts. */
function checkQuestReward(check: IntegrityCheck, id: string, reward: QuestReward): void {
  const { add, checkReward } = check;
  checkReward('quest', id, reward);
  for (const p of reward.pokemon) {
    if (!getSpecies(p.speciesId)) {
      add('error', 'quest', id, `Récompense : espèce ${p.speciesId} inconnue`);
    }
    const formIssue = formError(p);
    if (formIssue) add('error', 'quest', id, `Récompense : ${formIssue}`);
  }
}

/**
 * Quêtes : conditions des étapes (briques de déblocage ou actions comptées), récompenses,
 * Pokémon fuyards et combats légendaires.
 */
export function checkQuests(check: IntegrityCheck): void {
  const { content, balance, add, checkUnlock, regionIds } = check;
  for (const quest of content.quests) {
    if (quest.regionId && !regionIds.has(quest.regionId)) {
      add('error', 'quest', quest.id, `Région « ${quest.regionId} » inconnue`);
    }
    checkUnlock('quest', quest.id, quest.unlock);
    quest.steps.forEach((step, i) =>
      checkQuestCondition(check, quest.id, quest.regionId, i, step.condition),
    );
    checkQuestReward(check, quest.id, quest.rewards);
    if (quest.rewards.pokemon.some((p) => p.roaming !== null)) {
      if (!quest.regionId) {
        add('error', 'quest', quest.id, 'Pokémon fuyard : la quête doit avoir une région');
      } else if (!content.zones.some((z) => z.regionId === quest.regionId && isRoamingZone(z))) {
        add('warning', 'quest', quest.id, 'Pokémon fuyard : aucune zone ordinaire dans la région');
      }
    }
    for (const { battle, roaming } of quest.rewards.pokemon) {
      if (roaming !== null) continue;
      for (const t of battle.requiredTypes.map((r) => r.type)) {
        if (!KNOWN_TYPES.has(t)) add('error', 'quest', quest.id, `Type « ${t} » inconnu`);
      }
      const requiredCount = battle.requiredTypes.reduce((sum, r) => sum + r.count, 0);
      if (requiredCount > balance.battles.maxTeamSize) {
        add(
          'error',
          'quest',
          quest.id,
          'Combat légendaire : plus de Pokémon requis que la taille d’équipe maximale',
        );
      }
    }
  }
}
