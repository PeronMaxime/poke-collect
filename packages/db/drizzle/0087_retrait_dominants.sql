-- Retrait des Pokémon Dominants (formes « totem » d'Alola) : ils ne seront pas ajoutés au jeu.
-- Les Pokémon déjà obtenus reprennent la forme d'Alola (Rattatac, Ossatueur) ou leur forme par
-- défaut ; les rencontres de zones qui les citaient disparaissent.
CREATE TEMP TABLE "totem_forms" ("form_id" int PRIMARY KEY, "base_form_id" int);--> statement-breakpoint
INSERT INTO "totem_forms" VALUES
  (10093, 10092), (10149, 10115), (10121, NULL), (10122, NULL), (10150, NULL), (10153, NULL),
  (10128, NULL), (10129, NULL), (10154, NULL), (10144, NULL), (10145, NULL), (10146, NULL);--> statement-breakpoint
UPDATE "pokemon" p SET "form_id" = t."base_form_id"
FROM "totem_forms" t WHERE p."form_id" = t."form_id";--> statement-breakpoint
UPDATE "eggs" e SET "form_id" = t."base_form_id"
FROM "totem_forms" t WHERE e."form_id" = t."form_id";--> statement-breakpoint
UPDATE "fossil_revivals" f SET "form_id" = t."base_form_id"
FROM "totem_forms" t WHERE f."form_id" = t."form_id";--> statement-breakpoint
INSERT INTO "pokedex_forms" ("owner_id", "form_id", "caught_shiny", "first_caught_at")
SELECT d."owner_id", t."base_form_id", bool_or(d."caught_shiny"), min(d."first_caught_at")
FROM "pokedex_forms" d JOIN "totem_forms" t ON t."form_id" = d."form_id"
WHERE t."base_form_id" IS NOT NULL
GROUP BY 1, 2
ON CONFLICT ("owner_id", "form_id") DO UPDATE
SET "caught_shiny" = "pokedex_forms"."caught_shiny" OR excluded."caught_shiny";--> statement-breakpoint
DELETE FROM "pokedex_forms" WHERE "form_id" IN (SELECT "form_id" FROM "totem_forms");--> statement-breakpoint
UPDATE "zones" z SET "encounters" = (
  SELECT COALESCE(jsonb_agg(e ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements(z."encounters") WITH ORDINALITY AS x(e, i)
  WHERE (e->>'formId')::int IS NULL OR (e->>'formId')::int NOT IN (SELECT "form_id" FROM "totem_forms")
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(z."encounters") e
  WHERE (e->>'formId')::int IN (SELECT "form_id" FROM "totem_forms")
);--> statement-breakpoint
UPDATE "zones" SET "description" = 'Le sommet enneigé d’Ula-Ula. Les formes d’Alola y abondent.'
WHERE "id" = 'mont-lanakila'
  AND "description" = 'Le sommet enneigé d’Ula-Ula. Les formes d’Alola y abondent, et un Pokémon Dominant y règne.';--> statement-breakpoint
DROP TABLE "totem_forms";
