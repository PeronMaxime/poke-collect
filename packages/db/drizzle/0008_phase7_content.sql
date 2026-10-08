-- Objets endgame : Capsules d’Argent / d’Or, Aromates, Pilule et Patch Talent.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'bottle-cap', 'Capsule d’Argent', 'Utilisée sur un Pokémon : un IV au choix passe à 31.', NULL, 'endgame', 'epic', '[{"type":"ivCap","all":false}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'gold-bottle-cap', 'Capsule d’Or', 'Utilisée sur un Pokémon : ses 6 IV passent à 31.', NULL, 'endgame', 'legendary', '[{"type":"ivCap","all":true}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'adamant-mint', 'Aromate Rigide', 'Utilisé sur un Pokémon : sa nature effective devient Rigide.', NULL, 'endgame', 'epic', '[{"type":"mint","nature":"adamant"}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'modest-mint', 'Aromate Modeste', 'Utilisé sur un Pokémon : sa nature effective devient Modeste.', NULL, 'endgame', 'epic', '[{"type":"mint","nature":"modest"}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'jolly-mint', 'Aromate Jovial', 'Utilisé sur un Pokémon : sa nature effective devient Jovial.', NULL, 'endgame', 'epic', '[{"type":"mint","nature":"jolly"}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'timid-mint', 'Aromate Timide', 'Utilisé sur un Pokémon : sa nature effective devient Timide.', NULL, 'endgame', 'epic', '[{"type":"mint","nature":"timid"}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'bold-mint', 'Aromate Assuré', 'Utilisé sur un Pokémon : sa nature effective devient Assuré.', NULL, 'endgame', 'epic', '[{"type":"mint","nature":"bold"}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'calm-mint', 'Aromate Calme', 'Utilisé sur un Pokémon : sa nature effective devient Calme.', NULL, 'endgame', 'epic', '[{"type":"mint","nature":"calm"}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'ability-capsule', 'Pilule Talent', 'Utilisée sur un Pokémon : il passe à son autre talent normal.', NULL, 'endgame', 'epic', '[{"type":"abilityChange","hidden":false}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'ability-patch', 'Patch Talent', 'Utilisé sur un Pokémon : il obtient son talent caché.', NULL, 'endgame', 'legendary', '[{"type":"abilityChange","hidden":true}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Butin d’élite (zones de haut niveau, Conseil 4).
INSERT INTO "loot_tables" ("content_version_id", "id", "name", "entries")
SELECT v."id", 'butin-elite', 'Butin d’élite', '[{"itemId":"ultra-ball","chance":0.5,"min":1,"max":2},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"bottle-cap","chance":0.02,"min":1,"max":1},{"itemId":"ability-capsule","chance":0.01,"min":1,"max":1},{"itemId":"adamant-mint","chance":0.01,"min":1,"max":1},{"itemId":"modest-mint","chance":0.01,"min":1,"max":1},{"itemId":"jolly-mint","chance":0.01,"min":1,"max":1},{"itemId":"timid-mint","chance":0.01,"min":1,"max":1},{"itemId":"bold-mint","chance":0.01,"min":1,"max":1},{"itemId":"calm-mint","chance":0.01,"min":1,"max":1}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Zones de haut niveau et zones ouvertes par les quêtes légendaires.
INSERT INTO "zones" ("content_version_id", "id", "region_id", "order", "name", "description", "image", "habitat", "min_power", "required_types", "affinity_types", "durations_minutes", "encounters", "loot_table_id", "unlock")
SELECT v."id", 'route-victoire', 'kanto', 4, 'Route Victoire', 'La grotte qui mène à la Ligue Pokémon. Seuls les dresseurs aguerris en sortent.', NULL, 'cave', 1200, '[]'::jsonb, '["fighting","rock","ground"]'::jsonb, '[60,240,480]'::jsonb, '[{"speciesId":67,"weight":20,"minLevel":40,"maxLevel":44},{"speciesId":75,"weight":20,"minLevel":40,"maxLevel":44},{"speciesId":95,"weight":15,"minLevel":40,"maxLevel":46},{"speciesId":42,"weight":15,"minLevel":40,"maxLevel":44},{"speciesId":105,"weight":10,"minLevel":42,"maxLevel":46},{"speciesId":49,"weight":10,"minLevel":42,"maxLevel":46}]'::jsonb, 'butin-elite', '{"type":"badgeCount","count":2}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "id", "region_id", "order", "name", "description", "image", "habitat", "min_power", "required_types", "affinity_types", "durations_minutes", "encounters", "loot_table_id", "unlock")
SELECT v."id", 'iles-ecume', 'kanto', 5, 'Îles Écume', 'Deux îles glacées au large de Parmanie. Un oiseau légendaire y aurait son nid.', NULL, 'sea', 800, '[{"type":"water","count":1}]'::jsonb, '["ice","water"]'::jsonb, '[60,240,480]'::jsonb, '[{"speciesId":86,"weight":30,"minLevel":30,"maxLevel":35},{"speciesId":87,"weight":15,"minLevel":32,"maxLevel":38},{"speciesId":90,"weight":20,"minLevel":30,"maxLevel":35},{"speciesId":91,"weight":5,"minLevel":34,"maxLevel":38},{"speciesId":124,"weight":10,"minLevel":32,"maxLevel":36},{"speciesId":79,"weight":15,"minLevel":30,"maxLevel":35},{"speciesId":131,"weight":3,"minLevel":35,"maxLevel":40}]'::jsonb, 'butin-mer', '{"type":"questStepsDone","questId":"artikodin","count":1}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "id", "region_id", "order", "name", "description", "image", "habitat", "min_power", "required_types", "affinity_types", "durations_minutes", "encounters", "loot_table_id", "unlock")
SELECT v."id", 'centrale', 'kanto', 6, 'Centrale', 'Une centrale électrique abandonnée où crépitent les Pokémon Électrik.', NULL, 'urban', 800, '[]'::jsonb, '["electric"]'::jsonb, '[60,240,480]'::jsonb, '[{"speciesId":100,"weight":30,"minLevel":30,"maxLevel":35},{"speciesId":81,"weight":30,"minLevel":30,"maxLevel":35},{"speciesId":25,"weight":15,"minLevel":30,"maxLevel":34},{"speciesId":82,"weight":8,"minLevel":34,"maxLevel":38},{"speciesId":101,"weight":7,"minLevel":34,"maxLevel":38},{"speciesId":125,"weight":5,"minLevel":35,"maxLevel":38},{"speciesId":88,"weight":5,"minLevel":30,"maxLevel":34}]'::jsonb, 'butin-grotte', '{"type":"questStepsDone","questId":"electhor","count":1}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "id", "region_id", "order", "name", "description", "image", "habitat", "min_power", "required_types", "affinity_types", "durations_minutes", "encounters", "loot_table_id", "unlock")
SELECT v."id", 'mont-braise', 'kanto', 7, 'Mont Braise', 'Un volcan des Îles Sevii. La lave y garde au chaud un oiseau de feu.', NULL, 'mountain', 800, '[]'::jsonb, '["fire","rock"]'::jsonb, '[60,240,480]'::jsonb, '[{"speciesId":77,"weight":30,"minLevel":30,"maxLevel":35},{"speciesId":37,"weight":20,"minLevel":30,"maxLevel":35},{"speciesId":74,"weight":20,"minLevel":30,"maxLevel":34},{"speciesId":75,"weight":10,"minLevel":33,"maxLevel":37},{"speciesId":78,"weight":8,"minLevel":34,"maxLevel":38},{"speciesId":126,"weight":5,"minLevel":35,"maxLevel":38},{"speciesId":58,"weight":7,"minLevel":30,"maxLevel":35}]'::jsonb, 'butin-grotte', '{"type":"questStepsDone","questId":"sulfura","count":1}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "id", "region_id", "order", "name", "description", "image", "habitat", "min_power", "required_types", "affinity_types", "durations_minutes", "encounters", "loot_table_id", "unlock")
SELECT v."id", 'grotte-azuree', 'kanto', 8, 'Grotte Azurée', 'La caverne interdite d’Azuria, peuplée de Pokémon redoutables.', NULL, 'cave', 2000, '[]'::jsonb, '["psychic","ground"]'::jsonb, '[240,480]'::jsonb, '[{"speciesId":64,"weight":15,"minLevel":50,"maxLevel":55},{"speciesId":47,"weight":15,"minLevel":50,"maxLevel":55},{"speciesId":112,"weight":15,"minLevel":52,"maxLevel":58},{"speciesId":101,"weight":15,"minLevel":50,"maxLevel":55},{"speciesId":113,"weight":8,"minLevel":52,"maxLevel":58},{"speciesId":132,"weight":12,"minLevel":50,"maxLevel":55},{"speciesId":55,"weight":10,"minLevel":52,"maxLevel":56},{"speciesId":82,"weight":10,"minLevel":50,"maxLevel":55}]'::jsonb, 'butin-elite', '{"type":"questStepsDone","questId":"mewtwo","count":2}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "id", "region_id", "order", "name", "description", "image", "habitat", "min_power", "required_types", "affinity_types", "durations_minutes", "encounters", "loot_table_id", "unlock")
SELECT v."id", 'ile-lointaine', 'kanto', 9, 'Île Lointaine', 'Une île couverte de hautes herbes, absente des cartes. Quelque chose y joue…', NULL, 'grassland', 800, '[]'::jsonb, '["grass","bug","psychic"]'::jsonb, '[60,240,480]'::jsonb, '[{"speciesId":114,"weight":20,"minLevel":30,"maxLevel":35},{"speciesId":102,"weight":20,"minLevel":30,"maxLevel":35},{"speciesId":48,"weight":20,"minLevel":30,"maxLevel":34},{"speciesId":46,"weight":15,"minLevel":30,"maxLevel":34},{"speciesId":123,"weight":8,"minLevel":33,"maxLevel":37},{"speciesId":127,"weight":8,"minLevel":33,"maxLevel":37},{"speciesId":103,"weight":4,"minLevel":35,"maxLevel":38}]'::jsonb, 'butin-foret', '{"type":"questStepsDone","questId":"mew","count":2}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Conseil 4 et Maître de la Ligue.
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'olga', 'kanto', NULL, 6, 'Olga', 'Conseil 4', 'https://play.pokemonshowdown.com/sprites/trainers/lorelei.png', '[{"speciesId":87,"level":54,"iv":25,"nature":null},{"speciesId":91,"level":53,"iv":25,"nature":null},{"speciesId":80,"level":54,"iv":25,"nature":null},{"speciesId":124,"level":56,"iv":25,"nature":null},{"speciesId":131,"level":56,"iv":25,"nature":null}]'::jsonb, 120, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 6000, 'butin-elite', 3, NULL, false, NULL, 240, '{"type":"badgeCount","count":2}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'aldo', 'kanto', NULL, 7, 'Aldo', 'Conseil 4', 'https://play.pokemonshowdown.com/sprites/trainers/bruno.png', '[{"speciesId":95,"level":53,"iv":25,"nature":null},{"speciesId":107,"level":55,"iv":25,"nature":null},{"speciesId":106,"level":55,"iv":25,"nature":null},{"speciesId":95,"level":56,"iv":25,"nature":null},{"speciesId":68,"level":58,"iv":25,"nature":null}]'::jsonb, 120, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 6000, 'butin-elite', 3, NULL, false, NULL, 240, '{"type":"trainerDefeated","trainerId":"olga"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'agatha', 'kanto', NULL, 8, 'Agatha', 'Conseil 4', 'https://play.pokemonshowdown.com/sprites/trainers/agatha.png', '[{"speciesId":94,"level":56,"iv":25,"nature":null},{"speciesId":42,"level":56,"iv":25,"nature":null},{"speciesId":93,"level":55,"iv":25,"nature":null},{"speciesId":24,"level":58,"iv":25,"nature":null},{"speciesId":94,"level":60,"iv":25,"nature":null}]'::jsonb, 120, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 6000, 'butin-elite', 3, NULL, false, NULL, 240, '{"type":"trainerDefeated","trainerId":"aldo"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'peter', 'kanto', NULL, 9, 'Peter', 'Conseil 4', 'https://play.pokemonshowdown.com/sprites/trainers/lance.png', '[{"speciesId":130,"level":56,"iv":25,"nature":null},{"speciesId":148,"level":54,"iv":25,"nature":null},{"speciesId":148,"level":54,"iv":25,"nature":null},{"speciesId":142,"level":58,"iv":25,"nature":null},{"speciesId":149,"level":60,"iv":25,"nature":null}]'::jsonb, 120, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 6000, 'butin-elite', 3, NULL, false, NULL, 240, '{"type":"trainerDefeated","trainerId":"agatha"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "id", "region_id", "zone_id", "order", "name", "trainer_class", "sprite", "team", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock")
SELECT v."id", 'maitre-blue', 'kanto', NULL, 10, 'Blue', 'Maître de la Ligue', 'https://play.pokemonshowdown.com/sprites/trainers/blue.png', '[{"speciesId":18,"level":61,"iv":31,"nature":null},{"speciesId":65,"level":59,"iv":31,"nature":null},{"speciesId":112,"level":61,"iv":31,"nature":null},{"speciesId":103,"level":61,"iv":31,"nature":null},{"speciesId":130,"level":63,"iv":31,"nature":null},{"speciesId":6,"level":65,"iv":31,"nature":null}]'::jsonb, 180, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 15000, 'butin-elite', 5, NULL, false, NULL, 240, '{"type":"trainerDefeated","trainerId":"peter"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Boutique : onglet « Rare » (objets endgame).
INSERT INTO "shop_categories" ("content_version_id", "id", "name", "icon", "order")
SELECT v."id", 'rare', 'Rare', NULL, 4
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'bottle-cap', 'bottle-cap', 'rare', 0, 50000, 1, '{"type":"trainerDefeated","trainerId":"olga"}'::jsonb, 'locked', '{"lots":1,"period":"week"}'::jsonb, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'gold-bottle-cap', 'gold-bottle-cap', 'rare', 1, 300000, 1, '{"type":"trainerDefeated","trainerId":"maitre-blue"}'::jsonb, 'locked', '{"lots":1,"period":"total"}'::jsonb, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'adamant-mint', 'adamant-mint', 'rare', 2, 20000, 1, '{"type":"badgeCount","count":2}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'modest-mint', 'modest-mint', 'rare', 3, 20000, 1, '{"type":"badgeCount","count":2}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'jolly-mint', 'jolly-mint', 'rare', 4, 20000, 1, '{"type":"badgeCount","count":2}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'timid-mint', 'timid-mint', 'rare', 5, 20000, 1, '{"type":"badgeCount","count":2}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'bold-mint', 'bold-mint', 'rare', 6, 20000, 1, '{"type":"badgeCount","count":2}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'calm-mint', 'calm-mint', 'rare', 7, 20000, 1, '{"type":"badgeCount","count":2}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'ability-capsule', 'ability-capsule', 'rare', 10, 30000, 1, '{"type":"trainerDefeated","trainerId":"olga"}'::jsonb, 'locked', NULL, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled")
SELECT v."id", 'ability-patch', 'ability-patch', 'rare', 11, 150000, 1, '{"type":"trainerDefeated","trainerId":"maitre-blue"}'::jsonb, 'locked', '{"lots":1,"period":"week"}'::jsonb, NULL, NULL, true
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Quêtes des légendaires de Kanto.
INSERT INTO "quests" ("content_version_id", "id", "order", "name", "description", "image", "region_id", "unlock", "steps", "rewards")
SELECT v."id", 'artikodin', 0, 'L’oiseau des glaces', 'Un oiseau légendaire ferait tomber la neige sur les Îles Écume.', NULL, 'kanto', '{"type":"badgeCount","count":2}'::jsonb, '[{"name":"Les pieds dans l’eau","description":"Capture 10 Pokémon Eau pour préparer la traversée.","condition":{"type":"catchPokemon","count":10,"pokemonType":"water","speciesId":null}},{"name":"Le froid des îles","description":"Capture 5 Pokémon Glace aux Îles Écume.","condition":{"type":"catchPokemon","count":5,"pokemonType":"ice","speciesId":null}},{"name":"Le nid d’Artikodin","description":"Réussis une expédition aux Îles Écume avec 2 Pokémon Glace de PE 400 ou plus.","condition":{"type":"expedition","zoneId":"iles-ecume","count":1,"memberType":"ice","memberCount":2,"minMemberPower":400}}]'::jsonb, '{"currency":10000,"items":[{"itemId":"bottle-cap","quantity":1}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[],"pokemon":[{"speciesId":144,"level":50,"perfectIvs":3}]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "quests" ("content_version_id", "id", "order", "name", "description", "image", "region_id", "unlock", "steps", "rewards")
SELECT v."id", 'electhor', 1, 'L’oiseau de foudre', 'Des éclairs zèbrent le ciel au-dessus de la Centrale abandonnée.', NULL, 'kanto', '{"type":"badgeCount","count":2}'::jsonb, '[{"name":"Prouver sa valeur","description":"Bats la Championne Ondine.","condition":{"type":"trainerDefeated","trainerId":"ondine"}},{"name":"Courts-circuits","description":"Capture 8 Pokémon Électrik à la Centrale.","condition":{"type":"catchPokemon","count":8,"pokemonType":"electric","speciesId":null}},{"name":"Le cœur de la Centrale","description":"Réussis une expédition à la Centrale avec 2 Pokémon Électrik de PE 400 ou plus.","condition":{"type":"expedition","zoneId":"centrale","count":1,"memberType":"electric","memberCount":2,"minMemberPower":400}}]'::jsonb, '{"currency":10000,"items":[{"itemId":"bottle-cap","quantity":1}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[],"pokemon":[{"speciesId":145,"level":50,"perfectIvs":3}]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "quests" ("content_version_id", "id", "order", "name", "description", "image", "region_id", "unlock", "steps", "rewards")
SELECT v."id", 'sulfura', 2, 'L’oiseau de feu', 'Le Mont Braise gronde : un oiseau de flammes y aurait été aperçu.', NULL, 'kanto', '{"type":"badgeCount","count":2}'::jsonb, '[{"name":"Explorateur","description":"Capture 40 espèces différentes.","condition":{"type":"speciesCaught","count":40}},{"name":"Coulées de lave","description":"Capture 8 Pokémon Feu au Mont Braise.","condition":{"type":"catchPokemon","count":8,"pokemonType":"fire","speciesId":null}},{"name":"Le sommet du volcan","description":"Réussis une expédition au Mont Braise avec 2 Pokémon Feu de PE 400 ou plus.","condition":{"type":"expedition","zoneId":"mont-braise","count":1,"memberType":"fire","memberCount":2,"minMemberPower":400}}]'::jsonb, '{"currency":10000,"items":[{"itemId":"bottle-cap","quantity":1}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[],"pokemon":[{"speciesId":146,"level":50,"perfectIvs":3}]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "quests" ("content_version_id", "id", "order", "name", "description", "image", "region_id", "unlock", "steps", "rewards")
SELECT v."id", 'mewtwo', 3, 'Le Pokémon génétique', 'Une créature née d’expériences interdites se cacherait au fond de la Grotte Azurée.', NULL, 'kanto', '{"type":"badgeCount","count":2}'::jsonb, '[{"name":"Chercheur","description":"Capture 60 % du Pokédex de Kanto.","condition":{"type":"regionDexPercent","regionId":"kanto","percent":60}},{"name":"Maître de la Ligue","description":"Bats le Maître de la Ligue Pokémon.","condition":{"type":"trainerDefeated","trainerId":"maitre-blue"}},{"name":"La Grotte Azurée","description":"Réussis une expédition dans la Grotte Azurée avec 3 Pokémon de PE 700 ou plus.","condition":{"type":"expedition","zoneId":"grotte-azuree","count":1,"memberType":null,"memberCount":3,"minMemberPower":700}}]'::jsonb, '{"currency":50000,"items":[{"itemId":"gold-bottle-cap","quantity":1}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[],"pokemon":[{"speciesId":150,"level":70,"perfectIvs":3}]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "quests" ("content_version_id", "id", "order", "name", "description", "image", "region_id", "unlock", "steps", "rewards")
SELECT v."id", 'mew', 4, 'Le Pokémon fabuleux', 'Mewtwo n’est qu’une copie. L’original jouerait sur une île absente des cartes.', NULL, 'kanto', '{"type":"questCompleted","questId":"mewtwo"}'::jsonb, '[{"name":"Origines","description":"Fais éclore 20 œufs.","condition":{"type":"eggsHatched","count":20}},{"name":"Grand collectionneur","description":"Capture 30 Pokémon.","condition":{"type":"catchPokemon","count":30,"pokemonType":null,"speciesId":null}},{"name":"Les hautes herbes","description":"Réussis 3 expéditions sur l’Île Lointaine.","condition":{"type":"expedition","zoneId":"ile-lointaine","count":3,"memberType":null,"memberCount":0,"minMemberPower":0}}]'::jsonb, '{"currency":0,"items":[{"itemId":"ability-patch","quantity":1}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[],"pokemon":[{"speciesId":151,"level":30,"perfectIvs":3}]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'ondine')
  AND EXISTS (SELECT 1 FROM "trainers" x WHERE x."content_version_id" = v."id" AND x."id" = 'pierre')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-foret')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'great-ball')
ON CONFLICT DO NOTHING;
