ALTER TABLE "player_profiles" ADD COLUMN "farm_plots" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Parcelles de ferme à acheter en boutique (catégorie Ferme) : débloquées aussitôt, sans passer
-- par le sac ; 10 000 ₽ la première, prix × 1,4 à chaque achat. Visibles quand l'onglet Ferme
-- l'est (même condition). Ajoutées à toutes les versions de contenu.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT v."id", 'parcelle-ferme', 'Parcelle de ferme', 'Agrandit aussitôt la ferme à baies d’une parcelle. Son prix augmente à chaque achat.', '/api/sprites/items/growth-mulch.png', 'misc', 'rare', NULL, '[{"type":"farmPlot","priceGrowth":1.4}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_categories" ("content_version_id", "id", "name", "icon", "order")
SELECT v."id", 'ferme', 'Ferme', NULL, coalesce((SELECT max(c."order") + 1 FROM "shop_categories" c WHERE c."content_version_id" = v."id"), 0)
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled", "gift")
SELECT v."id", 'parcelle-ferme', 'parcelle-ferme', 'ferme', 0, 10000, 1,
  coalesce((SELECT b."data" -> 'tabUnlocks' -> 'farm' FROM "balance_settings" b WHERE b."content_version_id" = v."id"), '{"type":"always"}'::jsonb),
  'hidden', NULL, NULL, NULL, true, NULL
FROM "content_versions" v
ON CONFLICT DO NOTHING;
