-- Nouvelles catégories d'objets du Sac : « Soin » (Rappel) et « Entraînement » (Super Bonbon).
-- Seulement s'ils sont encore en « Divers », pour ne pas écraser une catégorie choisie dans
-- l'admin. Toutes les versions de contenu.
UPDATE "items" SET "category" = 'heal' WHERE "id" = 'revive' AND "category" = 'misc';
--> statement-breakpoint
UPDATE "items" SET "category" = 'training' WHERE "id" = 'rare-candy' AND "category" = 'misc';
