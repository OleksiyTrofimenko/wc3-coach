CREATE TABLE "benchmark_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matchup" text NOT NULL,
	"race_id" text NOT NULL,
	"metric" text NOT NULL,
	"expected" real NOT NULL,
	"window_ms" real NOT NULL,
	"notes" text,
	"provenance" text DEFAULT 'community' NOT NULL,
	"confidence" text,
	"patch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benchmark_references_key_patch_uq" UNIQUE NULLS NOT DISTINCT("matchup","race_id","metric","patch_id")
);
--> statement-breakpoint
ALTER TABLE "benchmark_references" ADD CONSTRAINT "benchmark_references_patch_id_patch_versions_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patch_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "benchmark_references_lookup_idx" ON "benchmark_references" USING btree ("matchup","race_id","metric");