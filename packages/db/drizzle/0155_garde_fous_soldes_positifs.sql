-- Phase 4.1 du plan de sécurité : garde-fous CHECK (argent, quantités, Balls et baies réservées,
-- niveau et XP). Le code vérifie déjà avant de débiter ; une future erreur de logique est refusée
-- (409 INVALID_STATE, signalée dans la Santé de l'API) au lieu d'être enregistrée.
-- Une valeur déjà négative (aucune attendue) est d'abord ramenée à la borne, pour que la mise en
-- production n'échoue pas sur une ligne ancienne.
UPDATE "player_profiles" SET "currency" = 0 WHERE "currency" < 0;--> statement-breakpoint
UPDATE "player_profiles" SET "farm_plots" = 0 WHERE "farm_plots" < 0;--> statement-breakpoint
UPDATE "candies" SET "quantity" = 0 WHERE "quantity" < 0;--> statement-breakpoint
UPDATE "inventory" SET "quantity" = 0 WHERE "quantity" < 0;--> statement-breakpoint
UPDATE "pokemon" SET "level" = 1 WHERE "level" < 1;--> statement-breakpoint
UPDATE "pokemon" SET "xp" = 0 WHERE "xp" < 0;--> statement-breakpoint
UPDATE "expeditions" SET "balls" = 0 WHERE "balls" < 0;--> statement-breakpoint
UPDATE "expeditions" SET "berries" = 0 WHERE "berries" < 0;--> statement-breakpoint
UPDATE "expeditions" SET "encounter_berries" = 0 WHERE "encounter_berries" < 0;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_currency_nonnegative" CHECK ("player_profiles"."currency" >= 0);--> statement-breakpoint
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_farm_plots_nonnegative" CHECK ("player_profiles"."farm_plots" >= 0);--> statement-breakpoint
ALTER TABLE "candies" ADD CONSTRAINT "candies_quantity_nonnegative" CHECK ("candies"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_quantity_nonnegative" CHECK ("inventory"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "pokemon" ADD CONSTRAINT "pokemon_level_positive" CHECK ("pokemon"."level" >= 1);--> statement-breakpoint
ALTER TABLE "pokemon" ADD CONSTRAINT "pokemon_xp_nonnegative" CHECK ("pokemon"."xp" >= 0);--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_balls_nonnegative" CHECK ("expeditions"."balls" >= 0);--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_berries_nonnegative" CHECK ("expeditions"."berries" >= 0);--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_encounter_berries_nonnegative" CHECK ("expeditions"."encounter_berries" >= 0);