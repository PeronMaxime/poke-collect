-- Collections des Méga-Évolutions et des formes Gigamax : sans leurs Pokémon de base (demande du
-- 23 nov.), les formes seules. Seulement là où la liste d'espèces est encore celle de 0149 ; la
-- description et la récompense ne changent que si elles n'ont pas été réglées dans l'admin.
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '21 Méga-Évolutions à obtenir, Pokémon de base compris.' THEN '21 Méga-Évolutions à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":3}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":3}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'mega-kanto' AND "species_ids" = '[3,6,9,15,18,26,36,65,71,80,94,115,121,127,130,142,149,150]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '12 formes Gigamax à obtenir, Pokémon de base compris.' THEN '12 formes Gigamax à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"money","percent":3}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"money","percent":2}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'gigamax-kanto' AND "species_ids" = '[3,6,9,12,25,52,68,94,99,131,133,143]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '9 Méga-Évolutions à obtenir, Pokémon de base compris.' THEN '9 Méga-Évolutions à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":3}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":2}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'mega-johto' AND "species_ids" = '[154,160,181,208,212,214,227,229,248]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '22 Méga-Évolutions à obtenir, Pokémon de base compris.' THEN '22 Méga-Évolutions à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":3}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":3}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'mega-hoenn' AND "species_ids" = '[254,257,260,282,302,303,306,308,310,319,323,334,354,358,359,362,373,376,380,381,384]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '11 Méga-Évolutions à obtenir, Pokémon de base compris.' THEN '11 Méga-Évolutions à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":3}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":2}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'mega-sinnoh' AND "species_ids" = '[398,428,445,448,460,475,478,485,491]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '8 Méga-Évolutions à obtenir, Pokémon de base compris.' THEN '8 Méga-Évolutions à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":3}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":2}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'mega-unys' AND "species_ids" = '[500,530,531,545,560,604,609,623]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = 'Une forme Gigamax à obtenir, Pokémon de base compris.' THEN 'Une forme Gigamax à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"money","percent":1}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"money","percent":1}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'gigamax-unys' AND "species_ids" = '[569]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '13 Méga-Évolutions à obtenir, Pokémon de base compris.' THEN '13 Méga-Évolutions à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":3}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":2}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'mega-kalos' AND "species_ids" = '[652,655,658,668,670,678,687,689,691,701,718,719]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '6 Méga-Évolutions à obtenir, Pokémon de base compris.' THEN '6 Méga-Évolutions à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":2}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":2}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'mega-alola' AND "species_ids" = '[740,768,780,801,807]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = 'Une forme Gigamax à obtenir, Pokémon de base compris.' THEN 'Une forme Gigamax à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"money","percent":1}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"money","percent":1}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'gigamax-alola' AND "species_ids" = '[809]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = 'Une Méga-Évolution à obtenir, Pokémon de base compris.' THEN 'Une Méga-Évolution à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":1}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":1}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'mega-galar' AND "species_ids" = '[870]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '21 formes Gigamax à obtenir, Pokémon de base compris.' THEN '21 formes Gigamax à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"money","percent":3}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"money","percent":3}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'gigamax-galar' AND "species_ids" = '[812,815,818,823,826,834,839,841,842,844,849,851,858,861,869,879,884,890,892]'::jsonb;--> statement-breakpoint
UPDATE "collections" SET "species_ids" = '[]'::jsonb,
  "description" = CASE WHEN "description" = '6 Méga-Évolutions à obtenir, Pokémon de base compris.' THEN '6 Méga-Évolutions à obtenir.' ELSE "description" END,
  "rewards" = CASE WHEN "rewards" = '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":2}]}'::jsonb THEN '{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"capture","percent":2}]}'::jsonb ELSE "rewards" END
WHERE "id" = 'mega-paldea' AND "species_ids" = '[952,970,978,998]'::jsonb;
