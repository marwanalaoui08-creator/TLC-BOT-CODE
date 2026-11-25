import { desc, eq, inArray } from 'drizzle-orm';
import {
  AuditLogEntry,
  AwardRecord,
  BotConfig,
  Club,
  ClubRegistrationRequest,
  CoachProfile,
  Competition,
  CompetitionRegistration,
  ComplaintCategory,
  Contract,
  Fixture,
  ManagerProfile,
  NotificationEntry,
  PlayerMatchStat,
  PlayerPosition,
  PlayerProfile,
  ProfileCorrectionRequest,
  RegistrationRequest,
  SanctionAppeal,
  SanctionRecord,
  SanctionType,
  SigningRequest,
  StaffDepartment,
  TeamMembership,
  TicketCategoryConfig,
  TicketPriority,
  TicketStatus,
  TicketSystemConfig,
  TlcDatabaseState,
  TransferOffer,
  TransferRecord,
  UnifiedTicket,
} from '../../src/shared/types.ts';
import type { TlcDb } from './client.ts';
import {
  auditLogs,
  awards,
  botConfig,
  clubRegistrationRequests,
  clubs,
  coaches,
  competitionRegistrations,
  competitions,
  contracts,
  fixtures,
  managers,
  notifications,
  playerMatchStats,
  players,
  profileCorrectionRequests,
  registrations,
  sanctionAppeals,
  sanctions,
  signingRequests,
  systemCounters,
  teamMemberships,
  tickets,
  transferOffers,
  transfers,
} from './schema.ts';

export const CURRENT_SCHEMA_VERSION = 3;

export function createDefaultTicketCategories(): TicketCategoryConfig[] {
  return [
    {
      key: 'player_complaint',
      label: 'Player Complaint',
      emoji: '⚖️',
      description: 'Submit a confidential or official complaint against a player, staff member, or club',
      enabled: true,
      order: 1,
      requireEvidence: false,
      questions: [
        {
          id: 'cmp_reason',
          label: 'Reason for Complaint',
          placeholder: 'Short summary of the rule breach or incident',
          type: 'short',
          required: true,
        },
        {
          id: 'cmp_description',
          label: 'Exact Description of Incident',
          placeholder: 'Explain clearly what happened and how it violated TLC rules',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'cmp_date',
          label: 'Date and Time of Incident',
          placeholder: 'e.g. 2026-11-24 20:30 UTC',
          type: 'short',
          required: true,
        },
        {
          id: 'cmp_match',
          label: 'Competition or Match Involved (Optional)',
          placeholder: 'Competition name or Match # (if applicable)',
          type: 'short',
          required: false,
        },
        {
          id: 'cmp_witnesses',
          label: 'Witnesses (Optional)',
          placeholder: 'Names or @usernames of witnesses if any',
          type: 'short',
          required: false,
        },
      ],
    },
    {
      key: 'staff_application',
      label: 'Staff Application',
      emoji: '🛡️',
      description: 'Apply to join the TLC Administration, Moderation, Refereeing, Media, or Recruitment team',
      enabled: true,
      order: 2,
      requireEvidence: false,
      questions: [
        {
          id: 'staff_preferred_name',
          label: 'Full Name or Preferred Name',
          placeholder: 'How should we address you?',
          type: 'short',
          required: true,
        },
        {
          id: 'staff_why_tlc',
          label: 'Why do you want to become a TLC Staff member?',
          placeholder: 'Your motivation for joining TLC Administration',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'staff_discord_exp',
          label: 'Discord server management experience',
          placeholder: 'Describe past Discord moderation or admin roles',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'staff_football_exp',
          label: 'Experience in other football communities?',
          placeholder: 'Leagues, clubs, or officiating background',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'staff_daily_time',
          label: 'Time you can dedicate daily',
          placeholder: 'e.g. 2–3 hours daily',
          type: 'short',
          required: true,
        },
        {
          id: 'staff_skills',
          label: 'What skills do you bring to TLC Admin?',
          placeholder: 'Communication, organization, match officiating, media, etc.',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'staff_conflict',
          label: 'How handle disagreement between 2 members?',
          placeholder: 'Explain your neutral conflict-resolution steps',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'staff_why_you',
          label: 'Why choose you over other applicants?',
          placeholder: 'What sets you apart?',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'staff_additional',
          label: 'Additional information (Optional)',
          placeholder: 'Anything else you want recruitment staff to know',
          type: 'paragraph',
          required: false,
        },
      ],
    },
    {
      key: 'register',
      label: 'Register',
      emoji: '📝',
      description: 'Apply for official TLC Player Registration or Coach Registration',
      enabled: true,
      order: 3,
      requireEvidence: false,
      questions: [],
    },
    {
      key: 'create_team',
      label: 'Create a Team',
      emoji: '🏟️',
      description: 'Apply to register an official TLC club and team management setup',
      enabled: true,
      order: 4,
      requireEvidence: false,
      questions: [
        {
          id: 'team_name',
          label: 'Proposed Team Name',
          placeholder: 'e.g. Real Madrid',
          type: 'short',
          required: true,
        },
        {
          id: 'team_emoji',
          label: 'Team Logo Emoji',
          placeholder: 'e.g. ⚪ or ⚽',
          type: 'short',
          required: false,
        },
        {
          id: 'team_mgmt_exp',
          label: 'Previous Team Management Experience',
          placeholder: 'Describe your leadership or club management history',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'team_why',
          label: 'Why create an official TLC team?',
          placeholder: 'Your vision and plans for this club in TLC',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'team_additional',
          label: 'Additional Info / Logo Image URL (Optional)',
          placeholder: 'Optional https://... logo URL or extra notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
    {
      key: 'general_inquiry',
      label: 'General Inquiry',
      emoji: '💬',
      description: 'Ask any general question or get help directly from TLC Administration',
      enabled: true,
      order: 5,
      requireEvidence: false,
      questions: [],
    },
    {
      key: 'player_report',
      label: 'Player Report',
      emoji: '🚨',
      description: 'Report a player rule violation with explanation and supporting evidence',
      enabled: true,
      order: 6,
      requireEvidence: false,
      questions: [
        {
          id: 'rep_reason',
          label: 'Reason for Report',
          placeholder: 'Summary of the incident',
          type: 'short',
          required: true,
        },
        {
          id: 'rep_explanation',
          label: 'Detailed Explanation',
          placeholder: 'Describe what occurred and when',
          type: 'paragraph',
          required: true,
        },
        {
          id: 'rep_evidence_url',
          label: 'Evidence Link (Optional)',
          placeholder: 'Optional screenshot/video URL (or upload file inside ticket)',
          type: 'url',
          required: false,
        },
      ],
    },
    {
      key: 'team_support',
      label: 'Team Support',
      emoji: '🛡️',
      description: 'Team president and club support for roster, roles, and matchday issues',
      enabled: true,
      order: 7,
      requireEvidence: false,
      questions: [
        {
          id: 'ts_team',
          label: 'Team Name',
          placeholder: 'Which official TLC team is this regarding?',
          type: 'short',
          required: true,
        },
        {
          id: 'ts_issue',
          label: 'How can we help your team?',
          placeholder: 'Describe the roster, role, or competition support needed',
          type: 'paragraph',
          required: true,
        },
      ],
    },
    {
      key: 'transfer_assistance',
      label: 'Transfer Assistance',
      emoji: '🔁',
      description: 'Get help with transfers, signings, contract disputes, or player releases',
      enabled: true,
      order: 8,
      requireEvidence: false,
      questions: [
        {
          id: 'ta_subject',
          label: 'Transfer / Signing Subject',
          placeholder: 'e.g. Stuck transfer offer, release issue, contract inquiry',
          type: 'short',
          required: true,
        },
        {
          id: 'ta_details',
          label: 'Full Details',
          placeholder: 'List clubs/players involved and describe the issue',
          type: 'paragraph',
          required: true,
        },
      ],
    },
    {
      key: 'other',
      label: 'Other',
      emoji: '📌',
      description: 'Open a support ticket for any other topic not listed above',
      enabled: true,
      order: 9,
      requireEvidence: false,
      questions: [
        {
          id: 'other_subject',
          label: 'Subject',
          placeholder: 'Short title for your request',
          type: 'short',
          required: true,
        },
        {
          id: 'other_details',
          label: 'Explanation',
          placeholder: 'Explain what you need help with',
          type: 'paragraph',
          required: true,
        },
      ],
    },
  ];
}

export function createDefaultTicketSystemConfig(): TicketSystemConfig {
  return {
    namingPattern: '{category}-{num}',
    maxOpenTicketsPerUserPerCategory: 1,
    inactivityReminderHours: 24,
    escalationHours: 48,
    panelTitle: 'TLC SUPPORT CENTER',
    panelDescription:
      'Need assistance from TLC Administration? Select the appropriate category below to open a ticket.',
    categories: createDefaultTicketCategories(),
  };
}

export function createDefaultBotConfig(): BotConfig {
  const futureDate = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  return {
    channels: {
      verifyYourselfId: '',
      registrationRequestsId: '',
      transferMarketId: '',
      signingRequestsId: '',
      teamManagementId: '',
      fixturesId: '',
      resultsId: '',
      auditLogsId: '',
      announcementsId: '',
      sanctionsAnnouncementId: '',
      sanctionsLogId: '',
      ticketPanelId: '',
      ticketCategoryId: '',
      registrationCategoryId: '',
      ticketLogId: '',
      applicationLogId: '',
      complaintLogId: '',
      escalationChannelId: '',
    },
    roles: {
      verifiedRoleId: '',
      unverifiedRoleId: '',
      playerRoleId: '',
      managerRoleId: '',
      coachRoleId: '',
      goalkeeperRoleId: '',
      defenderRoleId: '',
      midfielderRoleId: '',
      attackerRoleId: '',
      staffRoleIds: [],
      disciplinaryRoleIds: [],
      supportRoleIds: [],
      playerRegStaffRoleIds: [],
      coachRegStaffRoleIds: [],
      staffAppRoleIds: [],
      complaintStaffRoleIds: [],
      teamRegStaffRoleIds: [],
      seniorAdminRoleIds: [],
    },
    transferWindow: {
      isOpen: true,
      deadline: futureDate,
      allowFreeAgentExceptions: true,
      requireStaffApproval: true,
      allowMultipleTeamRoles: false,
    },
    competitions: {
      requireResultApproval: true,
      defaultRosterLimit: 18,
      contractWarningDays: 7,
    },
    notifications: {
      publishRegistrationAnnouncements: true,
      sendDirectMessages: true,
      announceTransfers: true,
      announceResults: true,
      notifyFixtureChanges: true,
      notifyContractExpiring: true,
    },
    sanctions: {
      defaultCurrency: 'TLC Coins',
    },
    tickets: createDefaultTicketSystemConfig(),
  };
}

export function createDefaultEmptyState(): TlcDatabaseState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    nextTlcSequence: 1,
    nextClubSequence: 1,
    nextMatchSequence: 1,
    nextSanctionSequence: 1,
    nextTicketSequence: 1,
    nextComplaintSequence: 1,
    registrations: [],
    correctionRequests: [],
    clubRegistrationRequests: [],
    teamMemberships: [],
    signingRequests: [],
    players: [],
    managers: [],
    coaches: [],
    clubs: [],
    transfers: [],
    transferOffers: [],
    contracts: [],
    competitions: [],
    competitionRegistrations: [],
    fixtures: [],
    awards: [],
    sanctions: [],
    sanctionAppeals: [],
    tickets: [],
    notifications: [],
    auditLogs: [],
    config: createDefaultBotConfig(),
  };
}

function undefIfNull<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v;
}

