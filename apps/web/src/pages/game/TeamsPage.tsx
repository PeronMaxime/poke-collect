import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { motion } from 'motion/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { memberPower } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { MAX_TEAMS, TEAM_MAX_SIZE, TEAM_NAME_MAX } from '@poke/shared';
import type { PokemonDto, PokemonTeamDto, TeamInput } from '@poke/shared';
import { PokemonSprite, ShinyStar } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, usePokemon, useTeams } from '../../lib/game';
import { errorText } from '../../lib/labels';
import { ProgressiveItems } from '../../components/ProgressiveGrid';
import { PcFilterBar, PcPokemonCard, usePcBrowser } from './PcBrowser';
import { MEGA_LOCKED_TITLE, megaLocked } from './TeamPicker';

/** Équipe en cours de construction : `id` null = nouvelle équipe. */
interface Draft {
  id: string | null;
  name: string;
  pokemonIds: string[];
}

/**
 * Équipes enregistrées : construites ici depuis le PC (mêmes filtres), puis choisies d'un clic au
 * départ d'une expédition, d'un combat ou d'un donjon. Un Pokémon n'est que dans une équipe.
 */
export function TeamsPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const pokemon = usePokemon();
  const teams = useTeams();
  const browser = usePcBrowser(ctx, pokemon.data ?? []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saved = teams.data ?? [];
  const byId = new Map((pokemon.data ?? []).map((p) => [p.id, p]));
  // Équipe de chaque Pokémon déjà rangé ailleurs que dans l'équipe en cours de modification.
  const teamOf = new Map<string, PokemonTeamDto>();
  for (const t of saved) {
    if (t.id === draft?.id) continue;
    for (const id of t.pokemonIds) teamOf.set(id, t);
  }
  const members = draft?.pokemonIds.flatMap((id) => byId.get(id) ?? []) ?? [];
  const powerOf = (list: readonly PokemonDto[]) =>
    list.reduce((sum, p) => sum + memberPower(ctx, p), 0);

  const save = useMutation({
    mutationFn: ({ id, ...input }: Draft) =>
      api<PokemonTeamDto>(id ? `/api/teams/${id}` : '/api/teams', {
        method: id ? 'PUT' : 'POST',
        json: input satisfies TeamInput,
      }),
    onSuccess: () => {
      setDraft(null);
      return queryClient.invalidateQueries({ queryKey: keys.teams });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDraft(null);
      return queryClient.invalidateQueries({ queryKey: keys.teams });
    },
  });

  function open(next: Draft | null) {
    setDraft(next);
    setConfirmDelete(false);
    save.reset();
    remove.reset();
  }

  function newDraft(pokemonIds: string[] = []): Draft {
    const names = new Set(saved.map((t) => t.name));
    let n = saved.length + 1;
    while (names.has(`Équipe ${n}`)) n++;
    return { id: null, name: `Équipe ${n}`, pokemonIds };
  }

  /** Clic sur un Pokémon du PC : l'ajoute à l'équipe en cours (ou en commence une), ou l'en retire. */
  function toggle(p: PokemonDto) {
    if (teamOf.has(p.id) || megaLocked(p, members)) return;
    if (!draft) {
      if (saved.length < MAX_TEAMS) open(newDraft([p.id]));
      return;
    }
    const ids = draft.pokemonIds;
    setDraft({
      ...draft,
      pokemonIds: ids.includes(p.id)
        ? ids.filter((id) => id !== p.id)
        : ids.length < TEAM_MAX_SIZE
          ? [...ids, p.id]
          : ids,
    });
  }

  function move(index: number, delta: number) {
    if (!draft) return;
    const ids = [...draft.pokemonIds];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setDraft({ ...draft, pokemonIds: ids });
  }

  const error = save.error ?? remove.error;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Équipes enregistrées</h2>
          <p className="text-sm text-slate-500">
            Choisis une équipe d'un clic au départ d'une expédition, d'un combat ou d'un donjon. Un
            Pokémon ne fait partie que d'une équipe à la fois.
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={saved.length >= MAX_TEAMS}
          title={saved.length >= MAX_TEAMS ? `Au plus ${MAX_TEAMS} équipes` : undefined}
          onClick={() => open(newDraft())}
        >
          Nouvelle équipe
        </button>
      </div>

      {saved.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((t) => {
            const list = t.pokemonIds.flatMap((id) => byId.get(id) ?? []);
            const editing = draft?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => open(editing ? null : { ...t, pokemonIds: [...t.pokemonIds] })}
                className={`card p-3 text-left transition hover:-translate-y-0.5 ${
                  editing ? 'ring-2 ring-brand-500' : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{t.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {list.length} / {TEAM_MAX_SIZE} · PE {powerOf(list)}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-6 gap-1">
                  {Array.from({ length: TEAM_MAX_SIZE }, (_, i) => {
                    const p = list[i];
                    return p ? (
                      <PokemonSprite
                        key={p.id}
                        speciesId={p.speciesId}
                        formId={p.formId}
                        shiny={p.isShiny}
                        size={44}
                      />
                    ) : (
                      <span
                        key={i}
                        className="aspect-square rounded-lg border border-dashed border-slate-300 dark:border-slate-700"
                      />
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {saved.length === 0 && !draft && !teams.isPending && (
        <p className="mb-4 text-sm text-slate-500">
          Aucune équipe enregistrée : crée-en une, ou touche un Pokémon du PC pour commencer.
        </p>
      )}

      {draft && (
        <div className="card sticky top-[calc(var(--hud-h,0px)+0.5rem)] z-10 mb-4 p-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-56"
              value={draft.name}
              maxLength={TEAM_NAME_MAX}
              placeholder="Nom de l'équipe"
              aria-label="Nom de l'équipe"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <span className="text-sm text-slate-500">
              {members.length} / {TEAM_MAX_SIZE} · PE {powerOf(members)}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {draft.id &&
                (confirmDelete ? (
                  <>
                    <button
                      className="btn-danger"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(draft.id!)}
                    >
                      Confirmer la suppression
                    </button>
                    <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                      Garder
                    </button>
                  </>
                ) : (
                  <button className="btn-ghost text-red-600" onClick={() => setConfirmDelete(true)}>
                    Supprimer
                  </button>
                ))}
              <button className="btn-ghost" onClick={() => open(null)}>
                Annuler
              </button>
              <button
                className="btn-primary"
                disabled={!draft.name.trim() || save.isPending}
                onClick={() => save.mutate({ ...draft, name: draft.name.trim() })}
              >
                Enregistrer
              </button>
            </div>
          </div>
          <TeamSlots
            ctx={ctx}
            members={members}
            onReorder={(pokemonIds) => setDraft({ ...draft, pokemonIds })}
            onMove={move}
            onRemove={toggle}
          />
          {error && <p className="mt-2 text-sm text-red-600">{errorText(error)}</p>}
        </div>
      )}

      <h3 className="mb-2 font-semibold">PC</h3>
      <PcFilterBar ctx={ctx} browser={browser} />
      {/* Mêmes cases bornées que le PC : le nombre de colonnes suit la largeur de l'écran. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
        <ProgressiveItems items={browser.filtered} resetKey={browser.viewKey}>
          {(entry) => {
            const { p } = entry;
            const index = draft?.pokemonIds.indexOf(p.id) ?? -1;
            const other = teamOf.get(p.id);
            const locked = megaLocked(p, members);
            return (
              <PcPokemonCard
                key={p.id}
                entry={entry}
                tags={browser.tagFilter.tags}
                onSelect={() => toggle(p)}
                title={
                  other
                    ? `Déjà dans l'équipe « ${other.name} »`
                    : locked
                      ? MEGA_LOCKED_TITLE
                      : undefined
                }
                topLeft={
                  index >= 0 && (
                    <span className="absolute top-1.5 left-2 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                  )
                }
                badges={
                  other && (
                    <span className="max-w-20 truncate rounded bg-violet-100 px-1 text-[10px] text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      {other.name}
                    </span>
                  )
                }
                className={`${index >= 0 ? 'ring-2 ring-brand-500' : ''} ${
                  other || locked ? 'cursor-not-allowed opacity-40' : ''
                }`}
              />
            );
          }}
        </ProgressiveItems>
      </div>
      {browser.filtered.length === 0 && !pokemon.isPending && (
        <p className="text-sm text-slate-500">Aucun Pokémon ne correspond.</p>
      )}
    </div>
  );
}

