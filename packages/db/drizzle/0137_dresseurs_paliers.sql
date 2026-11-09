-- Dresseurs répétables : trois par palier avant chaque Champion d'arène (et avant le Conseil 4),
-- à Kanto, Johto et Hoenn. Versions publiée et brouillon qui ont encore le dresseur d'ancrage.
-- Pour chaque palier : les dresseurs ordinaires de la région placés après l'ancrage sont décalés
-- (une seule fois : tant que le premier ajouté n'existe pas), les nouveaux sont insérés à la suite
-- (chacun débloqué par le précédent, le premier par l'ancrage ; sans butin, comme les autres), puis
-- le Champion (ou le premier du Conseil 4) est rechaîné sur le dernier ajouté, seulement si sa
-- condition est encore celle d'origine.
-- Kanto : Gérard, Édouard, après Hugo, avant Major Bob.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'marin-hugo'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'pecheur-gerard'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'pecheur-gerard', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'cap-azuria'), a."order" + 1, 'Gérard', 'Pêcheur', '/api/sprites/trainers/fisherman.png', '[{"speciesId":118,"level":22,"iv":null,"nature":null},{"speciesId":61,"level":22,"iv":null,"nature":null},{"speciesId":98,"level":23,"iv":null,"nature":null}]'::jsonb, 150, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 930, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"marin-hugo"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'marin-hugo' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'gentleman-edouard', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-5-6'), a."order" + 2, 'Édouard', 'Gentleman', '/api/sprites/trainers/gentleman.png', '[{"speciesId":58,"level":22,"iv":null,"nature":null},{"speciesId":52,"level":23,"iv":null,"nature":null},{"speciesId":17,"level":24,"iv":null,"nature":null}]'::jsonb, 150, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 990, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"pecheur-gerard"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'marin-hugo' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"gentleman-edouard"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'major-bob' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"marin-hugo"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'gentleman-edouard');--> statement-breakpoint
-- Kanto : Max, Clara, après Ivan, avant Erika.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'montagnard-ivan'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'jongleur-max'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'jongleur-max', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-9-10'), a."order" + 1, 'Max', 'Jongleur', '/api/sprites/trainers/juggler.png', '[{"speciesId":96,"level":26,"iv":null,"nature":null},{"speciesId":100,"level":26,"iv":null,"nature":null},{"speciesId":23,"level":27,"iv":null,"nature":null},{"speciesId":64,"level":28,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 1440, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"montagnard-ivan"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'montagnard-ivan' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'beaute-clara', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-7-8'), a."order" + 2, 'Clara', 'Beauté', '/api/sprites/trainers/beauty.png', '[{"speciesId":37,"level":27,"iv":null,"nature":null},{"speciesId":39,"level":27,"iv":null,"nature":null},{"speciesId":44,"level":28,"iv":null,"nature":null},{"speciesId":70,"level":29,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 1530, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"jongleur-max"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'montagnard-ivan' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"beaute-clara"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'erika' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"montagnard-ivan"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'beaute-clara');--> statement-breakpoint
-- Kanto : Félix, après Rex, avant Koga.
UPDATE "trainers" t
SET "order" = t."order" + 1
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'motard-rex'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'ornithologue-felix'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'ornithologue-felix', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-12-15'), a."order" + 1, 'Félix', 'Ornithologue', '/api/sprites/trainers/birdkeeper.png', '[{"speciesId":83,"level":35,"iv":null,"nature":null},{"speciesId":17,"level":35,"iv":null,"nature":null},{"speciesId":22,"level":36,"iv":null,"nature":null},{"speciesId":85,"level":37,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2160, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"motard-rex"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'motard-rex' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"ornithologue-felix"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'koga' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"motard-rex"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'ornithologue-felix');--> statement-breakpoint
-- Kanto : Yann, Nathan, après Sbire, avant Morgane.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'sbire-rocket'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'nageur-yann'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'nageur-yann', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-maritimes'), a."order" + 1, 'Yann', 'Nageur', '/api/sprites/trainers/swimmer.png', '[{"speciesId":73,"level":42,"iv":null,"nature":null},{"speciesId":117,"level":43,"iv":null,"nature":null},{"speciesId":99,"level":43,"iv":null,"nature":null},{"speciesId":119,"level":44,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2760, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"sbire-rocket"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'sbire-rocket' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'kinesiste-nathan', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'sylphe-sarl'), a."order" + 2, 'Nathan', 'Kinésiste', '/api/sprites/trainers/psychic.png', '[{"speciesId":64,"level":43,"iv":null,"nature":null},{"speciesId":97,"level":44,"iv":null,"nature":null},{"speciesId":80,"level":44,"iv":null,"nature":null},{"speciesId":122,"level":45,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2880, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"nageur-yann"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'sbire-rocket' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"kinesiste-nathan"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'morgane' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"sbire-rocket"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'kinesiste-nathan');--> statement-breakpoint
-- Kanto : Gaspard, Bertrand, après Léna, avant Auguste.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'nageuse-lena'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'cambrioleur-gaspard'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'cambrioleur-gaspard', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'manoir-pokemon'), a."order" + 1, 'Gaspard', 'Cambrioleur', '/api/sprites/trainers/burglar.png', '[{"speciesId":58,"level":45,"iv":null,"nature":null},{"speciesId":77,"level":45,"iv":null,"nature":null},{"speciesId":110,"level":46,"iv":null,"nature":null},{"speciesId":126,"level":47,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2550, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"nageuse-lena"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'nageuse-lena' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'pokemaniac-bertrand', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'manoir-pokemon'), a."order" + 2, 'Bertrand', 'Pokémaniac', '/api/sprites/trainers/pokemaniac.png', '[{"speciesId":89,"level":46,"iv":null,"nature":null},{"speciesId":132,"level":46,"iv":null,"nature":null},{"speciesId":111,"level":47,"iv":null,"nature":null},{"speciesId":108,"level":48,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2700, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"cambrioleur-gaspard"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'nageuse-lena' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"pokemaniac-bertrand"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'auguste' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"nageuse-lena"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'pokemaniac-bertrand');--> statement-breakpoint
-- Kanto : Kenji, Roger, après Hector, avant Giovanni.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'scientifique-hector'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'karateka-kenji'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'karateka-kenji', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'route-23'), a."order" + 1, 'Kenji', 'Karatéka', '/api/sprites/trainers/blackbelt.png', '[{"speciesId":57,"level":50,"iv":null,"nature":null},{"speciesId":67,"level":51,"iv":null,"nature":null},{"speciesId":106,"level":51,"iv":null,"nature":null},{"speciesId":107,"level":52,"iv":null,"nature":null},{"speciesId":62,"level":52,"iv":null,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 3420, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"scientifique-hector"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'scientifique-hector' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'montagnard-roger', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'route-23'), a."order" + 2, 'Roger', 'Montagnard', '/api/sprites/trainers/hiker.png', '[{"speciesId":75,"level":51,"iv":null,"nature":null},{"speciesId":95,"level":51,"iv":null,"nature":null},{"speciesId":28,"level":52,"iv":null,"nature":null},{"speciesId":105,"level":52,"iv":null,"nature":null},{"speciesId":112,"level":53,"iv":null,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 3540, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"karateka-kenji"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'scientifique-hector' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"montagnard-roger"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'giovanni' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"scientifique-hector"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'montagnard-roger');--> statement-breakpoint
-- Kanto : Victor, Léa, après Alice, avant Olga.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'topdresseuse-alice'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'topdresseur-victor'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'topdresseur-victor', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'route-victoire'), a."order" + 1, 'Victor', 'Topdresseur', '/api/sprites/trainers/acetrainer.png', '[{"speciesId":59,"level":57,"iv":20,"nature":null},{"speciesId":103,"level":57,"iv":20,"nature":null},{"speciesId":121,"level":57,"iv":20,"nature":null},{"speciesId":112,"level":58,"iv":20,"nature":null},{"speciesId":34,"level":58,"iv":20,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 5400, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"topdresseuse-alice"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'topdresseuse-alice' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'topdresseuse-lea', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'route-victoire'), a."order" + 2, 'Léa', 'Topdresseuse', '/api/sprites/trainers/acetrainerf-gen3.png', '[{"speciesId":45,"level":58,"iv":20,"nature":null},{"speciesId":131,"level":58,"iv":20,"nature":null},{"speciesId":130,"level":58,"iv":20,"nature":null},{"speciesId":148,"level":58,"iv":20,"nature":null},{"speciesId":142,"level":59,"iv":20,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 5550, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"topdresseur-victor"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'topdresseuse-alice' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"allOf","conditions":[{"type":"badgeCount","count":8,"regionId":"kanto"},{"type":"trainerDefeated","trainerId":"topdresseuse-lea"}]}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'olga' AND t."unlock" = '{"type":"allOf","conditions":[{"type":"badgeCount","count":8,"regionId":"kanto"},{"type":"trainerDefeated","trainerId":"topdresseuse-alice"}]}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'topdresseuse-lea');--> statement-breakpoint
-- Johto : Bernard, après Gina, avant Blanche.
UPDATE "trainers" t
SET "order" = t."order" + 1
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'pique-niqueuse-gina'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'pokefan-bernard'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'pokefan-bernard', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-34-35'), a."order" + 1, 'Bernard', 'Pokéfan', '/api/sprites/trainers/pokefan.png', '[{"speciesId":209,"level":21,"iv":null,"nature":null},{"speciesId":39,"level":21,"iv":null,"nature":null},{"speciesId":162,"level":22,"iv":null,"nature":null}]'::jsonb, 150, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 900, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"pique-niqueuse-gina"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'pique-niqueuse-gina' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"pokefan-bernard"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'blanche' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"pique-niqueuse-gina"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'pokefan-bernard');--> statement-breakpoint
-- Johto : Dino, Alfred, après Édith, avant Mortimer.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'mediume-edith'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'cracheur-dino'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'cracheur-dino', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'tour-cendree'), a."order" + 1, 'Dino', 'Cracheur de feu', '/api/sprites/trainers/firebreather.png', '[{"speciesId":218,"level":25,"iv":null,"nature":null},{"speciesId":228,"level":25,"iv":null,"nature":null},{"speciesId":109,"level":26,"iv":null,"nature":null},{"speciesId":58,"level":27,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 1440, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"mediume-edith"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'mediume-edith' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'gentleman-alfred', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-38-39'), a."order" + 2, 'Alfred', 'Gentleman', '/api/sprites/trainers/gentleman.png', '[{"speciesId":209,"level":26,"iv":null,"nature":null},{"speciesId":241,"level":27,"iv":null,"nature":null},{"speciesId":164,"level":27,"iv":null,"nature":null},{"speciesId":210,"level":28,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 1530, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"cracheur-dino"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'mediume-edith' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"gentleman-alfred"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'mortimer' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"mediume-edith"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'gentleman-alfred');--> statement-breakpoint
-- Johto : Takeshi, Marcel, après Marina, avant Chuck.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'nageuse-marina'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'karateka-takeshi'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'karateka-takeshi', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'mont-creuset'), a."order" + 1, 'Takeshi', 'Karatéka', '/api/sprites/trainers/blackbelt.png', '[{"speciesId":66,"level":32,"iv":null,"nature":null},{"speciesId":56,"level":32,"iv":null,"nature":null},{"speciesId":67,"level":33,"iv":null,"nature":null},{"speciesId":57,"level":34,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2040, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"nageuse-marina"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'nageuse-marina' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'pecheur-marcel', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-42-44'), a."order" + 2, 'Marcel', 'Pêcheur', '/api/sprites/trainers/fisherman-gen4.png', '[{"speciesId":223,"level":33,"iv":null,"nature":null},{"speciesId":224,"level":34,"iv":null,"nature":null},{"speciesId":195,"level":34,"iv":null,"nature":null},{"speciesId":184,"level":35,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2160, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"karateka-takeshi"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'nageuse-marina' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"pecheur-marcel"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'chuck' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"nageuse-marina"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'pecheur-marcel');--> statement-breakpoint
-- Johto : Ludovic, Sakura, après Gilles, avant Jasmine.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'marin-gilles'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'scientifique-ludovic'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'scientifique-ludovic', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'phare-oliville'), a."order" + 1, 'Ludovic', 'Scientifique', '/api/sprites/trainers/scientist.png', '[{"speciesId":81,"level":37,"iv":null,"nature":null},{"speciesId":82,"level":38,"iv":null,"nature":null},{"speciesId":101,"level":38,"iv":null,"nature":null},{"speciesId":181,"level":39,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2520, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"marin-gilles"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'marin-gilles' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'kimono-sakura', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'parc-safari-johto'), a."order" + 2, 'Sakura', 'Kimono', '/api/sprites/trainers/kimonogirl.png', '[{"speciesId":203,"level":38,"iv":null,"nature":null},{"speciesId":178,"level":38,"iv":null,"nature":null},{"speciesId":227,"level":39,"iv":null,"nature":null},{"speciesId":207,"level":39,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2640, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"scientifique-ludovic"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'marin-gilles' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"kimono-sakura"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'jasmine' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"marin-gilles"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'kimono-sakura');--> statement-breakpoint
-- Johto : Loïc, Hervé, après Sbire, avant Frédo.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'sbire-qg-rocket'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'nageur-loic'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'nageur-loic', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'lac-colere'), a."order" + 1, 'Loïc', 'Nageur', '/api/sprites/trainers/swimmer.png', '[{"speciesId":61,"level":41,"iv":null,"nature":null},{"speciesId":119,"level":41,"iv":null,"nature":null},{"speciesId":195,"level":42,"iv":null,"nature":null},{"speciesId":130,"level":43,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2850, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"sbire-qg-rocket"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'sbire-qg-rocket' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'pokemaniac-herve', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'lac-colere'), a."order" + 2, 'Hervé', 'Pokémaniac', '/api/sprites/trainers/pokemaniac.png', '[{"speciesId":80,"level":42,"iv":null,"nature":null},{"speciesId":111,"level":42,"iv":null,"nature":null},{"speciesId":34,"level":43,"iv":null,"nature":null},{"speciesId":115,"level":43,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2970, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"nageur-loic"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'sbire-qg-rocket' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"pokemaniac-herve"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'fredo' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"sbire-qg-rocket"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'pokemaniac-herve');--> statement-breakpoint
-- Johto : Fred, Erwan, après Rosa, avant Sandra.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'skieuse-rosa'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'snowboarder-fred'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'snowboarder-fred', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'route-de-glace'), a."order" + 1, 'Fred', 'Snowboarder', '/api/sprites/trainers/boarder.png', '[{"speciesId":221,"level":45,"iv":null,"nature":null},{"speciesId":87,"level":45,"iv":null,"nature":null},{"speciesId":225,"level":45,"iv":null,"nature":null},{"speciesId":215,"level":46,"iv":null,"nature":null},{"speciesId":124,"level":46,"iv":null,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 3420, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"skieuse-rosa"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'skieuse-rosa' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'dompteur-erwan', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'route-de-glace'), a."order" + 2, 'Erwan', 'Dompteur', '/api/sprites/trainers/dragontamer.png', '[{"speciesId":117,"level":46,"iv":null,"nature":null},{"speciesId":181,"level":47,"iv":null,"nature":null},{"speciesId":130,"level":47,"iv":null,"nature":null},{"speciesId":148,"level":47,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 3540, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"snowboarder-fred"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'skieuse-rosa' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"dompteur-erwan"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'sandra' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"skieuse-rosa"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'dompteur-erwan');--> statement-breakpoint
-- Johto : Léonie, Gustave, après Gaston, avant Clément.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'topdresseur-gaston'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'topdresseuse-leonie'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'topdresseuse-leonie', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-26-27'), a."order" + 1, 'Léonie', 'Topdresseuse', '/api/sprites/trainers/acetrainerf.png', '[{"speciesId":38,"level":53,"iv":20,"nature":null},{"speciesId":178,"level":53,"iv":20,"nature":null},{"speciesId":171,"level":53,"iv":20,"nature":null},{"speciesId":189,"level":53,"iv":20,"nature":null},{"speciesId":229,"level":54,"iv":20,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 5400, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"topdresseur-gaston"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'topdresseur-gaston' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'montagnard-gustave', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-45-46'), a."order" + 2, 'Gustave', 'Montagnard', '/api/sprites/trainers/hiker.png', '[{"speciesId":185,"level":54,"iv":20,"nature":null},{"speciesId":232,"level":54,"iv":20,"nature":null},{"speciesId":217,"level":54,"iv":20,"nature":null},{"speciesId":76,"level":54,"iv":20,"nature":null},{"speciesId":208,"level":55,"iv":20,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 5550, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"topdresseuse-leonie"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'topdresseur-gaston' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"allOf","conditions":[{"type":"badgeCount","count":8,"regionId":"johto"},{"type":"trainerDefeated","trainerId":"montagnard-gustave"}]}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'clement' AND t."unlock" = '{"type":"allOf","conditions":[{"type":"badgeCount","count":8,"regionId":"johto"},{"type":"trainerDefeated","trainerId":"topdresseur-gaston"}]}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'montagnard-gustave');--> statement-breakpoint
-- Hoenn : Rémi, après Lina, avant Voltère.
UPDATE "trainers" t
SET "order" = t."order" + 1
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'pique-niqueuse-lina'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'guitariste-remi'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'guitariste-remi', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'route-110'), a."order" + 1, 'Rémi', 'Guitariste', '/api/sprites/trainers/guitarist-gen3.png', '[{"speciesId":309,"level":21,"iv":null,"nature":null},{"speciesId":311,"level":21,"iv":null,"nature":null},{"speciesId":312,"level":21,"iv":null,"nature":null},{"speciesId":81,"level":22,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 900, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"pique-niqueuse-lina"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'pique-niqueuse-lina' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"guitariste-remi"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'voltere' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"pique-niqueuse-lina"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'guitariste-remi');--> statement-breakpoint
-- Hoenn : Tanguy, Lucas, après Sbire, avant Adriane.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'sbire-magma-chimnee'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'pyromane-tanguy'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'pyromane-tanguy', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'mont-chimnee'), a."order" + 1, 'Tanguy', 'Pyromane', '/api/sprites/trainers/kindler-gen3.png', '[{"speciesId":322,"level":25,"iv":null,"nature":null},{"speciesId":218,"level":25,"iv":null,"nature":null},{"speciesId":324,"level":26,"iv":null,"nature":null},{"speciesId":37,"level":26,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 1440, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"sbire-magma-chimnee"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'sbire-magma-chimnee' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'kinesiste-lucas', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-111-113'), a."order" + 2, 'Lucas', 'Kinésiste', '/api/sprites/trainers/psychic-gen3.png', '[{"speciesId":325,"level":26,"iv":null,"nature":null},{"speciesId":343,"level":26,"iv":null,"nature":null},{"speciesId":307,"level":27,"iv":null,"nature":null},{"speciesId":333,"level":27,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 1530, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"pyromane-tanguy"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'sbire-magma-chimnee' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"kinesiste-lucas"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'adriane' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"sbire-magma-chimnee"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'kinesiste-lucas');--> statement-breakpoint
-- Hoenn : Octave, Yvon, après Maëva, avant Norman.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'nageuse-maeva'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'ruinemaniac-octave'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'ruinemaniac-octave', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'desert-hoenn'), a."order" + 1, 'Octave', 'Ruinémaniac', '/api/sprites/trainers/ruinmaniac-gen3.png', '[{"speciesId":328,"level":32,"iv":null,"nature":null},{"speciesId":331,"level":32,"iv":null,"nature":null},{"speciesId":28,"level":33,"iv":null,"nature":null},{"speciesId":329,"level":34,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2040, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"nageuse-maeva"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'nageuse-maeva' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'pecheur-yvon', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-105-108'), a."order" + 2, 'Yvon', 'Pêcheur', '/api/sprites/trainers/fisherman-gen3.png', '[{"speciesId":320,"level":33,"iv":null,"nature":null},{"speciesId":318,"level":33,"iv":null,"nature":null},{"speciesId":279,"level":34,"iv":null,"nature":null},{"speciesId":73,"level":34,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2160, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"ruinemaniac-octave"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'nageuse-maeva' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"pecheur-yvon"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'norman' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"nageuse-maeva"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'pecheur-yvon');--> statement-breakpoint
-- Hoenn : Hiro, Basile, après Élie, avant Alizée.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'ornithologue-elie'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'ninja-hiro'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'ninja-hiro', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'routes-119-120'), a."order" + 1, 'Hiro', 'Ninja', '/api/sprites/trainers/ninjaboy-gen3.png', '[{"speciesId":352,"level":37,"iv":null,"nature":null},{"speciesId":284,"level":37,"iv":null,"nature":null},{"speciesId":274,"level":38,"iv":null,"nature":null},{"speciesId":359,"level":39,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2520, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"ornithologue-elie"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'ornithologue-elie' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'collectionneur-basile', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'parc-safari-hoenn'), a."order" + 2, 'Basile', 'Collectionneur', '/api/sprites/trainers/collector-gen3.png', '[{"speciesId":203,"level":38,"iv":null,"nature":null},{"speciesId":357,"level":38,"iv":null,"nature":null},{"speciesId":178,"level":39,"iv":null,"nature":null},{"speciesId":319,"level":39,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2640, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"ninja-hiro"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'ornithologue-elie' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"collectionneur-basile"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'alizee' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"ornithologue-elie"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'collectionneur-basile');--> statement-breakpoint
-- Hoenn : Ysolde, Elsa, après Sbire, avant Lévy et Tatia.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'sbire-aqua-memoria'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'mystimaniac-ysolde'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'mystimaniac-ysolde', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'mont-memoria'), a."order" + 1, 'Ysolde', 'Mystimaniac', '/api/sprites/trainers/hexmaniac-gen3.png', '[{"speciesId":353,"level":41,"iv":null,"nature":null},{"speciesId":354,"level":42,"iv":null,"nature":null},{"speciesId":356,"level":42,"iv":null,"nature":null},{"speciesId":93,"level":42,"iv":null,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2850, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"sbire-aqua-memoria"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'sbire-aqua-memoria' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'kinesiste-elsa', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'mont-memoria'), a."order" + 2, 'Elsa', 'Kinésiste', '/api/sprites/trainers/psychicf-gen3.png', '[{"speciesId":281,"level":42,"iv":null,"nature":null},{"speciesId":358,"level":42,"iv":null,"nature":null},{"speciesId":326,"level":43,"iv":null,"nature":null},{"speciesId":337,"level":43,"iv":null,"nature":null},{"speciesId":338,"level":43,"iv":null,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2970, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"mystimaniac-ysolde"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'sbire-aqua-memoria' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"kinesiste-elsa"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'levy-tatia' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"sbire-aqua-memoria"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'kinesiste-elsa');--> statement-breakpoint
-- Hoenn : Odile, Nolan, après Tomas, avant Juan.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'pecheur-tomas'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'experte-odile'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'experte-odile', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'grotte-trefonds'), a."order" + 1, 'Odile', 'Experte', '/api/sprites/trainers/expertf-gen3.png', '[{"speciesId":364,"level":45,"iv":null,"nature":null},{"speciesId":362,"level":45,"iv":null,"nature":null},{"speciesId":308,"level":46,"iv":null,"nature":null},{"speciesId":297,"level":46,"iv":null,"nature":null},{"speciesId":342,"level":46,"iv":null,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 3420, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"pecheur-tomas"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'pecheur-tomas' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'nageur-nolan', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'grotte-trefonds'), a."order" + 2, 'Nolan', 'Nageur', '/api/sprites/trainers/swimmerm-gen3.png', '[{"speciesId":320,"level":46,"iv":null,"nature":null},{"speciesId":171,"level":46,"iv":null,"nature":null},{"speciesId":340,"level":47,"iv":null,"nature":null},{"speciesId":319,"level":47,"iv":null,"nature":null},{"speciesId":130,"level":47,"iv":null,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 3540, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"experte-odile"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'pecheur-tomas' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"trainerDefeated","trainerId":"nageur-nolan"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'juan' AND t."unlock" = '{"type":"trainerDefeated","trainerId":"pecheur-tomas"}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'nageur-nolan');--> statement-breakpoint
-- Hoenn : Gaël, Ronan, après Vanessa, avant Damien.
UPDATE "trainers" t
SET "order" = t."order" + 2
FROM "trainers" a, "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND a."content_version_id" = t."content_version_id" AND a."id" = 'topdresseuse-vanessa'
  AND t."region_id" = a."region_id" AND t."quest_id" IS NULL AND t."order" > a."order"
  AND NOT EXISTS (
    SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'topdresseur-gael'
  );--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'topdresseur-gael', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'route-victoire-hoenn'), a."order" + 1, 'Gaël', 'Topdresseur', '/api/sprites/trainers/acetrainer-gen3.png', '[{"speciesId":295,"level":53,"iv":20,"nature":null},{"speciesId":306,"level":53,"iv":20,"nature":null},{"speciesId":308,"level":53,"iv":20,"nature":null},{"speciesId":310,"level":53,"iv":20,"nature":null},{"speciesId":334,"level":54,"iv":20,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 5400, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"topdresseuse-vanessa"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'topdresseuse-vanessa' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT a."content_version_id", 'dompteur-ronan', a."region_id", (SELECT z."id" FROM "zones" z WHERE z."content_version_id" = a."content_version_id" AND z."id" = 'route-victoire-hoenn'), a."order" + 2, 'Ronan', 'Dompteur', '/api/sprites/trainers/dragontamer-gen3.png', '[{"speciesId":344,"level":54,"iv":20,"nature":null},{"speciesId":372,"level":54,"iv":20,"nature":null},{"speciesId":334,"level":54,"iv":20,"nature":null},{"speciesId":330,"level":54,"iv":20,"nature":null},{"speciesId":130,"level":55,"iv":20,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 5550, NULL, 0, NULL, true, NULL, true, '{"type":"trainerDefeated","trainerId":"topdresseur-gael"}'::jsonb, NULL
FROM "trainers" a JOIN "content_versions" cv ON cv."id" = a."content_version_id"
WHERE a."id" = 'topdresseuse-vanessa' AND cv."status" IN ('published', 'draft')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "trainers" t
SET "unlock" = '{"type":"allOf","conditions":[{"type":"badgeCount","count":8,"regionId":"hoenn"},{"type":"trainerDefeated","trainerId":"dompteur-ronan"}]}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft')
  AND t."id" = 'damien' AND t."unlock" = '{"type":"allOf","conditions":[{"type":"badgeCount","count":8,"regionId":"hoenn"},{"type":"trainerDefeated","trainerId":"topdresseuse-vanessa"}]}'::jsonb
  AND EXISTS (SELECT 1 FROM "trainers" n WHERE n."content_version_id" = t."content_version_id" AND n."id" = 'dompteur-ronan');
