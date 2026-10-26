-- Coffres de guilde distribués à la fin de la période (l'objectif peut être dépassé d'ici là).
-- Les quêtes déjà terminées ont distribué leurs coffres à la complétion.
ALTER TABLE "guild_weekly_quests" ADD COLUMN "rewarded_at" timestamp with time zone;--> statement-breakpoint
UPDATE "guild_weekly_quests" SET "rewarded_at" = "completed_at" WHERE "completed_at" IS NOT NULL;
