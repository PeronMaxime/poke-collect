ALTER TABLE "trainers" ADD COLUMN "quest_id" text;
--> statement-breakpoint
-- Dresseurs de quêtes : réservés à une étape de leur quête, ils n'apparaissent qu'une fois l'étape
-- atteinte et ne se battent qu'une fois. Plus de Champion à battre dans les étapes : l'étape
-- « Le conseil du Major » (Major Bob) de la quête d'Électhor devient un combat contre Volt,
-- scientifique de la Team Rocket. Toutes les versions de contenu qui ont cette quête ; l'étape
-- n'est remplacée que si elle demande encore Major Bob.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "time_limit_seconds", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "enabled", "unlock", "quest_id")
SELECT q."content_version_id", 'quete-electhor-volt', 'kanto', 'centrale', 100, 'Volt', 'Scientifique Rocket', '/api/sprites/trainers/scientist.png', '[{"speciesId":82,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":101,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":137,"formId":null,"level":75,"iv":31,"nature":null},{"speciesId":125,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":135,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":26,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb, 240, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, NULL, 0, NULL, false, NULL, true, '{"type":"always"}'::jsonb, 'electhor'
FROM "quests" q
WHERE q."id" = 'electhor'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "quests" SET "steps" = jsonb_set("steps", '{2}', '{"name":"Le saboteur du toit","description":"Sur le toit de la Centrale, un scientifique de la Team Rocket détourne le courant de Kanto vers ses machines : bats Volt (quête).","condition":{"type":"trainerDefeated","trainerId":"quete-electhor-volt"},"outcome":"« Mes machines n’y suffiront jamais… Électhor ne descend recharger ses ailes que sous l’orage ! » Volt s’enfuit en abandonnant ses câbles, et les lumières de Céladopole se rallument. Il ne reste plus qu’à attendre la pluie."}'::jsonb)
WHERE "id" = 'electhor'
  AND "steps"->2->'condition'->>'type' = 'trainerDefeated'
  AND "steps"->2->'condition'->>'trainerId' = 'major-bob';
