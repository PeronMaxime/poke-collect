import { getSpecies } from '@poke/data';
import { unlockParts } from '../schemas';
import { KNOWN_TYPES, KNOWN_NATURES, formError } from './context';
import type { IntegrityCheck } from './context';
import type { ContentIssue } from './types';

/** Dresseurs : lieux, équipe, règles d'équipe, récompenses, dresseurs de quête. */
export function checkTrainers(check: IntegrityCheck): void {
  const { content, balance, add, checkUnlock, regionIds, lootTableIds, zoneIds, questsById } =
    check;
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
    if (trainer.questId) {
      const quest = questsById.get(trainer.questId);
      if (!quest) report('error', `Quête « ${trainer.questId} » inconnue`);
      else {
        const asked = quest.steps.some((s) =>
          unlockParts(s.condition).some(
            (p) => p.type === 'trainerDefeated' && p.trainerId === trainer.id,
          ),
        );
        if (!asked) {
          report(
            'warning',
            `Aucune étape de la quête « ${quest.name} » ne demande de le battre : il n’apparaîtra jamais`,
          );
        }
        if (quest.regionId && quest.regionId !== trainer.regionId) {
          report('warning', `Pas dans la région de la quête « ${quest.name} »`);
        }
      }
      if (trainer.repeatable) report('error', 'Un dresseur de quête ne se bat qu’une fois');
      if (trainer.badge) report('error', 'Un dresseur de quête ne donne pas de badge');
    }
  }
}
