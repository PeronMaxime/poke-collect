-- Contenu de test : expéditions plus courtes et plus généreuses, dans toutes les versions de contenu.
-- Durées 2 min, 5 min, 15 min, 1 h, 4 h, 8 h ; 20 rencontres et 10 tirages de butin par heure.
UPDATE "balance_settings" SET "data" = jsonb_set("data", '{expeditions}', ("data"->'expeditions') || '{"durationsMinutes":[2,5,15,60,240,480],"encountersPerHour":20,"lootRollsPerHour":10}'::jsonb);--> statement-breakpoint
UPDATE "zones" SET "durations_minutes" = '[2,5,15,60,240,480]'::jsonb WHERE "durations_minutes" = '[15,60,240,480]'::jsonb;
