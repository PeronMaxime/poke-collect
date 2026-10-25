-- « Chromatique » partout au lieu de « shiny » : description du Charme Chroma, seulement si
-- elle n'a pas été changée dans l'admin.
UPDATE "items" SET "description" = 'Il suffit de l’avoir dans son sac : les Pokémon chromatiques apparaissent 3 fois plus souvent.'
WHERE "id" = 'shiny-charm'
  AND "description" = 'Il suffit de l’avoir dans son sac : les Pokémon shiny apparaissent 3 fois plus souvent.';
