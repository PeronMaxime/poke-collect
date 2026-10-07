ALTER TABLE "dex_milestones" ADD COLUMN "shiny" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "shiny_chain" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "expeditions_owner_zone" ON "expeditions" USING btree ("owner_id","zone_id","started_at");--> statement-breakpoint
-- Réglages shiny : chaîne de zone (+25 % par maillon, ×3 max, 2 h pour relancer), Masuda ×4.
UPDATE "balance_settings" SET "data" = jsonb_set("data", '{shiny}', '{"chainBonusPerExpedition":0.25,"chainMaxMultiplier":3,"chainWindowMinutes":120,"masudaMultiplier":4}'::jsonb || ("data"->'shiny'))
WHERE NOT ("data"->'shiny' ? 'masudaMultiplier');--> statement-breakpoint
-- Charme Chroma du contenu de test, ajouté aux versions qui ne l’ont pas.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "effects")
SELECT v."id", 'shiny-charm', 'Charme Chroma', 'Il suffit de l’avoir dans son sac : les Pokémon shiny apparaissent 3 fois plus souvent.', NULL, 'endgame', 'legendary', '[{"type":"shinyCharm","multiplier":3}]'::jsonb
FROM "content_versions" v
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Paliers : Pokédex national complet (Charme Chroma) et Pokédex shiny de Kanto.
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "shiny", "percent", "rewards")
SELECT v."id", 'national-100', 0, 'Pokédex national complet', NULL, false, 100, '{"currency":0,"items":[{"itemId":"shiny-charm","quantity":1}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'shiny-charm')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "shiny", "percent", "rewards")
SELECT v."id", 'kanto-shiny-5', 10, 'Premiers éclats de Kanto', 'kanto', true, 5, '{"currency":20000,"items":[{"itemId":"ultra-ball","quantity":10}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "shiny", "percent", "rewards")
SELECT v."id", 'kanto-shiny-25', 11, 'Chasseur chromatique de Kanto', 'kanto', true, 25, '{"currency":100000,"items":[],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[{"type":"capture","percent":10}]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
ON CONFLICT DO NOTHING;
