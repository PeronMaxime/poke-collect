-- Combats de dresseurs en temps réel (comme les donjons) : table des combats, fin du dernier
-- combat (temps de recharge), temps imparti de chaque dresseur.
CREATE TABLE "trainer_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"trainer_id" text NOT NULL,
	"team" jsonb NOT NULL,
	"setup" jsonb NOT NULL,
	"commands" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_version_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"fled_at_ms" integer,
	"claimed_at" timestamp with time zone,
	"result_seen_at" timestamp with time zone,
	"outcome" text,
	"result" jsonb
);
--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "time_limit_seconds" integer;--> statement-breakpoint
-- 1 min, plus 30 s par Pokémon du dresseur (toutes les versions : structure du contenu).
UPDATE "trainers" SET "time_limit_seconds" = 60 + 30 * jsonb_array_length("team");--> statement-breakpoint
ALTER TABLE "trainers" ALTER COLUMN "time_limit_seconds" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trainer_progress" ADD COLUMN "last_ended_at" timestamp with time zone;--> statement-breakpoint
-- La recharge d'un dresseur répétable partait de la dernière victoire.
UPDATE "trainer_progress" SET "last_ended_at" = "last_win_at";--> statement-breakpoint
-- Combats à minuterie en cours : annulés (l'équipe redevient disponible), l'historique reste.
DELETE FROM "trainer_battles" WHERE "claimed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "trainer_runs" ADD CONSTRAINT "trainer_runs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_runs" ADD CONSTRAINT "trainer_runs_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trainer_runs_owner_claimed" ON "trainer_runs" USING btree ("owner_id","claimed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trainer_runs_owner_active" ON "trainer_runs" USING btree ("owner_id") WHERE "trainer_runs"."claimed_at" is null;
