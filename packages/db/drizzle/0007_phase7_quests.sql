CREATE TABLE "quests" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"image" text,
	"region_id" text,
	"unlock" jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"rewards" jsonb NOT NULL,
	CONSTRAINT "quests_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
ALTER TABLE "quest_progress" ADD COLUMN "step_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;
