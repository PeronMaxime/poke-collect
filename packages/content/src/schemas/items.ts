import { z } from 'zod';
import { raritySchema, slugSchema } from './common';
import type { Rarity } from './common';
import { formIdSchema, imageSchema, nameSchema, probabilitySchema } from './internal';
import type { BagSettings } from './menu';
import type { ShopEntry } from './shop';

/**
 * Objets et leurs effets.
 */

export const ITEM_CATEGORIES = [
  'ball',
  /** Soin : Rappels… */
  'heal',
  'berry',
  'evolution',
  /** Entraînement : Super Bonbons… */
  'training',
  'breeding',
  'endgame',
  'fossil',
  'megaStone',
  'chest',
  /** Objet de quête : trouvé seulement pendant l'étape qui le demande, ni vendu ni utilisé. */
  'quest',
  'misc',
] as const;

export const itemCategorySchema = z.enum(ITEM_CATEGORIES);

export type ItemCategory = z.infer<typeof itemCategorySchema>;

/** Rubriques du Sac : les catégories d'objets, puis les œufs ramassés et les Bonbons de lignée. */
export const BAG_SECTIONS = [...ITEM_CATEGORIES, 'eggs', 'candies'] as const;

export type BagSectionId = (typeof BAG_SECTIONS)[number];

/** Titre par défaut de chaque rubrique du Sac. */
export const DEFAULT_BAG_SECTION_TITLES: Record<BagSectionId, string> = {
  ball: 'Balls',
  heal: 'Soin',
  berry: 'Baies',
  evolution: 'Objets d’évolution',
  training: 'Entraînement',
  breeding: 'Élevage',
  endgame: 'Objets rares',
  fossil: 'Fossiles',
  megaStone: 'Méga-Gemmes',
  chest: 'Coffres de guilde',
  quest: 'Objets de quête',
  misc: 'Divers',
  eggs: 'Œufs',
  candies: 'Bonbons de lignée',
};

/** Onglet du Sac : son titre et ses rubriques, affichées l'une sous l'autre. */
export interface BagTab {
  title: string;
  sections: BagSectionId[];
}

/** Rangement du Sac par défaut (sans réglage dans l'admin). */
export const DEFAULT_BAG_TABS: BagTab[] = [
  { title: 'Combat', sections: ['ball', 'heal', 'berry'] },
  { title: 'Évolution', sections: ['evolution', 'training', 'megaStone', 'candies'] },
  { title: 'Élevage', sections: ['breeding', 'eggs'] },
  { title: 'Trésors', sections: ['endgame', 'fossil', 'chest', 'quest', 'misc'] },
];

/**
 * Rangement du Sac complet : rubriques inconnues ou en double retirées, onglets vides retirés,
 * rubriques absentes ajoutées au dernier onglet ; titres par défaut pour les rubriques sans titre.
 */
export function normalizeBag(bag: BagSettings | undefined): {
  tabs: BagTab[];
  sectionTitles: Record<BagSectionId, string>;
} {
  const known = new Set<string>(BAG_SECTIONS);
  const seen = new Set<string>();
  const tabs: BagTab[] = [];
  for (const tab of bag?.tabs ?? DEFAULT_BAG_TABS) {
    const sections: BagSectionId[] = [];
    for (const id of tab.sections) {
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      sections.push(id as BagSectionId);
    }
    if (sections.length > 0) tabs.push({ title: tab.title, sections });
  }
  const missing = BAG_SECTIONS.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    const last = tabs.at(-1);
    if (last) last.sections.push(...missing);
    else tabs.push({ title: 'Sac', sections: missing });
  }
  const sectionTitles = { ...DEFAULT_BAG_SECTION_TITLES };
  for (const id of BAG_SECTIONS) {
    const title = bag?.sectionTitles?.[id]?.trim();
    if (title) sectionTitles[id] = title;
  }
  return { tabs, sectionTitles };
}

/** Raretés des coffres de guilde, de la plus courante à la plus précieuse. */
export const CHEST_RARITIES = ['bronze', 'silver', 'gold'] as const;

export const chestRaritySchema = z.enum(CHEST_RARITIES);

export type ChestRarity = z.infer<typeof chestRaritySchema>;

export const CHEST_RARITY_LABELS: Record<ChestRarity, string> = {
  bronze: 'Bronze',
  silver: 'Argent',
  gold: 'Or',
};

