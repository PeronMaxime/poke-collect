/**
 * Import PokéAPI → packages/data/generated/*.json
 *
 * Usage : pnpm import:pokeapi [--gens 1,2,3,4] (toutes les générations par défaut)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type {
  Ability,
  DataMeta,
  EvolutionChain,
  EvolutionDetail,
  EvolutionNode,
  FormKind,
  GrowthRate,
  Item,
  NamedEntry,
  Nature,
  PokemonForm,
  Species,
  StatName,
  Stats,
  TypeEntry,
} from '@poke/data/types';
import { inferHabitat } from '@poke/data/habitat';
import { PokeApiClient, frName, idFromUrl } from './pokeapi';
import type { LocalizedName, NamedResource } from './pokeapi';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT_DIR = join(ROOT, 'packages/data/generated');
const CACHE_DIR = fileURLToPath(new URL('../.cache', import.meta.url));

/** Objets importés en plus des catégories ci-dessous (élevage, endgame, baies de base). */
const EXTRA_ITEMS = [
  'rare-candy',
  'everstone',
  'destiny-knot',
  'linking-cord',
  'ability-capsule',
  'ability-patch',
  'bottle-cap',
  'gold-bottle-cap',
  'oran-berry',
  'sitrus-berry',
  'razz-berry',
  'nanab-berry',
  'pinap-berry',
];
const ITEM_CATEGORIES = ['standard-balls', 'special-balls', 'evolution'];
const REGIONAL_FORMS: Record<string, string> = {
  alola: 'd’Alola',
  galar: 'de Galar',
  hisui: 'de Hisui',
  paldea: 'de Paldea',
};

/** Identifiant des formes d'apparence (`pokemon-form`), décalé pour ne pas croiser `pokemon`. */
const COSMETIC_FORM_ID_OFFSET = 100_000;

function formKind(formName: string, f: ApiPokemonForm, isVariety: boolean): FormKind {
  if (/(^|-)totem(-|$)/.test(formName)) return 'totem';
  if (/(^|-)(gmax|eternamax)(-|$)/.test(formName)) return 'gmax';
  if (f.is_mega) return 'mega';
  if (formName === 'primal') return 'primal';
  if (f.is_battle_only) return 'battle';
  const regional = Object.keys(REGIONAL_FORMS).some(
    (r) => formName === r || formName.startsWith(`${r}-`),
  );
  // Les casquettes de Pikachu (`alola-cap`) ne sont pas des formes régionales.
  if (regional && !formName.endsWith('-cap')) return 'regional';
  return isVariety ? 'alternate' : 'cosmetic';
}

/** Nom FR d'une forme absente des traductions PokéAPI (formes récentes). */
function fallbackFormNames(
  kind: FormKind,
  formName: string,
  baseName: string,
  formNameFr: string | null,
): { nameFr: string; formNameFr: string } {
  const suffix = formName.split('-').slice(1).join(' ').toUpperCase();
  switch (kind) {
    case 'mega':
      return {
        nameFr: `Méga-${baseName}${suffix ? ` ${suffix}` : ''}`,
        formNameFr: `Méga-Évolution${suffix ? ` ${suffix}` : ''}`,
      };
    case 'primal':
      return { nameFr: `Primo-${baseName}`, formNameFr: 'Primo-Résurgence' };
    case 'gmax':
      return { nameFr: `${baseName} Gigamax`, formNameFr: 'Forme Gigamax' };
    case 'totem':
      return { nameFr: `${baseName} Dominant`, formNameFr: 'Pokémon Dominant' };
    case 'regional': {
      const region = REGIONAL_FORMS[formName.split('-')[0]!]!;
      return { nameFr: `${baseName} ${region}`, formNameFr: `Forme ${region}` };
    }
    default: {
      const label = formNameFr ?? formName.replaceAll('-', ' ');
      return { nameFr: `${baseName} (${label})`, formNameFr: label };
    }
  }
}

/** Nom de fichier d'un sprite PokéAPI (`…/pokemon/201-b.png` → `201-b`). */
function spriteFile(url: string | null | undefined): string | null {
  return url ? (/\/([^/]+)\.png$/.exec(url)?.[1] ?? null) : null;
}

