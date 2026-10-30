-- Plus de PE minimale pour affronter les dresseurs, versions publiée et brouillon.
UPDATE "trainers" t
SET "rules" = jsonb_set(t."rules", '{minPower}', '0'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft') AND (t."rules"->>'minPower')::integer <> 0;
