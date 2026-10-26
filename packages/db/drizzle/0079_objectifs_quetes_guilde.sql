-- Objectifs des quêtes de guilde en cours : ils suivent maintenant les arrivées de membres. Remise
-- à niveau des quêtes non terminées de la dernière semaine tirée (jamais à la baisse).
UPDATE "guild_weekly_quests" w
SET "target" = GREATEST(q."min_count", q."count_per_member" * GREATEST(1, (
  SELECT count(*)::int FROM "guild_members" m WHERE m."guild_id" = w."guild_id"
)))
FROM "guild_quests" q
JOIN "content_versions" v ON v."id" = q."content_version_id" AND v."status" = 'published'
WHERE q."id" = w."quest_id"
  AND w."completed_at" IS NULL
  AND w."week" = (SELECT max("week") FROM "guild_weekly_quests")
  AND GREATEST(q."min_count", q."count_per_member" * GREATEST(1, (
    SELECT count(*)::int FROM "guild_members" m WHERE m."guild_id" = w."guild_id"
  ))) > w."target";