interface ApiList {
  results: NamedResource[];
}
interface ApiGeneration {
  pokemon_species: NamedResource[];
}
interface ApiSpecies {
  id: number;
  name: string;
  names: LocalizedName[];
  capture_rate: number;
  base_happiness: number | null;
  growth_rate: NamedResource;
  egg_groups: NamedResource[];
  gender_rate: number;
  hatch_counter: number | null;
  habitat: NamedResource | null;
  color: NamedResource;
  shape: NamedResource | null;
  is_baby: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  evolution_chain: { url: string };
  evolves_from_species: NamedResource | null;
  generation: NamedResource;
  varieties: { is_default: boolean; pokemon: NamedResource }[];
}
interface ApiPokemon {
  id: number;
  name: string;
  is_default: boolean;
  forms: NamedResource[];
  sprites: { front_default: string | null };
  base_experience: number | null;
  height: number;
  weight: number;
  types: { slot: number; type: NamedResource }[];
  stats: { base_stat: number; stat: NamedResource }[];
  abilities: { ability: NamedResource; is_hidden: boolean; slot: number }[];
}
interface ApiEvolutionDetail {
  trigger: NamedResource;
  min_level: number | null;
  item: NamedResource | null;
  held_item: NamedResource | null;
  min_happiness: number | null;
  min_affection: number | null;
  min_beauty: number | null;
  time_of_day: string;
  known_move: NamedResource | null;
  known_move_type: NamedResource | null;
  location: NamedResource | null;
  gender: number | null;
  party_species: NamedResource | null;
  party_type: NamedResource | null;
  relative_physical_stats: number | null;
  trade_species: NamedResource | null;
  needs_overworld_rain: boolean;
  turn_upside_down: boolean;
  used_move?: NamedResource | null;
  min_move_count?: number | null;
  min_steps?: number | null;
  min_damage_taken?: number | null;
  allowed_natures?: NamedResource[] | null;
  near_special_rock?: boolean;
  needs_multiplayer?: boolean;
  required_pokemon_form?: NamedResource | null;
  evolved_pokemon_form?: NamedResource | null;
}
interface ApiChainLink {
  species: NamedResource;
  evolution_details: ApiEvolutionDetail[];
  evolves_to: ApiChainLink[];
}
interface ApiEvolutionChain {
  id: number;
  chain: ApiChainLink;
}
interface ApiPokemonForm {
  id: number;
  name: string;
  is_default: boolean;
  form_name: string;
  sprites: { front_default: string | null };
  /** Types propres à la forme (Arceus, Silvallié…), sinon vide. */
  types: { slot: number; type: NamedResource }[];
  is_battle_only: boolean;
  is_mega: boolean;
  names: LocalizedName[];
  form_names: LocalizedName[];
}
interface ApiNature {
  name: string;
  names: LocalizedName[];
  increased_stat: NamedResource | null;
  decreased_stat: NamedResource | null;
}
interface ApiNamed {
  name: string;
  names: LocalizedName[];
}
interface ApiType extends ApiNamed {
  damage_relations: Record<'double_damage_to' | 'half_damage_to' | 'no_damage_to', NamedResource[]>;
}
interface FlavorText {
  flavor_text?: string;
  text?: string;
  language: NamedResource;
}
interface ApiAbility extends ApiNamed {
  flavor_text_entries: FlavorText[];
}
interface ApiItem extends ApiNamed {
  category: NamedResource;
  sprites: { default: string | null };
  flavor_text_entries: FlavorText[];
}
interface ApiItemCategory {
  items: NamedResource[];
}
interface ApiGrowthRate {
  name: string;
  levels: { level: number; experience: number }[];
}

/** Générations demandées (`--gens 1,2`), ou null pour toutes. */
function parseGens(argv: string[]): number[] | null {
  const idx = argv.indexOf('--gens');
  const raw = idx >= 0 ? argv[idx + 1] : undefined;
  if (!raw) return null;
  return raw.split(',').map((g) => {
    const n = Number(g.trim());
    if (!Number.isInteger(n) || n < 1) throw new Error(`Génération invalide : ${g}`);
    return n;
  });
}

function lastFrText(entries: FlavorText[]): string | null {
  const fr = entries.filter((e) => e.language.name === 'fr');
  const last = fr[fr.length - 1];
  const text = last?.flavor_text ?? last?.text;
  return text ? text.replace(/\s+/g, ' ').trim() : null;
}

