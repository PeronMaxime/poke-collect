import type { Item, Quest, Trainer } from '../schemas';
import {
  catchOf,
  completed,
  defeated,
  expedition,
  find,
  questItem,
  questMon,
  questTrainer,
  reward,
  step,
} from './quests';

/**
 * Quêtes de formes : après le légendaire, une petite histoire qui mène à un dresseur redoutable
 * (Pokémon de la région, IV parfaits, au-dessus des dresseurs de quêtes des légendaires) ; vaincu,
 * il laisse l'objet de forme en récompense. Tenu au PC, cet objet change la forme du légendaire,
 * comme une Méga-Gemme (Primo-Kyogre, Primo-Groudon, formes de Deoxys).
 */

// --- Objets de forme ----------------------------------------------------------------------------

const formItem = (
  id: string,
  name: string,
  description: string,
  formId: number,
  sprite: string | null = null,
): Item => ({
  id,
  name,
  description,
  icon: sprite ? `/api/sprites/items/${sprite}.png` : null,
  category: 'formItem',
  rarity: 'legendary',
  sellPrice: null,
  effects: [{ type: 'formChange', formId }],
});

/** Objets de forme : un par forme, gagné en récompense de sa quête. */
export const formItems: Item[] = [
  formItem(
    'blue-orb',
    'Orbe Bleu',
    'Orbe qui renferme le pouvoir des océans. Tenu par Kyogre, il déclenche sa Primo-Résurgence.',
    10077,
  ),
  formItem(
    'red-orb',
    'Orbe Rouge',
    'Orbe qui renferme le pouvoir des continents. Tenu par Groudon, il déclenche sa Primo-Résurgence.',
    10078,
  ),
  formItem(
    'meteorite-attaque',
    'Météorite Attaque',
    'Fragment rougeoyant de la météorite de Deoxys. Tenu par Deoxys, il le fait passer en Forme Attaque.',
    10001,
    'meteorite',
  ),
  formItem(
    'meteorite-defense',
    'Météorite Défense',
    'Fragment dur comme le diamant de la météorite de Deoxys. Tenu par Deoxys, il le fait passer en Forme Défense.',
    10002,
    'meteorite',
  ),
  formItem(
    'meteorite-vitesse',
    'Météorite Vitesse',
    'Fragment qui file entre les doigts, tombé de la météorite de Deoxys. Tenu par Deoxys, il le fait passer en Forme Vitesse.',
    10003,
    'meteorite',
  ),
];

// --- Objets de quête ----------------------------------------------------------------------------

/** Objets de quête des quêtes de formes, rendus quand on réclame la quête. */
export const formQuestItems: Item[] = [
  questItem(
    'parchemin-des-abysses',
    'Parchemin des abysses',
    'Lambeau d’une fresque recopiée par la Team Aqua. On y devine Kyogre couvert de lignes lumineuses.',
    'scroll-of-waters',
  ),
  questItem(
    'roche-volcanique',
    'Roche volcanique',
    'Roche encore brûlante, frappée du sceau de la Team Magma.',
    'hard-stone',
  ),
  questItem(
    'eclat-ecarlate',
    'Éclat écarlate',
    'Éclat de météorite qui rougeoie à chaque coup porté autour de lui.',
    'red-shard',
  ),
  questItem(
    'eclat-de-jade',
    'Éclat de jade',
    'Éclat de météorite si dur qu’aucune pioche ne l’entame.',
    'green-shard',
  ),
  questItem(
    'eclat-dore',
    'Éclat doré',
    'Éclat de météorite qui ne tient jamais en place : il file dès qu’on le lâche.',
    'yellow-shard',
  ),
];

// --- Dresseurs ----------------------------------------------------------------------------------

/**
 * Boss des quêtes de formes : au-dessus des dresseurs de quêtes des légendaires (N.74 à 82), du
 * niveau 86 au niveau 90, sans légendaire.
 */
