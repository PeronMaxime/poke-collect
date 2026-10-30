-- Quêtes de Hoenn alignées sur les réglages de Kanto et Johto : éons = bêtes, colosses = oiseaux,
-- Kyogre et Groudon = Lugia et Ho-Oh, Jirachi = Celebi. Rayquaza et Deoxys ne changent pas.
UPDATE "quests" q SET "steps" = '[{"name":"Ondes psychiques","description":"Capture 50 Pokémon Psy.","condition":{"type":"catchPokemon","count":50,"pokemonType":"psychic","speciesId":null,"zoneId":null}},{"name":"Au-dessus des vagues","description":"Réussis une expédition sur les Routes 105 à 108 avec 2 Pokémon Psy de PE 600 ou plus.","condition":{"type":"expedition","zoneId":"routes-105-108","count":1,"memberType":"psychic","memberCount":2,"minMemberPower":600}}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'latias';--> statement-breakpoint
UPDATE "quests" q SET "rewards" = jsonb_set(q."rewards", '{currency}', '15000'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'latias';--> statement-breakpoint
UPDATE "quests" q SET "steps" = '[{"name":"Courants marins","description":"Capture 50 Pokémon Eau.","condition":{"type":"catchPokemon","count":50,"pokemonType":"water","speciesId":null,"zoneId":null}},{"name":"Sous la pluie","description":"Réussis une expédition sur les Routes 119 et 120 avec 2 Pokémon Psy de PE 600 ou plus.","condition":{"type":"expedition","zoneId":"routes-119-120","count":1,"memberType":"psychic","memberCount":2,"minMemberPower":600}}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'latios';--> statement-breakpoint
UPDATE "quests" q SET "rewards" = jsonb_set(q."rewards", '{currency}', '15000'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'latios';--> statement-breakpoint
UPDATE "quests" q SET "steps" = '[{"name":"Roches anciennes","description":"Capture 50 Pokémon Roche.","condition":{"type":"catchPokemon","count":50,"pokemonType":"rock","speciesId":null,"zoneId":null}},{"name":"Éboulements","description":"Capture 75 Pokémon Roche au Désert de la Route 111.","condition":{"type":"catchPokemon","count":75,"pokemonType":"rock","speciesId":null,"zoneId":"desert-hoenn"}},{"name":"Le tombeau du désert","description":"Réussis une expédition au Désert de la Route 111 avec 2 Pokémon Roche de PE 600 ou plus.","condition":{"type":"expedition","zoneId":"desert-hoenn","count":1,"memberType":"rock","memberCount":2,"minMemberPower":600}}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'regirock';--> statement-breakpoint
UPDATE "quests" q SET "rewards" = jsonb_set(jsonb_set(q."rewards", '{currency}', '10000'::jsonb), '{pokemon,0,expedition,minPower}', '3000'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'regirock';--> statement-breakpoint
UPDATE "quests" q SET "steps" = '[{"name":"Métal","description":"Capture 50 Pokémon Acier.","condition":{"type":"catchPokemon","count":50,"pokemonType":"steel","speciesId":null,"zoneId":null}},{"name":"Champ magnétique","description":"Capture 75 Pokémon Acier à New Lavandia.","condition":{"type":"catchPokemon","count":75,"pokemonType":"steel","speciesId":null,"zoneId":"new-lavandia"}},{"name":"Le tombeau de la forêt","description":"Réussis une expédition à New Lavandia avec 2 Pokémon Acier de PE 600 ou plus.","condition":{"type":"expedition","zoneId":"new-lavandia","count":1,"memberType":"steel","memberCount":2,"minMemberPower":600}}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'registeel';--> statement-breakpoint
UPDATE "quests" q SET "rewards" = jsonb_set(jsonb_set(q."rewards", '{currency}', '10000'::jsonb), '{pokemon,0,expedition,minPower}', '3000'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'registeel';--> statement-breakpoint
UPDATE "quests" q SET "steps" = '[{"name":"Glace éternelle","description":"Capture 50 Pokémon Glace.","condition":{"type":"catchPokemon","count":50,"pokemonType":"ice","speciesId":null,"zoneId":null}},{"name":"Le froid des profondeurs","description":"Capture 75 Pokémon Glace à la Grotte Tréfonds.","condition":{"type":"catchPokemon","count":75,"pokemonType":"ice","speciesId":null,"zoneId":"grotte-trefonds"}},{"name":"Le tombeau de l’île","description":"Réussis une expédition à la Grotte Tréfonds avec 2 Pokémon Glace de PE 600 ou plus.","condition":{"type":"expedition","zoneId":"grotte-trefonds","count":1,"memberType":"ice","memberCount":2,"minMemberPower":600}}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'regice';--> statement-breakpoint
UPDATE "quests" q SET "rewards" = jsonb_set(jsonb_set(q."rewards", '{currency}', '10000'::jsonb), '{pokemon,0,expedition,minPower}', '3000'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'regice';--> statement-breakpoint
UPDATE "quests" q SET "steps" = '[{"name":"Les trois colosses","description":"Termine les quêtes de Regirock, de Registeel et de Regice.","condition":{"type":"allOf","conditions":[{"type":"questCompleted","questId":"regirock"},{"type":"questCompleted","questId":"registeel"},{"type":"questCompleted","questId":"regice"}]}},{"name":"Plongée","description":"Capture 30 Pokémon Eau pour atteindre la grotte.","condition":{"type":"catchPokemon","count":30,"pokemonType":"water","speciesId":null,"zoneId":null}},{"name":"Les ténèbres","description":"Capture 30 Pokémon Ténèbres.","condition":{"type":"catchPokemon","count":30,"pokemonType":"dark","speciesId":null,"zoneId":null}},{"name":"La grotte noyée","description":"Réussis une expédition à la Grotte Sous-Marine avec 2 Pokémon Eau de PE 600 ou plus.","condition":{"type":"expedition","zoneId":"grotte-sous-marine","count":1,"memberType":"water","memberCount":2,"minMemberPower":600}}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'kyogre';--> statement-breakpoint
UPDATE "quests" q SET "rewards" = jsonb_set(jsonb_set(q."rewards", '{currency}', '50000'::jsonb), '{pokemon,0,expedition,minPower}', '4500'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'kyogre';--> statement-breakpoint
UPDATE "quests" q SET "steps" = '[{"name":"Les trois colosses","description":"Termine les quêtes de Regirock, de Registeel et de Regice.","condition":{"type":"allOf","conditions":[{"type":"questCompleted","questId":"regirock"},{"type":"questCompleted","questId":"registeel"},{"type":"questCompleted","questId":"regice"}]}},{"name":"La terre tremble","description":"Capture 30 Pokémon Sol.","condition":{"type":"catchPokemon","count":30,"pokemonType":"ground","speciesId":null,"zoneId":null}},{"name":"Le magma","description":"Capture 30 Pokémon Feu.","condition":{"type":"catchPokemon","count":30,"pokemonType":"fire","speciesId":null,"zoneId":null}},{"name":"Le cœur de la grotte","description":"Réussis une expédition à la Grotte Originelle avec 3 Pokémon Sol de PE 600 ou plus.","condition":{"type":"expedition","zoneId":"grotte-originelle","count":1,"memberType":"ground","memberCount":3,"minMemberPower":600}}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'groudon';--> statement-breakpoint
UPDATE "quests" q SET "rewards" = jsonb_set(jsonb_set(q."rewards", '{currency}', '50000'::jsonb), '{pokemon,0,expedition,minPower}', '4500'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'groudon';--> statement-breakpoint
UPDATE "quests" q SET "steps" = '[{"name":"Presque complet","description":"Capture 95 % du Pokédex de Hoenn.","condition":{"type":"regionDexPercent","regionId":"hoenn","percent":95}},{"name":"Étoiles d’acier","description":"Capture 50 Pokémon Acier.","condition":{"type":"catchPokemon","count":50,"pokemonType":"steel","speciesId":null,"zoneId":null}},{"name":"La pluie d’étoiles","description":"Réussis 3 expéditions aux Chutes Météore avec 3 Pokémon de PE 800 ou plus.","condition":{"type":"expedition","zoneId":"chutes-meteore","count":3,"memberType":null,"memberCount":3,"minMemberPower":800}}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'jirachi';--> statement-breakpoint
UPDATE "quests" q SET "unlock" = '{"type":"allOf","conditions":[{"type":"questCompleted","questId":"kyogre"},{"type":"questCompleted","questId":"groudon"}]}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'jirachi';--> statement-breakpoint
UPDATE "quests" q SET "rewards" = jsonb_set(jsonb_set(jsonb_set(jsonb_set(q."rewards", '{currency}', '75000'::jsonb), '{pokemon,0,expedition,minPower}', '4500'::jsonb), '{items}', '[{"itemId":"gold-bottle-cap","quantity":1}]'::jsonb), '{pokemon,0,level}', '50'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'jirachi';--> statement-breakpoint
UPDATE "zones" q SET "unlock" = '{"type":"questStepsDone","questId":"kyogre","count":2}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft') AND q."id" = 'grotte-sous-marine';
