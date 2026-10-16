CREATE TABLE "abilities" (
	"content_version_id" integer NOT NULL,
	"id" text NOT NULL,
	"description" text NOT NULL,
	"effects" jsonb NOT NULL,
	CONSTRAINT "abilities_content_version_id_id_pk" PRIMARY KEY("content_version_id","id")
);
--> statement-breakpoint
ALTER TABLE "abilities" ADD CONSTRAINT "abilities_content_version_id_content_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."content_versions"("id") ON DELETE cascade ON UPDATE no action;