function compactDetail(d: ApiEvolutionDetail): EvolutionDetail {
  const out: EvolutionDetail = { trigger: d.trigger.name };
  if (d.min_level != null) out.minLevel = d.min_level;
  if (d.item) out.item = d.item.name;
  if (d.held_item) out.heldItem = d.held_item.name;
  if (d.min_happiness != null) out.minHappiness = d.min_happiness;
  if (d.min_affection != null) out.minAffection = d.min_affection;
  if (d.min_beauty != null) out.minBeauty = d.min_beauty;
  if (d.time_of_day) out.timeOfDay = d.time_of_day;
  if (d.known_move) out.knownMove = d.known_move.name;
  if (d.known_move_type) out.knownMoveType = d.known_move_type.name;
  if (d.location) out.location = d.location.name;
  if (d.gender != null) out.gender = d.gender;
  if (d.party_species) out.partySpecies = d.party_species.name;
  if (d.party_type) out.partyType = d.party_type.name;
  if (d.relative_physical_stats != null) out.relativePhysicalStats = d.relative_physical_stats;
  if (d.trade_species) out.tradeSpecies = d.trade_species.name;
  if (d.needs_overworld_rain) out.needsOverworldRain = true;
  if (d.turn_upside_down) out.turnUpsideDown = true;
  if (d.used_move) out.usedMove = d.used_move.name;
  if (d.min_move_count != null) out.minMoveCount = d.min_move_count;
  if (d.min_steps != null) out.minSteps = d.min_steps;
  if (d.min_damage_taken != null) out.minDamageTaken = d.min_damage_taken;
  if (d.allowed_natures?.length) out.allowedNatures = d.allowed_natures.map((n) => n.name);
  if (d.near_special_rock) out.nearSpecialRock = true;
  if (d.needs_multiplayer) out.needsMultiplayer = true;
  if (d.required_pokemon_form) out.requiredForm = d.required_pokemon_form.name;
  if (d.evolved_pokemon_form) out.evolvedForm = d.evolved_pokemon_form.name;
  return out;
}

function convertChain(link: ApiChainLink): EvolutionNode {
  return {
    speciesId: idFromUrl(link.species.url),
    details: link.evolution_details.map(compactDetail),
    evolvesTo: link.evolves_to.map(convertChain),
  };
}

async function namedList(api: PokeApiClient, resource: string): Promise<NamedEntry[]> {
  const list = await api.get<ApiList>(`${resource}/?limit=1000`);
  const entries = await Promise.all(list.results.map((r) => api.get<ApiNamed>(r.url)));
  return entries.map((e) => ({ name: e.name, nameFr: frName(e.names, e.name) }));
}

