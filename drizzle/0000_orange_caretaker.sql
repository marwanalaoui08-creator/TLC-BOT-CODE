CREATE TABLE "audit_logs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"action" varchar(128) NOT NULL,
	"actor" varchar(128) NOT NULL,
	"target" varchar(160) NOT NULL,
	"timestamp" text NOT NULL,
	"previous_value" text NOT NULL,
	"new_value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "awards" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"recipient_type" varchar(24) NOT NULL,
	"recipient_id" varchar(32) NOT NULL,
	"recipient_name" varchar(128) NOT NULL,
	"competition_id" varchar(64),
	"competition_name" varchar(128),
	"season" varchar(64),
	"awarded_at" text NOT NULL,
	"awarded_by" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"channels" jsonb NOT NULL,
	"roles" jsonb NOT NULL,
	"transfer_window" jsonb NOT NULL,
	"competitions" jsonb NOT NULL,
	"notifications" jsonb NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_registration_requests" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"short_code" varchar(16) NOT NULL,
	"logo_url" text NOT NULL,
	"primary_color" varchar(24) NOT NULL,
	"requested_by_discord_id" varchar(64) NOT NULL,
	"requested_by_username" varchar(128) NOT NULL,
	"manager_tlc_id" varchar(32),
	"status" varchar(24) NOT NULL,
	"rejection_reason" text,
	"submitted_at" text NOT NULL,
	"reviewed_at" text,
	"reviewed_by" varchar(128),
	"club_id" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"club_id" varchar(32) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"short_code" varchar(16) NOT NULL,
	"logo_url" text NOT NULL,
	"logo_emoji" varchar(64),
	"primary_color" varchar(24) DEFAULT '#059669' NOT NULL,
	"discord_role_id" varchar(64) DEFAULT '' NOT NULL,
	"owner_discord_user_id" varchar(64),
	"owner_discord_username" varchar(128),
	"status" varchar(24) DEFAULT 'Active' NOT NULL,
	"current_manager_tlc_id" varchar(32),
	"registration_date" text NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"goals_for" integer DEFAULT 0 NOT NULL,
	"goals_against" integer DEFAULT 0 NOT NULL,
	"trophies" integer DEFAULT 0 NOT NULL,
	"current_competition_ids" jsonb NOT NULL,
	"history" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_registrations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"competition_id" varchar(64) NOT NULL,
	"club_id" varchar(32) NOT NULL,
	"club_name" varchar(128) NOT NULL,
	"manager_tlc_id" varchar(32) NOT NULL,
	"roster_tlc_ids" jsonb NOT NULL,
	"status" varchar(24) NOT NULL,
	"rejection_reason" text,
	"submitted_at" text NOT NULL,
	"reviewed_at" text,
	"reviewed_by" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" varchar(48) NOT NULL,
	"season" varchar(64) NOT NULL,
	"participating_club_ids" jsonb NOT NULL,
	"number_of_groups" integer DEFAULT 1 NOT NULL,
	"number_of_teams" integer NOT NULL,
	"match_format" varchar(32) NOT NULL,
	"rules" text NOT NULL,
	"roster_limit" integer DEFAULT 18 NOT NULL,
	"registration_deadline" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" varchar(32) NOT NULL,
	"points_win" integer DEFAULT 3 NOT NULL,
	"points_draw" integer DEFAULT 1 NOT NULL,
	"points_loss" integer DEFAULT 0 NOT NULL,
	"tie_breaker" varchar(48) DEFAULT 'Goal Difference' NOT NULL,
	"include_third_place" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"player_tlc_id" varchar(32) NOT NULL,
	"player_name" varchar(128) NOT NULL,
	"club_id" varchar(32) NOT NULL,
	"club_name" varchar(128) NOT NULL,
	"start_date" text NOT NULL,
	"expiration_date" text NOT NULL,
	"status" varchar(32) NOT NULL,
	"terms" text NOT NULL,
	"notified_expiring" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"match_number" integer NOT NULL,
	"competition_id" varchar(64) NOT NULL,
	"competition_name" varchar(128) NOT NULL,
	"round_label" varchar(80) NOT NULL,
	"bracket_slot" varchar(64),
	"next_fixture_id" varchar(64),
	"next_slot_side" varchar(16),
	"home_club_id" varchar(32),
	"away_club_id" varchar(32),
	"match_date" text NOT NULL,
	"match_time" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"referee" varchar(128),
	"home_score" integer,
	"away_score" integer,
	"notes" text,
	"result_status" varchar(32),
	"result_rejection_reason" text,
	"result_submitted_by" varchar(128),
	"result_submitted_by_discord_id" varchar(64),
	"result_approved_by" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"tlc_id" varchar(32) PRIMARY KEY NOT NULL,
	"discord_user_id" varchar(64) NOT NULL,
	"discord_username" varchar(128) NOT NULL,
	"manager_name" varchar(128) NOT NULL,
	"roblox_username" varchar(128) NOT NULL,
	"roblox_avatar_url" text NOT NULL,
	"current_club_id" varchar(32),
	"registration_date" text NOT NULL,
	"status" varchar(32) NOT NULL,
	"matches_managed" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"win_rate" double precision DEFAULT 0 NOT NULL,
	"trophies" integer DEFAULT 0 NOT NULL,
	"clubs_managed" jsonb NOT NULL,
	"career_history" jsonb NOT NULL,
	"in_server" boolean DEFAULT true NOT NULL,
	"deleted_at" text,
	"deleted_by" varchar(128),
	"deletion_reason" text,
	"previous_club_id" varchar(32),
	"previous_status" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"category" varchar(64) NOT NULL,
	"recipient_discord_id" varchar(64) NOT NULL,
	"recipient_name" varchar(128) NOT NULL,
	"title" varchar(160) NOT NULL,
	"message" text NOT NULL,
	"channel_name" varchar(64),
	"created_at" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_match_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" varchar(64) NOT NULL,
	"player_tlc_id" varchar(32) NOT NULL,
	"player_name" varchar(128) NOT NULL,
	"club_id" varchar(32) NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"clean_sheet" boolean DEFAULT false NOT NULL,
	"rating" double precision DEFAULT 6 NOT NULL,
	"man_of_the_match" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"tlc_id" varchar(32) PRIMARY KEY NOT NULL,
	"discord_user_id" varchar(64) NOT NULL,
	"discord_username" varchar(128) NOT NULL,
	"player_name" varchar(128) NOT NULL,
	"roblox_username" varchar(128) NOT NULL,
	"roblox_avatar_url" text NOT NULL,
	"position" varchar(16) NOT NULL,
	"current_club_id" varchar(32),
	"loaned_from_club_id" varchar(32),
	"registration_date" text NOT NULL,
	"status" varchar(32) NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"clean_sheets" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"rating_sum" double precision DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"average_rating" double precision DEFAULT 0 NOT NULL,
	"man_of_the_match_awards" integer DEFAULT 0 NOT NULL,
	"trophies" integer DEFAULT 0 NOT NULL,
	"achievements" jsonb NOT NULL,
	"career_history" jsonb NOT NULL,
	"in_server" boolean DEFAULT true NOT NULL,
	"deleted_at" text,
	"deleted_by" varchar(128),
	"deletion_reason" text,
	"previous_club_id" varchar(32),
	"previous_status" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "profile_correction_requests" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tlc_id" varchar(32) NOT NULL,
	"discord_user_id" varchar(64) NOT NULL,
	"requested_fields" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(24) NOT NULL,
	"rejection_reason" text,
	"submitted_at" text NOT NULL,
	"reviewed_at" text,
	"reviewed_by" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"discord_user_id" varchar(64) NOT NULL,
	"discord_username" varchar(128) NOT NULL,
	"player_name" varchar(128) NOT NULL,
	"roblox_username" varchar(128) NOT NULL,
	"roblox_avatar_url" text NOT NULL,
	"registration_type" varchar(24) NOT NULL,
	"position" varchar(16),
	"status" varchar(24) NOT NULL,
	"rejection_reason" text,
	"allow_resubmit" boolean DEFAULT true NOT NULL,
	"submitted_at" text NOT NULL,
	"reviewed_at" text,
	"reviewed_by" varchar(128),
	"tlc_id" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "signing_requests" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"player_discord_user_id" varchar(64) NOT NULL,
	"player_discord_username" varchar(128) NOT NULL,
	"player_tlc_id" varchar(32),
	"player_name" varchar(128) NOT NULL,
	"roblox_username" varchar(128),
	"position" varchar(16),
	"from_club_id" varchar(32),
	"from_club_name" varchar(128) NOT NULL,
	"requested_club_id" varchar(32) NOT NULL,
	"requested_club_name" varchar(128) NOT NULL,
	"requested_club_logo_emoji" varchar(64),
	"request_date" text NOT NULL,
	"status" varchar(24) NOT NULL,
	"rejection_reason" text,
	"approved_by" varchar(128),
	"approved_by_discord_id" varchar(64),
	"approval_date" text
);
--> statement-breakpoint
CREATE TABLE "system_counters" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"schema_version" integer DEFAULT 2 NOT NULL,
	"next_tlc_sequence" integer DEFAULT 1 NOT NULL,
	"next_club_sequence" integer DEFAULT 1 NOT NULL,
	"next_match_sequence" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"discord_user_id" varchar(64) NOT NULL,
	"discord_username" varchar(128) NOT NULL,
	"player_tlc_id" varchar(32),
	"player_name" varchar(128) NOT NULL,
	"club_id" varchar(32) NOT NULL,
	"club_name" varchar(128) NOT NULL,
	"role_id" varchar(64) NOT NULL,
	"join_date" text NOT NULL,
	"status" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_offers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"player_tlc_id" varchar(32) NOT NULL,
	"player_name" varchar(128) NOT NULL,
	"from_club_id" varchar(32),
	"from_club_name" varchar(128) NOT NULL,
	"to_club_id" varchar(32) NOT NULL,
	"to_club_name" varchar(128) NOT NULL,
	"manager_tlc_id" varchar(32) NOT NULL,
	"manager_name" varchar(128) NOT NULL,
	"transfer_type" varchar(48) NOT NULL,
	"details" text NOT NULL,
	"status" varchar(48) NOT NULL,
	"rejection_reason" text,
	"created_at" text NOT NULL,
	"player_responded_at" text,
	"staff_reviewed_at" text,
	"staff_reviewed_by" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"player_tlc_id" varchar(32) NOT NULL,
	"player_discord_user_id" varchar(64),
	"player_name" varchar(128) NOT NULL,
	"from_club_id" varchar(32),
	"from_club_name" varchar(128) NOT NULL,
	"to_club_id" varchar(32),
	"to_club_name" varchar(128) NOT NULL,
	"transfer_type" varchar(48) NOT NULL,
	"details" text NOT NULL,
	"approved_by" varchar(128) NOT NULL,
	"completed_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_timestamp" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_club_reg_requests_status" ON "club_registration_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_clubs_status" ON "clubs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_clubs_discord_role" ON "clubs" USING btree ("discord_role_id");--> statement-breakpoint
