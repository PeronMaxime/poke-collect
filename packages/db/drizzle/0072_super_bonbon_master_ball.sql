-- Super Bonbon (un niveau de plus) et Master Ball (capture assurée). Pas encore obtenables : ni
-- boutique ni butin. Toutes les versions de contenu.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT v."id", i."id", i."name", i."description", NULL, i."category", i."rarity", i."sell_price", i."effects"::jsonb
FROM "content_versions" v
CROSS JOIN (VALUES
  ('master-ball', 'Master Ball', 'La meilleure Ball : elle capture à coup sûr.', 'ball', 'legendary', NULL::integer, '[{"type":"ball","catchMultiplier":255,"guaranteed":true}]'),
  ('rare-candy', 'Super Bonbon', 'Donné à un Pokémon : il monte d’un niveau.', 'misc', 'rare', 1000, '[{"type":"levelUp","levels":1}]')
) AS i("id", "name", "description", "category", "rarity", "sell_price", "effects")
ON CONFLICT DO NOTHING;
