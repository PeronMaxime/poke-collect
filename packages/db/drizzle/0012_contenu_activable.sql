ALTER TABLE "quests" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Pour l'instant, seule Kanto est jouable : les autres régions (et donc leurs zones, dresseurs
-- et quêtes) sont désactivées dans toutes les versions de contenu existantes.
UPDATE "regions" SET "enabled" = false WHERE "id" <> 'kanto';