function extractTrailingNumber(value: string | undefined | null): number {
  if (!value) return 0;
  const match = value.match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

export async function loadStateFromPostgres(db: TlcDb): Promise<TlcDatabaseState> {
  const now = new Date().toISOString();
  const defaultCfg = createDefaultBotConfig();

  // Initialize structural singleton rows only if missing; never overwrite existing rows.
  await db
    .insert(systemCounters)
    .values({
      id: 1,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      nextTlcSequence: 1,
      nextClubSequence: 1,
      nextMatchSequence: 1,
      nextSanctionSequence: 1,
      nextTicketSequence: 1,
      nextComplaintSequence: 1,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: systemCounters.id });

  await db
    .insert(botConfig)
    .values({
      id: 1,
      channels: defaultCfg.channels,
      roles: defaultCfg.roles,
      transferWindow: defaultCfg.transferWindow,
      competitions: defaultCfg.competitions,
      notifications: defaultCfg.notifications,
      sanctions: defaultCfg.sanctions,
      tickets: defaultCfg.tickets,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: botConfig.id });

  const [
    counterRows,
    configRows,
    clubRows,
    playerRows,
    managerRows,
    coachRows,
    membershipRows,
    regRows,
    corrRows,
    clubRegRows,
    signRows,
    offerRows,
    transferRows,
    contractRows,
    compRows,
    compRegRows,
    fixtureRows,
    statRows,
    awardRows,
    sanctionRows,
    appealRows,
    ticketRows,
    notificationRows,
    auditRows,
  ] = await Promise.all([
    db.select().from(systemCounters).where(eq(systemCounters.id, 1)),
    db.select().from(botConfig).where(eq(botConfig.id, 1)),
    db.select().from(clubs),
    db.select().from(players),
    db.select().from(managers),
    db.select().from(coaches),
    db.select().from(teamMemberships).orderBy(desc(teamMemberships.joinDate)),
    db.select().from(registrations).orderBy(desc(registrations.submittedAt)),
    db.select().from(profileCorrectionRequests).orderBy(desc(profileCorrectionRequests.submittedAt)),
    db.select().from(clubRegistrationRequests).orderBy(desc(clubRegistrationRequests.submittedAt)),
    db.select().from(signingRequests).orderBy(desc(signingRequests.requestDate)),
    db.select().from(transferOffers).orderBy(desc(transferOffers.createdAt)),
    db.select().from(transfers).orderBy(desc(transfers.completedAt)),
    db.select().from(contracts).orderBy(desc(contracts.startDate)),
    db.select().from(competitions).orderBy(desc(competitions.startDate)),
    db.select().from(competitionRegistrations).orderBy(desc(competitionRegistrations.submittedAt)),
    db.select().from(fixtures),
    db.select().from(playerMatchStats),
    db.select().from(awards).orderBy(desc(awards.awardedAt)),
    db.select().from(sanctions).orderBy(desc(sanctions.issuedAt)),
    db.select().from(sanctionAppeals).orderBy(desc(sanctionAppeals.submittedAt)),
    db.select().from(tickets).orderBy(desc(tickets.createdAt)),
    db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(300),
    db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(500),
  ]);

  const statsByFixture = new Map<string, PlayerMatchStat[]>();
  for (const s of statRows) {
    const list = statsByFixture.get(s.fixtureId) || [];
    list.push({
      playerTlcId: s.playerTlcId,
      playerName: s.playerName,
      clubId: s.clubId,
      goals: s.goals,
      assists: s.assists,
      saves: s.saves,
      cleanSheet: s.cleanSheet,
      rating: s.rating,
      manOfTheMatch: s.manOfTheMatch,
    });
    statsByFixture.set(s.fixtureId, list);
  }

  const mappedClubs: Club[] = clubRows.map((c) => ({
    clubId: c.clubId,
    name: c.name,
    shortCode: c.shortCode,
    logoUrl: c.logoUrl,
    logoEmoji: undefIfNull(c.logoEmoji),
    primaryColor: c.primaryColor,
    discordRoleId: c.discordRoleId,
    ownerDiscordUserId: undefIfNull(c.ownerDiscordUserId),
    ownerDiscordUsername: undefIfNull(c.ownerDiscordUsername),
    status: (c.status as Club['status']) || 'Active',
    currentManagerTlcId: c.currentManagerTlcId ?? null,
    registrationDate: c.registrationDate,
    matchesPlayed: c.matchesPlayed,
    wins: c.wins,
    draws: c.draws,
    losses: c.losses,
    goalsFor: c.goalsFor,
    goalsAgainst: c.goalsAgainst,
    trophies: c.trophies,
    currentCompetitionIds: c.currentCompetitionIds || [],
    history: c.history || [],
  }));

  const mappedPlayers: PlayerProfile[] = playerRows.map((p) => ({
    tlcId: p.tlcId,
    discordUserId: p.discordUserId,
    discordUsername: p.discordUsername,
    playerName: p.playerName,
    robloxUsername: p.robloxUsername,
    robloxAvatarUrl: p.robloxAvatarUrl,
    position: p.position as PlayerPosition,
    currentClubId: p.currentClubId ?? null,
    loanedFromClubId: p.loanedFromClubId ?? null,
    registrationDate: p.registrationDate,
    status: p.status as PlayerProfile['status'],
    matchesPlayed: p.matchesPlayed,
    goals: p.goals,
    assists: p.assists,
    cleanSheets: p.cleanSheets,
    saves: p.saves,
    ratingSum: p.ratingSum,
    ratingCount: p.ratingCount,
    averageRating: p.averageRating,
    manOfTheMatchAwards: p.manOfTheMatchAwards,
    trophies: p.trophies,
    achievements: p.achievements || [],
    careerHistory: p.careerHistory || [],
    inServer: p.inServer,
    deletedAt: undefIfNull(p.deletedAt),
    deletedBy: undefIfNull(p.deletedBy),
    deletionReason: undefIfNull(p.deletionReason),
    previousClubId: p.previousClubId === undefined ? undefined : p.previousClubId,
    previousStatus: undefIfNull(p.previousStatus) as PlayerProfile['status'] | undefined,
  }));

  const mappedManagers: ManagerProfile[] = managerRows.map((m) => ({
    tlcId: m.tlcId,
    discordUserId: m.discordUserId,
    discordUsername: m.discordUsername,
    managerName: m.managerName,
    robloxUsername: m.robloxUsername,
    robloxAvatarUrl: m.robloxAvatarUrl,
    currentClubId: m.currentClubId ?? null,
    registrationDate: m.registrationDate,
    status: m.status as ManagerProfile['status'],
    matchesManaged: m.matchesManaged,
    wins: m.wins,
    draws: m.draws,
    losses: m.losses,
    winRate: m.winRate,
    trophies: m.trophies,
    clubsManaged: m.clubsManaged || [],
    careerHistory: m.careerHistory || [],
    inServer: m.inServer,
    deletedAt: undefIfNull(m.deletedAt),
    deletedBy: undefIfNull(m.deletedBy),
    deletionReason: undefIfNull(m.deletionReason),
    previousClubId: m.previousClubId === undefined ? undefined : m.previousClubId,
    previousStatus: undefIfNull(m.previousStatus) as ManagerProfile['status'] | undefined,
  }));

  const mappedMemberships: TeamMembership[] = membershipRows.map((m) => ({
    id: m.id,
    discordUserId: m.discordUserId,
    discordUsername: m.discordUsername,
    playerTlcId: undefIfNull(m.playerTlcId),
    playerName: m.playerName,
    clubId: m.clubId,
    clubName: m.clubName,
    roleId: m.roleId,
    joinDate: m.joinDate,
    status: m.status as TeamMembership['status'],
  }));

  const mappedRegistrations: RegistrationRequest[] = regRows.map((r) => ({
    id: r.id,
    discordUserId: r.discordUserId,
    discordUsername: r.discordUsername,
    playerName: r.playerName,
    robloxUsername: r.robloxUsername,
    robloxAvatarUrl: r.robloxAvatarUrl,
    registrationType: r.registrationType as RegistrationRequest['registrationType'],
    position: undefIfNull(r.position) as PlayerPosition | undefined,
    status: r.status as RegistrationRequest['status'],
    rejectionReason: undefIfNull(r.rejectionReason),
    allowResubmit: r.allowResubmit,
    submittedAt: r.submittedAt,
    reviewedAt: undefIfNull(r.reviewedAt),
    reviewedBy: undefIfNull(r.reviewedBy),
    tlcId: undefIfNull(r.tlcId),
  }));

  const mappedCorrections: ProfileCorrectionRequest[] = corrRows.map((c) => ({
    id: c.id,
    tlcId: c.tlcId,
    discordUserId: c.discordUserId,
    requestedFields: c.requestedFields || {},
    reason: c.reason,
    status: c.status as ProfileCorrectionRequest['status'],
    rejectionReason: undefIfNull(c.rejectionReason),
    submittedAt: c.submittedAt,
    reviewedAt: undefIfNull(c.reviewedAt),
    reviewedBy: undefIfNull(c.reviewedBy),
  }));

  const mappedClubRegs: ClubRegistrationRequest[] = clubRegRows.map((c) => ({
    id: c.id,
    name: c.name,
    shortCode: c.shortCode,
    logoUrl: c.logoUrl,
    primaryColor: c.primaryColor,
    requestedByDiscordId: c.requestedByDiscordId,
    requestedByUsername: c.requestedByUsername,
    managerTlcId: c.managerTlcId ?? null,
    status: c.status as ClubRegistrationRequest['status'],
    rejectionReason: undefIfNull(c.rejectionReason),
    submittedAt: c.submittedAt,
    reviewedAt: undefIfNull(c.reviewedAt),
    reviewedBy: undefIfNull(c.reviewedBy),
    clubId: undefIfNull(c.clubId),
  }));

  const mappedSignings: SigningRequest[] = signRows.map((s) => ({
    id: s.id,
    playerDiscordUserId: s.playerDiscordUserId,
    playerDiscordUsername: s.playerDiscordUsername,
    playerTlcId: undefIfNull(s.playerTlcId),
    playerName: s.playerName,
    robloxUsername: undefIfNull(s.robloxUsername),
    position: undefIfNull(s.position) as PlayerPosition | undefined,
    fromClubId: s.fromClubId ?? null,
    fromClubName: s.fromClubName,
    requestedClubId: s.requestedClubId,
    requestedClubName: s.requestedClubName,
    requestedClubLogoEmoji: undefIfNull(s.requestedClubLogoEmoji),
    requestDate: s.requestDate,
    status: s.status as SigningRequest['status'],
    rejectionReason: undefIfNull(s.rejectionReason),
    approvedBy: undefIfNull(s.approvedBy),
    approvedByDiscordId: undefIfNull(s.approvedByDiscordId),
    approvalDate: undefIfNull(s.approvalDate),
  }));

  const mappedOffers: TransferOffer[] = offerRows.map((o) => ({
    id: o.id,
    playerTlcId: o.playerTlcId,
    playerName: o.playerName,
    fromClubId: o.fromClubId ?? null,
    fromClubName: o.fromClubName,
    toClubId: o.toClubId,
    toClubName: o.toClubName,
    managerTlcId: o.managerTlcId,
    managerName: o.managerName,
    transferType: o.transferType as TransferOffer['transferType'],
    details: o.details,
    status: o.status as TransferOffer['status'],
    rejectionReason: undefIfNull(o.rejectionReason),
    createdAt: o.createdAt,
    playerRespondedAt: undefIfNull(o.playerRespondedAt),
    staffReviewedAt: undefIfNull(o.staffReviewedAt),
    staffReviewedBy: undefIfNull(o.staffReviewedBy),
  }));

  const mappedTransfers: TransferRecord[] = transferRows.map((t) => ({
    id: t.id,
    playerTlcId: t.playerTlcId,
    playerDiscordUserId: undefIfNull(t.playerDiscordUserId),
    playerName: t.playerName,
    fromClubId: t.fromClubId ?? null,
    fromClubName: t.fromClubName,
    toClubId: t.toClubId ?? null,
    toClubName: t.toClubName,
    transferType: t.transferType as TransferRecord['transferType'],
    details: t.details,
    approvedBy: t.approvedBy,
    completedAt: t.completedAt,
  }));

  const mappedContracts: Contract[] = contractRows.map((c) => ({
    id: c.id,
    playerTlcId: c.playerTlcId,
    playerName: c.playerName,
    clubId: c.clubId,
    clubName: c.clubName,
    startDate: c.startDate,
    expirationDate: c.expirationDate,
    status: c.status as Contract['status'],
    terms: c.terms,
    notifiedExpiring: c.notifiedExpiring,
  }));

  const mappedCompetitions: Competition[] = compRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as Competition['type'],
    season: c.season,
    participatingClubIds: c.participatingClubIds || [],
    numberOfGroups: c.numberOfGroups,
    numberOfTeams: c.numberOfTeams,
    matchFormat: c.matchFormat as Competition['matchFormat'],
    rules: c.rules,
    rosterLimit: c.rosterLimit,
    registrationDeadline: c.registrationDeadline,
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status as Competition['status'],
    pointsWin: c.pointsWin,
    pointsDraw: c.pointsDraw,
    pointsLoss: c.pointsLoss,
    tieBreaker: c.tieBreaker as Competition['tieBreaker'],
    includeThirdPlace: c.includeThirdPlace,
  }));

  const mappedCompRegs: CompetitionRegistration[] = compRegRows.map((r) => ({
    id: r.id,
    competitionId: r.competitionId,
    clubId: r.clubId,
    clubName: r.clubName,
    managerTlcId: r.managerTlcId,
    rosterTlcIds: r.rosterTlcIds || [],
    status: r.status as CompetitionRegistration['status'],
    rejectionReason: undefIfNull(r.rejectionReason),
    submittedAt: r.submittedAt,
    reviewedAt: undefIfNull(r.reviewedAt),
    reviewedBy: undefIfNull(r.reviewedBy),
  }));

  const mappedFixtures: Fixture[] = fixtureRows
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map((f) => ({
      id: f.id,
      matchNumber: f.matchNumber,
      competitionId: f.competitionId,
      competitionName: f.competitionName,
      roundLabel: f.roundLabel,
      bracketSlot: undefIfNull(f.bracketSlot),
      nextFixtureId: undefIfNull(f.nextFixtureId),
      nextSlotSide: undefIfNull(f.nextSlotSide) as Fixture['nextSlotSide'],
      homeClubId: f.homeClubId ?? null,
      awayClubId: f.awayClubId ?? null,
      matchDate: f.matchDate,
      matchTime: f.matchTime,
      status: f.status as Fixture['status'],
      referee: undefIfNull(f.referee),
      homeScore: undefIfNull(f.homeScore),
      awayScore: undefIfNull(f.awayScore),
      notes: undefIfNull(f.notes),
      resultStatus: undefIfNull(f.resultStatus) as Fixture['resultStatus'],
      resultRejectionReason: undefIfNull(f.resultRejectionReason),
      resultSubmittedBy: undefIfNull(f.resultSubmittedBy),
      resultSubmittedByDiscordId: undefIfNull(f.resultSubmittedByDiscordId),
      resultApprovedBy: undefIfNull(f.resultApprovedBy),
      playerStats: statsByFixture.get(f.id) || [],
    }));

  const mappedAwards: AwardRecord[] = awardRows.map((a) => ({
    id: a.id,
    name: a.name,
    recipientType: a.recipientType as AwardRecord['recipientType'],
    recipientId: a.recipientId,
    recipientName: a.recipientName,
    competitionId: undefIfNull(a.competitionId),
    competitionName: undefIfNull(a.competitionName),
    season: undefIfNull(a.season),
    awardedAt: a.awardedAt,
    awardedBy: a.awardedBy,
  }));

  const mappedNotifications: NotificationEntry[] = notificationRows.map((n) => ({
    id: n.id,
    category: n.category as NotificationEntry['category'],
    recipientDiscordId: n.recipientDiscordId,
    recipientName: n.recipientName,
    title: n.title,
    message: n.message,
    channelName: undefIfNull(n.channelName),
    createdAt: n.createdAt,
    read: n.read,
  }));

  const mappedAuditLogs: AuditLogEntry[] = auditRows.map((a) => ({
    id: a.id,
    action: a.action,
    actor: a.actor,
    target: a.target,
    timestamp: a.timestamp,
    previousValue: a.previousValue,
    newValue: a.newValue,
  }));

  const mappedSanctions: SanctionRecord[] = sanctionRows.map((s) => ({
    id: s.id,
    referenceNumber: s.referenceNumber,
    playerTlcId: s.playerTlcId ?? null,
    playerDiscordUserId: s.playerDiscordUserId,
    playerDiscordUsername: s.playerDiscordUsername,
    playerName: s.playerName,
    playerAvatarUrl: s.playerAvatarUrl,
    clubId: s.clubId ?? null,
    clubName: s.clubName,
    sanctionType: s.sanctionType as SanctionType,
    reason: s.reason,
    fineAmount: s.fineAmount,
    finePaidAmount: s.finePaidAmount,
    fineCurrency: s.fineCurrency,
    fineStatus: s.fineStatus as SanctionRecord['fineStatus'],
    fineWaiverReason: undefIfNull(s.fineWaiverReason),
    fineHistory: s.fineHistory || [],
    suspensionMatchesTotal: s.suspensionMatchesTotal,
    suspensionMatchesRemaining: s.suspensionMatchesRemaining,
    servedMatchIds: s.servedMatchIds || [],
    status: s.status as SanctionRecord['status'],
    issuedByDiscordId: s.issuedByDiscordId,
    issuedByUsername: s.issuedByUsername,
    issuedAt: s.issuedAt,
    updatedAt: undefIfNull(s.updatedAt),
    updatedBy: undefIfNull(s.updatedBy),
    removedAt: undefIfNull(s.removedAt),
    removedBy: undefIfNull(s.removedBy),
    removalReason: undefIfNull(s.removalReason),
    announcementChannelId: undefIfNull(s.announcementChannelId),
    announcementMessageId: undefIfNull(s.announcementMessageId),
  }));

  const mappedAppeals: SanctionAppeal[] = appealRows.map((a) => ({
    id: a.id,
    sanctionId: a.sanctionId,
    sanctionReference: a.sanctionReference,
    playerTlcId: a.playerTlcId ?? null,
    playerDiscordUserId: a.playerDiscordUserId,
    playerDiscordUsername: a.playerDiscordUsername,
    playerName: a.playerName,
    explanation: a.explanation,
    status: a.status as SanctionAppeal['status'],
    rejectionReason: undefIfNull(a.rejectionReason),
    resolutionNote: undefIfNull(a.resolutionNote),
    submittedAt: a.submittedAt,
    reviewedAt: undefIfNull(a.reviewedAt),
    reviewedBy: undefIfNull(a.reviewedBy),
  }));

  const mappedCoaches: CoachProfile[] = coachRows.map((c) => ({
    tlcId: c.tlcId,
    discordUserId: c.discordUserId,
    discordUsername: c.discordUsername,
    coachName: c.coachName,
    coachingExperience: c.coachingExperience,
    previousTeams: undefIfNull(c.previousTeams),
    avatarUrl: c.avatarUrl,
    additionalInfo: undefIfNull(c.additionalInfo),
    currentClubId: c.currentClubId ?? null,
    registrationDate: c.registrationDate,
    status: c.status as CoachProfile['status'],
    matchesCoached: c.matchesCoached,
    wins: c.wins,
    draws: c.draws,
    losses: c.losses,
    trophies: c.trophies,
    careerHistory: c.careerHistory || [],
    inServer: c.inServer,
    deletedAt: undefIfNull(c.deletedAt),
    deletedBy: undefIfNull(c.deletedBy),
    deletionReason: undefIfNull(c.deletionReason),
  }));

  const mappedTickets: UnifiedTicket[] = ticketRows.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    complaintId: undefIfNull(t.complaintId),
    categoryKey: t.categoryKey as UnifiedTicket['categoryKey'],
    applicationSubType: undefIfNull(t.applicationSubType) as UnifiedTicket['applicationSubType'],
    guildId: t.guildId,
    channelId: t.channelId,
    channelName: t.channelName,
    panelMessageId: undefIfNull(t.panelMessageId),
    creatorDiscordId: t.creatorDiscordId,
    creatorUsername: t.creatorUsername,
    creatorAvatarUrl: undefIfNull(t.creatorAvatarUrl),
    isAnonymous: t.isAnonymous,
    complaintCategory: undefIfNull(t.complaintCategory) as ComplaintCategory | undefined,
    staffDepartment: undefIfNull(t.staffDepartment) as StaffDepartment | undefined,
    targetDiscordId: undefIfNull(t.targetDiscordId),
    targetUsername: undefIfNull(t.targetUsername),
    targetDisplayName: undefIfNull(t.targetDisplayName),
    priority: t.priority as TicketPriority,
    status: t.status as TicketStatus,
    claimedByDiscordId: undefIfNull(t.claimedByDiscordId),
    claimedByUsername: undefIfNull(t.claimedByUsername),
    participantDiscordIds: t.participantDiscordIds || [],
    answers: t.answers || [],
    metadata: t.metadata || {},
    evidence: t.evidence || [],
    staffNotes: t.staffNotes || [],
    transcript: t.transcript || [],
    decision: undefIfNull(t.decision) as UnifiedTicket['decision'],
    decisionReason: undefIfNull(t.decisionReason),
    decidedByDiscordId: undefIfNull(t.decidedByDiscordId),
    decidedByUsername: undefIfNull(t.decidedByUsername),
    decidedAt: undefIfNull(t.decidedAt),
    createdProfileTlcId: undefIfNull(t.createdProfileTlcId),
    createdClubId: undefIfNull(t.createdClubId),
    feedbackRating: undefIfNull(t.feedbackRating),
    feedbackComment: undefIfNull(t.feedbackComment),
    lastActivityAt: t.lastActivityAt,
    lastStaffReplyAt: undefIfNull(t.lastStaffReplyAt),
    lastReminderAt: undefIfNull(t.lastReminderAt),
    escalatedAt: undefIfNull(t.escalatedAt),
    createdAt: t.createdAt,
    closedAt: undefIfNull(t.closedAt),
    closedByDiscordId: undefIfNull(t.closedByDiscordId),
    closedByUsername: undefIfNull(t.closedByUsername),
    channelDeletedAt: undefIfNull(t.channelDeletedAt),
  }));

  const counterRow = counterRows[0];
  const cfgRow = configRows[0];

  const maxTlcNum = Math.max(
    0,
    ...mappedPlayers.map((p) => extractTrailingNumber(p.tlcId)),
    ...mappedManagers.map((m) => extractTrailingNumber(m.tlcId)),
    ...mappedCoaches.map((c) => extractTrailingNumber(c.tlcId))
  );
  const maxClubNum = Math.max(0, ...mappedClubs.map((c) => extractTrailingNumber(c.clubId)));
  const maxMatchNum = Math.max(0, ...mappedFixtures.map((f) => f.matchNumber));
  const maxSanctionNum = Math.max(
    0,
    ...mappedSanctions.map((s) => extractTrailingNumber(s.referenceNumber))
  );
  const maxTicketNum = Math.max(
    0,
    ...mappedTickets.map((t) => extractTrailingNumber(t.ticketNumber))
  );
  const maxComplaintNum = Math.max(
    0,
    ...mappedTickets.map((t) => extractTrailingNumber(t.complaintId))
  );

  const nextTlcSequence = Math.max(counterRow?.nextTlcSequence ?? 1, maxTlcNum + 1);
  const nextClubSequence = Math.max(counterRow?.nextClubSequence ?? 1, maxClubNum + 1);
  const nextMatchSequence = Math.max(counterRow?.nextMatchSequence ?? 1, maxMatchNum + 1);
  const nextSanctionSequence = Math.max(counterRow?.nextSanctionSequence ?? 1, maxSanctionNum + 1);
  const nextTicketSequence = Math.max(counterRow?.nextTicketSequence ?? 1, maxTicketNum + 1);
  const nextComplaintSequence = Math.max(counterRow?.nextComplaintSequence ?? 1, maxComplaintNum + 1);

  const defaultTicketCfg = createDefaultTicketSystemConfig();
  const savedTicketCfg = cfgRow?.tickets;
  const mergedCategories =
    Array.isArray(savedTicketCfg?.categories) && savedTicketCfg.categories.length > 0
      ? [
          ...savedTicketCfg.categories,
          ...defaultTicketCfg.categories.filter(
            (def) => !savedTicketCfg.categories.some((existing) => existing.key === def.key)
          ),
        ].sort((a, b) => a.order - b.order)
      : defaultTicketCfg.categories;

  const loadedConfig: BotConfig = cfgRow
    ? {
        channels: { ...defaultCfg.channels, ...(cfgRow.channels || {}) },
        roles: {
          ...defaultCfg.roles,
          ...(cfgRow.roles || {}),
          staffRoleIds: Array.isArray(cfgRow.roles?.staffRoleIds)
            ? cfgRow.roles.staffRoleIds
            : [],
          disciplinaryRoleIds: Array.isArray(cfgRow.roles?.disciplinaryRoleIds)
            ? cfgRow.roles.disciplinaryRoleIds
            : [],
          supportRoleIds: Array.isArray(cfgRow.roles?.supportRoleIds)
            ? cfgRow.roles.supportRoleIds
            : [],
          playerRegStaffRoleIds: Array.isArray(cfgRow.roles?.playerRegStaffRoleIds)
            ? cfgRow.roles.playerRegStaffRoleIds
            : [],
          coachRegStaffRoleIds: Array.isArray(cfgRow.roles?.coachRegStaffRoleIds)
            ? cfgRow.roles.coachRegStaffRoleIds
            : [],
          staffAppRoleIds: Array.isArray(cfgRow.roles?.staffAppRoleIds)
            ? cfgRow.roles.staffAppRoleIds
            : [],
          complaintStaffRoleIds: Array.isArray(cfgRow.roles?.complaintStaffRoleIds)
            ? cfgRow.roles.complaintStaffRoleIds
            : [],
          teamRegStaffRoleIds: Array.isArray(cfgRow.roles?.teamRegStaffRoleIds)
            ? cfgRow.roles.teamRegStaffRoleIds
            : [],
          seniorAdminRoleIds: Array.isArray(cfgRow.roles?.seniorAdminRoleIds)
            ? cfgRow.roles.seniorAdminRoleIds
            : [],
        },
        transferWindow: { ...defaultCfg.transferWindow, ...(cfgRow.transferWindow || {}) },
        competitions: { ...defaultCfg.competitions, ...(cfgRow.competitions || {}) },
        notifications: { ...defaultCfg.notifications, ...(cfgRow.notifications || {}) },
        sanctions: {
          defaultCurrency:
            cfgRow.sanctions?.defaultCurrency || defaultCfg.sanctions?.defaultCurrency || 'TLC Coins',
        },
        tickets: {
          ...defaultTicketCfg,
          ...(savedTicketCfg || {}),
          categories: mergedCategories,
        },
      }
    : defaultCfg;

  return {
    schemaVersion: counterRow?.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    nextTlcSequence,
    nextClubSequence,
    nextMatchSequence,
    nextSanctionSequence,
    nextTicketSequence,
    nextComplaintSequence,
    registrations: mappedRegistrations,
    correctionRequests: mappedCorrections,
    clubRegistrationRequests: mappedClubRegs,
    teamMemberships: mappedMemberships,
    signingRequests: mappedSignings,
    players: mappedPlayers,
    managers: mappedManagers,
    coaches: mappedCoaches,
    clubs: mappedClubs,
    transfers: mappedTransfers,
    transferOffers: mappedOffers,
    contracts: mappedContracts,
    competitions: mappedCompetitions,
    competitionRegistrations: mappedCompRegs,
    fixtures: mappedFixtures,
    awards: mappedAwards,
    sanctions: mappedSanctions,
    sanctionAppeals: mappedAppeals,
    tickets: mappedTickets,
    notifications: mappedNotifications,
    auditLogs: mappedAuditLogs,
    config: loadedConfig,
  };
}

