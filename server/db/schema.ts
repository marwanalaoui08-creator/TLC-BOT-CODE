import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import type {
  AchievementRecord,
  BotConfig,
  CareerEntry,
  ProfileCorrectionRequest,
  SanctionFinePaymentEntry,
  TicketAnswerEntry,
  TicketEvidenceItem,
  TicketNote,
  TicketTranscriptEntry,
} from '../../src/shared/types.ts';

export const systemCounters = pgTable('system_counters', {
  id: integer('id').primaryKey().default(1),
  schemaVersion: integer('schema_version').notNull().default(2),
  nextTlcSequence: integer('next_tlc_sequence').notNull().default(1),
  nextClubSequence: integer('next_club_sequence').notNull().default(1),
  nextMatchSequence: integer('next_match_sequence').notNull().default(1),
  nextSanctionSequence: integer('next_sanction_sequence').notNull().default(1),
  nextTicketSequence: integer('next_ticket_sequence').notNull().default(1),
  nextComplaintSequence: integer('next_complaint_sequence').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});

export const botConfig = pgTable('bot_config', {
  id: integer('id').primaryKey().default(1),
  channels: jsonb('channels').$type<BotConfig['channels']>().notNull(),
  roles: jsonb('roles').$type<BotConfig['roles']>().notNull(),
  transferWindow: jsonb('transfer_window').$type<BotConfig['transferWindow']>().notNull(),
  competitions: jsonb('competitions').$type<BotConfig['competitions']>().notNull(),
  notifications: jsonb('notifications').$type<BotConfig['notifications']>().notNull(),
  sanctions: jsonb('sanctions').$type<BotConfig['sanctions']>(),
  tickets: jsonb('tickets').$type<BotConfig['tickets']>(),
  updatedAt: text('updated_at').notNull(),
});

export const clubs = pgTable(
  'clubs',
  {
    clubId: varchar('club_id', { length: 32 }).primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    shortCode: varchar('short_code', { length: 16 }).notNull(),
    logoUrl: text('logo_url').notNull(),
    logoEmoji: varchar('logo_emoji', { length: 64 }),
    primaryColor: varchar('primary_color', { length: 24 }).notNull().default('#059669'),
    discordRoleId: varchar('discord_role_id', { length: 64 }).notNull().default(''),
    ownerDiscordUserId: varchar('owner_discord_user_id', { length: 64 }),
    ownerDiscordUsername: varchar('owner_discord_username', { length: 128 }),
    status: varchar('status', { length: 24 }).notNull().default('Active'),
    currentManagerTlcId: varchar('current_manager_tlc_id', { length: 32 }),
    registrationDate: text('registration_date').notNull(),
    matchesPlayed: integer('matches_played').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    goalsFor: integer('goals_for').notNull().default(0),
    goalsAgainst: integer('goals_against').notNull().default(0),
    trophies: integer('trophies').notNull().default(0),
    currentCompetitionIds: jsonb('current_competition_ids').$type<string[]>().notNull(),
    history: jsonb('history')
      .$type<{ id: string; date: string; summary: string }[]>()
      .notNull(),
  },
  (table) => [
    index('idx_clubs_status').on(table.status),
    index('idx_clubs_discord_role').on(table.discordRoleId),
  ]
);