export const formQuestTrainers: Trainer[] = [
  questTrainer({
    id: 'quete-primo-kyogre-arthur',
    questId: 'primo-kyogre',
    regionId: 'hoenn',
    zoneId: 'grotte-sous-marine',
    order: 124,
    name: 'Arthur',
    trainerClass: 'Chef de la Team Aqua',
    spriteName: 'archie-gen3',
    team: [
      questMon(262, 86),
      questMon(279, 86),
      questMon(342, 87),
      questMon(365, 87),
      questMon(321, 88),
      questMon(319, 90),
    ],
    money: 25_000,
  }),
  questTrainer({
    id: 'quete-primo-groudon-max',
    questId: 'primo-groudon',
    regionId: 'hoenn',
    zoneId: 'grotte-originelle',
    order: 125,
    name: 'Max',
    trainerClass: 'Chef de la Team Magma',
    spriteName: 'maxie-gen3',
    team: [
      questMon(336, 86),
      questMon(324, 86),
      questMon(344, 87),
      questMon(330, 87),
      questMon(306, 88),
      questMon(323, 90),
    ],
    money: 25_000,
  }),
  questTrainer({
    id: 'quete-deoxys-attaque-ardent',
    questId: 'deoxys-attaque',
    regionId: 'hoenn',
    zoneId: 'zone-de-combat',
    order: 126,
    name: 'Ardent',
    trainerClass: 'As de la Zone de Combat',
    spriteName: 'blackbelt',
    team: [
      questMon(308, 86),
      questMon(286, 86),
      questMon(289, 87),
      questMon(297, 87),
      questMon(257, 88),
      questMon(373, 90),
    ],
    money: 25_000,
  }),
  questTrainer({
    id: 'quete-deoxys-defense-galene',
    questId: 'deoxys-defense',
    regionId: 'hoenn',
    zoneId: 'route-victoire-hoenn',
    order: 127,
    name: 'Galène',
    trainerClass: 'Géologue',
    spriteName: 'ruinmaniac-gen3',
    team: [
      questMon(324, 86),
      questMon(346, 86),
      questMon(348, 87),
      questMon(344, 87),
      questMon(306, 88),
      questMon(376, 90),
    ],
    money: 25_000,
  }),
  questTrainer({
    id: 'quete-deoxys-vitesse-rafale',
    questId: 'deoxys-vitesse',
    regionId: 'hoenn',
    zoneId: 'pilier-celeste',
    order: 128,
    name: 'Rafale',
    trainerClass: 'Ornithologue',
    spriteName: 'birdkeeper-gen3',
    team: [
      questMon(264, 86),
      questMon(291, 86),
      questMon(277, 87),
      questMon(335, 87),
      questMon(310, 88),
      questMon(254, 90),
    ],
    money: 25_000,
  }),
];

// --- Quêtes -------------------------------------------------------------------------------------

/** Récompense d'une quête de forme : son objet de forme et de l'argent. */
const formReward = (itemId: string) => ({
  ...reward({ currency: 50_000, items: [{ itemId, quantity: 1 }] }),
  pokemon: [],
});

