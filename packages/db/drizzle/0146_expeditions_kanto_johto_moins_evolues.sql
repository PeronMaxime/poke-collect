-- Expéditions de Kanto et Johto : moins de Pokémon évolués. Reprend les réglages faits à la main dans
-- l'admin local (même règle que 0145 pour Hoenn) : formes finales retirées ou gardées dans une seule
-- zone, plus rares ; formes intermédiaires dans moins de zones, plus rares ; quelques Pokémon de base
-- ajoutés là où les évolués partaient (Route 23, Routes 26-27, Grotte Azurée) ; PE minimale de la
-- Route Victoire de Kanto 3600 → 3300.
-- Puis les affinités des zones de Kanto, Johto et Hoenn dont les rencontres ont changé (0142, 0143,
-- 0145 et ces réglages), recalculées comme le fait le contenu de test (zoneAffinityTypes).
-- Contenu publié et brouillon. Un poids, une PE ou une affinité ne change que s'il vaut encore
-- l'ancienne valeur (un réglage fait dans l'admin est gardé) ; un ajout n'a lieu que si la zone n'a
-- pas déjà l'espèce. Une zone n'est jamais vidée. Idempotente.
WITH changes (zone_id, species_id, form_id, old_weight, new_weight) AS (
  VALUES
    ('caves-jumelles', 195, 0, 3, NULL::numeric), ('routes-5-6', 53, 0, 3, NULL::numeric),
    ('routes-5-6', 57, 0, 3, NULL::numeric), ('bois-aux-chenes', 168, 0, 4, NULL::numeric),
    ('cave-taupiqueur', 51, 0, 10, 1), ('routes-34-35', 29, 0, 6, NULL::numeric),
    ('routes-34-35', 32, 0, 6, NULL::numeric), ('routes-9-10', 20, 0, 8, NULL::numeric),
    ('routes-9-10', 22, 0, 8, NULL::numeric), ('antre-noir', 202, 0, 7, 3),
    ('tunnel-roche', 42, 0, 5, NULL::numeric), ('routes-36-37', 166, 0, 6, NULL::numeric),
    ('routes-36-37', 168, 0, 6, NULL::numeric), ('tour-pokemon', 93, 0, 10, 7),
    ('tour-pokemon', 105, 0, 5, 2), ('routes-12-15', 70, 0, 8, 5),
    ('routes-12-15', 17, 0, 8, 5), ('routes-38-39', 164, 0, 8, NULL::numeric),
    ('routes-38-39', 20, 0, 10, NULL::numeric), ('routes-38-39', 22, 0, 6, NULL::numeric),
    ('routes-38-39', 210, 0, 3, NULL::numeric), ('piste-cyclable', 22, 0, 10, NULL::numeric),
    ('piste-cyclable', 20, 0, 8, NULL::numeric), ('piste-cyclable', 53, 0, 4, NULL::numeric),
    ('routes-42-44', 180, 0, 6, NULL::numeric), ('routes-42-44', 224, 0, 3, NULL::numeric),
    ('mont-creuset', 184, 0, 4, NULL::numeric), ('mont-creuset', 75, 0, 8, 5),
    ('routes-maritimes', 73, 0, 5, NULL::numeric), ('routes-maritimes', 119, 0, 3, NULL::numeric),
    ('routes-maritimes', 99, 0, 2, NULL::numeric), ('manoir-pokemon', 20, 0, 10, NULL::numeric),
    ('manoir-pokemon', 110, 0, 6, NULL::numeric), ('manoir-pokemon', 89, 0, 6, NULL::numeric),
    ('routes-40-41', 226, 0, 5, 3), ('routes-40-41', 171, 0, 3, NULL::numeric),
    ('phare-oliville', 180, 0, 16, 3), ('phare-oliville', 82, 0, 8, 6),
    ('phare-oliville', 171, 0, 10, 3), ('route-23', 22, 0, 18, 1),
    ('route-23', 57, 0, 18, NULL::numeric), ('route-23', 24, 0, 16, 1),
    ('route-23', 28, 0, 16, 1), ('route-23', 20, 0, 12, NULL::numeric),
    ('route-23', 85, 0, 10, NULL::numeric), ('route-23', 47, 0, 10, NULL::numeric),
    ('lac-colere', 195, 0, 8, NULL::numeric), ('route-victoire', 67, 0, 18, 4),
    ('route-victoire', 75, 0, 18, 4), ('route-victoire', 42, 0, 14, 4),
    ('route-victoire', 105, 0, 8, NULL::numeric), ('route-de-glace', 221, 0, 4, NULL::numeric),
    ('route-de-glace', 42, 0, 10, NULL::numeric), ('ronflex-endormi', 17, 0, 16, 11),
    ('ronflex-endormi', 44, 0, 14, 7), ('ronflex-endormi', 70, 0, 14, 5),
    ('routes-45-46', 232, 0, 4, NULL::numeric), ('routes-45-46', 217, 0, 5, NULL::numeric),
    ('routes-45-46', 75, 0, 10, NULL::numeric), ('routes-45-46', 57, 0, 10, 6),
    ('parc-safari', 47, 0, 4, NULL::numeric), ('parc-safari', 49, 0, 4, NULL::numeric),
    ('routes-26-27', 164, 0, 10, NULL::numeric), ('routes-26-27', 178, 0, 8, 2),
    ('routes-26-27', 195, 0, 8, NULL::numeric), ('routes-26-27', 232, 0, 6, NULL::numeric),
    ('routes-26-27', 229, 0, 5, NULL::numeric), ('routes-26-27', 20, 0, 10, 4),
    ('routes-26-27', 22, 0, 10, NULL::numeric), ('routes-26-27', 78, 0, 8, 4),
    ('routes-26-27', 85, 0, 8, 4), ('routes-26-27', 57, 0, 8, NULL::numeric),
    ('routes-26-27', 73, 0, 8, NULL::numeric), ('dojo-karate', 56, 0, 30, 17),
    ('dojo-karate', 57, 0, 15, NULL::numeric), ('dojo-karate', 67, 0, 15, 5),
    ('arbre-etrange', 185, 0, 4, 2), ('sylphe-sarl', 82, 0, 7, NULL::numeric),
    ('sylphe-sarl', 101, 0, 7, NULL::numeric), ('sylphe-sarl', 97, 0, 6, NULL::numeric),
    ('centrale', 82, 0, 10, 5), ('centrale', 101, 0, 10, 5),
    ('parc-naturel', 166, 0, 6, NULL::numeric), ('parc-naturel', 168, 0, 6, 3),
    ('iles-ecume', 87, 0, 8, NULL::numeric), ('iles-ecume', 80, 0, 6, 4),
    ('iles-ecume', 55, 0, 6, NULL::numeric), ('parc-safari-johto', 195, 0, 10, 5),
    ('parc-safari-johto', 178, 0, 8, NULL::numeric), ('parc-safari-johto', 84, 0, 10, NULL::numeric),
    ('parc-safari-johto', 27, 0, 8, NULL::numeric), ('parc-safari-johto', 235, 0, 6, 2),
    ('mont-argente', 217, 0, 12, NULL::numeric), ('mont-argente', 232, 0, 10, 3),
    ('mont-argente', 229, 0, 8, NULL::numeric), ('mont-argente', 75, 0, 12, 6),
    ('mont-argente', 57, 0, 10, 5), ('mont-argente', 105, 0, 8, 5),
    ('mont-argente', 78, 0, 6, NULL::numeric), ('mont-argente', 246, 0, 3, 1),
    ('mont-braise', 78, 0, 6, 5), ('grotte-azuree', 42, 0, 12, NULL::numeric),
    ('grotte-azuree', 47, 0, 12, NULL::numeric), ('grotte-azuree', 57, 0, 10, 2),
    ('grotte-azuree', 64, 0, 10, 2), ('grotte-azuree', 82, 0, 10, NULL::numeric),
    ('grotte-azuree', 101, 0, 10, NULL::numeric), ('grotte-azuree', 112, 0, 10, 2),
    ('grotte-azuree', 55, 0, 8, 2), ('tourb-iles', 171, 0, 6, NULL::numeric),
    ('ile-lointaine', 49, 0, 10, NULL::numeric), ('tour-carillon', 229, 0, 6, 2),
    ('tour-carillon', 219, 0, 6, NULL::numeric), ('tour-carillon', 178, 0, 6, NULL::numeric),
    ('tour-carillon', 93, 0, 8, 6), ('tour-carillon', 20, 0, 10, NULL::numeric),
    ('autel-bois-aux-chenes', 205, 0, 6, 2), ('autel-bois-aux-chenes', 188, 0, 10, 5),
    ('autel-bois-aux-chenes', 166, 0, 8, NULL::numeric), ('autel-bois-aux-chenes', 168, 0, 8, NULL::numeric),
    ('autel-bois-aux-chenes', 47, 0, 8, 5)
),
rebuilt AS (
  SELECT z.id, z.content_version_id,
    COALESCE(
      jsonb_agg(
        CASE
          WHEN c.new_weight IS NOT NULL AND (e->>'weight')::numeric = c.old_weight
            THEN jsonb_set(e, '{weight}', to_jsonb(c.new_weight))
          ELSE e
        END
        ORDER BY ord
      ) FILTER (WHERE c.species_id IS NULL OR c.new_weight IS NOT NULL),
      '[]'::jsonb
    ) AS encounters
  FROM "zones" z
  JOIN "content_versions" v ON v.id = z.content_version_id AND v.status IN ('published', 'draft')
  CROSS JOIN LATERAL jsonb_array_elements(z.encounters) WITH ORDINALITY AS t(e, ord)
  LEFT JOIN changes c
    ON c.zone_id = z.id
   AND c.species_id = (e->>'speciesId')::int
   AND COALESCE((e->>'formId')::int, 0) = c.form_id
  WHERE z.id IN (SELECT zone_id FROM changes)
  GROUP BY z.id, z.content_version_id
)
UPDATE "zones" z
SET "encounters" = r.encounters
FROM rebuilt r
WHERE z.id = r.id
  AND z.content_version_id = r.content_version_id
  AND jsonb_array_length(r.encounters) > 0
  AND r.encounters <> z.encounters;
