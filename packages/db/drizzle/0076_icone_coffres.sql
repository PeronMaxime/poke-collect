-- Coffres de guilde : sprite servi par l'API (apps/api/sprites/items) au lieu d'une icône du
-- jeu web, pour l'admin aussi. Seulement si l'icône n'a pas été changée dans l'admin.
UPDATE "items" SET "icon" = NULL
WHERE "id" IN ('guild-chest-bronze', 'guild-chest-silver', 'guild-chest-gold')
  AND "icon" LIKE '/chests/%';