function diffByKey<T>(
  prevItems: T[] | undefined,
  nextItems: T[] | undefined,
  getKey: (item: T) => string
): { upserts: T[]; deletedKeys: string[] } {
  const prevMap = new Map<string, string>();
  for (const item of prevItems || []) {
    prevMap.set(getKey(item), JSON.stringify(item));
  }

  const nextKeys = new Set<string>();
  const upserts: T[] = [];
  for (const item of nextItems || []) {
    const key = getKey(item);
    nextKeys.add(key);
    const prevSerialized = prevMap.get(key);
    if (prevSerialized === undefined || prevSerialized !== JSON.stringify(item)) {
      upserts.push(item);
    }
  }

  const deletedKeys: string[] = [];
  for (const key of prevMap.keys()) {
    if (!nextKeys.has(key)) {
      deletedKeys.push(key);
    }
  }

  return { upserts, deletedKeys };
}

function mapClubRow(c: Club) {
  return {
    clubId: c.clubId,
    name: c.name,
    shortCode: c.shortCode,
    logoUrl: c.logoUrl,
    logoEmoji: c.logoEmoji ?? null,
    primaryColor: c.primaryColor,
    discordRoleId: c.discordRoleId,
    ownerDiscordUserId: c.ownerDiscordUserId ?? null,
    ownerDiscordUsername: c.ownerDiscordUsername ?? null,
    status: c.status || 'Active',
    currentManagerTlcId: c.currentManagerTlcId ?? null,
    registrationDate: c.registrationDate,
    matchesPlayed: c.matchesPlayed,
    wins: c.wins,
    draws: c.draws,
    losses: c.losses,
    goalsFor: c.goalsFor,
    goalsAgainst: c.goalsAgainst,
    trophies: c.trophies,
    currentCompetitionIds: c.currentCompetitionIds || [],
    history: c.history || [],
  };
}

