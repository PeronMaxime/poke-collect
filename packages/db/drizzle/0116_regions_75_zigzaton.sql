ALTER TABLE "player_profiles" ADD COLUMN "opened_regions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Accès acquis gardé : chaque joueur garde pour de bon les régions (du contenu publié) qu'il a
-- déjà ouvertes avec le Pokédex de la région précédente, avant que le seuil passe à 75 %.
UPDATE "player_profiles" p SET "opened_regions" = coalesce((
  SELECT jsonb_agg(r."id" ORDER BY r."order")
  FROM "regions" r
  JOIN "content_versions" v ON v."id" = r."content_version_id" AND v."status" = 'published'
  JOIN "regions" prev
    ON prev."content_version_id" = r."content_version_id" AND prev."id" = r."unlock"->>'regionId'
  WHERE r."enabled" AND r."unlock"->>'type' = 'regionDexPercent'
    AND jsonb_array_length(prev."species_ids") > 0
    AND (
      SELECT count(*) FROM "pokedex" d
      WHERE d."owner_id" = p."user_id" AND d."caught"
        AND d."species_id" IN (SELECT x::int FROM jsonb_array_elements_text(prev."species_ids") AS x)
    ) * 100.0 >= (r."unlock"->>'percent')::numeric * jsonb_array_length(prev."species_ids")
), '[]'::jsonb);--> statement-breakpoint
-- Régions : 75 % du Pokédex de la région précédente au lieu de 50 %. Seuls les seuils encore à
-- 50 % changent : ceux réglés autrement dans l'admin sont gardés.
UPDATE "regions" SET "unlock" = jsonb_set("unlock", '{percent}', '75'::jsonb)
WHERE "unlock"->>'type' = 'regionDexPercent' AND ("unlock"->>'percent')::numeric = 50;--> statement-breakpoint
-- Zigzaton de Galar (forme 10174) retiré des expéditions de Hoenn : il viendra plus tard à Galar.
UPDATE "zones" SET "encounters" = (
  SELECT coalesce(jsonb_agg(t.e ORDER BY t.i), '[]'::jsonb)
  FROM jsonb_array_elements("zones"."encounters") WITH ORDINALITY AS t(e, i)
  WHERE NOT (t.e @> '{"speciesId":263,"formId":10174}'::jsonb)
)
WHERE "region_id" = 'hoenn' AND "encounters" @> '[{"speciesId":263,"formId":10174}]'::jsonb;
