CREATE TABLE "candies" (
	"owner_id" text NOT NULL,
	"lineage_id" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "candies_owner_id_lineage_id_pk" PRIMARY KEY("owner_id","lineage_id")
);
--> statement-breakpoint
DROP INDEX "eggs_owner";--> statement-breakpoint
ALTER TABLE "daycare_slots" ALTER COLUMN "started_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "daycare_slots" ALTER COLUMN "started_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daycare_slots" ADD COLUMN "held_item_a_id" text;--> statement-breakpoint
ALTER TABLE "daycare_slots" ADD COLUMN "held_item_b_id" text;--> statement-breakpoint
ALTER TABLE "eggs" ADD COLUMN "parents" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eggs" ADD COLUMN "mother_index" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eggs" ADD COLUMN "laid_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eggs" ADD COLUMN "hatched_pokemon_id" uuid;--> statement-breakpoint
ALTER TABLE "candies" ADD CONSTRAINT "candies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eggs" ADD CONSTRAINT "eggs_hatched_pokemon_id_pokemon_id_fk" FOREIGN KEY ("hatched_pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eggs_owner_hatched" ON "eggs" USING btree ("owner_id","hatched");--> statement-breakpoint
-- Données : complète les réglages d'équilibrage existants avec les clés ajoutées en phase 2
-- (les valeurs déjà présentes sont conservées ; tout reste modifiable dans l'admin).
UPDATE "balance_settings" SET "data" = jsonb_set(
	"data",
	'{breeding}',
	'{"hatchMinutesPerCounter":2,"eggMinutes":20,"maxEggs":6,"inheritedIvCount":3,"hiddenAbilityInheritChance":0.6,"eggLevel":1}'::jsonb || coalesce("data"->'breeding', '{}'::jsonb)
);--> statement-breakpoint
UPDATE "balance_settings" SET "data" = '{"transfer":{"candiesPerPokemon":1,"shinyBonusCandies":10,"xpPerCandy":500}}'::jsonb || "data";--> statement-breakpoint
-- Objets d'élevage du contenu de test, ajoutés aux versions existantes qui ne les ont pas.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT "id", 'everstone', 'Pierre Stase', 'Tenue par un parent en pension, elle transmet sa nature à l’œuf.', NULL, 'breeding', 'rare', '[{"type":"breedingNature","chance":1}]'::jsonb
FROM "content_versions"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT "id", 'destiny-knot', 'Nœud Destin', 'Tenu par un parent en pension : l’œuf hérite de 5 IV des parents au lieu de 3.', NULL, 'breeding', 'epic', '[{"type":"breedingIvs","count":5}]'::jsonb
FROM "content_versions"
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "loot_tables" SET "entries" = "entries" || '[{"itemId":"everstone","chance":0.02,"min":1,"max":1}]'::jsonb
WHERE "id" = 'butin-foret' AND NOT "entries" @> '[{"itemId":"everstone"}]'::jsonb;--> statement-breakpoint
UPDATE "loot_tables" SET "entries" = "entries" || '[{"itemId":"everstone","chance":0.04,"min":1,"max":1}]'::jsonb
WHERE "id" = 'butin-grotte' AND NOT "entries" @> '[{"itemId":"everstone"}]'::jsonb;--> statement-breakpoint
UPDATE "loot_tables" SET "entries" = "entries" || '[{"itemId":"destiny-knot","chance":0.02,"min":1,"max":1}]'::jsonb
WHERE "id" = 'butin-mer' AND NOT "entries" @> '[{"itemId":"destiny-knot"}]'::jsonb;
