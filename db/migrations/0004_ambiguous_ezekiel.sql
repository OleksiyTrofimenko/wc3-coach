CREATE TABLE "coach_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replay_id" uuid NOT NULL,
	"matchup" text NOT NULL,
	"map_name" text NOT NULL,
	"result" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"tips" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_reports" ADD CONSTRAINT "coach_reports_replay_id_replays_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."replays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_reports_replay_idx" ON "coach_reports" USING btree ("replay_id");