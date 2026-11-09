-- Expéditions : rencontres de plus en plus espacées et 24 h au plus.
-- Allongement figé au départ : les expéditions déjà parties (0) gardent leur rythme constant.
ALTER TABLE "expeditions" ADD COLUMN "encounter_interval_growth_minutes" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
-- +30 s entre deux rencontres à chaque heure passée (par palier), toutes les versions de contenu.
UPDATE "balance_settings"
SET "data" = jsonb_set("data", '{expeditions,encounterIntervalGrowthMinutes}', '0.5'::jsonb)
WHERE NOT ("data"->'expeditions' ? 'encounterIntervalGrowthMinutes');--> statement-breakpoint
-- 24 h au plus au lieu de 48 h (seulement là où la valeur de départ n'a pas été modifiée dans
-- l'admin). Les expéditions déjà parties gardent leur date de retour.
UPDATE "balance_settings"
SET "data" = jsonb_set("data", '{expeditions,maxDurationMinutes}', '1440'::jsonb)
WHERE ("data"->'expeditions'->>'maxDurationMinutes')::numeric = 2880;
