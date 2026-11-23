-- Expéditions : tirages de butin de plus en plus espacés, comme les rencontres (17 nov.).
-- Allongement figé au départ : les expéditions déjà parties (0) gardent leur butin à rythme constant.
ALTER TABLE "expeditions" ADD COLUMN "loot_interval_growth_minutes" double precision DEFAULT 0 NOT NULL;
