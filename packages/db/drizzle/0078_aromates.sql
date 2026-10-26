-- Les 15 aromates manquants (une nature chacun, plus l'Aromate Sérieux pour les natures neutres).
-- Chaque version de contenu les reçoit comme copies de son Aromate Rigide : rareté, prix, article de
-- boutique, chance dans les butins et poids dans les coffres de guilde réglés dans l'admin.
CREATE TEMPORARY TABLE "new_mints" ("nature" text, "label" text, "rank" integer);
--> statement-breakpoint
INSERT INTO "new_mints" VALUES
  ('lonely', 'Solo', 1),
  ('naughty', 'Mauvais', 2),
  ('brave', 'Brave', 3),
  ('impish', 'Malin', 4),
  ('lax', 'Lâche', 5),
  ('relaxed', 'Relax', 6),
  ('mild', 'Doux', 7),
  ('rash', 'Foufou', 8),
  ('quiet', 'Discret', 9),
  ('gentle', 'Gentil', 10),
  ('careful', 'Prudent', 11),
  ('sassy', 'Malpoli', 12),
  ('hasty', 'Pressé', 13),
  ('naive', 'Naïf', 14),
  ('serious', 'Sérieux', 15);
--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT i."content_version_id", m."nature" || '-mint', 'Aromate ' || m."label",
  'Utilisé sur un Pokémon : sa nature effective devient ' || m."label" || '.',
  NULL, i."category", i."rarity", i."sell_price",
  jsonb_build_array(jsonb_build_object('type', 'mint', 'nature', m."nature"))
FROM "items" i
CROSS JOIN "new_mints" m
WHERE i."id" = 'adamant-mint'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Articles de boutique : rangés juste après les aromates déjà en vente.
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled", "gift")
SELECT e."content_version_id", m."nature" || '-mint', m."nature" || '-mint', e."category_id",
  (SELECT max(o."order") FROM "shop_entries" o
    WHERE o."content_version_id" = e."content_version_id" AND o."item_id" LIKE '%-mint'),
  e."price", e."lot_size", e."unlock", e."locked_visibility", e."purchase_limit",
  e."available_from", e."available_until", e."enabled", e."gift"
FROM "shop_entries" e
CROSS JOIN "new_mints" m
WHERE e."item_id" = 'adamant-mint' AND e."id" = 'adamant-mint'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Butins qui donnent l'Aromate Rigide : mêmes chances pour les nouveaux.
UPDATE "loot_tables" t
SET "entries" = t."entries" || (
  SELECT jsonb_agg(jsonb_set(r.entry, '{itemId}', to_jsonb(m."nature" || '-mint')) ORDER BY m."rank")
  FROM "new_mints" m
  CROSS JOIN LATERAL (
    SELECT e AS entry FROM jsonb_array_elements(t."entries") e
    WHERE e->>'itemId' = 'adamant-mint' LIMIT 1
  ) r
  WHERE NOT t."entries" @> jsonb_build_array(jsonb_build_object('itemId', m."nature" || '-mint'))
)
WHERE t."entries" @> '[{"itemId":"adamant-mint"}]'
  AND EXISTS (
    SELECT 1 FROM "new_mints" m
    WHERE NOT t."entries" @> jsonb_build_array(jsonb_build_object('itemId', m."nature" || '-mint'))
  );
--> statement-breakpoint
INSERT INTO "chest_entries" ("content_version_id", "id", "rarity", "item_id", "lot_size", "weight", "unlock", "enabled")
SELECT c."content_version_id", c."rarity" || '-' || m."nature" || '-mint', c."rarity",
  m."nature" || '-mint', c."lot_size", c."weight", c."unlock", c."enabled"
FROM "chest_entries" c
CROSS JOIN "new_mints" m
WHERE c."item_id" = 'adamant-mint'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DROP TABLE "new_mints";
