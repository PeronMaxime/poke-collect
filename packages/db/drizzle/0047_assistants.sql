CREATE TABLE "assistants" (
	"owner_id" text NOT NULL,
	"post" text NOT NULL,
	"pokemon_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistants_owner_id_post_pk" PRIMARY KEY("owner_id","post")
);
--> statement-breakpoint
ALTER TABLE "eggs" ADD COLUMN "helper" jsonb;--> statement-breakpoint
ALTER TABLE "fossil_revivals" ADD COLUMN "helper" jsonb;--> statement-breakpoint
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistants_pokemon" ON "assistants" USING btree ("pokemon_id");