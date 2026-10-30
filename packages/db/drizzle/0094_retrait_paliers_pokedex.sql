-- Retrait des paliers du Pokédex. Leurs emplacements d'expédition et pensions deviennent des
-- paliers de bâtiments (Progression → Bâtiments) : même seuil du Pokédex régional, débloqués sans
-- rien réclamer. Les paliers nationaux ou shiny n'en donnaient pas ; objets, argent et bonus déjà
-- reçus restent acquis.
UPDATE "balance_settings" AS b
SET "data" = jsonb_set(
  b."data",
  '{facilityUnlocks}',
  COALESCE(b."data" -> 'facilityUnlocks', '{}'::jsonb)
    || jsonb_build_object(
      'expedition',
      COALESCE(b."data" #> '{facilityUnlocks,expedition}', '[]'::jsonb) || COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'amount', (m."rewards" ->> 'expeditionSlots')::int,
          'unlock', jsonb_build_object('type', 'regionDexPercent', 'regionId', m."region_id", 'percent', m."percent")
        ) ORDER BY m."order", m."percent")
        FROM "dex_milestones" m
        WHERE m."content_version_id" = b."content_version_id" AND m."region_id" IS NOT NULL
          AND NOT m."shiny" AND (m."rewards" ->> 'expeditionSlots')::int > 0
      ), '[]'::jsonb),
      'daycare',
      COALESCE(b."data" #> '{facilityUnlocks,daycare}', '[]'::jsonb) || COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'amount', (m."rewards" ->> 'daycareSlots')::int,
          'unlock', jsonb_build_object('type', 'regionDexPercent', 'regionId', m."region_id", 'percent', m."percent")
        ) ORDER BY m."order", m."percent")
        FROM "dex_milestones" m
        WHERE m."content_version_id" = b."content_version_id" AND m."region_id" IS NOT NULL
          AND NOT m."shiny" AND (m."rewards" ->> 'daycareSlots')::int > 0
      ), '[]'::jsonb)
    )
)
WHERE EXISTS (
  SELECT 1 FROM "dex_milestones" m
  WHERE m."content_version_id" = b."content_version_id" AND m."region_id" IS NOT NULL
    AND NOT m."shiny"
    AND ((m."rewards" ->> 'expeditionSlots')::int > 0 OR (m."rewards" ->> 'daycareSlots')::int > 0)
);--> statement-breakpoint
DELETE FROM "reward_claims" WHERE "kind" = 'milestone';--> statement-breakpoint
DROP TABLE "dex_milestones" CASCADE;--> statement-breakpoint
ALTER TABLE "reward_claims" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."reward_kind";--> statement-breakpoint
CREATE TYPE "public"."reward_kind" AS ENUM('collection', 'completion');--> statement-breakpoint
ALTER TABLE "reward_claims" ALTER COLUMN "kind" SET DATA TYPE "public"."reward_kind" USING "kind"::"public"."reward_kind";
