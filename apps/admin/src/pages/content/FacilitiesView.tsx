import { useState } from 'react';
import { FACILITIES } from '@poke/content';
import type {
  BalanceSettings,
  FacilityId,
  FacilityUnlock,
  FacilityUnlocks,
  UnlockCondition,
} from '@poke/content';
import { ASSISTANT_POST_PLACES, FARM_PLOTS } from '@poke/game-core';
import { VersionBanner } from '../../components/EntityPage';
import { Field, NumberInput } from '../../components/forms/fields';
import { UnlockEditor } from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';
import { errorMessage, useSaveBalance, useWorkingVersion } from '../../lib/content';

const NO_UNLOCKS: FacilityUnlocks = {
  expedition: [],
  daycare: [],
  incubator: [],
  museum: [],
  farm: [],
  center: [],
};

/** Explication de chaque bâtiment (unité d'un palier). */
const HINTS: Record<FacilityId, string> = {
  expedition:
    'Un palier ajoute des emplacements d’expédition, en plus de ceux des récompenses (collections, quêtes, complétions), sans dépasser le maximum.',
  daycare:
    'Un palier ajoute des pensions, en plus de celles des récompenses (collections, quêtes, complétions).',
  incubator: `Un palier ajoute des couveuses entières (${ASSISTANT_POST_PLACES.incubator} places et un assistant chacune). Les places au départ fixent aussi le nombre d’œufs en attente dans une pension au maximum.`,
  museum: 'Un palier ajoute des places de restauration de fossiles (une par assistant).',
  farm: `Un palier ajoute des parcelles. Un champ en compte ${FARM_PLOTS} au plus : au-delà, elles forment un nouveau champ, avec son arroseur et son assistant de récolte. Les parcelles manquantes d’un champ s’affichent verrouillées.`,
  center: `Un palier ajoute des Centres Pokémon entiers (${ASSISTANT_POST_PLACES.center} places et un assistant chacun).`,
};

/** Onglet « Bâtiments » : places au départ et paliers de déblocage (expéditions, pensions, couveuses, Musée, ferme, Centres). */
export function FacilitiesView() {
  const working = useWorkingVersion();
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  return <FacilitiesEditor key={working.data.version.id} working={working.data} />;
}

/** Réglages modifiés ici, copiés de l'équilibrage. */
interface Draft {
  expeditionSlots: number;
  maxExpeditionSlots: number;
  daycare: BalanceSettings['daycare'];
  maxEggs: number;
  museumSlots: number;
  farmPlots: number;
  centerSlots: number;
  unlocks: FacilityUnlocks;
}

function draftOf(balance: BalanceSettings): Draft {
  return {
    expeditionSlots: balance.expeditions.initialSlots,
    maxExpeditionSlots: balance.expeditions.maxSlots,
    daycare: balance.daycare,
    maxEggs: balance.breeding.maxEggs,
    museumSlots: balance.museum.slots,
    farmPlots: balance.farm?.initialPlots ?? FARM_PLOTS,
    centerSlots: balance.center.slots,
    unlocks: { ...NO_UNLOCKS, ...balance.facilityUnlocks },
  };
}