export const players = pgTable(
  'players',
  {
    tlcId: varchar('tlc_id', { length: 32 }).primaryKey(),
    discordUserId: varchar('discord_user_id', { length: 64 }).notNull(),
    discordUsername: varchar('discord_username', { length: 128 }).notNull(),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    robloxUsername: varchar('roblox_username', { length: 128 }).notNull(),
    robloxAvatarUrl: text('roblox_avatar_url').notNull(),
    position: varchar('position', { length: 16 }).notNull(),
    currentClubId: varchar('current_club_id', { length: 32 }),
    loanedFromClubId: varchar('loaned_from_club_id', { length: 32 }),
    registrationDate: text('registration_date').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    matchesPlayed: integer('matches_played').notNull().default(0),
    goals: integer('goals').notNull().default(0),
    assists: integer('assists').notNull().default(0),
    cleanSheets: integer('clean_sheets').notNull().default(0),
    saves: integer('saves').notNull().default(0),
    ratingSum: doublePrecision('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    averageRating: doublePrecision('average_rating').notNull().default(0),
    manOfTheMatchAwards: integer('man_of_the_match_awards').notNull().default(0),
    trophies: integer('trophies').notNull().default(0),
    achievements: jsonb('achievements').$type<AchievementRecord[]>().notNull(),
    careerHistory: jsonb('career_history').$type<CareerEntry[]>().notNull(),
    inServer: boolean('in_server').notNull().default(true),
    deletedAt: text('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 128 }),
    deletionReason: text('deletion_reason'),
    previousClubId: varchar('previous_club_id', { length: 32 }),
    previousStatus: varchar('previous_status', { length: 32 }),
  },
  (table) => [
    uniqueIndex('uq_players_discord_user').on(table.discordUserId),
    index('idx_players_club').on(table.currentClubId),
    index('idx_players_status').on(table.status),
  ]
);

export const managers = pgTable(
  'managers',
  {
    tlcId: varchar('tlc_id', { length: 32 }).primaryKey(),
    discordUserId: varchar('discord_user_id', { length: 64 }).notNull(),
    discordUsername: varchar('discord_username', { length: 128 }).notNull(),
    managerName: varchar('manager_name', { length: 128 }).notNull(),
    robloxUsername: varchar('roblox_username', { length: 128 }).notNull(),
    robloxAvatarUrl: text('roblox_avatar_url').notNull(),
    currentClubId: varchar('current_club_id', { length: 32 }),
    registrationDate: text('registration_date').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    matchesManaged: integer('matches_managed').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    winRate: doublePrecision('win_rate').notNull().default(0),
    trophies: integer('trophies').notNull().default(0),
    clubsManaged: jsonb('clubs_managed').$type<string[]>().notNull(),
    careerHistory: jsonb('career_history').$type<CareerEntry[]>().notNull(),
    inServer: boolean('in_server').notNull().default(true),
    deletedAt: text('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 128 }),
    deletionReason: text('deletion_reason'),
    previousClubId: varchar('previous_club_id', { length: 32 }),
    previousStatus: varchar('previous_status', { length: 32 }),
  },
  (table) => [
    uniqueIndex('uq_managers_discord_user').on(table.discordUserId),
    index('idx_managers_club').on(table.currentClubId),
    index('idx_managers_status').on(table.status),
  ]
);

export const teamMemberships = pgTable(
  'team_memberships',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    discordUserId: varchar('discord_user_id', { length: 64 }).notNull(),
    discordUsername: varchar('discord_username', { length: 128 }).notNull(),
    playerTlcId: varchar('player_tlc_id', { length: 32 }),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    clubId: varchar('club_id', { length: 32 }).notNull(),
    clubName: varchar('club_name', { length: 128 }).notNull(),
    roleId: varchar('role_id', { length: 64 }).notNull(),
    joinDate: text('join_date').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
  },
  (table) => [
    index('idx_team_memberships_user').on(table.discordUserId),
    index('idx_team_memberships_club').on(table.clubId),
    index('idx_team_memberships_status').on(table.status),
  ]
);

export const registrations = pgTable(
  'registrations',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    discordUserId: varchar('discord_user_id', { length: 64 }).notNull(),
    discordUsername: varchar('discord_username', { length: 128 }).notNull(),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    robloxUsername: varchar('roblox_username', { length: 128 }).notNull(),
    robloxAvatarUrl: text('roblox_avatar_url').notNull(),
    registrationType: varchar('registration_type', { length: 24 }).notNull(),
    position: varchar('position', { length: 16 }),
    status: varchar('status', { length: 24 }).notNull(),
    rejectionReason: text('rejection_reason'),
    allowResubmit: boolean('allow_resubmit').notNull().default(true),
    submittedAt: text('submitted_at').notNull(),
    reviewedAt: text('reviewed_at'),
    reviewedBy: varchar('reviewed_by', { length: 128 }),
    tlcId: varchar('tlc_id', { length: 32 }),
  },
  (table) => [
    index('idx_registrations_discord_user').on(table.discordUserId),
    index('idx_registrations_status').on(table.status),
  ]
);

export const profileCorrectionRequests = pgTable(
  'profile_correction_requests',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    tlcId: varchar('tlc_id', { length: 32 }).notNull(),
    discordUserId: varchar('discord_user_id', { length: 64 }).notNull(),
    requestedFields: jsonb('requested_fields')
      .$type<ProfileCorrectionRequest['requestedFields']>()
      .notNull(),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 24 }).notNull(),
    rejectionReason: text('rejection_reason'),
    submittedAt: text('submitted_at').notNull(),
    reviewedAt: text('reviewed_at'),
    reviewedBy: varchar('reviewed_by', { length: 128 }),
  },
  (table) => [index('idx_correction_requests_status').on(table.status)]
);