CREATE INDEX "idx_comp_regs_comp" ON "competition_registrations" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_player" ON "contracts" USING btree ("player_tlc_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_status" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_fixtures_comp" ON "fixtures" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "idx_fixtures_match_num" ON "fixtures" USING btree ("match_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_managers_discord_user" ON "managers" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_managers_club" ON "managers" USING btree ("current_club_id");--> statement-breakpoint
CREATE INDEX "idx_managers_status" ON "managers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notifications_created" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_match_stats_fixture_player" ON "player_match_stats" USING btree ("fixture_id","player_tlc_id");--> statement-breakpoint
CREATE INDEX "idx_match_stats_player" ON "player_match_stats" USING btree ("player_tlc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_players_discord_user" ON "players" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_players_club" ON "players" USING btree ("current_club_id");--> statement-breakpoint
CREATE INDEX "idx_players_status" ON "players" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_correction_requests_status" ON "profile_correction_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_registrations_discord_user" ON "registrations" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_registrations_status" ON "registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_signing_requests_user" ON "signing_requests" USING btree ("player_discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_signing_requests_status" ON "signing_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_team_memberships_user" ON "team_memberships" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_team_memberships_club" ON "team_memberships" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_team_memberships_status" ON "team_memberships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_transfer_offers_player" ON "transfer_offers" USING btree ("player_tlc_id");--> statement-breakpoint
CREATE INDEX "idx_transfer_offers_status" ON "transfer_offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_transfers_player" ON "transfers" USING btree ("player_tlc_id");--> statement-breakpoint
CREATE INDEX "idx_transfers_completed" ON "transfers" USING btree ("completed_at");