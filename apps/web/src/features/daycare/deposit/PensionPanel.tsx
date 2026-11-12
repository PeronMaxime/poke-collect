/**
 * Colonne « Pension » de la fenêtre de dépôt : le Pokémon choisi, son partenaire et l'aperçu de l'œuf.
 */
import { hatchMinutes } from '@poke/game-core';
import { PokemonSprite } from '../../../components/ui';
import { formatDuration, itemName, speciesName } from '../../../lib/labels';
import { SECTION_TITLE } from '../../common/dialogParts';
import { formatXp } from '../../common/XpPreview';
import { ParentSlot, breedingErrorText } from './parts';
import type { DepositModel } from './useDepositDialog';

/**
 * La pension : le Pokémon choisi et son objet tenu, son partenaire, puis ce que donnera le couple.
 */
export function PensionPanel({ d }: { d: DepositModel }) {
  const {
    ctx,
    slotIndex,
    current,
    partner,
    partnerItem,
    item,
    setItem,
    view,
    picked,
    check,
    owned,
    breedingItems,
    rules,
    name,
  } = d;
  return (
    <aside
      className={`tile flex min-w-0 flex-col gap-2.5 p-3 lg:min-h-0 lg:overflow-y-auto ${view === 'box' ? 'max-lg:hidden' : ''}`}
    >
      <h3 className={SECTION_TITLE}>Pension {slotIndex + 1}</h3>
      <ParentSlot ctx={ctx} pokemon={picked} label={current ? 'Nouveau Pokémon' : 'Pokémon déposé'}>
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Objet tenu
          <select
            className="input py-1 text-sm"
            value={item ?? ''}
            onChange={(e) => setItem(e.target.value || null)}
          >
            <option value="">Aucun objet tenu</option>
            {breedingItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} (× {owned.get(i.id)})
              </option>
            ))}
          </select>
        </label>
      </ParentSlot>
      <ParentSlot ctx={ctx} pokemon={partner} label="Partenaire">
        {partnerItem ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tient : {itemName(ctx, partnerItem)}
          </p>
        ) : null}
      </ParentSlot>

      {check?.ok && (
        <div className="flex items-center gap-3 rounded-md border-2 border-emerald-600 bg-emerald-50 p-2 text-sm dark:border-emerald-400 dark:bg-emerald-950/50">
          <span className="sprite-well size-12 shrink-0">
            <PokemonSprite speciesId={check.eggSpeciesId} size={40} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Œufs de {speciesName(ctx, check.eggSpeciesId)}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Un œuf toutes les {formatDuration(ctx.balance.breeding.eggMinutes)} · éclosion en{' '}
              {formatDuration(hatchMinutes(ctx, check.eggSpeciesId))} · {rules.ivCount} IV hérités
              des parents
              {rules.natureChance.map((chance, i) =>
                chance > 0
                  ? ` · nature du parent ${i + 1}${chance < 1 ? ` (${Math.round(chance * 100)} %)` : ''}`
                  : '',
              )}
            </p>
          </div>
        </div>
      )}
      {check && !check.ok && (
        <div className="rounded-md border-2 border-amber-600 bg-amber-50 p-2 text-sm dark:border-amber-400 dark:bg-amber-950/40">
          <p className="font-semibold">Pas d’œuf avec ce couple</p>
          <ul className="text-xs text-slate-600 dark:text-slate-400">
            {check.errors.map((e) => (
              <li key={e.code}>{breedingErrorText(ctx, e)}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Ils peuvent quand même séjourner à la pension pour gagner{' '}
            {formatXp(ctx.balance.breeding.parentXpPerHour)} par heure.
          </p>
        </div>
      )}

      <div className="mt-auto space-y-1 border-t-2 border-well-line pt-2.5 text-xs text-slate-500 dark:text-slate-400">
        <p>
          {partner
            ? 'Avec un partenaire compatible, il pondra des œufs ; sinon, il gagnera seulement de l’XP.'
            : 'Seul, il gagne de l’XP ; ajoute-lui un partenaire compatible pour avoir des œufs.'}{' '}
          L’œuf contient la forme de base de la mère (ou du parent qui n’est pas Métamorph).
        </p>
        {current && (
          <p>
            {name(current)} quitte la pension : il reçoit son XP et les œufs prêts vont dans la
            couveuse (le surplus dans le sac).
          </p>
        )}
      </div>
    </aside>
  );
}