export const clubRegistrationRequests = pgTable(
  'club_registration_requests',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    shortCode: varchar('short_code', { length: 16 }).notNull(),
    logoUrl: text('logo_url').notNull(),
    primaryColor: varchar('primary_color', { length: 24 }).notNull(),
    requestedByDiscordId: varchar('requested_by_discord_id', { length: 64 }).notNull(),
    requestedByUsername: varchar('requested_by_username', { length: 128 }).notNull(),
    managerTlcId: varchar('manager_tlc_id', { length: 32 }),
    status: varchar('status', { length: 24 }).notNull(),
    rejectionReason: text('rejection_reason'),
    submittedAt: text('submitted_at').notNull(),
    reviewedAt: text('reviewed_at'),
    reviewedBy: varchar('reviewed_by', { length: 128 }),
    clubId: varchar('club_id', { length: 32 }),
  },
  (table) => [index('idx_club_reg_requests_status').on(table.status)]
);

export const signingRequests = pgTable(
  'signing_requests',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    playerDiscordUserId: varchar('player_discord_user_id', { length: 64 }).notNull(),
    playerDiscordUsername: varchar('player_discord_username', { length: 128 }).notNull(),
    playerTlcId: varchar('player_tlc_id', { length: 32 }),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    robloxUsername: varchar('roblox_username', { length: 128 }),
    position: varchar('position', { length: 16 }),
    fromClubId: varchar('from_club_id', { length: 32 }),
    fromClubName: varchar('from_club_name', { length: 128 }).notNull(),
    requestedClubId: varchar('requested_club_id', { length: 32 }).notNull(),
    requestedClubName: varchar('requested_club_name', { length: 128 }).notNull(),
    requestedClubLogoEmoji: varchar('requested_club_logo_emoji', { length: 64 }),
    requestDate: text('request_date').notNull(),
    status: varchar('status', { length: 24 }).notNull(),
    rejectionReason: text('rejection_reason'),
    approvedBy: varchar('approved_by', { length: 128 }),
    approvedByDiscordId: varchar('approved_by_discord_id', { length: 64 }),
    approvalDate: text('approval_date'),
  },
  (table) => [
    index('idx_signing_requests_user').on(table.playerDiscordUserId),
    index('idx_signing_requests_status').on(table.status),
  ]
);

export const transferOffers = pgTable(
  'transfer_offers',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    playerTlcId: varchar('player_tlc_id', { length: 32 }).notNull(),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    fromClubId: varchar('from_club_id', { length: 32 }),
    fromClubName: varchar('from_club_name', { length: 128 }).notNull(),
    toClubId: varchar('to_club_id', { length: 32 }).notNull(),
    toClubName: varchar('to_club_name', { length: 128 }).notNull(),
    managerTlcId: varchar('manager_tlc_id', { length: 32 }).notNull(),
    managerName: varchar('manager_name', { length: 128 }).notNull(),
    transferType: varchar('transfer_type', { length: 48 }).notNull(),
    details: text('details').notNull(),
    status: varchar('status', { length: 48 }).notNull(),
    rejectionReason: text('rejection_reason'),
    createdAt: text('created_at').notNull(),
    playerRespondedAt: text('player_responded_at'),
    staffReviewedAt: text('staff_reviewed_at'),
    staffReviewedBy: varchar('staff_reviewed_by', { length: 128 }),
  },
  (table) => [
    index('idx_transfer_offers_player').on(table.playerTlcId),
    index('idx_transfer_offers_status').on(table.status),
  ]
);

