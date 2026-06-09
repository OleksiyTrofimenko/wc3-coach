CREATE TABLE "game_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "game_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"replay_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"t_ms" integer NOT NULL,
	"type" text NOT NULL,
	"entity_ref" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patch_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"build_number" integer NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replay_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"player_name" text NOT NULL,
	"race_id" text,
	"apm" integer,
	"result" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_hash" text NOT NULL,
	"map_id" text,
	"played_at" timestamp with time zone,
	"duration_ms" integer,
	"patch_id" uuid,
	"winner_slot" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"raw_meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replays_file_hash_unique" UNIQUE("file_hash")
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_replay_id_replays_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."replays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_players" ADD CONSTRAINT "replay_players_replay_id_replays_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."replays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_patch_id_patch_versions_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patch_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_events_replay_idx" ON "game_events" USING btree ("replay_id");--> statement-breakpoint
CREATE INDEX "game_events_replay_slot_idx" ON "game_events" USING btree ("replay_id","slot");--> statement-breakpoint
CREATE INDEX "game_events_replay_type_idx" ON "game_events" USING btree ("replay_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "patch_versions_version_build_idx" ON "patch_versions" USING btree ("version","build_number");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_players_replay_slot_idx" ON "replay_players" USING btree ("replay_id","slot");