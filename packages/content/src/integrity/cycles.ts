import { unlockParts } from '../schemas';
import type { QuestCondition } from '../schemas';
import type { IntegrityCheck } from './context';
import type { ContentEntityKind } from './types';

/**
 * Dépendances en boucle entre conditions de déblocage : une zone ouverte par une quête dont une
 * étape se joue dans cette zone, deux dresseurs qui s'attendent l'un l'autre… Personne ne peut plus
 * rien y débloquer. Une entité qui dépend d'elle-même est déjà signalée par son propre contrôle :
 * seules les boucles entre au moins deux entités le sont ici.
 *
 * Un nœud par région, zone, dresseur et quête (sa condition d'apparition), plus un par étape de
 * quête (« les n premières étapes validées »), les étapes se validant dans l'ordre.
 */

interface GraphNode {
  kind: ContentEntityKind;
  id: string;
  label: string;
  deps: string[];
}

const stepKey = (questId: string, index: number) => `step:${questId}:${index}`;

/** Le graphe : chaque nœud et les nœuds dont il attend la condition. */
function dependencyGraph(check: IntegrityCheck): Map<string, GraphNode> {
  const { content, questsById } = check;
  const nodes = new Map<string, GraphNode>();
  const depsOf = (condition: QuestCondition): string[] => {
    const deps: string[] = [];
    for (const part of unlockParts(condition)) {
      if (part.type === 'trainerDefeated') deps.push(`trainer:${part.trainerId}`);
      if (part.type === 'regionUnlocked') deps.push(`region:${part.regionId}`);
      if (part.type === 'questStepsDone' || part.type === 'questCompleted') {
        const quest = questsById.get(part.questId);
        if (!quest) continue;
        const done = part.type === 'questCompleted' ? quest.steps.length : part.count;
        deps.push(stepKey(quest.id, Math.min(done, quest.steps.length) - 1));
      }
      if ('zoneId' in part && part.zoneId) deps.push(`zone:${part.zoneId}`);
    }
    return deps;
  };
  for (const r of content.regions) {
    nodes.set(`region:${r.id}`, {
      kind: 'region',
      id: r.id,
      label: `région « ${r.name} »`,
      deps: depsOf(r.unlock),
    });
  }
  for (const z of content.zones) {
    nodes.set(`zone:${z.id}`, {
      kind: 'zone',
      id: z.id,
      label: `zone « ${z.name} »`,
      deps: depsOf(z.unlock),
    });
  }
  for (const t of content.trainers) {
    // Un dresseur de quête n'apparaît qu'une fois sa quête commencée.
    const deps = [...depsOf(t.unlock), ...(t.questId ? [`quest:${t.questId}`] : [])];
    nodes.set(`trainer:${t.id}`, {
      kind: 'trainer',
      id: t.id,
      label: `dresseur « ${t.name} »`,
      deps,
    });
  }
  for (const q of content.quests) {
    const label = `quête « ${q.name} »`;
    nodes.set(`quest:${q.id}`, { kind: 'quest', id: q.id, label, deps: depsOf(q.unlock) });
    q.steps.forEach((step, i) => {
      const previous = i === 0 ? `quest:${q.id}` : stepKey(q.id, i - 1);
      nodes.set(stepKey(q.id, i), {
        kind: 'quest',
        id: q.id,
        label: `${label} (étape ${i + 1})`,
        deps: [previous, ...depsOf(step.condition)],
      });
    });
  }
  return nodes;
}

/** Composantes fortement connexes (Tarjan), dans l'ordre de découverte. */
function stronglyConnected(nodes: Map<string, GraphNode>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let counter = 0;
  const visit = (key: string) => {
    index.set(key, counter);
    low.set(key, counter);
    counter++;
    stack.push(key);
    onStack.add(key);
    for (const dep of nodes.get(key)!.deps) {
      if (!nodes.has(dep)) continue;
      if (!index.has(dep)) {
        visit(dep);
        low.set(key, Math.min(low.get(key)!, low.get(dep)!));
      } else if (onStack.has(dep)) {
        low.set(key, Math.min(low.get(key)!, index.get(dep)!));
      }
    }
    if (low.get(key) !== index.get(key)) return;
    const component: string[] = [];
    let popped: string;
    do {
      popped = stack.pop()!;
      onStack.delete(popped);
      component.push(popped);
    } while (popped !== key);
    components.push(component.reverse());
  };
  for (const key of nodes.keys()) if (!index.has(key)) visit(key);
  return components;
}

/** Boucles de dépendances entre entités : erreur, signalée sur la première entité de la boucle. */
export function checkUnlockCycles(check: IntegrityCheck): void {
  const nodes = dependencyGraph(check);
  for (const component of stronglyConnected(nodes)) {
    const members = component.map((key) => nodes.get(key)!);
    const entities = new Set(members.map((n) => `${n.kind}:${n.id}`));
    if (entities.size < 2) continue;
    const first = members[0]!;
    check.add(
      'error',
      first.kind,
      first.id,
      `Dépendances en boucle entre ${members.map((n) => n.label).join(', ')} : chacune attend une autre, aucune ne peut se débloquer`,
    );
  }
}
