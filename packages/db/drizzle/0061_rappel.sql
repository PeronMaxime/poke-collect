-- Rappel : objet qui ranime un Pokémon K.O., vendu en boutique (catégorie Soins) à partir du
-- 4e badge de Kanto. Ajouté à toutes les versions de contenu.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT v."id", 'revive', 'Rappel', 'Ranime aussitôt un Pokémon K.O., sans passer par le Centre Pokémon.', NULL, 'misc', 'uncommon', 1000, '[{"type":"revive"}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_categories" ("content_version_id", "id", "name", "icon", "order")
SELECT v."id", 'soin', 'Soins', NULL, coalesce((SELECT max(c."order") + 1 FROM "shop_categories" c WHERE c."content_version_id" = v."id"), 0)
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled", "gift")
SELECT v."id", 'revive', 'revive', 'soin', 0, 2000, 1, '{"type":"badgeCount","count":4,"regionId":"kanto"}'::jsonb, 'locked', NULL, NULL, NULL, true, NULL
FROM "content_versions" v
ON CONFLICT DO NOTHING;
