-- Expéditions à durée libre : durée minimum par zone (au moins 3 min, le temps d'une rencontre),
-- plafond de 48 h, rencontre toutes les 3 min, butin toutes les 6 min, baies de 10 min.
ALTER TABLE "zones" ADD COLUMN "min_duration_minutes" integer;--> statement-breakpoint
UPDATE "zones" SET "min_duration_minutes" = GREATEST(3, (
  SELECT min(d::int) FROM jsonb_array_elements_text("durations_minutes") AS d
));--> statement-breakpoint
ALTER TABLE "zones" ALTER COLUMN "min_duration_minutes" SET NOT NULL;--> statement-breakpoint
UPDATE "balance_settings"
SET "data" = jsonb_set(
  "data",
  '{expeditions}',
  ("data"->'expeditions')
    - 'durationsMinutes' - 'encountersPerHour' - 'minEncounters'
    - 'lootRollsPerHour' - 'minLootRolls' - 'durationExponent'
    || '{"maxDurationMinutes":2880,"encounterIntervalMinutes":3,"lootIntervalMinutes":6,"berryDurationMinutes":10}'::jsonb
);--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "encounter_berry_item_id" text;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "encounter_berries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "min_ends_at" timestamp with time zone;--> statement-breakpoint
-- Expéditions déjà parties : elles gardent leur date de retour.
UPDATE "expeditions" SET "min_ends_at" = "ends_at";--> statement-breakpoint
ALTER TABLE "expeditions" ALTER COLUMN "min_ends_at" SET NOT NULL;--> statement-breakpoint
-- Baies de rencontres déjà emportées : elles passent dans leurs nouvelles colonnes.
UPDATE "expeditions" e
SET "encounter_berry_item_id" = e."berry_item_id", "encounter_berries" = e."berries",
  "berry_item_id" = NULL, "berries" = 0
WHERE e."claimed_at" IS NULL AND EXISTS (
  SELECT 1 FROM "items" i
  WHERE i."content_version_id" = e."content_version_id" AND i."id" = e."berry_item_id"
    AND i."effects" @> '[{"type":"encounterBoost"}]'::jsonb
);
