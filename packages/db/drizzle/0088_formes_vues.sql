-- Formes vues du Pokédex : une forme alternative (régionale, Méga…) ne se dévoile plus parce que
-- la forme normale de l'espèce a été vue, mais quand elle est elle-même rencontrée (expédition,
-- combat). Les formes déjà capturées restent connues (pokedex_forms).
ALTER TABLE "pokedex" ADD COLUMN "seen_form_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "pokedex" ADD COLUMN "seen_shiny_form_ids" integer[] DEFAULT '{}' NOT NULL;
