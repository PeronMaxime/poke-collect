CREATE TABLE "chest_entries" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"rarity" text NOT NULL,
	"item_id" text NOT NULL,
	"lot_size" integer NOT NULL,
	"weight" double precision NOT NULL,
	"unlock" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "chest_entries_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "guild_quests" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"rarity" text NOT NULL,
	"objective" jsonb NOT NULL,
	"count_per_member" integer NOT NULL,
	"min_count" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "guild_quests_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "guild_join_requests" (
	"guild_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_join_requests_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "guild_members" (
	"user_id" text PRIMARY KEY NOT NULL,
	"guild_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_quest_contributions" (
	"guild_id" uuid NOT NULL,
	"week" text NOT NULL,
	"slot" smallint NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "guild_quest_contributions_guild_id_week_slot_user_id_pk" PRIMARY KEY("guild_id","week","slot","user_id")
);
--> statement-breakpoint
CREATE TABLE "guild_weekly_quests" (
	"guild_id" uuid NOT NULL,
	"week" text NOT NULL,
	"slot" smallint NOT NULL,
	"quest_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"rarity" text NOT NULL,
	"objective" jsonb NOT NULL,
	"target" integer NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "guild_weekly_quests_guild_id_week_slot_pk" PRIMARY KEY("guild_id","week","slot")
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"join_mode" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "guild_left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chest_entries" ADD CONSTRAINT "chest_entries_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_quests" ADD CONSTRAINT "guild_quests_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_join_requests" ADD CONSTRAINT "guild_join_requests_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_join_requests" ADD CONSTRAINT "guild_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_messages" ADD CONSTRAINT "guild_messages_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_messages" ADD CONSTRAINT "guild_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_quest_contributions" ADD CONSTRAINT "guild_quest_contributions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_quest_contributions" ADD CONSTRAINT "guild_quest_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_weekly_quests" ADD CONSTRAINT "guild_weekly_quests_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guild_join_requests_user" ON "guild_join_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "guild_members_guild" ON "guild_members" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "guild_messages_guild" ON "guild_messages" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guilds_name_lower" ON "guilds" USING btree (lower("name"));--> statement-breakpoint
-- Contenu des guildes, pour toutes les versions de contenu : coffres (objets), catalogue des
-- quêtes hebdomadaires, lots des coffres et réglages d'équilibrage. Ajouts seulement (rien
-- d'existant n'est modifié).
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT v."id", i."id", i."name", i."description", i."icon", i."category", i."rarity", NULL, i."effects"
FROM "content_versions" v
CROSS JOIN (VALUES
  ('guild-chest-bronze', 'Coffre de guilde Bronze', 'Gagné en terminant une quête de guilde. Ouvre-le depuis le sac.', NULL, 'chest', 'uncommon', '[{"type":"guildChest","rarity":"bronze"}]'::jsonb),
  ('guild-chest-silver', 'Coffre de guilde Argent', 'Gagné en terminant une quête de guilde. Ouvre-le depuis le sac.', NULL, 'chest', 'rare', '[{"type":"guildChest","rarity":"silver"}]'::jsonb),
  ('guild-chest-gold', 'Coffre de guilde Or', 'Gagné en terminant une quête de guilde. Ouvre-le depuis le sac.', NULL, 'chest', 'epic', '[{"type":"guildChest","rarity":"gold"}]'::jsonb)
) AS i("id", "name", "description", "icon", "category", "rarity", "effects")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "guild_quests" ("content_version_id", "id", "name", "description", "rarity", "objective", "count_per_member", "min_count", "enabled")
SELECT v."id", q."id", q."name", q."description", q."rarity", q."objective", q."count_per_member", q."min_count", true
FROM "content_versions" v
CROSS JOIN (VALUES
  ('captures', 'Grande collecte', 'Capturez des Pokémon, de toutes les espèces.', 'bronze', '{"type":"catchPokemon","pokemonType":null}'::jsonb, 25, 50),
  ('expeditions', 'En route !', 'Récupérez des expéditions.', 'bronze', '{"type":"expeditions"}'::jsonb, 8, 15),
  ('eclosions', 'Couvée de la semaine', 'Faites éclore des œufs.', 'bronze', '{"type":"eggsHatched"}'::jsonb, 3, 5),
  ('captures-normal', 'Pokémon du quotidien', 'Capturez des Pokémon de type Normal.', 'bronze', '{"type":"catchPokemon","pokemonType":"normal"}'::jsonb, 8, 15),
  ('combats', 'Esprit de compétition', 'Gagnez des combats de dresseurs.', 'silver', '{"type":"battlesWon"}'::jsonb, 4, 8),
  ('captures-eau', 'Pêche miraculeuse', 'Capturez des Pokémon de type Eau.', 'silver', '{"type":"catchPokemon","pokemonType":"water"}'::jsonb, 10, 20),
  ('captures-plante', 'Main verte', 'Capturez des Pokémon de type Plante.', 'silver', '{"type":"catchPokemon","pokemonType":"grass"}'::jsonb, 10, 20),
  ('captures-feu', 'Feu de camp', 'Capturez des Pokémon de type Feu.', 'silver', '{"type":"catchPokemon","pokemonType":"fire"}'::jsonb, 6, 12),
  ('argent', 'Trésor de guerre', 'Gagnez des Poké Dollars en combat de dresseur et en donjon.', 'silver', '{"type":"moneyEarned"}'::jsonb, 3000, 6000),
  ('donjons', 'Expédition souterraine', 'Réussissez des donjons.', 'gold', '{"type":"dungeonsWon"}'::jsonb, 2, 4),
  ('grande-chasse', 'Grande chasse', 'Capturez énormément de Pokémon.', 'gold', '{"type":"catchPokemon","pokemonType":null}'::jsonb, 80, 150),
  ('marathon', 'Marathon', 'Récupérez un grand nombre d’expéditions.', 'gold', '{"type":"expeditions"}'::jsonb, 25, 50)
) AS q("id", "name", "description", "rarity", "objective", "count_per_member", "min_count")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "chest_entries" ("content_version_id", "id", "rarity", "item_id", "lot_size", "weight", "unlock", "enabled")
SELECT v."id", e."id", e."rarity", e."item_id", e."lot_size", e."weight", e."unlock", true
FROM "content_versions" v
CROSS JOIN (VALUES
  ('bronze-poke-ball-x100', 'bronze', 'poke-ball', 100, 30::double precision, '{"type":"always"}'::jsonb),
  ('bronze-great-ball-x50', 'bronze', 'great-ball', 50, 25::double precision, '{"type":"trainerDefeated","trainerId":"pierre"}'::jsonb),
  ('bronze-ultra-ball-x20', 'bronze', 'ultra-ball', 20, 10::double precision, '{"type":"trainerDefeated","trainerId":"ondine"}'::jsonb),
  ('bronze-rare-candy', 'bronze', 'rare-candy', 1, 15::double precision, '{"type":"always"}'::jsonb),
  ('bronze-moon-stone', 'bronze', 'moon-stone', 1, 4::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('bronze-water-stone', 'bronze', 'water-stone', 1, 4::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('bronze-thunder-stone', 'bronze', 'thunder-stone', 1, 4::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('bronze-fire-stone', 'bronze', 'fire-stone', 1, 4::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('bronze-leaf-stone', 'bronze', 'leaf-stone', 1, 4::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('silver-great-ball-x50', 'silver', 'great-ball', 50, 20::double precision, '{"type":"always"}'::jsonb),
  ('silver-ultra-ball-x20', 'silver', 'ultra-ball', 20, 20::double precision, '{"type":"trainerDefeated","trainerId":"ondine"}'::jsonb),
  ('silver-rare-candy-x3', 'silver', 'rare-candy', 3, 15::double precision, '{"type":"always"}'::jsonb),
  ('silver-moon-stone', 'silver', 'moon-stone', 1, 3::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('silver-water-stone', 'silver', 'water-stone', 1, 3::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('silver-thunder-stone', 'silver', 'thunder-stone', 1, 3::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('silver-fire-stone', 'silver', 'fire-stone', 1, 3::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('silver-leaf-stone', 'silver', 'leaf-stone', 1, 3::double precision, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb),
  ('silver-sun-stone', 'silver', 'sun-stone', 1, 2::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('silver-dawn-stone', 'silver', 'dawn-stone', 1, 2::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('silver-dusk-stone', 'silver', 'dusk-stone', 1, 2::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('silver-shiny-stone', 'silver', 'shiny-stone', 1, 2::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('silver-ice-stone', 'silver', 'ice-stone', 1, 2::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('silver-destiny-knot', 'silver', 'destiny-knot', 1, 6::double precision, '{"type":"eggsHatched","count":10}'::jsonb),
  ('silver-bottle-cap', 'silver', 'bottle-cap', 1, 6::double precision, '{"type":"trainerDefeated","trainerId":"olga"}'::jsonb),
  ('silver-adamant-mint', 'silver', 'adamant-mint', 1, 1.5::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('silver-modest-mint', 'silver', 'modest-mint', 1, 1.5::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('silver-jolly-mint', 'silver', 'jolly-mint', 1, 1.5::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('silver-timid-mint', 'silver', 'timid-mint', 1, 1.5::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('silver-bold-mint', 'silver', 'bold-mint', 1, 1.5::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('silver-calm-mint', 'silver', 'calm-mint', 1, 1.5::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('gold-ultra-ball-x20', 'gold', 'ultra-ball', 20, 20::double precision, '{"type":"always"}'::jsonb),
  ('gold-rare-candy-x5', 'gold', 'rare-candy', 5, 20::double precision, '{"type":"always"}'::jsonb),
  ('gold-master-ball', 'gold', 'master-ball', 1, 5::double precision, '{"type":"badgeCount","count":8}'::jsonb),
  ('gold-destiny-knot', 'gold', 'destiny-knot', 1, 8::double precision, '{"type":"eggsHatched","count":10}'::jsonb),
  ('gold-bottle-cap', 'gold', 'bottle-cap', 1, 10::double precision, '{"type":"trainerDefeated","trainerId":"olga"}'::jsonb),
  ('gold-gold-bottle-cap', 'gold', 'gold-bottle-cap', 1, 3::double precision, '{"type":"trainerDefeated","trainerId":"maitre-blue"}'::jsonb),
  ('gold-adamant-mint', 'gold', 'adamant-mint', 1, 2::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('gold-modest-mint', 'gold', 'modest-mint', 1, 2::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('gold-jolly-mint', 'gold', 'jolly-mint', 1, 2::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('gold-timid-mint', 'gold', 'timid-mint', 1, 2::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('gold-bold-mint', 'gold', 'bold-mint', 1, 2::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('gold-calm-mint', 'gold', 'calm-mint', 1, 2::double precision, '{"type":"badgeCount","count":2}'::jsonb),
  ('gold-moon-stone', 'gold', 'moon-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('gold-water-stone', 'gold', 'water-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('gold-thunder-stone', 'gold', 'thunder-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('gold-fire-stone', 'gold', 'fire-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('gold-leaf-stone', 'gold', 'leaf-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('gold-sun-stone', 'gold', 'sun-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('gold-dawn-stone', 'gold', 'dawn-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('gold-dusk-stone', 'gold', 'dusk-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('gold-shiny-stone', 'gold', 'shiny-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb),
  ('gold-ice-stone', 'gold', 'ice-stone', 1, 1::double precision, '{"type":"speciesCaught","count":60}'::jsonb)
) AS e("id", "rarity", "item_id", "lot_size", "weight", "unlock")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "balance_settings"
SET "data" = jsonb_set("data", '{guilds}', '{"creationCost":100000,"maxMembers":30,"rejoinCooldownHours":24,"weeklyQuests":{"bronze":2,"silver":2,"gold":1},"chestRolls":{"bronze":1,"silver":2,"gold":3}}'::jsonb)
WHERE NOT ("data" ? 'guilds');