function mapPlayerRow(p: PlayerProfile) {
  return {
    tlcId: p.tlcId,
    discordUserId: p.discordUserId,
    discordUsername: p.discordUsername,
    playerName: p.playerName,
    robloxUsername: p.robloxUsername,
    robloxAvatarUrl: p.robloxAvatarUrl,
    position: p.position,
    currentClubId: p.currentClubId ?? null,
    loanedFromClubId: p.loanedFromClubId ?? null,
    registrationDate: p.registrationDate,
    status: p.status,
    matchesPlayed: p.matchesPlayed,
    goals: p.goals,
    assists: p.assists,
    cleanSheets: p.cleanSheets,
    saves: p.saves,
    ratingSum: p.ratingSum,
    ratingCount: p.ratingCount,
    averageRating: p.averageRating,
    manOfTheMatchAwards: p.manOfTheMatchAwards,
    trophies: p.trophies,
    achievements: p.achievements || [],
    careerHistory: p.careerHistory || [],
    inServer: p.inServer,
    deletedAt: p.deletedAt ?? null,
    deletedBy: p.deletedBy ?? null,
    deletionReason: p.deletionReason ?? null,
    previousClubId: p.previousClubId ?? null,
    previousStatus: p.previousStatus ?? null,
  };
}

function mapManagerRow(m: ManagerProfile) {
  return {
    tlcId: m.tlcId,
    discordUserId: m.discordUserId,
    discordUsername: m.discordUsername,
    managerName: m.managerName,
    robloxUsername: m.robloxUsername,
    robloxAvatarUrl: m.robloxAvatarUrl,
    currentClubId: m.currentClubId ?? null,
    registrationDate: m.registrationDate,
    status: m.status,
    matchesManaged: m.matchesManaged,
    wins: m.wins,
    draws: m.draws,
    losses: m.losses,
    winRate: m.winRate,
    trophies: m.trophies,
    clubsManaged: m.clubsManaged || [],
    careerHistory: m.careerHistory || [],
    inServer: m.inServer,
    deletedAt: m.deletedAt ?? null,
    deletedBy: m.deletedBy ?? null,
    deletionReason: m.deletionReason ?? null,
    previousClubId: m.previousClubId ?? null,
    previousStatus: m.previousStatus ?? null,
  };
}

