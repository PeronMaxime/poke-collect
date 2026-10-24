ALTER TABLE "assistants" ADD COLUMN "slot_index" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assistants" DROP CONSTRAINT "assistants_owner_id_post_pk";--> statement-breakpoint
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_owner_id_post_slot_index_pk" PRIMARY KEY("owner_id","post","slot_index");--> statement-breakpoint
ALTER TABLE "eggs" ADD COLUMN "slot_index" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fossil_revivals" ADD COLUMN "slot_index" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "heal_slot" smallint;--> statement-breakpoint
-- Les assistants en poste gardent la première place (0). Œufs en couveuse, fossiles au Musée et
-- Pokémon en soins reçoivent chacun une place, dans l'ordre où ils s'affichaient.
UPDATE "eggs" SET "slot_index" = r.n - 1
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "owner_id" ORDER BY "hatch_at", "id") AS n
  FROM "eggs" WHERE "hatched" = false
) r
WHERE "eggs"."id" = r."id";--> statement-breakpoint
UPDATE "fossil_revivals" SET "slot_index" = r.n - 1
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "owner_id" ORDER BY "ready_at", "id") AS n
  FROM "fossil_revivals" WHERE "revived_at" IS NULL
) r
WHERE "fossil_revivals"."id" = r."id";--> statement-breakpoint
UPDATE "pokemon" SET "heal_slot" = r.n - 1
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "owner_id" ORDER BY "heal_until", "id") AS n
  FROM "pokemon" WHERE "heal_until" > now()
) r
WHERE "pokemon"."id" = r."id";
