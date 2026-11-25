CREATE TABLE "coaches" (
	"tlc_id" varchar(32) PRIMARY KEY NOT NULL,
	"discord_user_id" varchar(64) NOT NULL,
	"discord_username" varchar(128) NOT NULL,
	"coach_name" varchar(128) NOT NULL,
	"coaching_experience" text NOT NULL,
	"previous_teams" text,
	"avatar_url" text NOT NULL,
	"additional_info" text,
	"current_club_id" varchar(32),
	"registration_date" text NOT NULL,
	"status" varchar(32) DEFAULT 'Free Agent' NOT NULL,
	"matches_coached" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"trophies" integer DEFAULT 0 NOT NULL,
	"career_history" jsonb NOT NULL,
	"in_server" boolean DEFAULT true NOT NULL,
	"deleted_at" text,
	"deleted_by" varchar(128),
	"deletion_reason" text
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"ticket_id" varchar(64),
	"owner_discord_id" varchar(64) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"byte_size" integer NOT NULL,
	"data_base64" text,
	"storage_url" text,
	"source_url" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"ticket_number" varchar(32) NOT NULL,
	"complaint_id" varchar(32),
	"category_key" varchar(48) NOT NULL,
	"application_sub_type" varchar(24),
	"guild_id" varchar(64) NOT NULL,
	"channel_id" varchar(64) NOT NULL,
	"channel_name" varchar(128) NOT NULL,
	"panel_message_id" varchar(64),
	"creator_discord_id" varchar(64) NOT NULL,
	"creator_username" varchar(128) NOT NULL,
	"creator_avatar_url" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"complaint_category" varchar(64),
	"staff_department" varchar(48),
	"target_discord_id" varchar(64),
	"target_username" varchar(128),
	"target_display_name" varchar(128),
	"priority" varchar(24) DEFAULT 'Normal' NOT NULL,
	"status" varchar(32) DEFAULT 'Open' NOT NULL,
	"claimed_by_discord_id" varchar(64),
	"claimed_by_username" varchar(128),
	"participant_discord_ids" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"staff_notes" jsonb NOT NULL,
	"transcript" jsonb NOT NULL,
	"decision" varchar(24),
	"decision_reason" text,
	"decided_by_discord_id" varchar(64),
	"decided_by_username" varchar(128),
	"decided_at" text,
	"created_profile_tlc_id" varchar(32),
	"created_club_id" varchar(32),
	"feedback_rating" integer,
	"feedback_comment" text,
	"last_activity_at" text NOT NULL,
	"last_staff_reply_at" text,
	"last_reminder_at" text,
	"escalated_at" text,
	"created_at" text NOT NULL,
	"closed_at" text,
	"closed_by_discord_id" varchar(64),
	"closed_by_username" varchar(128),
	"channel_deleted_at" text
);
--> statement-breakpoint
ALTER TABLE "bot_config" ADD COLUMN "tickets" jsonb;--> statement-breakpoint
ALTER TABLE "system_counters" ADD COLUMN "next_ticket_sequence" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "system_counters" ADD COLUMN "next_complaint_sequence" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_coaches_discord_user" ON "coaches" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_coaches_club" ON "coaches" USING btree ("current_club_id");--> statement-breakpoint
CREATE INDEX "idx_coaches_status" ON "coaches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_media_assets_ticket" ON "media_assets" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_media_assets_owner" ON "media_assets" USING btree ("owner_discord_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tickets_number" ON "tickets" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "idx_tickets_channel" ON "tickets" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_category" ON "tickets" USING btree ("category_key");--> statement-breakpoint
CREATE INDEX "idx_tickets_status" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tickets_creator" ON "tickets" USING btree ("creator_discord_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_complaint_id" ON "tickets" USING btree ("complaint_id");