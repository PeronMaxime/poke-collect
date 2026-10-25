-- Paramètre de talent « Chance de talent caché » supprimé (les Pokémon arrivent sans talent) :
-- retiré des effets des talents (Fouille), toutes versions de contenu. Les autres effets restent.
UPDATE "abilities"
SET "effects" = (
  SELECT coalesce(jsonb_agg(e.value ORDER BY e.ordinality), '[]'::jsonb)
  FROM jsonb_array_elements("abilities"."effects") WITH ORDINALITY AS e(value, ordinality)
  WHERE e.value->>'param' IS DISTINCT FROM 'hiddenAbility'
)
WHERE "effects" @> '[{"param":"hiddenAbility"}]'::jsonb;