--> statement-breakpoint
WITH additions (zone_id, species_id, weight, min_level, max_level, ord) AS (
  VALUES
    ('route-23', 21, 10, 38, 44, 0), ('route-23', 23, 10, 38, 44, 1),
    ('route-23', 27, 10, 38, 44, 2), ('route-23', 56, 10, 38, 44, 3),
    ('routes-26-27', 19, 10, 42, 46, 4), ('routes-26-27', 77, 10, 42, 46, 5),
    ('routes-26-27', 84, 10, 42, 46, 6), ('grotte-azuree', 54, 10, 52, 58, 7),
    ('grotte-azuree', 63, 10, 52, 58, 8), ('grotte-azuree', 111, 10, 52, 58, 9)
),
added AS (
  SELECT z.id, z.content_version_id,
    jsonb_agg(
      jsonb_build_object(
        'speciesId', a.species_id, 'weight', a.weight, 'minLevel', a.min_level, 'maxLevel', a.max_level
      )
      ORDER BY a.ord
    ) AS encounters
  FROM "zones" z
  JOIN "content_versions" v ON v.id = z.content_version_id AND v.status IN ('published', 'draft')
  JOIN additions a ON a.zone_id = z.id
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(z.encounters) e
    WHERE (e->>'speciesId')::int = a.species_id AND COALESCE((e->>'formId')::int, 0) = 0
  )
  GROUP BY z.id, z.content_version_id
)
UPDATE "zones" z
SET "encounters" = z.encounters || a.encounters
FROM added a
WHERE z.id = a.id
  AND z.content_version_id = a.content_version_id;
