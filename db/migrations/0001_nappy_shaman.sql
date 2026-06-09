-- Ensure pgvector is available before the knowledge_chunks vector(1024) column.
-- Also enabled in db/init/01-extensions.sql for the Docker container, but
-- repeated here (IF NOT EXISTS) so every migration run is self-sufficient on a
-- bare Postgres instance without init scripts.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "apm_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_type" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"epm" real NOT NULL,
	"apm" real NOT NULL,
	"accuracy" real NOT NULL,
	"reaction_ms" integer NOT NULL,
	"score" real NOT NULL,
	"checkpoints" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replay_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"metric" text NOT NULL,
	"value" real NOT NULL,
	"expected" real NOT NULL,
	"delta" real NOT NULL,
	"severity" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"patch_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"hp" integer NOT NULL,
	"armor" integer NOT NULL,
	"gold" integer NOT NULL,
	"lumber" integer NOT NULL,
	"build_time" integer NOT NULL,
	"provides" jsonb,
	CONSTRAINT "buildings_key_patch_uq" UNIQUE NULLS NOT DISTINCT("key","patch_id")
);
--> statement-breakpoint
CREATE TABLE "creep_camps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map_id" uuid NOT NULL,
	"position" jsonb NOT NULL,
	"difficulty" text NOT NULL,
	"units" jsonb NOT NULL,
	"drops" jsonb
);
--> statement-breakpoint
CREATE TABLE "hero_abilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hero_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"levels" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heroes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"patch_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"primary_attr" text NOT NULL,
	"base_stats" jsonb NOT NULL,
	CONSTRAINT "heroes_key_patch_uq" UNIQUE NULLS NOT DISTINCT("key","patch_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" vector(1024) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"matchup" text,
	"tier" text,
	"patch_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"tileset" text NOT NULL,
	"player_count" integer NOT NULL,
	"layout_meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"patch_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"hp" integer NOT NULL,
	"armor" integer NOT NULL,
	"armor_type" text NOT NULL,
	"attack_type" text NOT NULL,
	"dps" integer NOT NULL,
	"gold" integer NOT NULL,
	"lumber" integer NOT NULL,
	"food" integer NOT NULL,
	"build_time" integer NOT NULL,
	"tech_req" jsonb,
	CONSTRAINT "units_key_patch_uq" UNIQUE NULLS NOT DISTINCT("key","patch_id")
);
--> statement-breakpoint
CREATE TABLE "upgrades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"patch_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"levels" jsonb NOT NULL,
	CONSTRAINT "upgrades_key_patch_uq" UNIQUE NULLS NOT DISTINCT("key","patch_id")
);
--> statement-breakpoint
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_replay_id_replays_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."replays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_patch_id_patch_versions_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patch_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creep_camps" ADD CONSTRAINT "creep_camps_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_abilities" ADD CONSTRAINT "hero_abilities_hero_id_heroes_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heroes" ADD CONSTRAINT "heroes_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heroes" ADD CONSTRAINT "heroes_patch_id_patch_versions_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patch_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_doc_id_knowledge_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."knowledge_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_patch_id_patch_versions_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patch_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_patch_id_patch_versions_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patch_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upgrades" ADD CONSTRAINT "upgrades_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upgrades" ADD CONSTRAINT "upgrades_patch_id_patch_versions_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patch_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "benchmarks_replay_idx" ON "benchmarks" USING btree ("replay_id");--> statement-breakpoint
CREATE INDEX "benchmarks_replay_slot_idx" ON "benchmarks" USING btree ("replay_id","slot");--> statement-breakpoint
CREATE INDEX "buildings_race_idx" ON "buildings" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "creep_camps_map_idx" ON "creep_camps" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_doc_idx" ON "knowledge_chunks" USING btree ("doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_key_idx" ON "maps" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "races_key_idx" ON "races" USING btree ("key");--> statement-breakpoint
CREATE INDEX "units_race_idx" ON "units" USING btree ("race_id");--> statement-breakpoint

-- HNSW index for pgvector cosine-distance retrieval on knowledge_chunks.embedding.
-- drizzle-kit 0.31 cannot express pgvector operator-class names (vector_cosine_ops)
-- in its index() API, so this index is hand-written and maintained here.
-- If the embedding model/dimension changes (e.g. nomic-embed-text at 768 dims):
--   1. add a migration that DROPs this index, ALTERs the column dimensions, and
--      recreates the index; 2. re-embed all existing chunks.
-- <=> is the pgvector cosine-distance operator; m=16, ef_construction=64 are
-- conservative defaults suitable for up to ~100k chunks on this hardware.
CREATE INDEX "knowledge_chunks_embedding_hnsw_idx"
  ON "knowledge_chunks" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);