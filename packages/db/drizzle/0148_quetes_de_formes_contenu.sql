-- Quêtes de formes : après Kyogre, Groudon et Deoxys, cinq quêtes de Hoenn qui mènent à un
-- dresseur redoutable ; vaincu, il laisse un objet de forme (Orbe Bleu, Orbe Rouge, Météorites
-- Attaque, Défense et Vitesse), à faire tenir au PC comme une Méga-Gemme. Ajouts seulement
-- (ON CONFLICT DO NOTHING), dans chaque version de contenu qui a la quête du légendaire.
-- Les anciens objets de quête « Orbe Bleu » / « Orbe Rouge » deviennent des éclats (le véritable
-- Orbe est la récompense de la nouvelle quête) : nom, description et texte de l'étape qui les fait
-- trouver changent seulement s'ils n'ont pas été retouchés dans l'admin.
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'blue-orb', 'Orbe Bleu', 'Orbe qui renferme le pouvoir des océans. Tenu par Kyogre, il déclenche sa Primo-Résurgence.', NULL, 'formItem', 'legendary', NULL, '[{"type":"formChange","formId":10077}]'::jsonb
FROM "quests" q
WHERE q."id" = 'kyogre'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'red-orb', 'Orbe Rouge', 'Orbe qui renferme le pouvoir des continents. Tenu par Groudon, il déclenche sa Primo-Résurgence.', NULL, 'formItem', 'legendary', NULL, '[{"type":"formChange","formId":10078}]'::jsonb
FROM "quests" q
WHERE q."id" = 'groudon'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'meteorite-attaque', 'Météorite Attaque', 'Fragment rougeoyant de la météorite de Deoxys. Tenu par Deoxys, il le fait passer en Forme Attaque.', '/api/sprites/items/meteorite.png', 'formItem', 'legendary', NULL, '[{"type":"formChange","formId":10001}]'::jsonb
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'meteorite-defense', 'Météorite Défense', 'Fragment dur comme le diamant de la météorite de Deoxys. Tenu par Deoxys, il le fait passer en Forme Défense.', '/api/sprites/items/meteorite.png', 'formItem', 'legendary', NULL, '[{"type":"formChange","formId":10002}]'::jsonb
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'meteorite-vitesse', 'Météorite Vitesse', 'Fragment qui file entre les doigts, tombé de la météorite de Deoxys. Tenu par Deoxys, il le fait passer en Forme Vitesse.', '/api/sprites/items/meteorite.png', 'formItem', 'legendary', NULL, '[{"type":"formChange","formId":10003}]'::jsonb
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'parchemin-des-abysses', 'Parchemin des abysses', 'Lambeau d’une fresque recopiée par la Team Aqua. On y devine Kyogre couvert de lignes lumineuses.', '/api/sprites/items/scroll-of-waters.png', 'quest', 'rare', NULL, '[]'::jsonb
FROM "quests" q
WHERE q."id" = 'kyogre'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'roche-volcanique', 'Roche volcanique', 'Roche encore brûlante, frappée du sceau de la Team Magma.', '/api/sprites/items/hard-stone.png', 'quest', 'rare', NULL, '[]'::jsonb
FROM "quests" q
WHERE q."id" = 'groudon'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'eclat-ecarlate', 'Éclat écarlate', 'Éclat de météorite qui rougeoie à chaque coup porté autour de lui.', '/api/sprites/items/red-shard.png', 'quest', 'rare', NULL, '[]'::jsonb
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'eclat-de-jade', 'Éclat de jade', 'Éclat de météorite si dur qu’aucune pioche ne l’entame.', '/api/sprites/items/green-shard.png', 'quest', 'rare', NULL, '[]'::jsonb
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT q."content_version_id", 'eclat-dore', 'Éclat doré', 'Éclat de météorite qui ne tient jamais en place : il file dès qu’on le lâche.', '/api/sprites/items/yellow-shard.png', 'quest', 'rare', NULL, '[]'::jsonb
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-primo-kyogre-arthur', 'hoenn', 'grotte-sous-marine', 124, 'Arthur', 'Chef de la Team Aqua', '/api/sprites/trainers/archie-gen3.png', '[{"speciesId":262,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":279,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":342,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":365,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":321,"formId":null,"level":88,"iv":31,"nature":null},{"speciesId":319,"formId":null,"level":90,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 25000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'primo-kyogre'
FROM "quests" q
WHERE q."id" = 'kyogre'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-primo-groudon-max', 'hoenn', 'grotte-originelle', 125, 'Max', 'Chef de la Team Magma', '/api/sprites/trainers/maxie-gen3.png', '[{"speciesId":336,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":324,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":344,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":330,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":306,"formId":null,"level":88,"iv":31,"nature":null},{"speciesId":323,"formId":null,"level":90,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 25000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'primo-groudon'
FROM "quests" q
WHERE q."id" = 'groudon'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-deoxys-attaque-ardent', 'hoenn', 'zone-de-combat', 126, 'Ardent', 'As de la Zone de Combat', '/api/sprites/trainers/blackbelt.png', '[{"speciesId":308,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":286,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":289,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":297,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":257,"formId":null,"level":88,"iv":31,"nature":null},{"speciesId":373,"formId":null,"level":90,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 25000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'deoxys-attaque'
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-deoxys-defense-galene', 'hoenn', 'route-victoire-hoenn', 127, 'Galène', 'Géologue', '/api/sprites/trainers/ruinmaniac-gen3.png', '[{"speciesId":324,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":346,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":348,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":344,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":306,"formId":null,"level":88,"iv":31,"nature":null},{"speciesId":376,"formId":null,"level":90,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 25000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'deoxys-defense'
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-deoxys-vitesse-rafale', 'hoenn', 'pilier-celeste', 128, 'Rafale', 'Ornithologue', '/api/sprites/trainers/birdkeeper-gen3.png', '[{"speciesId":264,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":291,"formId":null,"level":86,"iv":31,"nature":null},{"speciesId":277,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":335,"formId":null,"level":87,"iv":31,"nature":null},{"speciesId":310,"formId":null,"level":88,"iv":31,"nature":null},{"speciesId":254,"formId":null,"level":90,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 25000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'deoxys-vitesse'
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "quests" ("content_version_id", "id", "kind", "order", "name", "description", "image", "region_id", "enabled", "unlock", "steps", "rewards")
SELECT q."content_version_id", 'primo-kyogre', 'form', 10, 'L’Orbe Bleu', 'Kyogre s’est calmé, mais Arthur, le chef de la Team Aqua, garde le véritable Orbe Bleu : celui qui rendrait à Kyogre sa forme originelle.', NULL, 'hoenn', true, '{"type":"questCompleted","questId":"kyogre"}'::jsonb, '[{"name":"Le chant des abysses","description":"Réussis une expédition dans la Grotte Sous-Marine avec Kyogre dans l’équipe.","condition":{"type":"expedition","zoneId":"grotte-sous-marine","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[382],"weathers":[],"timeOfDay":null},"outcome":"Au fond de la grotte, Kyogre s’arrête devant une fresque où il apparaît immense, couvert de lignes lumineuses : sa forme originelle. Quelqu’un en a arraché des morceaux."},{"name":"La fresque déchirée","description":"Trouve 3 Parchemins des abysses dans la Grotte Sous-Marine, lors d’expéditions lancées sous la pluie.","condition":{"type":"questItem","itemId":"parchemin-des-abysses","count":3,"zoneId":"grotte-sous-marine","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"Réunis, les parchemins racontent la légende : seul l’Orbe Bleu entier peut réveiller la puissance originelle de Kyogre. Celui du Mont Mémoria n’en était qu’un éclat ; l’Orbe lui-même, la Team Aqua l’a emporté."},{"name":"Sur la piste d’Arthur","description":"Capture 10 Pokémon Eau sur les Routes 124 à 128.","condition":{"type":"catchPokemon","count":10,"pokemonType":"water","speciesId":null,"zoneId":"routes-124-128"},"outcome":"Un pêcheur a vu le sous-marin de la Team Aqua plonger près de la Route 128, avec à son bord un homme barbu qui serrait une sphère bleue."},{"name":"Le repaire englouti","description":"Réussis 2 expéditions dans l’Épave Abandonnée avec 2 Pokémon Électrik de PE 1000 ou plus.","condition":{"type":"expedition","zoneId":"epave-abandonnee","count":2,"memberType":"electric","memberCount":2,"minMemberPower":1000,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Dans la cale, des caisses frappées du sigle Aqua et un journal de bord : « Le chef redescend à la Grotte Sous-Marine. Avec l’Orbe, Kyogre lui obéira enfin. »"},{"name":"Le chef de la Team Aqua","description":"Arthur t’attend au fond de la Grotte Sous-Marine, l’Orbe Bleu à la main : bats-le (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-primo-kyogre-arthur"},"outcome":"« Je voulais rendre la mer à tous les Pokémon… » Arthur te tend l’Orbe Bleu : « Il ne répondra qu’à Kyogre. Fais-le-lui tenir, et tu verras sa vraie forme. »"}]'::jsonb, '{"currency":50000,"items":[{"itemId":"blue-orb","quantity":1}],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[],"pokemon":[]}'::jsonb
FROM "quests" q
WHERE q."id" = 'kyogre'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "quests" ("content_version_id", "id", "kind", "order", "name", "description", "image", "region_id", "enabled", "unlock", "steps", "rewards")
SELECT q."content_version_id", 'primo-groudon', 'form', 11, 'L’Orbe Rouge', 'Max, le chef de la Team Magma, garde le véritable Orbe Rouge. Entre ses mains, il rendrait à Groudon sa puissance originelle… et assécherait Hoenn.', NULL, 'hoenn', true, '{"type":"questCompleted","questId":"groudon"}'::jsonb, '[{"name":"Le cœur brûlant","description":"Réussis une expédition dans la Grotte Originelle avec Groudon dans l’équipe.","condition":{"type":"expedition","zoneId":"grotte-originelle","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[383],"weathers":[],"timeOfDay":null},"outcome":"Groudon gronde devant une fresque où il apparaît couvert de magma, plus grand encore qu’aujourd’hui. Au pied de la fresque, des traces de bottes rouges."},{"name":"Les roches du volcan","description":"Trouve 3 Roches volcaniques au Mont Chimnée, lors d’expéditions lancées sous un grand soleil.","condition":{"type":"questItem","itemId":"roche-volcanique","count":3,"zoneId":"mont-chimnee","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["sun"],"timeOfDay":null},"outcome":"Chaque roche porte le sceau de la Team Magma. Celle que tu avais trouvée ici n’était qu’un éclat de l’Orbe Rouge : Max a gardé l’Orbe entier pour lui."},{"name":"Les sables du désert","description":"Capture 10 Pokémon Sol dans le Désert de la Route 111.","condition":{"type":"catchPokemon","count":10,"pokemonType":"ground","speciesId":null,"zoneId":"desert-hoenn"},"outcome":"Des sbires de la Team Magma creusent dans le sable. L’un d’eux laisse échapper : « Le chef a quitté la base du Chemin Ardent. »"},{"name":"La base du Chemin Ardent","description":"Réussis 2 expéditions au Chemin Ardent avec 2 Pokémon Eau de PE 1000 ou plus.","condition":{"type":"expedition","zoneId":"chemin-ardent","count":2,"memberType":"water","memberCount":2,"minMemberPower":1000,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"La base secrète de la Team Magma est vide. Sur la table, une carte : la Grotte Originelle, entourée de rouge."},{"name":"Le chef de la Team Magma","description":"Max veut réveiller Groudon une seconde fois : bats-le à la Grotte Originelle (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-primo-groudon-max"},"outcome":"« La terre devait s’étendre pour tous… » Max te tend l’Orbe Rouge : « Il ne brûle que pour Groudon. Fais-le-lui tenir, et la terre se souviendra. »"}]'::jsonb, '{"currency":50000,"items":[{"itemId":"red-orb","quantity":1}],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[],"pokemon":[]}'::jsonb
FROM "quests" q
WHERE q."id" = 'groudon'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "quests" ("content_version_id", "id", "kind", "order", "name", "description", "image", "region_id", "enabled", "unlock", "steps", "rewards")
SELECT q."content_version_id", 'deoxys-attaque', 'form', 12, 'La Forme Attaque', 'Trois fragments de la météorite de Deoxys sont tombés sur Hoenn. Le premier rougeoie près de la Zone de Combat, au rythme des combats les plus violents.', NULL, 'hoenn', true, '{"type":"questCompleted","questId":"deoxys"}'::jsonb, '[{"name":"L’onde écarlate","description":"Réussis une expédition à la Zone de Combat avec Deoxys dans l’équipe.","condition":{"type":"expedition","zoneId":"zone-de-combat","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[386],"weathers":[],"timeOfDay":null},"outcome":"Deoxys se raidit, ses bras se changent en lames. Quelque part dans la Zone de Combat, un fragment de sa météorite lui répond d’une lueur rouge."},{"name":"Les éclats écarlates","description":"Trouve 3 Éclats écarlates à la Zone de Combat, avec 2 Pokémon Combat dans l’équipe.","condition":{"type":"questItem","itemId":"eclat-ecarlate","count":3,"zoneId":"zone-de-combat","chance":4,"memberType":"fighting","memberCount":2,"minMemberPower":0,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Les éclats s’attirent comme des aimants et pointent tous vers la même arène : celle d’un dresseur qui ne perd jamais."},{"name":"Les adversaires","description":"Capture 8 Pokémon à la Zone de Combat.","condition":{"type":"catchPokemon","count":8,"pokemonType":null,"speciesId":null,"zoneId":"zone-de-combat"},"outcome":"Les habitués de la Zone de Combat parlent d’Ardent : il porte au cou une pierre rouge, qui brille plus fort à chaque victoire."},{"name":"Force brute","description":"Réussis 3 expéditions à la Zone de Combat avec 3 Pokémon de PE 1100 ou plus.","condition":{"type":"expedition","zoneId":"zone-de-combat","count":3,"memberType":null,"memberCount":3,"minMemberPower":1100,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Ton nom circule dans la Zone de Combat. Ardent te fait savoir qu’il t’attend : « Le fragment ira au plus fort. »"},{"name":"L’As de la Zone de Combat","description":"Ardent ne cédera le fragment rouge qu’au dresseur qui le battra : bats-le (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-deoxys-attaque-ardent"},"outcome":"Ardent essuie la sueur de son front et te tend la météorite : « Elle hurlait à chaque combat. Elle sera mieux avec celui qui l’a fait tomber. »"}]'::jsonb, '{"currency":50000,"items":[{"itemId":"meteorite-attaque","quantity":1}],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[],"pokemon":[]}'::jsonb
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "quests" ("content_version_id", "id", "kind", "order", "name", "description", "image", "region_id", "enabled", "unlock", "steps", "rewards")
SELECT q."content_version_id", 'deoxys-defense', 'form', 13, 'La Forme Défense', 'Le deuxième fragment de la météorite de Deoxys s’est enfoncé dans la Route Victoire. Tout ce qui l’entoure durcit comme de la pierre.', NULL, 'hoenn', true, '{"type":"questCompleted","questId":"deoxys"}'::jsonb, '[{"name":"L’onde de pierre","description":"Réussis une expédition sur la Route Victoire avec Deoxys dans l’équipe.","condition":{"type":"expedition","zoneId":"route-victoire-hoenn","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[386],"weathers":[],"timeOfDay":null},"outcome":"Deoxys se replie sur lui-même, son corps se couvre d’une carapace. Sous tes pieds, la roche lui répond."},{"name":"Les éclats de jade","description":"Trouve 3 Éclats de jade sur la Route Victoire, lors d’expéditions lancées sous une tempête de sable.","condition":{"type":"questItem","itemId":"eclat-de-jade","count":3,"zoneId":"route-victoire-hoenn","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["sand"],"timeOfDay":null},"outcome":"Les éclats sont si durs qu’aucun Pokémon de la grotte n’arrive à les entamer. Une géologue en a fait sa spécialité."},{"name":"Les gardiens d’acier","description":"Capture 8 Pokémon Acier sur la Route Victoire.","condition":{"type":"catchPokemon","count":8,"pokemonType":"steel","speciesId":null,"zoneId":"route-victoire-hoenn"},"outcome":"Les Pokémon Acier de la grotte se sont rassemblés autour d’un campement : celui de Galène, qui creuse là depuis des semaines."},{"name":"Briser la carapace","description":"Réussis 2 expéditions sur la Route Victoire avec 2 Pokémon Combat de PE 1000 ou plus.","condition":{"type":"expedition","zoneId":"route-victoire-hoenn","count":2,"memberType":"fighting","memberCount":2,"minMemberPower":1000,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Au fond de la galerie, Galène a enfin extrait le fragment. Elle refuse de le lâcher : « Il faudra me le prendre. »"},{"name":"La géologue","description":"Galène garde le fragment au fond de la Route Victoire : bats-la (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-deoxys-defense-galene"},"outcome":"« Je n’ai jamais vu de roche aussi dure… » Galène te confie la météorite : « Elle ne se laisse entamer par rien. Deoxys saura quoi en faire. »"}]'::jsonb, '{"currency":50000,"items":[{"itemId":"meteorite-defense","quantity":1}],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[],"pokemon":[]}'::jsonb
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "quests" ("content_version_id", "id", "kind", "order", "name", "description", "image", "region_id", "enabled", "unlock", "steps", "rewards")
SELECT q."content_version_id", 'deoxys-vitesse', 'form', 14, 'La Forme Vitesse', 'Le dernier fragment de la météorite de Deoxys file avec les vents, au-dessus des Routes 119 et 120, et ne se pose jamais.', NULL, 'hoenn', true, '{"type":"questCompleted","questId":"deoxys"}'::jsonb, '[{"name":"L’onde du vent","description":"Réussis une expédition au Pilier Céleste avec Deoxys dans l’équipe.","condition":{"type":"expedition","zoneId":"pilier-celeste","count":1,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[386],"weathers":[],"timeOfDay":null},"outcome":"Au sommet du pilier, Deoxys s’affine et s’élance vers le ciel avant de revenir : le dernier fragment file avec les vents, au-dessus des Routes 119 et 120."},{"name":"Les éclats dorés","description":"Trouve 3 Éclats dorés sur les Routes 119 et 120, lors d’expéditions lancées sous la pluie.","condition":{"type":"questItem","itemId":"eclat-dore","count":3,"zoneId":"routes-119-120","chance":4,"memberType":null,"memberCount":0,"minMemberPower":0,"speciesIds":[],"weathers":["rain"],"timeOfDay":null},"outcome":"Les éclats ne tiennent pas en place : à peine posés, ils filent vers le Pilier Céleste."},{"name":"Les feuilles dans le vent","description":"Capture 10 Pokémon Plante sur les Routes 119 et 120.","condition":{"type":"catchPokemon","count":10,"pokemonType":"grass","speciesId":null,"zoneId":"routes-119-120"},"outcome":"Les feuilles des Pokémon Plante pointent toutes dans le même sens, poussées par le passage du fragment. Un ornithologue, Rafale, le suit à la jumelle : ses Pokémon sont les seuls assez rapides pour le rattraper."},{"name":"Course contre le vent","description":"Réussis 3 expéditions sur les Routes 119 et 120 avec 2 Pokémon Vol de PE 1000 ou plus.","condition":{"type":"expedition","zoneId":"routes-119-120","count":3,"memberType":"flying","memberCount":2,"minMemberPower":1000,"speciesIds":[],"weathers":[],"timeOfDay":null},"outcome":"Rafale a rattrapé le fragment au sommet du Pilier Céleste. Il te lance : « Tu le veux ? Montre-moi que tu es plus rapide que moi ! »"},{"name":"L’ornithologue","description":"Rafale t’attend au sommet du Pilier Céleste, le fragment à la main : bats-le (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-deoxys-vitesse-rafale"},"outcome":"Rafale reprend son souffle et te tend la météorite : « Elle filait plus vite que tous mes Pokémon. Seul Deoxys peut la suivre. »"}]'::jsonb, '{"currency":50000,"items":[{"itemId":"meteorite-vitesse","quantity":1}],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[],"pokemon":[]}'::jsonb
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "items" SET "name" = 'Éclat d’Orbe Bleu' WHERE "id" = 'orbe-bleu' AND "name" = 'Orbe Bleu';
--> statement-breakpoint
UPDATE "items" SET "description" = 'Éclat de l’Orbe qui renferme le pouvoir des océans. Il pulse quand la pluie tombe.' WHERE "id" = 'orbe-bleu' AND "description" = 'Orbe qui renferme le pouvoir des océans. Il pulse quand la pluie tombe.';
--> statement-breakpoint
UPDATE "items" SET "name" = 'Éclat d’Orbe Rouge' WHERE "id" = 'orbe-rouge' AND "name" = 'Orbe Rouge';
--> statement-breakpoint
UPDATE "items" SET "description" = 'Éclat de l’Orbe qui renferme le pouvoir des continents. Il brûle quand le soleil tape.' WHERE "id" = 'orbe-rouge' AND "description" = 'Orbe qui renferme le pouvoir des continents. Il brûle quand le soleil tape.';
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_set("steps", '{1,name}', to_jsonb('L’Éclat d’Orbe Bleu'::text))
WHERE "id" = 'kyogre' AND "steps"->1->>'name' = 'L’Orbe Bleu';
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_set("steps", '{1,description}', to_jsonb('Trouve un Éclat d’Orbe Bleu au Mont Mémoria, avec 2 Pokémon Eau dans l’équipe.'::text))
WHERE "id" = 'kyogre' AND "steps"->1->>'description' = 'Trouve l’Orbe Bleu au Mont Mémoria, avec 2 Pokémon Eau dans l’équipe.';
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_set("steps", '{1,name}', to_jsonb('L’Éclat d’Orbe Rouge'::text))
WHERE "id" = 'groudon' AND "steps"->1->>'name' = 'L’Orbe Rouge';
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_set("steps", '{1,description}', to_jsonb('Trouve un Éclat d’Orbe Rouge au Mont Chimnée, lors d’une expédition lancée sous un grand soleil avec 2 Pokémon Feu.'::text))
WHERE "id" = 'groudon' AND "steps"->1->>'description' = 'Trouve l’Orbe Rouge au Mont Chimnée, lors d’une expédition lancée sous un grand soleil avec 2 Pokémon Feu.';
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_set("steps", '{1,outcome}', to_jsonb('Tu arraches un éclat de l’Orbe Rouge aux mains de la Team Magma. Il brûle dans ton sac ; à Atalanopolis, l’entrée de la Grotte Originelle s’est ouverte.'::text))
WHERE "id" = 'groudon' AND "steps"->1->>'outcome' = 'Tu arraches l’Orbe Rouge aux mains de la Team Magma. Il brûle dans ton sac ; à Atalanopolis, l’entrée de la Grotte Originelle s’est ouverte.';
