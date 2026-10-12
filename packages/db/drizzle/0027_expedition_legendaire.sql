ALTER TABLE "expeditions" ADD COLUMN "quest_id" text;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD COLUMN "pokemon_caught" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Les quêtes déjà réclamées ont offert leurs Pokémon directement : rien à capturer.
UPDATE "quest_progress" SET "pokemon_caught" = 6 WHERE "claimed_at" IS NOT NULL;