function mapFixtureRow(f: Fixture) {
  return {
    id: f.id,
    matchNumber: f.matchNumber,
    competitionId: f.competitionId,
    competitionName: f.competitionName,
    roundLabel: f.roundLabel,
    bracketSlot: f.bracketSlot ?? null,
    nextFixtureId: f.nextFixtureId ?? null,
    nextSlotSide: f.nextSlotSide ?? null,
    homeClubId: f.homeClubId ?? null,
    awayClubId: f.awayClubId ?? null,
    matchDate: f.matchDate,
    matchTime: f.matchTime,
    status: f.status,
    referee: f.referee ?? null,
    homeScore: f.homeScore ?? null,
    awayScore: f.awayScore ?? null,
    notes: f.notes ?? null,
    resultStatus: f.resultStatus ?? null,
    resultRejectionReason: f.resultRejectionReason ?? null,
    resultSubmittedBy: f.resultSubmittedBy ?? null,
    resultSubmittedByDiscordId: f.resultSubmittedByDiscordId ?? null,
    resultApprovedBy: f.resultApprovedBy ?? null,
  };
}

export async function persistStateDiffInTransaction(
  db: TlcDb,
  prev: TlcDatabaseState,
  next: TlcDatabaseState
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    if (
      prev.nextTlcSequence !== next.nextTlcSequence ||
      prev.nextClubSequence !== next.nextClubSequence ||
      prev.nextMatchSequence !== next.nextMatchSequence ||
      prev.nextSanctionSequence !== next.nextSanctionSequence ||
      prev.nextTicketSequence !== next.nextTicketSequence ||
      prev.nextComplaintSequence !== next.nextComplaintSequence ||
      prev.schemaVersion !== next.schemaVersion
    ) {
      await tx
        .insert(systemCounters)
        .values({
          id: 1,
          schemaVersion: next.schemaVersion ?? CURRENT_SCHEMA_VERSION,
          nextTlcSequence: next.nextTlcSequence,
          nextClubSequence: next.nextClubSequence,
          nextMatchSequence: next.nextMatchSequence,
          nextSanctionSequence: next.nextSanctionSequence ?? 1,
          nextTicketSequence: next.nextTicketSequence ?? 1,
          nextComplaintSequence: next.nextComplaintSequence ?? 1,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: systemCounters.id,
          set: {
            schemaVersion: next.schemaVersion ?? CURRENT_SCHEMA_VERSION,
            nextTlcSequence: next.nextTlcSequence,
            nextClubSequence: next.nextClubSequence,
            nextMatchSequence: next.nextMatchSequence,
            nextSanctionSequence: next.nextSanctionSequence ?? 1,
            nextTicketSequence: next.nextTicketSequence ?? 1,
            nextComplaintSequence: next.nextComplaintSequence ?? 1,
            updatedAt: now,
          },
        });
    }

    if (JSON.stringify(prev.config) !== JSON.stringify(next.config)) {
      await tx
        .insert(botConfig)
        .values({
          id: 1,
          channels: next.config.channels,
          roles: next.config.roles,
          transferWindow: next.config.transferWindow,
          competitions: next.config.competitions,
          notifications: next.config.notifications,
          sanctions: next.config.sanctions,
          tickets: next.config.tickets,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: botConfig.id,
          set: {
            channels: next.config.channels,
            roles: next.config.roles,
            transferWindow: next.config.transferWindow,
            competitions: next.config.competitions,
            notifications: next.config.notifications,
            sanctions: next.config.sanctions,
            tickets: next.config.tickets,
            updatedAt: now,
          },
        });
    }

    // Clubs
    const clubsDiff = diffByKey(prev.clubs, next.clubs, (c) => c.clubId);
    for (const c of clubsDiff.upserts) {
      const row = mapClubRow(c);
      await tx.insert(clubs).values(row).onConflictDoUpdate({ target: clubs.clubId, set: row });
    }
    if (clubsDiff.deletedKeys.length > 0) {
      await tx.delete(clubs).where(inArray(clubs.clubId, clubsDiff.deletedKeys));
    }

    // Players
    const playersDiff = diffByKey(prev.players, next.players, (p) => p.tlcId);
    for (const p of playersDiff.upserts) {
      const row = mapPlayerRow(p);
      await tx.insert(players).values(row).onConflictDoUpdate({ target: players.tlcId, set: row });
    }
    if (playersDiff.deletedKeys.length > 0) {
      await tx.delete(players).where(inArray(players.tlcId, playersDiff.deletedKeys));
    }

    // Managers
    const managersDiff = diffByKey(prev.managers, next.managers, (m) => m.tlcId);
    for (const m of managersDiff.upserts) {
      const row = mapManagerRow(m);
      await tx.insert(managers).values(row).onConflictDoUpdate({ target: managers.tlcId, set: row });
    }
    if (managersDiff.deletedKeys.length > 0) {
      await tx.delete(managers).where(inArray(managers.tlcId, managersDiff.deletedKeys));
    }

    // Team Memberships
    const memDiff = diffByKey(prev.teamMemberships, next.teamMemberships, (m) => m.id);
    for (const m of memDiff.upserts) {
      const row = {
        id: m.id,
        discordUserId: m.discordUserId,
        discordUsername: m.discordUsername,
        playerTlcId: m.playerTlcId ?? null,
        playerName: m.playerName,
        clubId: m.clubId,
        clubName: m.clubName,
        roleId: m.roleId,
        joinDate: m.joinDate,
        status: m.status,
      };
      await tx
        .insert(teamMemberships)
        .values(row)
        .onConflictDoUpdate({ target: teamMemberships.id, set: row });
    }
    if (memDiff.deletedKeys.length > 0) {
      await tx.delete(teamMemberships).where(inArray(teamMemberships.id, memDiff.deletedKeys));
    }

    // Registrations
    const regDiff = diffByKey(prev.registrations, next.registrations, (r) => r.id);
    for (const r of regDiff.upserts) {
      const row = {
        id: r.id,
        discordUserId: r.discordUserId,
        discordUsername: r.discordUsername,
        playerName: r.playerName,
        robloxUsername: r.robloxUsername,
        robloxAvatarUrl: r.robloxAvatarUrl,
        registrationType: r.registrationType,
        position: r.position ?? null,
        status: r.status,
        rejectionReason: r.rejectionReason ?? null,
        allowResubmit: r.allowResubmit,
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt ?? null,
        reviewedBy: r.reviewedBy ?? null,
        tlcId: r.tlcId ?? null,
      };
      await tx
        .insert(registrations)
        .values(row)
        .onConflictDoUpdate({ target: registrations.id, set: row });
    }
    if (regDiff.deletedKeys.length > 0) {
      await tx.delete(registrations).where(inArray(registrations.id, regDiff.deletedKeys));
    }

    // Profile Correction Requests
    const corrDiff = diffByKey(prev.correctionRequests, next.correctionRequests, (c) => c.id);
    for (const c of corrDiff.upserts) {
      const row = {
        id: c.id,
        tlcId: c.tlcId,
        discordUserId: c.discordUserId,
        requestedFields: c.requestedFields || {},
        reason: c.reason,
        status: c.status,
        rejectionReason: c.rejectionReason ?? null,
        submittedAt: c.submittedAt,
        reviewedAt: c.reviewedAt ?? null,
        reviewedBy: c.reviewedBy ?? null,
      };
      await tx
        .insert(profileCorrectionRequests)
        .values(row)
        .onConflictDoUpdate({ target: profileCorrectionRequests.id, set: row });
    }
    if (corrDiff.deletedKeys.length > 0) {
      await tx
        .delete(profileCorrectionRequests)
        .where(inArray(profileCorrectionRequests.id, corrDiff.deletedKeys));
    }

    // Club Registration Requests
    const clubRegDiff = diffByKey(
      prev.clubRegistrationRequests,
      next.clubRegistrationRequests,
      (c) => c.id
    );
    for (const c of clubRegDiff.upserts) {
      const row = {
        id: c.id,
        name: c.name,
        shortCode: c.shortCode,
        logoUrl: c.logoUrl,
        primaryColor: c.primaryColor,
        requestedByDiscordId: c.requestedByDiscordId,
        requestedByUsername: c.requestedByUsername,
        managerTlcId: c.managerTlcId ?? null,
        status: c.status,
        rejectionReason: c.rejectionReason ?? null,
        submittedAt: c.submittedAt,
        reviewedAt: c.reviewedAt ?? null,
        reviewedBy: c.reviewedBy ?? null,
        clubId: c.clubId ?? null,
      };
      await tx
        .insert(clubRegistrationRequests)
        .values(row)
        .onConflictDoUpdate({ target: clubRegistrationRequests.id, set: row });
    }
    if (clubRegDiff.deletedKeys.length > 0) {
      await tx
        .delete(clubRegistrationRequests)
        .where(inArray(clubRegistrationRequests.id, clubRegDiff.deletedKeys));
    }

    // Signing Requests (/demande)
    const signDiff = diffByKey(prev.signingRequests, next.signingRequests, (s) => s.id);
    for (const s of signDiff.upserts) {
      const row = {
        id: s.id,
        playerDiscordUserId: s.playerDiscordUserId,
        playerDiscordUsername: s.playerDiscordUsername,
        playerTlcId: s.playerTlcId ?? null,
        playerName: s.playerName,
        robloxUsername: s.robloxUsername ?? null,
        position: s.position ?? null,
        fromClubId: s.fromClubId ?? null,
        fromClubName: s.fromClubName,
        requestedClubId: s.requestedClubId,
        requestedClubName: s.requestedClubName,
        requestedClubLogoEmoji: s.requestedClubLogoEmoji ?? null,
        requestDate: s.requestDate,
        status: s.status,
        rejectionReason: s.rejectionReason ?? null,
        approvedBy: s.approvedBy ?? null,
        approvedByDiscordId: s.approvedByDiscordId ?? null,
        approvalDate: s.approvalDate ?? null,
      };
      await tx
        .insert(signingRequests)
        .values(row)
        .onConflictDoUpdate({ target: signingRequests.id, set: row });
    }
    if (signDiff.deletedKeys.length > 0) {
      await tx.delete(signingRequests).where(inArray(signingRequests.id, signDiff.deletedKeys));
    }

    // Transfer Offers
    const offerDiff = diffByKey(prev.transferOffers, next.transferOffers, (o) => o.id);
    for (const o of offerDiff.upserts) {
      const row = {
        id: o.id,
        playerTlcId: o.playerTlcId,
        playerName: o.playerName,
        fromClubId: o.fromClubId ?? null,
        fromClubName: o.fromClubName,
        toClubId: o.toClubId,
        toClubName: o.toClubName,
        managerTlcId: o.managerTlcId,
        managerName: o.managerName,
        transferType: o.transferType,
        details: o.details,
        status: o.status,
        rejectionReason: o.rejectionReason ?? null,
        createdAt: o.createdAt,
        playerRespondedAt: o.playerRespondedAt ?? null,
        staffReviewedAt: o.staffReviewedAt ?? null,
        staffReviewedBy: o.staffReviewedBy ?? null,
      };
      await tx
        .insert(transferOffers)
        .values(row)
        .onConflictDoUpdate({ target: transferOffers.id, set: row });
    }
    if (offerDiff.deletedKeys.length > 0) {
      await tx.delete(transferOffers).where(inArray(transferOffers.id, offerDiff.deletedKeys));
    }

    // Transfers
    const transferDiff = diffByKey(prev.transfers, next.transfers, (t) => t.id);
    for (const t of transferDiff.upserts) {
      const row = {
        id: t.id,
        playerTlcId: t.playerTlcId,
        playerDiscordUserId: t.playerDiscordUserId ?? null,
        playerName: t.playerName,
        fromClubId: t.fromClubId ?? null,
        fromClubName: t.fromClubName,
        toClubId: t.toClubId ?? null,
        toClubName: t.toClubName,
        transferType: t.transferType,
        details: t.details,
        approvedBy: t.approvedBy,
        completedAt: t.completedAt,
      };
      await tx
        .insert(transfers)
        .values(row)
        .onConflictDoUpdate({ target: transfers.id, set: row });
    }
    if (transferDiff.deletedKeys.length > 0) {
      await tx.delete(transfers).where(inArray(transfers.id, transferDiff.deletedKeys));
    }

    // Contracts
    const contractDiff = diffByKey(prev.contracts, next.contracts, (c) => c.id);
    for (const c of contractDiff.upserts) {
      const row = {
        id: c.id,
        playerTlcId: c.playerTlcId,
        playerName: c.playerName,
        clubId: c.clubId,
        clubName: c.clubName,
        startDate: c.startDate,
        expirationDate: c.expirationDate,
        status: c.status,
        terms: c.terms,
        notifiedExpiring: c.notifiedExpiring,
      };
      await tx
        .insert(contracts)
        .values(row)
        .onConflictDoUpdate({ target: contracts.id, set: row });
    }
    if (contractDiff.deletedKeys.length > 0) {
      await tx.delete(contracts).where(inArray(contracts.id, contractDiff.deletedKeys));
    }

    // Competitions
    const compDiff = diffByKey(prev.competitions, next.competitions, (c) => c.id);
    for (const c of compDiff.upserts) {
      const row = {
        id: c.id,
        name: c.name,
        type: c.type,
        season: c.season,
        participatingClubIds: c.participatingClubIds || [],
        numberOfGroups: c.numberOfGroups,
        numberOfTeams: c.numberOfTeams,
        matchFormat: c.matchFormat,
        rules: c.rules,
        rosterLimit: c.rosterLimit,
        registrationDeadline: c.registrationDeadline,
        startDate: c.startDate,
        endDate: c.endDate,
        status: c.status,
        pointsWin: c.pointsWin,
        pointsDraw: c.pointsDraw,
        pointsLoss: c.pointsLoss,
        tieBreaker: c.tieBreaker,
        includeThirdPlace: c.includeThirdPlace,
      };
      await tx
        .insert(competitions)
        .values(row)
        .onConflictDoUpdate({ target: competitions.id, set: row });
    }
    if (compDiff.deletedKeys.length > 0) {
      await tx.delete(competitions).where(inArray(competitions.id, compDiff.deletedKeys));
    }

    // Competition Registrations
    const compRegDiff = diffByKey(
      prev.competitionRegistrations,
      next.competitionRegistrations,
      (r) => r.id
    );
    for (const r of compRegDiff.upserts) {
      const row = {
        id: r.id,
        competitionId: r.competitionId,
        clubId: r.clubId,
        clubName: r.clubName,
        managerTlcId: r.managerTlcId,
        rosterTlcIds: r.rosterTlcIds || [],
        status: r.status,
        rejectionReason: r.rejectionReason ?? null,
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt ?? null,
        reviewedBy: r.reviewedBy ?? null,
      };
      await tx
        .insert(competitionRegistrations)
        .values(row)
        .onConflictDoUpdate({ target: competitionRegistrations.id, set: row });
    }
    if (compRegDiff.deletedKeys.length > 0) {
      await tx
        .delete(competitionRegistrations)
        .where(inArray(competitionRegistrations.id, compRegDiff.deletedKeys));
    }

    // Fixtures & Player Match Stats
    const prevFixtureMap = new Map(prev.fixtures.map((f) => [f.id, f]));
    const fixtureDiff = diffByKey(prev.fixtures, next.fixtures, (f) => f.id);
    for (const f of fixtureDiff.upserts) {
      const row = mapFixtureRow(f);
      await tx
        .insert(fixtures)
        .values(row)
        .onConflictDoUpdate({ target: fixtures.id, set: row });

      const prevFix = prevFixtureMap.get(f.id);
      if (
        JSON.stringify(prevFix?.playerStats || []) !== JSON.stringify(f.playerStats || [])
      ) {
        await tx.delete(playerMatchStats).where(eq(playerMatchStats.fixtureId, f.id));
        if (f.playerStats && f.playerStats.length > 0) {
          await tx.insert(playerMatchStats).values(
            f.playerStats.map((ps) => ({
              fixtureId: f.id,
              playerTlcId: ps.playerTlcId,
              playerName: ps.playerName,
              clubId: ps.clubId,
              goals: ps.goals,
              assists: ps.assists,
              saves: ps.saves,
              cleanSheet: ps.cleanSheet,
              rating: ps.rating,
              manOfTheMatch: ps.manOfTheMatch,
            }))
          );
        }
      }
    }
    if (fixtureDiff.deletedKeys.length > 0) {
      await tx.delete(fixtures).where(inArray(fixtures.id, fixtureDiff.deletedKeys));
    }

    // Awards
    const awardDiff = diffByKey(prev.awards, next.awards, (a) => a.id);
    for (const a of awardDiff.upserts) {
      const row = {
        id: a.id,
        name: a.name,
        recipientType: a.recipientType,
        recipientId: a.recipientId,
        recipientName: a.recipientName,
        competitionId: a.competitionId ?? null,
        competitionName: a.competitionName ?? null,
        season: a.season ?? null,
        awardedAt: a.awardedAt,
        awardedBy: a.awardedBy,
      };
      await tx.insert(awards).values(row).onConflictDoUpdate({ target: awards.id, set: row });
    }
    if (awardDiff.deletedKeys.length > 0) {
      await tx.delete(awards).where(inArray(awards.id, awardDiff.deletedKeys));
    }

    // Notifications (append/update only; historical notifications are preserved in PostgreSQL)
    const notifDiff = diffByKey(prev.notifications, next.notifications, (n) => n.id);
    for (const n of notifDiff.upserts) {
      const row = {
        id: n.id,
        category: n.category,
        recipientDiscordId: n.recipientDiscordId,
        recipientName: n.recipientName,
        title: n.title,
        message: n.message,
        channelName: n.channelName ?? null,
        createdAt: n.createdAt,
        read: n.read,
      };
      await tx
        .insert(notifications)
        .values(row)
        .onConflictDoUpdate({ target: notifications.id, set: row });
    }

    // Sanctions (historical records are ALWAYS preserved; never hard-deleted)
    const sanctionDiff = diffByKey(prev.sanctions, next.sanctions, (s) => s.id);
    for (const s of sanctionDiff.upserts) {
      const row = {
        id: s.id,
        referenceNumber: s.referenceNumber,
        playerTlcId: s.playerTlcId ?? null,
        playerDiscordUserId: s.playerDiscordUserId,
        playerDiscordUsername: s.playerDiscordUsername,
        playerName: s.playerName,
        playerAvatarUrl: s.playerAvatarUrl,
        clubId: s.clubId ?? null,
        clubName: s.clubName,
        sanctionType: s.sanctionType,
        reason: s.reason,
        fineAmount: s.fineAmount,
        finePaidAmount: s.finePaidAmount,
        fineCurrency: s.fineCurrency,
        fineStatus: s.fineStatus,
        fineWaiverReason: s.fineWaiverReason ?? null,
        fineHistory: s.fineHistory || [],
        suspensionMatchesTotal: s.suspensionMatchesTotal,
        suspensionMatchesRemaining: s.suspensionMatchesRemaining,
        servedMatchIds: s.servedMatchIds || [],
        status: s.status,
        issuedByDiscordId: s.issuedByDiscordId,
        issuedByUsername: s.issuedByUsername,
        issuedAt: s.issuedAt,
        updatedAt: s.updatedAt ?? null,
        updatedBy: s.updatedBy ?? null,
        removedAt: s.removedAt ?? null,
        removedBy: s.removedBy ?? null,
        removalReason: s.removalReason ?? null,
        announcementChannelId: s.announcementChannelId ?? null,
        announcementMessageId: s.announcementMessageId ?? null,
      };
      await tx.insert(sanctions).values(row).onConflictDoUpdate({ target: sanctions.id, set: row });
    }

    // Sanction Appeals (historical records preserved)
    const appealDiff = diffByKey(prev.sanctionAppeals, next.sanctionAppeals, (a) => a.id);
    for (const a of appealDiff.upserts) {
      const row = {
        id: a.id,
        sanctionId: a.sanctionId,
        sanctionReference: a.sanctionReference,
        playerTlcId: a.playerTlcId ?? null,
        playerDiscordUserId: a.playerDiscordUserId,
        playerDiscordUsername: a.playerDiscordUsername,
        playerName: a.playerName,
        explanation: a.explanation,
        status: a.status,
        rejectionReason: a.rejectionReason ?? null,
        resolutionNote: a.resolutionNote ?? null,
        submittedAt: a.submittedAt,
        reviewedAt: a.reviewedAt ?? null,
        reviewedBy: a.reviewedBy ?? null,
      };
      await tx
        .insert(sanctionAppeals)
        .values(row)
        .onConflictDoUpdate({ target: sanctionAppeals.id, set: row });
    }

    // Coaches (official coach profiles preserved)
    const coachDiff = diffByKey(prev.coaches, next.coaches, (c) => c.tlcId);
    for (const c of coachDiff.upserts) {
      const row = {
        tlcId: c.tlcId,
        discordUserId: c.discordUserId,
        discordUsername: c.discordUsername,
        coachName: c.coachName,
        coachingExperience: c.coachingExperience,
        previousTeams: c.previousTeams ?? null,
        avatarUrl: c.avatarUrl,
        additionalInfo: c.additionalInfo ?? null,
        currentClubId: c.currentClubId ?? null,
        registrationDate: c.registrationDate,
        status: c.status,
        matchesCoached: c.matchesCoached,
        wins: c.wins,
        draws: c.draws,
        losses: c.losses,
        trophies: c.trophies,
        careerHistory: c.careerHistory || [],
        inServer: c.inServer,
        deletedAt: c.deletedAt ?? null,
        deletedBy: c.deletedBy ?? null,
        deletionReason: c.deletionReason ?? null,
      };
      await tx.insert(coaches).values(row).onConflictDoUpdate({ target: coaches.tlcId, set: row });
    }

    // Unified Tickets (historical tickets, transcripts, complaints, and applications are ALWAYS preserved)
    const ticketDiff = diffByKey(prev.tickets, next.tickets, (t) => t.id);
    for (const t of ticketDiff.upserts) {
      const row = {
        id: t.id,
        ticketNumber: t.ticketNumber,
        complaintId: t.complaintId ?? null,
        categoryKey: t.categoryKey,
        applicationSubType: t.applicationSubType ?? null,
        guildId: t.guildId,
        channelId: t.channelId,
        channelName: t.channelName,
        panelMessageId: t.panelMessageId ?? null,
        creatorDiscordId: t.creatorDiscordId,
        creatorUsername: t.creatorUsername,
        creatorAvatarUrl: t.creatorAvatarUrl ?? null,
        isAnonymous: t.isAnonymous,
        complaintCategory: t.complaintCategory ?? null,
        staffDepartment: t.staffDepartment ?? null,
        targetDiscordId: t.targetDiscordId ?? null,
        targetUsername: t.targetUsername ?? null,
        targetDisplayName: t.targetDisplayName ?? null,
        priority: t.priority,
        status: t.status,
        claimedByDiscordId: t.claimedByDiscordId ?? null,
        claimedByUsername: t.claimedByUsername ?? null,
        participantDiscordIds: t.participantDiscordIds || [],
        answers: t.answers || [],
        metadata: t.metadata || {},
        evidence: t.evidence || [],
        staffNotes: t.staffNotes || [],
        transcript: t.transcript || [],
        decision: t.decision ?? null,
        decisionReason: t.decisionReason ?? null,
        decidedByDiscordId: t.decidedByDiscordId ?? null,
        decidedByUsername: t.decidedByUsername ?? null,
        decidedAt: t.decidedAt ?? null,
        createdProfileTlcId: t.createdProfileTlcId ?? null,
        createdClubId: t.createdClubId ?? null,
        feedbackRating: t.feedbackRating ?? null,
        feedbackComment: t.feedbackComment ?? null,
        lastActivityAt: t.lastActivityAt,
        lastStaffReplyAt: t.lastStaffReplyAt ?? null,
        lastReminderAt: t.lastReminderAt ?? null,
        escalatedAt: t.escalatedAt ?? null,
        createdAt: t.createdAt,
        closedAt: t.closedAt ?? null,
        closedByDiscordId: t.closedByDiscordId ?? null,
        closedByUsername: t.closedByUsername ?? null,
        channelDeletedAt: t.channelDeletedAt ?? null,
      };
      await tx.insert(tickets).values(row).onConflictDoUpdate({ target: tickets.id, set: row });
    }

    // Audit Logs (append-only; historical audit logs are NEVER deleted from PostgreSQL)
    const auditDiff = diffByKey(prev.auditLogs, next.auditLogs, (a) => a.id);
    for (const a of auditDiff.upserts) {
      const row = {
        id: a.id,
        action: a.action,
        actor: a.actor,
        target: a.target,
        timestamp: a.timestamp,
        previousValue: a.previousValue,
        newValue: a.newValue,
      };
      await tx
        .insert(auditLogs)
        .values(row)
        .onConflictDoNothing({ target: auditLogs.id });
    }
  });
}

