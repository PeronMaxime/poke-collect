-- Quêtes de guilde du jour en plus de celles de la semaine, chacune facile ou difficile.
-- Modèles : la rareté devient une difficulté (Bronze et Argent → facile, Or → difficile).
ALTER TABLE "guild_quests" ADD COLUMN "difficulty" text;--> statement-breakpoint
UPDATE "guild_quests" SET "difficulty" = CASE WHEN "rarity" = 'gold' THEN 'hard' ELSE 'easy' END;--> statement-breakpoint
ALTER TABLE "guild_quests" ALTER COLUMN "difficulty" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_quests" DROP COLUMN "rarity";--> statement-breakpoint
-- Quêtes tirées : période (les quêtes déjà tirées sont celles de la semaine) et difficulté.
ALTER TABLE "guild_weekly_quests" ADD COLUMN "period" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_weekly_quests" ADD COLUMN "difficulty" text DEFAULT 'easy' NOT NULL;--> statement-breakpoint
UPDATE "guild_weekly_quests" SET "difficulty" = 'hard' WHERE "rarity" = 'gold';--> statement-breakpoint
ALTER TABLE "guild_weekly_quests" DROP CONSTRAINT "guild_weekly_quests_guild_id_week_slot_pk";--> statement-breakpoint
ALTER TABLE "guild_weekly_quests" ADD CONSTRAINT "guild_weekly_quests_guild_id_period_week_slot_pk" PRIMARY KEY("guild_id","period","week","slot");--> statement-breakpoint
ALTER TABLE "guild_quest_contributions" ADD COLUMN "period" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_quest_contributions" DROP CONSTRAINT "guild_quest_contributions_guild_id_week_slot_user_id_pk";--> statement-breakpoint
ALTER TABLE "guild_quest_contributions" ADD CONSTRAINT "guild_quest_contributions_guild_id_period_week_slot_user_id_pk" PRIMARY KEY("guild_id","period","week","slot","user_id");--> statement-breakpoint
-- Équilibrage : nombre, multiplicateur d'objectif et coffre par période et difficulté.
UPDATE "balance_settings"
SET "data" = jsonb_set(
  "data" #- '{guilds,weeklyQuests}',
  '{guilds,quests}',
  '{"daily":{"easy":{"count":2,"multiplier":4,"chest":"bronze"},"hard":{"count":1,"multiplier":6,"chest":"silver"}},"weekly":{"easy":{"count":2,"multiplier":50,"chest":"silver"},"hard":{"count":1,"multiplier":100,"chest":"gold"}}}'::jsonb
)
WHERE "data" ? 'guilds' AND NOT ("data"->'guilds' ? 'quests');
