ALTER TABLE "expeditions" ALTER COLUMN "zone_id" DROP NOT NULL;--> statement-breakpoint
-- Expédition légendaire de chaque Pokémon offert par une quête (toutes les versions de contenu).
-- Seuls les Pokémon sans configuration sont complétés : 4 h, aucun type requis, PE minimale de la
-- zone de la dernière étape « expédition » de la quête (0 sinon), faiblesses du Pokémon en
-- affinité (légendaires connus ; liste vide sinon, à compléter dans l'admin).
UPDATE "quests" AS q
SET "rewards" = jsonb_set(q."rewards", '{pokemon}', (
  SELECT coalesce(jsonb_agg(
    CASE WHEN e.p ? 'expedition' THEN e.p
    ELSE e.p || jsonb_build_object('expedition', jsonb_build_object(
      'durationMinutes', 240,
      'minPower', coalesce((
        SELECT z."min_power" FROM "zones" AS z
        WHERE z."content_version_id" = q."content_version_id"
          AND z."id" = (
            SELECT s.step -> 'condition' ->> 'zoneId'
            FROM jsonb_array_elements(q."steps") WITH ORDINALITY AS s(step, n)
            WHERE s.step -> 'condition' ->> 'type' = 'expedition'
            ORDER BY s.n DESC LIMIT 1
          )
      ), 0),
      'requiredTypes', '[]'::jsonb,
      'affinityTypes', coalesce(w.types, '[]'::jsonb)
    )) END
    ORDER BY e.n
  ), '[]'::jsonb)
  FROM jsonb_array_elements(q."rewards" -> 'pokemon') WITH ORDINALITY AS e(p, n)
  LEFT JOIN (VALUES
    (144, '["rock","steel","fire","electric"]'::jsonb),
    (145, '["rock","ice"]'::jsonb),
    (146, '["rock","water","electric"]'::jsonb),
    (150, '["bug","ghost","dark"]'::jsonb),
    (151, '["bug","ghost","dark"]'::jsonb),
    (243, '["ground"]'::jsonb),
    (244, '["ground","rock","water"]'::jsonb),
    (245, '["grass","electric"]'::jsonb),
    (249, '["rock","ghost","electric","ice","dark"]'::jsonb),
    (250, '["rock","water","electric"]'::jsonb),
    (251, '["flying","poison","bug","ghost","fire","ice","dark"]'::jsonb)
  ) AS w(species_id, types) ON w.species_id = (e.p ->> 'speciesId')::int
));