/** Quêtes de formes de Hoenn (après les quêtes légendaires de la région). */
export const hoennFormQuests: Quest[] = [
  {
    id: 'primo-kyogre',
    kind: 'form',
    order: 10,
    name: 'L’Orbe Bleu',
    description:
      'Kyogre s’est calmé, mais Arthur, le chef de la Team Aqua, garde le véritable Orbe Bleu : celui qui rendrait à Kyogre sa forme originelle.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: completed('kyogre'),
    steps: [
      step(
        'Le chant des abysses',
        'Réussis une expédition dans la Grotte Sous-Marine avec Kyogre dans l’équipe.',
        expedition('grotte-sous-marine', { speciesIds: [382] }),
        'Au fond de la grotte, Kyogre s’arrête devant une fresque où il apparaît immense, couvert de lignes lumineuses : sa forme originelle. Quelqu’un en a arraché des morceaux.',
      ),
      step(
        'La fresque déchirée',
        'Trouve 3 Parchemins des abysses dans la Grotte Sous-Marine, lors d’expéditions lancées sous la pluie.',
        find('parchemin-des-abysses', 3, 'grotte-sous-marine', 4, { weathers: ['rain'] }),
        'Réunis, les parchemins racontent la légende : seul l’Orbe Bleu entier peut réveiller la puissance originelle de Kyogre. Celui du Mont Mémoria n’en était qu’un éclat ; l’Orbe lui-même, la Team Aqua l’a emporté.',
      ),
      step(
        'Sur la piste d’Arthur',
        'Capture 10 Pokémon Eau sur les Routes 124 à 128.',
        catchOf(10, 'water', 'routes-124-128'),
        'Un pêcheur a vu le sous-marin de la Team Aqua plonger près de la Route 128, avec à son bord un homme barbu qui serrait une sphère bleue.',
      ),
      step(
        'Le repaire englouti',
        'Réussis 2 expéditions dans l’Épave Abandonnée avec 2 Pokémon Électrik de PE 1000 ou plus.',
        expedition(
          'epave-abandonnee',
          { memberType: 'electric', memberCount: 2, minMemberPower: 1000 },
          2,
        ),
        'Dans la cale, des caisses frappées du sigle Aqua et un journal de bord : « Le chef redescend à la Grotte Sous-Marine. Avec l’Orbe, Kyogre lui obéira enfin. »',
      ),
      step(
        'Le chef de la Team Aqua',
        'Arthur t’attend au fond de la Grotte Sous-Marine, l’Orbe Bleu à la main : bats-le (quête).',
        defeated('quete-primo-kyogre-arthur'),
        '« Je voulais rendre la mer à tous les Pokémon… » Arthur te tend l’Orbe Bleu : « Il ne répondra qu’à Kyogre. Fais-le-lui tenir, et tu verras sa vraie forme. »',
      ),
    ],
    rewards: formReward('blue-orb'),
  },
  {
    id: 'primo-groudon',
    kind: 'form',
    order: 11,
    name: 'L’Orbe Rouge',
    description:
      'Max, le chef de la Team Magma, garde le véritable Orbe Rouge. Entre ses mains, il rendrait à Groudon sa puissance originelle… et assécherait Hoenn.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: completed('groudon'),
    steps: [
      step(
        'Le cœur brûlant',
        'Réussis une expédition dans la Grotte Originelle avec Groudon dans l’équipe.',
        expedition('grotte-originelle', { speciesIds: [383] }),
        'Groudon gronde devant une fresque où il apparaît couvert de magma, plus grand encore qu’aujourd’hui. Au pied de la fresque, des traces de bottes rouges.',
      ),
      step(
        'Les roches du volcan',
        'Trouve 3 Roches volcaniques au Mont Chimnée, lors d’expéditions lancées sous un grand soleil.',
        find('roche-volcanique', 3, 'mont-chimnee', 4, { weathers: ['sun'] }),
        'Chaque roche porte le sceau de la Team Magma. Celle que tu avais trouvée ici n’était qu’un éclat de l’Orbe Rouge : Max a gardé l’Orbe entier pour lui.',
      ),
      step(
        'Les sables du désert',
        'Capture 10 Pokémon Sol dans le Désert de la Route 111.',
        catchOf(10, 'ground', 'desert-hoenn'),
        'Des sbires de la Team Magma creusent dans le sable. L’un d’eux laisse échapper : « Le chef a quitté la base du Chemin Ardent. »',
      ),
      step(
        'La base du Chemin Ardent',
        'Réussis 2 expéditions au Chemin Ardent avec 2 Pokémon Eau de PE 1000 ou plus.',
        expedition(
          'chemin-ardent',
          { memberType: 'water', memberCount: 2, minMemberPower: 1000 },
          2,
        ),
        'La base secrète de la Team Magma est vide. Sur la table, une carte : la Grotte Originelle, entourée de rouge.',
      ),
      step(
        'Le chef de la Team Magma',
        'Max veut réveiller Groudon une seconde fois : bats-le à la Grotte Originelle (quête).',
        defeated('quete-primo-groudon-max'),
        '« La terre devait s’étendre pour tous… » Max te tend l’Orbe Rouge : « Il ne brûle que pour Groudon. Fais-le-lui tenir, et la terre se souviendra. »',
      ),
    ],
    rewards: formReward('red-orb'),
  },
  {
    id: 'deoxys-attaque',
    kind: 'form',
    order: 12,
    name: 'La Forme Attaque',
    description:
      'Trois fragments de la météorite de Deoxys sont tombés sur Hoenn. Le premier rougeoie près de la Zone de Combat, au rythme des combats les plus violents.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: completed('deoxys'),
    steps: [
      step(
        'L’onde écarlate',
        'Réussis une expédition à la Zone de Combat avec Deoxys dans l’équipe.',
        expedition('zone-de-combat', { speciesIds: [386] }),
        'Deoxys se raidit, ses bras se changent en lames. Quelque part dans la Zone de Combat, un fragment de sa météorite lui répond d’une lueur rouge.',
      ),
      step(
        'Les éclats écarlates',
        'Trouve 3 Éclats écarlates à la Zone de Combat, avec 2 Pokémon Combat dans l’équipe.',
        find('eclat-ecarlate', 3, 'zone-de-combat', 4, { memberType: 'fighting', memberCount: 2 }),
        'Les éclats s’attirent comme des aimants et pointent tous vers la même arène : celle d’un dresseur qui ne perd jamais.',
      ),
      step(
        'Les adversaires',
        'Capture 8 Pokémon à la Zone de Combat.',
        catchOf(8, null, 'zone-de-combat'),
        'Les habitués de la Zone de Combat parlent d’Ardent : il porte au cou une pierre rouge, qui brille plus fort à chaque victoire.',
      ),
      step(
        'Force brute',
        'Réussis 3 expéditions à la Zone de Combat avec 3 Pokémon de PE 1100 ou plus.',
        expedition('zone-de-combat', { memberCount: 3, minMemberPower: 1100 }, 3),
        'Ton nom circule dans la Zone de Combat. Ardent te fait savoir qu’il t’attend : « Le fragment ira au plus fort. »',
      ),
      step(
        'L’As de la Zone de Combat',
        'Ardent ne cédera le fragment rouge qu’au dresseur qui le battra : bats-le (quête).',
        defeated('quete-deoxys-attaque-ardent'),
        'Ardent essuie la sueur de son front et te tend la météorite : « Elle hurlait à chaque combat. Elle sera mieux avec celui qui l’a fait tomber. »',
      ),
    ],
    rewards: formReward('meteorite-attaque'),
  },
  {
    id: 'deoxys-defense',
    kind: 'form',
    order: 13,
    name: 'La Forme Défense',
    description:
      'Le deuxième fragment de la météorite de Deoxys s’est enfoncé dans la Route Victoire. Tout ce qui l’entoure durcit comme de la pierre.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: completed('deoxys'),
    steps: [
      step(
        'L’onde de pierre',
        'Réussis une expédition sur la Route Victoire avec Deoxys dans l’équipe.',
        expedition('route-victoire-hoenn', { speciesIds: [386] }),
        'Deoxys se replie sur lui-même, son corps se couvre d’une carapace. Sous tes pieds, la roche lui répond.',
      ),
      step(
        'Les éclats de jade',
        'Trouve 3 Éclats de jade sur la Route Victoire, lors d’expéditions lancées sous une tempête de sable.',
        find('eclat-de-jade', 3, 'route-victoire-hoenn', 4, { weathers: ['sand'] }),
        'Les éclats sont si durs qu’aucun Pokémon de la grotte n’arrive à les entamer. Une géologue en a fait sa spécialité.',
      ),
      step(
        'Les gardiens d’acier',
        'Capture 8 Pokémon Acier sur la Route Victoire.',
        catchOf(8, 'steel', 'route-victoire-hoenn'),
        'Les Pokémon Acier de la grotte se sont rassemblés autour d’un campement : celui de Galène, qui creuse là depuis des semaines.',
      ),
      step(
        'Briser la carapace',
        'Réussis 2 expéditions sur la Route Victoire avec 2 Pokémon Combat de PE 1000 ou plus.',
        expedition(
          'route-victoire-hoenn',
          { memberType: 'fighting', memberCount: 2, minMemberPower: 1000 },
          2,
        ),
        'Au fond de la galerie, Galène a enfin extrait le fragment. Elle refuse de le lâcher : « Il faudra me le prendre. »',
      ),
      step(
        'La géologue',
        'Galène garde le fragment au fond de la Route Victoire : bats-la (quête).',
        defeated('quete-deoxys-defense-galene'),
        '« Je n’ai jamais vu de roche aussi dure… » Galène te confie la météorite : « Elle ne se laisse entamer par rien. Deoxys saura quoi en faire. »',
      ),
    ],
    rewards: formReward('meteorite-defense'),
  },
  {
    id: 'deoxys-vitesse',
    kind: 'form',
    order: 14,
    name: 'La Forme Vitesse',
    description:
      'Le dernier fragment de la météorite de Deoxys file avec les vents, au-dessus des Routes 119 et 120, et ne se pose jamais.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: completed('deoxys'),
    steps: [
      step(
        'L’onde du vent',
        'Réussis une expédition au Pilier Céleste avec Deoxys dans l’équipe.',
        expedition('pilier-celeste', { speciesIds: [386] }),
        'Au sommet du pilier, Deoxys s’affine et s’élance vers le ciel avant de revenir : le dernier fragment file avec les vents, au-dessus des Routes 119 et 120.',
      ),
      step(
        'Les éclats dorés',
        'Trouve 3 Éclats dorés sur les Routes 119 et 120, lors d’expéditions lancées sous la pluie.',
        find('eclat-dore', 3, 'routes-119-120', 4, { weathers: ['rain'] }),
        'Les éclats ne tiennent pas en place : à peine posés, ils filent vers le Pilier Céleste.',
      ),
      step(
        'Les feuilles dans le vent',
        'Capture 10 Pokémon Plante sur les Routes 119 et 120.',
        catchOf(10, 'grass', 'routes-119-120'),
        'Les feuilles des Pokémon Plante pointent toutes dans le même sens, poussées par le passage du fragment. Un ornithologue, Rafale, le suit à la jumelle : ses Pokémon sont les seuls assez rapides pour le rattraper.',
      ),
      step(
        'Course contre le vent',
        'Réussis 3 expéditions sur les Routes 119 et 120 avec 2 Pokémon Vol de PE 1000 ou plus.',
        expedition(
          'routes-119-120',
          { memberType: 'flying', memberCount: 2, minMemberPower: 1000 },
          3,
        ),
        'Rafale a rattrapé le fragment au sommet du Pilier Céleste. Il te lance : « Tu le veux ? Montre-moi que tu es plus rapide que moi ! »',
      ),
      step(
        'L’ornithologue',
        'Rafale t’attend au sommet du Pilier Céleste, le fragment à la main : bats-le (quête).',
        defeated('quete-deoxys-vitesse-rafale'),
        'Rafale reprend son souffle et te tend la météorite : « Elle filait plus vite que tous mes Pokémon. Seul Deoxys peut la suivre. »',
      ),
    ],
    rewards: formReward('meteorite-vitesse'),
  },
];