/** Glisser en cours : ordre provisoire et décalage de la carte tenue par rapport à sa case. */
interface SlotDrag {
  id: string;
  order: string[];
  dx: number;
  dy: number;
}

/**
 * Emplacements de l'équipe en cours : l'ordre de passage se change en glissant les cartes (souris
 * ou doigt), ou au clavier avec les flèches gauche et droite sur une carte. La grille passe sur
 * deux lignes sur mobile : le glisser vise la case la plus proche du pointeur, quelle que soit la
 * ligne.
 */
function TeamSlots({
  ctx,
  members,
  onReorder,
  onMove,
  onRemove,
}: {
  ctx: GameContext;
  members: readonly PokemonDto[];
  onReorder: (pokemonIds: string[]) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (p: PokemonDto) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<SlotDrag | null>(null);
  const ids = members.map((p) => p.id);
  const byId = new Map(members.map((p) => [p.id, p]));
  const shown = (drag?.order ?? ids).flatMap((id) => byId.get(id) ?? []);

  function start(e: PointerEvent<HTMLDivElement>, id: string) {
    const grid = gridRef.current;
    if (!grid || e.button !== 0 || (e.target as Element).closest('button')) return;
    const from = ids.indexOf(id);
    const origin = grid.getBoundingClientRect();
    // Cases de la grille dans l'ordre, relatives à la grille : elles ne bougent pas pendant le
    // glisser, seules les cartes changent de case.
    const cells = [...grid.children].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - origin.left, top: r.top - origin.top, w: r.width, h: r.height };
    });
    const grabX = e.clientX - origin.left - cells[from]!.left;
    const grabY = e.clientY - origin.top - cells[from]!.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let order = ids;
    let active = false;

    const onPointerMove = (ev: globalThis.PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      active = true;
      // Grille relue à chaque mouvement : la page peut défiler pendant le glisser.
      const g = grid.getBoundingClientRect();
      const x = ev.clientX - g.left;
      const y = ev.clientY - g.top;
      // Case occupée la plus proche du pointeur (les cases vides restent derrière l'équipe).
      let target = 0;
      let best = Infinity;
      for (let i = 0; i < ids.length; i++) {
        const c = cells[i]!;
        const d = Math.hypot(x - (c.left + c.w / 2), y - (c.top + c.h / 2));
        if (d < best) [best, target] = [d, i];
      }
      if (order.indexOf(id) !== target) {
        order = order.filter((other) => other !== id);
        order.splice(target, 0, id);
      }
      const cell = cells[target]!;
      setDrag({ id, order, dx: x - grabX - cell.left, dy: y - grabY - cell.top });
    };
    const finish = (commit: boolean) => () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setDrag(null);
      if (commit && active && order !== ids) onReorder(order);
    };
    const onUp = finish(true);
    const onCancel = finish(false);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>, index: number) {
    if (e.target !== e.currentTarget || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const card = e.currentTarget;
    onMove(index, e.key === 'ArrowLeft' ? -1 : 1);
    // La carte change de place dans le DOM : elle garde le focus.
    requestAnimationFrame(() => card.focus());
  }

  return (
    <div ref={gridRef} className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {shown.map((p, i) => {
        const species = ctx.species(p.speciesId, p.formId);
        const held = drag?.id === p.id;
        return (
          <motion.div
            key={p.id}
            layout={held ? false : 'position'}
            transition={{ duration: 0.15 }}
            style={{ x: held ? drag.dx : 0, y: held ? drag.dy : 0 }}
            tabIndex={0}
            aria-label={`${i + 1}. ${species?.nameFr ?? 'Pokémon'} (flèches gauche et droite pour changer l'ordre)`}
            title="Glisser pour changer l'ordre de passage"
            onPointerDown={(e) => start(e, p.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            // Image du sprite inerte : sinon le navigateur lance son propre glisser d'image.
            className={`card relative flex cursor-grab touch-none flex-col items-center p-1 text-xs select-none [&_img]:pointer-events-none ${
              held ? 'z-20 cursor-grabbing shadow-xl!' : ''
            }`}
          >
            <span className="absolute top-0.5 left-1.5 text-[10px] font-semibold text-slate-500">
              {i + 1}
            </span>
            <button
              type="button"
              className="absolute top-0 right-1 text-slate-400 hover:text-red-600"
              onClick={() => onRemove(p)}
              aria-label={`Retirer ${species?.nameFr ?? 'ce Pokémon'}`}
              title="Retirer de l'équipe"
            >
              ✕
            </button>
            <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={48} />
            <span className="max-w-full truncate">
              {species?.nameFr} {p.isShiny && <ShinyStar />}
            </span>
            <span className="text-slate-500">N.{p.level}</span>
          </motion.div>
        );
      })}
      {Array.from({ length: TEAM_MAX_SIZE - shown.length }, (_, k) => (
        <div
          key={`empty-${k}`}
          className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 p-1 text-center text-xs text-slate-400 dark:border-slate-700"
        >
          {k === 0 ? 'Touche un Pokémon du PC' : ''}
        </div>
      ))}
    </div>
  );
}
