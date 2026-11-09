-- Pokémon favori du dresseur (Fiche Dresseur, classements, recherche, guilde) ; null : le starter.
ALTER TABLE "player_profiles" ADD COLUMN "favorite_species_id" integer;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "favorite_form_id" integer;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN "favorite_shiny" boolean DEFAULT false NOT NULL;