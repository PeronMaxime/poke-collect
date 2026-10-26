import { useState } from 'react';
import { STAT_NAMES } from '@poke/data';
import { MAX_IV, isTransferableSpecies, lineageId, memberPower } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { Modal } from '../../components/ui';
import { TagToggleList } from '../../components/tags';
import { useTags } from '../../lib/game';

/** Réglages de « Sélectionner les doublons », conservés d'une visite à l'autre. */
export interface DuplicateSettings {
  /** Ce qu'on garde : le meilleur de chaque espèce (et forme), ou de chaque lignée. */
  keep: 'species' | 'lineage';
  /** Nombre maximal d'IV parfaits d'un doublon proposé ; au-delà, il est gardé. */
  maxPerfectIvs: number;
  /** Étiquettes dont les Pokémon peuvent être proposés ; les autres étiquettes les protègent. */
  includedTagIds: string[];
}

const SETTINGS_KEY = 'pc-duplicate-settings';

const DEFAULT_SETTINGS: DuplicateSettings = {
  keep: 'species',
  maxPerfectIvs: 0,
  includedTagIds: [],
};

export function loadDuplicateSettings(): DuplicateSettings {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? 'null',
    ) as Partial<DuplicateSettings> | null;
    return {
      keep: saved?.keep === 'lineage' ? 'lineage' : 'species',
      maxPerfectIvs:
        typeof saved?.maxPerfectIvs === 'number'
          ? Math.min(STAT_NAMES.length, Math.max(0, Math.round(saved.maxPerfectIvs)))
          : DEFAULT_SETTINGS.maxPerfectIvs,
      includedTagIds: Array.isArray(saved?.includedTagIds)
        ? saved.includedTagIds.filter((id) => typeof id === 'string')
        : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveDuplicateSettings(settings: DuplicateSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Stockage indisponible : les réglages valent pour cette visite seulement.
  }
}

export const perfectIvCount = (p: PokemonDto) =>
  STAT_NAMES.filter((s) => p.ivs[s] === MAX_IV).length;

/**
 * Doublons à transférer : pour chaque espèce (et forme) ou chaque lignée selon les réglages, les
 * chromatiques comptant à part (comme une autre espèce), on garde le Pokémon de plus forte PE, les
 * favoris, les légendaires et fabuleux, les shiny, les Méga-Évolués, les Pokémon occupés, ceux qui
 * ont trop d'IV parfaits et ceux qui portent une étiquette non incluse ; tous les autres sont
 * proposés.
 */
export function duplicates(
  ctx: GameContext,
  list: readonly PokemonDto[],
  settings: DuplicateSettings,
): string[] {
  const included = new Set(settings.includedTagIds);
  // Chromatiques à part : un Roucool chromatique ne fait pas d'un Roucool normal un doublon.
  const groupKey = (p: PokemonDto) =>
    (settings.keep === 'lineage'
      ? `l:${lineageId(ctx, p.speciesId) ?? p.speciesId}`
      : `${p.speciesId}:${p.formId ?? ''}`) + (p.isShiny ? ':shiny' : '');
  const groups = new Map<string, PokemonDto[]>();
  for (const p of list) groups.set(groupKey(p), [...(groups.get(groupKey(p)) ?? []), p]);
  const power = (p: PokemonDto) => memberPower(ctx, p);
  const ids: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const best = group.reduce((x, y) => (power(y) > power(x) ? y : x));
    for (const p of group)
      if (
        p !== best &&
        !p.locked &&
        !p.busy &&
        isTransferableSpecies(ctx, p.speciesId) &&
        !p.isShiny &&
        !p.megaStone &&
        perfectIvCount(p) <= settings.maxPerfectIvs &&
        p.tagIds.every((id) => included.has(id))
      )
        ids.push(p.id);
  }
  return ids;
}

/** Réglages du filtre des doublons ; enregistrés à la validation. */
export function DuplicateSettingsDialog({
  open,
  settings,
  onClose,
  onSave,
}: {
  open: boolean;
  settings: DuplicateSettings;
  onClose: () => void;
  onSave: (settings: DuplicateSettings) => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      {open && (
        <SettingsForm
          settings={settings}
          onClose={onClose}
          onSave={(next) => {
            saveDuplicateSettings(next);
            onSave(next);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

function SettingsForm({
  settings,
  onClose,
  onSave,
}: {
  settings: DuplicateSettings;
  onClose: () => void;
  onSave: (settings: DuplicateSettings) => void;
}) {
  const tags = useTags().data ?? [];
  const [draft, setDraft] = useState(settings);
  const included = draft.includedTagIds.filter((id) => tags.some((t) => t.id === id));

  return (
    <div className="space-y-5 text-sm">
      <h2 className="text-lg font-bold">Filtre des doublons</h2>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 font-medium">À garder</legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            className="mt-1"
            checked={draft.keep === 'species'}
            onChange={() => setDraft({ ...draft, keep: 'species' })}
          />
          <span>
            Un exemplaire de chaque Pokémon
            <span className="block text-xs text-slate-500">
              Le meilleur (PE) de chaque espèce et de chaque forme.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            className="mt-1"
            checked={draft.keep === 'lineage'}
            onChange={() => setDraft({ ...draft, keep: 'lineage' })}
          />
          <span>
            Le meilleur de chaque lignée
            <span className="block text-xs text-slate-500">
              Un seul Pokémon par famille d'évolution (ex. Bulbizarre, Herbizarre et Florizarre).
            </span>
          </span>
        </label>
      </fieldset>

      <div>
        <label className="mb-1 block font-medium" htmlFor="dup-max-iv">
          IV parfaits ({MAX_IV}) autorisés
        </label>
        <select
          id="dup-max-iv"
          className="input w-auto py-1"
          value={draft.maxPerfectIvs}
          onChange={(e) => setDraft({ ...draft, maxPerfectIvs: Number(e.target.value) })}
        >
          {Array.from({ length: STAT_NAMES.length + 1 }, (_, n) => (
            <option key={n} value={n}>
              {n === 0
                ? 'Aucun (garder tout Pokémon avec un IV parfait)'
                : n === STAT_NAMES.length
                  ? `Jusqu'à ${n} (aucune protection)`
                  : `Jusqu'à ${n}`}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Un doublon qui a plus d'IV parfaits que ce nombre est gardé.
        </p>
      </div>

      <div>
        <p className="font-medium">Étiquettes incluses</p>
        <p className="text-xs text-slate-500">
          Les Pokémon portant une étiquette non incluse sont gardés. Ceux sans étiquette sont
          toujours pris en compte.
        </p>
        <TagToggleList
          tags={tags}
          current={included}
          onToggle={(id) =>
            setDraft({
              ...draft,
              includedTagIds: included.includes(id)
                ? included.filter((t) => t !== id)
                : [...included, id],
            })
          }
        />
      </div>

      <p className="text-xs text-slate-500">
        Les favoris, les légendaires et fabuleux, les chromatiques, les Méga-Évolués et les Pokémon
        occupés ne sont jamais proposés.
      </p>

      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
          onClick={() => onSave({ ...draft, includedTagIds: included })}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
