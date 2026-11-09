ALTER TABLE "daycare_slots" ADD COLUMN "parent_a_deposited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daycare_slots" ADD COLUMN "parent_b_deposited_at" timestamp with time zone;--> statement-breakpoint
-- Parents déjà en pension : leur XP se compte depuis le dépôt du couple.
UPDATE "daycare_slots" SET "parent_a_deposited_at" = "deposited_at" WHERE "parent_a_id" IS NOT NULL;--> statement-breakpoint
UPDATE "daycare_slots" SET "parent_b_deposited_at" = "deposited_at" WHERE "parent_b_id" IS NOT NULL;
