-- Météo des zones : 25 % de chances de changer à chaque heure (au lieu des 10 % de 0052).
UPDATE "zones" SET "weather_change_chance" = 25
WHERE "weather_change_chance" = 10
  AND "content_version_id" IN (SELECT "id" FROM "content_versions" WHERE "status" IN ('published', 'draft'));