--> statement-breakpoint
UPDATE "zones" z
SET "min_power" = 3300
FROM "content_versions" v
WHERE v.id = z.content_version_id
  AND v.status IN ('published', 'draft')
  AND z.id = 'route-victoire'
  AND z.min_power = 3600;
--> statement-breakpoint
WITH affinities (zone_id, old_types, new_types) AS (
  VALUES
    ('tunnel-merazon', '["fighting"]'::jsonb,
      '["fighting","water","grass","ice"]'::jsonb),
    ('routes-9-10', '["fighting"]'::jsonb,
      '["ground","psychic"]'::jsonb),
    ('mont-creuset', '["fighting","ground","steel","water","grass","ice"]'::jsonb,
      '["fighting","ground","rock","steel","water","grass","electric","psychic","ice"]'::jsonb),
    ('manoir-pokemon', '["ground","psychic"]'::jsonb,
      '["ground","rock","water"]'::jsonb),
    ('route-23', '["fighting"]'::jsonb,
      '["fighting","ground","rock","water","grass","electric","psychic","ice"]'::jsonb),
    ('route-victoire', '["water","grass","ice"]'::jsonb,
      '["fighting","ground","steel","water","grass","ice"]'::jsonb),
    ('grotte-trefonds', '["grass","electric"]'::jsonb,
      '["fighting","rock","steel","fire"]'::jsonb),
    ('route-victoire-hoenn', '["fighting","ground","steel","water","grass"]'::jsonb,
      '["fighting","ground","steel","fire","water","grass"]'::jsonb),
    ('routes-45-46', '["water","grass","ice"]'::jsonb,
      '["flying","psychic","fairy"]'::jsonb),
    ('zone-de-combat', '["ice","dragon","fairy"]'::jsonb,
      '["flying","poison","rock","bug","fire","electric","ice"]'::jsonb),
    ('grotte-azuree', '["ground"]'::jsonb,
      '["fighting","ground","bug","ghost","steel","water","grass","electric","ice","dark"]'::jsonb),
    ('grotte-originelle', '["water","grass","ice"]'::jsonb,
      '["ground","rock","water"]'::jsonb),
    ('tour-carillon', '["ground","rock","water"]'::jsonb,
      '["fighting","bug","fairy"]'::jsonb)
)
UPDATE "zones" z
SET "affinity_types" = a.new_types
FROM affinities a, "content_versions" v
WHERE z.id = a.zone_id
  AND v.id = z.content_version_id
  AND v.status IN ('published', 'draft')
  AND z.affinity_types = a.old_types;
