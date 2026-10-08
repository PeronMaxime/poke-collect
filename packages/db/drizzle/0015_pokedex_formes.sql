CREATE TABLE "pokedex_forms" (
	"owner_id" text NOT NULL,
	"form_id" integer NOT NULL,
	"caught_shiny" boolean DEFAULT false NOT NULL,
	"first_caught_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pokedex_forms_owner_id_form_id_pk" PRIMARY KEY("owner_id","form_id")
);
--> statement-breakpoint
ALTER TABLE "pokedex_forms" ADD CONSTRAINT "pokedex_forms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Rattrapage : formes des Pokémon déjà possédés.
INSERT INTO "pokedex_forms" ("owner_id", "form_id", "caught_shiny", "first_caught_at")
SELECT "owner_id", "form_id", bool_or("is_shiny"), min("caught_at")
FROM "pokemon"
WHERE "form_id" IS NOT NULL
GROUP BY "owner_id", "form_id";
