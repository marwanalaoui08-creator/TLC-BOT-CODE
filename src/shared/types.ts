export type PlayerPosition =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LW'
  | 'RW'
  | 'ST';

export const PLAYER_POSITIONS: PlayerPosition[] = [
  'GK',
  'CB',
  'LB',
  'RB',
  'CDM',
  'CM',
  'CAM',
  'LW',
  'RW',
  'ST',
];

export type PositionCategory = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Attacker';

export function getPositionCategory(pos: PlayerPosition): PositionCategory {
  if (pos === 'GK') return 'Goalkeeper';
  if (pos === 'CB' || pos === 'LB' || pos === 'RB') return 'Defender';
  if (pos === 'CDM' || pos === 'CM' || pos === 'CAM') return 'Midfielder';
  return 'Attacker';
}

export type RegistrationType = 'Player' | 'Manager';

export type RegistrationStatus = 'Pending' | 'Approved' | 'Rejected';

export type PlayerStatus = 'Active' | 'Free Agent' | 'Suspended' | 'Retired' | 'Inactive' | 'Deleted';

export type TransferType =
  | 'Signing'
  | 'Demande Signing'
  | 'Permanent Transfer'
  | 'Loan'
  | 'Release'
  | 'Resignation'
  | 'Return from Loan';

export type TransferOfferStatus =
  | 'Pending Player'
  | 'Pending Staff'
  | 'Approved'
  | 'Rejected by Player'
  | 'Rejected by Staff'
  | 'Cancelled';

export type ContractStatus = 'Active' | 'Expiring' | 'Expired' | 'Terminated';

export type CompetitionType =
  | 'League'
  | 'Knockout Tournament'
  | 'Group Stage'
  | 'Group Stage + Knockout'
  | 'Friendly Matches';

export type FixtureStatus =
  | 'Scheduled'
  | 'Pending'
  | 'In Progress'
  | 'Completed'
  | 'Postponed'
  | 'Cancelled'
  | 'Forfeit';

export interface RegistrationRequest {
  id: string;
  discordUserId: string;
  discordUsername: string;
  playerName: string;
  robloxUsername: string;
  robloxAvatarUrl: string;
  registrationType: RegistrationType;
  position?: PlayerPosition;
  status: RegistrationStatus;
  rejectionReason?: string;
  allowResubmit: boolean;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  tlcId?: string;
}

