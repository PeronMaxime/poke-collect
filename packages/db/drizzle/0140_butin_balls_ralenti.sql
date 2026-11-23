-- Butin des expéditions moins généreux en Balls (17 nov.) : un joueur qui lance une Ball à chaque
-- rencontre n'en récupère plus qu'une partie : 40 à 55 % en début de région, 85 % sur ses dernières
-- zones. Versions publiée et brouillon seulement.
--
-- 1. Les tirages de butin ralentissent comme les rencontres : +1 min à l'intervalle (6 min) à chaque
--    heure passée, soit toujours un tirage toutes les deux rencontres. Valeur ajoutée seulement si
--    absente (réglage de l'admin conservé).
UPDATE "balance_settings" b
SET "data" = jsonb_set(b."data", '{expeditions,lootIntervalGrowthMinutes}', '1'::jsonb)
FROM "content_versions" cv
WHERE cv."id" = b."content_version_id" AND cv."status" IN ('published', 'draft')
  AND NOT (b."data"->'expeditions' ? 'lootIntervalGrowthMinutes');--> statement-breakpoint
-- 2. Balls du butin, par 1 à 3 (un tirage pour deux rencontres : la chance vaut la part des lancers
--    récupérée). Chance croissante avec la PE minimale de la zone dans sa région : Poké 40 → 55 %,
--    Super 15 → 20 %, Hyper 5 → 10 % (Super et Hyper à partir de la première zone qui en donnait).
--    Seules les entrées de Balls déjà présentes changent : les autres objets et l'ordre restent.
UPDATE "loot_tables" l
SET "entries" = (
  SELECT jsonb_agg(
    CASE
      WHEN x.e->>'itemId' = 'poke-ball' AND v."poke" IS NOT NULL
        THEN x.e || jsonb_build_object('chance', v."poke", 'min', 1, 'max', 3)
      WHEN x.e->>'itemId' = 'great-ball' AND v."great" IS NOT NULL
        THEN x.e || jsonb_build_object('chance', v."great", 'min', 1, 'max', 3)
      WHEN x.e->>'itemId' = 'ultra-ball' AND v."ultra" IS NOT NULL
        THEN x.e || jsonb_build_object('chance', v."ultra", 'min', 1, 'max', 3)
      ELSE x.e
    END ORDER BY x.ord)
  FROM jsonb_array_elements(l."entries") WITH ORDINALITY AS x(e, ord)
)
FROM "content_versions" cv,
  (VALUES
  ('butin-zone-route-1-alola', 0.4, 0.15, NULL),
  ('butin-zone-archipel-lointain', 0.46, 0.17, NULL),
  ('butin-zone-mont-lanakila', 0.55, 0.2, NULL),
  ('butin-zone-route-1-galar', 0.4, 0.15, NULL),
  ('butin-zone-terres-sauvages', 0.48, 0.18, NULL),
  ('butin-zone-antre-dynamax', 0.55, 0.2, 0.1),
  ('butin-zone-plaine-obsidienne', 0.55, 0.2, NULL),
  ('butin-zone-route-101', 0.4, NULL, NULL),
  ('butin-zone-bois-clementi', 0.41, NULL, NULL),
  ('butin-zone-route-104', 0.41, 0.15, NULL),
  ('butin-zone-route-116', 0.41, 0.15, NULL),
  ('butin-zone-tunnel-merazon', 0.42, 0.15, NULL),
  ('butin-zone-grotte-granite', 0.42, 0.15, NULL),
  ('butin-zone-route-109', 0.42, 0.16, NULL),
  ('butin-zone-route-110', 0.43, 0.16, NULL),
  ('butin-zone-routes-117-118', 0.43, 0.16, NULL),
  ('butin-zone-chemin-ardent', 0.43, 0.16, NULL),
  ('butin-zone-routes-111-113', 0.45, 0.16, NULL),
  ('butin-zone-mont-chimnee', 0.45, 0.17, NULL),
  ('butin-zone-routes-114-115', 0.45, 0.17, NULL),
  ('butin-zone-labo-seko', 0.46, 0.17, NULL),
  ('butin-zone-desert-hoenn', 0.46, 0.17, NULL),
  ('butin-zone-chutes-meteore', 0.46, 0.17, NULL),
  ('butin-zone-new-lavandia', 0.46, 0.17, NULL),
  ('butin-zone-routes-105-108', 0.46, 0.17, 0.05),
  ('butin-zone-epave-abandonnee', 0.48, 0.17, 0.06),
  ('butin-zone-routes-119-120', 0.48, 0.18, 0.06),
  ('butin-zone-mont-memoria', 0.49, 0.18, 0.07),
  ('butin-zone-parc-safari-hoenn', 0.5, 0.18, 0.07),
  ('butin-zone-grotte-trefonds', 0.5, 0.18, 0.07),
  ('butin-zone-grotte-sous-marine', 0.51, 0.18, 0.07),
  ('butin-zone-route-victoire-hoenn', 0.51, 0.19, 0.08),
  ('butin-zone-ile-aurore', 0.51, 0.19, 0.08),
  ('butin-zone-routes-124-128', 0.51, 0.19, 0.08),
  ('butin-zone-grotte-originelle', 0.52, 0.19, 0.08),
  ('butin-zone-pilier-celeste', 0.54, 0.19, 0.09),
  ('butin-zone-zone-de-combat', 0.55, 0.2, 0.1),
  ('butin-zone-route-29', 0.4, NULL, NULL),
  ('butin-zone-routes-30-31', 0.41, NULL, NULL),
  ('butin-zone-tour-chetiflor', 0.41, 0.15, NULL),
  ('butin-zone-route-32', 0.41, 0.15, NULL),
  ('butin-zone-caves-jumelles', 0.42, 0.15, NULL),
  ('butin-zone-ruines-alpha', 0.42, 0.15, NULL),
  ('butin-zone-puits-ramoloss', 0.42, 0.16, NULL),
  ('butin-zone-bois-aux-chenes', 0.43, 0.16, NULL),
  ('butin-zone-routes-34-35', 0.43, 0.16, NULL),
  ('butin-zone-antre-noir', 0.43, 0.16, NULL),
  ('butin-zone-routes-36-37', 0.45, 0.16, NULL),
  ('butin-zone-tour-cendree', 0.45, 0.17, NULL),
  ('butin-zone-routes-38-39', 0.45, 0.17, NULL),
  ('butin-zone-labo-orme', 0.46, 0.17, NULL),
  ('butin-zone-routes-42-44', 0.46, 0.17, NULL),
  ('butin-zone-arbre-etrange', 0.46, 0.17, NULL),
  ('butin-zone-mont-creuset', 0.46, 0.17, NULL),
  ('butin-zone-routes-40-41', 0.46, 0.17, 0.05),
  ('butin-zone-parc-naturel', 0.48, 0.17, 0.06),
  ('butin-zone-phare-oliville', 0.48, 0.18, 0.06),
  ('butin-zone-lac-colere', 0.49, 0.18, 0.07),
  ('butin-zone-parc-safari-johto', 0.5, 0.18, 0.07),
  ('butin-zone-route-de-glace', 0.5, 0.18, 0.07),
  ('butin-zone-tourb-iles', 0.51, 0.18, 0.07),
  ('butin-zone-routes-45-46', 0.51, 0.19, 0.08),
  ('butin-zone-autel-bois-aux-chenes', 0.51, 0.19, 0.08),
  ('butin-zone-routes-26-27', 0.51, 0.19, 0.08),
  ('butin-zone-tour-carillon', 0.52, 0.19, 0.08),
  ('butin-zone-mont-argente', 0.55, 0.2, 0.1),
  ('butin-zone-route-2-kalos', 0.4, 0.15, NULL),
  ('butin-zone-tour-maitrise', 0.55, 0.2, 0.1),
  ('butin-zone-route-1', 0.4, NULL, NULL),
  ('butin-zone-foret-de-jade', 0.41, NULL, NULL),
  ('butin-zone-route-3', 0.42, 0.15, NULL),
  ('butin-zone-mont-selenite', 0.42, 0.15, NULL),
  ('butin-zone-pont-pepite', 0.42, 0.15, NULL),
  ('butin-zone-cap-azuria', 0.43, 0.16, NULL),
  ('butin-zone-routes-5-6', 0.43, 0.16, NULL),
  ('butin-zone-cave-taupiqueur', 0.44, 0.16, NULL),
  ('butin-zone-routes-9-10', 0.46, 0.16, NULL),
  ('butin-zone-tunnel-roche', 0.46, 0.17, NULL),
  ('butin-zone-routes-7-8', 0.46, 0.17, NULL),
  ('butin-zone-reserve-chen', 0.46, 0.17, NULL),
  ('butin-zone-tour-pokemon', 0.47, 0.17, NULL),
  ('butin-zone-routes-12-15', 0.47, 0.17, NULL),
  ('butin-zone-piste-cyclable', 0.47, 0.17, 0.05),
  ('butin-zone-centrale', 0.48, 0.18, 0.06),
  ('butin-zone-ronflex-endormi', 0.49, 0.18, 0.06),
  ('butin-zone-routes-maritimes', 0.49, 0.18, 0.06),
  ('butin-zone-manoir-pokemon', 0.51, 0.18, 0.07),
  ('butin-zone-parc-safari', 0.51, 0.18, 0.07),
  ('butin-zone-dojo-karate', 0.51, 0.18, 0.07),
  ('butin-zone-iles-ecume', 0.51, 0.18, 0.07),
  ('butin-zone-route-23', 0.51, 0.19, 0.08),
  ('butin-zone-mont-braise', 0.52, 0.19, 0.08),
  ('butin-zone-sylphe-sarl', 0.52, 0.19, 0.08),
  ('butin-zone-route-victoire', 0.52, 0.19, 0.08),
  ('butin-zone-ile-lointaine', 0.52, 0.19, 0.08),
  ('butin-zone-grotte-azuree', 0.55, 0.2, 0.1),
  ('butin-zone-province-sud-paldea', 0.4, 0.15, NULL),
  ('butin-zone-lac-salinas', 0.55, 0.2, NULL),
  ('butin-zone-route-201', 0.4, 0.15, NULL),
  ('butin-zone-mont-couronne', 0.55, 0.2, NULL),
  ('butin-zone-route-1-unys', 0.4, 0.15, NULL),
  ('butin-zone-desert-delassant', 0.55, 0.2, NULL)
  ) AS v("id", "poke", "great", "ultra")
WHERE cv."id" = l."content_version_id" AND cv."status" IN ('published', 'draft')
  AND l."id" = v."id" AND jsonb_array_length(l."entries") > 0;
