-- La Baie Nanana double les rencontres, versions publiée et brouillon. Seule la valeur d'origine est
-- convertie : un multiplicateur réglé autrement dans l'admin ne bouge pas.
UPDATE "items" i
SET "effects" = (
  SELECT jsonb_agg(
    CASE WHEN t.e->>'type' = 'encounterBoost' THEN jsonb_set(t.e, '{multiplier}', '2') ELSE t.e END
    ORDER BY t.ord
  )
  FROM jsonb_array_elements(i."effects") WITH ORDINALITY AS t(e, ord)
)
FROM "content_versions" cv
WHERE cv."id" = i."content_version_id" AND cv."status" IN ('published', 'draft')
  AND i."id" = 'nanab-berry' AND i."effects" @> '[{"type":"encounterBoost","multiplier":1.25}]'::jsonb;
