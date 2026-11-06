CREATE TABLE "legendary_battles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"quest_id" text NOT NULL,
	"pokemon_index" smallint NOT NULL,
	"team" jsonb NOT NULL,
	"setup" jsonb NOT NULL,
	"commands" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_version_id" integer NOT NULL,
	"seed" integer NOT NULL,
	"is_shiny" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"fled_at_ms" integer,
	"claimed_at" timestamp with time zone,
	"result_seen_at" timestamp with time zone,
	"outcome" text,
	"result" jsonb,
	"ball_item_id" text,
	"captured_at" timestamp with time zone,
	"captured" boolean,
	"pokemon_id" uuid,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "legendary_battles" ADD CONSTRAINT "legendary_battles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legendary_battles" ADD CONSTRAINT "legendary_battles_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legendary_battles_owner_quest" ON "legendary_battles" USING btree ("owner_id","quest_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legendary_battles_owner_active" ON "legendary_battles" USING btree ("owner_id") WHERE "legendary_battles"."claimed_at" is null;