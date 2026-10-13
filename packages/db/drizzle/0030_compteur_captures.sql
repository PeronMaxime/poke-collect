CREATE TABLE "species_captures" (
	"species_id" integer PRIMARY KEY NOT NULL,
	"captured" integer DEFAULT 0 NOT NULL,
	"shiny" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
-- Point de départ : Pokémon encore dans les PC (les transférés sont perdus), starters comptés
-- dans l'espèce choisie, les autres dans leur espèce actuelle.
INSERT INTO "species_captures" ("species_id", "captured", "shiny")
SELECT s.species_id, count(*), count(*) FILTER (WHERE s.is_shiny)
FROM (
  SELECT CASE WHEN p."origin" = 'starter' THEN coalesce(
      (pp."region_starters" ->> p."origin_region")::int, pp."starter_species_id", p."species_id"
    ) ELSE p."species_id" END AS species_id,
    p."is_shiny"
  FROM "pokemon" AS p
  LEFT JOIN "player_profiles" AS pp ON pp."user_id" = p."owner_id"
) AS s
GROUP BY s.species_id;
