CREATE TABLE "berry_plots" (
	"owner_id" text NOT NULL,
	"plot_index" smallint NOT NULL,
	"item_id" text NOT NULL,
	"planted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"grow_ms" integer NOT NULL,
	"remaining_ms" integer NOT NULL,
	"ready_at" timestamp with time zone,
	"yield" smallint NOT NULL,
	CONSTRAINT "berry_plots_owner_id_plot_index_pk" PRIMARY KEY("owner_id","plot_index")
);
--> statement-breakpoint
ALTER TABLE "berry_plots" ADD CONSTRAINT "berry_plots_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;