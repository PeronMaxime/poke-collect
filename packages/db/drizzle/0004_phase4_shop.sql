CREATE TABLE "shop_categories" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"order" integer NOT NULL,
	CONSTRAINT "shop_categories_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "shop_entries" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"item_id" text NOT NULL,
	"category_id" text NOT NULL,
	"order" integer NOT NULL,
	"price" integer NOT NULL,
	"lot_size" integer NOT NULL,
	"unlock" jsonb NOT NULL,
	"locked_visibility" text NOT NULL,
	"purchase_limit" jsonb,
	"available_from" text,
	"available_until" text,
	"enabled" boolean NOT NULL,
	CONSTRAINT "shop_entries_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "shop_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"shop_entry_id" text NOT NULL,
	"item_id" text NOT NULL,
	"lots" integer NOT NULL,
	"quantity" integer NOT NULL,
	"total_price" bigint NOT NULL,
	"content_version_id" integer NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_seen" (
	"owner_id" text NOT NULL,
	"shop_entry_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "shop_seen_owner_id_shop_entry_id_pk" PRIMARY KEY("owner_id","shop_entry_id")
);
--> statement-breakpoint
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_entries" ADD CONSTRAINT "shop_entries_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_seen" ADD CONSTRAINT "shop_seen_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_purchases_owner_entry" ON "shop_purchases" USING btree ("owner_id","shop_entry_id","purchased_at");--> statement-breakpoint
-- Données : catégories et articles de boutique du contenu de test, ajoutés aux versions
-- existantes qui ne les ont pas (seulement si leurs références existent dans la version).
INSERT INTO "shop_categories" ("content_version_id", "id", "name", "icon", "order")
SELECT v."id", 'balls', 'Balls', NULL, 0
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_categories" ("content_version_id", "id", "name", "icon", "order")
SELECT v."id", 'baies', 'Baies', NULL, 1
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_categories" ("content_version_id", "id", "name", "icon", "order")
SELECT v."id", 'elevage', 'Élevage', NULL, 2
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_categories" ("content_version_id", "id", "name", "icon", "order")
SELECT v."id", 'evolution', 'Évolution', NULL, 3
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'poke-ball', 'poke-ball', 'balls', 0, 200, 1, '{"type":"always"}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'poke-ball')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'balls')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'poke-ball-x10', 'poke-ball', 'balls', 1, 1800, 10, '{"type":"always"}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'poke-ball')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'balls')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'great-ball', 'great-ball', 'balls', 2, 600, 1, '{"type":"trainerDefeated","trainerId":"pierre"}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'balls')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'ultra-ball', 'ultra-ball', 'balls', 3, 1200, 1, '{"type":"trainerDefeated","trainerId":"ondine"}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'balls')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'razz-berry', 'razz-berry', 'baies', 0, 150, 1, '{"type":"always"}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'razz-berry')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'baies')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'razz-berry-x5', 'razz-berry', 'baies', 1, 600, 5, '{"type":"always"}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'razz-berry')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'baies')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'everstone', 'everstone', 'elevage', 0, 10000, 1, '{"type":"badgeCount","count":1}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'everstone')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'elevage')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'destiny-knot', 'destiny-knot', 'elevage', 1, 10000, 1, '{"type":"eggsHatched","count":10}'::jsonb, 'hidden', '{"lots":1,"period":"week"}'::jsonb, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'destiny-knot')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'elevage')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'moon-stone', 'moon-stone', 'evolution', 0, 3000, 1, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'moon-stone')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'evolution')
  AND EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'water-stone', 'water-stone', 'evolution', 1, 3000, 1, '{"type":"regionDexPercent","regionId":"kanto","percent":25}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'water-stone')
  AND EXISTS (SELECT 1 FROM "shop_categories" x WHERE x."content_version_id" = v."id" AND x."id" = 'evolution')
  AND EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
ON CONFLICT DO NOTHING;
