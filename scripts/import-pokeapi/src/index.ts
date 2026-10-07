/**
 * Import PokéAPI → packages/data/generated/*.json
 *
 * Usage : pnpm import:pokeapi [--gens 1,2,3]
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
  GrowthRate,
  Item,
  NamedEntry,
  Nature,
  Species,
  StatName,
  Stats,
  TypeEntry,
} from '@poke/data/types';
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

function parseGens(argv: string[]): number[] {
  const idx = argv.indexOf('--gens');
  const raw = idx >= 0 ? argv[idx + 1] : undefined;
  if (!raw) return [1];
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
  const gens = parseGens(process.argv.slice(2));
  const api = new PokeApiClient(CACHE_DIR);
  console.log(`Import PokéAPI — générations ${gens.join(', ')}`);

  // Espèces + Pokémon par défaut
  const generations = await Promise.all(
    gens.map((g) => api.get<ApiGeneration>(`generation/${g}/`)),
  );
  const speciesRefs = generations.flatMap((g) => g.pokemon_species);
  const apiSpecies = await Promise.all(speciesRefs.map((s) => api.get<ApiSpecies>(s.url)));
  apiSpecies.sort((a, b) => a.id - b.id);

  const species: Species[] = await Promise.all(
    apiSpecies.map(async (s) => {
      const variety = s.varieties.find((v) => v.is_default) ?? s.varieties[0];
      if (!variety) throw new Error(`Aucune variété pour ${s.name}`);
      const p = await api.get<ApiPokemon>(variety.pokemon.url);
      const baseStats = Object.fromEntries(
        p.stats.map((st) => [st.stat.name as StatName, st.base_stat]),
      ) as Stats;
      return {
        id: s.id,
        name: s.name,
        nameFr: frName(s.names, s.name),
        generation: idFromUrl(s.generation.url),
        types: [...p.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
        baseStats,
        abilities: [...p.abilities]
          .sort((a, b) => a.slot - b.slot)
          .map((a) => ({ name: a.ability.name, isHidden: a.is_hidden })),
        captureRate: s.capture_rate,
        baseHappiness: s.base_happiness,
        baseExperience: p.base_experience,
        growthRate: s.growth_rate.name,
        eggGroups: s.egg_groups.map((e) => e.name),
        genderRate: s.gender_rate,
        hatchCounter: s.hatch_counter,
        habitat: s.habitat?.name ?? null,
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

  // Chaînes d'évolution (complètes : elles peuvent contenir des espèces d'autres générations)
  const chainIds = [...new Set(species.map((s) => s.evolutionChainId))].sort((a, b) => a - b);
  const evolutionChains: EvolutionChain[] = (
    await Promise.all(chainIds.map((id) => api.get<ApiEvolutionChain>(`evolution-chain/${id}/`)))
  ).map((c) => ({ id: c.id, chain: convertChain(c.chain) }));

  // Talents utilisés par les espèces importées
  const abilityNames = [...new Set(species.flatMap((s) => s.abilities.map((a) => a.name)))].sort();
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
  const itemNames = [
    ...new Set([
      ...categories.flatMap((c) => c.items.map((i) => i.name)),
      ...EXTRA_ITEMS,
      ...mints,
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