export const transfers = pgTable(
  'transfers',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    playerTlcId: varchar('player_tlc_id', { length: 32 }).notNull(),
    playerDiscordUserId: varchar('player_discord_user_id', { length: 64 }),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    fromClubId: varchar('from_club_id', { length: 32 }),
    fromClubName: varchar('from_club_name', { length: 128 }).notNull(),
    toClubId: varchar('to_club_id', { length: 32 }),
    toClubName: varchar('to_club_name', { length: 128 }).notNull(),
    transferType: varchar('transfer_type', { length: 48 }).notNull(),
    details: text('details').notNull(),
    approvedBy: varchar('approved_by', { length: 128 }).notNull(),
    completedAt: text('completed_at').notNull(),
  },
  (table) => [
    index('idx_transfers_player').on(table.playerTlcId),
    index('idx_transfers_completed').on(table.completedAt),
  ]
);

export const contracts = pgTable(
  'contracts',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    playerTlcId: varchar('player_tlc_id', { length: 32 }).notNull(),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    clubId: varchar('club_id', { length: 32 }).notNull(),
    clubName: varchar('club_name', { length: 128 }).notNull(),
    startDate: text('start_date').notNull(),
    expirationDate: text('expiration_date').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    terms: text('terms').notNull(),
    notifiedExpiring: boolean('notified_expiring').notNull().default(false),
  },
  (table) => [
    index('idx_contracts_player').on(table.playerTlcId),
    index('idx_contracts_status').on(table.status),
  ]
);

export const competitions = pgTable('competitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  type: varchar('type', { length: 48 }).notNull(),
  season: varchar('season', { length: 64 }).notNull(),
  participatingClubIds: jsonb('participating_club_ids').$type<string[]>().notNull(),
  numberOfGroups: integer('number_of_groups').notNull().default(1),
  numberOfTeams: integer('number_of_teams').notNull(),
  matchFormat: varchar('match_format', { length: 32 }).notNull(),
  rules: text('rules').notNull(),
  rosterLimit: integer('roster_limit').notNull().default(18),
  registrationDeadline: text('registration_deadline').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  pointsWin: integer('points_win').notNull().default(3),
  pointsDraw: integer('points_draw').notNull().default(1),
  pointsLoss: integer('points_loss').notNull().default(0),
  tieBreaker: varchar('tie_breaker', { length: 48 }).notNull().default('Goal Difference'),
  includeThirdPlace: boolean('include_third_place').notNull().default(false),
});

export const competitionRegistrations = pgTable(
  'competition_registrations',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    competitionId: varchar('competition_id', { length: 64 }).notNull(),
    clubId: varchar('club_id', { length: 32 }).notNull(),
    clubName: varchar('club_name', { length: 128 }).notNull(),
    managerTlcId: varchar('manager_tlc_id', { length: 32 }).notNull(),
    rosterTlcIds: jsonb('roster_tlc_ids').$type<string[]>().notNull(),
    status: varchar('status', { length: 24 }).notNull(),
    rejectionReason: text('rejection_reason'),
    submittedAt: text('submitted_at').notNull(),
    reviewedAt: text('reviewed_at'),
    reviewedBy: varchar('reviewed_by', { length: 128 }),
  },
  (table) => [index('idx_comp_regs_comp').on(table.competitionId)]
);