export interface ProfileCorrectionRequest {
  id: string;
  tlcId: string;
  discordUserId: string;
  requestedFields: {
    playerName?: string;
    robloxUsername?: string;
    robloxAvatarUrl?: string;
    position?: PlayerPosition;
  };
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface CareerEntry {
  id: string;
  clubId?: string;
  clubName: string;
  role: 'Player' | 'Manager';
  transferType?: TransferType;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export interface AwardRecord {
  id: string;
  name: string;
  recipientType: 'Player' | 'Manager' | 'Club';
  recipientId: string; // tlcId or clubId
  recipientName: string;
  competitionId?: string;
  competitionName?: string;
  season?: string;
  awardedAt: string;
  awardedBy: string;
}

export interface AchievementRecord {
  id: string;
  code: string;
  title: string;
  description: string;
  unlockedAt: string;
}

export interface PlayerProfile {
  tlcId: string;
  discordUserId: string;
  discordUsername: string;
  playerName: string;
  robloxUsername: string;
  robloxAvatarUrl: string;
  position: PlayerPosition;
  currentClubId: string | null;
  loanedFromClubId?: string | null;
  registrationDate: string;
  status: PlayerStatus;
  matchesPlayed: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
  ratingSum: number;
  ratingCount: number;
  averageRating: number;
  manOfTheMatchAwards: number;
  trophies: number;
  achievements: AchievementRecord[];
  careerHistory: CareerEntry[];
  inServer: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  previousClubId?: string | null;
  previousStatus?: PlayerStatus;
}

export interface ManagerProfile {
  tlcId: string;
  discordUserId: string;
  discordUsername: string;
  managerName: string;
  robloxUsername: string;
  robloxAvatarUrl: string;
  currentClubId: string | null;
  registrationDate: string;
  status: PlayerStatus;
  matchesManaged: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  trophies: number;
  clubsManaged: string[];
  careerHistory: CareerEntry[];
  inServer: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  previousClubId?: string | null;
  previousStatus?: PlayerStatus;
}

export interface Club {
  clubId: string;
  name: string;
  shortCode: string;
  logoUrl: string;
  logoEmoji?: string;
  primaryColor: string;
  discordRoleId: string;
  ownerDiscordUserId?: string;
  ownerDiscordUsername?: string;
  status?: 'Active' | 'Deleted';
  currentManagerTlcId: string | null;
  registrationDate: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  trophies: number;
  currentCompetitionIds: string[];
  history: { id: string; date: string; summary: string }[];
}

export interface TeamMembership {
  id: string;
  discordUserId: string;
  discordUsername: string;
  playerTlcId?: string;
  playerName: string;
  clubId: string;
  clubName: string;
  roleId: string;
  joinDate: string;
  status: 'Active' | 'Released' | 'Transferred' | 'TeamDeleted';
}

export interface SigningRequest {
  id: string;
  playerDiscordUserId: string;
  playerDiscordUsername: string;
  playerTlcId?: string;
  playerName: string;
  robloxUsername?: string;
  position?: PlayerPosition;
  fromClubId: string | null;
  fromClubName: string;
  requestedClubId: string;
  requestedClubName: string;
  requestedClubLogoEmoji?: string;
  requestDate: string;
  status: 'Pending' | 'Approved' | 'Cancelled';
  rejectionReason?: string;
  approvedBy?: string;
  approvedByDiscordId?: string;
  approvalDate?: string;
}

export interface TransferRecord {
  id: string;
  playerTlcId: string;
  playerDiscordUserId?: string;
  playerName: string;
  fromClubId: string | null;
  fromClubName: string;
  toClubId: string | null;
  toClubName: string;
  transferType: TransferType;
  details: string;
  approvedBy: string;
  completedAt: string;
}

export interface TransferOffer {
  id: string;
  playerTlcId: string;
  playerName: string;
  fromClubId: string | null;
  fromClubName: string;
  toClubId: string;
  toClubName: string;
  managerTlcId: string;
  managerName: string;
  transferType: TransferType;
  details: string;
  status: TransferOfferStatus;
  rejectionReason?: string;
  createdAt: string;
  playerRespondedAt?: string;
  staffReviewedAt?: string;
  staffReviewedBy?: string;
}

export interface Contract {
  id: string;
  playerTlcId: string;
  playerName: string;
  clubId: string;
  clubName: string;
  startDate: string;
  expirationDate: string;
  status: ContractStatus;
  terms: string;
  notifiedExpiring: boolean;
}

export interface Competition {
  id: string;
  name: string;
  type: CompetitionType;
  season: string;
  participatingClubIds: string[];
  numberOfGroups: number;
  numberOfTeams: number;
  matchFormat: 'Single Leg' | 'Home & Away';
  rules: string;
  rosterLimit: number;
  registrationDeadline: string;
  startDate: string;
  endDate: string;
  status: 'Registration Open' | 'In Progress' | 'Completed';
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  tieBreaker: 'Goal Difference' | 'Head-to-Head' | 'Goals For';
  includeThirdPlace: boolean;
}

export interface CompetitionRegistration {
  id: string;
  competitionId: string;
  clubId: string;
  clubName: string;
  managerTlcId: string;
  rosterTlcIds: string[];
  status: 'Pending' | 'Approved' | 'Rejected';
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface PlayerMatchStat {
  playerTlcId: string;
  playerName: string;
  clubId: string;
  goals: number;
  assists: number;
  saves: number;
  cleanSheet: boolean;
  rating: number;
  manOfTheMatch: boolean;
}

export interface Fixture {
  id: string;
  matchNumber: number;
  competitionId: string;
  competitionName: string;
  roundLabel: string; // e.g. "Matchday 1", "Group A", "Quarter-Final", "Semi-Final", "Final"
  bracketSlot?: string;
  nextFixtureId?: string;
  nextSlotSide?: 'home' | 'away';
  homeClubId: string | null;
  awayClubId: string | null;
  matchDate: string;
  matchTime: string;
  status: FixtureStatus;
  referee?: string;
  homeScore?: number;
  awayScore?: number;
  notes?: string;
  resultStatus?: 'None' | 'Pending Approval' | 'Approved' | 'Cancelled';
  resultRejectionReason?: string;
  resultSubmittedBy?: string;
  resultSubmittedByDiscordId?: string;
  resultApprovedBy?: string;
  playerStats?: PlayerMatchStat[];
}

export interface StandingRow {
  position: number;
  clubId: string;
  clubName: string;
  clubLogoUrl: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface NotificationEntry {
  id: string;
  category:
    | 'Registration Approval'
    | 'Registration Rejection'
    | 'Transfer Offer'
    | 'Transfer Acceptance'
    | 'Transfer Rejection'
    | 'Official Transfer'
    | 'Contract Expiration'
    | 'Fixture Creation'
    | 'Fixture Change'
    | 'Match Result'
    | 'Competition Registration'
    | 'Award'
    | 'Profile Update'
    | 'Disciplinary Sanction'
    | 'Disciplinary Appeal'
    | 'Suspension Completed'
    | 'Ticket Update'
    | 'Coach Registration'
    | 'Staff Application'
    | 'Complaint Update';
  recipientDiscordId: string;
  recipientName: string;
  title: string;
  message: string;
  channelName?: string;
  createdAt: string;
  read: boolean;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  previousValue: string;
  newValue: string;
}

export type TicketCategoryKey =
  | 'player_complaint'
  | 'staff_application'
  | 'register'
  | 'create_team'
  | 'general_inquiry'
  | 'player_report'
  | 'team_support'
  | 'transfer_assistance'
  | 'other';

export type TicketQuestionType = 'short' | 'paragraph' | 'url' | 'attachment' | 'select';

export interface TicketQuestionConfig {
  id: string;
  label: string;
  placeholder?: string;
  type: TicketQuestionType;
  required: boolean;
  options?: string[];
}

export interface TicketCategoryConfig {
  key: TicketCategoryKey;
  label: string;
  emoji: string;
  description: string;
  enabled: boolean;
  order: number;
  requireEvidence?: boolean;
  questions: TicketQuestionConfig[];
}

export interface TicketSystemConfig {
  namingPattern: string;
  maxOpenTicketsPerUserPerCategory: number;
  inactivityReminderHours: number;
  escalationHours: number;
  panelTitle: string;
  panelDescription: string;
  categories: TicketCategoryConfig[];
}

export interface BotConfig {
  channels: {
    verifyYourselfId: string;
    registrationRequestsId: string;
    transferMarketId: string;
    signingRequestsId?: string;
    teamManagementId?: string;
    fixturesId: string;
    resultsId: string;
    auditLogsId: string;
    announcementsId: string;
    sanctionsAnnouncementId?: string;
    sanctionsLogId?: string;
    ticketPanelId?: string;
    ticketCategoryId?: string;
    registrationCategoryId?: string;
    ticketLogId?: string;
    applicationLogId?: string;
    complaintLogId?: string;
    escalationChannelId?: string;
  };
  roles: {
    verifiedRoleId: string;
    unverifiedRoleId: string;
    playerRoleId: string;
    managerRoleId: string;
    coachRoleId?: string;
    goalkeeperRoleId: string;
    defenderRoleId: string;
    midfielderRoleId: string;
    attackerRoleId: string;
    staffRoleIds: string[];
    disciplinaryRoleIds?: string[];
    supportRoleIds?: string[];
    playerRegStaffRoleIds?: string[];
    coachRegStaffRoleIds?: string[];
    staffAppRoleIds?: string[];
    complaintStaffRoleIds?: string[];
    teamRegStaffRoleIds?: string[];
    seniorAdminRoleIds?: string[];
  };
  transferWindow: {
    isOpen: boolean;
    deadline: string;
    allowFreeAgentExceptions: boolean;
    requireStaffApproval: boolean;
    allowMultipleTeamRoles?: boolean;
  };
  competitions: {
    requireResultApproval: boolean;
    defaultRosterLimit: number;
    contractWarningDays: number;
  };
  notifications: {
    publishRegistrationAnnouncements: boolean;
    sendDirectMessages: boolean;
    announceTransfers: boolean;
    announceResults: boolean;
    notifyFixtureChanges: boolean;
    notifyContractExpiring: boolean;
  };
  sanctions?: {
    defaultCurrency: string;
  };
  tickets?: TicketSystemConfig;
}

export interface ClubRegistrationRequest {
  id: string;
  name: string;
  shortCode: string;
  logoUrl: string;
  primaryColor: string;
  requestedByDiscordId: string;
  requestedByUsername: string;
  managerTlcId: string | null;
  status: 'Pending' | 'Approved' | 'Cancelled';
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  clubId?: string;
}

export interface RejectedRequestItem {
  id: string;
  category:
    | 'Registration'
    | 'Signing Request'
    | 'Transfer Offer'
    | 'Club Registration'
    | 'Competition Entry'
    | 'Profile Correction'
    | 'Match Result';
  title: string;
  requesterName: string;
  requesterDiscordId?: string;
  reason: string;
  rejectedBy: string;
  rejectedAt: string;
}

export type SanctionType =
  | 'Official Warning'
  | 'Financial Fine'
  | 'Match Suspension'
  | 'Fine + Match Suspension'
  | 'Disciplinary Ban'
  | 'Other';

export const SANCTION_TYPES: SanctionType[] = [
  'Official Warning',
  'Financial Fine',
  'Match Suspension',
  'Fine + Match Suspension',
  'Disciplinary Ban',
  'Other',
];

export type SanctionStatus = 'Active' | 'Completed' | 'Removed';

export type FinePaymentStatus = 'UNPAID' | 'PARTIALLY PAID' | 'PAID' | 'WAIVED';

export type SanctionAppealStatus = 'Pending' | 'Accepted' | 'Rejected';

export interface SanctionFinePaymentEntry {
  id: string;
  type: 'Payment' | 'Waiver' | 'Adjustment';
  amount: number;
  note: string;
  recordedBy: string;
  recordedAt: string;
}

export interface SanctionRecord {
  id: string;
  referenceNumber: string;
  playerTlcId: string | null;
  playerDiscordUserId: string;
  playerDiscordUsername: string;
  playerName: string;
  playerAvatarUrl: string;
  clubId: string | null;
  clubName: string;
  sanctionType: SanctionType;
  reason: string;
  fineAmount: number;
  finePaidAmount: number;
  fineCurrency: string;
  fineStatus: FinePaymentStatus;
  fineWaiverReason?: string;
  fineHistory: SanctionFinePaymentEntry[];
  suspensionMatchesTotal: number;
  suspensionMatchesRemaining: number;
  servedMatchIds: string[];
  status: SanctionStatus;
  issuedByDiscordId: string;
  issuedByUsername: string;
  issuedAt: string;
  updatedAt?: string;
  updatedBy?: string;
  removedAt?: string;
  removedBy?: string;
  removalReason?: string;
  announcementChannelId?: string;
  announcementMessageId?: string;
}

export interface SanctionAppeal {
  id: string;
  sanctionId: string;
  sanctionReference: string;
  playerTlcId: string | null;
  playerDiscordUserId: string;
  playerDiscordUsername: string;
  playerName: string;
  explanation: string;
  status: SanctionAppealStatus;
  rejectionReason?: string;
  resolutionNote?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface CoachProfile {
  tlcId: string;
  discordUserId: string;
  discordUsername: string;
  coachName: string;
  coachingExperience: string;
  previousTeams?: string;
  avatarUrl: string;
  additionalInfo?: string;
  currentClubId: string | null;
  registrationDate: string;
  status: PlayerStatus;
  matchesCoached: number;
  wins: number;
  draws: number;
  losses: number;
  trophies: number;
  careerHistory: CareerEntry[];
  inServer: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
}

export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type TicketStatus =
  | 'Open'
  | 'Claimed'
  | 'Under Review'
  | 'Waiting Info'
  | 'Approved'
  | 'Rejected'
  | 'Resolved'
  | 'Dismissed'
  | 'Closed';

export type ComplaintCategory =
  | 'Player Complaint'
  | 'Team President Complaint'
  | 'Staff Member Complaint'
  | 'Referee Complaint'
  | 'Team Complaint'
  | 'Cheating or Unfair Play'
  | 'Harassment or Inappropriate Behaviour'
  | 'Financial Dispute'
  | 'Other';

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'Player Complaint',
  'Team President Complaint',
  'Staff Member Complaint',
  'Referee Complaint',
  'Team Complaint',
  'Cheating or Unfair Play',
  'Harassment or Inappropriate Behaviour',
  'Financial Dispute',
  'Other',
];

export type StaffDepartment =
  | 'Administration'
  | 'Moderation'
  | 'Refereeing'
  | 'Media'
  | 'Development'
  | 'Recruitment'
  | 'Other';

export const STAFF_DEPARTMENTS: StaffDepartment[] = [
  'Administration',
  'Moderation',
  'Refereeing',
  'Media',
  'Development',
  'Recruitment',
  'Other',
];

export interface TicketAnswerEntry {
  questionId: string;
  label: string;
  answer: string;
}

export interface TicketEvidenceItem {
  id: string;
  kind: 'media' | 'url';
  mediaAssetId?: string;
  url?: string;
  filename?: string;
  mimeType?: string;
  uploadedByDiscordId: string;
  uploadedByUsername: string;
  uploadedAt: string;
}

export interface TicketNote {
  id: string;
  authorDiscordId: string;
  authorUsername: string;
  content: string;
  createdAt: string;
}

export interface TicketTranscriptEntry {
  id: string;
  authorDiscordId: string;
  authorUsername: string;
  isStaff: boolean;
  isBot?: boolean;
  content: string;
  attachments: { filename: string; url: string; mediaAssetId?: string }[];
  timestamp: string;
}

export interface UnifiedTicket {
  id: string;
  ticketNumber: string;
  complaintId?: string;
  categoryKey: TicketCategoryKey;
  applicationSubType?: 'Player' | 'Coach' | 'Staff' | 'Team' | null;
  guildId: string;
  channelId: string;
  channelName: string;
  panelMessageId?: string;
  creatorDiscordId: string;
  creatorUsername: string;
  creatorAvatarUrl?: string;
  isAnonymous: boolean;
  complaintCategory?: ComplaintCategory;
  staffDepartment?: StaffDepartment;
  targetDiscordId?: string;
  targetUsername?: string;
  targetDisplayName?: string;
  priority: TicketPriority;
  status: TicketStatus;
  claimedByDiscordId?: string;
  claimedByUsername?: string;
  participantDiscordIds: string[];
  answers: TicketAnswerEntry[];
  metadata: Record<string, string>;
  evidence: TicketEvidenceItem[];
  staffNotes: TicketNote[];
  transcript: TicketTranscriptEntry[];
  decision?: 'Approved' | 'Rejected' | 'Accepted' | 'Resolved' | 'Dismissed';
  decisionReason?: string;
  decidedByDiscordId?: string;
  decidedByUsername?: string;
  decidedAt?: string;
  createdProfileTlcId?: string;
  createdClubId?: string;
  feedbackRating?: number;
  feedbackComment?: string;
  lastActivityAt: string;
  lastStaffReplyAt?: string;
  lastReminderAt?: string;
  escalatedAt?: string;
  createdAt: string;
  closedAt?: string;
  closedByDiscordId?: string;
  closedByUsername?: string;
  channelDeletedAt?: string;
}

export interface TicketStatistics {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  pendingReviewTickets: number;
  averageResolutionMinutes: number;
  mostActiveStaff: { username: string; discordId: string; actionsCount: number }[];
  ticketsPerCategory: { categoryKey: TicketCategoryKey; count: number }[];
  totalPlayerApplications: number;
  totalCoachApplications: number;
  totalStaffApplications: number;
  totalTeamApplications: number;
  approvedApplications: number;
  rejectedApplications: number;
  totalComplaints: number;
  resolvedComplaints: number;
  pendingComplaints: number;
}

export interface TlcDatabaseState {
  schemaVersion?: number;
  nextTlcSequence: number;
  nextClubSequence: number;
  nextMatchSequence: number;
  nextSanctionSequence?: number;
  nextTicketSequence?: number;
  nextComplaintSequence?: number;
  registrations: RegistrationRequest[];
  correctionRequests: ProfileCorrectionRequest[];
  clubRegistrationRequests?: ClubRegistrationRequest[];
  teamMemberships?: TeamMembership[];
  signingRequests?: SigningRequest[];
  players: PlayerProfile[];
  managers: ManagerProfile[];
  coaches?: CoachProfile[];
  clubs: Club[];
  transfers: TransferRecord[];
  transferOffers: TransferOffer[];
  contracts: Contract[];
  competitions: Competition[];
  competitionRegistrations: CompetitionRegistration[];
  fixtures: Fixture[];
  awards: AwardRecord[];
  sanctions?: SanctionRecord[];
  sanctionAppeals?: SanctionAppeal[];
  tickets?: UnifiedTicket[];
  notifications: NotificationEntry[];
  auditLogs: AuditLogEntry[];
  config: BotConfig;
}


