-- Complétion des expéditions (normale) : +2 % d'XP par expédition complétée pour les Pokémon de
-- la région de l'expédition, quelle que soit la source d'XP. Ajoutée seulement là où la règle
-- n'existe pas encore (réglable dans l'admin, Progression → Complétion d'expédition).
UPDATE "balance_settings"
SET "data" = jsonb_set(
  "data",
  '{expeditionCompletions}',
  COALESCE("data"->'expeditionCompletions', '[]'::jsonb)
    || '[{"id":"expedition-complete","name":"Expédition complétée","scope":"zone","regionId":null,"zoneId":null,"shiny":false,"rewards":{"currency":0,"items":[],"expeditionSlots":0,"daycareSlots":0,"incubators":0,"bonuses":[]},"regionBonuses":[{"type":"xp","percent":2}]}]'::jsonb
)
WHERE NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE("data"->'expeditionCompletions', '[]'::jsonb)) AS c
  WHERE c->>'id' = 'expedition-complete'
);
