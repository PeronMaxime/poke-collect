CREATE TABLE "dungeons" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"region_id" text NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"boss" jsonb NOT NULL,
	"boss_hp_multiplier" double precision NOT NULL,
	"family_species_ids" jsonb NOT NULL,
	"opponents" jsonb NOT NULL,
	"time_limit_seconds" integer NOT NULL,
	"cooldown_minutes" integer,
	"ko_minutes" integer,
	"money" integer NOT NULL,
	"loot_table_id" text,
	"loot_rolls" integer NOT NULL,
	"gem_item_id" text,
	"gem_chance" double precision NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"unlock" jsonb NOT NULL,
	CONSTRAINT "dungeons_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "dungeon_progress" (
	"owner_id" text NOT NULL,
	"dungeon_id" text NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"gems" integer DEFAULT 0 NOT NULL,
	"first_win_at" timestamp with time zone,
	"last_ended_at" timestamp with time zone,
	CONSTRAINT "dungeon_progress_owner_id_dungeon_id_pk" PRIMARY KEY("owner_id","dungeon_id")
);
--> statement-breakpoint
CREATE TABLE "dungeon_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"dungeon_id" text NOT NULL,
	"team" jsonb NOT NULL,
	"setup" jsonb NOT NULL,
	"commands" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_version_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"fled_at_ms" integer,
	"claimed_at" timestamp with time zone,
	"outcome" text,
	"result" jsonb
);
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "dungeon_move" jsonb;--> statement-breakpoint
ALTER TABLE "dungeons" ADD CONSTRAINT "dungeons_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_progress" ADD CONSTRAINT "dungeon_progress_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_runs" ADD CONSTRAINT "dungeon_runs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_runs" ADD CONSTRAINT "dungeon_runs_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dungeon_runs_owner_claimed" ON "dungeon_runs" USING btree ("owner_id","claimed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dungeon_runs_owner_active" ON "dungeon_runs" USING btree ("owner_id") WHERE "dungeon_runs"."claimed_at" is null;