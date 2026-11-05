ALTER TABLE "expeditions" ADD COLUMN "ball_plan" jsonb;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "capture_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "throws" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "next_throw_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expeditions" ADD COLUMN "balls_used" jsonb DEFAULT '{}'::jsonb NOT NULL;