CREATE TABLE "sanction_appeals" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"sanction_id" varchar(64) NOT NULL,
	"sanction_reference" varchar(32) NOT NULL,
	"player_tlc_id" varchar(32),
	"player_discord_user_id" varchar(64) NOT NULL,
	"player_discord_username" varchar(128) NOT NULL,
	"player_name" varchar(128) NOT NULL,
	"explanation" text NOT NULL,
	"status" varchar(24) DEFAULT 'Pending' NOT NULL,
	"rejection_reason" text,
	"resolution_note" text,
	"submitted_at" text NOT NULL,
	"reviewed_at" text,
	"reviewed_by" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"reference_number" varchar(32) NOT NULL,
	"player_tlc_id" varchar(32),
	"player_discord_user_id" varchar(64) NOT NULL,
	"player_discord_username" varchar(128) NOT NULL,
	"player_name" varchar(128) NOT NULL,
	"player_avatar_url" text NOT NULL,
	"club_id" varchar(32),
	"club_name" varchar(128) NOT NULL,
	"sanction_type" varchar(48) NOT NULL,
	"reason" text NOT NULL,
	"fine_amount" double precision DEFAULT 0 NOT NULL,
	"fine_paid_amount" double precision DEFAULT 0 NOT NULL,
	"fine_currency" varchar(32) DEFAULT 'TLC Coins' NOT NULL,
	"fine_status" varchar(32) DEFAULT 'PAID' NOT NULL,
	"fine_waiver_reason" text,
	"fine_history" jsonb NOT NULL,
	"suspension_matches_total" integer DEFAULT 0 NOT NULL,
	"suspension_matches_remaining" integer DEFAULT 0 NOT NULL,
	"served_match_ids" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'Active' NOT NULL,
	"issued_by_discord_id" varchar(64) NOT NULL,
	"issued_by_username" varchar(128) NOT NULL,
	"issued_at" text NOT NULL,
	"updated_at" text,
	"updated_by" varchar(128),
	"removed_at" text,
	"removed_by" varchar(128),
	"removal_reason" text,
	"announcement_channel_id" varchar(64),
	"announcement_message_id" varchar(64)
);
--> statement-breakpoint
ALTER TABLE "bot_config" ADD COLUMN "sanctions" jsonb;--> statement-breakpoint
ALTER TABLE "system_counters" ADD COLUMN "next_sanction_sequence" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_sanction_appeals_sanction" ON "sanction_appeals" USING btree ("sanction_id");--> statement-breakpoint
CREATE INDEX "idx_sanction_appeals_player" ON "sanction_appeals" USING btree ("player_discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_sanction_appeals_status" ON "sanction_appeals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sanctions_reference" ON "sanctions" USING btree ("reference_number");--> statement-breakpoint
CREATE INDEX "idx_sanctions_player_discord" ON "sanctions" USING btree ("player_discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_sanctions_player_tlc" ON "sanctions" USING btree ("player_tlc_id");--> statement-breakpoint
CREATE INDEX "idx_sanctions_status" ON "sanctions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sanctions_fine_status" ON "sanctions" USING btree ("fine_status");