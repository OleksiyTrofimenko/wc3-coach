ALTER TABLE "buildings" ADD COLUMN "fourcc" text;--> statement-breakpoint
ALTER TABLE "hero_abilities" ADD COLUMN "fourcc" text;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "fourcc" text;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "fourcc" text;--> statement-breakpoint
ALTER TABLE "upgrades" ADD COLUMN "fourcc" text;--> statement-breakpoint
CREATE INDEX "buildings_fourcc_idx" ON "buildings" USING btree ("fourcc");--> statement-breakpoint
CREATE INDEX "hero_abilities_fourcc_idx" ON "hero_abilities" USING btree ("fourcc");--> statement-breakpoint
CREATE INDEX "heroes_fourcc_idx" ON "heroes" USING btree ("fourcc");--> statement-breakpoint
CREATE INDEX "units_fourcc_idx" ON "units" USING btree ("fourcc");--> statement-breakpoint
CREATE INDEX "upgrades_fourcc_idx" ON "upgrades" USING btree ("fourcc");