async function main() {
  const api = new PokeApiClient(CACHE_DIR);
  const gens =
    parseGens(process.argv.slice(2)) ??
    (await api.get<ApiList>('generation/?limit=100')).results.map((g) => idFromUrl(g.url));
  console.log(`Import PokéAPI — générations ${gens.join(', ')}`);

  // Espèces + Pokémon par défaut
  const generations = await Promise.all(
    gens.map((g) => api.get<ApiGeneration>(`generation/${g}/`)),
  );
  const speciesRefs = generations.flatMap((g) => g.pokemon_species);
  const apiSpecies = await Promise.all(speciesRefs.map((s) => api.get<ApiSpecies>(s.url)));
  apiSpecies.sort((a, b) => a.id - b.id);

  const toStats = (p: ApiPokemon) =>
    Object.fromEntries(p.stats.map((st) => [st.stat.name as StatName, st.base_stat])) as Stats;
  const toAbilities = (p: ApiPokemon) =>
    [...p.abilities]
      .sort((a, b) => a.slot - b.slot)
      .map((a) => ({ name: a.ability.name, isHidden: a.is_hidden }));
  const toTypes = (p: Pick<ApiPokemon, 'types'>) =>
    [...p.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name);

  const species: Species[] = await Promise.all(
    apiSpecies.map(async (s) => {
      const variety = s.varieties.find((v) => v.is_default) ?? s.varieties[0];
      if (!variety) throw new Error(`Aucune variété pour ${s.name}`);
      const p = await api.get<ApiPokemon>(variety.pokemon.url);
      return {
        id: s.id,
        name: s.name,
        nameFr: frName(s.names, s.name),
        generation: idFromUrl(s.generation.url),
        types: toTypes(p),
        baseStats: toStats(p),
        abilities: toAbilities(p),
        captureRate: s.capture_rate,
        baseHappiness: s.base_happiness,
        baseExperience: p.base_experience,
        growthRate: s.growth_rate.name,
        eggGroups: s.egg_groups.map((e) => e.name),
        genderRate: s.gender_rate,
        hatchCounter: s.hatch_counter,
        habitat: s.habitat?.name ?? null,
        habitatInferred: false,
        color: s.color.name,
        shape: s.shape?.name ?? null,
        isBaby: s.is_baby,
        isLegendary: s.is_legendary,
        isMythical: s.is_mythical,
        evolutionChainId: idFromUrl(s.evolution_chain.url),
        evolvesFromSpeciesId: s.evolves_from_species ? idFromUrl(s.evolves_from_species.url) : null,
        heightDm: p.height,
        weightHg: p.weight,
      } satisfies Species;
    }),
  );
  console.log(`  ${species.length} espèces`);

  // Habitat maison des espèces sans habitat PokéAPI (Gen IV et suivantes)
  const references = species.flatMap((s) => (s.habitat ? [{ ...s, habitat: s.habitat }] : []));
  for (const s of species) {
    if (s.habitat) continue;
    s.habitat = inferHabitat(s, references);
    s.habitatInferred = s.habitat !== null;
  }

  // Formes : variétés (régionales, alternatives, Méga, Gigamax…) et formes d'apparence de la
  // variété par défaut (Zarbi, Prismillon…).
  const untranslated = new Set<PokemonForm>();
  const toForm = (
    s: ApiSpecies,
    p: ApiPokemon,
    f: ApiPokemonForm,
    isVariety: boolean,
  ): PokemonForm | null => {
    if (f.is_default && !isVariety) return null;
    const formName = f.form_name || p.name.replace(`${s.name}-`, '');
    const kind = formKind(formName, f, isVariety);
    const baseName = frName(s.names, s.name);
    const formNameFr = f.form_names.find((n) => n.language.name === 'fr')?.name ?? null;
    const fallback = fallbackFormNames(kind, formName, baseName, formNameFr);
    const form: PokemonForm = {
      id: isVariety ? p.id : COSMETIC_FORM_ID_OFFSET + f.id,
      speciesId: s.id,
      name: isVariety ? p.name : f.name,
      formName,
      nameFr: frName(f.names, fallback.nameFr),
      formNameFr: frName(f.form_names, fallback.formNameFr),
      kind,
      sprite: spriteFile(f.sprites.front_default ?? p.sprites.front_default),
      types: f.types.length > 0 ? toTypes(f) : toTypes(p),
      baseStats: toStats(p),
      abilities: toAbilities(p),
      baseExperience: p.base_experience,
    };
    const hasFrName = f.names.some((n) => n.language.name === 'fr');
    if (!hasFrName && !formNameFr && (kind === 'cosmetic' || kind === 'alternate')) {
      untranslated.add(form);
    }
    return form;
  };
  const forms: PokemonForm[] = (
    await Promise.all(
      apiSpecies.flatMap((s) =>
        s.varieties.map(async (v): Promise<(PokemonForm | null)[]> => {
          const p = await api.get<ApiPokemon>(v.pokemon.url);
          if (!v.is_default) {
            const formRef = p.forms[0];
            if (!formRef) return [];
            return [toForm(s, p, await api.get<ApiPokemonForm>(formRef.url), true)];
          }
          return Promise.all(
            p.forms.map(async (ref) => toForm(s, p, await api.get<ApiPokemonForm>(ref.url), false)),
          );
        }),
      ),
    )
  )
    .flat()
    .filter((f): f is PokemonForm => f !== null)
    .sort((a, b) => a.speciesId - b.speciesId || a.id - b.id);
  // Forme sans traduction (Lépidonille Toundra…) : nom FR de la même forme ailleurs (Prismillon).
  const translated = new Map<string, string>();
  for (const f of forms) {
    if (!untranslated.has(f)) translated.set(f.formName, f.formNameFr);
  }
  for (const f of untranslated) {
    const label = translated.get(f.formName);
    if (!label) continue;
    const baseName = frName(apiSpecies.find((s) => s.id === f.speciesId)!.names, '');
    f.formNameFr = label;
    f.nameFr = `${baseName} (${label})`;
  }
  console.log(`  ${forms.length} formes`);

  // Chaînes d'évolution (complètes : elles peuvent contenir des espèces d'autres générations)
  const chainIds = [...new Set(species.map((s) => s.evolutionChainId))].sort((a, b) => a - b);
  const evolutionChains: EvolutionChain[] = (
    await Promise.all(chainIds.map((id) => api.get<ApiEvolutionChain>(`evolution-chain/${id}/`)))
  ).map((c) => ({ id: c.id, chain: convertChain(c.chain) }));

  // Talents utilisés par les espèces importées
  const abilityNames = [
    ...new Set([...species, ...forms].flatMap((s) => s.abilities.map((a) => a.name))),
  ].sort();
  const abilities: Ability[] = (
    await Promise.all(abilityNames.map((n) => api.get<ApiAbility>(`ability/${n}/`)))
  ).map((a) => ({
    name: a.name,
    nameFr: frName(a.names, a.name),
    descriptionFr: lastFrText(a.flavor_text_entries),
  }));

  // Natures
  const natureList = await api.get<ApiList>('nature/?limit=100');
  const natures: Nature[] = (
    await Promise.all(natureList.results.map((n) => api.get<ApiNature>(n.url)))
  )
    .map((n) => ({
      name: n.name,
      nameFr: frName(n.names, n.name),
      increasedStat: (n.increased_stat?.name as StatName | undefined) ?? null,
      decreasedStat: (n.decreased_stat?.name as StatName | undefined) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Types (avec la table des efficacités), groupes d'œufs, habitats
  const typeList = await api.get<ApiList>('type/?limit=1000');
  const names = (refs: NamedResource[]) => refs.map((r) => r.name);
  const [types, eggGroups, habitats] = await Promise.all([
    Promise.all(typeList.results.map((r) => api.get<ApiType>(r.url))).then((list) =>
      list.map((t): TypeEntry => ({
        name: t.name,
        nameFr: frName(t.names, t.name),
        doubleDamageTo: names(t.damage_relations.double_damage_to),
        halfDamageTo: names(t.damage_relations.half_damage_to),
        noDamageTo: names(t.damage_relations.no_damage_to),
      })),
    ),
    namedList(api, 'egg-group'),
    namedList(api, 'pokemon-habitat'),
  ]);

  // Objets
  const allItems = await api.get<ApiList>('item/?limit=5000');
  const mints = allItems.results.map((i) => i.name).filter((n) => n.endsWith('-mint'));
  const categories = await Promise.all(
    ITEM_CATEGORIES.map((c) => api.get<ApiItemCategory>(`item-category/${c}/`)),
  );
  // Objets des évolutions (pierres, objets tenus, objets d'échange…)
  const evolutionItems = new Set<string>();
  const collectItems = (node: EvolutionNode) => {
    for (const d of node.details) {
      if (d.item) evolutionItems.add(d.item);
      if (d.heldItem) evolutionItems.add(d.heldItem);
    }
    node.evolvesTo.forEach(collectItems);
  };
  for (const c of evolutionChains) collectItems(c.chain);
  const itemNames = [
    ...new Set([
      ...categories.flatMap((c) => c.items.map((i) => i.name)),
      ...EXTRA_ITEMS,
      ...mints,
      ...evolutionItems,
    ]),
  ].sort();
  const items: Item[] = (
    await Promise.all(itemNames.map((n) => api.get<ApiItem>(`item/${n}/`)))
  ).map((i) => ({
    name: i.name,
    nameFr: frName(i.names, i.name),
    category: i.category.name,
    descriptionFr: lastFrText(i.flavor_text_entries),
    sprite: i.sprites.default,
  }));

  // Courbes d'XP
  const growthNames = [...new Set(species.map((s) => s.growthRate))].sort();
  const growthRates: GrowthRate[] = (
    await Promise.all(growthNames.map((n) => api.get<ApiGrowthRate>(`growth-rate/${n}/`)))
  ).map((g) => ({
    name: g.name,
    experienceByLevel: [...g.levels].sort((a, b) => a.level - b.level).map((l) => l.experience),
  }));

  const outputs = {
    species,
    forms,
    'evolution-chains': evolutionChains,
    natures,
    types,
    'egg-groups': eggGroups,
    habitats,
    abilities,
    items,
    'growth-rates': growthRates,
  };
  const meta: DataMeta = {
    importedAt: new Date().toISOString(),
    generations: gens,
    counts: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, v.length])),
  };

  await mkdir(OUT_DIR, { recursive: true });
  for (const [name, data] of Object.entries({ ...outputs, meta })) {
    await writeFile(join(OUT_DIR, `${name}.json`), JSON.stringify(data) + '\n');
  }
  console.log(`  ${JSON.stringify(meta.counts)}`);
  console.log(`  requêtes réseau : ${api.fetched}, depuis le cache : ${api.cached}`);
  console.log(`Écrit dans ${OUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
