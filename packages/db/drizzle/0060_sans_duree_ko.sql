ALTER TABLE "dungeons" DROP COLUMN "ko_minutes";--> statement-breakpoint
ALTER TABLE "trainers" DROP COLUMN "ko_minutes";--> statement-breakpoint
-- Durées de K.O. de l'équilibrage, inutiles depuis le Centre Pokémon.
UPDATE "balance_settings"
SET "data" = jsonb_set(
  jsonb_set("data", '{battles}', ("data"->'battles') - 'koMinutes'),
  '{dungeons}',
  ("data"->'dungeons') - 'koMinutes'
)
WHERE "data"->'battles' ? 'koMinutes' OR "data"->'dungeons' ? 'koMinutes';