export const fixtures = pgTable(
  'fixtures',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    matchNumber: integer('match_number').notNull(),
    competitionId: varchar('competition_id', { length: 64 }).notNull(),
    competitionName: varchar('competition_name', { length: 128 }).notNull(),
    roundLabel: varchar('round_label', { length: 80 }).notNull(),
    bracketSlot: varchar('bracket_slot', { length: 64 }),
    nextFixtureId: varchar('next_fixture_id', { length: 64 }),
    nextSlotSide: varchar('next_slot_side', { length: 16 }),
    homeClubId: varchar('home_club_id', { length: 32 }),
    awayClubId: varchar('away_club_id', { length: 32 }),
    matchDate: text('match_date').notNull(),
    matchTime: varchar('match_time', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    referee: varchar('referee', { length: 128 }),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    notes: text('notes'),
    resultStatus: varchar('result_status', { length: 32 }),
    resultRejectionReason: text('result_rejection_reason'),
    resultSubmittedBy: varchar('result_submitted_by', { length: 128 }),
    resultSubmittedByDiscordId: varchar('result_submitted_by_discord_id', { length: 64 }),
    resultApprovedBy: varchar('result_approved_by', { length: 128 }),
  },
  (table) => [
    index('idx_fixtures_comp').on(table.competitionId),
    index('idx_fixtures_match_num').on(table.matchNumber),
  ]
);

export const playerMatchStats = pgTable(
  'player_match_stats',
  {
    id: serial('id').primaryKey(),
    fixtureId: varchar('fixture_id', { length: 64 })
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    playerTlcId: varchar('player_tlc_id', { length: 32 }).notNull(),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    clubId: varchar('club_id', { length: 32 }).notNull(),
    goals: integer('goals').notNull().default(0),
    assists: integer('assists').notNull().default(0),
    saves: integer('saves').notNull().default(0),
    cleanSheet: boolean('clean_sheet').notNull().default(false),
    rating: doublePrecision('rating').notNull().default(6.0),
    manOfTheMatch: boolean('man_of_the_match').notNull().default(false),
  },
  (table) => [
    uniqueIndex('uq_match_stats_fixture_player').on(table.fixtureId, table.playerTlcId),
    index('idx_match_stats_player').on(table.playerTlcId),
  ]
);

