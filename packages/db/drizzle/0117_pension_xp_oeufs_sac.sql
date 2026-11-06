ALTER TABLE "eggs" ALTER COLUMN "slot_index" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "eggs" ALTER COLUMN "slot_index" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eggs" ALTER COLUMN "hatch_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daycare_slots" ADD COLUMN "deposited_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eggs" ADD COLUMN "incubated_at" timestamp with time zone;--> statement-breakpoint
-- Œufs déjà en couveuse : mis en couveuse au ramassage (= ponte).
UPDATE "eggs" SET "incubated_at" = "laid_at" WHERE "incubated_at" IS NULL;--> statement-breakpoint
-- Couples déjà en pension : l'XP se compte depuis le début de leur cycle de ponte en cours.
UPDATE "daycare_slots" SET "deposited_at" = "started_at";--> statement-breakpoint
-- Pension : 10 œufs en attente au plus (avant : les places de départ de la couveuse, 6) et XP
-- gagnée par les parents, dans toutes les versions de contenu.
UPDATE "balance_settings"
SET "data" = jsonb_set(
  jsonb_set("data", '{breeding,pensionMaxEggs}', '10'::jsonb),
  '{breeding,parentXpPerHour}', '500'::jsonb
)
WHERE NOT ("data"->'breeding' ? 'pensionMaxEggs');
