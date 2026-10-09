ALTER TABLE "pokemon" ADD COLUMN "tag_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
UPDATE "pokemon" SET "tag_ids" = ARRAY["tag_id"] WHERE "tag_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" DROP CONSTRAINT "pokemon_tag_id_pokemon_tags_id_fk";
--> statement-breakpoint
ALTER TABLE "pokemon" DROP COLUMN "tag_id";
