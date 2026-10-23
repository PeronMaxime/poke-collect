ALTER TABLE "pokemon" ADD COLUMN "knocked_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "heal_until" timestamp with time zone;--> statement-breakpoint
-- Les Pokémon encore K.O. (ancien repos minuté) perdent leur minuterie : comme les autres, ils
-- attendent leurs soins au Centre Pokémon.
UPDATE "pokemon" SET "knocked_out" = true WHERE "ko_until" > now();
--> statement-breakpoint
-- Réglages du Centre Pokémon, dans toutes les versions de contenu.
UPDATE "balance_settings"
SET "data" = jsonb_set("data", '{center}', '{"slots":6,"healMinutes":30}'::jsonb)
WHERE NOT ("data" ? 'center');
