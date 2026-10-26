-- Quêtes de guilde : plus de multiplicateur dans l'équilibrage, chaque modèle a ses propres
-- objectifs du jour et de la semaine (null = jamais tiré pour cette période). Les objectifs
-- actuels sont repris tels quels : objectif du modèle × multiplicateur de sa version de contenu.
ALTER TABLE "guild_quests" ADD COLUMN "daily" jsonb;--> statement-breakpoint
ALTER TABLE "guild_quests" ADD COLUMN "weekly" jsonb;--> statement-breakpoint
UPDATE "guild_quests" q
SET
  "daily" = jsonb_build_object(
    'countPerMember', GREATEST(1, round(q."count_per_member" * m."daily")::int),
    'minCount', GREATEST(1, round(q."min_count" * m."daily")::int)
  ),
  "weekly" = jsonb_build_object(
    'countPerMember', GREATEST(1, round(q."count_per_member" * m."weekly")::int),
    'minCount', GREATEST(1, round(q."min_count" * m."weekly")::int)
  )
FROM (
  SELECT
    q2."content_version_id",
    q2."id",
    COALESCE(
      (b."data"->'guilds'->'quests'->'daily'->q2."difficulty"->>'multiplier')::float8,
      CASE WHEN q2."difficulty" = 'hard' THEN 6 ELSE 4 END
    ) AS "daily",
    COALESCE(
      (b."data"->'guilds'->'quests'->'weekly'->q2."difficulty"->>'multiplier')::float8,
      CASE WHEN q2."difficulty" = 'hard' THEN 100 ELSE 50 END
    ) AS "weekly"
  FROM "guild_quests" q2
  LEFT JOIN "balance_settings" b ON b."content_version_id" = q2."content_version_id"
) m
WHERE m."content_version_id" = q."content_version_id" AND m."id" = q."id";--> statement-breakpoint
ALTER TABLE "guild_quests" DROP COLUMN "count_per_member";--> statement-breakpoint
ALTER TABLE "guild_quests" DROP COLUMN "min_count";--> statement-breakpoint
-- Équilibrage : les multiplicateurs disparaissent (nombre de quêtes et coffres restent).
UPDATE "balance_settings"
SET "data" = "data"
  #- '{guilds,quests,daily,easy,multiplier}'
  #- '{guilds,quests,daily,hard,multiplier}'
  #- '{guilds,quests,weekly,easy,multiplier}'
  #- '{guilds,quests,weekly,hard,multiplier}'
WHERE "data"->'guilds' ? 'quests';
