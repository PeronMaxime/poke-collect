-- Dresseurs de quêtes dans les autres quêtes : un combat contre un dresseur propre à l'histoire,
-- inséré dans chaque quête (après l'étape qui ouvre sa zone). Toutes les versions de contenu qui
-- ont la quête ; l'étape n'est insérée que si la quête est encore telle que prévue (même nombre
-- d'étapes, même étape à cet endroit) et ne demande pas déjà ce dresseur.
-- Les joueurs déjà arrivés à cette étape (ou plus loin, quête terminée comprise) avancent d'un
-- cran : ils n'ont pas à affronter le nouveau dresseur et ne perdent rien de leur avancement
-- (seulement si la version publiée reçoit l'étape).
--> statement-breakpoint
-- L’oiseau des glaces (artikodin) : Skieuse Neige, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-artikodin-neige', 'kanto', 'iles-ecume', 101, 'Neige', 'Skieuse', '/api/sprites/trainers/skier.png', '[{"speciesId":87,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":91,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":124,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":55,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":121,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":131,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'artikodin'
FROM "quests" q
WHERE q."id" = 'artikodin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'artikodin' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'artikodin' AND jsonb_array_length(q."steps") = 4 AND q."steps"->2->>'name' = 'Le chant de Lokhlass' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-artikodin-neige"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"La skieuse des glaces","description":"Une skieuse garde l’entrée de la grotte gelée des Îles Écume et repousse les curieux : bats Neige (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-artikodin-neige"},"outcome":"« Tu as du cran, pour venir jusqu’ici. » Neige caresse son Lokhlass : « Lui seul retrouve l’oiseau dans le blizzard : son chant porte jusqu’au cœur de la tempête. Capture le tien, et écoute-le. »"}'::jsonb)
WHERE "id" = 'artikodin' AND jsonb_array_length("steps") = 4 AND "steps"->2->>'name' = 'Le chant de Lokhlass' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-artikodin-neige"}}]'::jsonb;
--> statement-breakpoint
-- L’oiseau de feu (sulfura) : Cracheur de feu Pyros, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-sulfura-pyros', 'kanto', 'mont-braise', 102, 'Pyros', 'Cracheur de feu', '/api/sprites/trainers/biker.png', '[{"speciesId":78,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":38,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":136,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":76,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":126,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":59,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'sulfura'
FROM "quests" q
WHERE q."id" = 'sulfura'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'sulfura' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'sulfura' AND jsonb_array_length(q."steps") = 4 AND q."steps"->2->>'name' = 'Cendres ardentes' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-sulfura-pyros"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"Le cracheur de feu","description":"Un cracheur de feu s’est installé sur les pentes du Mont Braise et prétend que le volcan lui appartient : bats Pyros (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-sulfura-pyros"},"outcome":"« Le volcan n’a jamais été aussi froid… même mes flammes faiblissent. » Pyros lève les yeux vers le cratère : « Les jours de grand soleil, des cendres brûlantes tombent du sommet. Ramasse-les, elles te diront qui vit là-haut. »"}'::jsonb)
WHERE "id" = 'sulfura' AND jsonb_array_length("steps") = 4 AND "steps"->2->>'name' = 'Cendres ardentes' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-sulfura-pyros"}}]'::jsonb;
--> statement-breakpoint
-- Le Pokémon génétique (mewtwo) : Généticien Kessler, étape 4.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-mewtwo-kessler', 'kanto', 'grotte-azuree', 103, 'Kessler', 'Généticien', '/api/sprites/trainers/supernerd.png', '[{"speciesId":65,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":97,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":110,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":103,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":122,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":132,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'mewtwo'
FROM "quests" q
WHERE q."id" = 'mewtwo'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'mewtwo' AND "step" >= 3
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'mewtwo' AND jsonb_array_length(q."steps") = 4 AND q."steps"->3->>'name' = 'Le reflet' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-mewtwo-kessler"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{3}', '{"name":"Le créateur","description":"Au fond de la Grotte Azurée, un ancien chercheur du Manoir Pokémon veut reprendre sa créature : bats Kessler (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-mewtwo-kessler"},"outcome":"« Je voulais seulement le ramener… Il ne m’a jamais pardonné. » Kessler te tend un flacon vide : « Mewtwo ne se montre à personne, mais il ne résiste pas à sa propre image. Un Métamorph pourrait la lui renvoyer. »"}'::jsonb)
WHERE "id" = 'mewtwo' AND jsonb_array_length("steps") = 4 AND "steps"->3->>'name' = 'Le reflet' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-mewtwo-kessler"}}]'::jsonb;
--> statement-breakpoint
-- Le Pokémon fabuleux (mew) : Exploratrice Célia, étape 4.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-mew-celia', 'kanto', 'ile-lointaine', 104, 'Célia', 'Exploratrice', '/api/sprites/trainers/picnicker-gen3.png', '[{"speciesId":149,"formId":null,"level":78,"iv":31,"nature":null},{"speciesId":143,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":59,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":121,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":65,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":115,"formId":null,"level":75,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'mew'
FROM "quests" q
WHERE q."id" = 'mew'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'mew' AND "step" >= 3
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'mew' AND jsonb_array_length(q."steps") = 4 AND q."steps"->3->>'name' = 'Jeu de miroirs' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-mew-celia"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{3}', '{"name":"La rivale de l’île","description":"Une exploratrice a suivi la bulle rose jusqu’ici et compte bien la capturer la première : bats Célia (quête) sur l’Île Lointaine.","condition":{"type":"trainerDefeated","trainerId":"quete-mew-celia"},"outcome":"« Elle m’a filé entre les doigts trois fois… Elle adore qu’on joue avec elle, pas qu’on la chasse. » Célia rembarque bredouille. La bulle rose, elle, revient flotter près de toi."}'::jsonb)
WHERE "id" = 'mew' AND jsonb_array_length("steps") = 4 AND "steps"->3->>'name' = 'Jeu de miroirs' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-mew-celia"}}]'::jsonb;
--> statement-breakpoint
-- L’oiseau au regard glacial (artikodin-galar) : Médium Sélène, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-artikodin-galar-selene', 'kanto', 'route-victoire', 105, 'Sélène', 'Médium', '/api/sprites/trainers/medium.png', '[{"speciesId":65,"formId":null,"level":78,"iv":31,"nature":null},{"speciesId":97,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":124,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":122,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":80,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":94,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'artikodin-galar'
FROM "quests" q
WHERE q."id" = 'artikodin-galar'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'artikodin-galar' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'artikodin-galar' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'Sur sa piste' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-artikodin-galar-selene"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"La médium hypnotisée","description":"Sur la Route Victoire, une médium tombée sous l’emprise de l’oiseau attaque tous ceux qui approchent : bats Sélène (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-artikodin-galar-selene"},"outcome":"Sélène vacille, puis rouvre des yeux clairs : « Il m’a plongée dans un rêve… » Elle frissonne : « Il ne chasse que la nuit, et seuls les esprits solides lui résistent. »"}'::jsonb)
WHERE "id" = 'artikodin-galar' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'Sur sa piste' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-artikodin-galar-selene"}}]'::jsonb;
--> statement-breakpoint
-- L’oiseau aux pas de feu (electhor-galar) : Karatéka Kenzo, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-electhor-galar-kenzo', 'kanto', 'dojo-karate', 106, 'Kenzo', 'Karatéka', '/api/sprites/trainers/blackbelt.png', '[{"speciesId":57,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":62,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":107,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":106,"formId":null,"level":78,"iv":31,"nature":null},{"speciesId":68,"formId":null,"level":79,"iv":31,"nature":null}]'::jsonb, 210, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'electhor-galar'
FROM "quests" q
WHERE q."id" = 'electhor-galar'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'electhor-galar' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'electhor-galar' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'La course' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-electhor-galar-kenzo"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"Le meilleur élève","description":"Au Dojo Karaté, le meilleur élève veut rattraper l’oiseau lui-même et refuse de te laisser passer : bats Kenzo (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-electhor-galar-kenzo"},"outcome":"« Je ne l’ai jamais rattrapé… ses pas brûlent le sol. » Kenzo s’incline : « Il ne court qu’après les plus rapides. Le Kicklee du dojo, peut-être… »"}'::jsonb)
WHERE "id" = 'electhor-galar' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'La course' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-electhor-galar-kenzo"}}]'::jsonb;
--> statement-breakpoint
-- L’oiseau aux flammes sombres (sulfura-galar) : Exorciste Ambre, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-sulfura-galar-ambre', 'kanto', 'tour-pokemon', 107, 'Ambre', 'Exorciste', '/api/sprites/trainers/channeler-gen3.png', '[{"speciesId":94,"formId":null,"level":79,"iv":31,"nature":null},{"speciesId":93,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":110,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":42,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":89,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":24,"formId":null,"level":76,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'sulfura-galar'
FROM "quests" q
WHERE q."id" = 'sulfura-galar'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'sulfura-galar' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'sulfura-galar' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'La flamme noire' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-sulfura-galar-ambre"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"L’exorciste de la tour","description":"L’exorciste de la Tour Pokémon veut chasser elle-même la flamme noire de Lavanville et voit en toi une rivale : bats Ambre (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-sulfura-galar-ambre"},"outcome":"« Mes prières ne l’atteignent pas… » Ambre soupire : « La flamme noire se nourrit de la rancœur des nuits de pluie. C’est là qu’elle se montrera. »"}'::jsonb)
WHERE "id" = 'sulfura-galar' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'La flamme noire' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-sulfura-galar-ambre"}}]'::jsonb;
--> statement-breakpoint
-- La bête du tonnerre (raikou) : Chasseur de légendes Kanji, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-raikou-kanji', 'johto', 'tour-cendree', 108, 'Kanji', 'Chasseur de légendes', '/api/sprites/trainers/acetrainer-gen4.png', '[{"speciesId":181,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":171,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":229,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":212,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":248,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":197,"formId":null,"level":74,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'raikou'
FROM "quests" q
WHERE q."id" = 'raikou'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'raikou' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'raikou' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'Le sous-sol de la tour' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-raikou-kanji"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"Le chasseur de légendes","description":"Un chasseur de légendes a posé ses pièges autour de la Tour Cendrée et ne veut pas de concurrent : bats Kanji (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-raikou-kanji"},"outcome":"« Trop lent, encore une fois… » Kanji montre les traces calcinées au pied de la tour : « Il revient toujours là où il est né. Mais pour l’approcher, il te faudra des Pokémon aussi vifs que la foudre. »"}'::jsonb)
WHERE "id" = 'raikou' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'Le sous-sol de la tour' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-raikou-kanji"}}]'::jsonb;
--> statement-breakpoint
-- La bête du volcan (entei) : Montagnard Roc, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-entei-roc', 'johto', 'mont-creuset', 109, 'Roc', 'Montagnard', '/api/sprites/trainers/hiker-gen3.png', '[{"speciesId":157,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":229,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":219,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":232,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":208,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":185,"formId":null,"level":74,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'entei'
FROM "quests" q
WHERE q."id" = 'entei'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'entei' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'entei' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'Le brasier' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-entei-roc"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"Le gardien du Mont Creuset","description":"Un montagnard qui vit au pied du Mont Creuset barre la route aux dresseurs trop peu préparés : bats Roc (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-entei-roc"},"outcome":"« Pas mal, pour quelqu’un d’en bas. » Roc essuie la suie de son front : « La montagne gronde depuis des jours. Si tu montes, prends des Pokémon Feu : eux seuls supporteront la chaleur du brasier. »"}'::jsonb)
WHERE "id" = 'entei' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'Le brasier' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-entei-roc"}}]'::jsonb;
--> statement-breakpoint
-- La bête des aurores (suicune) : Pêcheur Ruben, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-suicune-ruben', 'johto', 'lac-colere', 110, 'Ruben', 'Pêcheur', '/api/sprites/trainers/fisherman-gen3.png', '[{"speciesId":160,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":171,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":199,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":195,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":224,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":230,"formId":null,"level":77,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'suicune'
FROM "quests" q
WHERE q."id" = 'suicune'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'suicune' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'suicune' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'Sur le lac' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-suicune-ruben"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"Le pêcheur du lac","description":"Depuis que l’eau du Lac Colère est redevenue pure, un pêcheur la protège farouchement : bats Ruben (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-suicune-ruben"},"outcome":"« Tu n’es pas venu salir le lac, je le vois bien. » Ruben range sa canne : « La bête court sur l’eau les nuits de lune. Viens avec des Pokémon Eau solides : ils sentiront sa trace. »"}'::jsonb)
WHERE "id" = 'suicune' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'Sur le lac' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-suicune-ruben"}}]'::jsonb;
--> statement-breakpoint
-- Le gardien des mers (lugia) : Admin Rocket Corbin, étape 4.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-lugia-corbin', 'johto', 'tourb-iles', 111, 'Corbin', 'Admin Rocket', '/api/sprites/trainers/rocketgrunt.png', '[{"speciesId":229,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":198,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":169,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":215,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":197,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":248,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'lugia'
FROM "quests" q
WHERE q."id" = 'lugia'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'lugia' AND "step" >= 3
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'lugia' AND jsonb_array_length(q."steps") = 4 AND q."steps"->3->>'name' = 'Les profondeurs' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-lugia-corbin"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{3}', '{"name":"Les pillards des tourbillons","description":"La Team Rocket veut capturer le gardien des mers pendant son sommeil : bats l’Admin Corbin (quête) aux Tourb’Îles.","condition":{"type":"trainerDefeated","trainerId":"quete-lugia-corbin"},"outcome":"Corbin bat en retraite en jurant : « Le boss voulait cette cloche pour réveiller la bête une nuit, quand personne ne regarde. » Au fond de la grotte, les tourbillons grondent : à toi de le faire avant eux."}'::jsonb)
WHERE "id" = 'lugia' AND jsonb_array_length("steps") = 4 AND "steps"->3->>'name' = 'Les profondeurs' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-lugia-corbin"}}]'::jsonb;
--> statement-breakpoint
-- L’oiseau arc-en-ciel (ho-oh) : Grand Sage Hô, étape 4.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-ho-oh-ho', 'johto', 'tour-carillon', 112, 'Hô', 'Grand Sage', '/api/sprites/trainers/sage.png', '[{"speciesId":178,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":164,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":196,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":203,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":227,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":242,"formId":null,"level":77,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'ho-oh'
FROM "quests" q
WHERE q."id" = 'ho-oh'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'ho-oh' AND "step" >= 3
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'ho-oh' AND jsonb_array_length(q."steps") = 4 AND q."steps"->3->>'name' = 'Le sommet de la tour' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-ho-oh-ho"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{3}', '{"name":"L’épreuve du Grand Sage","description":"Avant de te laisser monter au sommet, le Grand Sage de la Tour Carillon veut éprouver ton cœur : bats Hô (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-ho-oh-ho"},"outcome":"« Ton cœur est pur, et tes Pokémon te suivent sans crainte. » Le Grand Sage s’incline : « Ho-Oh se pose sur le toit les jours de soleil. Monte, la tour t’est ouverte. »"}'::jsonb)
WHERE "id" = 'ho-oh' AND jsonb_array_length("steps") = 4 AND "steps"->3->>'name' = 'Le sommet de la tour' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-ho-oh-ho"}}]'::jsonb;
--> statement-breakpoint
-- Le voyageur du temps (celebi) : Braconnier Vasco, étape 4.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-celebi-vasco', 'johto', 'autel-bois-aux-chenes', 113, 'Vasco', 'Braconnier', '/api/sprites/trainers/camper-gen3.png', '[{"speciesId":214,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":212,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":168,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":169,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":189,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":205,"formId":null,"level":75,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'celebi'
FROM "quests" q
WHERE q."id" = 'celebi'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'celebi' AND "step" >= 3
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'celebi' AND jsonb_array_length(q."steps") = 4 AND q."steps"->3->>'name' = 'L’autel' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-celebi-vasco"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{3}', '{"name":"Le braconnier","description":"Un braconnier a tendu des filets autour de l’autel pour attraper le protecteur de la forêt : bats Vasco (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-celebi-vasco"},"outcome":"Vasco s’enfuit en abandonnant ses filets. Les arbres semblent soupirer de soulagement, et le charbonnier te souffle : « Il ne revient que les jours de pluie, quand la forêt boit. »"}'::jsonb)
WHERE "id" = 'celebi' AND jsonb_array_length("steps") = 4 AND "steps"->3->>'name' = 'L’autel' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-celebi-vasco"}}]'::jsonb;
--> statement-breakpoint
-- L’éon au voile rouge (latias) : Nageuse Marina, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-latias-marina', 'hoenn', 'routes-124-128', 114, 'Marina', 'Nageuse', '/api/sprites/trainers/swimmerf-gen3.png', '[{"speciesId":370,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":340,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":272,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":369,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":368,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":350,"formId":null,"level":77,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'latias'
FROM "quests" q
WHERE q."id" = 'latias'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'latias' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'latias' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'Au-dessus des vagues' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-latias-marina"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"La nageuse du large","description":"Une nageuse des Routes 124 à 128 a aperçu le reflet rouge et défie quiconque s’en approche : bats Marina (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-latias-marina"},"outcome":"« D’accord, tu nages mieux que moi… » Marina sourit : « Ce reflet adore les Lovdisc, il les suit partout au-dessus des vagues. Emmènes-en un, et il viendra peut-être jouer avec toi. »"}'::jsonb)
WHERE "id" = 'latias' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'Au-dessus des vagues' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-latias-marina"}}]'::jsonb;
--> statement-breakpoint
-- L’éon au voile bleu (latios) : Ornithologue Faucon, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-latios-faucon', 'hoenn', 'routes-119-120', 115, 'Faucon', 'Ornithologue', '/api/sprites/trainers/birdkeeper-gen3.png', '[{"speciesId":277,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":279,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":357,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":334,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":373,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":330,"formId":null,"level":76,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'latios'
FROM "quests" q
WHERE q."id" = 'latios'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'latios' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'latios' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'Sous la pluie' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-latios-faucon"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"L’ornithologue","description":"Un ornithologue guette le Pokémon bleu depuis des semaines et refuse qu’on lui vole sa découverte : bats Faucon (quête) sur les Routes 119 et 120.","condition":{"type":"trainerDefeated","trainerId":"quete-latios-faucon"},"outcome":"« Rien ne vole plus vite que lui… » Faucon referme son carnet : « On dit qu’il répond aux pensées sincères. Des Pokémon Psy pourraient l’appeler, sous la pluie de la forêt. »"}'::jsonb)
WHERE "id" = 'latios' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'Sous la pluie' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-latios-faucon"}}]'::jsonb;
--> statement-breakpoint
-- Le colosse de roche (regirock) : Archéologue Basalte, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-regirock-basalte', 'hoenn', 'desert-hoenn', 116, 'Basalte', 'Archéologue', '/api/sprites/trainers/hiker-gen4.png', '[{"speciesId":306,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":348,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":346,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":344,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":324,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":297,"formId":null,"level":75,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'regirock'
FROM "quests" q
WHERE q."id" = 'regirock'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'regirock' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'regirock' AND jsonb_array_length(q."steps") = 4 AND q."steps"->2->>'name' = 'La tablette' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-regirock-basalte"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"Le pilleur de ruines","description":"Un archéologue sans scrupules fouille les ruines enfouies et veut garder le géant pour lui : bats Basalte (quête) dans le Désert de la Route 111.","condition":{"type":"trainerDefeated","trainerId":"quete-regirock-basalte"},"outcome":"« Ces ruines m’appartiennent… enfin, m’appartenaient. » Basalte désigne une dalle à moitié enterrée : « La tablette est là-dessous, coincée dans la roche. Seuls des Pokémon Combat pourraient l’en arracher. »"}'::jsonb)
WHERE "id" = 'regirock' AND jsonb_array_length("steps") = 4 AND "steps"->2->>'name' = 'La tablette' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-regirock-basalte"}}]'::jsonb;
--> statement-breakpoint
-- Le colosse d’acier (registeel) : Topdresseuse Ferrine, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-registeel-ferrine', 'hoenn', 'routes-119-120', 117, 'Ferrine', 'Topdresseuse', '/api/sprites/trainers/acetrainerf-gen3.png', '[{"speciesId":303,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":375,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":308,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":302,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":317,"formId":null,"level":74,"iv":31,"nature":null},{"speciesId":376,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'registeel'
FROM "quests" q
WHERE q."id" = 'registeel'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'registeel' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'registeel' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'Le tombeau ancien' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-registeel-ferrine"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"La gardienne du tombeau","description":"Une dresseuse veille sur le tombeau ancien de la Route 120 et en interdit l’entrée : bats Ferrine (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-registeel-ferrine"},"outcome":"« Le géant d’acier ne craint qu’une chose : la chaleur. » Ferrine s’écarte : « Reviens la nuit avec des Pokémon Feu, et les portes s’ouvriront. »"}'::jsonb)
WHERE "id" = 'registeel' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'Le tombeau ancien' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-registeel-ferrine"}}]'::jsonb;
--> statement-breakpoint
-- Le colosse de glace (regice) : Loup de mer Borée, étape 3.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-regice-boree', 'hoenn', 'routes-124-128', 118, 'Borée', 'Loup de mer', '/api/sprites/trainers/sailor.png', '[{"speciesId":365,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":362,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":260,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":364,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":319,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":321,"formId":null,"level":75,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'regice'
FROM "quests" q
WHERE q."id" = 'regice'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'regice' AND "step" >= 2
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'regice' AND jsonb_array_length(q."steps") = 3 AND q."steps"->2->>'name' = 'Le tombeau de l’île' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-regice-boree"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{2}', '{"name":"Le loup de mer","description":"Un vieux loup de mer de Pacifiville connaît l’île du tombeau, mais n’y conduit que ceux qui l’ont battu : bats Borée (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-regice-boree"},"outcome":"« Bien joué, moussaillon. » Borée pointe une île minuscule au large : « Le géant n’en sort que pendant la grêle. Et crois-moi, il déteste la chaleur. »"}'::jsonb)
WHERE "id" = 'regice' AND jsonb_array_length("steps") = 3 AND "steps"->2->>'name' = 'Le tombeau de l’île' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-regice-boree"}}]'::jsonb;
--> statement-breakpoint
-- Le maître des océans (kyogre) : Admin Aqua Abysse, étape 4.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-kyogre-abysse', 'hoenn', 'grotte-sous-marine', 119, 'Abysse', 'Admin Aqua', '/api/sprites/trainers/aquagruntf.png', '[{"speciesId":319,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":342,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":262,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":367,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":279,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":321,"formId":null,"level":76,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'kyogre'
FROM "quests" q
WHERE q."id" = 'kyogre'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'kyogre' AND "step" >= 3
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'kyogre' AND jsonb_array_length(q."steps") = 4 AND q."steps"->3->>'name' = 'Pluies diluviennes' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-kyogre-abysse"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{3}', '{"name":"L’embuscade de la Team Aqua","description":"La Team Aqua t’a suivi jusqu’au fond de la grotte et réclame l’Orbe Bleu : bats l’Admin Abysse (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-kyogre-abysse"},"outcome":"Abysse recule, furieuse : « Garde-le, ton Orbe ! Le chef dit que Kyogre ne s’éveille que sous un déluge… et qu’il ne craint que la foudre. » Elle disparaît dans l’eau noire."}'::jsonb)
WHERE "id" = 'kyogre' AND jsonb_array_length("steps") = 4 AND "steps"->3->>'name' = 'Pluies diluviennes' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-kyogre-abysse"}}]'::jsonb;
--> statement-breakpoint
-- Le maître des continents (groudon) : Admin Magma Fumerol, étape 4.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-groudon-fumerol', 'hoenn', 'grotte-originelle', 120, 'Fumerol', 'Admin Magma', '/api/sprites/trainers/magmagrunt.png', '[{"speciesId":323,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":324,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":262,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":330,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":336,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":344,"formId":null,"level":75,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'groudon'
FROM "quests" q
WHERE q."id" = 'groudon'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'groudon' AND "step" >= 3
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'groudon' AND jsonb_array_length(q."steps") = 4 AND q."steps"->3->>'name' = 'Le cœur de la grotte' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-groudon-fumerol"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{3}', '{"name":"L’embuscade de la Team Magma","description":"La Team Magma veut reprendre l’Orbe Rouge avant que tu n’atteignes le cœur de la grotte : bats l’Admin Fumerol (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-groudon-fumerol"},"outcome":"« Rien ne peut arrêter Groudon ! » Battu, Fumerol s’enfuit vers la sortie en toussant : « Rien… sauf l’eau, peut-être. » Derrière lui, le magma bouillonne de plus belle."}'::jsonb)
WHERE "id" = 'groudon' AND jsonb_array_length("steps") = 4 AND "steps"->3->>'name' = 'Le cœur de la grotte' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-groudon-fumerol"}}]'::jsonb;
--> statement-breakpoint
-- Le gardien du ciel (rayquaza) : Gardienne du Pilier Zéphyra, étape 5.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-rayquaza-zephyra', 'hoenn', 'pilier-celeste', 121, 'Zéphyra', 'Gardienne du Pilier', '/api/sprites/trainers/acetrainerf.png', '[{"speciesId":373,"formId":null,"level":79,"iv":31,"nature":null},{"speciesId":334,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":330,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":350,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":357,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":376,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 20000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'rayquaza'
FROM "quests" q
WHERE q."id" = 'rayquaza'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'rayquaza' AND "step" >= 4
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'rayquaza' AND jsonb_array_length(q."steps") = 5 AND q."steps"->4->>'name' = 'Le sommet du pilier' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-rayquaza-zephyra"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{4}', '{"name":"La gardienne du pilier","description":"La petite-fille de l’ancienne des Chutes Météore garde la dernière volée de marches du Pilier Céleste : bats Zéphyra (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-rayquaza-zephyra"},"outcome":"« Grand-mère avait raison à ton sujet. » Zéphyra t’ouvre la dernière porte : « Le gardien du ciel ne craint ni le feu ni la foudre, mais la glace le fait plier. Monte quand la grêle tombera. »"}'::jsonb)
WHERE "id" = 'rayquaza' AND jsonb_array_length("steps") = 5 AND "steps"->4->>'name' = 'Le sommet du pilier' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-rayquaza-zephyra"}}]'::jsonb;
--> statement-breakpoint
-- L’étoile des vœux (jirachi) : Astronome Stella, étape 4.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-jirachi-stella', 'hoenn', 'chutes-meteore', 122, 'Stella', 'Astronome', '/api/sprites/trainers/lass-gen4.png', '[{"speciesId":282,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":344,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":337,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":338,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":358,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":376,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'jirachi'
FROM "quests" q
WHERE q."id" = 'jirachi'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'jirachi' AND "step" >= 3
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'jirachi' AND jsonb_array_length(q."steps") = 4 AND q."steps"->3->>'name' = 'Le vœu' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-jirachi-stella"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{3}', '{"name":"L’astronome","description":"Une astronome a suivi la comète jusqu’aux Chutes Météore et veut garder le cocon de lumière pour elle : bats Stella (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-jirachi-stella"},"outcome":"« Je voulais seulement lui demander de faire revenir la comète… » Stella range sa lunette : « Il lui faut des compagnons forts pour s’éveiller tout à fait. Reste près de lui, et il viendra à toi. »"}'::jsonb)
WHERE "id" = 'jirachi' AND jsonb_array_length("steps") = 4 AND "steps"->3->>'name' = 'Le vœu' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-jirachi-stella"}}]'::jsonb;
--> statement-breakpoint
-- Le visiteur de l’espace (deoxys) : Chercheur spatial Orion, étape 4.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-deoxys-orion', 'hoenn', 'ile-aurore', 123, 'Orion', 'Chercheur spatial', '/api/sprites/trainers/scientist.png', '[{"speciesId":359,"formId":null,"level":80,"iv":31,"nature":null},{"speciesId":302,"formId":null,"level":79,"iv":31,"nature":null},{"speciesId":344,"formId":null,"level":79,"iv":31,"nature":null},{"speciesId":282,"formId":null,"level":80,"iv":31,"nature":null},{"speciesId":373,"formId":null,"level":81,"iv":31,"nature":null},{"speciesId":376,"formId":null,"level":82,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 20000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'deoxys'
FROM "quests" q
WHERE q."id" = 'deoxys'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quest_progress" SET "step" = "step" + 1
WHERE "quest_id" = 'deoxys' AND "step" >= 3
  AND EXISTS (
    SELECT 1 FROM "quests" q JOIN "content_versions" v ON v."id" = q."content_version_id"
    WHERE v."status" = 'published' AND q."id" = 'deoxys' AND jsonb_array_length(q."steps") = 4 AND q."steps"->3->>'name' = 'La pyramide' AND NOT q."steps" @> '[{"condition":{"trainerId":"quete-deoxys-orion"}}]'::jsonb
  );
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_insert("steps", '{3}', '{"name":"Le chercheur de la Station","description":"Un chercheur de la Station Spatiale veut ramener l’être venu de l’espace dans son laboratoire : bats Orion (quête) sur l’Île Aurore.","condition":{"type":"trainerDefeated","trainerId":"quete-deoxys-orion"},"outcome":"« Ses ondes brouillent tout ce qui pense… mes Pokémon n’ont rien pu faire. » Orion range ses instruments : « Seuls des Pokémon Ténèbres garderaient l’esprit clair face à lui, la nuit, quand l’aurore s’allume. »"}'::jsonb)
WHERE "id" = 'deoxys' AND jsonb_array_length("steps") = 4 AND "steps"->3->>'name' = 'La pyramide' AND NOT "steps" @> '[{"condition":{"trainerId":"quete-deoxys-orion"}}]'::jsonb;
