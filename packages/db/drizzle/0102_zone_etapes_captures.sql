-- Étapes de capture limitées à une zone : celles qui la nomment déjà dans leur description.
-- Ciblé : seulement si l'étape n'a pas été modifiée et que la zone existe dans la version.
UPDATE "quests" q
SET "steps" = jsonb_set(q."steps", '{1,condition,zoneId}', to_jsonb(v."zone_id"))
FROM (VALUES
  ('electhor', 'Courts-circuits', 'electric', 'centrale'),
  ('artikodin', 'Le froid des îles', 'ice', 'iles-ecume'),
  ('sulfura', 'Coulées de lave', 'fire', 'mont-braise')
) AS v("quest_id", "step_name", "pokemon_type", "zone_id"), "content_versions" cv
WHERE cv."id" = q."content_version_id" AND cv."status" IN ('published', 'draft')
  AND q."id" = v."quest_id"
  AND q."steps"->1->>'name' = v."step_name"
  AND q."steps"->1->'condition'->>'type' = 'catchPokemon'
  AND q."steps"->1->'condition'->>'pokemonType' = v."pokemon_type"
  AND EXISTS (SELECT 1 FROM "zones" z WHERE z."content_version_id" = q."content_version_id" AND z."id" = v."zone_id");
