-- Quêtes légendaires réécrites (0123) : les joueurs existants qui n'ont pas encore capturé leur
-- légendaire refont toute la nouvelle quête, même terminée ou réclamée (ligne supprimée : elle
-- revient à l'étape 0 dès que la quête est débloquée, et sa récompense se réclame de nouveau).
-- Ceux qui l'ont déjà capturé le gardent ; s'ils le relâchent, la quête recommence aussi de zéro
-- (« restart_on_release »). Les lignes d'avant sont gardées dans « quest_progress_avant_0132 ».
CREATE TABLE IF NOT EXISTS "quest_progress_avant_0132" AS
SELECT * FROM "quest_progress"
WHERE "quest_id" IN ('electhor', 'artikodin', 'sulfura', 'mewtwo', 'mew', 'artikodin-galar', 'electhor-galar', 'sulfura-galar', 'raikou', 'entei', 'suicune', 'lugia', 'ho-oh', 'celebi', 'latias', 'latios', 'regirock', 'registeel', 'regice', 'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys');
--> statement-breakpoint
UPDATE "quest_progress" SET "restart_on_release" = true
WHERE "pokemon_caught" > 0
  AND "quest_id" IN ('electhor', 'artikodin', 'sulfura', 'mewtwo', 'mew', 'artikodin-galar', 'electhor-galar', 'sulfura-galar', 'raikou', 'entei', 'suicune', 'lugia', 'ho-oh', 'celebi', 'latias', 'latios', 'regirock', 'registeel', 'regice', 'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys');
--> statement-breakpoint
-- Combats légendaires de ces quêtes sans capture (en cours, en attente de la Ball ou terminés) :
-- ils ne valent plus rien, la quête étant à refaire.
DELETE FROM "legendary_battles" b
USING "quest_progress" p
WHERE p."owner_id" = b."owner_id" AND p."quest_id" = b."quest_id"
  AND p."pokemon_caught" = 0 AND b."captured" IS NOT TRUE
  AND p."quest_id" IN ('electhor', 'artikodin', 'sulfura', 'mewtwo', 'mew', 'artikodin-galar', 'electhor-galar', 'sulfura-galar', 'raikou', 'entei', 'suicune', 'lugia', 'ho-oh', 'celebi', 'latias', 'latios', 'regirock', 'registeel', 'regice', 'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys');
--> statement-breakpoint
DELETE FROM "quest_progress"
WHERE "pokemon_caught" = 0
  AND "quest_id" IN ('electhor', 'artikodin', 'sulfura', 'mewtwo', 'mew', 'artikodin-galar', 'electhor-galar', 'sulfura-galar', 'raikou', 'entei', 'suicune', 'lugia', 'ho-oh', 'celebi', 'latias', 'latios', 'regirock', 'registeel', 'regice', 'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys');
