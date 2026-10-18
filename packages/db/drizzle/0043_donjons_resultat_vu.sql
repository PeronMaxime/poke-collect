ALTER TABLE "dungeon_runs" ADD COLUMN "result_seen_at" timestamp with time zone;--> statement-breakpoint
-- Résultats déjà réclamés : considérés comme vus (sinon ils réapparaîtraient sur chaque appareil).
UPDATE "dungeon_runs" SET "result_seen_at" = "claimed_at" WHERE "claimed_at" IS NOT NULL;