export const awards = pgTable('awards', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  recipientType: varchar('recipient_type', { length: 24 }).notNull(),
  recipientId: varchar('recipient_id', { length: 32 }).notNull(),
  recipientName: varchar('recipient_name', { length: 128 }).notNull(),
  competitionId: varchar('competition_id', { length: 64 }),
  competitionName: varchar('competition_name', { length: 128 }),
  season: varchar('season', { length: 64 }),
  awardedAt: text('awarded_at').notNull(),
  awardedBy: varchar('awarded_by', { length: 128 }).notNull(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    category: varchar('category', { length: 64 }).notNull(),
    recipientDiscordId: varchar('recipient_discord_id', { length: 64 }).notNull(),
    recipientName: varchar('recipient_name', { length: 128 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    message: text('message').notNull(),
    channelName: varchar('channel_name', { length: 64 }),
    createdAt: text('created_at').notNull(),
    read: boolean('read').notNull().default(false),
  },
  (table) => [index('idx_notifications_created').on(table.createdAt)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    action: varchar('action', { length: 128 }).notNull(),
    actor: varchar('actor', { length: 128 }).notNull(),
    target: varchar('target', { length: 160 }).notNull(),
    timestamp: text('timestamp').notNull(),
    previousValue: text('previous_value').notNull(),
    newValue: text('new_value').notNull(),
  },
  (table) => [index('idx_audit_logs_timestamp').on(table.timestamp)]
);

export const sanctions = pgTable(
  'sanctions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    referenceNumber: varchar('reference_number', { length: 32 }).notNull(),
    playerTlcId: varchar('player_tlc_id', { length: 32 }),
    playerDiscordUserId: varchar('player_discord_user_id', { length: 64 }).notNull(),
    playerDiscordUsername: varchar('player_discord_username', { length: 128 }).notNull(),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    playerAvatarUrl: text('player_avatar_url').notNull(),
    clubId: varchar('club_id', { length: 32 }),
    clubName: varchar('club_name', { length: 128 }).notNull(),
    sanctionType: varchar('sanction_type', { length: 48 }).notNull(),
    reason: text('reason').notNull(),
    fineAmount: doublePrecision('fine_amount').notNull().default(0),
    finePaidAmount: doublePrecision('fine_paid_amount').notNull().default(0),
    fineCurrency: varchar('fine_currency', { length: 32 }).notNull().default('TLC Coins'),
    fineStatus: varchar('fine_status', { length: 32 }).notNull().default('PAID'),
    fineWaiverReason: text('fine_waiver_reason'),
    fineHistory: jsonb('fine_history').$type<SanctionFinePaymentEntry[]>().notNull(),
    suspensionMatchesTotal: integer('suspension_matches_total').notNull().default(0),
    suspensionMatchesRemaining: integer('suspension_matches_remaining').notNull().default(0),
    servedMatchIds: jsonb('served_match_ids').$type<string[]>().notNull(),
    status: varchar('status', { length: 24 }).notNull().default('Active'),
    issuedByDiscordId: varchar('issued_by_discord_id', { length: 64 }).notNull(),
    issuedByUsername: varchar('issued_by_username', { length: 128 }).notNull(),
    issuedAt: text('issued_at').notNull(),
    updatedAt: text('updated_at'),
    updatedBy: varchar('updated_by', { length: 128 }),
    removedAt: text('removed_at'),
    removedBy: varchar('removed_by', { length: 128 }),
    removalReason: text('removal_reason'),
    announcementChannelId: varchar('announcement_channel_id', { length: 64 }),
    announcementMessageId: varchar('announcement_message_id', { length: 64 }),
  },
  (table) => [
    uniqueIndex('uq_sanctions_reference').on(table.referenceNumber),
    index('idx_sanctions_player_discord').on(table.playerDiscordUserId),
    index('idx_sanctions_player_tlc').on(table.playerTlcId),
    index('idx_sanctions_status').on(table.status),
    index('idx_sanctions_fine_status').on(table.fineStatus),
  ]
);

export const sanctionAppeals = pgTable(
  'sanction_appeals',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    sanctionId: varchar('sanction_id', { length: 64 }).notNull(),
    sanctionReference: varchar('sanction_reference', { length: 32 }).notNull(),
    playerTlcId: varchar('player_tlc_id', { length: 32 }),
    playerDiscordUserId: varchar('player_discord_user_id', { length: 64 }).notNull(),
    playerDiscordUsername: varchar('player_discord_username', { length: 128 }).notNull(),
    playerName: varchar('player_name', { length: 128 }).notNull(),
    explanation: text('explanation').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('Pending'),
    rejectionReason: text('rejection_reason'),
    resolutionNote: text('resolution_note'),
    submittedAt: text('submitted_at').notNull(),
    reviewedAt: text('reviewed_at'),
    reviewedBy: varchar('reviewed_by', { length: 128 }),
  },
  (table) => [
    index('idx_sanction_appeals_sanction').on(table.sanctionId),
    index('idx_sanction_appeals_player').on(table.playerDiscordUserId),
    index('idx_sanction_appeals_status').on(table.status),
  ]
);

