CREATE TYPE "public"."battle_outcome" AS ENUM('win', 'loss');--> statement-breakpoint
CREATE TABLE "trainers" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"region_id" text NOT NULL,
	"zone_id" text,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"trainer_class" text NOT NULL,
	"sprite" text,
	"team" jsonb NOT NULL,
	"duration_minutes" integer,
	"rules" jsonb NOT NULL,
	"money" integer NOT NULL,
	"loot_table_id" text,
	"loot_rolls" integer NOT NULL,
	"badge" jsonb,
	"repeatable" boolean NOT NULL,
	"cooldown_minutes" integer,
	"ko_minutes" integer,
	"unlock" jsonb NOT NULL,
	CONSTRAINT "trainers_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "trainer_battles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trainer_id" text NOT NULL,
	"slot_index" smallint NOT NULL,
	"team" jsonb NOT NULL,
	"content_version_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"seed" bigint NOT NULL,
	"claimed_at" timestamp with time zone,
	"outcome" "battle_outcome",
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "trainer_progress" (
	"owner_id" text NOT NULL,
	"trainer_id" text NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"first_win_at" timestamp with time zone,
	"last_win_at" timestamp with time zone,
	CONSTRAINT "trainer_progress_owner_id_trainer_id_pk" PRIMARY KEY("owner_id","trainer_id")
);
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "ko_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_battles" ADD CONSTRAINT "trainer_battles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_battles" ADD CONSTRAINT "trainer_battles_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_progress" ADD CONSTRAINT "trainer_progress_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trainer_battles_owner_claimed" ON "trainer_battles" USING btree ("owner_id","claimed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trainer_battles_owner_slot_active" ON "trainer_battles" USING btree ("owner_id","slot_index") WHERE "trainer_battles"."claimed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "trainer_battles_owner_trainer_active" ON "trainer_battles" USING btree ("owner_id","trainer_id") WHERE "trainer_battles"."claimed_at" is null;--> statement-breakpoint
-- Données : réglages de combat ajoutés aux versions existantes (valeurs déjà présentes conservées).
UPDATE "balance_settings" SET "data" = jsonb_set(
	"data",
	'{battles}',
	'{"initialSlots":1,"maxSlots":3,"maxTeamSize":6,"defaultDurationMinutes":10,"winCurveSteepness":5.4,"minWinChance":0.05,"maxWinChance":0.95,"typeAdvantageWeight":0.1,"defaultTrainerIv":15,"koMinutes":60,"cooldownMinutes":240,"xpMultiplier":1,"lossXpFraction":0.25,"happinessOnWin":3,"happinessOnLoss":-2}'::jsonb || coalesce("data"->'battles', '{}'::jsonb)
);--> statement-breakpoint
-- Dresseurs du contenu de test, ajoutés aux versions existantes qui ne les ont pas
-- (seulement si leurs références existent dans la version).
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'gamin-tom', 'kanto', 'route-1', 0, 'Tom', 'Gamin', 'https://play.pokemonshowdown.com/sprites/trainers/youngster.png', '[{"speciesId":19,"level":4,"iv":null,"nature":null}]'::jsonb, 10, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 80, 'butin-route', 1, NULL, true, NULL, NULL, '{"type":"always"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "zones" x WHERE x."content_version_id" = v."id" AND x."id" = 'route-1')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'fillette-lise', 'kanto', 'route-1', 1, 'Lise', 'Fillette', 'https://play.pokemonshowdown.com/sprites/trainers/lass.png', '[{"speciesId":16,"level":4,"iv":null,"nature":null},{"speciesId":29,"level":5,"iv":null,"nature":null}]'::jsonb, 15, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 120, 'butin-route', 1, NULL, true, NULL, NULL, '{"type":"trainerDefeated","trainerId":"gamin-tom"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "zones" x WHERE x."content_version_id" = v."id" AND x."id" = 'route-1')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'scout-rick', 'kanto', 'foret-de-jade', 2, 'Rick', 'Scout', 'https://play.pokemonshowdown.com/sprites/trainers/bugcatcher.png', '[{"speciesId":10,"level":6,"iv":null,"nature":null},{"speciesId":13,"level":6,"iv":null,"nature":null},{"speciesId":14,"level":7,"iv":null,"nature":null}]'::jsonb, 20, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 180, 'butin-foret', 2, NULL, true, NULL, NULL, '{"type":"regionDexPercent","regionId":"kanto","percent":3}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "zones" x WHERE x."content_version_id" = v."id" AND x."id" = 'foret-de-jade')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'pierre', 'kanto', NULL, 3, 'Pierre', 'Champion d’arène', 'https://play.pokemonshowdown.com/sprites/trainers/brock.png', '[{"speciesId":74,"level":12,"iv":null,"nature":null},{"speciesId":95,"level":14,"iv":null,"nature":null}]'::jsonb, 60, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 1200, 'butin-grotte', 3, '{"name":"Badge Roche","image":null}'::jsonb, false, NULL, NULL, '{"type":"trainerDefeated","trainerId":"scout-rick"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'campeur-leo', 'kanto', 'mont-selenite', 4, 'Léo', 'Campeur', 'https://play.pokemonshowdown.com/sprites/trainers/camper.png', '[{"speciesId":27,"level":10,"iv":null,"nature":null},{"speciesId":23,"level":11,"iv":null,"nature":null}]'::jsonb, 30, '{"teamSize":null,"maxLevel":15,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 300, 'butin-grotte', 2, NULL, true, NULL, NULL, '{"type":"badgeCount","count":1}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "zones" x WHERE x."content_version_id" = v."id" AND x."id" = 'mont-selenite')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'ondine', 'kanto', NULL, 5, 'Ondine', 'Championne d’arène', 'https://play.pokemonshowdown.com/sprites/trainers/misty.png', '[{"speciesId":120,"level":18,"iv":null,"nature":null},{"speciesId":121,"level":21,"iv":null,"nature":null}]'::jsonb, 60, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":250}'::jsonb, 2100, 'butin-mer', 3, '{"name":"Badge Cascade","image":null}'::jsonb, false, NULL, 120, '{"type":"badgeCount","count":1}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
ON CONFLICT DO NOTHING;
