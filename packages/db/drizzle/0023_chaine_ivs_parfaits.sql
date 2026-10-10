-- Chaîne de zone : IV parfaits garantis aux Pokémon sauvages (1 IV à 5 maillons, 2 à 10…).
-- Ajouté seulement là où le réglage manque ; les autres réglages shiny restent intacts.
UPDATE "balance_settings" SET "data" = jsonb_set("data", '{shiny,chainPerfectIvThresholds}', '[5,10,15,20]'::jsonb)
WHERE NOT ("data"->'shiny' ? 'chainPerfectIvThresholds');
