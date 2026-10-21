import { useState } from 'react';
import { DUNGEON_DIFFICULTIES, dungeonSchema } from '@poke/content';
import type { Dungeon, DungeonDifficulty, TrainerPokemon } from '@poke/content';
import { directLineage, natures } from '@poke/data';
import {
  attackIntervalMs,
  buildDungeonSetup,
  dungeonCooldownMinutes,
  dungeonDifficulty,
  dungeonEnemies,
  dungeonKoMinutes,
  dungeonOpponentInstance,
  simulateDungeon,
} from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { EntityPage } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import {
  Field,
  NullableNumberInput,
  NumberInput,
  Section,
  TextInput,
  Toggle,
  errorsUnder,
} from '../../components/forms/fields';
import {
  FormSelect,
  ItemIcon,
  ItemSelect,
  SpeciesSelect,
  SpeciesSetEditor,
  Sprite,
  UnlockEditor,
  WeatherSelect,
} from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';
import { TeamEditor } from './TrainersPage';

/** Les réglages de combat communs à tous les donjons sont dans la page Équilibrage. */
export function DungeonsPage() {
  return <DungeonsView />;
}

/** Niveau, PV et délai entre deux attaques d'un adversaire (boss : PV multipliés). */
function opponentSummary(ctx: GameContext, member: TrainerPokemon, hpMultiplier = 1): string {
  const species = ctx.species(member.speciesId, member.formId);
  if (!species) return '—';
  const [fighter] = dungeonEnemies(ctx, {
    ...emptyDungeon(ctx),
    opponents: [],
    boss: member,
    bossHpMultiplier: hpMultiplier,
  });
  if (!fighter) return '—';
  const interval = attackIntervalMs(ctx.balance.combat, fighter.stats.speed);
  return `N.${fighter.level} · ${fighter.maxHp} PV · ${(interval / 1000).toFixed(1)} s`;
}

function emptyDungeon(ctx: GameContext): Dungeon {
  return {
    id: '',
    regionId: ctx.regions[0]?.id ?? '',
    order: 0,
    name: '',
    description: '',
    difficulty: 'easy',
    boss: { speciesId: 6, formId: null, level: 50, iv: null, nature: null },
    bossHpMultiplier: 1.5,
    familySpeciesIds: directLineage(6),
    opponents: [],
    timeLimitSeconds: 180,
    cooldownMinutes: null,
    koMinutes: null,
    money: 5000,
    lootTableId: null,
    lootRolls: 0,
    gemItemId: null,
    gemChance: 0.1,
    enabled: true,
    unlock: { type: 'always' },
  };
}

function DungeonsView() {
  return (
    <EntityPage<Dungeon>
      title="Donjons"
      description="Un donjon par Méga-Évolution : lignée à capturer, adversaires, boss, temps imparti, récompenses et Méga-Gemme."
      collection="dungeons"
      entityKind="dungeon"
      schema={dungeonSchema}
      list={(w) => w.ctx.dungeons as Dungeon[]}
      getKey={(d) => d.id}
      searchText={(d, w) =>
        `${d.id} ${d.name} ${w.ctx.species(d.boss.speciesId, d.boss.formId)?.nameFr ?? ''}`
      }
      renderListItem={(d, w) => (
        <span className="flex items-center gap-2">
          <Sprite id={d.boss.speciesId} formId={d.boss.formId} size={32} />
          <span className="min-w-0">
            <span
              className={`block truncate font-medium ${d.enabled && w.ctx.region(d.regionId)?.enabled !== false ? '' : 'line-through'}`}
            >
              {d.name}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {w.ctx.region(d.regionId)?.name ?? d.regionId} · {dungeonDifficulty(w.ctx, d).name} ·
              boss N.{d.boss.level}
            </span>
          </span>
        </span>
      )}
      create={(w) => ({ ...emptyDungeon(w.ctx), order: w.content.dungeons.length })}
      duplicate={(d) => ({ ...structuredClone(d), id: `${d.id}-copie`, name: `${d.name} (copie)` })}
      renderForm={(p) => <DungeonForm {...p} />}
      renderExtra={(d, w) => <DungeonSimulator key={d.id} dungeon={d} working={w} />}
      newLabel="Nouveau donjon"
    />
  );
}

