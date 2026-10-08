ALTER TYPE "public"."pokemon_origin" ADD VALUE 'fossil';--> statement-breakpoint
CREATE TABLE "fossil_revivals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"item_id" text NOT NULL,
	"species_id" integer NOT NULL,
	"form_id" integer,
	"level" smallint NOT NULL,
	"content_version_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone NOT NULL,
	"seed" bigint NOT NULL,
	"revived_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"pokemon_id" uuid
);
--> statement-breakpoint
ALTER TABLE "fossil_revivals" ADD CONSTRAINT "fossil_revivals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fossil_revivals" ADD CONSTRAINT "fossil_revivals_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fossil_revivals" ADD CONSTRAINT "fossil_revivals_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fossil_revivals_owner_active" ON "fossil_revivals" USING btree ("owner_id") WHERE "fossil_revivals"."revived_at" is null;--> statement-breakpoint
CREATE INDEX "fossil_revivals_to_notify" ON "fossil_revivals" USING btree ("ready_at") WHERE "fossil_revivals"."revived_at" is null and "fossil_revivals"."notified_at" is null;