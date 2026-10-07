CREATE TYPE "public"."reward_kind" AS ENUM('milestone', 'collection');--> statement-breakpoint
CREATE TABLE "collections" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"species_ids" jsonb NOT NULL,
	"rewards" jsonb NOT NULL,
	CONSTRAINT "collections_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "dex_milestones" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"region_id" text,
	"percent" double precision NOT NULL,
	"rewards" jsonb NOT NULL,
	CONSTRAINT "dex_milestones_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "evolution_overrides" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"from_species_id" integer NOT NULL,
	"to_species_id" integer NOT NULL,
	"enabled" boolean NOT NULL,
	"methods" jsonb NOT NULL,
	CONSTRAINT "evolution_overrides_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "reward_claims" (
	"owner_id" text NOT NULL,
	"kind" "reward_kind" NOT NULL,
	"reward_id" text NOT NULL,
	"content_version_id" integer NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_claims_owner_id_kind_reward_id_pk" PRIMARY KEY("owner_id","kind","reward_id")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dex_milestones" ADD CONSTRAINT "dex_milestones_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_overrides" ADD CONSTRAINT "evolution_overrides_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Données : objets d’évolution du contenu de test, ajoutés aux versions qui ne les ont pas.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'thunder-stone', 'Pierre Foudre', 'Fait évoluer Pikachu et Évoli.', NULL, 'evolution', 'rare', '[]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'fire-stone', 'Pierre Feu', 'Fait évoluer Goupix, Caninos et Évoli.', NULL, 'evolution', 'rare', '[]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'leaf-stone', 'Pierre Plante', 'Fait évoluer Ortide, Boustiflor et Noeunoeuf.', NULL, 'evolution', 'rare', '[]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'linking-cord', 'Câble Link', 'Remplace l’échange : fait évoluer Kadabra, Machopeur, Gravalanch et Spectrum.', NULL, 'evolution', 'epic', '[]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "items" SET "description" = 'Fait évoluer Nidorina, Nidorino, Mélofée et Rondoudou.'
WHERE "id" = 'moon-stone' AND "description" LIKE '%(bientôt)%';--> statement-breakpoint
UPDATE "items" SET "description" = 'Fait évoluer Têtarte, Kokiyas, Stari et Évoli.'
WHERE "id" = 'water-stone' AND "description" LIKE '%(bientôt)%';--> statement-breakpoint
-- Réglages d’évolution (Câble Link à la place de l’échange, jour de 6 h à 20 h).
UPDATE "balance_settings" SET "data" = "data" || jsonb_build_object('evolution', '{"tradeItemId":"linking-cord","dayStartHour":6,"nightStartHour":20}'::jsonb)
WHERE NOT ("data" ? 'evolution');--> statement-breakpoint
-- Articles de boutique des nouveaux objets.
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'thunder-stone', 'thunder-stone', 'evolution', 2, 3000, 1, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'thunder-stone')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'evolution')
  AND EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'fire-stone', 'fire-stone', 'evolution', 3, 3000, 1, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'fire-stone')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'evolution')
  AND EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'leaf-stone', 'leaf-stone', 'evolution', 4, 3000, 1, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'leaf-stone')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'evolution')
  AND EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'linking-cord', 'linking-cord', 'evolution', 5, 5000, 1, '{"type":"badgeCount","count":2}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'linking-cord')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'evolution')
  AND (SELECT count(*) FROM "trainers" t WHERE t."content_version_id" = v."id" AND jsonb_typeof(t."badge") = 'object') >= 2
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Surcharges d’évolution, paliers du Pokédex et collections du contenu de test.
INSERT INTO "evolution_overrides" ("content_version_id", "id", "from_species_id", "to_species_id", "enabled", "methods")
SELECT v."id", '52-53', 52, 53, true, '[{"minLevel":28,"itemId":null,"minHappiness":null,"timeOfDay":null}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "evolution_overrides" ("content_version_id", "id", "from_species_id", "to_species_id", "enabled", "methods")
SELECT v."id", '27-28', 27, 28, true, '[{"minLevel":22,"itemId":null,"minHappiness":null,"timeOfDay":null}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "evolution_overrides" ("content_version_id", "id", "from_species_id", "to_species_id", "enabled", "methods")
SELECT v."id", '37-38', 37, 38, true, '[{"minLevel":null,"itemId":"fire-stone","minHappiness":null,"timeOfDay":null}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'fire-stone')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "evolution_overrides" ("content_version_id", "id", "from_species_id", "to_species_id", "enabled", "methods")
SELECT v."id", '100-101', 100, 101, true, '[{"minLevel":30,"itemId":null,"minHappiness":null,"timeOfDay":null}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "evolution_overrides" ("content_version_id", "id", "from_species_id", "to_species_id", "enabled", "methods")
SELECT v."id", '79-80', 79, 80, true, '[{"minLevel":37,"itemId":null,"minHappiness":null,"timeOfDay":null}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "percent", "rewards")
SELECT v."id", 'kanto-10', 0, 'Apprenti de Kanto', 'kanto', 10, '{"currency":0,"items":[{"itemId":"great-ball","quantity":5}],"expeditionSlots":1,"battleSlots":0,"daycareSlots":0,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "percent", "rewards")
SELECT v."id", 'kanto-25', 1, 'Explorateur de Kanto', 'kanto', 25, '{"currency":3000,"items":[],"expeditionSlots":0,"battleSlots":1,"daycareSlots":1,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "percent", "rewards")
SELECT v."id", 'kanto-50', 2, 'Chercheur de Kanto', 'kanto', 50, '{"currency":0,"items":[{"itemId":"ultra-ball","quantity":5},{"itemId":"linking-cord","quantity":1}],"expeditionSlots":1,"battleSlots":0,"daycareSlots":0,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'linking-cord')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "percent", "rewards")
SELECT v."id", 'kanto-75', 3, 'Expert de Kanto', 'kanto', 75, '{"currency":10000,"items":[],"expeditionSlots":0,"battleSlots":1,"daycareSlots":1,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "percent", "rewards")
SELECT v."id", 'kanto-100', 4, 'Maître du Pokédex de Kanto', 'kanto', 100, '{"currency":50000,"items":[{"itemId":"destiny-knot","quantity":1}],"expeditionSlots":1,"battleSlots":0,"daycareSlots":1,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'destiny-knot')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "collections" ("content_version_id", "id", "order", "name", "description", "species_ids", "rewards")
SELECT v."id", 'insectes-de-jade', 0, 'Insectes de la Forêt de Jade', 'Chenipan, Aspicot et toutes leurs évolutions.', '[10,11,12,13,14,15]'::jsonb, '{"currency":0,"items":[{"itemId":"poke-ball","quantity":10}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[{"type":"capture","percent":5}]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'poke-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "collections" ("content_version_id", "id", "order", "name", "description", "species_ids", "rewards")
SELECT v."id", 'famille-nidoran', 1, 'La famille Nidoran', 'Les deux lignées de Nidoran, jusqu’à Nidoqueen et Nidoking.', '[29,30,31,32,33,34]'::jsonb, '{"currency":0,"items":[],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[{"type":"money","percent":10}]}'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "collections" ("content_version_id", "id", "order", "name", "description", "species_ids", "rewards")
SELECT v."id", 'starters-de-kanto', 2, 'Starters de Kanto', 'Bulbizarre, Salamèche, Carapuce et leurs évolutions.', '[1,2,3,4,5,6,7,8,9]'::jsonb, '{"currency":0,"items":[],"expeditionSlots":1,"battleSlots":0,"daycareSlots":0,"bonuses":[{"type":"xp","percent":10}]}'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;
