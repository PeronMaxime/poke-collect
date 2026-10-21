ALTER TABLE "zones" ADD COLUMN "weather_change_chance" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "weathers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Une météo fixe devient une météo qui s'installe à la première heure et ne change plus.
UPDATE "zones" SET "weathers" = jsonb_build_array(jsonb_build_object('weather', "weather", 'weight', 1)), "weather_change_chance" = 100 WHERE "weather" IS NOT NULL;
