CREATE TABLE "pokemon_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "tag_id" uuid;--> statement-breakpoint
ALTER TABLE "pokemon_tags" ADD CONSTRAINT "pokemon_tags_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pokemon_tags_owner" ON "pokemon_tags" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "pokemon" ADD CONSTRAINT "pokemon_tag_id_pokemon_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."pokemon_tags"("id") ON DELETE set null ON UPDATE no action;