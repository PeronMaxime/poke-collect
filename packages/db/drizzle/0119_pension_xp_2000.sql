-- XP des parents en pension : 2000 par heure au lieu de 500 (seulement là où la valeur de
-- départ n'a pas été modifiée dans l'admin).
UPDATE "balance_settings"
SET "data" = jsonb_set("data", '{breeding,parentXpPerHour}', '2000'::jsonb)
WHERE ("data"->'breeding'->>'parentXpPerHour')::numeric = 500;
