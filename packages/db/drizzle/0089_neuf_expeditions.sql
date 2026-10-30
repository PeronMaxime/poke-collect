-- Jusqu'à 9 expéditions simultanées (au lieu de 6).
UPDATE "balance_settings"
SET "data" = jsonb_set("data", '{expeditions,maxSlots}', '9'::jsonb);
