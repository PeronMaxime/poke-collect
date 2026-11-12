/**
 * Aperçu d'un départ en expédition : rencontres, butin et transfert automatique.
 */
import { useState } from 'react';
import { PokemonSprite, ViewTabs } from '../../../components/ui';
import { itemIcon, itemName, speciesName } from '../../../lib/labels';
import { ZoneAutoTransferDialog, autoTransferLabel } from '../AutoTransferSettings';
import { SECTION_TITLE } from '../../common/dialogParts';
import type { LaunchModel } from './useLaunchExpedition';
import { BallIcon, Chevron, PREVIEW_ROW, ShareBar } from './parts';

/**
 * Colonne de l'aperçu : rencontres et butin en onglets (repliés en une ligne sur un écran étroit),
 * puis le transfert automatique.
 */
export function LaunchPreview({ launch }: { launch: LaunchModel }) {
  const { ctx, rememberSettings, encounters, encounterRows, captureText, loot } = launch;
  const [tab, setTab] = useState<'encounters' | 'loot'>('encounters');
  // Sur un écran étroit, l'aperçu se replie en une ligne (déplié sur ordinateur).
  const [previewOpen, setPreviewOpen] = useState(false);
  const shownTab = loot.length > 0 ? tab : 'encounters';
  return (
    <aside
      aria-label="Aperçu de l’expédition"
      className="tile flex min-w-0 flex-col overflow-hidden lg:min-h-0"
    >
      {/* Écran étroit : aperçu replié en une ligne, déplié au toucher. */}
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left lg:hidden"
        aria-expanded={previewOpen}
        onClick={() => setPreviewOpen(!previewOpen)}
      >
        <h3 className={SECTION_TITLE}>Aperçu</h3>
        <span className="min-w-0 flex-1 text-right text-xs text-slate-600 dark:text-slate-300">
          ≈ {encounters} rencontre{encounters > 1 ? 's' : ''} · {captureText}
        </span>
        <Chevron open={previewOpen} />
      </button>
      {!previewOpen && (
        <div className="flex flex-wrap gap-1 px-3 pb-3 lg:hidden">
          {encounterRows.map((row) => (
            <span key={row.key} className="sprite-well size-10">
              <PokemonSprite
                speciesId={row.speciesId}
                formId={row.formId}
                size={36}
                alt={speciesName(ctx, row.speciesId, row.formId)}
              />
            </span>
          ))}
        </div>
      )}
      <div className={`${previewOpen ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex`}>
        <div className="border-ink p-2 max-lg:border-t-2 max-lg:border-well-line lg:border-b-[3px]">
          <ViewTabs
            tabs={[
              { id: 'encounters', label: 'Rencontres', badge: encounterRows.length },
              ...(loot.length > 0
                ? [{ id: 'loot' as const, label: 'Butin', badge: loot.length }]
                : []),
            ]}
            selected={shownTab}
            onSelect={setTab}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {shownTab === 'encounters' ? (
            <EncounterList launch={launch} />
          ) : (
            <LootList launch={launch} />
          )}
        </div>
      </div>
      {rememberSettings && <AutoTransferRow launch={launch} />}
    </aside>
  );
}

