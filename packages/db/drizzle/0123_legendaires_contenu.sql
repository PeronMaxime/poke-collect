-- Rework des légendaires : quêtes narratives (objets de quête, conditions de départ, textes de
-- dénouement) et combats légendaires depuis l'onglet Quêtes, à la place des expéditions
-- légendaires. Toutes les versions de contenu.

-- Réglages des combats légendaires (ajoutés seulement s'ils manquent).
UPDATE "balance_settings" SET "data" = jsonb_set("data", '{legendary}', '{"retryCooldownMinutes":60,"xpMultiplier":1,"roamerCaptureMultiplier":3}'::jsonb)
WHERE NOT "data" ? 'legendary';
--> statement-breakpoint
-- Objets de quête : obtenus seulement pendant l'étape qui les demande, invendables.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT v."id", i."id", i."name", i."description", i."icon", 'quest', 'rare', NULL, '[]'::jsonb
FROM "content_versions" v
CROSS JOIN (VALUES
  ('fragment-magnetique', 'Fragment magnétique', 'Éclat de métal aimanté arraché aux machines de la Centrale. Il pointe toujours vers le ciel.', '/api/sprites/items/magnet.png'),
  ('plume-foudre', 'Plume Foudre', 'Plume jaune qui grésille au moindre contact. Elle sent l’orage.', '/api/sprites/items/health-wing.png'),
  ('eclat-de-givre', 'Éclat de givre', 'Cristal de glace tombé des ailes d’Artikodin. Il ne fond jamais.', '/api/sprites/items/never-melt-ice.png'),
  ('cendre-ardente', 'Cendre ardente', 'Plume consumée par les flammes de Sulfura, encore brûlante des heures après sa chute.', '/api/sprites/items/heat-rock.png'),
  ('page-du-journal', 'Page du journal', 'Page arrachée au journal d’un scientifique du Manoir Pokémon.', '/api/sprites/items/journal.png'),
  ('echantillon-adn', 'Échantillon d’ADN', 'Trace génétique laissée par Mewtwo au fond de la Grotte Azurée.', '/api/sprites/items/dna-splicers.png'),
  ('vieille-carte-marine', 'Vieille carte marine', 'Carte jaunie qui indique une île absente de toutes les cartes modernes.', '/api/sprites/items/old-sea-map.png'),
  ('poil-soyeux', 'Poil soyeux', 'Poil rose d’une douceur incroyable, retrouvé dans les hautes herbes de l’Île Lointaine.', '/api/sprites/items/fluffy-tail.png'),
  ('plume-psychique', 'Plume psychique', 'Plume violette qui plonge celui qui la regarde dans une légère torpeur.', '/api/sprites/items/clever-wing.png'),
  ('plume-martiale', 'Plume martiale', 'Plume rouge et dure comme l’acier, perdue lors d’une course effrénée.', '/api/sprites/items/muscle-wing.png'),
  ('plume-sombre', 'Plume sombre', 'Plume aux reflets noirs, chargée de rancœur.', '/api/sprites/items/resist-wing.png'),
  ('eclat-de-tonnerre', 'Éclat de tonnerre', 'Cristal tombé là où la foudre a frappé. On y entend gronder Raikou.', '/api/sprites/items/electric-gem.png'),
  ('braise-eternelle', 'Braise éternelle', 'Braise qui ne s’éteint jamais, née du rugissement d’Entei.', '/api/sprites/items/fire-gem.png'),
  ('eau-purifiee', 'Eau purifiée', 'Eau d’une pureté parfaite, puisée là où Suicune a couru.', '/api/sprites/items/mystic-water.png'),
  ('clochette-oceane', 'Clochette Océane', 'Cloche ancienne qui tinte au rythme des vagues. Elle apaise les courants des Tourb’Îles.', '/api/sprites/items/tidal-bell.png'),
  ('argentaile', 'Argentaile', 'Plume argentée qui brille comme la lune. Elle appartient au gardien des mers.', '/api/sprites/items/silver-wing.png'),
  ('arcenciaile', 'Arcenci’aile', 'Plume aux sept couleurs, tombée des ailes de l’oiseau sacré.', '/api/sprites/items/rainbow-wing.png'),
  ('statuette-de-l-autel', 'Statuette de l’autel', 'Statuette d’un petit Pokémon ailé. Au revers : « Rends-moi à l’autel. »', '/api/sprites/items/relic-statue.png'),
  ('rosee-du-voile-rouge', 'Rosée du voile rouge', 'Goutte de rosée qui reflète la lumière en rouge, laissée par Latias.', '/api/sprites/items/soul-dew.png'),
  ('ticket-eon', 'Ticket Éon', 'Ticket mystérieux qui porte le dessin d’un Pokémon bleu aux ailes de jet.', '/api/sprites/items/eon-ticket.png'),
  ('tablette-de-roche', 'Tablette de roche', 'Tablette couverte d’inscriptions en relief, sortie des sables du désert.', '/api/sprites/items/hard-stone.png'),
  ('tablette-d-acier', 'Tablette d’acier', 'Tablette métallique qui bourdonne doucement, comme si elle était vivante.', '/api/sprites/items/metal-coat.png'),
  ('tablette-de-glace', 'Tablette de glace', 'Tablette de glace éternelle, gravée de points en relief.', '/api/sprites/items/icy-rock.png'),
  ('orbe-bleu', 'Orbe Bleu', 'Orbe qui renferme le pouvoir des océans. Il pulse quand la pluie tombe.', '/api/sprites/items/blue-orb.png'),
  ('orbe-rouge', 'Orbe Rouge', 'Orbe qui renferme le pouvoir des continents. Il brûle quand le soleil tape.', '/api/sprites/items/red-orb.png'),
  ('orbe-de-jade', 'Orbe de Jade', 'Orbe qui vibre au rythme du vent, lié au gardien du ciel.', '/api/sprites/items/jade-orb.png'),
  ('poussiere-d-etoile', 'Poussière d’étoile', 'Poussière scintillante tombée du ciel les nuits où passe la comète.', '/api/sprites/items/stardust.png'),
  ('fragment-de-meteorite', 'Fragment de météorite', 'Fragment encore tiède, qui pulse d’une énergie venue de l’espace.', '/api/sprites/items/meteorite.png'),
  ('cristal-aurore', 'Cristal aurore', 'Cristal qui s’illumine en présence d’ondes psychiques venues de l’espace.', '/api/sprites/items/psychic-gem.png')
) AS i("id", "name", "description", "icon")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Quêtes réécrites : nom, description et étapes ; chaque légendaire (hors fuyards) se combat
-- (config « battle ») au lieu de l'expédition légendaire. Ordre, région, déblocage, récompenses
-- et niveaux sont gardés.
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’oiseau de foudre',
  "description" = 'Depuis quelques nuits, Céladopole est plongée dans le noir. Quelque chose aspire l’électricité de tout Kanto.',
  "steps" = '[{"name":"Coupures de courant","description":"Réussis une expédition sur les Routes 9 et 10 avec un Pikachu dans l’équipe.","condition":{"type":"expedition","zoneId":"routes-9-10","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[25],"weathers":[],"timeOfDay":null},"outcome":"Les joues de ton Pikachu crépitent dès que vous longez la rivière. Un pêcheur t’indique un bâtiment oublié en amont : la Centrale. Ses portes rouillées viennent de s’ouvrir."},{"name":"Courants vagabonds","description":"Trouve 3 Fragments magnétiques à la Centrale, avec 2 Pokémon Électrik dans l’équipe.","condition":{"type":"questItem","itemId":"fragment-magnetique","count":3,"zoneId":"centrale","chance":4,"memberType":"electric","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Posés côte à côte, les fragments s’orientent tous vers le toit de la Centrale, comme attirés par un orage qui ne finit jamais."},{"name":"Le conseil du Major","description":"Montre les fragments à Major Bob : bats-le à Carmin sur Mer.","condition":{"type":"trainerDefeated","trainerId":"major-bob"},"outcome":"« Ça, c’est la marque d’Électhor, petit ! Quand il recharge ses ailes, il lui faut de l’orage. Attends la pluie, et tu le trouveras. »"},{"name":"Plume d’orage","description":"Trouve une Plume Foudre à la Centrale, lors d’une expédition lancée sous la pluie.","condition":{"type":"questItem","itemId":"plume-foudre","count":1,"zoneId":"centrale","chance":6,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"La plume grésille entre tes doigts. Un cri strident déchire le ciel au-dessus de la Centrale : Électhor est là, et il n’aime pas les visiteurs."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":4,"statMultiplier":1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":35}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'electhor';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’oiseau des glaces',
  "description" = 'Les pêcheurs de Cramois’Île jurent avoir vu la mer geler en plein été autour des Îles Écume.',
  "steps" = '[{"name":"Traversée glacée","description":"Réussis une expédition sur les Routes maritimes avec 2 Pokémon Eau de PE 600 ou plus.","condition":{"type":"expedition","zoneId":"routes-maritimes","count":1,"memberType":"water","memberCount":2,"minMemberPower":600,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Au large de Parmanie, l’eau se couvre de givre. Tes Pokémon Eau ouvrent un passage jusqu’aux Îles Écume, perdues dans la brume."},{"name":"Givre éternel","description":"Trouve 3 Éclats de givre aux Îles Écume, lors d’expéditions lancées de nuit.","condition":{"type":"questItem","itemId":"eclat-de-givre","count":3,"zoneId":"iles-ecume","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"Les éclats ne fondent pas, même au soleil. Un vieux pêcheur murmure qu’ils tombent des ailes d’un oiseau qui ne se montre que par grand froid."},{"name":"Le chant de Lokhlass","description":"Capture un Lokhlass aux Îles Écume.","condition":{"type":"catchPokemon","count":1,"pokemonType":null,"speciesId":131,"zoneId":"iles-ecume"},"outcome":"Ton Lokhlass entonne un chant mélancolique. Au loin, au cœur du blizzard, quelque chose lui répond."},{"name":"Dans la tempête","description":"Réussis une expédition aux Îles Écume sous la grêle, avec Lokhlass et 2 Pokémon Glace dans l’équipe.","condition":{"type":"expedition","zoneId":"iles-ecume","count":1,"memberType":"ice","memberCount":2,"minMemberPower":0,"speciesIds":[131],"weathers":["hail"],"timeOfDay":null},"outcome":"Guidé par le chant de Lokhlass, tu atteins le cœur de la tempête. Artikodin déploie ses ailes de cristal et pousse un cri glacial : il te défie."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":4.5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":35}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'artikodin';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’oiseau de feu',
  "description" = 'Le Mont Braise gronde à nouveau. La nuit, une lueur vole au-dessus du cratère.',
  "steps" = '[{"name":"Lueur dans la nuit","description":"Réussis une expédition au Manoir Pokémon, lancée de nuit, avec 2 Pokémon Feu dans l’équipe.","condition":{"type":"expedition","zoneId":"manoir-pokemon","count":1,"memberType":"fire","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"Depuis les ruines du Manoir, tu vois une traînée de flammes filer vers le volcan voisin. Le chemin du Mont Braise s’ouvre devant toi."},{"name":"Coulées de lave","description":"Capture 5 Pokémon Feu au Mont Braise.","condition":{"type":"catchPokemon","count":5,"pokemonType":"fire","speciesId":null,"zoneId":"mont-braise"},"outcome":"Les Pokémon du volcan sont agités, presque froids : quelque chose, au sommet, leur vole leur chaleur."},{"name":"Cendres ardentes","description":"Trouve 3 Cendres ardentes au Mont Braise, lors d’expéditions lancées sous un grand soleil.","condition":{"type":"questItem","itemId":"cendre-ardente","count":3,"zoneId":"mont-braise","chance":5,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["sun"],"timeOfDay":null},"outcome":"Les cendres brûlent encore des heures plus tard. Ce sont des plumes consumées : Sulfura est en train de muer au sommet."},{"name":"Le sommet du volcan","description":"Réussis une expédition au Mont Braise avec 3 Pokémon Feu de PE 700 ou plus.","condition":{"type":"expedition","zoneId":"mont-braise","count":1,"memberType":"fire","memberCount":3,"minMemberPower":700,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Au bord du cratère, une colonne de flammes s’élève et prend la forme d’un oiseau immense. Sulfura t’a repéré."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":35}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'sulfura';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le Pokémon génétique',
  "description" = 'Dans les décombres du Manoir Pokémon, un journal raconte la création d’une créature aux pouvoirs terrifiants, qui se serait enfuie.',
  "steps" = '[{"name":"Le journal du Manoir","description":"Trouve 2 Pages du journal au Manoir Pokémon, avec un Pokémon Psy dans l’équipe.","condition":{"type":"questItem","itemId":"page-du-journal","count":2,"zoneId":"manoir-pokemon","chance":4,"memberType":"psychic","memberCount":1,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"« 5 février. Mew a donné naissance à un petit. Nous l’avons appelé Mewtwo. » Plus loin : « Il est bien trop puissant. Nous ne pouvons plus le contrôler… » La suite est arrachée."},{"name":"La confiance des légendes","description":"Termine les quêtes d’Artikodin, d’Électhor et de Sulfura, et capture 80 % du Pokédex de Kanto.","condition":{"type":"allOf","conditions":[{"type":"questCompleted","questId":"artikodin"},{"type":"questCompleted","questId":"electhor"},{"type":"questCompleted","questId":"sulfura"},{"type":"regionDexPercent","regionId":"kanto","percent":80}]},"outcome":"Le Prof. Chen lit les pages, l’air grave : « Seul un dresseur respecté des trois oiseaux pourrait approcher une telle créature. » Le garde de la Grotte Azurée s’écarte sur ton passage."},{"name":"Ondes hostiles","description":"Réussis une expédition dans la Grotte Azurée avec 2 Pokémon Spectre de PE 800 ou plus.","condition":{"type":"expedition","zoneId":"grotte-azuree","count":1,"memberType":"ghost","memberCount":2,"minMemberPower":800,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Les parois de la grotte vibrent. Une pression mentale écrasante te fait vaciller ; seuls tes Pokémon Spectre semblent y résister."},{"name":"Le reflet","description":"Trouve un Échantillon d’ADN dans la Grotte Azurée, avec un Métamorph dans l’équipe.","condition":{"type":"questItem","itemId":"echantillon-adn","count":1,"zoneId":"grotte-azuree","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[132],"weathers":[],"timeOfDay":null},"outcome":"Ton Métamorph se fige, puis prend une forme qu’il n’avait jamais prise : une silhouette mauve à la longue queue. Une voix résonne dans ta tête : « Pourquoi me cherches-tu ? » Mewtwo se dresse devant toi."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":68,"iv":31,"hpMultiplier":4,"statMultiplier":1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":25}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'mewtwo';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le Pokémon fabuleux',
  "description" = 'Mewtwo n’est qu’une copie. Le journal du Manoir parle d’une île des tropiques où l’original aurait été trouvé.',
  "steps" = '[{"name":"La page blanche","description":"Fais éclore 500 œufs et capture 95 % du Pokédex de Kanto.","condition":{"type":"allOf","conditions":[{"type":"eggsHatched","count":500},{"type":"regionDexPercent","regionId":"kanto","percent":95}]},"outcome":"Le Prof. Chen feuillette ton Pokédex : il n’y manque presque rien… sauf une page, celle d’un Pokémon qu’aucun dresseur n’a jamais enregistré."},{"name":"La carte du vieux marin","description":"Trouve la Vieille carte marine sur les Routes maritimes, avec 2 Pokémon Eau dans l’équipe.","condition":{"type":"questItem","itemId":"vieille-carte-marine","count":1,"zoneId":"routes-maritimes","chance":3,"memberType":"water","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"La carte indique une île au sud de Kanto, absente de toutes les cartes modernes : l’Île Lointaine. Tu embarques aussitôt."},{"name":"Les hautes herbes","description":"Réussis 3 expéditions sur l’Île Lointaine, lancées de jour.","condition":{"type":"expedition","zoneId":"ile-lointaine","count":3,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":"day"},"outcome":"Une bulle rose flotte au-dessus des herbes et disparaît en riant. Quelque chose joue à cache-cache avec toi."},{"name":"Jeu de miroirs","description":"Trouve 3 Poils soyeux sur l’Île Lointaine, avec un Métamorph dans l’équipe.","condition":{"type":"questItem","itemId":"poil-soyeux","count":3,"zoneId":"ile-lointaine","chance":3,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[132],"weathers":[],"timeOfDay":null},"outcome":"Ton Métamorph s’amuse à imiter la bulle rose… qui s’arrête, intriguée. Mew se dévoile, ravi d’avoir trouvé un compagnon de jeu — à sa façon."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'mew';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’oiseau au regard glacial',
  "description" = 'Des dresseurs de Kanto tombent dans une étrange torpeur. Tous disent avoir croisé un oiseau aux ailes violettes.',
  "steps" = '[{"name":"Ondes étranges","description":"Capture 15 Pokémon Psy à Kanto.","condition":{"type":"catchPokemon","count":15,"pokemonType":"psychic","speciesId":null,"zoneId":null},"outcome":"Tes Pokémon Psy captent des ondes qui ne ressemblent à rien de connu à Kanto."},{"name":"Plumes violettes","description":"Trouve 2 Plumes psychiques sur la Route Victoire, avec 2 Pokémon Psy dans l’équipe.","condition":{"type":"questItem","itemId":"plume-psychique","count":2,"zoneId":"route-victoire","chance":4,"memberType":"psychic","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Les plumes émettent un faible halo violet. Leur propriétaire n’est pas loin, mais il ne tient jamais en place."},{"name":"Sur sa piste","description":"Réussis une expédition sur la Route Victoire, lancée de nuit, avec 2 Pokémon Psy de PE 800 ou plus.","condition":{"type":"expedition","zoneId":"route-victoire","count":1,"memberType":"psychic","memberCount":2,"minMemberPower":800,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"Il était là, au bout du tunnel. Il t’a fixé de ses yeux rougeoyants, puis s’est envolé. Il rôde désormais au loin : à toi de le traquer."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'artikodin-galar';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’oiseau aux pas de feu',
  "description" = 'Des traces de pas fumantes parcourent les routes de Kanto, comme si quelqu’un courait plus vite que l’éclair.',
  "steps" = '[{"name":"Coups de pied","description":"Capture 15 Pokémon Combat à Kanto.","condition":{"type":"catchPokemon","count":15,"pokemonType":"fighting","speciesId":null,"zoneId":null},"outcome":"Au Dojo Karaté, on ne parle que de ça : un oiseau aurait battu tous les élèves à la course."},{"name":"Plumes martiales","description":"Trouve 2 Plumes martiales au Dojo Karaté, avec 2 Pokémon Combat dans l’équipe.","condition":{"type":"questItem","itemId":"plume-martiale","count":2,"zoneId":"dojo-karate","chance":4,"memberType":"fighting","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Les plumes sont dures comme l’acier. Le maître du dojo te conseille de lancer son meilleur coureur à sa poursuite."},{"name":"La course","description":"Réussis une expédition au Dojo Karaté avec Kicklee dans l’équipe.","condition":{"type":"expedition","zoneId":"dojo-karate","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[106],"weathers":[],"timeOfDay":null},"outcome":"Kicklee s’élance à sa poursuite sans parvenir à le rattraper. L’oiseau file désormais à travers les terres lointaines."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'electhor-galar';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’oiseau aux flammes sombres',
  "description" = 'À Lavanville, les Pokémon Spectre s’agitent : une flamme noire tourne autour de la Tour Pokémon.',
  "steps" = '[{"name":"Rancœur","description":"Capture 12 Pokémon Spectre à Kanto.","condition":{"type":"catchPokemon","count":12,"pokemonType":"ghost","speciesId":null,"zoneId":null},"outcome":"Plus tu captures de Pokémon Spectre, plus la flamme noire semble s’intéresser à toi."},{"name":"Plumes sombres","description":"Trouve 2 Plumes sombres à la Tour Pokémon, lors d’expéditions lancées de nuit.","condition":{"type":"questItem","itemId":"plume-sombre","count":2,"zoneId":"tour-pokemon","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"Les plumes sont glacées et pleines de rancœur. Elles tombent toujours au même endroit : le sommet de la tour."},{"name":"La flamme noire","description":"Réussis une expédition à la Tour Pokémon, lancée de nuit sous la pluie, avec 2 Pokémon Spectre de PE 800 ou plus.","condition":{"type":"expedition","zoneId":"tour-pokemon","count":1,"memberType":"ghost","memberCount":2,"minMemberPower":800,"speciesIds":[],"weathers":["rain"],"timeOfDay":"night"},"outcome":"La flamme noire se dresse face à toi, puis s’enfuit dans la nuit. Elle hante désormais des terres lointaines."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'sulfura-galar';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'La bête du tonnerre',
  "description" = 'Selon la légende d’Écorcia, trois Pokémon périrent dans l’incendie de la Tour Cendrée, et Ho-Oh les ramena à la vie.',
  "steps" = '[{"name":"Orage d’été","description":"Capture 10 Pokémon Électrik à Johto.","condition":{"type":"catchPokemon","count":10,"pokemonType":"electric","speciesId":null,"zoneId":null},"outcome":"Les Pokémon Électrik de Johto sont nerveux, comme avant un gros orage. Pourtant, le ciel est clair."},{"name":"Là où frappe la foudre","description":"Trouve 2 Éclats de tonnerre sur les Routes 42 à 44, lors d’expéditions lancées sous la pluie.","condition":{"type":"questItem","itemId":"eclat-de-tonnerre","count":2,"zoneId":"routes-42-44","chance":6,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"À chaque coup de tonnerre, un rugissement répond au loin. La bête ne s’arrête jamais de courir."},{"name":"Le sous-sol de la tour","description":"Réussis une expédition à la Tour Cendrée avec 2 Pokémon Électrik de PE 700 ou plus.","condition":{"type":"expedition","zoneId":"tour-cendree","count":1,"memberType":"electric","memberCount":2,"minMemberPower":700,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Dans les ruines de la Tour Cendrée, Raikou se dresse un instant devant toi… puis file comme l’éclair. Il parcourt désormais Johto."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'raikou';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'La bête du volcan',
  "description" = 'Chaque fois qu’Entei rugit, dit-on, un volcan entre en éruption quelque part dans le monde.',
  "steps" = '[{"name":"Braises","description":"Capture 10 Pokémon Feu à Johto.","condition":{"type":"catchPokemon","count":10,"pokemonType":"fire","speciesId":null,"zoneId":null},"outcome":"Des feux de broussaille éclatent ici et là, sans raison. Les anciens d’Écorcia parlent de la bête du volcan."},{"name":"Le rugissement","description":"Trouve 2 Braises éternelles à la Tour Cendrée, lors d’expéditions lancées sous un grand soleil.","condition":{"type":"questItem","itemId":"braise-eternelle","count":2,"zoneId":"tour-cendree","chance":6,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["sun"],"timeOfDay":null},"outcome":"Les braises brûlent sans jamais s’éteindre. La terre tremble sous la Tour Cendrée."},{"name":"Le brasier","description":"Réussis une expédition au Mont Creuset avec 2 Pokémon Feu de PE 700 ou plus.","condition":{"type":"expedition","zoneId":"mont-creuset","count":1,"memberType":"fire","memberCount":2,"minMemberPower":700,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Au cœur du Mont Creuset, Entei surgit des flammes, rugit, et disparaît dans un nuage de cendres. Il parcourt désormais Johto."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'entei';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'La bête des aurores',
  "description" = 'Suicune court sur l’eau et purifie tout ce qu’il touche. On l’a aperçu près du Lac Colère.',
  "steps" = '[{"name":"Eaux troubles","description":"Capture 10 Pokémon Eau à Johto.","condition":{"type":"catchPokemon","count":10,"pokemonType":"water","speciesId":null,"zoneId":null},"outcome":"Les rivières de Johto sont troubles depuis des semaines. Seul le Lac Colère reste d’une pureté étonnante."},{"name":"Eau purifiée","description":"Trouve 2 Eaux purifiées au Lac Colère, lors d’expéditions lancées sous la pluie.","condition":{"type":"questItem","itemId":"eau-purifiee","count":2,"zoneId":"lac-colere","chance":6,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"Sous la pluie, l’eau du lac devient limpide comme du cristal. Des traces de pattes courent à sa surface."},{"name":"Sur le lac","description":"Réussis une expédition au Lac Colère, lancée de nuit, avec 2 Pokémon Eau de PE 700 ou plus.","condition":{"type":"expedition","zoneId":"lac-colere","count":1,"memberType":"water","memberCount":2,"minMemberPower":700,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"Sous la lune, Suicune court sur le lac, s’arrête… et te regarde. Puis le vent du nord l’emporte. Il parcourt désormais Johto."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'suicune';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le gardien des mers',
  "description" = 'Les tourbillons des Tourb’Îles cacheraient un Pokémon aux ailes d’argent, qui dort au fond de la mer.',
  "steps" = '[{"name":"Les trois bêtes","description":"Termine les quêtes de Raikou, Entei et Suicune.","condition":{"type":"allOf","conditions":[{"type":"questCompleted","questId":"raikou"},{"type":"questCompleted","questId":"entei"},{"type":"questCompleted","questId":"suicune"}]},"outcome":"Les trois bêtes ont croisé ta route. Un vieil homme d’Oliville t’arrête : « Toi, tu as vu les bêtes de Ho-Oh. Alors écoute : le gardien des mers dort aux Tourb’Îles, mais les courants en interdisent l’accès. »"},{"name":"La lumière du phare","description":"Trouve la Clochette Océane au Phare d’Oliville, avec Pharamp dans l’équipe.","condition":{"type":"questItem","itemId":"clochette-oceane","count":1,"zoneId":"phare-oliville","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[181],"weathers":[],"timeOfDay":null},"outcome":"Pharamp rallume la lanterne ; sur son rebord, une cloche ancienne tinte au rythme des vagues. Au loin, les courants des Tourb’Îles s’apaisent : le passage est ouvert."},{"name":"Une plume argentée","description":"Trouve l’Argentaile aux Tourb’Îles, lors d’une expédition lancée sous la pluie.","condition":{"type":"questItem","itemId":"argentaile","count":1,"zoneId":"tourb-iles","chance":5,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"La plume brille comme la lune, même au fond des grottes. La Clochette Océane se met à tinter toute seule."},{"name":"Les profondeurs","description":"Réussis une expédition aux Tourb’Îles, lancée de nuit, avec 3 Pokémon de PE 900 ou plus.","condition":{"type":"expedition","zoneId":"tourb-iles","count":1,"memberType":null,"memberCount":3,"minMemberPower":900,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"La cloche résonne dans toute la grotte. Les eaux s’ouvrent : Lugia s’éveille, et sa colère soulève la mer."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":25}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'lugia';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’oiseau arc-en-ciel',
  "description" = 'Il y a cent cinquante ans, la foudre frappa la Tour Cendrée et Ho-Oh quitta Johto. Il ne reviendra que pour un dresseur au cœur pur.',
  "steps" = '[{"name":"Les trois bêtes","description":"Termine les quêtes de Raikou, Entei et Suicune.","condition":{"type":"allOf","conditions":[{"type":"questCompleted","questId":"raikou"},{"type":"questCompleted","questId":"entei"},{"type":"questCompleted","questId":"suicune"}]},"outcome":"Les bêtes ressuscitées par Ho-Oh t’ont jugé digne. Les sages d’Écorcia acceptent de te recevoir."},{"name":"Les cendres de la tour","description":"Réussis une expédition à la Tour Cendrée avec 2 Pokémon Feu de PE 700 ou plus.","condition":{"type":"expedition","zoneId":"tour-cendree","count":1,"memberType":"fire","memberCount":2,"minMemberPower":700,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Dans les cendres, tu retrouves les cloches brisées de l’ancienne tour. Les sages t’ouvrent alors les portes de la Tour Carillon, où Ho-Oh se posait jadis."},{"name":"Une plume aux sept couleurs","description":"Trouve l’Arcenci’aile à la Tour Carillon, lors d’une expédition lancée sous un grand soleil.","condition":{"type":"questItem","itemId":"arcenciaile","count":1,"zoneId":"tour-carillon","chance":5,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["sun"],"timeOfDay":null},"outcome":"Sous le soleil, la plume s’illumine de sept couleurs. Au sommet de la tour, quelque chose répond à sa lumière."},{"name":"Le sommet de la tour","description":"Réussis une expédition à la Tour Carillon, lancée de jour, avec 3 Pokémon de PE 900 ou plus.","condition":{"type":"expedition","zoneId":"tour-carillon","count":1,"memberType":null,"memberCount":3,"minMemberPower":900,"speciesIds":[],"weathers":[],"timeOfDay":"day"},"outcome":"Un arc-en-ciel se dessine au-dessus de la tour. Ho-Oh se pose sur le toit et t’observe : il veut savoir si ton cœur est aussi pur qu’on le dit."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":25}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'ho-oh';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le voyageur du temps',
  "description" = 'Lugia et Ho-Oh apaisés, le vieux charbonnier du Bois aux Chênes parle d’un petit Pokémon qui protège la forêt… et voyage dans le temps.',
  "steps" = '[{"name":"Presque complet","description":"Capture 95 % du Pokédex de Johto.","condition":{"type":"regionDexPercent","regionId":"johto","percent":95},"outcome":"Le charbonnier hoche la tête : « Tu connais la forêt et ses Pokémon. Alors peut-être qu’il acceptera de se montrer. »"},{"name":"La statuette","description":"Trouve la Statuette de l’autel au Bois aux Chênes, lors d’une expédition lancée de nuit avec 2 Pokémon Plante.","condition":{"type":"questItem","itemId":"statuette-de-l-autel","count":1,"zoneId":"bois-aux-chenes","chance":3,"memberType":"grass","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"La statuette représente un petit Pokémon ailé. Au revers, une inscription : « Rends-moi à l’autel. » Un sentier que tu n’avais jamais vu s’ouvre entre les arbres."},{"name":"La forêt s’éveille","description":"Capture 5 Pokémon Plante à l’Autel du Bois aux Chênes.","condition":{"type":"catchPokemon","count":5,"pokemonType":"grass","speciesId":null,"zoneId":"autel-bois-aux-chenes"},"outcome":"La forêt reprend vie autour de l’autel. Des feuilles tournoient sans le moindre vent."},{"name":"L’autel","description":"Réussis une expédition à l’Autel du Bois aux Chênes, lancée sous la pluie, avec 3 Pokémon de PE 900 ou plus.","condition":{"type":"expedition","zoneId":"autel-bois-aux-chenes","count":1,"memberType":null,"memberCount":3,"minMemberPower":900,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"Sous la pluie, l’autel s’illumine. Une petite silhouette verte apparaît, venue d’une autre époque — et elle n’a pas l’air de vouloir repartir sans t’avoir mis à l’épreuve."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'celebi';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’éon au voile rouge',
  "description" = 'Des voyageurs parlent d’un Pokémon rouge qui se rend invisible en reflétant la lumière, au-dessus de la mer de Hoenn.',
  "steps" = '[{"name":"Ondes psychiques","description":"Capture 10 Pokémon Psy à Hoenn.","condition":{"type":"catchPokemon","count":10,"pokemonType":"psychic","speciesId":null,"zoneId":null},"outcome":"Tes Pokémon Psy perçoivent une présence douce et joueuse, qui t’observe sans se montrer."},{"name":"Un reflet rouge","description":"Trouve 2 Rosées du voile rouge sur les Routes 105 à 108, lors d’expéditions lancées de jour.","condition":{"type":"questItem","itemId":"rosee-du-voile-rouge","count":2,"zoneId":"routes-105-108","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":"day"},"outcome":"Chaque goutte reflète un éclat rouge. Quelque chose plane au-dessus des vagues, invisible, et semble s’amuser de te voir chercher."},{"name":"Au-dessus des vagues","description":"Réussis une expédition sur les Routes 124 à 128 avec Lovdisc dans l’équipe.","condition":{"type":"expedition","zoneId":"routes-124-128","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[370],"weathers":[],"timeOfDay":null},"outcome":"Lovdisc saute hors de l’eau, et un reflet rouge s’arrête net pour le regarder. Latias se dévoile… puis repart d’un battement d’ailes. Elle parcourt désormais Hoenn."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'latias';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’éon au voile bleu',
  "description" = 'Un Pokémon bleu fend le ciel de Hoenn plus vite qu’un avion de ligne. Il ne se montre qu’aux cœurs sincères.',
  "steps" = '[{"name":"Courants marins","description":"Capture 10 Pokémon Eau à Hoenn.","condition":{"type":"catchPokemon","count":10,"pokemonType":"water","speciesId":null,"zoneId":null},"outcome":"Un capitaine de Poivressel te montre un ticket trouvé dans ses filets, frappé d’un Pokémon bleu aux ailes de jet."},{"name":"Le Ticket Éon","description":"Trouve le Ticket Éon sur les Routes 119 et 120, lors d’une expédition lancée sous la pluie.","condition":{"type":"questItem","itemId":"ticket-eon","count":1,"zoneId":"routes-119-120","chance":5,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"Le ticket indique un rendez-vous au-dessus des nuages, là où la pluie tombe sur la forêt."},{"name":"Sous la pluie","description":"Réussis une expédition sur les Routes 119 et 120 avec 2 Pokémon Psy de PE 700 ou plus.","condition":{"type":"expedition","zoneId":"routes-119-120","count":1,"memberType":"psychic","memberCount":2,"minMemberPower":700,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Un sifflement fend l’air : Latios passe au ras des arbres, fait demi-tour pour te saluer, et repart plus vite qu’il n’est venu. Il parcourt désormais Hoenn."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'latios';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le colosse de roche',
  "description" = 'Au fond de la mer, des ruines englouties portent des inscriptions en relief : elles parlent de trois géants endormis.',
  "steps" = '[{"name":"Les ruines englouties","description":"Réussis une expédition sur les Routes 105 à 108 avec Relicanth et Wailord dans l’équipe.","condition":{"type":"expedition","zoneId":"routes-105-108","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[369,321],"weathers":[],"timeOfDay":null},"outcome":"Wailord plonge, Relicanth te guide entre les algues : au fond, une salle couverte de points en relief. « Dans le désert dort le géant de roche. »"},{"name":"Sous les sables","description":"Réussis une expédition dans le Désert de la Route 111, lancée pendant une tempête de sable, avec 2 Pokémon Sol.","condition":{"type":"expedition","zoneId":"desert-hoenn","count":1,"memberType":"ground","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":["sand"],"timeOfDay":null},"outcome":"La tempête dégage l’entrée de ruines enfouies. Sur le mur, un nouveau message en relief."},{"name":"La tablette","description":"Trouve la Tablette de roche dans le Désert de la Route 111, avec 2 Pokémon Combat dans l’équipe.","condition":{"type":"questItem","itemId":"tablette-de-roche","count":1,"zoneId":"desert-hoenn","chance":4,"memberType":"fighting","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"La tablette vibre dans tes mains. Tu la poses dans l’encoche du mur : les ruines se mettent à trembler."},{"name":"Le réveil","description":"Réussis une expédition dans le Désert de la Route 111 avec 3 Pokémon de PE 800 ou plus.","condition":{"type":"expedition","zoneId":"desert-hoenn","count":1,"memberType":null,"memberCount":3,"minMemberPower":800,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Le mur s’effondre. Dans un grondement de rocaille, Regirock se lève, ses yeux s’allument : il ne laissera personne troubler son sommeil."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":75,"iv":31,"hpMultiplier":6,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":35}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'regirock';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le colosse d’acier',
  "description" = 'Près de la Route 120, un tombeau ancien résonne d’un bourdonnement métallique, de jour comme de nuit.',
  "steps" = '[{"name":"Métal","description":"Capture 8 Pokémon Acier à Hoenn.","condition":{"type":"catchPokemon","count":8,"pokemonType":"steel","speciesId":null,"zoneId":null},"outcome":"Tes Pokémon Acier vibrent à l’unisson, comme appelés par quelque chose de bien plus lourd qu’eux."},{"name":"La tablette","description":"Trouve la Tablette d’acier sur les Routes 119 et 120, lors d’une expédition lancée sous la pluie avec un Pokémon Acier.","condition":{"type":"questItem","itemId":"tablette-d-acier","count":1,"zoneId":"routes-119-120","chance":5,"memberType":"steel","memberCount":1,"minMemberPower":0,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"Mouillée par la pluie, la tablette révèle des points en relief : « Le géant d’acier ne s’éveille que la nuit. »"},{"name":"Le tombeau ancien","description":"Réussis une expédition sur les Routes 119 et 120, lancée de nuit, avec 2 Pokémon Feu de PE 800 ou plus.","condition":{"type":"expedition","zoneId":"routes-119-120","count":1,"memberType":"fire","memberCount":2,"minMemberPower":800,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"Le bourdonnement devient assourdissant. Les portes du tombeau s’ouvrent sur Registeel, dont le corps d’acier luit dans le noir."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":75,"iv":31,"hpMultiplier":6,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":35}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'registeel';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le colosse de glace',
  "description" = 'Une grotte gelée, au large de Hoenn, renfermerait un géant de glace plus froid que l’hiver lui-même.',
  "steps" = '[{"name":"Glace éternelle","description":"Capture 8 Pokémon Glace à Hoenn.","condition":{"type":"catchPokemon","count":8,"pokemonType":"ice","speciesId":null,"zoneId":null},"outcome":"Un plongeur de Pacifiville te parle d’une grotte où la glace ne fond jamais, même en plein été."},{"name":"La tablette","description":"Trouve la Tablette de glace dans la Grotte Tréfonds, lors d’une expédition lancée sous la grêle.","condition":{"type":"questItem","itemId":"tablette-de-glace","count":1,"zoneId":"grotte-trefonds","chance":5,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["hail"],"timeOfDay":null},"outcome":"La tablette est si froide qu’elle te brûle les doigts. Ses points en relief disent : « Le géant de glace attend la tempête. »"},{"name":"Le tombeau de l’île","description":"Réussis une expédition sur les Routes 124 à 128, lancée sous la grêle, avec 2 Pokémon Feu de PE 800 ou plus.","condition":{"type":"expedition","zoneId":"routes-124-128","count":1,"memberType":"fire","memberCount":2,"minMemberPower":800,"speciesIds":[],"weathers":["hail"],"timeOfDay":null},"outcome":"Au cœur de la tempête, le sol se craquelle. Regice se dresse dans un nuage de givre, et l’air gèle autour de toi."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":75,"iv":31,"hpMultiplier":6,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":35}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'regice';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le maître des océans',
  "description" = 'La Team Aqua chercherait à réveiller le Pokémon qui a créé les mers, endormi sous la Route 128.',
  "steps" = '[{"name":"Les trois colosses","description":"Termine les quêtes de Regirock, Registeel et Regice.","condition":{"type":"allOf","conditions":[{"type":"questCompleted","questId":"regirock"},{"type":"questCompleted","questId":"registeel"},{"type":"questCompleted","questId":"regice"}]},"outcome":"Les trois colosses éveillés, la mer elle-même semble s’agiter. Au Mont Mémoria, un vieux couple t’attendait."},{"name":"L’Orbe Bleu","description":"Trouve l’Orbe Bleu au Mont Mémoria, avec 2 Pokémon Eau dans l’équipe.","condition":{"type":"questItem","itemId":"orbe-bleu","count":1,"zoneId":"mont-memoria","chance":3,"memberType":"water","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"« La Team Aqua l’a cherché partout. Garde-le loin d’eux. » L’Orbe pulse doucement ; au fond de la Route 128, l’entrée de la Grotte Sous-Marine vient d’apparaître."},{"name":"La grotte noyée","description":"Capture 6 Pokémon Eau dans la Grotte Sous-Marine.","condition":{"type":"catchPokemon","count":6,"pokemonType":"water","speciesId":null,"zoneId":"grotte-sous-marine"},"outcome":"Plus tu avances, plus l’eau est noire et froide. L’Orbe Bleu brille de plus en plus fort."},{"name":"Pluies diluviennes","description":"Réussis une expédition dans la Grotte Sous-Marine, lancée sous la pluie, avec 2 Pokémon Électrik de PE 900 ou plus.","condition":{"type":"expedition","zoneId":"grotte-sous-marine","count":1,"memberType":"electric","memberCount":2,"minMemberPower":900,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"L’Orbe Bleu s’embrase de lumière. Kyogre émerge de l’eau noire, et la pluie se fait torrentielle sur tout Hoenn."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":25}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'kyogre';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le maître des continents',
  "description" = 'La Team Magma voudrait agrandir les terres en réveillant le Pokémon qui a soulevé les continents.',
  "steps" = '[{"name":"Les trois colosses","description":"Termine les quêtes de Regirock, Registeel et Regice.","condition":{"type":"allOf","conditions":[{"type":"questCompleted","questId":"regirock"},{"type":"questCompleted","questId":"registeel"},{"type":"questCompleted","questId":"regice"}]},"outcome":"Les trois colosses éveillés, la terre gronde sous Hoenn. Au Mont Chimnée, la Team Magma s’agite."},{"name":"L’Orbe Rouge","description":"Trouve l’Orbe Rouge au Mont Chimnée, lors d’une expédition lancée sous un grand soleil avec 2 Pokémon Feu.","condition":{"type":"questItem","itemId":"orbe-rouge","count":1,"zoneId":"mont-chimnee","chance":4,"memberType":"fire","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":["sun"],"timeOfDay":null},"outcome":"Tu arraches l’Orbe Rouge aux mains de la Team Magma. Il brûle dans ton sac ; à Atalanopolis, l’entrée de la Grotte Originelle s’est ouverte."},{"name":"La terre tremble","description":"Capture 6 Pokémon Sol dans la Grotte Originelle.","condition":{"type":"catchPokemon","count":6,"pokemonType":"ground","speciesId":null,"zoneId":"grotte-originelle"},"outcome":"La chaleur devient insoutenable. Les Pokémon de la grotte fuient vers la sortie."},{"name":"Le cœur de la grotte","description":"Réussis une expédition dans la Grotte Originelle avec 2 Pokémon Eau de PE 900 ou plus.","condition":{"type":"expedition","zoneId":"grotte-originelle","count":1,"memberType":"water","memberCount":2,"minMemberPower":900,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Le magma s’écarte. Groudon ouvre les yeux, et le soleil se met à brûler au-dessus de Hoenn."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":75,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":25}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'groudon';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le gardien du ciel',
  "description" = 'Kyogre et Groudon se sont calmés, mais leur colère a réveillé le dragon qui vit au-dessus des nuages.',
  "steps" = '[{"name":"La légende des Chutes","description":"Réussis une expédition aux Chutes Météore avec 2 Pokémon Dragon.","condition":{"type":"expedition","zoneId":"chutes-meteore","count":1,"memberType":"dragon","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Une ancienne du peuple des Chutes Météore te raconte : « Quand la terre et la mer se battent, le gardien du ciel descend de son pilier pour les séparer. »"},{"name":"L’Orbe de Jade","description":"Trouve l’Orbe de Jade sur les Routes 124 à 128, lors d’une expédition lancée sous la grêle.","condition":{"type":"questItem","itemId":"orbe-de-jade","count":1,"zoneId":"routes-124-128","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["hail"],"timeOfDay":null},"outcome":"L’Orbe vibre au rythme du vent. À l’horizon, une tour se dresse au-dessus des nuages : le Pilier Céleste."},{"name":"Le savoir des anciens","description":"Capture 80 % du Pokédex de Hoenn.","condition":{"type":"regionDexPercent","regionId":"hoenn","percent":80},"outcome":"L’ancienne t’avertit : « Le gardien ne se montre qu’à ceux qui connaissent la terre, la mer et le ciel. Tu es prêt. »"},{"name":"Les ailes du pilier","description":"Capture 2 Altaria au Pilier Céleste.","condition":{"type":"catchPokemon","count":2,"pokemonType":null,"speciesId":334,"zoneId":"pilier-celeste"},"outcome":"Tes Altaria chantent face au vent. Au sommet du pilier, un grondement leur répond."},{"name":"Le sommet du pilier","description":"Réussis une expédition au Pilier Céleste, lancée sous la grêle, avec 2 Pokémon Glace de PE 1000 ou plus.","condition":{"type":"expedition","zoneId":"pilier-celeste","count":1,"memberType":"ice","memberCount":2,"minMemberPower":1000,"speciesIds":[],"weathers":["hail"],"timeOfDay":null},"outcome":"L’air se charge d’électricité. Rayquaza fond sur toi depuis la couche d’ozone, en rugissant : personne ne grimpe impunément sur son pilier."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":4.5,"statMultiplier":1.05,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":20}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'rayquaza';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'L’étoile des vœux',
  "description" = 'Une comète ne passe qu’une fois tous les mille ans au-dessus de Hoenn. Celui qui la voit pourrait faire un vœu.',
  "steps" = '[{"name":"Presque complet","description":"Capture 95 % du Pokédex de Hoenn.","condition":{"type":"regionDexPercent","regionId":"hoenn","percent":95},"outcome":"Ce soir-là, une comète traverse le ciel de Hoenn. Une vieille légende dit qu’elle réveille un Pokémon capable d’exaucer les vœux."},{"name":"Pluie d’étoiles","description":"Trouve 3 Poussières d’étoile dans le Désert de la Route 111, lors d’expéditions lancées de nuit.","condition":{"type":"questItem","itemId":"poussiere-d-etoile","count":3,"zoneId":"desert-hoenn","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"La poussière scintille au creux de ta main et dessine une traînée vers les Chutes Météore."},{"name":"Le soleil et la lune","description":"Réussis une expédition aux Chutes Météore, lancée de nuit, avec Séléroc et Solaroc dans l’équipe.","condition":{"type":"expedition","zoneId":"chutes-meteore","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[337,338],"weathers":[],"timeOfDay":"night"},"outcome":"Séléroc et Solaroc se mettent à briller ensemble. Au cœur des chutes, un cocon de lumière s’ouvre…"},{"name":"Le vœu","description":"Réussis 3 expéditions aux Chutes Météore avec 3 Pokémon de PE 900 ou plus.","condition":{"type":"expedition","zoneId":"chutes-meteore","count":3,"memberType":null,"memberCount":3,"minMemberPower":900,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Jirachi ouvre les yeux, s’étire et sourit. Il n’a que sept jours d’éveil devant lui : il compte bien jouer — et se battre — avant de se rendormir."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":70,"iv":31,"hpMultiplier":4.5,"statMultiplier":1.05,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'jirachi';
--> statement-breakpoint
UPDATE "quests" SET
  "name" = 'Le visiteur de l’espace',
  "description" = 'Rayquaza a abattu une météorite au-dessus de Hoenn. Quelque chose en est sorti.',
  "steps" = '[{"name":"La météorite","description":"Trouve un Fragment de météorite aux Chutes Météore, avec 2 Pokémon Psy dans l’équipe.","condition":{"type":"questItem","itemId":"fragment-de-meteorite","count":1,"zoneId":"chutes-meteore","chance":3,"memberType":"psychic","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Le fragment pulse d’une énergie inconnue. Les scientifiques de la Station Spatiale le relient à des signaux venus d’une île lointaine : l’Île Aurore."},{"name":"Signaux","description":"Capture 3 Pokémon Psy sur l’Île Aurore.","condition":{"type":"catchPokemon","count":3,"pokemonType":"psychic","speciesId":null,"zoneId":"ile-aurore"},"outcome":"Les Pokémon Psy de l’île sont désorientés, comme brouillés par une onde venue d’en haut."},{"name":"Cristaux d’aurore","description":"Trouve 3 Cristaux aurore sur l’Île Aurore, lors d’expéditions lancées de nuit.","condition":{"type":"questItem","itemId":"cristal-aurore","count":3,"zoneId":"ile-aurore","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"Réunis, les cristaux projettent une aurore au-dessus de l’île. Au sommet, une pyramide de lumière se forme."},{"name":"La pyramide","description":"Réussis une expédition sur l’Île Aurore, lancée de nuit, avec 2 Pokémon Ténèbres de PE 1000 ou plus.","condition":{"type":"expedition","zoneId":"ile-aurore","count":1,"memberType":"dark","memberCount":2,"minMemberPower":1000,"speciesIds":[],"weathers":[],"timeOfDay":"night"},"outcome":"La pyramide se brise. Deoxys se matérialise, change de forme sous tes yeux, et attaque sans un bruit."}]'::jsonb,
  "rewards" = jsonb_set("rewards", '{pokemon}', (
    SELECT coalesce(jsonb_agg(
      (t.e - 'expedition') || jsonb_build_object('battle', coalesce(b.battle, '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
      ORDER BY t.i), '[]'::jsonb)
    FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
    LEFT JOIN jsonb_array_elements('[{"level":75,"iv":31,"hpMultiplier":6,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":20}]'::jsonb) WITH ORDINALITY AS b(battle, j) ON b.j = t.i
  ))
WHERE "id" = 'deoxys';
--> statement-breakpoint
-- Légendaires restants des autres quêtes (contenu ajouté dans l'admin) : combat par défaut.
UPDATE "quests" SET "rewards" = jsonb_set("rewards", '{pokemon}', (
  SELECT coalesce(jsonb_agg(
    (t.e - 'expedition') || jsonb_build_object('battle', coalesce(t.e->'battle', '{"level":null,"iv":31,"hpMultiplier":5,"statMultiplier":1.1,"enrageHpFraction":0.5,"enragePercent":20,"timeLimitSeconds":300,"minPower":0,"requiredTypes":[],"captureChance":30}'::jsonb))
    ORDER BY t.i), '[]'::jsonb)
  FROM jsonb_array_elements("quests"."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
))
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements("quests"."rewards"->'pokemon') AS e(p) WHERE NOT e.p ? 'battle'
);
--> statement-breakpoint
-- Expéditions légendaires pas encore réclamées : annulées, Balls et baies rendues.
INSERT INTO "inventory" ("owner_id", "item_id", "quantity")
SELECT x."owner_id", x."item_id", sum(x."quantity")::int
FROM (
  SELECT "owner_id", "ball_item_id" AS "item_id", "balls" AS "quantity" FROM "expeditions"
  WHERE "quest_id" IS NOT NULL AND "claimed_at" IS NULL AND "ball_item_id" IS NOT NULL AND "balls" > 0
  UNION ALL
  SELECT "owner_id", "berry_item_id", "berries" FROM "expeditions"
  WHERE "quest_id" IS NOT NULL AND "claimed_at" IS NULL AND "berry_item_id" IS NOT NULL AND "berries" > 0
) x
GROUP BY x."owner_id", x."item_id"
ON CONFLICT ("owner_id", "item_id") DO UPDATE SET "quantity" = "inventory"."quantity" + excluded."quantity";
--> statement-breakpoint
DELETE FROM "expeditions" WHERE "quest_id" IS NOT NULL AND "claimed_at" IS NULL;
--> statement-breakpoint
-- Quêtes en cours : l'étape atteinte est gardée (accès aux zones), son compteur repart de 0.
UPDATE "quest_progress" SET "progress" = '{}'::jsonb, "step_started_at" = now()
WHERE "completed_at" IS NULL AND "quest_id" IN ('electhor', 'artikodin', 'sulfura', 'mewtwo', 'mew', 'artikodin-galar', 'electhor-galar', 'sulfura-galar', 'raikou', 'entei', 'suicune', 'lugia', 'ho-oh', 'celebi', 'latias', 'latios', 'regirock', 'registeel', 'regice', 'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys');
