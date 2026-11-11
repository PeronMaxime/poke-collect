import { useMemo, useState } from 'react';
import type { GameContext } from '@poke/game-core';
import type { ExpeditionDto } from '@poke/shared';
import { Modal, PokemonSprite } from '../../components/ui';
import { speciesName } from '../../lib/labels';
import { readStoredJson, writeStoredJson } from '../../lib/storage';

/** Fuyards déjà annoncés au joueur, sous la forme `<expédition>:<quête>`. */
const SEEN_KEY = 'dex.roamersSeen';

function readSeen(): Set<string> {
  const raw = readStoredJson(SEEN_KEY);
  return new Set(Array.isArray(raw) ? (raw as string[]) : []);
}

/** Sans stockage, l'annonce revient au prochain chargement : sans gravité. */
const writeSeen = (seen: Iterable<string>) => writeStoredJson(SEEN_KEY, [...seen]);

/** Pokémon fuyard d'une quête (le premier de sa récompense qui erre). */
function roamerOf(ctx: GameContext, questId: string) {
  return ctx.quest(questId)?.rewards.pokemon.find((p) => p.roaming != null);
}

/** Nom du fuyard d'une quête ; l'identifiant de la quête s'il est introuvable. */
export function roamerName(ctx: GameContext, questId: string) {
  const p = roamerOf(ctx, questId);
  return p ? speciesName(ctx, p.speciesId, p.formId) : questId;
}

/**
 * Annonce, au milieu de l'écran et quel que soit l'onglet ouvert, qu'une expédition en cours a
 * croisé un Pokémon fuyard. Rien sur la capture : son issue se découvre à la réclamation.
 */
export function RoamerSightingNotice({
  ctx,
  expeditions,
}: {
  ctx: GameContext | undefined;
  expeditions: ExpeditionDto[] | undefined;
}) {
  const [seen, setSeen] = useState(readSeen);
  const sightings = useMemo(
    () =>
      (expeditions ?? []).flatMap((e) =>
        e.roamersMet.map((questId) => ({ key: `${e.id}:${questId}`, expedition: e, questId })),
      ),
    [expeditions],
  );
  const unseen = sightings.filter((s) => !seen.has(s.key));

  const close = () => {
    // Ne garde que les expéditions en cours : les réclamées ou annulées sont oubliées.
    const next = new Set(sightings.map((s) => s.key));
    writeSeen(next);
    setSeen(next);
  };

  if (!ctx) return null;
  return (
    <Modal open={unseen.length > 0} onClose={close} className="dialog-box relative">
      {/* Flèche qui clignote, comme au bas des boîtes de texte des anciens jeux. */}
      <svg
        viewBox="0 0 7 5"
        width="14"
        height="10"
        shapeRendering="crispEdges"
        aria-hidden
        className="animate-blink absolute right-5 bottom-4 text-brand-500"
      >
        <path d="M0 0h7v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1z" fill="currentColor" />
      </svg>
      <div className="p-6 text-center">
        <p className="text-sm font-medium text-amber-600">✦ Pokémon fuyard croisé !</p>
        <div className="mt-3 flex justify-center gap-2">
          {unseen.map((s) => {
            const p = roamerOf(ctx, s.questId);
            return p ? (
              <PokemonSprite key={s.key} speciesId={p.speciesId} formId={p.formId} size={96} />
            ) : null;
          })}
        </div>
        <div className="mt-3 space-y-1">
          {unseen.map((s) => {
            const zone = s.expedition.zoneId ? ctx.zone(s.expedition.zoneId) : undefined;
            return (
              <p key={s.key}>
                Votre expédition {zone ? `« ${zone.name} »` : 'en cours'} a croisé{' '}
                <strong>{roamerName(ctx, s.questId)}</strong>.
              </p>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Vous saurez au retour de l'expédition s'il a été capturé.
        </p>
        <button type="button" className="btn-primary mt-4" onClick={close}>
          Compris
        </button>
      </div>
    </Modal>
  );
}
