CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "eggs" ADD COLUMN "form_id" integer;--> statement-breakpoint
ALTER TABLE "eggs" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trainer_battles" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_owner" ON "push_subscriptions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "eggs_to_notify" ON "eggs" USING btree ("hatch_at") WHERE "eggs"."hatched" = false and "eggs"."notified_at" is null;--> statement-breakpoint
CREATE INDEX "expeditions_to_notify" ON "expeditions" USING btree ("ends_at") WHERE "expeditions"."claimed_at" is null and "expeditions"."notified_at" is null;--> statement-breakpoint
CREATE INDEX "trainer_battles_to_notify" ON "trainer_battles" USING btree ("ends_at") WHERE "trainer_battles"."claimed_at" is null and "trainer_battles"."notified_at" is null;