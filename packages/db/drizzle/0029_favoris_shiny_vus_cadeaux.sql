ALTER TABLE "shop_entries" ADD COLUMN "gift" jsonb;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "favorite_zone_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "pokedex" ADD COLUMN "seen_shiny" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Shiny déjà rencontrés : ceux capturés, et ceux croisés en expédition (résultats enregistrés).
UPDATE "pokedex" AS p SET "seen_shiny" = true
WHERE p."caught_shiny" OR EXISTS (
  SELECT 1 FROM "expeditions" AS e, jsonb_array_elements(e."result" -> 'encounters') AS x(enc)
  WHERE e."owner_id" = p."owner_id" AND e."result" IS NOT NULL
    AND (x.enc ->> 'isShiny')::boolean AND (x.enc ->> 'speciesId')::int = p."species_id"
);--> statement-breakpoint
-- Honor Ball (toutes les versions de contenu), sans écraser un objet existant.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT v."id", 'premier-ball', 'Honor Ball', 'Une Ball commémorative, offerte pour l’achat de 10 Poké Balls d’un coup.', NULL, 'ball', 'uncommon', 150, '[{"type":"ball","catchMultiplier":1}]'::jsonb
FROM "content_versions" AS v
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Une Honor Ball offerte toutes les 10 Poké Balls achetées d'un coup.
UPDATE "shop_entries" SET "gift" = '{"itemId":"premier-ball","every":10,"quantity":1}'::jsonb
WHERE "item_id" = 'poke-ball' AND "gift" IS NULL;