function DungeonForm({
  value: d,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<Dungeon>) {
  const set = <K extends keyof Dungeon>(key: K, v: Dungeon[K]) => onChange({ ...d, [key]: v });
  const setBoss = (patch: Partial<TrainerPokemon>) => set('boss', { ...d.boss, ...patch });
  const { ctx } = working;
  const disabled = !editable;
  const rules = ctx.balance.dungeons;
  const lineage = directLineage(d.boss.speciesId);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint="Minuscules et tirets, non modifiable ensuite."
          error={errors.get('id')}
        >
          <TextInput value={d.id} onChange={(v) => set('id', v)} disabled={disabled || !isNew} />
        </Field>
        <Field label="Nom" error={errors.get('name')}>
          <TextInput value={d.name} onChange={(v) => set('name', v)} disabled={disabled} />
        </Field>
        <Field label="Région" error={errors.get('regionId')}>
          <select
            className="input"
            value={d.regionId}
            disabled={disabled}
            onChange={(e) => set('regionId', e.target.value)}
          >
            {ctx.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ordre d’affichage" error={errors.get('order')}>
          <NumberInput
            value={d.order}
            min={0}
            onChange={(v) => set('order', v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Difficulté"
          hint="Information affichée au joueur, sans effet sur le combat : les niveaux, le temps et les récompenses se règlent ci-dessous."
          error={errors.get('difficulty')}
        >
          <select
            className="input"
            value={d.difficulty}
            disabled={disabled}
            onChange={(e) => set('difficulty', e.target.value as DungeonDifficulty)}
          >
            {DUNGEON_DIFFICULTIES.map((id) => (
              <option key={id} value={id}>
                {rules.difficulties[id].name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description" error={errors.get('description')}>
        <TextInput
          value={d.description}
          onChange={(v) => set('description', v)}
          disabled={disabled}
        />
      </Field>
      <Toggle
        checked={d.enabled}
        onChange={(v) => set('enabled', v)}
        label="Donjon activé (désactivé : caché aux joueurs, plus aucune tentative ne peut être lancée)"
        disabled={disabled}
      />

      <Section title="Boss">
        <div className="flex flex-wrap items-start gap-4">
          <Sprite id={d.boss.speciesId} formId={d.boss.formId} size={96} />
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <Field label="Espèce" error={errors.get('boss.speciesId')}>
              <SpeciesSelect
                ctx={ctx}
                value={d.boss.speciesId}
                disabled={disabled}
                onChange={(speciesId) => setBoss({ speciesId, formId: null })}
              />
              <FormSelect
                speciesId={d.boss.speciesId}
                value={d.boss.formId}
                disabled={disabled}
                onChange={(formId) => setBoss({ formId })}
              />
              {errorsUnder(errors, 'boss').map((msg) => (
                <p key={msg} className="text-xs text-red-600">
                  {msg}
                </p>
              ))}
            </Field>
            <Field label="Niveau">
              <NumberInput
                value={d.boss.level}
                min={1}
                max={100}
                onChange={(level) => setBoss({ level })}
                disabled={disabled}
              />
            </Field>
            <Field label="IV (×6)" hint={`Vide = ${rules.defaultOpponentIv} (équilibrage).`}>
              <NullableNumberInput
                value={d.boss.iv}
                min={0}
                max={31}
                placeholder={String(rules.defaultOpponentIv)}
                onChange={(iv) => setBoss({ iv })}
                disabled={disabled}
              />
            </Field>
            <Field label="Nature">
              <select
                className="input"
                value={d.boss.nature ?? ''}
                disabled={disabled}
                onChange={(e) => setBoss({ nature: e.target.value || null })}
              >
                <option value="">Neutre</option>
                {natures.map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.nameFr}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Multiplicateur de PV du boss"
              hint={opponentSummary(ctx, d.boss, d.bossHpMultiplier)}
              error={errors.get('bossHpMultiplier')}
            >
              <NumberInput
                value={d.bossHpMultiplier}
                min={0.1}
                max={20}
                step={0.1}
                unit="×"
                onChange={(v) => set('bossHpMultiplier', v)}
                disabled={disabled}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Lignée à capturer">
        <p className="text-xs text-slate-500">
          Le donjon apparaît dès qu’une de ces espèces est capturée, et s’ouvre quand elles le sont
          toutes.
        </p>
        <SpeciesSetEditor
          ctx={ctx}
          value={d.familySpeciesIds}
          onChange={(v) => set('familySpeciesIds', v)}
          disabled={disabled}
        />
        {errors.get('familySpeciesIds') && (
          <p className="text-xs text-red-600">{errors.get('familySpeciesIds')}</p>
        )}
        {!disabled && lineage.join() !== d.familySpeciesIds.join() && (
          <button
            type="button"
            className="btn-ghost py-1 text-xs"
            onClick={() => set('familySpeciesIds', lineage)}
          >
            Remplacer par la lignée du boss (
            {lineage.map((id) => ctx.species(id)?.nameFr ?? id).join(', ')})
          </button>
        )}
      </Section>

      <Section title={`Adversaires avant le boss (${d.opponents.length})`}>
        <TeamEditor
          working={working}
          team={d.opponents}
          onChange={(v) => set('opponents', v)}
          errors={errors}
          errorPath="opponents"
          disabled={disabled}
          minSize={0}
          maxSize={30}
          defaultIv={rules.defaultOpponentIv}
          column={{
            label: 'En combat',
            value: (m) => opponentSummary(ctx, m),
          }}
        />
      </Section>

      <Section title="Règles">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Météo"
            hint="Soleil : Feu ×1,5, Eau ×0,5 ; Pluie : l’inverse ; Sable et Grêle : dégâts à chaque attaque."
          >
            <WeatherSelect
              value={d.weather}
              disabled={disabled}
              onChange={(v) => set('weather', v ?? undefined)}
            />
          </Field>
          <Field label="Temps imparti" error={errors.get('timeLimitSeconds')}>
            <NumberInput
              value={d.timeLimitSeconds}
              min={10}
              max={3600}
              unit="s"
              onChange={(v) => set('timeLimitSeconds', v)}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Temps de recharge"
            hint={`Après chaque tentative. Vide = ${rules.cooldownMinutes} min.`}
            error={errors.get('cooldownMinutes')}
          >
            <NullableNumberInput
              value={d.cooldownMinutes}
              min={0}
              unit="min"
              placeholder={String(rules.cooldownMinutes)}
              onChange={(v) => set('cooldownMinutes', v)}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Durée de K.O."
            hint={`Pokémon mis K.O. Vide = ${rules.koMinutes} min.`}
            error={errors.get('koMinutes')}
          >
            <NullableNumberInput
              value={d.koMinutes}
              min={0}
              unit="min"
              placeholder={String(rules.koMinutes)}
              onChange={(v) => set('koMinutes', v)}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field label="Condition supplémentaire" error={errorsUnder(errors, 'unlock')[0]}>
          <UnlockEditor
            value={d.unlock}
            regions={ctx.regions}
            trainers={ctx.trainers}
            quests={ctx.quests}
            onChange={(v) => set('unlock', v)}
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Récompenses de victoire">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Argent" error={errors.get('money')}>
            <NumberInput
              value={d.money}
              min={0}
              unit="₽"
              onChange={(v) => set('money', v)}
              disabled={disabled}
            />
          </Field>
          <Field label="Table de butin" error={errors.get('lootTableId')}>
            <select
              className="input"
              value={d.lootTableId ?? ''}
              disabled={disabled}
              onChange={(e) => set('lootTableId', e.target.value || null)}
            >
              <option value="">Aucune</option>
              {working.content.lootTables.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.id})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tirages de butin" error={errors.get('lootRolls')}>
            <NumberInput
              value={d.lootRolls}
              min={0}
              max={20}
              onChange={(v) => set('lootRolls', v)}
              disabled={disabled}
            />
          </Field>
          <Field label="Méga-Gemme" error={errors.get('gemItemId')}>
            <ItemSelect
              ctx={ctx}
              value={d.gemItemId}
              allowNone
              filter={(id) => ctx.item(id)?.category === 'megaStone'}
              onChange={(v) => set('gemItemId', v)}
              disabled={disabled}
            />
          </Field>
          <Field label="Chance de Méga-Gemme" error={errors.get('gemChance')}>
            <NumberInput
              value={d.gemChance}
              scale={100}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => set('gemChance', v)}
              disabled={disabled}
            />
          </Field>
        </div>
        {d.lootTableId && (
          <ul className="flex flex-wrap gap-3 text-xs text-slate-500">
            {ctx.lootTable(d.lootTableId)?.entries.map((e) => (
              <li key={e.itemId} className="flex items-center gap-1">
                <ItemIcon ctx={ctx} id={e.itemId} size={20} />
                {ctx.item(e.itemId)?.name ?? e.itemId} · {Math.round(e.chance * 100)} %
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** IV de l'équipe type du simulateur quand ils ne sont pas fixés (moyenne d'un Pokémon sauvage). */
const TEAM_IV = 15;

/** Victoires d'une équipe type contre ce donjon (sans changement de Pokémon), sur 50 tirages. */
function DungeonSimulator({ dungeon, working }: { dungeon: Dungeon; working: WorkingVersion }) {
  const { ctx } = working;
  const [team, setTeam] = useState<TrainerPokemon[]>(() =>
    Array.from({ length: 4 }, () => ({
      speciesId: dungeon.familySpeciesIds.at(-1) ?? 25,
      formId: null,
      level: dungeon.boss.level,
      iv: null,
      nature: null,
    })),
  );
  const [result, setResult] = useState<string | null>(null);
  const valid = dungeonSchema.safeParse(dungeon).success && team.length > 0;

  function run() {
    const outcomes = { win: 0, loss: 0, timeout: 0, fled: 0 };
    let time = 0;
    let defeated = 0;
    const runs = 50;
    for (let seed = 0; seed < runs; seed++) {
      const members = team.map((m) => ({
        ...dungeonOpponentInstance(m, TEAM_IV),
        xp: 0,
        ability: '',
        isShiny: false,
        gender: 'male' as const,
        happiness: 0,
        move: null,
      }));
      const setup = buildDungeonSetup(ctx, dungeon, members, seed);
      const { state } = simulateDungeon(setup, [], null, setup.timeLimitMs);
      outcomes[state.outcome ?? 'timeout']++;
      time += state.endedAtMs ?? setup.timeLimitMs;
      defeated += state.defeated;
    }
    setResult(
      `${Math.round((outcomes.win / runs) * 100)} % de victoires · ${outcomes.loss} équipes K.O. · ${outcomes.timeout} temps écoulés · ${(time / runs / 1000).toFixed(0)} s en moyenne · ${(defeated / runs).toFixed(1)} / ${dungeon.opponents.length + 1} adversaires vaincus`,
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Simulateur</h2>
        <p className="text-xs text-slate-500">
          Équipe type (IV {TEAM_IV} si vide, attaque par défaut, sans changement de Pokémon), contre
          le donjon affiché (modifications non enregistrées comprises). Recharge{' '}
          {dungeonCooldownMinutes(ctx, dungeon)} min · K.O. {dungeonKoMinutes(ctx, dungeon)} min.
        </p>
      </div>
      <TeamEditor
        working={working}
        team={team}
        onChange={setTeam}
        errors={new Map()}
        disabled={false}
        defaultIv={TEAM_IV}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={!valid} onClick={run}>
          Simuler 50 tentatives
        </button>
        {result && <p className="text-sm">{result}</p>}
      </div>
    </div>
  );
}
