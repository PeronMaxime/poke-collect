-- Musée : fossiles (objets), tables de butin de fouilles et réglage du Musée, ajoutés aux
-- versions de contenu existantes.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'helix-fossil', 'Fossile Nautile', 'Un fossile ancien. Le Musée peut en faire renaître un Amonita.', NULL, 'fossil', 'rare', '[{"type":"fossil","speciesId":138,"formId":null,"level":10,"minutes":120}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'dome-fossil', 'Fossile Dôme', 'Un fossile ancien. Le Musée peut en faire renaître un Kabuto.', NULL, 'fossil', 'rare', '[{"type":"fossil","speciesId":140,"formId":null,"level":10,"minutes":120}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'old-amber', 'Vieil Ambre', 'Un fossile ancien. Le Musée peut en faire renaître un Ptéra.', NULL, 'fossil', 'epic', '[{"type":"fossil","speciesId":142,"formId":null,"level":10,"minutes":240}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'root-fossil', 'Fossile Racine', 'Un fossile ancien. Le Musée peut en faire renaître un Lilia.', NULL, 'fossil', 'rare', '[{"type":"fossil","speciesId":345,"formId":null,"level":10,"minutes":180}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'claw-fossil', 'Fossile Griffe', 'Un fossile ancien. Le Musée peut en faire renaître un Anorith.', NULL, 'fossil', 'rare', '[{"type":"fossil","speciesId":347,"formId":null,"level":10,"minutes":180}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'skull-fossil', 'Fossile Crâne', 'Un fossile ancien. Le Musée peut en faire renaître un Kranidos.', NULL, 'fossil', 'rare', '[{"type":"fossil","speciesId":408,"formId":null,"level":10,"minutes":180}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'armor-fossil', 'Fossile Armure', 'Un fossile ancien. Le Musée peut en faire renaître un Dinoclier.', NULL, 'fossil', 'rare', '[{"type":"fossil","speciesId":410,"formId":null,"level":10,"minutes":180}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Tables de fouilles : le butin de grotte de la version, plus les fossiles.
INSERT INTO "loot_tables" ("content_version_id", "id", "name", "entries")
SELECT g."content_version_id", 'butin-fouilles', 'Butin de fouilles (Kanto)', g."entries" || '[{"itemId":"helix-fossil","chance":0.04,"min":1,"max":1},{"itemId":"dome-fossil","chance":0.04,"min":1,"max":1},{"itemId":"old-amber","chance":0.015,"min":1,"max":1}]'::jsonb
FROM "loot_tables" g
WHERE g."id" = 'butin-grotte'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "zones" z SET "loot_table_id" = 'butin-fouilles'
WHERE z."id" = 'mont-selenite' AND z."loot_table_id" = 'butin-grotte'
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = z."content_version_id" AND x."id" = 'butin-fouilles');--> statement-breakpoint
INSERT INTO "loot_tables" ("content_version_id", "id", "name", "entries")
SELECT g."content_version_id", 'butin-fouilles-hoenn', 'Butin de fouilles (Hoenn)', g."entries" || '[{"itemId":"root-fossil","chance":0.04,"min":1,"max":1},{"itemId":"claw-fossil","chance":0.04,"min":1,"max":1}]'::jsonb
FROM "loot_tables" g
WHERE g."id" = 'butin-grotte'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "zones" z SET "loot_table_id" = 'butin-fouilles-hoenn'
WHERE z."id" = 'grotte-granite' AND z."loot_table_id" = 'butin-grotte'
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = z."content_version_id" AND x."id" = 'butin-fouilles-hoenn');--> statement-breakpoint
INSERT INTO "loot_tables" ("content_version_id", "id", "name", "entries")
SELECT g."content_version_id", 'butin-fouilles-sinnoh', 'Butin de fouilles (Sinnoh)', g."entries" || '[{"itemId":"skull-fossil","chance":0.04,"min":1,"max":1},{"itemId":"armor-fossil","chance":0.04,"min":1,"max":1}]'::jsonb
FROM "loot_tables" g
WHERE g."id" = 'butin-grotte'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "zones" z SET "loot_table_id" = 'butin-fouilles-sinnoh'
WHERE z."id" = 'mont-couronne' AND z."loot_table_id" = 'butin-grotte'
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = z."content_version_id" AND x."id" = 'butin-fouilles-sinnoh');--> statement-breakpoint
UPDATE "balance_settings" SET "data" = "data" || jsonb_build_object('museum', '{"slots":2}'::jsonb)
WHERE NOT ("data" ? 'museum');
