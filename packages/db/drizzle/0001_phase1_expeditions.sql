ALTER TYPE "public"."pokemon_origin" ADD VALUE 'starter' BEFORE 'capture';--> statement-breakpoint
CREATE TABLE "items" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text,
	"category" text NOT NULL,
	"rarity" text NOT NULL,
	"effects" jsonb NOT NULL,
	CONSTRAINT "items_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "loot_tables" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"entries" jsonb NOT NULL,
	CONSTRAINT "loot_tables_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "species_overrides" (
	"content_version_id" integer NOT NULL,
	"species_id" integer NOT NULL,
	"enabled" boolean NOT NULL,
	"name_fr" text,
	"habitat" text,
	"rarity" text,
	"breedable" boolean,
	CONSTRAINT "species_overrides_content_version_id_species_id_pk" PRIMARY KEY("content_version_id","species_id")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"region_id" text NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"image" text,
	"habitat" text,
	"min_power" integer NOT NULL,
	"required_types" jsonb NOT NULL,
	"affinity_types" jsonb NOT NULL,
	"durations_minutes" jsonb NOT NULL,
	"encounters" jsonb NOT NULL,
	"loot_table_id" text,
	"unlock" jsonb NOT NULL,
	CONSTRAINT "zones_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "starter_species_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "duration_minutes" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "ball_item_id" text;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "balls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "berry_item_id" text;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "berries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "starter_species_id" integer;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_tables" ADD CONSTRAINT "loot_tables_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_overrides" ADD CONSTRAINT "species_overrides_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expeditions_owner_slot_active" ON "expeditions" USING btree ("owner_id","slot_index") WHERE "expeditions"."claimed_at" is null;--> statement-breakpoint
-- Données : complète les réglages d'équilibrage existants avec les clés ajoutées en phase 1
-- (les valeurs déjà présentes sont conservées ; tout reste modifiable dans l'admin).
UPDATE "balance_settings" SET "data" = jsonb_set(
	"data",
	'{expeditions}',
	'{"maxTeamSize":6,"lootRollsPerHour":2,"minLootRolls":1,"durationExponent":0.9}'::jsonb || ("data"->'expeditions')
);--> statement-breakpoint
UPDATE "balance_settings" SET "data" = '{"capture":{"globalMultiplier":1,"assumedHpFraction":0.5,"affinityBonusPerPokemon":0.1,"hiddenAbilityChance":0.05},"xp":{"multiplier":1,"happinessPerExpedition":2},"newPlayer":{"starterLevel":5,"startingCurrency":0,"startingInventory":[]}}'::jsonb || "data";
