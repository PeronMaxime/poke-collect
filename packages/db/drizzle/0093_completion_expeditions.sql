-- Complétion des expéditions : une couveuse en plus par région dont toutes les expéditions sont
-- complétées (chaque Pokémon capturé), +1 % de chance de chromatique par expédition complétée en
-- chromatique. Réglable dans l'admin (Progression → Complétion d'expédition).
UPDATE "balance_settings"
SET "data" = jsonb_set(
  "data",
  '{expeditionCompletions}',
  '[{"id":"region-complete","name":"Région complétée","scope":"region","regionId":null,"zoneId":null,"shiny":false,"rewards":{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":1,"bonuses":[]}},{"id":"expedition-chromatique","name":"Expédition chromatique","scope":"zone","regionId":null,"zoneId":null,"shiny":true,"rewards":{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[{"type":"shiny","percent":1}]}}]'::jsonb
)
WHERE NOT ("data" ? 'expeditionCompletions');
