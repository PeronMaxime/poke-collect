-- Les Pokémon arrivent sans talent : la Pilule Talent en donne un normal au hasard, puis l’autre.
-- Description mise à jour seulement si elle n’a pas été retouchée dans l’admin.
UPDATE "items"
SET "description" = 'Utilisée sur un Pokémon : il obtient un talent normal au hasard, ou passe à l’autre s’il en a déjà un.'
WHERE "id" = 'ability-capsule'
  AND "description" = 'Utilisée sur un Pokémon : il passe à son autre talent normal.';
