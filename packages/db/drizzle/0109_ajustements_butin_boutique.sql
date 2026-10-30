-- Réglages faits dans l'admin en local (30 oct.), reportés sur les versions publiée et brouillon.
-- Butin des zones : tables réécrites en entier (créées par 0099, qui part en prod en même temps :
-- rien à écraser), avec les objets d'évolution ajoutés et les fossiles chacun dans une seule zone.
UPDATE "loot_tables" l
SET "entries" = v."entries"::jsonb
FROM "content_versions" cv,
  (VALUES
  ('butin-zone-antre-noir', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-arbre-etrange', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2}]'),
  ('butin-zone-autel-bois-aux-chenes', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2}]'),
  ('butin-zone-bois-aux-chenes', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-bois-clementi', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-cap-azuria', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-cave-taupiqueur', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-caves-jumelles', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-centrale', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"thunder-stone","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-chemin-ardent', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-chutes-meteore', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"moon-stone","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-desert-hoenn', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-dojo-karate', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1}]'),
  ('butin-zone-epave-abandonnee', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"deep-sea-tooth","chance":0.005,"min":1,"max":1},{"itemId":"deep-sea-scale","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-foret-de-jade', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-grotte-azuree', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2}]'),
  ('butin-zone-grotte-granite', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-grotte-originelle', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2}]'),
  ('butin-zone-grotte-sous-marine', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"water-stone","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-grotte-trefonds', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-ile-aurore', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2}]'),
  ('butin-zone-ile-lointaine', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2}]'),
  ('butin-zone-iles-ecume', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"water-stone","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-labo-orme', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"up-grade","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-labo-seko', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2}]'),
  ('butin-zone-lac-colere', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-manoir-pokemon', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-mont-argente', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2}]'),
  ('butin-zone-mont-braise', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"fire-stone","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-mont-chimnee', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-mont-creuset', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-mont-memoria', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-mont-selenite', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"helix-fossil","chance":0.04,"min":1,"max":1},{"itemId":"dome-fossil","chance":0.04,"min":1,"max":1},{"itemId":"old-amber","chance":0.015,"min":1,"max":1},{"itemId":"moon-stone","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-new-lavandia', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-parc-naturel', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"sun-stone","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-parc-safari', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-parc-safari-hoenn', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"leaf-stone","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-parc-safari-johto', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"kings-rock","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-phare-oliville', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-pilier-celeste', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2}]'),
  ('butin-zone-pont-pepite', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-puits-ramoloss', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-reserve-chen', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"leaf-stone","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-ronflex-endormi', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1}]'),
  ('butin-zone-route-1', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-route-101', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-route-104', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-route-109', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-route-110', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-route-116', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-route-23', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-route-29', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-route-3', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-route-32', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-route-de-glace', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-route-victoire', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-route-victoire-hoenn', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-routes-105-108', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-routes-111-113', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"root-fossil","chance":0.04,"min":1,"max":1},{"itemId":"claw-fossil","chance":0.04,"min":1,"max":1}]'),
  ('butin-zone-routes-114-115', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-117-118', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-119-120', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1},{"itemId":"prism-scale","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-routes-12-15', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-124-128', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.012,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-26-27', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-routes-30-31', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-routes-34-35', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-36-37', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-38-39', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-40-41', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}]'),
  ('butin-zone-routes-42-44', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-45-46', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-routes-5-6', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-routes-7-8', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-9-10', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-routes-maritimes', '[{"itemId":"poke-ball","chance":0.5,"min":2,"max":4},{"itemId":"great-ball","chance":0.3,"min":1,"max":2},{"itemId":"ultra-ball","chance":0.05,"min":1,"max":1},{"itemId":"razz-berry","chance":0.02,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-ruines-alpha', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-sylphe-sarl', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"linking-cord","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-tour-carillon', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"metal-coat","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-tour-chetiflor', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"razz-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-zone-tourb-iles', '[{"itemId":"poke-ball","chance":0.3,"min":2,"max":5},{"itemId":"great-ball","chance":0.4,"min":1,"max":3},{"itemId":"ultra-ball","chance":0.3,"min":1,"max":2},{"itemId":"dragon-scale","chance":0.005,"min":1,"max":1}]'),
  ('butin-zone-tunnel-merazon', '[{"itemId":"poke-ball","chance":0.7,"min":1,"max":3},{"itemId":"great-ball","chance":0.05,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-zone-tunnel-roche', '[{"itemId":"poke-ball","chance":0.6,"min":1,"max":3},{"itemId":"great-ball","chance":0.2,"min":1,"max":2},{"itemId":"pomeg-berry","chance":0.01,"min":1,"max":1}]')
  ) AS v("id", "entries")
WHERE cv."id" = l."content_version_id" AND cv."status" IN ('published', 'draft') AND l."id" = v."id";--> statement-breakpoint
-- Anciennes tables partagées : retirées, sauf si une zone, un dresseur ou un donjon s'en sert encore.
DELETE FROM "loot_tables" l
USING "content_versions" cv
WHERE cv."id" = l."content_version_id" AND cv."status" IN ('published', 'draft')
  AND l."id" IN ('butin-route', 'butin-foret', 'butin-grotte', 'butin-mer', 'butin-elite', 'butin-fouilles', 'butin-fouilles-hoenn', 'butin-fouilles-sinnoh')
  AND NOT EXISTS (SELECT 1 FROM "zones" z WHERE z."content_version_id" = l."content_version_id" AND z."loot_table_id" = l."id")
  AND NOT EXISTS (SELECT 1 FROM "trainers" t WHERE t."content_version_id" = l."content_version_id" AND t."loot_table_id" = l."id")
  AND NOT EXISTS (SELECT 1 FROM "dungeons" dj WHERE dj."content_version_id" = l."content_version_id" AND dj."loot_table_id" = l."id");--> statement-breakpoint
-- Parcelles de ferme : prix × 1,5 à chaque achat.
UPDATE "items" i
SET "effects" = '[{"type":"farmPlot","priceGrowth":1.5}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = i."content_version_id" AND cv."status" IN ('published', 'draft') AND i."id" = 'parcelle-ferme';--> statement-breakpoint
-- Boutique : Pierre Stase et Nœud Destin en catégorie Élevage (réglés comme dans l'admin s'ils y sont déjà).
INSERT INTO "shop_entries" ("content_version_id", "id", "item_id", "category_id", "order", "price", "lot_size", "unlock", "locked_visibility", "purchase_limit", "available_from", "available_until", "enabled", "gift")
SELECT cv."id", v."id", v."id", 'elevage', v."order", v."price", 1, v."unlock"::jsonb, 'hidden', NULL, NULL, NULL, true, NULL
FROM "content_versions" cv
CROSS JOIN (VALUES
  ('everstone', 8, 10000, '{"type":"badgeCount","count":3,"regionId":"kanto"}'),
  ('destiny-knot', 9, 30000, '{"type":"badgeCount","count":6,"regionId":"kanto"}')
) AS v("id", "order", "price", "unlock")
WHERE cv."status" IN ('published', 'draft')
  AND EXISTS (SELECT 1 FROM "items" i WHERE i."content_version_id" = cv."id" AND i."id" = v."id")
  AND EXISTS (SELECT 1 FROM "shop_categories" c WHERE c."content_version_id" = cv."id" AND c."id" = 'elevage')
ON CONFLICT ("content_version_id", "id") DO UPDATE SET
  "category_id" = EXCLUDED."category_id", "order" = EXCLUDED."order", "price" = EXCLUDED."price",
  "unlock" = EXCLUDED."unlock", "locked_visibility" = EXCLUDED."locked_visibility",
  "purchase_limit" = EXCLUDED."purchase_limit";--> statement-breakpoint
-- Articles masqués tant qu'ils sont verrouillés ; Pilule Talent débloquée avec la région de Hoenn.
UPDATE "shop_entries" e
SET "locked_visibility" = 'hidden'
FROM "content_versions" cv
WHERE cv."id" = e."content_version_id" AND cv."status" IN ('published', 'draft')
  AND e."id" IN ('ultra-ball', 'great-ball', 'revive', 'ability-patch', 'ability-capsule');--> statement-breakpoint
UPDATE "shop_entries" e
SET "unlock" = '{"type":"regionUnlocked","regionId":"hoenn"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = e."content_version_id" AND cv."status" IN ('published', 'draft') AND e."id" = 'ability-capsule';--> statement-breakpoint
-- Catégorie Évolution retirée, seulement si elle ne contient plus aucun article.
DELETE FROM "shop_categories" c
USING "content_versions" cv
WHERE cv."id" = c."content_version_id" AND cv."status" IN ('published', 'draft') AND c."id" = 'evolution'
  AND NOT EXISTS (SELECT 1 FROM "shop_entries" e WHERE e."content_version_id" = c."content_version_id" AND e."category_id" = 'evolution');