/** Pokémon rencontrés : part des rencontres et chance de capture avec la Ball de leur catégorie. */
function EncounterList({ launch }: { launch: LaunchModel }) {
  const { ctx, encounterRows, maxShare } = launch;
  return (
    <>
      <div className={`${PREVIEW_ROW} pb-1 text-[11px] text-slate-500 dark:text-slate-400`}>
        <span>Pokémon</span>
        <span>Apparition</span>
        <span className="text-right">Capture</span>
      </div>
      <ul className="space-y-1">
        {encounterRows.map((row) => (
          <li
            key={row.key}
            className={`${PREVIEW_ROW} ${row.chance === null ? 'opacity-40' : ''}`}
            title={row.title ?? (row.isNew ? 'Pas encore capturé' : 'Déjà capturé')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`sprite-well size-10 shrink-0 ${
                  row.kind === 'roamer'
                    ? 'border-amber-500'
                    : row.kind === 'special'
                      ? 'border-violet-400'
                      : ''
                }`}
              >
                <PokemonSprite speciesId={row.speciesId} formId={row.formId} size={36} />
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-sm font-medium ${
                    row.kind === 'roamer'
                      ? 'text-amber-800 dark:text-amber-300'
                      : row.kind === 'special'
                        ? 'text-violet-800 dark:text-violet-300'
                        : ''
                  }`}
                >
                  {row.kind === 'roamer' ? '✦ ' : row.kind === 'special' ? '✧ ' : ''}
                  {ctx.species(row.speciesId, row.formId)!.nameFr}
                </span>
                <span
                  className={`flex items-center gap-1 text-[11px] ${
                    row.isNew
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <BallIcon dim={row.isNew} className="h-3 w-3" />
                  {row.kind === 'roamer'
                    ? 'Fuyard'
                    : row.kind === 'special'
                      ? 'Rencontre spéciale'
                      : row.isNew
                        ? 'Nouveau'
                        : 'Déjà capturé'}
                </span>
              </span>
            </span>
            <ShareBar value={row.share} max={maxShare} />
            <span className="text-right text-sm font-semibold tabular-nums">
              {row.chance === null ? '—' : `${Math.round(row.chance * 100)} %`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        Grisé : pas de Ball prévue (un shiny reçoit toujours la Ball « Shiny »).
      </p>
    </>
  );
}

/** Objets du butin : chance à chaque tirage et quantité. */
function LootList({ launch }: { launch: LaunchModel }) {
  const { ctx, lootIntervalMinutes, loot, maxLoot } = launch;
  return (
    <>
      <div className={`${PREVIEW_ROW} pb-1 text-[11px] text-slate-500 dark:text-slate-400`}>
        <span>Un tirage toutes les {lootIntervalMinutes} min</span>
        <span>Chance</span>
        <span className="text-right">Qté</span>
      </div>
      <ul className="space-y-1">
        {loot.map(({ itemId, probability, min, max }) => (
          <li key={itemId} className={PREVIEW_ROW}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="sprite-well size-10 shrink-0">
                <img
                  src={itemIcon(ctx, itemId)}
                  alt=""
                  className="size-8 object-contain [image-rendering:pixelated]"
                />
              </span>
              <span className="min-w-0 truncate text-sm font-medium">{itemName(ctx, itemId)}</span>
            </span>
            <ShareBar value={probability} max={maxLoot} />
            <span className="text-right text-sm text-slate-600 tabular-nums dark:text-slate-300">
              × {min === max ? min : `${min}–${max}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Réglage du transfert automatique des captures au retour : celui de la zone, ou le réglage global.
 */
function AutoTransferRow({ launch }: { launch: LaunchModel }) {
  const { zone, zoneAutoTransfer, setZoneAutoTransfer, globalAutoTransfer, autoTransfer } = launch;
  const [autoTransferOpen, setAutoTransferOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 border-t-[3px] border-ink bg-slate-50 px-3 py-2.5 dark:bg-hud-pill">
      <div className="min-w-0 flex-1">
        <h3 className={SECTION_TITLE}>Transfert auto</h3>
        <p
          className="text-xs text-slate-600 dark:text-slate-300"
          title="Captures transférées contre des Bonbons au retour de l'expédition"
        >
          {zoneAutoTransfer.custom ? 'Réglage de la zone' : 'Réglage global'} ·{' '}
          <strong className="text-slate-900 dark:text-slate-100">
            {autoTransferLabel(autoTransfer)}
          </strong>
        </p>
      </div>
      <button
        type="button"
        className="btn-ghost shrink-0 px-3 py-2"
        onClick={() => setAutoTransferOpen(true)}
      >
        Régler
      </button>
      <ZoneAutoTransferDialog
        open={autoTransferOpen}
        zoneName={zone.name}
        value={zoneAutoTransfer}
        globalFilter={globalAutoTransfer}
        onClose={() => setAutoTransferOpen(false)}
        onSave={setZoneAutoTransfer}
      />
    </div>
  );
}
