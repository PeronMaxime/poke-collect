-- Pertes de la météo (sable, grêle), de la brûlure et du poison à intervalle fixe : toutes les
-- 3 secondes, quelle que soit la vitesse (ajouté seulement s'il manque).
UPDATE "balance_settings" SET "data" = jsonb_set("data", '{combat,chipTickSeconds}', '3'::jsonb)
WHERE "data" ? 'combat' AND NOT "data"->'combat' ? 'chipTickSeconds';
--> statement-breakpoint
-- Combats légendaires renforcés : PV ×8 pour les légendaires majeurs (Mewtwo, Lugia, Ho-Oh,
-- Kyogre, Groudon), statistiques hors PV +0,1 pour tous (×1 → ×1,1, ×1,1 → ×1,2…). Toutes les
-- versions de contenu ; chaque valeur seulement si elle est encore celle d'origine (une valeur
-- changée dans l'admin est gardée). Les combats déjà lancés gardent leur légendaire.
UPDATE "quests" q SET "rewards" = jsonb_set(q."rewards", '{pokemon}', (
  SELECT jsonb_agg(
    CASE WHEN t.e ? 'battle' AND (t.e->>'speciesId')::int = c.species_id THEN
      jsonb_set(
        jsonb_set(
          t.e,
          '{battle,hpMultiplier}',
          CASE WHEN (t.e->'battle'->>'hpMultiplier')::numeric = c.old_hp
            THEN to_jsonb(c.new_hp) ELSE t.e->'battle'->'hpMultiplier' END
        ),
        '{battle,statMultiplier}',
        CASE WHEN (t.e->'battle'->>'statMultiplier')::numeric = c.old_stat
          THEN to_jsonb(c.new_stat) ELSE t.e->'battle'->'statMultiplier' END
      )
    ELSE t.e END
    ORDER BY t.i)
  FROM jsonb_array_elements(q."rewards"->'pokemon') WITH ORDINALITY AS t(e, i)
))
FROM (VALUES
  ('electhor', 145, 4::numeric, 4::numeric, 1::numeric, 1.1::numeric),
  ('artikodin', 144, 4.5, 4.5, 1.1, 1.2),
  ('sulfura', 146, 5, 5, 1.1, 1.2),
  ('mewtwo', 150, 4, 8, 1, 1.1),
  ('mew', 151, 5, 5, 1.1, 1.2),
  ('lugia', 249, 5, 8, 1.1, 1.2),
  ('ho-oh', 250, 5, 8, 1.1, 1.2),
  ('celebi', 251, 5, 5, 1.1, 1.2),
  ('regirock', 377, 6, 6, 1.1, 1.2),
  ('regice', 378, 6, 6, 1.1, 1.2),
  ('registeel', 379, 6, 6, 1.1, 1.2),
  ('kyogre', 382, 5, 8, 1.1, 1.2),
  ('groudon', 383, 5, 8, 1.1, 1.2),
  ('rayquaza', 384, 4.5, 4.5, 1.05, 1.15),
  ('jirachi', 385, 4.5, 4.5, 1.05, 1.15),
  ('deoxys', 386, 6, 6, 1.1, 1.2)
) AS c(quest_id, species_id, old_hp, new_hp, old_stat, new_stat)
WHERE q."id" = c.quest_id
  AND jsonb_typeof(q."rewards"->'pokemon') = 'array'
  AND jsonb_array_length(q."rewards"->'pokemon') > 0;
