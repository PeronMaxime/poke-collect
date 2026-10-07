import { useState } from 'react';
import { balanceSettingsSchema } from '@poke/content';
import type { BalanceSettings } from '@poke/content';
import { createGameContext, encounterCount, hatchMinutes, lootRollCount } from '@poke/game-core';
import { IssueList, VersionBanner } from '../../components/EntityPage';
import { WinCurveChart } from '../../components/WinCurveChart';
import { Field, NumberInput, Section, validate } from '../../components/forms/fields';
import { ItemSelect } from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';
import { errorMessage, useSaveBalance, useWorkingVersion } from '../../lib/content';

export function BalancePage() {
  const working = useWorkingVersion();
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  return <BalanceForm key={working.data.version.id} working={working.data} />;
}

/** Espèces d'exemple pour l'aperçu des temps d'éclosion (Magicarpe → Minidraco). */
const HATCH_EXAMPLES = [129, 25, 1, 133, 147];

/** Durée lisible : 15 min, 1 h, 4 h 30. */
const formatMinutes = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`;

function BalanceForm({ working }: { working: WorkingVersion }) {
  const initial = working.content.balance;
  const [b, setB] = useState<BalanceSettings>(initial);
  const [newDuration, setNewDuration] = useState(30);
  const save = useSaveBalance(working.version.id);
  const { valid, errors } = validate(balanceSettingsSchema, b);
  const disabled = !working.editable;
  const dirty = JSON.stringify(b) !== JSON.stringify(initial);
  const issues = working.issues.filter((i) => i.entity === 'balance');

  /** Met à jour une valeur d'un groupe de réglages. */
  const set =
    <G extends keyof BalanceSettings>(group: G) =>
    <K extends keyof BalanceSettings[G]>(key: K) =>
    (v: BalanceSettings[G][K]) =>
      setB({ ...b, [group]: { ...b[group], [key]: v } });
  const exp = set('expeditions');
  const cap = set('capture');
  const bat = set('battles');
  const err = (path: string) => errors.get(path);

  // Aperçu des quantités avec les réglages en cours de saisie.
  const preview = valid ? createGameContext({ ...working.content, balance: b }) : null;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Équilibrage</h1>
          <p className="mt-1 text-slate-500">Réglages globaux du jeu, groupés par thème.</p>
        </div>
        {working.editable && (
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={!dirty} onClick={() => setB(initial)}>
              Annuler
            </button>
            <button
              className="btn-primary"
              disabled={!valid || !dirty || save.isPending}
              onClick={() => save.mutate(b)}
            >
              Enregistrer
            </button>
          </div>
        )}
      </div>
      <VersionBanner working={working} />
      {save.error && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
      {!dirty && <IssueList issues={issues} />}

      <Section title="Expéditions">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Emplacements au départ" error={err('expeditions.initialSlots')}>
            <NumberInput
              value={b.expeditions.initialSlots}
              min={1}
              max={6}
              onChange={exp('initialSlots')}
              disabled={disabled}
            />
          </Field>
          <Field label="Emplacements maximum" error={err('expeditions.maxSlots')}>
            <NumberInput
              value={b.expeditions.maxSlots}
              min={1}
              max={6}
              onChange={exp('maxSlots')}
              disabled={disabled}
            />
          </Field>
          <Field label="Taille d’équipe maximale" error={err('expeditions.maxTeamSize')}>
            <NumberInput
              value={b.expeditions.maxTeamSize}
              min={1}
              max={6}
              unit="Pokémon"
              onChange={exp('maxTeamSize')}
              disabled={disabled}
            />
          </Field>
          <Field label="Rencontres par heure" error={err('expeditions.encountersPerHour')}>
            <NumberInput
              value={b.expeditions.encountersPerHour}
              min={0}
              step={0.5}
              unit="/ h"
              onChange={exp('encountersPerHour')}
              disabled={disabled}
            />
          </Field>
          <Field label="Rencontres minimum" error={err('expeditions.minEncounters')}>
            <NumberInput
              value={b.expeditions.minEncounters}
              min={0}
              onChange={exp('minEncounters')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Exposant de durée"
            hint="1 = linéaire ; moins de 1 = rendements décroissants."
            error={err('expeditions.durationExponent')}
          >
            <NumberInput
              value={b.expeditions.durationExponent}
              min={0.1}
              max={1}
              step={0.05}
              onChange={exp('durationExponent')}
              disabled={disabled}
            />
          </Field>
          <Field label="Tirages de butin par heure" error={err('expeditions.lootRollsPerHour')}>
            <NumberInput
              value={b.expeditions.lootRollsPerHour}
              min={0}
              step={0.5}
              unit="/ h"
              onChange={exp('lootRollsPerHour')}
              disabled={disabled}
            />
          </Field>
          <Field label="Tirages de butin minimum" error={err('expeditions.minLootRolls')}>
            <NumberInput
              value={b.expeditions.minLootRolls}
              min={0}
              onChange={exp('minLootRolls')}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field label="Durées proposées" error={err('expeditions.durationsMinutes')}>
          <div className="flex flex-wrap items-center gap-2">
            {b.expeditions.durationsMinutes.map((d) => (
              <span
                key={d}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800"
              >
                {formatMinutes(d)}
                {!disabled && (
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600"
                    onClick={() =>
                      exp('durationsMinutes')(b.expeditions.durationsMinutes.filter((x) => x !== d))
                    }
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
            {!disabled && (
              <span className="flex items-center gap-1">
                <NumberInput
                  className="w-32"
                  value={newDuration}
                  min={1}
                  unit="min"
                  onChange={setNewDuration}
                />
                <button
                  type="button"
                  className="btn-ghost py-1"
                  disabled={
                    !(newDuration > 0) || b.expeditions.durationsMinutes.includes(newDuration)
                  }
                  onClick={() =>
                    exp('durationsMinutes')(
                      [...b.expeditions.durationsMinutes, newDuration].sort((x, y) => x - y),
                    )
                  }
                >
                  Ajouter
                </button>
              </span>
            )}
          </div>
        </Field>
        {preview && (
          <table className="text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pr-6 font-normal">Durée</th>
                <th className="pr-6 font-normal">Rencontres</th>
                <th className="font-normal">Tirages de butin</th>
              </tr>
            </thead>
            <tbody>
              {b.expeditions.durationsMinutes.map((d) => (
                <tr key={d}>
                  <td className="pr-6">{formatMinutes(d)}</td>
                  <td className="pr-6 font-mono">{encounterCount(preview, d)}</td>
                  <td className="font-mono">{lootRollCount(preview, d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Combats de dresseurs">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Emplacements au départ" error={err('battles.initialSlots')}>
            <NumberInput
              value={b.battles.initialSlots}
              min={1}
              max={6}
              onChange={bat('initialSlots')}
              disabled={disabled}
            />
          </Field>
          <Field label="Emplacements maximum" error={err('battles.maxSlots')}>
            <NumberInput
              value={b.battles.maxSlots}
              min={1}
              max={6}
              onChange={bat('maxSlots')}
              disabled={disabled}
            />
          </Field>
          <Field label="Taille d’équipe maximale" error={err('battles.maxTeamSize')}>
            <NumberInput
              value={b.battles.maxTeamSize}
              min={1}
              max={6}
              unit="Pokémon"
              onChange={bat('maxTeamSize')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Durée par défaut"
            hint="Si le dresseur n’en fixe pas."
            error={err('battles.defaultDurationMinutes')}
          >
            <NumberInput
              value={b.battles.defaultDurationMinutes}
              min={1}
              unit="min"
              onChange={bat('defaultDurationMinutes')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Durée de K.O."
            hint="Après une défaite (surchargeable par dresseur)."
            error={err('battles.koMinutes')}
          >
            <NumberInput
              value={b.battles.koMinutes}
              min={0}
              unit="min"
              onChange={bat('koMinutes')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Temps de recharge"
            hint="Dresseur répétable, après une victoire."
            error={err('battles.cooldownMinutes')}
          >
            <NumberInput
              value={b.battles.cooldownMinutes}
              min={0}
              unit="min"
              onChange={bat('cooldownMinutes')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Pente de la courbe"
            hint="5,4 ≈ 90 % de victoire à PE × 1,5."
            error={err('battles.winCurveSteepness')}
          >
            <NumberInput
              value={b.battles.winCurveSteepness}
              min={0.1}
              max={50}
              step={0.1}
              onChange={bat('winCurveSteepness')}
              disabled={disabled}
            />
          </Field>
          <Field label="Probabilité plancher" error={err('battles.minWinChance')}>
            <NumberInput
              value={b.battles.minWinChance}
              scale={100}
              min={0}
              max={100}
              unit="%"
              onChange={bat('minWinChance')}
              disabled={disabled}
            />
          </Field>
          <Field label="Probabilité plafond" error={err('battles.maxWinChance')}>
            <NumberInput
              value={b.battles.maxWinChance}
              scale={100}
              min={0}
              max={100}
              unit="%"
              onChange={bat('maxWinChance')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Poids de l’avantage de types"
            hint="Effet maximal sur la PE effective."
            error={err('battles.typeAdvantageWeight')}
          >
            <NumberInput
              value={b.battles.typeAdvantageWeight}
              scale={100}
              min={0}
              max={100}
              unit="± %"
              onChange={bat('typeAdvantageWeight')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="IV des Pokémon des dresseurs"
            hint="Si le dresseur n’en fixe pas."
            error={err('battles.defaultTrainerIv')}
          >
            <NumberInput
              value={b.battles.defaultTrainerIv}
              min={0}
              max={31}
              onChange={bat('defaultTrainerIv')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Multiplicateur d’XP"
            hint="Sur l’XP des Pokémon adverses vaincus."
            error={err('battles.xpMultiplier')}
          >
            <NumberInput
              value={b.battles.xpMultiplier}
              min={0}
              step={0.1}
              unit="×"
              onChange={bat('xpMultiplier')}
              disabled={disabled}
            />
          </Field>
          <Field label="XP en cas de défaite" error={err('battles.lossXpFraction')}>
            <NumberInput
              value={b.battles.lossXpFraction}
              scale={100}
              min={0}
              max={100}
              unit="%"
              onChange={bat('lossXpFraction')}
              disabled={disabled}
            />
          </Field>
          <Field label="Bonheur (victoire)" error={err('battles.happinessOnWin')}>
            <NumberInput
              value={b.battles.happinessOnWin}
              min={-255}
              max={255}
              onChange={bat('happinessOnWin')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Bonheur (défaite)"
            hint="Négatif : le bonheur baisse."
            error={err('battles.happinessOnLoss')}
          >
            <NumberInput
              value={b.battles.happinessOnLoss}
              min={-255}
              max={255}
              onChange={bat('happinessOnLoss')}
              disabled={disabled}
            />
          </Field>
        </div>
        {preview && (
          <div>
            <p className="text-sm font-medium">Aperçu : probabilité de victoire</p>
            <WinCurveChart ctx={preview} />
          </div>
        )}
      </Section>

      <Section title="Capture">
        <p className="text-xs text-slate-500">
          Probabilité = taux de capture de l’espèce × Ball × baie × (3 − 2 × PV restants) / 3 × (1 +
          bonus d’affinité × membres en affinité) × multiplicateur global / 255.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Multiplicateur global" error={err('capture.globalMultiplier')}>
            <NumberInput
              value={b.capture.globalMultiplier}
              min={0}
              step={0.1}
              unit="×"
              onChange={cap('globalMultiplier')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="PV restants supposés"
            hint="100 % = Pokémon en pleine santé (plus difficile)."
            error={err('capture.assumedHpFraction')}
          >
            <NumberInput
              value={b.capture.assumedHpFraction}
              scale={100}
              min={0}
              max={100}
              unit="%"
              onChange={cap('assumedHpFraction')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Bonus par membre en affinité"
            error={err('capture.affinityBonusPerPokemon')}
          >
            <NumberInput
              value={b.capture.affinityBonusPerPokemon}
              scale={100}
              min={0}
              unit="%"
              onChange={cap('affinityBonusPerPokemon')}
              disabled={disabled}
            />
          </Field>
          <Field label="Chance de talent caché" error={err('capture.hiddenAbilityChance')}>
            <NumberInput
              value={b.capture.hiddenAbilityChance}
              scale={100}
              min={0}
              max={100}
              step={0.5}
              unit="%"
              onChange={cap('hiddenAbilityChance')}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Pitié et shiny">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bonus de rencontre par échec" error={err('pity.weightBonusPerMiss')}>
            <NumberInput
              value={b.pity.weightBonusPerMiss}
              scale={100}
              min={0}
              unit="%"
              onChange={set('pity')('weightBonusPerMiss')}
              disabled={disabled}
            />
          </Field>
          <Field label="Plafond de pitié" error={err('pity.maxMultiplier')}>
            <NumberInput
              value={b.pity.maxMultiplier}
              min={1}
              step={0.5}
              unit="×"
              onChange={set('pity')('maxMultiplier')}
              disabled={disabled}
            />
          </Field>
          <Field label="Taux shiny de base" error={err('shiny.baseRateDenominator')}>
            <NumberInput
              value={b.shiny.baseRateDenominator}
              min={1}
              unit="1 / X"
              onChange={set('shiny')('baseRateDenominator')}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="XP et bonheur">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Multiplicateur d’XP"
            hint="XP par rencontre = XP de base × niveau / 7 × multiplicateur."
            error={err('xp.multiplier')}
          >
            <NumberInput
              value={b.xp.multiplier}
              min={0}
              step={0.1}
              unit="×"
              onChange={set('xp')('multiplier')}
              disabled={disabled}
            />
          </Field>
          <Field label="Bonheur par expédition" error={err('xp.happinessPerExpedition')}>
            <NumberInput
              value={b.xp.happinessPerExpedition}
              min={0}
              max={255}
              onChange={set('xp')('happinessPerExpedition')}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Évolutions">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Objet qui remplace l’échange"
            hint="Consommé par les évolutions par échange (Câble Link). Aucun : impossibles."
            error={err('evolution.tradeItemId')}
          >
            <ItemSelect
              ctx={working.ctx}
              value={b.evolution.tradeItemId}
              allowNone
              onChange={set('evolution')('tradeItemId')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Début du jour"
            hint="Heure locale du joueur."
            error={err('evolution.dayStartHour')}
          >
            <NumberInput
              value={b.evolution.dayStartHour}
              min={0}
              max={23}
              unit="h"
              onChange={set('evolution')('dayStartHour')}
              disabled={disabled}
            />
          </Field>
          <Field label="Début de la nuit" error={err('evolution.nightStartHour')}>
            <NumberInput
              value={b.evolution.nightStartHour}
              min={0}
              max={23}
              unit="h"
              onChange={set('evolution')('nightStartHour')}
              disabled={disabled}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          Les conditions de chaque évolution (niveau, objet, bonheur, moment de la journée) se
          règlent dans la section Évolutions.
        </p>
      </Section>

      <Section title="Élevage et pensions">
        <p className="text-xs text-slate-500">
          Les objets tenus en pension (Nœud Destin, Pierre Stase…) se règlent dans Objets, via leurs
          effets « Héritage d’IV » et « Transmission de nature ».
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Éclosion par cycle"
            hint="Temps d’éclosion = cycles de l’espèce (PokéAPI) × cette durée."
            error={err('breeding.hatchMinutesPerCounter')}
          >
            <NumberInput
              value={b.breeding.hatchMinutesPerCounter}
              min={0}
              step={0.5}
              unit="min"
              onChange={set('breeding')('hatchMinutesPerCounter')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Ponte"
            hint="Un couple pond un œuf toutes les X minutes."
            error={err('breeding.eggMinutes')}
          >
            <NumberInput
              value={b.breeding.eggMinutes}
              min={1}
              unit="min"
              onChange={set('breeding')('eggMinutes')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Capacité de la couveuse"
            hint="Œufs en attente d’éclosion au maximum."
            error={err('breeding.maxEggs')}
          >
            <NumberInput
              value={b.breeding.maxEggs}
              min={1}
              max={30}
              unit="œufs"
              onChange={set('breeding')('maxEggs')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="IV hérités (sans objet)"
            hint="Tirés au hasard parmi les 6 stats, chacun d’un parent au hasard."
            error={err('breeding.inheritedIvCount')}
          >
            <NumberInput
              value={b.breeding.inheritedIvCount}
              min={0}
              max={6}
              unit="IV"
              onChange={set('breeding')('inheritedIvCount')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Transmission du talent caché"
            hint="Si la mère (ou le parent non Métamorph) a son talent caché."
            error={err('breeding.hiddenAbilityInheritChance')}
          >
            <NumberInput
              value={b.breeding.hiddenAbilityInheritChance}
              scale={100}
              min={0}
              max={100}
              unit="%"
              onChange={set('breeding')('hiddenAbilityInheritChance')}
              disabled={disabled}
            />
          </Field>
          <Field label="Niveau à l’éclosion" error={err('breeding.eggLevel')}>
            <NumberInput
              value={b.breeding.eggLevel}
              min={1}
              max={100}
              onChange={set('breeding')('eggLevel')}
              disabled={disabled}
            />
          </Field>
          <Field label="Pensions au départ" error={err('daycare.initialSlots')}>
            <NumberInput
              value={b.daycare.initialSlots}
              min={0}
              onChange={set('daycare')('initialSlots')}
              disabled={disabled}
            />
          </Field>
          <Field label="Pensions maximum" error={err('daycare.maxSlots')}>
            <NumberInput
              value={b.daycare.maxSlots}
              min={1}
              onChange={set('daycare')('maxSlots')}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      {preview && (
        <Section title="Aperçu : temps d’éclosion">
          <table className="text-sm">
            <tbody>
              {HATCH_EXAMPLES.map((id) => {
                const species = preview.species(id);
                return (
                  species && (
                    <tr key={id}>
                      <td className="pr-6">{species.nameFr}</td>
                      <td className="pr-6 text-slate-500">{species.hatchCounter ?? '—'} cycles</td>
                      <td className="font-mono">{formatMinutes(hatchMinutes(preview, id))}</td>
                    </tr>
                  )
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Transfert et Bonbons de lignée">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bonbons par transfert" error={err('transfer.candiesPerPokemon')}>
            <NumberInput
              value={b.transfer.candiesPerPokemon}
              min={0}
              onChange={set('transfer')('candiesPerPokemon')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Bonus shiny"
            hint="Bonbons en plus pour un Pokémon shiny."
            error={err('transfer.shinyBonusCandies')}
          >
            <NumberInput
              value={b.transfer.shinyBonusCandies}
              min={0}
              onChange={set('transfer')('shinyBonusCandies')}
              disabled={disabled}
            />
          </Field>
          <Field
            label="XP par Bonbon"
            hint="Donné à un Pokémon de la même lignée."
            error={err('transfer.xpPerCandy')}
          >
            <NumberInput
              value={b.transfer.xpPerCandy}
              min={0}
              unit="XP"
              onChange={set('transfer')('xpPerCandy')}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Nouveaux joueurs">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Niveau du starter" error={err('newPlayer.starterLevel')}>
            <NumberInput
              value={b.newPlayer.starterLevel}
              min={1}
              max={100}
              onChange={set('newPlayer')('starterLevel')}
              disabled={disabled}
            />
          </Field>
          <Field label="Argent de départ" error={err('newPlayer.startingCurrency')}>
            <NumberInput
              value={b.newPlayer.startingCurrency}
              min={0}
              unit="₽"
              onChange={set('newPlayer')('startingCurrency')}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field label="Inventaire de départ">
          <div className="space-y-2">
            {b.newPlayer.startingInventory.map((s, i) => {
              const update = (patch: Partial<typeof s>) =>
                set('newPlayer')('startingInventory')(
                  b.newPlayer.startingInventory.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <div key={i} className="flex items-center gap-2">
                  <ItemSelect
                    ctx={working.ctx}
                    value={s.itemId}
                    disabled={disabled}
                    onChange={(itemId) => itemId && update({ itemId })}
                  />
                  <NumberInput
                    className="w-32"
                    value={s.quantity}
                    min={1}
                    unit="×"
                    disabled={disabled}
                    onChange={(quantity) => update({ quantity })}
                  />
                  {!disabled && (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      onClick={() =>
                        set('newPlayer')('startingInventory')(
                          b.newPlayer.startingInventory.filter((_, j) => j !== i),
                        )
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            {!disabled && working.content.items.length > 0 && (
              <button
                type="button"
                className="btn-ghost py-1 text-xs"
                onClick={() =>
                  set('newPlayer')('startingInventory')([
                    ...b.newPlayer.startingInventory,
                    { itemId: working.content.items[0]!.id, quantity: 1 },
                  ])
                }
              >
                + Objet
              </button>
            )}
          </div>
        </Field>
      </Section>
    </div>
  );
}