export const coaches = pgTable(
  'coaches',
  {
    tlcId: varchar('tlc_id', { length: 32 }).primaryKey(),
    discordUserId: varchar('discord_user_id', { length: 64 }).notNull(),
    discordUsername: varchar('discord_username', { length: 128 }).notNull(),
    coachName: varchar('coach_name', { length: 128 }).notNull(),
    coachingExperience: text('coaching_experience').notNull(),
    previousTeams: text('previous_teams'),
    avatarUrl: text('avatar_url').notNull(),
    additionalInfo: text('additional_info'),
    currentClubId: varchar('current_club_id', { length: 32 }),
    registrationDate: text('registration_date').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('Free Agent'),
    matchesCoached: integer('matches_coached').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    trophies: integer('trophies').notNull().default(0),
    careerHistory: jsonb('career_history').$type<CareerEntry[]>().notNull(),
    inServer: boolean('in_server').notNull().default(true),
    deletedAt: text('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 128 }),
    deletionReason: text('deletion_reason'),
  },
  (table) => [
    uniqueIndex('uq_coaches_discord_user').on(table.discordUserId),
    index('idx_coaches_club').on(table.currentClubId),
    index('idx_coaches_status').on(table.status),
  ]
);

export const tickets = pgTable(
  'tickets',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    ticketNumber: varchar('ticket_number', { length: 32 }).notNull(),
    complaintId: varchar('complaint_id', { length: 32 }),
    categoryKey: varchar('category_key', { length: 48 }).notNull(),
    applicationSubType: varchar('application_sub_type', { length: 24 }),
    guildId: varchar('guild_id', { length: 64 }).notNull(),
    channelId: varchar('channel_id', { length: 64 }).notNull(),
    channelName: varchar('channel_name', { length: 128 }).notNull(),
    panelMessageId: varchar('panel_message_id', { length: 64 }),
    creatorDiscordId: varchar('creator_discord_id', { length: 64 }).notNull(),
    creatorUsername: varchar('creator_username', { length: 128 }).notNull(),
    creatorAvatarUrl: text('creator_avatar_url'),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    complaintCategory: varchar('complaint_category', { length: 64 }),
    staffDepartment: varchar('staff_department', { length: 48 }),
    targetDiscordId: varchar('target_discord_id', { length: 64 }),
    targetUsername: varchar('target_username', { length: 128 }),
    targetDisplayName: varchar('target_display_name', { length: 128 }),
    priority: varchar('priority', { length: 24 }).notNull().default('Normal'),
    status: varchar('status', { length: 32 }).notNull().default('Open'),
    claimedByDiscordId: varchar('claimed_by_discord_id', { length: 64 }),
    claimedByUsername: varchar('claimed_by_username', { length: 128 }),
    participantDiscordIds: jsonb('participant_discord_ids').$type<string[]>().notNull(),
    answers: jsonb('answers').$type<TicketAnswerEntry[]>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, string>>().notNull(),
    evidence: jsonb('evidence').$type<TicketEvidenceItem[]>().notNull(),
    staffNotes: jsonb('staff_notes').$type<TicketNote[]>().notNull(),
    transcript: jsonb('transcript').$type<TicketTranscriptEntry[]>().notNull(),
    decision: varchar('decision', { length: 24 }),
    decisionReason: text('decision_reason'),
    decidedByDiscordId: varchar('decided_by_discord_id', { length: 64 }),
    decidedByUsername: varchar('decided_by_username', { length: 128 }),
    decidedAt: text('decided_at'),
    createdProfileTlcId: varchar('created_profile_tlc_id', { length: 32 }),
    createdClubId: varchar('created_club_id', { length: 32 }),
    feedbackRating: integer('feedback_rating'),
    feedbackComment: text('feedback_comment'),
    lastActivityAt: text('last_activity_at').notNull(),
    lastStaffReplyAt: text('last_staff_reply_at'),
    lastReminderAt: text('last_reminder_at'),
    escalatedAt: text('escalated_at'),
    createdAt: text('created_at').notNull(),
    closedAt: text('closed_at'),
    closedByDiscordId: varchar('closed_by_discord_id', { length: 64 }),
    closedByUsername: varchar('closed_by_username', { length: 128 }),
    channelDeletedAt: text('channel_deleted_at'),
  },
  (table) => [
    uniqueIndex('uq_tickets_number').on(table.ticketNumber),
    index('idx_tickets_channel').on(table.channelId),
    index('idx_tickets_category').on(table.categoryKey),
    index('idx_tickets_status').on(table.status),
    index('idx_tickets_creator').on(table.creatorDiscordId),
    index('idx_tickets_complaint_id').on(table.complaintId),
  ]
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    ticketId: varchar('ticket_id', { length: 64 }),
    ownerDiscordId: varchar('owner_discord_id', { length: 64 }).notNull(),
    kind: varchar('kind', { length: 32 }).notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    dataBase64: text('data_base64'),
    storageUrl: text('storage_url'),
    sourceUrl: text('source_url'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_media_assets_ticket').on(table.ticketId),
    index('idx_media_assets_owner').on(table.ownerDiscordId),
  ]
);


