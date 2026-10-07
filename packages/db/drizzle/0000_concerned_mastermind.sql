CREATE TYPE "public"."content_version_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pokemon_origin" AS ENUM('capture', 'egg', 'quest');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'player' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_settings" (
	"content_version_id" integer PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" "content_version_status" NOT NULL,
	"label" text NOT NULL,
	"based_on_id" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"species_ids" jsonb NOT NULL,
	"unlock" jsonb NOT NULL,
	CONSTRAINT "regions_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "daycare_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"slot_index" smallint NOT NULL,
	"parent_a_id" uuid,
	"parent_b_id" uuid,
	"started_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "eggs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"species_id" integer NOT NULL,
	"parent_a_id" uuid,
	"parent_b_id" uuid,
	"content_version_id" integer NOT NULL,
	"hatch_at" timestamp with time zone NOT NULL,
	"seed" bigint NOT NULL,
	"hatched" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expeditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"zone_id" text NOT NULL,
	"slot_index" smallint NOT NULL,
	"team" jsonb NOT NULL,
	"content_version_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"seed" bigint NOT NULL,
	"claimed_at" timestamp with time zone,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"owner_id" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_owner_id_item_id_pk" PRIMARY KEY("owner_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "pity_counters" (
	"owner_id" text NOT NULL,
	"species_id" integer NOT NULL,
	"misses" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pity_counters_owner_id_species_id_pk" PRIMARY KEY("owner_id","species_id")
);
--> statement-breakpoint
CREATE TABLE "player_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"trainer_name" text NOT NULL,
	"region_unlocked" text NOT NULL,
	"currency" bigint DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokedex" (
	"owner_id" text NOT NULL,
	"species_id" integer NOT NULL,
	"seen" boolean DEFAULT false NOT NULL,
	"caught" boolean DEFAULT false NOT NULL,
	"caught_shiny" boolean DEFAULT false NOT NULL,
	"first_caught_at" timestamp with time zone,
	CONSTRAINT "pokedex_owner_id_species_id_pk" PRIMARY KEY("owner_id","species_id")
);
--> statement-breakpoint
CREATE TABLE "pokemon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"species_id" integer NOT NULL,
	"form_id" integer,
	"level" smallint DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"iv_hp" smallint NOT NULL,
	"iv_atk" smallint NOT NULL,
	"iv_def" smallint NOT NULL,
	"iv_spa" smallint NOT NULL,
	"iv_spd" smallint NOT NULL,
	"iv_spe" smallint NOT NULL,
	"nature" text NOT NULL,
	"nature_override" text,
	"ability" text NOT NULL,
	"is_shiny" boolean DEFAULT false NOT NULL,
	"gender" text NOT NULL,
	"happiness" smallint DEFAULT 0 NOT NULL,
	"origin" "pokemon_origin" NOT NULL,
	"origin_region" text,
	"caught_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_progress" (
	"owner_id" text NOT NULL,
	"quest_id" text NOT NULL,
	"content_version_id" integer NOT NULL,
	"step" smallint DEFAULT 0 NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "quest_progress_owner_id_quest_id_pk" PRIMARY KEY("owner_id","quest_id")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_settings" ADD CONSTRAINT "balance_settings_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_slots" ADD CONSTRAINT "daycare_slots_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_slots" ADD CONSTRAINT "daycare_slots_parent_a_id_pokemon_id_fk" FOREIGN KEY ("parent_a_id") REFERENCES "public"."pokemon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_slots" ADD CONSTRAINT "daycare_slots_parent_b_id_pokemon_id_fk" FOREIGN KEY ("parent_b_id") REFERENCES "public"."pokemon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eggs" ADD CONSTRAINT "eggs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eggs" ADD CONSTRAINT "eggs_parent_a_id_pokemon_id_fk" FOREIGN KEY ("parent_a_id") REFERENCES "public"."pokemon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eggs" ADD CONSTRAINT "eggs_parent_b_id_pokemon_id_fk" FOREIGN KEY ("parent_b_id") REFERENCES "public"."pokemon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eggs" ADD CONSTRAINT "eggs_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pity_counters" ADD CONSTRAINT "pity_counters_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokedex" ADD CONSTRAINT "pokedex_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokemon" ADD CONSTRAINT "pokemon_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_versions_one_published" ON "content_versions" USING btree ("status") WHERE "content_versions"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "content_versions_one_draft" ON "content_versions" USING btree ("status") WHERE "content_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "daycare_slots_owner_slot" ON "daycare_slots" USING btree ("owner_id","slot_index");--> statement-breakpoint
CREATE INDEX "eggs_owner" ON "eggs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "expeditions_owner_claimed" ON "expeditions" USING btree ("owner_id","claimed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "player_profiles_trainer_name_lower" ON "player_profiles" USING btree (lower("trainer_name"));--> statement-breakpoint
CREATE INDEX "pokemon_owner_species" ON "pokemon" USING btree ("owner_id","species_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_at" ON "admin_audit_log" USING btree ("at");