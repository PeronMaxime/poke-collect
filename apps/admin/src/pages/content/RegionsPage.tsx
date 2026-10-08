import { regionSchema } from '@poke/content';
import type { Region } from '@poke/content';
import { EntityPage } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import {
  Field,
  NullableTextInput,
  NumberInput,
  Section,
  TextInput,
  Toggle,
  errorsUnder,
} from '../../components/forms/fields';
import { SpeciesSetEditor, Sprite, UnlockEditor } from '../../components/forms/pickers';

export function RegionsPage() {
  return (
    <EntityPage<Region>
      title="Régions"
      description="Ordre, nom, image, espèces incluses, starters et condition de déblocage."
      collection="regions"
      entityKind="region"
      schema={regionSchema}
      list={(w) => w.ctx.regions as Region[]}
      getKey={(r) => r.id}
      searchText={(r) => `${r.id} ${r.name}`}
      renderListItem={(r) => (
        <>
          <span className={`block truncate font-medium ${r.enabled ? '' : 'line-through'}`}>
            {r.name}
          </span>
          <span className="block text-xs text-slate-500">
            {r.speciesIds.length} espèces · ordre {r.order}
          </span>
        </>
      )}
      create={(w) => ({
        id: '',
        order: w.content.regions.length,
        name: '',
        image: null,
        speciesIds: [],
        starterSpeciesIds: [],
        enabled: true,
        unlock: { type: 'always' },
      })}
      renderForm={(p) => <RegionForm {...p} />}
      newLabel="Nouvelle région"
    />
  );
}

function RegionForm({
  value: r,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<Region>) {
  const set = <K extends keyof Region>(key: K, v: Region[K]) => onChange({ ...r, [key]: v });
  const disabled = !editable;
  const others = working.ctx.regions.filter((x) => x.id !== r.id);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint="Minuscules et tirets, non modifiable ensuite."
          error={errors.get('id')}
        >
          <TextInput value={r.id} onChange={(v) => set('id', v)} disabled={disabled || !isNew} />
        </Field>
        <Field label="Nom" error={errors.get('name')}>
          <TextInput value={r.name} onChange={(v) => set('name', v)} disabled={disabled} />
        </Field>
        <Field
          label="Ordre"
          hint="La première région (ordre le plus bas) est celle des nouveaux joueurs."
          error={errors.get('order')}
        >
          <NumberInput
            value={r.order}
            min={0}
            onChange={(v) => set('order', v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Image (URL)" error={errors.get('image')}>
          <NullableTextInput
            value={r.image}
            onChange={(v) => set('image', v)}
            disabled={disabled}
            placeholder="https://…"
          />
        </Field>
        <Field
          label="Condition de déblocage"
          className="sm:col-span-2"
          error={errorsUnder(errors, 'unlock')[0]}
        >
          <UnlockEditor
            value={r.unlock}
            regions={others.length > 0 ? others : working.ctx.regions}
            trainers={working.ctx.trainers}
            quests={working.ctx.quests}
            onChange={(v) => set('unlock', v)}
            disabled={disabled}
          />
        </Field>
      </div>
      <Toggle
        checked={r.enabled}
        onChange={(v) => set('enabled', v)}
        label="Région activée (désactivée : cachée aux joueurs, avec ses zones, dresseurs, quêtes et paliers de Pokédex)"
        disabled={disabled}
      />

      <Section title="Espèces incluses">
        <SpeciesSetEditor
          ctx={working.ctx}
          value={r.speciesIds}
          disabled={disabled}
          onChange={(ids) =>
            onChange({
              ...r,
              speciesIds: ids,
              starterSpeciesIds: r.starterSpeciesIds.filter((s) => ids.includes(s)),
            })
          }
        />
      </Section>

      <Section title="Starters">
        <p className="text-xs text-slate-500">
          Proposés au choix des nouveaux joueurs (parmi les espèces de la région).
        </p>
        {r.starterSpeciesIds.length > 0 && (
          <div className="flex gap-2">
            {r.starterSpeciesIds.map((id) => (
              <span key={id} className="flex flex-col items-center text-xs">
                <Sprite id={id} size={56} />
                {working.ctx.species(id)?.nameFr}
              </span>
            ))}
          </div>
        )}
        {editable && (
          <SpeciesSetEditor
            ctx={working.ctx}
            value={r.starterSpeciesIds}
            candidates={r.speciesIds}
            onChange={(ids) => set('starterSpeciesIds', ids)}
          />
        )}
      </Section>
    </div>
  );
}
