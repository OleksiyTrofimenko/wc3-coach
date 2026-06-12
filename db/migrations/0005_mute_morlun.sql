CREATE TABLE "tip_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replay_id" uuid NOT NULL,
	"tip_priority" integer,
	"verdict" text NOT NULL,
	"category" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tip_feedback" ADD CONSTRAINT "tip_feedback_replay_id_replays_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."replays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tip_feedback_replay_idx" ON "tip_feedback" USING btree ("replay_id");