/** Effets d'objets : briques génériques paramétrées dans l'admin. */
export const itemEffectSchema = z.discriminatedUnion('type', [
  /**
   * Utilisable comme Ball : multiplie la probabilité de capture ; `guaranteed` = capture assurée
   * (Master Ball).
   */
  z.object({
    type: z.literal('ball'),
    catchMultiplier: z.number().positive(),
    guaranteed: z.boolean().optional(),
  }),
  /** Consommé à chaque tentative de capture : multiplie la probabilité de capture. */
  z.object({ type: z.literal('captureBoost'), multiplier: z.number().positive() }),
  /** Tenu par un parent en pension : nombre d'IV transmis (Nœud Destin : 5). */
  z.object({ type: z.literal('breedingIvs'), count: z.int().min(0).max(6) }),
  /** Tenu par un parent en pension : chance de transmettre sa nature (Pierre Stase : 100 %). */
  z.object({ type: z.literal('breedingNature'), chance: probabilitySchema }),
  /** Possédé dans le sac (non consommé) : multiplie le taux shiny (Charme Chroma). */
  z.object({ type: z.literal('shinyCharm'), multiplier: z.number().min(1).max(100) }),
  /** Utilisé sur un Pokémon : met un IV au choix à 31, ou les 6 (Capsules d'Argent / d'Or). */
  z.object({ type: z.literal('ivCap'), all: z.boolean() }),
  /** Utilisé sur un Pokémon : change sa nature effective (Aromates). */
  z.object({ type: z.literal('mint'), nature: z.string().min(1) }),
  /**
   * Utilisé sur un Pokémon (qui arrive sans talent) : donne un talent normal au hasard, puis l'autre
   * (Pilule Talent), ou le talent caché (Patch Talent).
   */
  z.object({ type: z.literal('abilityChange'), hidden: z.boolean() }),
  /**
   * Déposé au Musée : redonne vie à un Pokémon (Fossile Nautile → Amonita) après `minutes`.
   * Consommé au dépôt.
   */
  z.object({
    type: z.literal('fossil'),
    speciesId: z.int().positive(),
    formId: formIdSchema,
    level: z.int().min(1).max(100),
    minutes: z.int().min(1).max(10_080),
  }),
  /**
   * Méga-Gemme : tenue par un Pokémon de l'espèce, le fait passer dans sa forme Méga (`formId`).
   * Retirée de l'inventaire à la Méga-Évolution, rendue quand le Pokémon redevient normal.
   */
  z.object({ type: z.literal('megaEvolution'), formId: z.int().positive() }),
  /** Utilisé sur un Pokémon K.O. : il est aussitôt soigné, sans passer par le Centre (Rappel). */
  z.object({ type: z.literal('revive') }),
  /**
   * Plantée à la ferme (consommée) : pousse `minutes` tant que le champ est arrosé, puis donne
   * de `minYield` à `maxYield` baies de la même espèce.
   */
  z.object({
    type: z.literal('berryPlant'),
    minutes: z.int().min(1).max(10_080),
    minYield: z.int().min(1).max(99),
    maxYield: z.int().min(1).max(99),
  }),
  /**
   * En combat (donjon, dresseur) : soigne le Pokémon actif de `fraction` de ses PV max (Baie
   * Sitrus), au plus une fois toutes les `cooldownSeconds` secondes.
   */
  z.object({
    type: z.literal('battleHeal'),
    fraction: z.number().gt(0).max(1),
    cooldownSeconds: z.int().min(0).max(3600).default(10),
  }),
  /** Utilisé sur un Pokémon : son bonheur augmente de `amount` (Baie Grena). */
  z.object({ type: z.literal('happiness'), amount: z.int().min(1).max(255) }),
  /** Utilisé sur un Pokémon : il gagne `levels` niveaux, sans dépasser 100 (Super Bonbon). */
  z.object({ type: z.literal('levelUp'), levels: z.int().min(1).max(99) }),
  /**
   * Emportée en expédition à la place d'une baie de capture : multiplie les rencontres (Baie
   * Nanana). Une baie par heure d'expédition, au moins une.
   */
  z.object({ type: z.literal('encounterBoost'), multiplier: z.number().min(1).max(10) }),
  /** Coffre de guilde : ouvert depuis le sac, il donne des lots tirés parmi ceux de sa rareté. */
  z.object({ type: z.literal('guildChest'), rarity: chestRaritySchema }),
  /**
   * Acheté en boutique : débloque aussitôt une parcelle de la ferme par objet, sans passer par le
   * sac. Le prix de l'article est multiplié par `priceGrowth` à chaque achat.
   */
  z.object({ type: z.literal('farmPlot'), priceGrowth: z.number().min(1).max(10) }),
]);

export type ItemEffect = z.infer<typeof itemEffectSchema>;

export type ItemEffectType = ItemEffect['type'];

export const itemSchema = z.object({
  /** Identique au nom PokéAPI pour un objet officiel (le sprite en découle). */
  id: slugSchema,
  name: nameSchema,
  description: z.string().max(500),
  /** Icône personnalisée ; si absente, sprite PokéAPI de l'objet. */
  icon: imageSchema,
  category: itemCategorySchema,
  rarity: raritySchema,
  /** Prix de revente unitaire à la boutique, en Poké Dollars ; null = invendable. */
  sellPrice: z.int().min(0).max(100_000_000).nullable(),
  effects: z.array(itemEffectSchema),
});

export type Item = z.infer<typeof itemSchema>;

/** Prix de revente par défaut d'un objet absent de la boutique ; null = invendable. */
export const DEFAULT_SELL_PRICES: Record<Rarity, number | null> = {
  common: 50,
  uncommon: 150,
  rare: 1000,
  epic: 3000,
  legendary: null,
};

/** Prix unitaire le plus bas d'un objet en boutique (articles actifs), ou null. */
export function lowestUnitPrice(
  entries: readonly Pick<ShopEntry, 'itemId' | 'price' | 'lotSize' | 'enabled'>[],
  itemId: string,
): number | null {
  let lowest: number | null = null;
  for (const e of entries) {
    if (e.itemId !== itemId || !e.enabled) continue;
    const unit = e.price / e.lotSize;
    if (lowest === null || unit < lowest) lowest = unit;
  }
  return lowest;
}

/**
 * Prix de revente suggéré : la moitié du prix unitaire en boutique (comme dans les jeux), sinon
 * selon la rareté.
 */
export function suggestedSellPrice(
  item: Pick<Item, 'id' | 'rarity'>,
  entries: readonly Pick<ShopEntry, 'itemId' | 'price' | 'lotSize' | 'enabled'>[],
): number | null {
  const unit = lowestUnitPrice(entries, item.id);
  return unit === null ? DEFAULT_SELL_PRICES[item.rarity] : Math.floor(unit / 2);
}
