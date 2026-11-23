-- Expéditions : plus aucun Pokémon au troisième stade d'évolution (les bébés ne comptent pas comme
-- un stade). Il faut faire évoluer sa pré-évolution. Liste calculée depuis les lignées PokéAPI sur
-- les zones du contenu publié : Papilusion, Dardargnan, Pharamp, Cotovol (Johto), Monaflèmit,
-- Brouhabam, Galeking, Libégon, Kaimorse (Hoenn), forme par défaut seulement (0) : les formes
-- Méga, Gigamax et Prismillon des zones de Kalos et Galar, qu'on n'obtient pas en évoluant, restent.
-- Seulement le contenu publié et le brouillon ; une zone n'est jamais vidée. Idempotente.
WITH third_stage (species_id, form_id) AS (
  VALUES (12, 0), (15, 0), (181, 0), (189, 0), (289, 0), (295, 0), (306, 0), (330, 0), (365, 0)
),
kept AS (
  SELECT z.id, z.content_version_id,
    COALESCE(jsonb_agg(e ORDER BY ord) FILTER (WHERE t3.species_id IS NULL), '[]'::jsonb) AS encounters,
    COUNT(t3.species_id) AS removed
  FROM "zones" z
  JOIN "content_versions" v ON v.id = z.content_version_id AND v.status IN ('published', 'draft')
  CROSS JOIN LATERAL jsonb_array_elements(z.encounters) WITH ORDINALITY AS t(e, ord)
  LEFT JOIN third_stage t3
    ON t3.species_id = (e->>'speciesId')::int
   AND t3.form_id = COALESCE((e->>'formId')::int, 0)
  GROUP BY z.id, z.content_version_id
)
UPDATE "zones" z
SET "encounters" = k.encounters
FROM kept k
WHERE z.id = k.id
  AND z.content_version_id = k.content_version_id
  AND k.removed > 0
  AND jsonb_array_length(k.encounters) > 0;
