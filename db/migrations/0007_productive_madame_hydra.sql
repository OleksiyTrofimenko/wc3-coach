CREATE TABLE "reference_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matchup" text NOT NULL,
	"race_id" text NOT NULL,
	"metric" text NOT NULL,
	"value" real NOT NULL,
	"source_replay_id" uuid NOT NULL,
	"player_name" text,
	"patch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benchmark_references" ADD COLUMN "sample_size" integer;--> statement-breakpoint
ALTER TABLE "benchmark_references" ADD COLUMN "dist" jsonb;--> statement-breakpoint
ALTER TABLE "replays" ADD COLUMN "is_reference" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reference_observations" ADD CONSTRAINT "reference_observations_source_replay_id_replays_id_fk" FOREIGN KEY ("source_replay_id") REFERENCES "public"."replays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_observations" ADD CONSTRAINT "reference_observations_patch_id_patch_versions_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patch_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reference_observations_key_idx" ON "reference_observations" USING btree ("matchup","race_id","metric");--> statement-breakpoint
CREATE INDEX "reference_observations_replay_idx" ON "reference_observations" USING btree ("source_replay_id");