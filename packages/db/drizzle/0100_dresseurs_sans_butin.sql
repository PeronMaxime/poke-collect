-- Les dresseurs ne donnent plus que de l'argent : plus de table de butin ni de tirage, versions
-- publiée et brouillon. Les tables « butin-dresseur-… » (ajoutées un temps par 0099) disparaissent.
UPDATE "trainers" t
SET "loot_table_id" = NULL, "loot_rolls" = 0
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft');--> statement-breakpoint
DELETE FROM "loot_tables" l
USING "content_versions" cv
WHERE cv."id" = l."content_version_id" AND cv."status" IN ('published', 'draft')
  AND l."id" LIKE 'butin-dresseur-%';
