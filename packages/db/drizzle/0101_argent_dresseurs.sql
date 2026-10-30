-- Les dresseurs rapportent 50 % d'argent en plus, versions publiée et brouillon.
UPDATE "trainers" t
SET "money" = ROUND(t."money" * 1.5)::integer
FROM "content_versions" cv
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft');
