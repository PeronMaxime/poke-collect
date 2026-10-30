-- Déblocage progressif des onglets : Pension au 2e badge de Kanto, Musée au 6e, Quêtes après le
-- Maître de la Ligue de Kanto, Guilde une fois Johto débloqué, Donjons au 1er badge de Kalos,
-- Ferme à baies une fois Hoenn débloqué (réglages de l'admin du 29 oct.).
UPDATE "balance_settings"
SET "data" = jsonb_set(
  "data",
  '{tabUnlocks}',
  '{"daycare":{"type":"badgeCount","count":2,"regionId":"kanto"},"museum":{"type":"badgeCount","count":6,"regionId":"kanto"},"quests":{"type":"trainerDefeated","trainerId":"maitre-blue"},"guild":{"type":"regionUnlocked","regionId":"johto"},"dungeons":{"type":"badgeCount","count":1,"regionId":"kalos"},"farm":{"type":"regionUnlocked","regionId":"hoenn"}}'::jsonb
)
WHERE NOT ("data" ? 'tabUnlocks');--> statement-breakpoint
-- Quêtes de chaque région : ouvertes par la victoire contre son Maître de la Ligue (au lieu d'un
-- nombre de badges). Les quêtes qui dépendent d'autres quêtes ne changent pas.
UPDATE "quests" AS q
SET "unlock" = jsonb_build_object('type', 'trainerDefeated', 'trainerId', m."champion")
FROM (VALUES ('kanto', 'maitre-blue'), ('johto', 'maitre-peter'), ('hoenn', 'maitre-marc'))
  AS m("region_id", "champion")
WHERE q."region_id" = m."region_id"
  AND q."unlock"->>'type' = 'badgeCount'
  AND EXISTS (
    SELECT 1 FROM "trainers" t
    WHERE t."content_version_id" = q."content_version_id" AND t."id" = m."champion"
  );
--> statement-breakpoint
-- Quête de guilde « Couvée de la semaine » : objectifs relevés dans l'admin (jour et semaine).
-- Les quêtes déjà tirées gardent leur objectif jusqu'au tirage suivant.
UPDATE "guild_quests" q
SET "daily" = '{"countPerMember":40,"minCount":60}'::jsonb,
  "weekly" = '{"countPerMember":300,"minCount":450}'::jsonb
FROM "content_versions" cv
WHERE q."id" = 'eclosions'
  AND cv."id" = q."content_version_id"
  AND cv."status" IN ('published', 'draft');