function FacilitiesEditor({ working }: { working: WorkingVersion }) {
  const balance = working.content.balance;
  const initial = draftOf(balance);
  const [draft, setDraft] = useState<Draft>(initial);
  const save = useSaveBalance(working.version.id);
  const editable = working.editable;
  const disabled = !editable;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const { ctx } = working;

  const setSteps = (facility: FacilityId, steps: FacilityUnlock[]) =>
    setDraft({ ...draft, unlocks: { ...draft.unlocks, [facility]: steps } });

  function submit() {
    const anyUnlock = FACILITIES.some(({ id }) => draft.unlocks[id].length > 0);
    save.mutate({
      ...balance,
      expeditions: {
        ...balance.expeditions,
        initialSlots: draft.expeditionSlots,
        maxSlots: draft.maxExpeditionSlots,
      },
      daycare: draft.daycare,
      breeding: { ...balance.breeding, maxEggs: draft.maxEggs },
      museum: { slots: draft.museumSlots },
      center: { ...balance.center, slots: draft.centerSlots },
      // Absents tant qu'ils gardent leur valeur par défaut.
      farm:
        balance.farm || draft.farmPlots !== FARM_PLOTS
          ? { initialPlots: draft.farmPlots }
          : undefined,
      facilityUnlocks: balance.facilityUnlocks || anyUnlock ? draft.unlocks : undefined,
    });
  }

  /** Réglage « au départ » de chaque bâtiment. */
  const base: Record<FacilityId, React.ReactNode> = {
    expedition: (
      <>
        <Field label="Emplacements au départ">
          <NumberInput
            value={draft.expeditionSlots}
            min={1}
            max={6}
            disabled={disabled}
            onChange={(v) => setDraft({ ...draft, expeditionSlots: v })}
          />
        </Field>
        <Field label="Emplacements maximum">
          <NumberInput
            value={draft.maxExpeditionSlots}
            min={1}
            max={9}
            disabled={disabled}
            onChange={(v) => setDraft({ ...draft, maxExpeditionSlots: v })}
          />
        </Field>
      </>
    ),
    daycare: (
      <Field label="Pensions au départ">
        <NumberInput
          value={draft.daycare.initialSlots}
          min={0}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, daycare: { ...draft.daycare, initialSlots: v } })}
        />
      </Field>
    ),
    incubator: (
      <Field label="Places au départ" hint={`${ASSISTANT_POST_PLACES.incubator} par couveuse`}>
        <NumberInput
          value={draft.maxEggs}
          min={1}
          max={30}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, maxEggs: v })}
        />
      </Field>
    ),
    museum: (
      <Field label="Places au départ">
        <NumberInput
          value={draft.museumSlots}
          min={1}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, museumSlots: v })}
        />
      </Field>
    ),
    farm: (
      <Field label="Parcelles au départ">
        <NumberInput
          value={draft.farmPlots}
          min={0}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, farmPlots: v })}
        />
      </Field>
    ),
    center: (
      <Field label="Places au départ" hint={`${ASSISTANT_POST_PLACES.center} par Centre`}>
        <NumberInput
          value={draft.centerSlots}
          min={1}
          disabled={disabled}
          onChange={(v) => setDraft({ ...draft, centerSlots: v })}
        />
      </Field>
    ),
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Progression : bâtiments</h1>
          <p className="mt-1 text-slate-500">
            Emplacements d’expédition, pensions, couveuses, places du Musée, parcelles de la ferme
            et Centres Pokémon en plus au fil de l’aventure : chaque palier s’ajoute dès que sa condition est remplie (rien à
            réclamer). Le joueur voit les paliers verrouillés et leur condition dans le bâtiment.
          </p>
        </div>
        {editable && (
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={!dirty} onClick={() => setDraft(initial)}>
              Annuler
            </button>
            <button className="btn-primary" disabled={!dirty || save.isPending} onClick={submit}>
              Enregistrer
            </button>
          </div>
        )}
      </div>
      <VersionBanner working={working} />
      {save.error && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}

      {FACILITIES.map(({ id, label, units }) => {
        const steps = draft.unlocks[id];
        return (
          <fieldset key={id} className="card space-y-3">
            <legend className="sr-only">{label}</legend>
            <h2 className="font-semibold">{label}</h2>
            <p className="text-sm text-slate-500">{HINTS[id]}</p>
            <div className="grid gap-4 sm:grid-cols-3">{base[id]}</div>
            {steps.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {steps.map((step, i) => {
                  const update = (patch: Partial<FacilityUnlock>) =>
                    setSteps(
                      id,
                      steps.map((s, j) => (j === i ? { ...s, ...patch } : s)),
                    );
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <span className="flex items-center gap-1 text-sm">
                        +
                        <NumberInput
                          value={step.amount}
                          min={1}
                          max={10}
                          disabled={disabled}
                          className="w-16"
                          onChange={(v) => update({ amount: v })}
                        />
                        {units}
                      </span>
                      <UnlockEditor
                        value={step.unlock}
                        onChange={(v: UnlockCondition) => update({ unlock: v })}
                        regions={working.content.regions}
                        trainers={working.content.trainers}
                        quests={working.content.quests}
                        disabled={disabled}
                      />
                      {editable && (
                        <button
                          className="btn-ghost ml-auto text-red-600"
                          onClick={() =>
                            setSteps(
                              id,
                              steps.filter((_, j) => j !== i),
                            )
                          }
                        >
                          Retirer
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {editable && (
              <button
                className="btn-ghost"
                onClick={() =>
                  setSteps(id, [
                    ...steps,
                    {
                      amount: 1,
                      unlock: { type: 'badgeCount', regionId: ctx.regions[0]?.id ?? '', count: 1 },
                    },
                  ])
                }
              >
                + Ajouter un palier
              </button>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
