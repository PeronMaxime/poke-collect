-- Expéditions : plus aucun Pokémon qui ne s'obtient qu'en évoluant avec un objet (pierre, objet
-- tenu, Câble Link à la place de l'échange). Il faut désormais faire évoluer sa pré-évolution.
-- Liste calculée avec evolutionOptions (game-core) : espèces et formes des régions dont toutes
-- les évolutions qui y mènent demandent un objet (0 = forme par défaut). Leveinard (Pierre Ovale)
-- est gardé : ni Ptiravi ni la Pierre Ovale ne s'obtiennent encore.
-- Seulement le contenu publié et le brouillon ; une zone n'est jamais vidée. Idempotente.
WITH item_only (species_id, form_id) AS (
  VALUES
    (26, 0), (26, 10100), (28, 10102), (31, 0), (34, 0), (36, 0), (38, 0), (38, 10104), (40, 0),
    (45, 0), (182, 0), (59, 0), (59, 10230), (62, 0), (186, 0), (65, 0), (68, 0), (71, 0),
    (76, 0), (76, 10111), (199, 0), (80, 10165), (199, 10172), (462, 0), (91, 0), (94, 0),
    (208, 0), (101, 10232), (103, 0), (103, 10114), (464, 0), (230, 0), (121, 0), (212, 0),
    (900, 0), (466, 0), (467, 0), (134, 0), (135, 0), (136, 0), (470, 0), (471, 0), (233, 0),
    (468, 0), (192, 0), (430, 0), (429, 0), (472, 0), (461, 0), (903, 0), (901, 0), (474, 0),
    (272, 0), (275, 0), (475, 0), (476, 0), (301, 0), (407, 0), (350, 0), (477, 0), (478, 0),
    (367, 0), (368, 0), (512, 0), (514, 0), (516, 0), (518, 0), (526, 0), (534, 0), (547, 0),
    (549, 0), (549, 10237), (555, 10177), (573, 0), (589, 0), (604, 0), (609, 0), (617, 0),
    (671, 0), (671, 110111), (671, 110112), (671, 110113), (671, 110114), (681, 0), (683, 0),
    (685, 0), (695, 0), (709, 0), (711, 0), (711, 10030), (711, 10031), (711, 10032), (738, 0),
    (740, 0), (841, 0), (842, 0), (1011, 0), (855, 0), (855, 110345), (869, 0), (1018, 0),
    (936, 0), (937, 0), (939, 0), (952, 0), (975, 0), (1013, 0), (1013, 110448)
),
kept AS (
  SELECT z.id, z.content_version_id,
    COALESCE(jsonb_agg(e ORDER BY ord) FILTER (WHERE i.species_id IS NULL), '[]'::jsonb) AS encounters,
    COUNT(i.species_id) AS removed
  FROM "zones" z
  JOIN "content_versions" v ON v.id = z.content_version_id AND v.status IN ('published', 'draft')
  CROSS JOIN LATERAL jsonb_array_elements(z.encounters) WITH ORDINALITY AS t(e, ord)
  LEFT JOIN item_only i
    ON i.species_id = (e->>'speciesId')::int
   AND i.form_id = COALESCE((e->>'formId')::int, 0)
  GROUP BY z.id, z.content_version_id
)
UPDATE "zones" z
SET "encounters" = k.encounters
FROM kept k
WHERE z.id = k.id
  AND z.content_version_id = k.content_version_id
  AND k.removed > 0
  AND jsonb_array_length(k.encounters) > 0;
