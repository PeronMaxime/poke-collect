-- Plus de niveau maximal imposé pour affronter les dresseurs, versions publiée et brouillon.
UPDATE "trainers" t
SET "rules" = jsonb_set(t."rules", '{maxLevel}', 'null'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft') AND t."rules"->>'maxLevel' IS NOT NULL;
