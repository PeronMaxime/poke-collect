import { lazyPage } from '../lib/lazy';

/**
 * Les pages du jeu, une par onglet, chargées à la demande (voir `lib/lazy.ts`). La coquille
 * (`HomePage`) n'importe que ce fichier : aucun écran n'est dans le code chargé à l'ouverture.
 */

export const ExpeditionsPage = lazyPage(() =>
  import('./expeditions/ExpeditionsPage').then((m) => m.ExpeditionsPage),
);
export const BattlesPage = lazyPage(() =>
  import('./battles/BattlesPage').then((m) => m.BattlesPage),
);
export const DungeonsPage = lazyPage(() =>
  import('./dungeons/DungeonsPage').then((m) => m.DungeonsPage),
);
export const CenterPage = lazyPage(() => import('./center/CenterPage').then((m) => m.CenterPage));
export const DaycarePage = lazyPage(() =>
  import('./daycare/DaycarePage').then((m) => m.DaycarePage),
);
export const MuseumPage = lazyPage(() => import('./museum/MuseumPage').then((m) => m.MuseumPage));
export const FarmPage = lazyPage(() => import('./farm/FarmPage').then((m) => m.FarmPage));
export const QuestsPage = lazyPage(() => import('./quests/QuestsPage').then((m) => m.QuestsPage));
export const ShopPage = lazyPage(() => import('./shop/ShopPage').then((m) => m.ShopPage));
export const PcPage = lazyPage(() => import('./pc/PcPage').then((m) => m.PcPage));
export const TeamsPage = lazyPage(() => import('./teams/TeamsPage').then((m) => m.TeamsPage));
export const PokedexPage = lazyPage(() =>
  import('./pokedex/PokedexPage').then((m) => m.PokedexPage),
);
export const InventoryPage = lazyPage(() =>
  import('./bag/InventoryPage').then((m) => m.InventoryPage),
);
export const TrainerCardPage = lazyPage(() =>
  import('./trainer/TrainerCardPage').then((m) => m.TrainerCardPage),
);
export const GuildPage = lazyPage(() => import('./guild/GuildPage').then((m) => m.GuildPage));
export const LeaderboardPage = lazyPage(() =>
  import('./trainer/LeaderboardPage').then((m) => m.LeaderboardPage),
);
export const WikiPage = lazyPage(() => import('./wiki/WikiPage').then((m) => m.WikiPage));

/** Colonne des bâtiments (grand écran seulement). */
export const BuildingsColumn = lazyPage(() =>
  import('./buildings/BuildingsColumn').then((m) => m.BuildingsColumn),
);

/**
 * Pages téléchargées en avance, une fois le jeu affiché : changer d'onglet reste immédiat. Le
 * wiki, rarement ouvert et volumineux, attend qu'on le demande.
 */
export const PRELOADED_PAGES = [
  ExpeditionsPage,
  PcPage,
  BattlesPage,
  DungeonsPage,
  CenterPage,
  DaycarePage,
  MuseumPage,
  FarmPage,
  QuestsPage,
  ShopPage,
  TeamsPage,
  PokedexPage,
  InventoryPage,
  TrainerCardPage,
  GuildPage,
  LeaderboardPage,
];
