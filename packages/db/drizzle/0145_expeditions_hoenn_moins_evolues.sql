-- Expéditions de Hoenn : moins de Pokémon évolués, comme à Kanto et Johto (réglés à la main dans
-- l'admin). Les formes finales : une partie disparaît (Grahyèna, Avaltout, Hélédelle, Maskadra,
-- Élecsprint, Bekipan, Charmina, Groret, Xatu), les autres ne restent que dans une seule zone de la
-- région, avec un poids divisé par deux (au moins 2). Les formes intermédiaires : deux zones au plus,
-- poids divisé par deux (au moins 2). Les lignées à bébé (Marill, Rosélia, Pikachu, Éoko) et les
-- cocons du Bois Clémenti ne changent pas. Les zones qui perdaient beaucoup reçoivent des Pokémon de
-- base (poids 10) pour ne pas tourner à vide.
-- Forme par défaut seulement ; contenu publié et brouillon. Un poids n'est baissé que s'il vaut
-- encore celui d'origine (un réglage fait dans l'admin est gardé) ; un ajout n'a lieu que si la
-- zone n'a pas déjà l'espèce. Une zone n'est jamais vidée. Idempotente.
WITH changes (zone_id, species_id, old_weight, new_weight) AS (
  VALUES
    ('route-116', 264, 4, NULL::numeric), ('route-116', 262, 4, NULL::numeric),
    ('tunnel-merazon', 294, 4, 2), ('route-109', 279, 4, NULL::numeric),
    ('route-110', 264, 4, NULL::numeric), ('route-110', 317, 4, NULL::numeric),
    ('routes-117-118', 262, 5, NULL::numeric), ('routes-117-118', 264, 5, NULL::numeric),
    ('chemin-ardent', 317, 4, NULL::numeric), ('routes-111-113', 277, 6, NULL::numeric),
    ('routes-111-113', 28, 4, NULL::numeric), ('mont-chimnee', 67, 4, 2),
    ('routes-114-115', 271, 6, 3), ('routes-114-115', 274, 5, 3),
    ('desert-hoenn', 28, 6, 3), ('desert-hoenn', 332, 4, 2),
    ('desert-hoenn', 329, 3, 2), ('new-lavandia', 310, 6, NULL::numeric),
    ('new-lavandia', 82, 5, 3), ('new-lavandia', 101, 3, 2),
    ('routes-105-108', 279, 6, NULL::numeric), ('routes-105-108', 73, 4, NULL::numeric),
    ('routes-119-120', 284, 5, NULL::numeric), ('routes-119-120', 274, 8, 4),
    ('routes-119-120', 44, 5, 3), ('routes-119-120', 264, 10, 5),
    ('routes-119-120', 319, 3, NULL::numeric), ('mont-memoria', 354, 5, 3),
    ('mont-memoria', 356, 5, 3), ('mont-memoria', 93, 4, 2),
    ('grotte-trefonds', 364, 6, 3), ('grotte-trefonds', 362, 3, 2),
    ('grotte-trefonds', 42, 10, NULL::numeric), ('grotte-trefonds', 342, 4, NULL::numeric),
    ('route-victoire-hoenn', 294, 10, 5), ('route-victoire-hoenn', 297, 8, 4),
    ('route-victoire-hoenn', 305, 10, 5), ('route-victoire-hoenn', 308, 8, NULL::numeric),
    ('route-victoire-hoenn', 42, 10, NULL::numeric), ('route-victoire-hoenn', 75, 10, 5),
    ('routes-124-128', 321, 4, NULL::numeric), ('routes-124-128', 319, 8, NULL::numeric),
    ('routes-124-128', 73, 10, 5), ('routes-124-128', 279, 8, NULL::numeric),
    ('routes-124-128', 340, 6, NULL::numeric), ('routes-124-128', 364, 6, NULL::numeric),
    ('routes-124-128', 117, 6, 3), ('routes-124-128', 130, 4, 2),
    ('chutes-meteore', 42, 6, 3), ('chutes-meteore', 340, 4, 2),
    ('epave-abandonnee', 342, 4, 2), ('parc-safari-hoenn', 202, 8, 4),
    ('zone-de-combat', 297, 10, NULL::numeric), ('zone-de-combat', 334, 8, NULL::numeric),
    ('zone-de-combat', 332, 8, NULL::numeric), ('grotte-sous-marine', 73, 8, NULL::numeric),
    ('grotte-sous-marine', 42, 6, NULL::numeric), ('grotte-sous-marine', 321, 4, 2),
    ('grotte-sous-marine', 319, 6, 3), ('grotte-sous-marine', 364, 6, 3),
    ('grotte-originelle', 42, 14, 7), ('grotte-originelle', 75, 10, 5),
    ('grotte-originelle', 323, 8, 4), ('grotte-originelle', 344, 6, NULL::numeric),
    ('grotte-originelle', 297, 6, NULL::numeric), ('pilier-celeste', 344, 10, NULL::numeric),
    ('pilier-celeste', 354, 10, NULL::numeric), ('pilier-celeste', 356, 10, 5),
    ('pilier-celeste', 334, 10, 5), ('pilier-celeste', 42, 10, NULL::numeric),
    ('pilier-celeste', 75, 8, NULL::numeric), ('pilier-celeste', 362, 6, NULL::numeric),
    ('ile-aurore', 344, 6, 3), ('ile-aurore', 326, 6, NULL::numeric),
    ('ile-aurore', 178, 6, NULL::numeric)
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
   AND COALESCE((e->>'formId')::int, 0) = 0
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
    ('route-victoire-hoenn', 304, 10, 36, 42, 0), ('route-victoire-hoenn', 293, 10, 36, 42, 1),
    ('route-victoire-hoenn', 307, 10, 36, 42, 2), ('routes-124-128', 318, 10, 40, 46, 3),
    ('routes-124-128', 278, 10, 40, 46, 4), ('routes-124-128', 339, 10, 40, 46, 5),
    ('zone-de-combat', 296, 10, 45, 52, 6), ('zone-de-combat', 333, 10, 45, 52, 7),
    ('zone-de-combat', 331, 10, 45, 52, 8), ('grotte-sous-marine', 318, 10, 38, 44, 9),
    ('grotte-originelle', 322, 10, 45, 50, 10), ('grotte-originelle', 41, 10, 45, 50, 11),
    ('pilier-celeste', 353, 10, 46, 52, 12), ('pilier-celeste', 355, 10, 46, 52, 13),
    ('pilier-celeste', 333, 10, 46, 52, 14), ('pilier-celeste', 303, 10, 46, 52, 15)
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
