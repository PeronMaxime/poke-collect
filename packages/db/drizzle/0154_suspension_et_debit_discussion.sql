-- Plan de sécurité, 3.1 et 3.3 : suspension des comptes par la modération, et index des
-- messages récents d'un joueur (limite de débit de la discussion de guilde).
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
CREATE INDEX "guild_messages_user" ON "guild_messages" USING btree ("user_id","created_at");