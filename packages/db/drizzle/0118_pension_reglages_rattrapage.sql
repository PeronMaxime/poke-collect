-- Rattrapage de 0117 (base de dev qui l'a appliquée avant que ses UPDATE n'y soient ajoutés).
-- Sans effet là où 0117 est passée en entier.
UPDATE "balance_settings"
SET "data" = jsonb_set(
  jsonb_set("data", '{breeding,pensionMaxEggs}', '10'::jsonb),
  '{breeding,parentXpPerHour}', '500'::jsonb
)
WHERE NOT ("data"->'breeding' ? 'pensionMaxEggs');--> statement-breakpoint
-- Œufs déjà en couveuse (pas ceux du sac, qui n'ont ni place ni éclosion).
UPDATE "eggs" SET "incubated_at" = "laid_at"
WHERE "incubated_at" IS NULL AND "slot_index" IS NOT NULL AND "hatch_at" IS NOT NULL;