export async function importJsonStateIfMissing(db: TlcDb, jsonState: TlcDatabaseState): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    for (const c of jsonState.clubs || []) {
      await tx.insert(clubs).values(mapClubRow(c)).onConflictDoNothing({ target: clubs.clubId });
    }
    for (const p of jsonState.players || []) {
      await tx
        .insert(players)
        .values(mapPlayerRow(p))
        .onConflictDoNothing({ target: players.tlcId });
    }
    for (const m of jsonState.managers || []) {
      await tx
        .insert(managers)
        .values(mapManagerRow(m))
        .onConflictDoNothing({ target: managers.tlcId });
    }
    for (const mem of jsonState.teamMemberships || []) {
      await tx
        .insert(teamMemberships)
        .values({
          id: mem.id,
          discordUserId: mem.discordUserId,
          discordUsername: mem.discordUsername,
          playerTlcId: mem.playerTlcId ?? null,
          playerName: mem.playerName,
          clubId: mem.clubId,
          clubName: mem.clubName,
          roleId: mem.roleId,
          joinDate: mem.joinDate,
          status: mem.status,
        })
        .onConflictDoNothing({ target: teamMemberships.id });
    }
    for (const r of jsonState.registrations || []) {
      await tx
        .insert(registrations)
        .values({
          id: r.id,
          discordUserId: r.discordUserId,
          discordUsername: r.discordUsername,
          playerName: r.playerName,
          robloxUsername: r.robloxUsername,
          robloxAvatarUrl: r.robloxAvatarUrl,
          registrationType: r.registrationType,
          position: r.position ?? null,
          status: r.status,
          rejectionReason: r.rejectionReason ?? null,
          allowResubmit: r.allowResubmit,
          submittedAt: r.submittedAt,
          reviewedAt: r.reviewedAt ?? null,
          reviewedBy: r.reviewedBy ?? null,
          tlcId: r.tlcId ?? null,
        })
        .onConflictDoNothing({ target: registrations.id });
    }
    for (const c of jsonState.correctionRequests || []) {
      await tx
        .insert(profileCorrectionRequests)
        .values({
          id: c.id,
          tlcId: c.tlcId,
          discordUserId: c.discordUserId,
          requestedFields: c.requestedFields || {},
          reason: c.reason,
          status: c.status,
          rejectionReason: c.rejectionReason ?? null,
          submittedAt: c.submittedAt,
          reviewedAt: c.reviewedAt ?? null,
          reviewedBy: c.reviewedBy ?? null,
        })
        .onConflictDoNothing({ target: profileCorrectionRequests.id });
    }
    for (const cr of jsonState.clubRegistrationRequests || []) {
      await tx
        .insert(clubRegistrationRequests)
        .values({
          id: cr.id,
          name: cr.name,
          shortCode: cr.shortCode,
          logoUrl: cr.logoUrl,
          primaryColor: cr.primaryColor,
          requestedByDiscordId: cr.requestedByDiscordId,
          requestedByUsername: cr.requestedByUsername,
          managerTlcId: cr.managerTlcId ?? null,
          status: cr.status,
          rejectionReason: cr.rejectionReason ?? null,
          submittedAt: cr.submittedAt,
          reviewedAt: cr.reviewedAt ?? null,
          reviewedBy: cr.reviewedBy ?? null,
          clubId: cr.clubId ?? null,
        })
        .onConflictDoNothing({ target: clubRegistrationRequests.id });
    }
    for (const s of jsonState.signingRequests || []) {
      await tx
        .insert(signingRequests)
        .values({
          id: s.id,
          playerDiscordUserId: s.playerDiscordUserId,
          playerDiscordUsername: s.playerDiscordUsername,
          playerTlcId: s.playerTlcId ?? null,
          playerName: s.playerName,
          robloxUsername: s.robloxUsername ?? null,
          position: s.position ?? null,
          fromClubId: s.fromClubId ?? null,
          fromClubName: s.fromClubName,
          requestedClubId: s.requestedClubId,
          requestedClubName: s.requestedClubName,
          requestedClubLogoEmoji: s.requestedClubLogoEmoji ?? null,
          requestDate: s.requestDate,
          status: s.status,
          rejectionReason: s.rejectionReason ?? null,
          approvedBy: s.approvedBy ?? null,
          approvedByDiscordId: s.approvedByDiscordId ?? null,
          approvalDate: s.approvalDate ?? null,
        })
        .onConflictDoNothing({ target: signingRequests.id });
    }
    for (const o of jsonState.transferOffers || []) {
      await tx
        .insert(transferOffers)
        .values({
          id: o.id,
          playerTlcId: o.playerTlcId,
          playerName: o.playerName,
          fromClubId: o.fromClubId ?? null,
          fromClubName: o.fromClubName,
          toClubId: o.toClubId,
          toClubName: o.toClubName,
          managerTlcId: o.managerTlcId,
          managerName: o.managerName,
          transferType: o.transferType,
          details: o.details,
          status: o.status,
          rejectionReason: o.rejectionReason ?? null,
          createdAt: o.createdAt,
          playerRespondedAt: o.playerRespondedAt ?? null,
          staffReviewedAt: o.staffReviewedAt ?? null,
          staffReviewedBy: o.staffReviewedBy ?? null,
        })
        .onConflictDoNothing({ target: transferOffers.id });
    }
    for (const t of jsonState.transfers || []) {
      await tx
        .insert(transfers)
        .values({
          id: t.id,
          playerTlcId: t.playerTlcId,
          playerDiscordUserId: t.playerDiscordUserId ?? null,
          playerName: t.playerName,
          fromClubId: t.fromClubId ?? null,
          fromClubName: t.fromClubName,
          toClubId: t.toClubId ?? null,
          toClubName: t.toClubName,
          transferType: t.transferType,
          details: t.details,
          approvedBy: t.approvedBy,
          completedAt: t.completedAt,
        })
        .onConflictDoNothing({ target: transfers.id });
    }
    for (const c of jsonState.contracts || []) {
      await tx
        .insert(contracts)
        .values({
          id: c.id,
          playerTlcId: c.playerTlcId,
          playerName: c.playerName,
          clubId: c.clubId,
          clubName: c.clubName,
          startDate: c.startDate,
          expirationDate: c.expirationDate,
          status: c.status,
          terms: c.terms,
          notifiedExpiring: c.notifiedExpiring,
        })
        .onConflictDoNothing({ target: contracts.id });
    }
    for (const comp of jsonState.competitions || []) {
      await tx
        .insert(competitions)
        .values({
          id: comp.id,
          name: comp.name,
          type: comp.type,
          season: comp.season,
          participatingClubIds: comp.participatingClubIds || [],
          numberOfGroups: comp.numberOfGroups,
          numberOfTeams: comp.numberOfTeams,
          matchFormat: comp.matchFormat,
          rules: comp.rules,
          rosterLimit: comp.rosterLimit,
          registrationDeadline: comp.registrationDeadline,
          startDate: comp.startDate,
          endDate: comp.endDate,
          status: comp.status,
          pointsWin: comp.pointsWin,
          pointsDraw: comp.pointsDraw,
          pointsLoss: comp.pointsLoss,
          tieBreaker: comp.tieBreaker,
          includeThirdPlace: comp.includeThirdPlace,
        })
        .onConflictDoNothing({ target: competitions.id });
    }
    for (const cr of jsonState.competitionRegistrations || []) {
      await tx
        .insert(competitionRegistrations)
        .values({
          id: cr.id,
          competitionId: cr.competitionId,
          clubId: cr.clubId,
          clubName: cr.clubName,
          managerTlcId: cr.managerTlcId,
          rosterTlcIds: cr.rosterTlcIds || [],
          status: cr.status,
          rejectionReason: cr.rejectionReason ?? null,
          submittedAt: cr.submittedAt,
          reviewedAt: cr.reviewedAt ?? null,
          reviewedBy: cr.reviewedBy ?? null,
        })
        .onConflictDoNothing({ target: competitionRegistrations.id });
    }
    for (const f of jsonState.fixtures || []) {
      await tx
        .insert(fixtures)
        .values(mapFixtureRow(f))
        .onConflictDoNothing({ target: fixtures.id });
      for (const ps of f.playerStats || []) {
        await tx
          .insert(playerMatchStats)
          .values({
            fixtureId: f.id,
            playerTlcId: ps.playerTlcId,
            playerName: ps.playerName,
            clubId: ps.clubId,
            goals: ps.goals,
            assists: ps.assists,
            saves: ps.saves,
            cleanSheet: ps.cleanSheet,
            rating: ps.rating,
            manOfTheMatch: ps.manOfTheMatch,
          })
          .onConflictDoNothing();
      }
    }
    for (const a of jsonState.awards || []) {
      await tx
        .insert(awards)
        .values({
          id: a.id,
          name: a.name,
          recipientType: a.recipientType,
          recipientId: a.recipientId,
          recipientName: a.recipientName,
          competitionId: a.competitionId ?? null,
          competitionName: a.competitionName ?? null,
          season: a.season ?? null,
          awardedAt: a.awardedAt,
          awardedBy: a.awardedBy,
        })
        .onConflictDoNothing({ target: awards.id });
    }
    for (const n of jsonState.notifications || []) {
      await tx
        .insert(notifications)
        .values({
          id: n.id,
          category: n.category,
          recipientDiscordId: n.recipientDiscordId,
          recipientName: n.recipientName,
          title: n.title,
          message: n.message,
          channelName: n.channelName ?? null,
          createdAt: n.createdAt,
          read: n.read,
        })
        .onConflictDoNothing({ target: notifications.id });
    }
    for (const a of jsonState.auditLogs || []) {
      await tx
        .insert(auditLogs)
        .values({
          id: a.id,
          action: a.action,
          actor: a.actor,
          target: a.target,
          timestamp: a.timestamp,
          previousValue: a.previousValue,
          newValue: a.newValue,
        })
        .onConflictDoNothing({ target: auditLogs.id });
    }

    if (jsonState.config) {
      await tx
        .insert(botConfig)
        .values({
          id: 1,
          channels: jsonState.config.channels,
          roles: jsonState.config.roles,
          transferWindow: jsonState.config.transferWindow,
          competitions: jsonState.config.competitions,
          notifications: jsonState.config.notifications,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: botConfig.id });
    }

    await tx
      .insert(systemCounters)
      .values({
        id: 1,
        schemaVersion: jsonState.schemaVersion ?? CURRENT_SCHEMA_VERSION,
        nextTlcSequence: jsonState.nextTlcSequence ?? 1,
        nextClubSequence: jsonState.nextClubSequence ?? 1,
        nextMatchSequence: jsonState.nextMatchSequence ?? 1,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: systemCounters.id });
  });
}
