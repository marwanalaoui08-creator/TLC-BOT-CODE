import crypto from 'crypto';
import {
  AchievementRecord,
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
  FinePaymentStatus,
  Fixture,
  ManagerProfile,
  NotificationEntry,
  PlayerMatchStat,
  PlayerPosition,
  PlayerProfile,
  ProfileCorrectionRequest,
  RegistrationRequest,
  RejectedRequestItem,
  SanctionAppeal,
  SanctionRecord,
  SanctionType,
  SigningRequest,
  StaffDepartment,
  StandingRow,
  TicketAnswerEntry,
  TicketCategoryConfig,
  TicketCategoryKey,
  TicketEvidenceItem,
  TicketPriority,
  TicketQuestionConfig,
  TicketStatistics,
  TicketStatus,
  TicketSystemConfig,
  TicketTranscriptEntry,
  TlcDatabaseState,
  TransferOffer,
  TransferRecord,
  TransferType,
  UnifiedTicket,
} from '../src/shared/types.ts';
import { getDatabaseHealth, getDb, initDatabase } from './db/client.ts';
import {
  createDefaultEmptyState,
  createDefaultTicketSystemConfig,
  loadStateFromPostgres,
  persistStateDiffInTransaction,
} from './db/sync.ts';

export interface CompletedSuspensionAlert {
  discordUserId: string;
  playerName: string;
  referenceNumber: string;
  restoredStatus: string;
  fixtureMatchNumber: number;
}

class TlcStore {
  private state: TlcDatabaseState = createDefaultEmptyState();
  private initialized = false;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private recentSanctionDedupes = new Map<string, number>();
  private completedSuspensionAlerts: CompletedSuspensionAlert[] = [];

  public async init(): Promise<void> {
    const res = await initDatabase();
    if (!res.ok) {
      this.initialized = false;
      console.warn(`[TLC Store] PostgreSQL not ready: ${res.error}`);
      return;
    }

    const db = getDb();
    this.state = await loadStateFromPostgres(db);
    this.initialized = true;
    console.log(
      `[TLC Store] Loaded ${this.state.players.length} players, ${this.state.managers.length} managers, ${this.state.clubs.length} clubs from PostgreSQL.`
    );
  }

  public getDbStatus() {
    return {
      ...getDatabaseHealth(),
      initialized: this.initialized,
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.initialized && getDatabaseHealth().connected) return;
    await this.init();
    if (!this.initialized || !getDatabaseHealth().connected) {
      throw new Error(
        getDatabaseHealth().lastError ||
          'PostgreSQL database is not connected. Set DATABASE_URL in Secrets.'
      );
    }
  }

  private commitMutation<T>(mutator: (draft: TlcDatabaseState) => T): Promise<T> {
    const run = async (): Promise<T> => {
      await this.ensureConnected();
      const db = getDb();
      const prev = this.state;
      const draft = structuredClone(prev);
      const result = mutator(draft);
      await persistStateDiffInTransaction(db, prev, draft);
      this.state = draft;
      return result;
    };

    const nextTask = this.writeQueue.then(run, run);
    this.writeQueue = nextTask.catch(() => {});
    return nextTask;
  }

  private addAudit(
    state: TlcDatabaseState,
    action: string,
    actor: string,
    target: string,
    previousValue: string,
    newValue: string
  ) {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      action,
      actor,
      target,
      timestamp: new Date().toISOString(),
      previousValue,
      newValue,
    };
    state.auditLogs.unshift(entry);
    if (state.auditLogs.length > 500) {
      state.auditLogs.length = 500;
    }
    return entry;
  }

  private addNotification(
    state: TlcDatabaseState,
    category: NotificationEntry['category'],
    recipientDiscordId: string,
    recipientName: string,
    title: string,
    message: string,
    channelName?: string
  ) {
    const entry: NotificationEntry = {
      id: crypto.randomUUID(),
      category,
      recipientDiscordId,
      recipientName,
      title,
      message,
      channelName,
      createdAt: new Date().toISOString(),
      read: false,
    };
    state.notifications.unshift(entry);
    if (state.notifications.length > 300) {
      state.notifications.length = 300;
    }
    return entry;
  }

  private generateTlcId(state: TlcDatabaseState): string {
    const num = state.nextTlcSequence;
    state.nextTlcSequence += 1;
    return `TLC-${String(num).padStart(5, '0')}`;
  }

  private generateClubId(state: TlcDatabaseState): string {
    const num = state.nextClubSequence;
    state.nextClubSequence += 1;
    return `CLB-${String(num).padStart(3, '0')}`;
  }

  private generateMatchNumber(state: TlcDatabaseState): number {
    const num = state.nextMatchSequence;
    state.nextMatchSequence += 1;
    return num;
  }

  private generateSanctionRef(state: TlcDatabaseState): string {
    const num = state.nextSanctionSequence ?? 1;
    state.nextSanctionSequence = num + 1;
    return `TLC-SNC-${String(num).padStart(4, '0')}`;
  }

  private generateTicketSeq(state: TlcDatabaseState): { num: number; ref: string } {
    const num = state.nextTicketSequence ?? 1;
    state.nextTicketSequence = num + 1;
    return { num, ref: `TLC-TKT-${String(num).padStart(4, '0')}` };
  }

  private generateComplaintRef(state: TlcDatabaseState): string {
    const num = state.nextComplaintSequence ?? 1;
    state.nextComplaintSequence = num + 1;
    return `TLC-CMP-${String(num).padStart(4, '0')}`;
  }

  public consumeCompletedSuspensionAlerts(): CompletedSuspensionAlert[] {
    const alerts = [...this.completedSuspensionAlerts];
    this.completedSuspensionAlerts = [];
    return alerts;
  }

  public getState(): TlcDatabaseState {
    return this.state;
  }

  public getPublicSummary() {
    return {
      ...this.state,
      standingsByCompetition: Object.fromEntries(
        this.state.competitions.map((comp) => [comp.id, this.computeStandings(comp.id)])
      ),
    };
  }

  // ==================== REGISTRATION & VERIFICATION ====================

  public submitRegistration(input: {
    discordUserId: string;
    discordUsername: string;
    playerName: string;
    robloxUsername: string;
    robloxAvatarUrl?: string;
    registrationType: 'Player' | 'Manager';
    position?: PlayerPosition;
  }): Promise<RegistrationRequest> {
    return this.commitMutation((state) => {
      const discordId = input.discordUserId.trim();
      const existingPlayer = state.players.find((p) => p.discordUserId === discordId);
      const existingManager = state.managers.find((m) => m.discordUserId === discordId);
      if (existingPlayer || existingManager) {
        throw new Error(
          'This Discord account already holds an approved TLC profile. Duplicate registrations are prohibited.'
        );
      }

      const pending = state.registrations.find(
        (r) => r.discordUserId === discordId && r.status === 'Pending'
      );
      if (pending) {
        throw new Error(
          'A registration request for this Discord account is already pending staff review.'
        );
      }

      const previousRejected = state.registrations.find(
        (r) => r.discordUserId === discordId && r.status === 'Rejected' && !r.allowResubmit
      );
      if (previousRejected) {
        throw new Error(
          'Re-submission is disabled for your previous rejected registration. Contact TLC staff.'
        );
      }

      if (input.registrationType === 'Player' && !input.position) {
        throw new Error('Players must select a primary position.');
      }

      const request: RegistrationRequest = {
        id: `reg-${crypto.randomUUID().slice(0, 8)}`,
        discordUserId: discordId,
        discordUsername: input.discordUsername.trim(),
        playerName: input.playerName.trim(),
        robloxUsername: input.robloxUsername.trim(),
        robloxAvatarUrl:
          input.robloxAvatarUrl?.trim() || '/src/assets/images/tlc_league_crest_1795467599044.jpg',
        registrationType: input.registrationType,
        position: input.registrationType === 'Player' ? input.position : undefined,
        status: 'Pending',
        allowResubmit: true,
        submittedAt: new Date().toISOString(),
      };

      state.registrations.unshift(request);
      this.addAudit(
        state,
        'Registration Submitted',
        request.discordUsername,
        `${request.playerName} (${request.registrationType})`,
        'Unregistered',
        'Pending Staff Review'
      );
      return request;
    });
  }

  public editRegistration(
    requestId: string,
    patch: {
      playerName?: string;
      robloxUsername?: string;
      robloxAvatarUrl?: string;
      registrationType?: 'Player' | 'Manager';
      position?: PlayerPosition;
    },
    actor: string
  ): Promise<RegistrationRequest> {
    return this.commitMutation((state) => {
      const req = state.registrations.find((r) => r.id === requestId);
      if (!req) throw new Error('Registration request not found.');
      if (req.status !== 'Pending') throw new Error('Only pending registrations can be edited.');

      const prev = `${req.playerName} (${req.registrationType}${req.position ? ` · ${req.position}` : ''})`;
      if (patch.playerName) req.playerName = patch.playerName.trim();
      if (patch.robloxUsername) req.robloxUsername = patch.robloxUsername.trim();
      if (patch.robloxAvatarUrl) req.robloxAvatarUrl = patch.robloxAvatarUrl.trim();
      if (patch.registrationType) {
        req.registrationType = patch.registrationType;
        if (patch.registrationType === 'Manager') {
          req.position = undefined;
        }
      }
      if (req.registrationType === 'Player' && patch.position) {
        req.position = patch.position;
      }

      const next = `${req.playerName} (${req.registrationType}${req.position ? ` · ${req.position}` : ''})`;
      this.addAudit(state, 'Registration Edited', actor, req.discordUsername, prev, next);
      return req;
    });
  }

  public approveRegistration(
    requestId: string,
    actor: string
  ): Promise<{ request: RegistrationRequest; profile: PlayerProfile | ManagerProfile }> {
    return this.commitMutation((state) => {
      const req = state.registrations.find((r) => r.id === requestId);
      if (!req) throw new Error('Registration request not found.');
      if (req.status !== 'Pending') throw new Error('This registration has already been processed.');

      const existingPlayer = state.players.find((p) => p.discordUserId === req.discordUserId);
      const existingManager = state.managers.find((m) => m.discordUserId === req.discordUserId);
      if (existingPlayer || existingManager) {
        throw new Error('Discord user already has an official TLC profile.');
      }

      const tlcId = this.generateTlcId(state);
      const now = new Date().toISOString();
      req.status = 'Approved';
      req.reviewedAt = now;
      req.reviewedBy = actor;
      req.tlcId = tlcId;

      let profile: PlayerProfile | ManagerProfile;
      if (req.registrationType === 'Player') {
        const pos: PlayerPosition = req.position || 'CM';
        const player: PlayerProfile = {
          tlcId,
          discordUserId: req.discordUserId,
          discordUsername: req.discordUsername,
          playerName: req.playerName,
          robloxUsername: req.robloxUsername,
          robloxAvatarUrl: req.robloxAvatarUrl,
          position: pos,
          currentClubId: null,
          registrationDate: now,
          status: 'Free Agent',
          matchesPlayed: 0,
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          saves: 0,
          ratingSum: 0,
          ratingCount: 0,
          averageRating: 0,
          manOfTheMatchAwards: 0,
          trophies: 0,
          achievements: [],
          careerHistory: [],
          inServer: true,
        };
        state.players.unshift(player);
        profile = player;
      } else {
        const manager: ManagerProfile = {
          tlcId,
          discordUserId: req.discordUserId,
          discordUsername: req.discordUsername,
          managerName: req.playerName,
          robloxUsername: req.robloxUsername,
          robloxAvatarUrl: req.robloxAvatarUrl,
          currentClubId: null,
          registrationDate: now,
          status: 'Free Agent',
          matchesManaged: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          winRate: 0,
          trophies: 0,
          clubsManaged: [],
          careerHistory: [],
          inServer: true,
        };
        state.managers.unshift(manager);
        profile = manager;
      }

      this.addAudit(
        state,
        'Registration Approved',
        actor,
        `${req.playerName} (${tlcId})`,
        'Pending',
        `Approved ${req.registrationType} · Free Agent · Nickname: ${req.playerName}`
      );

      if (state.config.notifications.sendDirectMessages) {
        this.addNotification(
          state,
          'Registration Approval',
          req.discordUserId,
          req.playerName,
          'TLC Verification Approved',
          `Welcome to Touchline! Your permanent ID is ${tlcId}. Status: Free Agent.`,
          'DM'
        );
      }

      if (state.config.notifications.publishRegistrationAnnouncements) {
        this.addNotification(
          state,
          'Registration Approval',
          'server-announcement',
          req.playerName,
          'New Verified Member',
          `${req.playerName} (${tlcId}) has been verified as a TLC ${req.registrationType}.`,
          '#announcements'
        );
      }

      return { request: req, profile };
    });
  }

  public rejectRegistration(
    requestId: string,
    reason: string,
    allowResubmit: boolean,
    actor: string
  ): Promise<RegistrationRequest> {
    return this.commitMutation((state) => {
      const req = state.registrations.find((r) => r.id === requestId);
      if (!req) throw new Error('Registration request not found.');
      if (req.status !== 'Pending') throw new Error('This registration has already been processed.');
      const cleanReason = reason.trim();
      if (!cleanReason) throw new Error('A mandatory rejection reason must be provided.');

      req.status = 'Rejected';
      req.rejectionReason = cleanReason;
      req.allowResubmit = allowResubmit;
      req.reviewedAt = new Date().toISOString();
      req.reviewedBy = actor;

      this.addAudit(
        state,
        'Registration Rejected',
        actor,
        `${req.playerName} (${req.discordUsername})`,
        'Pending',
        `Rejected: ${req.rejectionReason} (Resubmit: ${allowResubmit ? 'Allowed' : 'Blocked'})`
      );

      this.addNotification(
        state,
        'Registration Rejection',
        req.discordUserId,
        req.playerName,
        'TLC Request Rejected',
        `❌ Your request has been rejected.\n\nReason: ${req.rejectionReason}`,
        'DM'
      );

      return req;
    });
  }

  public submitProfileCorrection(input: {
    tlcId: string;
    discordUserId: string;
    playerName?: string;
    robloxUsername?: string;
    robloxAvatarUrl?: string;
    position?: PlayerPosition;
    reason: string;
  }): Promise<ProfileCorrectionRequest> {
    return this.commitMutation((state) => {
      const correction: ProfileCorrectionRequest = {
        id: `cor-${crypto.randomUUID().slice(0, 8)}`,
        tlcId: input.tlcId,
        discordUserId: input.discordUserId,
        requestedFields: {
          playerName: input.playerName?.trim() || undefined,
          robloxUsername: input.robloxUsername?.trim() || undefined,
          robloxAvatarUrl: input.robloxAvatarUrl?.trim() || undefined,
          position: input.position,
        },
        reason: input.reason.trim(),
        status: 'Pending',
        submittedAt: new Date().toISOString(),
      };
      state.correctionRequests.unshift(correction);
      this.addAudit(
        state,
        'Profile Correction Requested',
        input.tlcId,
        input.tlcId,
        'Current Profile',
        input.reason.trim()
      );
      return correction;
    });
  }

  public reviewCorrectionRequest(
    id: string,
    decision: 'approve' | 'reject',
    actor: string,
    reason?: string
  ): Promise<ProfileCorrectionRequest> {
    return this.commitMutation((state) => {
      const corr = state.correctionRequests.find((c) => c.id === id);
      if (!corr) throw new Error('Correction request not found.');
      if (corr.status !== 'Pending') throw new Error('Correction request already reviewed.');

      if (decision === 'reject') {
        const cleanReason = reason?.trim() || '';
        if (!cleanReason) throw new Error('A mandatory rejection reason must be provided.');
        corr.rejectionReason = cleanReason;
      }

      corr.status = decision === 'approve' ? 'Approved' : 'Rejected';
      corr.reviewedAt = new Date().toISOString();
      corr.reviewedBy = actor;

      if (decision === 'approve') {
        const player = state.players.find((p) => p.tlcId === corr.tlcId);
        const manager = state.managers.find((m) => m.tlcId === corr.tlcId);
        if (player) {
          this.editPlayerInternal(
            state,
            player.tlcId,
            {
              playerName: corr.requestedFields.playerName,
              robloxUsername: corr.requestedFields.robloxUsername,
              robloxAvatarUrl: corr.requestedFields.robloxAvatarUrl,
              position: corr.requestedFields.position,
            },
            actor
          );
        } else if (manager) {
          this.editManagerInternal(
            state,
            manager.tlcId,
            {
              managerName: corr.requestedFields.playerName,
              robloxUsername: corr.requestedFields.robloxUsername,
              robloxAvatarUrl: corr.requestedFields.robloxAvatarUrl,
            },
            actor
          );
        }
      } else {
        this.addAudit(
          state,
          'Profile Correction Rejected',
          actor,
          corr.tlcId,
          'Pending',
          `Rejected: ${corr.rejectionReason}`
        );
        this.addNotification(
          state,
          'Profile Update',
          corr.discordUserId,
          corr.tlcId,
          'Profile Correction Rejected',
          `❌ Your request has been rejected.\n\nReason: ${corr.rejectionReason}`,
          'DM'
        );
      }
      return corr;
    });
  }

  public handleMemberLeave(discordUserId: string): Promise<PlayerProfile | ManagerProfile | null> {
    return this.commitMutation((state) => {
      const player = state.players.find((p) => p.discordUserId === discordUserId);
      if (player) {
        player.inServer = false;
        if (player.status !== 'Deleted') {
          const prev = player.status;
          player.status = 'Inactive';
          this.addAudit(
            state,
            'Member Left Server',
            'Discord Gateway',
            `${player.playerName} (${player.tlcId})`,
            prev,
            'Inactive (History Preserved)'
          );
        }
        return player;
      }
      const manager = state.managers.find((m) => m.discordUserId === discordUserId);
      if (manager) {
        manager.inServer = false;
        if (manager.status !== 'Deleted') {
          const prev = manager.status;
          manager.status = 'Inactive';
          this.addAudit(
            state,
            'Member Left Server',
            'Discord Gateway',
            `${manager.managerName} (${manager.tlcId})`,
            prev,
            'Inactive (History Preserved)'
          );
        }
        return manager;
      }
      return null;
    });
  }

  public handleMemberRejoin(discordUserId: string): Promise<PlayerProfile | ManagerProfile | null> {
    return this.commitMutation((state) => {
      const player = state.players.find((p) => p.discordUserId === discordUserId);
      if (player) {
        player.inServer = true;
        if (player.status !== 'Deleted') {
          player.status = player.currentClubId ? 'Active' : 'Free Agent';
          this.addAudit(
            state,
            'Member Rejoined Server',
            'Discord Gateway',
            `${player.playerName} (${player.tlcId})`,
            'Inactive',
            player.status
          );
        }
        return player;
      }
      const manager = state.managers.find((m) => m.discordUserId === discordUserId);
      if (manager) {
        manager.inServer = true;
        if (manager.status !== 'Deleted') {
          manager.status = manager.currentClubId ? 'Active' : 'Free Agent';
          this.addAudit(
            state,
            'Member Rejoined Server',
            'Discord Gateway',
            `${manager.managerName} (${manager.tlcId})`,
            'Inactive',
            manager.status
          );
        }
        return manager;
      }
      return null;
    });
  }

  // ==================== PROFILES ====================

  public getActivePlayers(): PlayerProfile[] {
    return this.state.players.filter((p) => p.status !== 'Deleted');
  }

  public getDeletedPlayers(): PlayerProfile[] {
    return this.state.players.filter((p) => p.status === 'Deleted');
  }

  private deletePlayerProfileInternal(
    state: TlcDatabaseState,
    tlcId: string,
    actor: string,
    reason?: string
  ): { player: PlayerProfile; previousClubId: string | null } {
    const player = state.players.find((p) => p.tlcId === tlcId);
    if (!player) throw new Error('Player profile not found.');
    if (player.status === 'Deleted') throw new Error('This player profile is already deleted.');

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const prevClubId = player.currentClubId;
    const prevStatus = player.status;

    player.previousClubId = prevClubId;
    player.previousStatus = prevStatus;
    player.status = 'Deleted';
    player.deletedAt = now;
    player.deletedBy = actor;
    player.deletionReason = reason?.trim() || 'Removed from active players by administrator';
    player.currentClubId = null;
    player.loanedFromClubId = null;

    const openCareer = player.careerHistory.find((h) => !h.endDate);
    if (openCareer) openCareer.endDate = today;

    for (const mem of state.teamMemberships ?? []) {
      if (mem.discordUserId === player.discordUserId && mem.status === 'Active') {
        mem.status = 'Released';
      }
    }

    for (const req of state.signingRequests ?? []) {
      if (req.playerDiscordUserId === player.discordUserId && req.status === 'Pending') {
        req.status = 'Cancelled';
        req.rejectionReason = 'Player profile removed by administrator.';
        req.approvedBy = actor;
        req.approvalDate = now;
      }
    }

    for (const offer of state.transferOffers) {
      if (
        offer.playerTlcId === player.tlcId &&
        (offer.status === 'Pending Player' || offer.status === 'Pending Staff')
      ) {
        offer.status = 'Cancelled';
        offer.rejectionReason = 'Player profile removed by administrator.';
        offer.staffReviewedBy = actor;
        offer.staffReviewedAt = now;
      }
    }

    for (const contract of state.contracts) {
      if (
        contract.playerTlcId === player.tlcId &&
        (contract.status === 'Active' || contract.status === 'Expiring')
      ) {
        contract.status = 'Terminated';
      }
    }

    if (prevClubId) {
      const prevClub = state.clubs.find((c) => c.clubId === prevClubId);
      if (prevClub) {
        prevClub.history.unshift({
          id: `ch-${crypto.randomUUID().slice(0, 6)}`,
          date: today,
          summary: `${player.playerName} (${player.tlcId}) removed from active roster (Profile Deleted by ${actor}).`,
        });
      }
    }

    this.addAudit(
      state,
      'Player Profile Deleted',
      actor,
      `${player.playerName} (${player.tlcId})`,
      `${prevStatus}${prevClubId ? ` (${prevClubId})` : ''}`,
      'Deleted (Historical Data Preserved)'
    );

    this.addNotification(
      state,
      'Profile Update',
      player.discordUserId,
      player.playerName,
      'TLC Player Profile Deleted',
      `Your official TLC player profile (${player.tlcId}) was deactivated by ${actor}. All historical statistics, awards, and match records remain preserved.`,
      'DM'
    );

    return { player, previousClubId: prevClubId };
  }

  public deletePlayerProfile(
    tlcId: string,
    actor: string,
    reason?: string
  ): Promise<{ player: PlayerProfile; previousClubId: string | null }> {
    return this.commitMutation((state) =>
      this.deletePlayerProfileInternal(state, tlcId, actor, reason)
    );
  }

  public restorePlayerProfile(
    tlcId: string,
    actor: string
  ): Promise<{ player: PlayerProfile; restoredClub: Club | null }> {
    return this.commitMutation((state) => {
      const player = state.players.find((p) => p.tlcId === tlcId);
      if (!player) throw new Error('Player profile not found.');
      if (player.status !== 'Deleted') throw new Error('This player profile is already active.');

      const now = new Date().toISOString();
      const today = now.slice(0, 10);

      const prevClub = player.previousClubId
        ? state.clubs.find((c) => c.status !== 'Deleted' && c.clubId === player.previousClubId) ||
          null
        : null;

      const alreadyHasOtherTeam = (state.teamMemberships ?? []).some(
        (m) =>
          m.discordUserId === player.discordUserId &&
          m.status === 'Active' &&
          m.clubId !== prevClub?.clubId
      );

      const restoredClub = prevClub && !alreadyHasOtherTeam ? prevClub : null;
      player.currentClubId = restoredClub ? restoredClub.clubId : null;
      player.status = 'Active';
      delete player.deletedAt;
      delete player.deletedBy;
      delete player.deletionReason;
      delete player.previousClubId;
      delete player.previousStatus;

      if (restoredClub) {
        const memberships = (state.teamMemberships ??= []);
        const hasMem = memberships.some(
          (m) =>
            m.discordUserId === player.discordUserId &&
            m.clubId === restoredClub.clubId &&
            m.status === 'Active'
        );
        if (!hasMem) {
          memberships.unshift({
            id: `mem-${crypto.randomUUID().slice(0, 8)}`,
            discordUserId: player.discordUserId,
            discordUsername: player.discordUsername,
            playerTlcId: player.tlcId,
            playerName: player.playerName,
            clubId: restoredClub.clubId,
            clubName: restoredClub.name,
            roleId: restoredClub.discordRoleId,
            joinDate: now,
            status: 'Active',
          });
        }
        restoredClub.history.unshift({
          id: `ch-${crypto.randomUUID().slice(0, 6)}`,
          date: today,
          summary: `Restored ${player.playerName} (${player.tlcId}) to active roster by ${actor}.`,
        });
      }

      this.addAudit(
        state,
        'Player Profile Restored',
        actor,
        `${player.playerName} (${player.tlcId})`,
        'Deleted',
        restoredClub ? `Active (${restoredClub.name})` : 'Active (Free Agent)'
      );

      this.addNotification(
        state,
        'Profile Update',
        player.discordUserId,
        player.playerName,
        'TLC Player Profile Restored',
        `Your official TLC player profile (${player.tlcId}) has been restored by ${actor}.${
          restoredClub
            ? ` Club restored: ${restoredClub.name}.`
            : ' You are currently eligible as a Free Agent.'
        }`,
        'DM'
      );

      return { player, restoredClub };
    });
  }

  private editPlayerInternal(
    state: TlcDatabaseState,
    tlcId: string,
    patch: Partial<
      Pick<PlayerProfile, 'playerName' | 'robloxUsername' | 'robloxAvatarUrl' | 'position' | 'status'>
    >,
    actor: string
  ): PlayerProfile {
    const player = state.players.find((p) => p.tlcId === tlcId);
    if (!player) throw new Error('Player profile not found.');

    const prev = `${player.playerName} · ${player.position} · ${player.status}`;
    if (patch.playerName) player.playerName = patch.playerName.trim();
    if (patch.robloxUsername) player.robloxUsername = patch.robloxUsername.trim();
    if (patch.robloxAvatarUrl) player.robloxAvatarUrl = patch.robloxAvatarUrl.trim();
    if (patch.position) player.position = patch.position;
    if (patch.status) player.status = patch.status;

    const next = `${player.playerName} · ${player.position} · ${player.status}`;
    this.addAudit(
      state,
      'Player Profile Edited',
      actor,
      `${player.playerName} (${player.tlcId})`,
      prev,
      next
    );
    this.addNotification(
      state,
      'Profile Update',
      player.discordUserId,
      player.playerName,
      'Profile Updated',
      `Staff (${actor}) updated your TLC profile.`
    );
    return player;
  }

  public editPlayer(
    tlcId: string,
    patch: Partial<
      Pick<PlayerProfile, 'playerName' | 'robloxUsername' | 'robloxAvatarUrl' | 'position' | 'status'>
    >,
    actor: string
  ): Promise<PlayerProfile> {
    return this.commitMutation((state) => this.editPlayerInternal(state, tlcId, patch, actor));
  }

  private editManagerInternal(
    state: TlcDatabaseState,
    tlcId: string,
    patch: Partial<
      Pick<ManagerProfile, 'managerName' | 'robloxUsername' | 'robloxAvatarUrl' | 'status'>
    >,
    actor: string
  ): ManagerProfile {
    const manager = state.managers.find((m) => m.tlcId === tlcId);
    if (!manager) throw new Error('Manager profile not found.');

    const prev = `${manager.managerName} · ${manager.status}`;
    if (patch.managerName) manager.managerName = patch.managerName.trim();
    if (patch.robloxUsername) manager.robloxUsername = patch.robloxUsername.trim();
    if (patch.robloxAvatarUrl) manager.robloxAvatarUrl = patch.robloxAvatarUrl.trim();
    if (patch.status) manager.status = patch.status;

    const next = `${manager.managerName} · ${manager.status}`;
    this.addAudit(
      state,
      'Manager Profile Edited',
      actor,
      `${manager.managerName} (${manager.tlcId})`,
      prev,
      next
    );
    this.addNotification(
      state,
      'Profile Update',
      manager.discordUserId,
      manager.managerName,
      'Manager Profile Updated',
      `Staff (${actor}) updated your manager profile.`
    );
    return manager;
  }

  public editManager(
    tlcId: string,
    patch: Partial<
      Pick<ManagerProfile, 'managerName' | 'robloxUsername' | 'robloxAvatarUrl' | 'status'>
    >,
    actor: string
  ): Promise<ManagerProfile> {
    return this.commitMutation((state) => this.editManagerInternal(state, tlcId, patch, actor));
  }

  public getActiveManagers(): ManagerProfile[] {
    return this.state.managers.filter((m) => m.status !== 'Deleted');
  }

  public getDeletedManagers(): ManagerProfile[] {
    return this.state.managers.filter((m) => m.status === 'Deleted');
  }

  private deleteManagerProfileInternal(
    state: TlcDatabaseState,
    tlcId: string,
    actor: string,
    reason?: string
  ): { manager: ManagerProfile; previousClubId: string | null } {
    const manager = state.managers.find((m) => m.tlcId === tlcId);
    if (!manager) throw new Error('Manager profile not found.');
    if (manager.status === 'Deleted') throw new Error('This manager profile is already deleted.');

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const prevClubId = manager.currentClubId;
    const prevStatus = manager.status;

    manager.previousClubId = prevClubId;
    manager.previousStatus = prevStatus;
    manager.status = 'Deleted';
    manager.deletedAt = now;
    manager.deletedBy = actor;
    manager.deletionReason = reason?.trim() || 'Removed from active managers by administrator';
    manager.currentClubId = null;

    const openCareer = manager.careerHistory.find((h) => !h.endDate);
    if (openCareer) openCareer.endDate = today;

    for (const c of state.clubs) {
      if (c.currentManagerTlcId === tlcId) {
        c.currentManagerTlcId = null;
        c.history.unshift({
          id: `ch-${crypto.randomUUID().slice(0, 6)}`,
          date: today,
          summary: `Manager ${manager.managerName} (${manager.tlcId}) removed from active managers by ${actor}.`,
        });
      }
    }

    for (const offer of state.transferOffers) {
      if (
        offer.managerTlcId === manager.tlcId &&
        (offer.status === 'Pending Player' || offer.status === 'Pending Staff')
      ) {
        offer.status = 'Cancelled';
        offer.rejectionReason = 'Submitting manager profile removed by administrator.';
        offer.staffReviewedBy = actor;
        offer.staffReviewedAt = now;
      }
    }

    for (const compReg of state.competitionRegistrations) {
      if (compReg.managerTlcId === manager.tlcId && compReg.status === 'Pending') {
        compReg.status = 'Rejected';
        compReg.rejectionReason = 'Submitting manager profile removed by administrator.';
        compReg.reviewedBy = actor;
        compReg.reviewedAt = now;
      }
    }

    this.addAudit(
      state,
      'Manager Profile Deleted',
      actor,
      `${manager.managerName} (${manager.tlcId})`,
      `${prevStatus}${prevClubId ? ` (${prevClubId})` : ''}`,
      'Deleted (Historical Data Preserved)'
    );

    this.addNotification(
      state,
      'Profile Update',
      manager.discordUserId,
      manager.managerName,
      'TLC Manager Profile Deleted',
      `Your official TLC manager profile (${manager.tlcId}) was deactivated by ${actor}. All historical match records, trophies, and clubs managed remain preserved.`,
      'DM'
    );

    return { manager, previousClubId: prevClubId };
  }

  public deleteManagerProfile(
    tlcId: string,
    actor: string,
    reason?: string
  ): Promise<{ manager: ManagerProfile; previousClubId: string | null }> {
    return this.commitMutation((state) =>
      this.deleteManagerProfileInternal(state, tlcId, actor, reason)
    );
  }

  public restoreManagerProfile(
    tlcId: string,
    actor: string
  ): Promise<{ manager: ManagerProfile; restoredClub: Club | null }> {
    return this.commitMutation((state) => {
      const manager = state.managers.find((m) => m.tlcId === tlcId);
      if (!manager) throw new Error('Manager profile not found.');
      if (manager.status !== 'Deleted') throw new Error('This manager profile is already active.');

      const now = new Date().toISOString();
      const today = now.slice(0, 10);

      const prevClub = manager.previousClubId
        ? state.clubs.find((c) => c.status !== 'Deleted' && c.clubId === manager.previousClubId) ||
          null
        : null;

      const restoredClub = prevClub && !prevClub.currentManagerTlcId ? prevClub : null;
      manager.currentClubId = restoredClub ? restoredClub.clubId : null;
      manager.status = 'Active';
      delete manager.deletedAt;
      delete manager.deletedBy;
      delete manager.deletionReason;
      delete manager.previousClubId;
      delete manager.previousStatus;

      if (restoredClub) {
        restoredClub.currentManagerTlcId = manager.tlcId;
        restoredClub.history.unshift({
          id: `ch-${crypto.randomUUID().slice(0, 6)}`,
          date: today,
          summary: `Restored Manager ${manager.managerName} (${manager.tlcId}) by ${actor}.`,
        });
      }

      this.addAudit(
        state,
        'Manager Profile Restored',
        actor,
        `${manager.managerName} (${manager.tlcId})`,
        'Deleted',
        restoredClub ? `Active (${restoredClub.name})` : 'Active (Free Agent)'
      );

      this.addNotification(
        state,
        'Profile Update',
        manager.discordUserId,
        manager.managerName,
        'TLC Manager Profile Restored',
        `Your official TLC manager profile (${manager.tlcId}) has been restored by ${actor}.${
          restoredClub
            ? ` Club restored: ${restoredClub.name}.`
            : ' You are currently eligible as a Free Agent manager.'
        }`,
        'DM'
      );

      return { manager, restoredClub };
    });
  }

  public deleteProfile(
    tlcId: string,
    actor: string
  ): Promise<{ deletedType: string; tlcId: string }> {
    return this.commitMutation((state) => {
      const player = state.players.find((p) => p.tlcId === tlcId);
      if (player) {
        this.deletePlayerProfileInternal(state, tlcId, actor, 'Removed by staff');
        return { deletedType: 'Player', tlcId };
      }
      const manager = state.managers.find((m) => m.tlcId === tlcId);
      if (manager) {
        this.deleteManagerProfileInternal(state, tlcId, actor, 'Removed by staff');
        return { deletedType: 'Manager', tlcId };
      }
      throw new Error('TLC Profile not found.');
    });
  }

  // ==================== CLUBS ====================

  private createClubInternal(
    state: TlcDatabaseState,
    input: {
      name: string;
      shortCode: string;
      logoUrl?: string;
      primaryColor?: string;
      discordRoleId?: string;
      managerTlcId?: string | null;
    },
    actor: string
  ): Club {
    if (
      state.clubs.some(
        (c) => c.status !== 'Deleted' && c.name.toLowerCase() === input.name.trim().toLowerCase()
      )
    ) {
      throw new Error('A club with this name already exists.');
    }

    const clubId = this.generateClubId(state);
    const club: Club = {
      clubId,
      name: input.name.trim(),
      shortCode: input.shortCode.trim().toUpperCase().slice(0, 5),
      logoUrl: input.logoUrl?.trim() || '/src/assets/images/tlc_league_crest_1795467599044.jpg',
      primaryColor: input.primaryColor || '#059669',
      discordRoleId: input.discordRoleId?.trim() || '',
      status: 'Active',
      currentManagerTlcId: null,
      registrationDate: new Date().toISOString(),
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      trophies: 0,
      currentCompetitionIds: [],
      history: [
        {
          id: `ch-${crypto.randomUUID().slice(0, 6)}`,
          date: new Date().toISOString().slice(0, 10),
          summary: `Club ${input.name.trim()} officially registered by ${actor}.`,
        },
      ],
    };

    state.clubs.push(club);
    this.addAudit(
      state,
      'Club Created',
      actor,
      `${club.name} (${club.clubId})`,
      'None',
      'Official TLC Club'
    );

    if (input.managerTlcId) {
      this.assignManagerInternal(state, club.clubId, input.managerTlcId, actor);
    }
    return club;
  }

  public createClub(
    input: {
      name: string;
      shortCode: string;
      logoUrl?: string;
      primaryColor?: string;
      discordRoleId?: string;
      managerTlcId?: string | null;
    },
    actor: string
  ): Promise<Club> {
    return this.commitMutation((state) => this.createClubInternal(state, input, actor));
  }

  public submitClubRegistration(input: {
    name: string;
    shortCode: string;
    logoUrl?: string;
    primaryColor?: string;
    requestedByDiscordId: string;
    requestedByUsername: string;
    managerTlcId?: string | null;
  }): Promise<ClubRegistrationRequest> {
    return this.commitMutation((state) => {
      const cleanName = input.name.trim();
      if (!cleanName || !input.shortCode.trim()) {
        throw new Error('Club name and short code are required.');
      }
      if (
        state.clubs.some(
          (c) => c.status !== 'Deleted' && c.name.toLowerCase() === cleanName.toLowerCase()
        )
      ) {
        throw new Error('A club with this name already exists.');
      }
      const list = (state.clubRegistrationRequests ??= []);
      if (list.some((r) => r.status === 'Pending' && r.name.toLowerCase() === cleanName.toLowerCase())) {
        throw new Error('A pending club registration with this name already exists.');
      }

      const req: ClubRegistrationRequest = {
        id: `clbreq-${crypto.randomUUID().slice(0, 8)}`,
        name: cleanName,
        shortCode: input.shortCode.trim().toUpperCase().slice(0, 5),
        logoUrl: input.logoUrl?.trim() || '',
        primaryColor: input.primaryColor || '#059669',
        requestedByDiscordId: input.requestedByDiscordId,
        requestedByUsername: input.requestedByUsername,
        managerTlcId: input.managerTlcId || null,
        status: 'Pending',
        submittedAt: new Date().toISOString(),
      };
      list.unshift(req);
      this.addAudit(
        state,
        'Club Registration Submitted',
        input.requestedByUsername,
        cleanName,
        'None',
        'Pending Approval'
      );
      return req;
    });
  }

  public reviewClubRegistration(
    id: string,
    decision: 'approve' | 'cancel',
    actor: string,
    reason?: string
  ): Promise<{ request: ClubRegistrationRequest; club?: Club }> {
    return this.commitMutation((state) => {
      const list = (state.clubRegistrationRequests ??= []);
      const req = list.find((r) => r.id === id);
      if (!req) throw new Error('Club registration request not found.');
      if (req.status !== 'Pending') throw new Error(`Club registration is already ${req.status}.`);

      req.reviewedAt = new Date().toISOString();
      req.reviewedBy = actor;

      if (decision === 'cancel') {
        const cleanReason = reason?.trim() || '';
        if (!cleanReason) throw new Error('A mandatory rejection reason must be provided.');
        req.status = 'Cancelled';
        req.rejectionReason = cleanReason;
        this.addAudit(
          state,
          'Club Registration Rejected',
          actor,
          req.name,
          'Pending',
          `Rejected: ${cleanReason}`
        );
        this.addNotification(
          state,
          'Registration Rejection',
          req.requestedByDiscordId,
          req.requestedByUsername,
          'Club Registration Rejected',
          `❌ Your request has been rejected.\n\nReason: ${cleanReason}`,
          'DM'
        );
        return { request: req };
      }

      const club = this.createClubInternal(
        state,
        {
          name: req.name,
          shortCode: req.shortCode,
          logoUrl: req.logoUrl || undefined,
          primaryColor: req.primaryColor,
          managerTlcId: req.managerTlcId,
        },
        actor
      );
      req.status = 'Approved';
      req.clubId = club.clubId;
      return { request: req, club };
    });
  }

  public editClub(
    clubId: string,
    patch: Partial<Pick<Club, 'name' | 'shortCode' | 'logoUrl' | 'primaryColor' | 'discordRoleId'>>,
    actor: string
  ): Promise<Club> {
    return this.commitMutation((state) => {
      const club = state.clubs.find((c) => c.clubId === clubId);
      if (!club) throw new Error('Club not found.');

      const prev = `${club.name} (${club.shortCode})`;
      if (patch.name) club.name = patch.name.trim();
      if (patch.shortCode) club.shortCode = patch.shortCode.trim().toUpperCase().slice(0, 5);
      if (patch.logoUrl) club.logoUrl = patch.logoUrl.trim();
      if (patch.primaryColor) club.primaryColor = patch.primaryColor;
      if (patch.discordRoleId !== undefined) club.discordRoleId = patch.discordRoleId.trim();

      this.addAudit(
        state,
        'Club Edited',
        actor,
        `${club.name} (${club.clubId})`,
        prev,
        `${club.name} (${club.shortCode})`
      );
      return club;
    });
  }

  private assignManagerInternal(
    state: TlcDatabaseState,
    clubId: string,
    managerTlcId: string,
    actor: string
  ): Club {
    const club = state.clubs.find((c) => c.clubId === clubId);
    const manager = state.managers.find((m) => m.tlcId === managerTlcId && m.status !== 'Deleted');
    if (!club) throw new Error('Club not found.');
    if (!manager) throw new Error('Active verified manager not found.');

    if (club.currentManagerTlcId && club.currentManagerTlcId !== managerTlcId) {
      this.removeManagerInternal(state, clubId, actor);
    }

    if (manager.currentClubId && manager.currentClubId !== clubId) {
      const oldClub = state.clubs.find((c) => c.clubId === manager.currentClubId);
      if (oldClub) oldClub.currentManagerTlcId = null;
    }

    club.currentManagerTlcId = manager.tlcId;
    manager.currentClubId = club.clubId;
    manager.status = 'Active';
    if (!manager.clubsManaged.includes(club.clubId)) {
      manager.clubsManaged.push(club.clubId);
    }
    manager.careerHistory.unshift({
      id: `mc-${crypto.randomUUID().slice(0, 6)}`,
      clubId: club.clubId,
      clubName: club.name,
      role: 'Manager',
      startDate: new Date().toISOString().slice(0, 10),
      notes: `Assigned by ${actor}`,
    });
    club.history.unshift({
      id: `ch-${crypto.randomUUID().slice(0, 6)}`,
      date: new Date().toISOString().slice(0, 10),
      summary: `Appointed ${manager.managerName} (${manager.tlcId}) as Manager.`,
    });

    this.addAudit(
      state,
      'Manager Assigned',
      actor,
      club.name,
      'Unassigned',
      `${manager.managerName} (${manager.tlcId})`
    );
    return club;
  }

  public assignManager(clubId: string, managerTlcId: string, actor: string): Promise<Club> {
    return this.commitMutation((state) =>
      this.assignManagerInternal(state, clubId, managerTlcId, actor)
    );
  }

  private removeManagerInternal(state: TlcDatabaseState, clubId: string, actor: string): Club {
    const club = state.clubs.find((c) => c.clubId === clubId);
    if (!club) throw new Error('Club not found.');
    if (!club.currentManagerTlcId) return club;

    const manager = state.managers.find((m) => m.tlcId === club.currentManagerTlcId);
    const prevName = manager
      ? `${manager.managerName} (${manager.tlcId})`
      : club.currentManagerTlcId;

    if (manager) {
      manager.currentClubId = null;
      manager.status = 'Free Agent';
      const activeEntry = manager.careerHistory.find((h) => h.clubId === clubId && !h.endDate);
      if (activeEntry) activeEntry.endDate = new Date().toISOString().slice(0, 10);
    }
    club.currentManagerTlcId = null;
    club.history.unshift({
      id: `ch-${crypto.randomUUID().slice(0, 6)}`,
      date: new Date().toISOString().slice(0, 10),
      summary: `Manager ${prevName} departed club.`,
    });

    this.addAudit(state, 'Manager Removed', actor, club.name, prevName, 'Vacant');
    return club;
  }

  public removeManager(clubId: string, actor: string): Promise<Club> {
    return this.commitMutation((state) => this.removeManagerInternal(state, clubId, actor));
  }

  // ==================== TRANSFERS & CONTRACTS ====================

  private completeTransferInternal(
    state: TlcDatabaseState,
    params: {
      player: PlayerProfile;
      toClub: Club | null;
      transferType: TransferType;
      details: string;
      actor: string;
    }
  ): TransferRecord {
    const { player, toClub, transferType, details, actor } = params;
    const fromClub = player.currentClubId
      ? state.clubs.find((c) => c.clubId === player.currentClubId) || null
      : null;

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const openCareer = player.careerHistory.find((h) => !h.endDate);
    if (openCareer) openCareer.endDate = today;

    for (const c of state.contracts) {
      if (c.playerTlcId === player.tlcId && (c.status === 'Active' || c.status === 'Expiring')) {
        c.status = 'Terminated';
      }
    }

    if (transferType === 'Loan' && toClub) {
      player.loanedFromClubId = fromClub?.clubId || null;
    } else if (transferType === 'Return from Loan') {
      player.loanedFromClubId = null;
    } else {
      player.loanedFromClubId = null;
    }

    player.currentClubId = toClub ? toClub.clubId : null;
    player.status = toClub ? 'Active' : 'Free Agent';

    if (toClub) {
      player.careerHistory.unshift({
        id: `pc-${crypto.randomUUID().slice(0, 6)}`,
        clubId: toClub.clubId,
        clubName: toClub.name,
        role: 'Player',
        transferType,
        startDate: today,
        notes: details,
      });

      const exp = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
      state.contracts.unshift({
        id: `con-${crypto.randomUUID().slice(0, 8)}`,
        playerTlcId: player.tlcId,
        playerName: player.playerName,
        clubId: toClub.clubId,
        clubName: toClub.name,
        startDate: today,
        expirationDate: exp,
        status: 'Active',
        terms: `${transferType} Contract — ${details || 'Standard TLC terms'}`,
        notifiedExpiring: false,
      });

      toClub.history.unshift({
        id: `ch-${crypto.randomUUID().slice(0, 6)}`,
        date: today,
        summary: `${transferType}: Signed ${player.playerName} (${player.tlcId}) from ${fromClub ? fromClub.name : 'Free Agency'}.`,
      });
    }

    if (fromClub) {
      fromClub.history.unshift({
        id: `ch-${crypto.randomUUID().slice(0, 6)}`,
        date: today,
        summary: `${transferType}: ${player.playerName} (${player.tlcId}) departed to ${toClub ? toClub.name : 'Free Agency'}.`,
      });
    }

    const record: TransferRecord = {
      id: `tr-${crypto.randomUUID().slice(0, 8)}`,
      playerTlcId: player.tlcId,
      playerDiscordUserId: player.discordUserId,
      playerName: player.playerName,
      fromClubId: fromClub?.clubId || null,
      fromClubName: fromClub?.name || 'Free Agent',
      toClubId: toClub?.clubId || null,
      toClubName: toClub?.name || 'Free Agent',
      transferType,
      details,
      approvedBy: actor,
      completedAt: now,
    };

    state.transfers.unshift(record);

    this.addAudit(
      state,
      `Transfer Completed (${transferType})`,
      actor,
      `${player.playerName} (${player.tlcId})`,
      fromClub?.name || 'Free Agent',
      toClub?.name || 'Free Agent'
    );

    if (state.config.notifications.announceTransfers) {
      this.addNotification(
        state,
        'Official Transfer',
        'transfer-market',
        player.playerName,
        `OFFICIAL ${transferType.toUpperCase()}`,
        `${player.playerName} (${player.position}) moved from ${record.fromClubName} to ${record.toClubName}.`,
        '#transfer-market'
      );
    }

    this.addNotification(
      state,
      'Official Transfer',
      player.discordUserId,
      player.playerName,
      'Transfer Completed',
      `Your ${transferType} to ${record.toClubName} is official.`
    );

    return record;
  }

  public submitTransferOffer(
    input: {
      playerTlcId: string;
      toClubId: string;
      managerTlcId: string;
      transferType: TransferType;
      details?: string;
    },
    actor: string
  ): Promise<TransferOffer> {
    return this.commitMutation((state) => {
      const player = state.players.find(
        (p) => p.tlcId === input.playerTlcId && p.status !== 'Deleted'
      );
      const toClub = state.clubs.find((c) => c.clubId === input.toClubId && c.status !== 'Deleted');
      const manager = state.managers.find((m) => m.tlcId === input.managerTlcId);
      if (!player) throw new Error('Target active player not found.');
      if (!toClub) throw new Error('Destination club not found.');
      if (!manager) throw new Error('Submitting manager not found.');
      if (player.currentClubId === toClub.clubId) {
        throw new Error('Player is already registered with this club.');
      }

      const win = state.config.transferWindow;
      const isFreeAgentSigning = !player.currentClubId && input.transferType === 'Signing';
      if (!win.isOpen && !(isFreeAgentSigning && win.allowFreeAgentExceptions)) {
        throw new Error('The TLC Transfer Window is currently closed.');
      }

      const fromClub = player.currentClubId
        ? state.clubs.find((c) => c.clubId === player.currentClubId) || null
        : null;

      const offer: TransferOffer = {
        id: `offer-${crypto.randomUUID().slice(0, 8)}`,
        playerTlcId: player.tlcId,
        playerName: player.playerName,
        fromClubId: fromClub?.clubId || null,
        fromClubName: fromClub?.name || 'Free Agent',
        toClubId: toClub.clubId,
        toClubName: toClub.name,
        managerTlcId: manager.tlcId,
        managerName: manager.managerName,
        transferType: input.transferType,
        details: input.details?.trim() || 'Official squad offer',
        status: 'Pending Player',
        createdAt: new Date().toISOString(),
      };

      state.transferOffers.unshift(offer);
      this.addNotification(
        state,
        'Transfer Offer',
        player.discordUserId,
        player.playerName,
        `Offer from ${toClub.name}`,
        `${manager.managerName} submitted a ${input.transferType} offer to join ${toClub.name}.`,
        'DM'
      );
      this.addAudit(
        state,
        'Transfer Offer Submitted',
        actor,
        `${player.playerName} -> ${toClub.name}`,
        offer.fromClubName,
        `Pending Player (${input.transferType})`
      );
      return offer;
    });
  }

  public respondToTransferOffer(
    offerId: string,
    decision: 'accept' | 'decline',
    actor: string
  ): Promise<TransferOffer> {
    return this.commitMutation((state) => {
      const offer = state.transferOffers.find((o) => o.id === offerId);
      if (!offer) throw new Error('Transfer offer not found.');
      if (offer.status !== 'Pending Player') {
        throw new Error('Offer is no longer awaiting player response.');
      }

      offer.playerRespondedAt = new Date().toISOString();
      if (decision === 'decline') {
        offer.status = 'Rejected by Player';
        this.addNotification(
          state,
          'Transfer Rejection',
          offer.managerTlcId,
          offer.managerName,
          'Transfer Offer Declined',
          `${offer.playerName} declined the ${offer.transferType} offer to ${offer.toClubName}.`
        );
        this.addAudit(
          state,
          'Transfer Offer Declined',
          actor,
          `${offer.playerName} -> ${offer.toClubName}`,
          'Pending Player',
          'Rejected by Player'
        );
        return offer;
      }

      offer.status = 'Pending Staff';
      this.addNotification(
        state,
        'Transfer Acceptance',
        'staff',
        'TLC Staff',
        'Player Accepted Transfer Offer',
        `${offer.playerName} accepted ${offer.toClubName}'s ${offer.transferType} offer. Awaiting staff approval.`,
        '#registration-requests'
      );
      this.addAudit(
        state,
        'Transfer Offer Accepted by Player',
        actor,
        `${offer.playerName} -> ${offer.toClubName}`,
        'Pending Player',
        'Pending Staff'
      );

      if (!state.config.transferWindow.requireStaffApproval) {
        return this.reviewTransferOfferInternal(state, offer.id, 'approve', 'Auto-Approval Rule');
      }

      return offer;
    });
  }

  private reviewTransferOfferInternal(
    state: TlcDatabaseState,
    offerId: string,
    decision: 'approve' | 'reject' | 'cancel',
    actor: string,
    reason?: string
  ): TransferOffer {
    const offer = state.transferOffers.find((o) => o.id === offerId);
    if (!offer) throw new Error('Transfer offer not found.');

    offer.staffReviewedAt = new Date().toISOString();
    offer.staffReviewedBy = actor;

    if (decision === 'reject' || decision === 'cancel') {
      const cleanReason = reason?.trim() || '';
      if (!cleanReason) throw new Error('A mandatory rejection reason must be provided.');
      const prevStatus = offer.status;
      offer.status = decision === 'reject' ? 'Rejected by Staff' : 'Cancelled';
      offer.rejectionReason = cleanReason;
      this.addAudit(
        state,
        'Transfer Rejected',
        actor,
        `${offer.playerName} -> ${offer.toClubName}`,
        prevStatus,
        `Rejected: ${cleanReason}`
      );
      const targetPlayer = state.players.find((p) => p.tlcId === offer.playerTlcId);
      if (targetPlayer) {
        this.addNotification(
          state,
          'Transfer Rejection',
          targetPlayer.discordUserId,
          offer.playerName,
          'Transfer Request Rejected',
          `❌ Your request has been rejected.\n\nReason: ${cleanReason}`,
          'DM'
        );
      }
      return offer;
    }

    const player = state.players.find((p) => p.tlcId === offer.playerTlcId);
    const toClub = state.clubs.find((c) => c.clubId === offer.toClubId);
    if (!player || !toClub) throw new Error('Player or destination club no longer exists.');

    offer.status = 'Approved';
    this.completeTransferInternal(state, {
      player,
      toClub,
      transferType: offer.transferType,
      details: offer.details,
      actor,
    });
    return offer;
  }

  public reviewTransferOffer(
    offerId: string,
    decision: 'approve' | 'reject' | 'cancel',
    actor: string,
    reason?: string
  ): Promise<TransferOffer> {
    return this.commitMutation((state) =>
      this.reviewTransferOfferInternal(state, offerId, decision, actor, reason)
    );
  }

  public executeDirectTransfer(
    input: {
      playerTlcId: string;
      toClubId: string | null;
      transferType: TransferType;
      details?: string;
    },
    actor: string
  ): Promise<TransferRecord> {
    return this.commitMutation((state) => {
      const player = state.players.find((p) => p.tlcId === input.playerTlcId);
      if (!player) throw new Error('Player not found.');

      let toClub: Club | null = null;
      if (input.transferType === 'Return from Loan') {
        if (!player.loanedFromClubId) throw new Error('Player is not currently on loan.');
        toClub = state.clubs.find((c) => c.clubId === player.loanedFromClubId) || null;
      } else if (input.toClubId) {
        toClub = state.clubs.find((c) => c.clubId === input.toClubId) || null;
        if (!toClub) throw new Error('Target club not found.');
      }

      return this.completeTransferInternal(state, {
        player,
        toClub,
        transferType: input.transferType,
        details: input.details || `Executed by ${actor}`,
        actor,
      });
    });
  }

  public createContract(
    input: { playerTlcId: string; clubId: string; expirationDate: string; terms: string },
    actor: string
  ): Promise<Contract> {
    return this.commitMutation((state) => {
      const player = state.players.find((p) => p.tlcId === input.playerTlcId);
      const club = state.clubs.find((c) => c.clubId === input.clubId);
      if (!player || !club) throw new Error('Player or club not found.');

      const contract: Contract = {
        id: `con-${crypto.randomUUID().slice(0, 8)}`,
        playerTlcId: player.tlcId,
        playerName: player.playerName,
        clubId: club.clubId,
        clubName: club.name,
        startDate: new Date().toISOString().slice(0, 10),
        expirationDate: input.expirationDate,
        status: 'Active',
        terms: input.terms.trim() || 'Standard Club Contract',
        notifiedExpiring: false,
      };
      state.contracts.unshift(contract);
      this.addAudit(
        state,
        'Contract Created',
        actor,
        `${player.playerName} @ ${club.name}`,
        'None',
        `Expires ${input.expirationDate}`
      );
      return contract;
    });
  }

  public updateContract(
    contractId: string,
    action: 'renew' | 'terminate',
    newExpirationDate: string | undefined,
    actor: string
  ): Promise<Contract> {
    return this.commitMutation((state) => {
      const contract = state.contracts.find((c) => c.id === contractId);
      if (!contract) throw new Error('Contract not found.');

      const prev = `${contract.status} (exp ${contract.expirationDate})`;
      if (action === 'renew') {
        contract.expirationDate =
          newExpirationDate || new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
        contract.status = 'Active';
        contract.notifiedExpiring = false;
        this.addAudit(
          state,
          'Contract Renewed',
          actor,
          `${contract.playerName} @ ${contract.clubName}`,
          prev,
          `Active (exp ${contract.expirationDate})`
        );
      } else {
        contract.status = 'Terminated';
        const player = state.players.find((p) => p.tlcId === contract.playerTlcId);
        if (player && player.currentClubId === contract.clubId) {
          this.completeTransferInternal(state, {
            player,
            toClub: null,
            transferType: 'Release',
            details: 'Contract terminated',
            actor,
          });
        }
        this.addAudit(
          state,
          'Contract Terminated',
          actor,
          `${contract.playerName} @ ${contract.clubName}`,
          prev,
          'Terminated'
        );
      }
      return contract;
    });
  }

  public runContractExpirationCheck(
    actor: string
  ): Promise<{ expiringCount: number; expiredCount: number }> {
    return this.commitMutation((state) => {
      const nowMs = Date.now();
      const warnDays = state.config.competitions.contractWarningDays;
      let expiringCount = 0;
      let expiredCount = 0;

      for (const c of state.contracts) {
        if (c.status === 'Terminated' || c.status === 'Expired') continue;
        const expMs = new Date(c.expirationDate).getTime();
        const daysLeft = Math.ceil((expMs - nowMs) / 86400000);

        if (daysLeft <= 0) {
          c.status = 'Expired';
          expiredCount += 1;
          const player = state.players.find((p) => p.tlcId === c.playerTlcId);
          if (player && player.currentClubId === c.clubId) {
            this.completeTransferInternal(state, {
              player,
              toClub: null,
              transferType: 'Release',
              details: 'Contract expired — returned to Free Agency',
              actor,
            });
          }
        } else if (daysLeft <= warnDays) {
          c.status = 'Expiring';
          expiringCount += 1;
          if (!c.notifiedExpiring && state.config.notifications.notifyContractExpiring) {
            c.notifiedExpiring = true;
            const player = state.players.find((p) => p.tlcId === c.playerTlcId);
            if (player) {
              this.addNotification(
                state,
                'Contract Expiration',
                player.discordUserId,
                player.playerName,
                'Contract Expiring Soon',
                `Your contract with ${c.clubName} expires in ${daysLeft} day(s) (${c.expirationDate}).`,
                'DM'
              );
            }
          }
        }
      }

      this.addAudit(
        state,
        'Contract Audit Run',
        actor,
        'All Contracts',
        'Scheduled Check',
        `${expiringCount} expiring, ${expiredCount} expired`
      );
      return { expiringCount, expiredCount };
    });
  }

  // ==================== COMPETITIONS, FIXTURES, RESULTS, TABLES ====================

  public createCompetition(
    input: {
      name: string;
      type: Competition['type'];
      season: string;
      participatingClubIds: string[];
      numberOfGroups?: number;
      numberOfTeams?: number;
      matchFormat: 'Single Leg' | 'Home & Away';
      rules?: string;
      rosterLimit?: number;
      registrationDeadline?: string;
      startDate: string;
      endDate: string;
      pointsWin?: number;
      pointsDraw?: number;
      pointsLoss?: number;
      tieBreaker?: Competition['tieBreaker'];
      includeThirdPlace?: boolean;
    },
    actor: string
  ): Promise<Competition> {
    return this.commitMutation((state) => {
      const comp: Competition = {
        id: `comp-${crypto.randomUUID().slice(0, 8)}`,
        name: input.name.trim(),
        type: input.type,
        season: input.season.trim() || 'Season 1',
        participatingClubIds: [...input.participatingClubIds],
        numberOfGroups: input.numberOfGroups || 1,
        numberOfTeams: input.numberOfTeams || Math.max(input.participatingClubIds.length, 4),
        matchFormat: input.matchFormat,
        rules: input.rules?.trim() || 'Official TLC Match Rules.',
        rosterLimit: input.rosterLimit || state.config.competitions.defaultRosterLimit,
        registrationDeadline: input.registrationDeadline || input.startDate,
        startDate: input.startDate,
        endDate: input.endDate,
        status: 'Registration Open',
        pointsWin: input.pointsWin ?? 3,
        pointsDraw: input.pointsDraw ?? 1,
        pointsLoss: input.pointsLoss ?? 0,
        tieBreaker: input.tieBreaker || 'Goal Difference',
        includeThirdPlace: Boolean(input.includeThirdPlace),
      };

      for (const cid of comp.participatingClubIds) {
        const club = state.clubs.find((c) => c.clubId === cid);
        if (club && !club.currentCompetitionIds.includes(comp.id)) {
          club.currentCompetitionIds.push(comp.id);
        }
      }

      state.competitions.unshift(comp);
      this.addAudit(
        state,
        'Competition Created',
        actor,
        comp.name,
        'None',
        `${comp.type} · ${comp.season}`
      );
      return comp;
    });
  }

  public registerTeamForCompetition(
    input: {
      competitionId: string;
      clubId: string;
      managerTlcId: string;
      rosterTlcIds: string[];
    },
    actor: string
  ): Promise<CompetitionRegistration> {
    return this.commitMutation((state) => {
      const comp = state.competitions.find((c) => c.id === input.competitionId);
      const club = state.clubs.find((c) => c.clubId === input.clubId);
      const manager = state.managers.find((m) => m.tlcId === input.managerTlcId);
      if (!comp || !club || !manager) {
        throw new Error('Competition, verified club, or verified manager not found.');
      }

      if (input.rosterTlcIds.length > comp.rosterLimit) {
        throw new Error(`Roster exceeds competition limit of ${comp.rosterLimit} players.`);
      }

      if (comp.type !== 'Friendly Matches') {
        for (const pid of input.rosterTlcIds) {
          const p = state.players.find((x) => x.tlcId === pid);
          if (!p) continue;
          const activeSusp = (state.sanctions ?? []).filter(
            (s) =>
              s.playerDiscordUserId === p.discordUserId &&
              s.status === 'Active' &&
              (s.suspensionMatchesRemaining > 0 || s.sanctionType === 'Disciplinary Ban')
          );
          if (p.status === 'Suspended' || activeSusp.length > 0) {
            const rem = activeSusp.reduce((sum, s) => sum + s.suspensionMatchesRemaining, 0);
            const hasBan = activeSusp.some((s) => s.sanctionType === 'Disciplinary Ban');
            throw new Error(
              hasBan
                ? `Cannot register ${p.playerName} (${p.tlcId}) in official match lineups: player has an active Disciplinary Ban.`
                : `Cannot register ${p.playerName} (${p.tlcId}) in official match lineups: ${Math.max(rem, 1)} suspended match(es) remaining.`
            );
          }
        }
      }

      const approvedOthers = state.competitionRegistrations.filter(
        (r) => r.competitionId === comp.id && r.clubId !== club.clubId && r.status === 'Approved'
      );
      const takenPlayers = new Set(approvedOthers.flatMap((r) => r.rosterTlcIds));
      for (const pid of input.rosterTlcIds) {
        if (takenPlayers.has(pid)) {
          throw new Error(`Player ${pid} is already registered with another club in ${comp.name}.`);
        }
      }

      const reg: CompetitionRegistration = {
        id: `creg-${crypto.randomUUID().slice(0, 8)}`,
        competitionId: comp.id,
        clubId: club.clubId,
        clubName: club.name,
        managerTlcId: manager.tlcId,
        rosterTlcIds: input.rosterTlcIds,
        status: 'Pending',
        submittedAt: new Date().toISOString(),
      };

      state.competitionRegistrations.unshift(reg);
      this.addNotification(
        state,
        'Competition Registration',
        'staff',
        'TLC Staff',
        `Team Entry: ${club.name}`,
        `${club.name} submitted a ${input.rosterTlcIds.length}-player roster for ${comp.name}.`,
        '#registration-requests'
      );
      this.addAudit(
        state,
        'Competition Team Submitted',
        actor,
        `${club.name} -> ${comp.name}`,
        'Unregistered',
        'Pending Approval'
      );
      return reg;
    });
  }

  public reviewCompetitionRegistration(
    regId: string,
    decision: 'approve' | 'reject',
    actor: string,
    reason?: string
  ): Promise<CompetitionRegistration> {
    return this.commitMutation((state) => {
      const reg = state.competitionRegistrations.find((r) => r.id === regId);
      if (!reg) throw new Error('Competition registration not found.');

      if (decision === 'reject') {
        const cleanReason = reason?.trim() || '';
        if (!cleanReason) throw new Error('A mandatory rejection reason must be provided.');
        reg.rejectionReason = cleanReason;
      }

      reg.status = decision === 'approve' ? 'Approved' : 'Rejected';
      reg.reviewedAt = new Date().toISOString();
      reg.reviewedBy = actor;

      if (decision === 'approve') {
        const comp = state.competitions.find((c) => c.id === reg.competitionId);
        const club = state.clubs.find((c) => c.clubId === reg.clubId);
        if (comp && !comp.participatingClubIds.includes(reg.clubId)) {
          comp.participatingClubIds.push(reg.clubId);
        }
        if (club && comp && !club.currentCompetitionIds.includes(comp.id)) {
          club.currentCompetitionIds.push(comp.id);
        }
      } else {
        const mgr = state.managers.find((m) => m.tlcId === reg.managerTlcId);
        if (mgr) {
          this.addNotification(
            state,
            'Competition Registration',
            mgr.discordUserId,
            mgr.managerName,
            'Competition Registration Rejected',
            `❌ Your request has been rejected.\n\nReason: ${reg.rejectionReason}`,
            'DM'
          );
        }
      }

      this.addAudit(
        state,
        `Competition Entry ${reg.status}`,
        actor,
        reg.clubName,
        'Pending',
        decision === 'reject' ? `Rejected: ${reg.rejectionReason}` : reg.status
      );
      return reg;
    });
  }

  public generateFixtures(competitionId: string, actor: string): Promise<Fixture[]> {
    return this.commitMutation((state) => {
      const comp = state.competitions.find((c) => c.id === competitionId);
      if (!comp) throw new Error('Competition not found.');
      if (comp.participatingClubIds.length < 2) {
        throw new Error('At least 2 participating clubs are required to generate fixtures.');
      }

      const created: Fixture[] = [];
      const clubList = [...comp.participatingClubIds];
      const startMs = new Date(comp.startDate).getTime() || Date.now();

      if (comp.type === 'Knockout Tournament') {
        let size = 2;
        while (size < clubList.length) size *= 2;
        if (size > 16) size = 16;

        const slots: (string | null)[] = [...clubList];
        while (slots.length < size) slots.push(null);

        const roundName = (teams: number) => {
          if (teams === 2) return 'Final';
          if (teams === 4) return 'Semi-Final';
          if (teams === 8) return 'Quarter-Final';
          return 'Round of 16';
        };

        const rounds: Fixture[][] = [];
        let currentCount = size / 2;
        let roundIndex = 0;

        while (currentCount >= 1) {
          const label = roundName(currentCount * 2);
          const rFixtures: Fixture[] = [];
          for (let i = 0; i < currentCount; i++) {
            const matchDate = new Date(startMs + roundIndex * 7 * 86400000)
              .toISOString()
              .slice(0, 10);
            rFixtures.push({
              id: `fix-${crypto.randomUUID().slice(0, 8)}`,
              matchNumber: this.generateMatchNumber(state),
              competitionId: comp.id,
              competitionName: comp.name,
              roundLabel: label,
              bracketSlot: `${label.replace(/\s+/g, '')}-${i + 1}`,
              homeClubId: roundIndex === 0 ? slots[i * 2] : null,
              awayClubId: roundIndex === 0 ? slots[i * 2 + 1] : null,
              matchDate,
              matchTime: '20:00 UTC',
              status:
                roundIndex === 0 && slots[i * 2] && slots[i * 2 + 1] ? 'Scheduled' : 'Pending',
              resultStatus: 'None',
            });
          }
          rounds.push(rFixtures);
          currentCount = Math.floor(currentCount / 2);
          roundIndex += 1;
        }

        for (let r = 0; r < rounds.length - 1; r++) {
          for (let i = 0; i < rounds[r].length; i++) {
            const nextFix = rounds[r + 1][Math.floor(i / 2)];
            rounds[r][i].nextFixtureId = nextFix.id;
            rounds[r][i].nextSlotSide = i % 2 === 0 ? 'home' : 'away';
          }
        }

        if (comp.includeThirdPlace && rounds.length >= 2) {
          const sfRound = rounds[rounds.length - 2];
          const thirdPlaceDate = new Date(startMs + (rounds.length - 1) * 7 * 86400000)
            .toISOString()
            .slice(0, 10);
          const thirdMatch: Fixture = {
            id: `fix-${crypto.randomUUID().slice(0, 8)}`,
            matchNumber: this.generateMatchNumber(state),
            competitionId: comp.id,
            competitionName: comp.name,
            roundLabel: 'Third-Place Match',
            bracketSlot: '3RD-PLACE',
            homeClubId: null,
            awayClubId: null,
            matchDate: thirdPlaceDate,
            matchTime: '18:00 UTC',
            status: 'Pending',
            resultStatus: 'None',
          };
          if (sfRound.length === 2) {
            created.push(thirdMatch);
          }
        }

        for (const r of rounds) {
          created.push(...r);
        }
      } else {
        const teams: (string | null)[] = [...clubList];
        if (teams.length % 2 !== 0) teams.push(null);
        const n = teams.length;
        const totalRounds = n - 1;
        const legs = comp.matchFormat === 'Home & Away' ? 2 : 1;

        for (let leg = 0; leg < legs; leg++) {
          const rotation = [...teams];
          for (let round = 0; round < totalRounds; round++) {
            const md = leg * totalRounds + round + 1;
            const matchDate = new Date(startMs + (md - 1) * 7 * 86400000)
              .toISOString()
              .slice(0, 10);
            for (let i = 0; i < n / 2; i++) {
              const t1 = rotation[i];
              const t2 = rotation[n - 1 - i];
              if (t1 && t2) {
                const home = leg % 2 === 0 ? t1 : t2;
                const away = leg % 2 === 0 ? t2 : t1;
                created.push({
                  id: `fix-${crypto.randomUUID().slice(0, 8)}`,
                  matchNumber: this.generateMatchNumber(state),
                  competitionId: comp.id,
                  competitionName: comp.name,
                  roundLabel:
                    comp.type === 'Group Stage' || comp.type === 'Group Stage + Knockout'
                      ? `Group Stage · MD ${md}`
                      : `Matchday ${md}`,
                  homeClubId: home,
                  awayClubId: away,
                  matchDate,
                  matchTime: '19:30 UTC',
                  status: 'Scheduled',
                  resultStatus: 'None',
                });
              }
            }
            const last = rotation.pop()!;
            rotation.splice(1, 0, last);
          }
        }
      }

      comp.status = 'In Progress';
      state.fixtures.push(...created);
      this.addAudit(
        state,
        'Fixtures Generated',
        actor,
        comp.name,
        '0 new fixtures',
        `Generated ${created.length} fixtures`
      );
      return created;
    });
  }

  public createFixture(
    input: {
      competitionId: string;
      roundLabel: string;
      homeClubId: string;
      awayClubId: string;
      matchDate: string;
      matchTime: string;
      referee?: string;
    },
    actor: string
  ): Promise<Fixture> {
    return this.commitMutation((state) => {
      const comp = state.competitions.find((c) => c.id === input.competitionId);
      if (!comp) throw new Error('Competition not found.');
      if (input.homeClubId === input.awayClubId) {
        throw new Error('Home and Away clubs must be different.');
      }

      const fixture: Fixture = {
        id: `fix-${crypto.randomUUID().slice(0, 8)}`,
        matchNumber: this.generateMatchNumber(state),
        competitionId: comp.id,
        competitionName: comp.name,
        roundLabel: input.roundLabel.trim() || 'Matchday',
        homeClubId: input.homeClubId,
        awayClubId: input.awayClubId,
        matchDate: input.matchDate,
        matchTime: input.matchTime,
        status: 'Scheduled',
        referee: input.referee?.trim(),
        resultStatus: 'None',
      };

      state.fixtures.unshift(fixture);
      this.notifyMatchManagers(state, fixture, 'Fixture Creation', 'New Fixture Scheduled');
      this.addAudit(
        state,
        'Fixture Created',
        actor,
        `#${fixture.matchNumber} (${comp.name})`,
        'None',
        `${fixture.matchDate} ${fixture.matchTime}`
      );
      return fixture;
    });
  }

  public editFixture(
    fixtureId: string,
    patch: Partial<
      Pick<
        Fixture,
        'matchDate' | 'matchTime' | 'status' | 'referee' | 'roundLabel' | 'homeClubId' | 'awayClubId'
      >
    >,
    actor: string
  ): Promise<Fixture> {
    return this.commitMutation((state) => {
      const fix = state.fixtures.find((f) => f.id === fixtureId);
      if (!fix) throw new Error('Fixture not found.');

      const prev = `${fix.status} · ${fix.matchDate} ${fix.matchTime}`;
      if (patch.matchDate) fix.matchDate = patch.matchDate;
      if (patch.matchTime) fix.matchTime = patch.matchTime;
      if (patch.status) fix.status = patch.status;
      if (patch.referee !== undefined) fix.referee = patch.referee;
      if (patch.roundLabel) fix.roundLabel = patch.roundLabel;
      if (patch.homeClubId !== undefined) fix.homeClubId = patch.homeClubId;
      if (patch.awayClubId !== undefined) fix.awayClubId = patch.awayClubId;

      const next = `${fix.status} · ${fix.matchDate} ${fix.matchTime}`;
      if (state.config.notifications.notifyFixtureChanges) {
        this.notifyMatchManagers(state, fix, 'Fixture Change', `Fixture #${fix.matchNumber} Updated`);
      }
      this.addAudit(state, 'Fixture Updated', actor, `Match #${fix.matchNumber}`, prev, next);
      return fix;
    });
  }

  private notifyMatchManagers(
    state: TlcDatabaseState,
    fixture: Fixture,
    category: NotificationEntry['category'],
    title: string
  ) {
    const home = state.clubs.find((c) => c.clubId === fixture.homeClubId);
    const away = state.clubs.find((c) => c.clubId === fixture.awayClubId);
    const label = `${home?.name || 'TBD'} vs ${away?.name || 'TBD'}`;

    for (const club of [home, away]) {
      if (club?.currentManagerTlcId) {
        const mgr = state.managers.find((m) => m.tlcId === club.currentManagerTlcId);
        if (mgr) {
          this.addNotification(
            state,
            category,
            mgr.discordUserId,
            mgr.managerName,
            title,
            `${label} (${fixture.competitionName}) — ${fixture.matchDate} at ${fixture.matchTime} [${fixture.status}]`
          );
        }
      }
    }
  }

  public submitMatchResult(
    fixtureId: string,
    input: {
      homeScore: number;
      awayScore: number;
      notes?: string;
      playerStats?: PlayerMatchStat[];
      autoApprove?: boolean;
      submittedByDiscordId?: string;
    },
    actor: string
  ): Promise<Fixture> {
    return this.commitMutation((state) => {
      const fix = state.fixtures.find((f) => f.id === fixtureId);
      if (!fix) throw new Error('Fixture not found.');
      if (!fix.homeClubId || !fix.awayClubId) {
        throw new Error('Both Home and Away clubs must be determined before submitting a result.');
      }

      fix.homeScore = Number(input.homeScore);
      fix.awayScore = Number(input.awayScore);
      fix.notes = input.notes?.trim();
      fix.playerStats = input.playerStats || [];
      fix.resultSubmittedBy = actor;
      fix.resultSubmittedByDiscordId = input.submittedByDiscordId;
      fix.resultStatus = 'Pending Approval';
      delete fix.resultRejectionReason;

      this.addAudit(
        state,
        'Match Result Submitted',
        actor,
        `Match #${fix.matchNumber}`,
        fix.status,
        `Submitted ${fix.homeScore}–${fix.awayScore} (Pending Approval)`
      );

      const shouldApprove =
        input.autoApprove === true || !state.config.competitions.requireResultApproval;
      if (shouldApprove) {
        return this.approveMatchResultInternal(state, fixtureId, actor);
      }

      return fix;
    });
  }

  private approveMatchResultInternal(
    state: TlcDatabaseState,
    fixtureId: string,
    actor: string
  ): Fixture {
    const fix = state.fixtures.find((f) => f.id === fixtureId);
    if (!fix) throw new Error('Fixture not found.');
    if (fix.homeScore === undefined || fix.awayScore === undefined) {
      throw new Error('No score submitted for this fixture.');
    }
    if (fix.resultStatus === 'Approved' && fix.status === 'Completed') {
      return fix;
    }

    const homeClub = state.clubs.find((c) => c.clubId === fix.homeClubId);
    const awayClub = state.clubs.find((c) => c.clubId === fix.awayClubId);
    if (!homeClub || !awayClub) throw new Error('Clubs not found.');

    fix.status = 'Completed';
    fix.resultStatus = 'Approved';
    fix.resultApprovedBy = actor;

    const hs = fix.homeScore;
    const as = fix.awayScore;

    homeClub.matchesPlayed += 1;
    awayClub.matchesPlayed += 1;
    homeClub.goalsFor += hs;
    homeClub.goalsAgainst += as;
    awayClub.goalsFor += as;
    awayClub.goalsAgainst += hs;

    if (hs > as) {
      homeClub.wins += 1;
      awayClub.losses += 1;
    } else if (as > hs) {
      awayClub.wins += 1;
      homeClub.losses += 1;
    } else {
      homeClub.draws += 1;
      awayClub.draws += 1;
    }

    const updateMgr = (mgrTlcId: string | null, gf: number, ga: number) => {
      if (!mgrTlcId) return;
      const mgr = state.managers.find((m) => m.tlcId === mgrTlcId);
      if (!mgr) return;
      mgr.matchesManaged += 1;
      if (gf > ga) mgr.wins += 1;
      else if (gf === ga) mgr.draws += 1;
      else mgr.losses += 1;
      mgr.winRate =
        mgr.matchesManaged > 0
          ? Number(((mgr.wins / mgr.matchesManaged) * 100).toFixed(1))
          : 0;
    };
    updateMgr(homeClub.currentManagerTlcId, hs, as);
    updateMgr(awayClub.currentManagerTlcId, as, hs);

    if (fix.playerStats && fix.playerStats.length > 0) {
      for (const ps of fix.playerStats) {
        const player = state.players.find((p) => p.tlcId === ps.playerTlcId);
        if (!player) continue;
        player.matchesPlayed += 1;
        player.goals += ps.goals;
        player.assists += ps.assists;
        player.saves += ps.saves;
        if (ps.cleanSheet) player.cleanSheets += 1;
        if (ps.manOfTheMatch) player.manOfTheMatchAwards += 1;
        if (ps.rating > 0) {
          player.ratingSum = Number((player.ratingSum + ps.rating).toFixed(2));
          player.ratingCount += 1;
          player.averageRating = Number((player.ratingSum / player.ratingCount).toFixed(2));
        }
        this.evaluateAchievements(player);
      }
    }

    if (fix.nextFixtureId && fix.nextSlotSide) {
      const winnerClubId = hs >= as ? homeClub.clubId : awayClub.clubId;
      const nextFix = state.fixtures.find((f) => f.id === fix.nextFixtureId);
      if (nextFix) {
        if (fix.nextSlotSide === 'home') nextFix.homeClubId = winnerClubId;
        else nextFix.awayClubId = winnerClubId;
        if (nextFix.homeClubId && nextFix.awayClubId && nextFix.status === 'Pending') {
          nextFix.status = 'Scheduled';
        }
      }
    }

    if (fix.roundLabel === 'Final') {
      const winnerClub = hs >= as ? homeClub : awayClub;
      const comp = state.competitions.find((c) => c.id === fix.competitionId);
      if (comp) {
        comp.status = 'Completed';
        this.grantAwardInternal(
          state,
          {
            name: comp.type === 'League' ? 'League Champion' : 'Cup Winner',
            recipientType: 'Club',
            recipientId: winnerClub.clubId,
            competitionId: comp.id,
          },
          actor
        );
      }
    }

    if (state.config.notifications.announceResults) {
      this.addNotification(
        state,
        'Match Result',
        'results-channel',
        `${homeClub.name} vs ${awayClub.name}`,
        'OFFICIAL RESULT',
        `${homeClub.name} ${hs}–${as} ${awayClub.name} (${fix.competitionName} · ${fix.roundLabel})`,
        '#results'
      );
    }

    this.addAudit(
      state,
      'Match Result Approved',
      actor,
      `${homeClub.name} ${hs}–${as} ${awayClub.name}`,
      'Pending Approval',
      `Completed (${fix.competitionName})`
    );

    const comp = state.competitions.find((c) => c.id === fix.competitionId);
    const isEligibleOfficialMatch =
      fix.status === 'Completed' &&
      fix.resultStatus === 'Approved' &&
      (!comp || comp.type !== 'Friendly Matches');

    if (isEligibleOfficialMatch) {
      this.advanceSuspensionsForCompletedMatchInternal(state, fix, homeClub.clubId, awayClub.clubId);
    }

    return fix;
  }

  public approveMatchResult(fixtureId: string, actor: string): Promise<Fixture> {
    return this.commitMutation((state) => this.approveMatchResultInternal(state, fixtureId, actor));
  }

  public cancelMatchResult(fixtureId: string, actor: string, reason?: string): Promise<Fixture> {
    return this.commitMutation((state) => {
      const fix = state.fixtures.find((f) => f.id === fixtureId);
      if (!fix) throw new Error('Fixture not found.');
      if (fix.resultStatus === 'Approved' && fix.status === 'Completed') {
        throw new Error('Cannot cancel an already approved match result.');
      }
      const cleanReason = reason?.trim() || '';
      if (!cleanReason) throw new Error('A mandatory rejection reason must be provided.');

      const prev = `${fix.homeScore ?? '-'}–${fix.awayScore ?? '-'}`;
      fix.resultStatus = 'Cancelled';
      fix.resultApprovedBy = actor;
      fix.resultRejectionReason = cleanReason;
      this.addAudit(
        state,
        'Match Result Rejected',
        actor,
        `Match #${fix.matchNumber}`,
        prev,
        `Rejected: ${cleanReason}`
      );
      if (fix.resultSubmittedByDiscordId) {
        this.addNotification(
          state,
          'Match Result',
          fix.resultSubmittedByDiscordId,
          fix.resultSubmittedBy || 'Match Official',
          `Match #${fix.matchNumber} Result Rejected`,
          `❌ Your request has been rejected.\n\nReason: ${cleanReason}`,
          'DM'
        );
      }
      return fix;
    });
  }

  private editMatchStatsInternal(
    state: TlcDatabaseState,
    fixtureId: string,
    playerStats: PlayerMatchStat[],
    actor: string
  ): Fixture {
    const fix = state.fixtures.find((f) => f.id === fixtureId);
    if (!fix) throw new Error('Fixture not found.');

    if (fix.resultStatus === 'Approved' && fix.playerStats) {
      for (const old of fix.playerStats) {
        const player = state.players.find((p) => p.tlcId === old.playerTlcId);
        if (!player) continue;
        player.matchesPlayed = Math.max(0, player.matchesPlayed - 1);
        player.goals = Math.max(0, player.goals - old.goals);
        player.assists = Math.max(0, player.assists - old.assists);
        player.saves = Math.max(0, player.saves - old.saves);
        if (old.cleanSheet) player.cleanSheets = Math.max(0, player.cleanSheets - 1);
        if (old.manOfTheMatch) {
          player.manOfTheMatchAwards = Math.max(0, player.manOfTheMatchAwards - 1);
        }
        if (old.rating > 0 && player.ratingCount > 0) {
          player.ratingSum = Math.max(0, Number((player.ratingSum - old.rating).toFixed(2)));
          player.ratingCount -= 1;
          player.averageRating =
            player.ratingCount > 0
              ? Number((player.ratingSum / player.ratingCount).toFixed(2))
              : 0;
        }
      }
    }

    const oldTlcIds = new Set((fix.playerStats || []).map((ps) => ps.playerTlcId));
    const comp = state.competitions.find((c) => c.id === fix.competitionId);
    const isOfficial = !comp || comp.type !== 'Friendly Matches';

    if (isOfficial) {
      for (const ps of playerStats) {
        if (oldTlcIds.has(ps.playerTlcId)) continue;
        const player = state.players.find((p) => p.tlcId === ps.playerTlcId);
        if (!player) continue;
        const activeSusp = (state.sanctions ?? []).filter(
          (s) =>
            s.playerDiscordUserId === player.discordUserId &&
            s.status === 'Active' &&
            (s.suspensionMatchesRemaining > 0 || s.sanctionType === 'Disciplinary Ban')
        );
        if (player.status === 'Suspended' || activeSusp.length > 0) {
          throw new Error(
            `${player.playerName} (${player.tlcId}) is currently suspended and cannot enter an official match lineup.`
          );
        }
      }
    }

    fix.playerStats = playerStats;

    if (fix.resultStatus === 'Approved') {
      for (const ps of playerStats) {
        const player = state.players.find((p) => p.tlcId === ps.playerTlcId);
        if (!player) continue;
        player.matchesPlayed += 1;
        player.goals += ps.goals;
        player.assists += ps.assists;
        player.saves += ps.saves;
        if (ps.cleanSheet) player.cleanSheets += 1;
        if (ps.manOfTheMatch) player.manOfTheMatchAwards += 1;
        if (ps.rating > 0) {
          player.ratingSum = Number((player.ratingSum + ps.rating).toFixed(2));
          player.ratingCount += 1;
          player.averageRating = Number((player.ratingSum / player.ratingCount).toFixed(2));
        }
        this.evaluateAchievements(player);
      }
    }

    this.addAudit(
      state,
      'Match Statistics Edited',
      actor,
      `Match #${fix.matchNumber}`,
      'Previous Match Stats',
      `Updated ${playerStats.length} player stat line(s)`
    );
    return fix;
  }

  public editMatchStats(
    fixtureId: string,
    playerStats: PlayerMatchStat[],
    actor: string
  ): Promise<Fixture> {
    return this.commitMutation((state) =>
      this.editMatchStatsInternal(state, fixtureId, playerStats, actor)
    );
  }

  public rateMatchPlayer(
    fixtureId: string,
    input: {
      playerTlcId: string;
      rating: number;
      goals?: number;
      assists?: number;
      saves?: number;
      cleanSheet?: boolean;
      manOfTheMatch?: boolean;
    },
    actor: string
  ): Promise<{ fixture: Fixture; stat: PlayerMatchStat; player: PlayerProfile }> {
    return this.commitMutation((state) => {
      const fix = state.fixtures.find((f) => f.id === fixtureId);
      if (!fix) throw new Error('Fixture not found.');
      const player = state.players.find((p) => p.tlcId === input.playerTlcId);
      if (!player) throw new Error('Player not found.');

      const comp = state.competitions.find((c) => c.id === fix.competitionId);
      const isOfficial = !comp || comp.type !== 'Friendly Matches';
      const existingList = [...(fix.playerStats || [])];
      const existingIdx = existingList.findIndex((s) => s.playerTlcId === player.tlcId);

      if (isOfficial && existingIdx === -1) {
        const activeSusp = (state.sanctions ?? []).filter(
          (s) =>
            s.playerDiscordUserId === player.discordUserId &&
            s.status === 'Active' &&
            (s.suspensionMatchesRemaining > 0 || s.sanctionType === 'Disciplinary Ban')
        );
        if (player.status === 'Suspended' || activeSusp.length > 0) {
          const rem = activeSusp.reduce((sum, s) => sum + s.suspensionMatchesRemaining, 0);
          const hasBan = activeSusp.some((s) => s.sanctionType === 'Disciplinary Ban');
          throw new Error(
            hasBan
              ? `${player.playerName} (${player.tlcId}) has an active Disciplinary Ban and cannot participate in official matches.`
              : `${player.playerName} (${player.tlcId}) is currently suspended (${Math.max(rem, 1)} match(es) remaining) and cannot participate in official matches.`
          );
        }
      }

      const rating = Math.min(10, Math.max(1, Number(input.rating)));
      const prevStat = existingIdx !== -1 ? existingList[existingIdx] : null;

      const nextStat: PlayerMatchStat = {
        playerTlcId: player.tlcId,
        playerName: player.playerName,
        clubId: player.currentClubId || fix.homeClubId || '',
        goals: input.goals !== undefined ? Number(input.goals) : prevStat?.goals ?? 0,
        assists: input.assists !== undefined ? Number(input.assists) : prevStat?.assists ?? 0,
        saves: input.saves !== undefined ? Number(input.saves) : prevStat?.saves ?? 0,
        cleanSheet:
          input.cleanSheet !== undefined
            ? Boolean(input.cleanSheet)
            : prevStat?.cleanSheet ?? false,
        rating: Number(rating.toFixed(1)),
        manOfTheMatch:
          input.manOfTheMatch !== undefined
            ? Boolean(input.manOfTheMatch)
            : prevStat?.manOfTheMatch ?? false,
      };

      if (nextStat.manOfTheMatch) {
        for (const s of existingList) {
          if (s.playerTlcId !== player.tlcId) s.manOfTheMatch = false;
        }
      }

      if (existingIdx !== -1) {
        existingList[existingIdx] = nextStat;
      } else {
        existingList.push(nextStat);
      }

      this.editMatchStatsInternal(state, fixtureId, existingList, actor);
      const updatedPlayer = state.players.find((p) => p.tlcId === player.tlcId)!;
      return { fixture: fix, stat: nextStat, player: updatedPlayer };
    });
  }

  public computeStandings(competitionId: string): StandingRow[] {
    const comp = this.state.competitions.find((c) => c.id === competitionId);
    if (!comp) return [];

    const map = new Map<string, StandingRow>();
    for (const cid of comp.participatingClubIds) {
      const club = this.state.clubs.find((c) => c.clubId === cid);
      if (!club) continue;
      map.set(cid, {
        position: 0,
        clubId: cid,
        clubName: club.name,
        clubLogoUrl: club.logoUrl,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    }

    const compFixtures = this.state.fixtures.filter(
      (f) =>
        f.competitionId === competitionId &&
        f.status === 'Completed' &&
        f.homeScore !== undefined &&
        f.awayScore !== undefined
    );

    for (const f of compFixtures) {
      if (!f.homeClubId || !f.awayClubId) continue;
      const home = map.get(f.homeClubId);
      const away = map.get(f.awayClubId);
      if (!home || !away) continue;

      const hs = f.homeScore!;
      const as = f.awayScore!;
      home.played += 1;
      away.played += 1;
      home.goalsFor += hs;
      home.goalsAgainst += as;
      away.goalsFor += as;
      away.goalsAgainst += hs;

      if (hs > as) {
        home.won += 1;
        home.points += comp.pointsWin;
        away.lost += 1;
        away.points += comp.pointsLoss;
      } else if (as > hs) {
        away.won += 1;
        away.points += comp.pointsWin;
        home.lost += 1;
        home.points += comp.pointsLoss;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += comp.pointsDraw;
        away.points += comp.pointsDraw;
      }
    }

    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      goalDifference: r.goalsFor - r.goalsAgainst,
    }));

    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (comp.tieBreaker === 'Goals For' && b.goalsFor !== a.goalsFor) {
        return b.goalsFor - a.goalsFor;
      }
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });

    rows.forEach((r, idx) => {
      r.position = idx + 1;
    });

    return rows;
  }

  // ==================== AWARDS, ACHIEVEMENTS, LEADERBOARDS ====================

  private evaluateAchievements(player: PlayerProfile) {
    const unlock = (code: string, title: string, description: string) => {
      if (player.achievements.some((a) => a.code === code)) return;
      const ach: AchievementRecord = {
        id: `ach-${crypto.randomUUID().slice(0, 6)}`,
        code,
        title,
        description,
        unlockedAt: new Date().toISOString(),
      };
      player.achievements.push(ach);
    };

    if (player.matchesPlayed >= 1) unlock('FIRST_MATCH', 'First Match', 'Made official TLC debut');
    if (player.matchesPlayed >= 50) {
      unlock('MATCHES_50', '50 Matches', 'Reached 50 official TLC appearances');
    }
    if (player.matchesPlayed >= 100) {
      unlock('MATCHES_100', '100 Matches', 'TLC Centurion — 100 official matches');
    }
    if (player.goals >= 1) unlock('FIRST_GOAL', 'First Goal', 'Scored first official TLC goal');
    if (player.goals >= 10) unlock('GOALS_10', '10 Goals', 'Reached 10 official TLC career goals');
    if (player.assists >= 10) {
      unlock('ASSISTS_10', '10 Assists', 'Provided 10 official TLC career assists');
    }
    if (player.trophies >= 3) {
      unlock('TLC_LEGEND', 'TLC Legend', 'Won 3+ official Touchline trophies');
    }
  }

  private grantAwardInternal(
    state: TlcDatabaseState,
    input: {
      name: string;
      recipientType: 'Player' | 'Manager' | 'Club';
      recipientId: string;
      competitionId?: string;
      season?: string;
    },
    actor: string
  ): AwardRecord {
    let recipientName = input.recipientId;
    let discordId = '';

    if (input.recipientType === 'Player') {
      const p = state.players.find((x) => x.tlcId === input.recipientId);
      if (!p) throw new Error('Player not found.');
      recipientName = p.playerName;
      discordId = p.discordUserId;
      p.trophies += 1;
      if (input.name.toLowerCase().includes('golden boot')) {
        if (!p.achievements.some((a) => a.code === 'GOLDEN_BOOT')) {
          p.achievements.push({
            id: `ach-${crypto.randomUUID().slice(0, 6)}`,
            code: 'GOLDEN_BOOT',
            title: 'Golden Boot Winner',
            description: `Awarded ${input.name}`,
            unlockedAt: new Date().toISOString(),
          });
        }
      }
      this.evaluateAchievements(p);
    } else if (input.recipientType === 'Manager') {
      const m = state.managers.find((x) => x.tlcId === input.recipientId);
      if (!m) throw new Error('Manager not found.');
      recipientName = m.managerName;
      discordId = m.discordUserId;
      m.trophies += 1;
    } else {
      const c = state.clubs.find((x) => x.clubId === input.recipientId);
      if (!c) throw new Error('Club not found.');
      recipientName = c.name;
      c.trophies += 1;
      if (c.currentManagerTlcId) {
        const mgr = state.managers.find((m) => m.tlcId === c.currentManagerTlcId);
        if (mgr) mgr.trophies += 1;
      }
    }

    const comp = input.competitionId
      ? state.competitions.find((c) => c.id === input.competitionId)
      : undefined;

    const record: AwardRecord = {
      id: `aw-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      recipientName,
      competitionId: comp?.id,
      competitionName: comp?.name,
      season: input.season || comp?.season || 'Season 1',
      awardedAt: new Date().toISOString(),
      awardedBy: actor,
    };

    state.awards.unshift(record);
    this.addAudit(
      state,
      'Award Granted',
      actor,
      `${recipientName} (${input.recipientId})`,
      'No Award',
      input.name
    );
    if (discordId) {
      this.addNotification(
        state,
        'Award',
        discordId,
        recipientName,
        `Award Received: ${input.name}`,
        `Congratulations! You have been awarded ${input.name}${comp ? ` (${comp.name})` : ''}.`,
        'DM'
      );
    }
    return record;
  }

  public grantAward(
    input: {
      name: string;
      recipientType: 'Player' | 'Manager' | 'Club';
      recipientId: string;
      competitionId?: string;
      season?: string;
    },
    actor: string
  ): Promise<AwardRecord> {
    return this.commitMutation((state) => this.grantAwardInternal(state, input, actor));
  }

  public getLeaderboard(
    category: 'goals' | 'assists' | 'saves' | 'matches' | 'ratings' | 'trophies' | 'managers',
    competitionId?: string
  ) {
    if (category === 'managers') {
      return [...this.state.managers]
        .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
        .map((m, idx) => ({
          rank: idx + 1,
          tlcId: m.tlcId,
          name: m.managerName,
          clubName:
            this.state.clubs.find((c) => c.clubId === m.currentClubId)?.name || 'Free Agent',
          primaryValue: m.wins,
          secondaryLabel: `${m.winRate}% Win Rate · ${m.trophies} Trophies`,
        }));
    }

    if (competitionId && competitionId !== 'all') {
      const agg = new Map<
        string,
        { goals: number; assists: number; saves: number; matches: number; rSum: number; rCount: number }
      >();
      const compFixtures = this.state.fixtures.filter(
        (f) => f.competitionId === competitionId && f.status === 'Completed'
      );
      for (const f of compFixtures) {
        for (const ps of f.playerStats || []) {
          const cur = agg.get(ps.playerTlcId) || {
            goals: 0,
            assists: 0,
            saves: 0,
            matches: 0,
            rSum: 0,
            rCount: 0,
          };
          cur.goals += ps.goals;
          cur.assists += ps.assists;
          cur.saves += ps.saves;
          cur.matches += 1;
          if (ps.rating > 0) {
            cur.rSum += ps.rating;
            cur.rCount += 1;
          }
          agg.set(ps.playerTlcId, cur);
        }
      }

      return this.state.players
        .filter((p) => agg.has(p.tlcId))
        .map((p) => {
          const s = agg.get(p.tlcId)!;
          const avg = s.rCount > 0 ? Number((s.rSum / s.rCount).toFixed(2)) : 0;
          const val =
            category === 'goals'
              ? s.goals
              : category === 'assists'
              ? s.assists
              : category === 'saves'
              ? s.saves
              : category === 'matches'
              ? s.matches
              : category === 'ratings'
              ? avg
              : p.trophies;
          return {
            tlcId: p.tlcId,
            name: p.playerName,
            position: p.position,
            clubName:
              this.state.clubs.find((c) => c.clubId === p.currentClubId)?.name || 'Free Agent',
            primaryValue: val,
            secondaryLabel: `${s.matches} GP · ${s.goals}G · ${s.assists}A`,
          };
        })
        .sort((a, b) => b.primaryValue - a.primaryValue)
        .map((r, i) => ({ rank: i + 1, ...r }));
    }

    return [...this.state.players]
      .sort((a, b) => {
        if (category === 'goals') return b.goals - a.goals;
        if (category === 'assists') return b.assists - a.assists;
        if (category === 'saves') return b.saves - a.saves;
        if (category === 'matches') return b.matchesPlayed - a.matchesPlayed;
        if (category === 'ratings') return b.averageRating - a.averageRating;
        return b.trophies - a.trophies;
      })
      .map((p, idx) => ({
        rank: idx + 1,
        tlcId: p.tlcId,
        name: p.playerName,
        position: p.position,
        clubName: this.state.clubs.find((c) => c.clubId === p.currentClubId)?.name || 'Free Agent',
        primaryValue:
          category === 'goals'
            ? p.goals
            : category === 'assists'
            ? p.assists
            : category === 'saves'
            ? p.saves
            : category === 'matches'
            ? p.matchesPlayed
            : category === 'ratings'
            ? p.averageRating
            : p.trophies,
        secondaryLabel: `${p.position} · ${p.matchesPlayed} GP · Avg ${p.averageRating.toFixed(1)}`,
      }));
  }

  // ==================== TEAMSIGN TEAM MANAGEMENT & SIGNINGS ====================

  public getActiveTeams(): Club[] {
    return this.state.clubs.filter((c) => c.status !== 'Deleted');
  }

  public resolveUserTeam(discordUserId: string): Club | undefined {
    const active = this.getActiveTeams();
    const owned = active.find((c) => c.ownerDiscordUserId === discordUserId);
    if (owned) return owned;

    const player = this.state.players.find(
      (p) => p.discordUserId === discordUserId && p.status !== 'Deleted'
    );
    if (player?.currentClubId) {
      const c = active.find((x) => x.clubId === player.currentClubId);
      if (c) return c;
    }

    const mgr = this.state.managers.find((m) => m.discordUserId === discordUserId);
    if (mgr?.currentClubId) {
      const c = active.find((x) => x.clubId === mgr.currentClubId);
      if (c) return c;
    }

    const mem = (this.state.teamMemberships ?? []).find(
      (m) => m.discordUserId === discordUserId && m.status === 'Active'
    );
    if (mem) {
      return active.find((c) => c.clubId === mem.clubId);
    }

    return undefined;
  }

  public getTeamRosterMembers(clubId: string): {
    discordUserId: string;
    discordUsername: string;
    displayName: string;
    playerTlcId?: string;
    position?: string;
    joinDate: string;
    isOwner: boolean;
  }[] {
    const club = this.state.clubs.find((c) => c.clubId === clubId);
    const deletedDiscordIds = new Set(
      this.state.players.filter((p) => p.status === 'Deleted').map((p) => p.discordUserId)
    );
    const map = new Map<
      string,
      {
        discordUserId: string;
        discordUsername: string;
        displayName: string;
        playerTlcId?: string;
        position?: string;
        joinDate: string;
        isOwner: boolean;
      }
    >();

    for (const m of this.state.teamMemberships ?? []) {
      if (m.clubId === clubId && m.status === 'Active' && !deletedDiscordIds.has(m.discordUserId)) {
        map.set(m.discordUserId, {
          discordUserId: m.discordUserId,
          discordUsername: m.discordUsername,
          displayName: m.playerName,
          playerTlcId: m.playerTlcId,
          joinDate: m.joinDate,
          isOwner: club?.ownerDiscordUserId === m.discordUserId,
        });
      }
    }

    for (const p of this.state.players) {
      if (p.currentClubId === clubId && p.status !== 'Deleted') {
        const prev = map.get(p.discordUserId);
        map.set(p.discordUserId, {
          discordUserId: p.discordUserId,
          discordUsername: p.discordUsername,
          displayName: p.playerName,
          playerTlcId: p.tlcId,
          position: p.position,
          joinDate: prev?.joinDate || p.registrationDate,
          isOwner: club?.ownerDiscordUserId === p.discordUserId,
        });
      }
    }

    return Array.from(map.values());
  }

  public createTeam(
    input: {
      name: string;
      discordRoleId: string;
      ownerDiscordUserId: string;
      ownerDiscordUsername: string;
      logoEmoji: string;
    },
    actor: string
  ): Promise<Club> {
    return this.commitMutation((state) => {
      const cleanName = input.name.trim();
      if (!cleanName) throw new Error('Team Name is required.');
      if (!input.discordRoleId.trim()) {
        throw new Error('Please select an existing Discord role for the team.');
      }
      if (!input.ownerDiscordUserId.trim()) throw new Error('Please select a Team Owner.');

      const active = state.clubs.filter((c) => c.status !== 'Deleted');
      if (active.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
        throw new Error(`An active team named "${cleanName}" already exists.`);
      }
      if (active.some((c) => c.discordRoleId === input.discordRoleId)) {
        const existing = active.find((c) => c.discordRoleId === input.discordRoleId);
        throw new Error(`That Discord role is already linked to **${existing?.name}**.`);
      }

      const words = cleanName
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const shortCode =
        (words.length >= 2
          ? words
              .map((w) => w[0])
              .join('')
              .slice(0, 5)
          : cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4)
        ).toUpperCase() || 'TEAM';

      const clubId = this.generateClubId(state);
      const now = new Date().toISOString();
      const ownerMgr = state.managers.find(
        (m) => m.discordUserId === input.ownerDiscordUserId
      );

      const club: Club = {
        clubId,
        name: cleanName,
        shortCode,
        logoUrl: '/src/assets/images/tlc_league_crest_1795467599044.jpg',
        logoEmoji: input.logoEmoji.trim() || '⚽',
        primaryColor: '#059669',
        discordRoleId: input.discordRoleId.trim(),
        ownerDiscordUserId: input.ownerDiscordUserId.trim(),
        ownerDiscordUsername: input.ownerDiscordUsername.trim(),
        status: 'Active',
        currentManagerTlcId: ownerMgr && !ownerMgr.currentClubId ? ownerMgr.tlcId : null,
        registrationDate: now,
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        trophies: 0,
        currentCompetitionIds: [],
        history: [
          {
            id: `ch-${crypto.randomUUID().slice(0, 6)}`,
            date: now.slice(0, 10),
            summary: `${input.logoEmoji.trim() || '⚽'} Team created with Owner @${input.ownerDiscordUsername} by ${actor}.`,
          },
        ],
      };

      if (ownerMgr && !ownerMgr.currentClubId) {
        ownerMgr.currentClubId = clubId;
        ownerMgr.status = 'Active';
        if (!ownerMgr.clubsManaged.includes(clubId)) ownerMgr.clubsManaged.push(clubId);
        ownerMgr.careerHistory.unshift({
          id: `mc-${crypto.randomUUID().slice(0, 6)}`,
          clubId,
          clubName: club.name,
          role: 'Manager',
          startDate: now.slice(0, 10),
          notes: 'Team Owner / President',
        });
      }

      state.clubs.push(club);
      this.addAudit(
        state,
        'Team Created',
        actor,
        `${club.logoEmoji} ${club.name}`,
        'None',
        `Owner: @${club.ownerDiscordUsername}`
      );
      return club;
    });
  }

  public deactivateTeam(
    clubId: string,
    actor: string
  ): Promise<{ club: Club; removedDiscordUserIds: string[] }> {
    return this.commitMutation((state) => {
      const club = state.clubs.find((c) => c.clubId === clubId && c.status !== 'Deleted');
      if (!club) throw new Error('Active team not found.');

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const removedSet = new Set<string>();

      for (const mem of state.teamMemberships ?? []) {
        if (mem.clubId === clubId && mem.status === 'Active') {
          mem.status = 'TeamDeleted';
          removedSet.add(mem.discordUserId);
        }
      }

      for (const p of state.players) {
        if (p.currentClubId === clubId) {
          removedSet.add(p.discordUserId);
          p.currentClubId = null;
          p.status = p.inServer ? 'Free Agent' : 'Inactive';
          const open = p.careerHistory.find((h) => h.clubId === clubId && !h.endDate);
          if (open) open.endDate = today;
        }
      }

      for (const c of state.contracts) {
        if (c.clubId === clubId && (c.status === 'Active' || c.status === 'Expiring')) {
          c.status = 'Terminated';
        }
      }

      for (const m of state.managers) {
        if (m.currentClubId === clubId) {
          m.currentClubId = null;
          m.status = m.inServer ? 'Free Agent' : 'Inactive';
          const open = m.careerHistory.find((h) => h.clubId === clubId && !h.endDate);
          if (open) open.endDate = today;
        }
      }

      for (const req of state.signingRequests ?? []) {
        if (req.requestedClubId === clubId && req.status === 'Pending') {
          req.status = 'Cancelled';
          req.approvedBy = actor;
          req.approvalDate = now;
        }
      }

      club.status = 'Deleted';
      club.currentManagerTlcId = null;
      club.history.unshift({
        id: `ch-${crypto.randomUUID().slice(0, 6)}`,
        date: today,
        summary: `Team deactivated by ${actor}. Historical matches, transfers, and statistics preserved.`,
      });

      this.addAudit(
        state,
        'Team Deleted',
        actor,
        `${club.logoEmoji || ''} ${club.name}`.trim(),
        'Active',
        'Deleted (History Preserved)'
      );
      if (club.ownerDiscordUserId) {
        this.addNotification(
          state,
          'Profile Update',
          club.ownerDiscordUserId,
          club.ownerDiscordUsername || 'Team Owner',
          'Team Deleted',
          `${club.logoEmoji || ''} ${club.name} was removed from active teams by ${actor}. Historical records remain preserved.`,
          'DM'
        );
      }
      return { club, removedDiscordUserIds: Array.from(removedSet) };
    });
  }

  public submitDemande(input: {
    playerDiscordUserId: string;
    playerDiscordUsername: string;
    fallbackName: string;
    requestedClubId: string;
  }): Promise<SigningRequest> {
    return this.commitMutation((state) => {
      const reqs = (state.signingRequests ??= []);
      const existingPending = reqs.find(
        (r) => r.playerDiscordUserId === input.playerDiscordUserId && r.status === 'Pending'
      );
      if (existingPending) {
        throw new Error(
          `You already have a pending signing request for **${existingPending.requestedClubName}**. Wait for staff review before submitting another.`
        );
      }

      const club = state.clubs.find(
        (c) => c.status !== 'Deleted' && c.clubId === input.requestedClubId
      );
      if (!club) throw new Error('Selected team is not active.');

      const player = state.players.find((p) => p.discordUserId === input.playerDiscordUserId);
      const activeMembership = (state.teamMemberships ?? []).find(
        (m) => m.discordUserId === input.playerDiscordUserId && m.status === 'Active'
      );
      const currentClubId = player?.currentClubId || activeMembership?.clubId || null;

      if (currentClubId === club.clubId) {
        throw new Error(`You are already a member of **${club.logoEmoji || ''} ${club.name}**.`);
      }

      const fromClub = currentClubId
        ? state.clubs.find((c) => c.clubId === currentClubId)
        : undefined;
      const req: SigningRequest = {
        id: `dem-${crypto.randomUUID().slice(0, 8)}`,
        playerDiscordUserId: input.playerDiscordUserId,
        playerDiscordUsername: input.playerDiscordUsername,
        playerTlcId: player?.tlcId,
        playerName: player?.playerName || input.fallbackName || input.playerDiscordUsername,
        robloxUsername: player?.robloxUsername,
        position: player?.position,
        fromClubId: fromClub?.clubId || null,
        fromClubName: fromClub
          ? `${fromClub.logoEmoji ? `${fromClub.logoEmoji} ` : ''}${fromClub.name}`
          : 'Free Agent',
        requestedClubId: club.clubId,
        requestedClubName: club.name,
        requestedClubLogoEmoji: club.logoEmoji,
        requestDate: new Date().toISOString(),
        status: 'Pending',
      };

      reqs.unshift(req);
      this.addAudit(
        state,
        'Signing Request Submitted',
        input.playerDiscordUsername,
        `${req.playerName} -> ${club.name}`,
        req.fromClubName,
        'Pending'
      );
      return req;
    });
  }

  public reviewDemande(
    requestId: string,
    decision: 'approve' | 'cancel',
    actorUsername: string,
    actorDiscordId: string,
    reason?: string
  ): Promise<{ request: SigningRequest; club?: Club; transfer?: TransferRecord; prevRoleIds: string[] }> {
    return this.commitMutation((state) => {
      const reqs = (state.signingRequests ??= []);
      const req = reqs.find((r) => r.id === requestId);
      if (!req) throw new Error('Signing request not found.');
      if (req.status !== 'Pending') {
        throw new Error(`This signing request is already ${req.status}.`);
      }

      const now = new Date().toISOString();
      req.approvedBy = actorUsername;
      req.approvedByDiscordId = actorDiscordId;
      req.approvalDate = now;

      if (decision === 'cancel') {
        const cleanReason = reason?.trim() || '';
        if (!cleanReason) throw new Error('A mandatory rejection reason must be provided.');
        req.status = 'Cancelled';
        req.rejectionReason = cleanReason;
        this.addAudit(
          state,
          'Signing Request Rejected',
          actorUsername,
          `${req.playerName} -> ${req.requestedClubName}`,
          'Pending',
          `Rejected: ${cleanReason}`
        );
        this.addNotification(
          state,
          'Transfer Rejection',
          req.playerDiscordUserId,
          req.playerName,
          'Signing Request Rejected',
          `❌ Your request has been rejected.\n\nReason: ${cleanReason}`,
          'DM'
        );
        return { request: req, prevRoleIds: [] };
      }

      const club = state.clubs.find(
        (c) => c.status !== 'Deleted' && c.clubId === req.requestedClubId
      );
      if (!club) throw new Error('Requested team is no longer active.');

      const allowMulti = Boolean(state.config.transferWindow.allowMultipleTeamRoles);
      const memberships = (state.teamMemberships ??= []);
      const prevRoleIds: string[] = [];

      if (!allowMulti) {
        for (const mem of memberships) {
          if (
            mem.discordUserId === req.playerDiscordUserId &&
            mem.status === 'Active' &&
            mem.clubId !== club.clubId
          ) {
            mem.status = 'Transferred';
            const prevClub = state.clubs.find((c) => c.clubId === mem.clubId);
            if (prevClub?.discordRoleId) prevRoleIds.push(prevClub.discordRoleId);
          }
        }
      }

      const player = state.players.find((p) => p.discordUserId === req.playerDiscordUserId);
      if (player?.currentClubId && player.currentClubId !== club.clubId && !allowMulti) {
        const prevClub = state.clubs.find((c) => c.clubId === player.currentClubId);
        if (prevClub?.discordRoleId && !prevRoleIds.includes(prevClub.discordRoleId)) {
          prevRoleIds.push(prevClub.discordRoleId);
        }
      }

      let transfer: TransferRecord;
      if (player) {
        transfer = this.completeTransferInternal(state, {
          player,
          toClub: club,
          transferType: 'Demande Signing',
          details: `Approved /demande signing request`,
          actor: actorUsername,
        });
      } else {
        transfer = {
          id: `tr-${crypto.randomUUID().slice(0, 8)}`,
          playerTlcId: req.playerTlcId || 'DISCORD-MEMBER',
          playerDiscordUserId: req.playerDiscordUserId,
          playerName: req.playerName,
          fromClubId: req.fromClubId,
          fromClubName: req.fromClubName,
          toClubId: club.clubId,
          toClubName: club.name,
          transferType: 'Demande Signing',
          details: `Approved /demande signing request`,
          approvedBy: actorUsername,
          completedAt: now,
        };
        state.transfers.unshift(transfer);
        club.history.unshift({
          id: `ch-${crypto.randomUUID().slice(0, 6)}`,
          date: now.slice(0, 10),
          summary: `Demande Signing: ${req.playerName} joined from ${req.fromClubName}.`,
        });
        this.addAudit(
          state,
          'Demande Signing Approved',
          actorUsername,
          `${req.playerName} -> ${club.name}`,
          req.fromClubName,
          club.name
        );
      }

      const alreadyActive = memberships.some(
        (m) =>
          m.discordUserId === req.playerDiscordUserId &&
          m.clubId === club.clubId &&
          m.status === 'Active'
      );
      if (!alreadyActive) {
        memberships.unshift({
          id: `mem-${crypto.randomUUID().slice(0, 8)}`,
          discordUserId: req.playerDiscordUserId,
          discordUsername: req.playerDiscordUsername,
          playerTlcId: player?.tlcId || req.playerTlcId,
          playerName: player?.playerName || req.playerName,
          clubId: club.clubId,
          clubName: club.name,
          roleId: club.discordRoleId,
          joinDate: now,
          status: 'Active',
        });
      }

      req.status = 'Approved';
      this.addNotification(
        state,
        'Official Transfer',
        req.playerDiscordUserId,
        req.playerName,
        'Signing Request Approved',
        `Welcome to ${club.logoEmoji || ''} ${club.name}! Your signing request was approved by ${actorUsername}.`,
        'DM'
      );
      if (club.ownerDiscordUserId) {
        this.addNotification(
          state,
          'Official Transfer',
          club.ownerDiscordUserId,
          club.ownerDiscordUsername || 'Team Owner',
          'New Player Joined Your Team',
          `${req.playerName} has joined ${club.logoEmoji || ''} ${club.name} via /demande.`,
          'DM'
        );
      }

      return { request: req, club, transfer, prevRoleIds };
    });
  }

  public releaseTeamPlayer(input: {
    clubId: string;
    targetDiscordUserId: string;
    actorUsername: string;
    actorDiscordId: string;
    isAdmin: boolean;
  }): Promise<{ club: Club; targetDiscordUserId: string; targetName: string; transfer: TransferRecord }> {
    return this.commitMutation((state) => {
      const club = state.clubs.find((c) => c.status !== 'Deleted' && c.clubId === input.clubId);
      if (!club) throw new Error('Active team not found.');
      if (!input.isAdmin && club.ownerDiscordUserId !== input.actorDiscordId) {
        throw new Error('You can only release players from your own team.');
      }

      const memberships = (state.teamMemberships ??= []);
      const mem = memberships.find(
        (m) =>
          m.clubId === club.clubId &&
          m.discordUserId === input.targetDiscordUserId &&
          m.status === 'Active'
      );
      const player = state.players.find(
        (p) => p.discordUserId === input.targetDiscordUserId && p.currentClubId === club.clubId
      );
      if (!mem && !player) {
        throw new Error('This player is not currently on the active team roster.');
      }

      const now = new Date().toISOString();
      const targetName = player?.playerName || mem?.playerName || input.targetDiscordUserId;

      if (mem) mem.status = 'Released';

      let transfer: TransferRecord;
      if (player) {
        transfer = this.completeTransferInternal(state, {
          player,
          toClub: null,
          transferType: 'Release',
          details: `Released from ${club.name} by ${input.actorUsername}`,
          actor: input.actorUsername,
        });
      } else {
        transfer = {
          id: `tr-${crypto.randomUUID().slice(0, 8)}`,
          playerTlcId: mem?.playerTlcId || 'DISCORD-MEMBER',
          playerDiscordUserId: input.targetDiscordUserId,
          playerName: targetName,
          fromClubId: club.clubId,
          fromClubName: club.name,
          toClubId: null,
          toClubName: 'Free Agent',
          transferType: 'Release',
          details: `Released from ${club.name} by ${input.actorUsername}`,
          approvedBy: input.actorUsername,
          completedAt: now,
        };
        state.transfers.unshift(transfer);
        club.history.unshift({
          id: `ch-${crypto.randomUUID().slice(0, 6)}`,
          date: now.slice(0, 10),
          summary: `Release: ${targetName} released to Free Agency by ${input.actorUsername}.`,
        });
        this.addAudit(state, 'Player Released', input.actorUsername, targetName, club.name, 'Free Agent');
      }

      this.addNotification(
        state,
        'Official Transfer',
        input.targetDiscordUserId,
        targetName,
        'Released from Team',
        `You have been released from ${club.logoEmoji || ''} ${club.name} and are now a Free Agent.`,
        'DM'
      );
      if (club.ownerDiscordUserId && club.ownerDiscordUserId !== input.actorDiscordId) {
        this.addNotification(
          state,
          'Official Transfer',
          club.ownerDiscordUserId,
          club.ownerDiscordUsername || 'Team Owner',
          'Player Released',
          `${targetName} was released from ${club.logoEmoji || ''} ${club.name}.`,
          'DM'
        );
      }

      return { club, targetDiscordUserId: input.targetDiscordUserId, targetName, transfer };
    });
  }

  public syncMemberTeamRoleChange(
    discordUserId: string,
    discordUsername: string,
    displayName: string,
    addedClubIds: string[],
    removedClubIds: string[],
    actor = 'Discord Role Sync'
  ): Promise<{ rolesToRemove: string[] }> {
    return this.commitMutation((state) => {
      const memberships = (state.teamMemberships ??= []);
      const player = state.players.find((p) => p.discordUserId === discordUserId);
      if (player && player.status === 'Deleted') {
        return { rolesToRemove: [] };
      }
      const allowMulti = Boolean(state.config.transferWindow.allowMultipleTeamRoles);
      const now = new Date().toISOString();
      const rolesToRemove: string[] = [];

      for (const removedId of removedClubIds) {
        const club = state.clubs.find((c) => c.clubId === removedId);
        const mem = memberships.find(
          (m) => m.discordUserId === discordUserId && m.clubId === removedId && m.status === 'Active'
        );
        if (mem) {
          mem.status = 'Released';
        }
        if (player && player.currentClubId === removedId && addedClubIds.length === 0) {
          this.completeTransferInternal(state, {
            player,
            toClub: null,
            transferType: 'Release',
            details: 'Team Discord role removed',
            actor,
          });
        } else if (mem && club && addedClubIds.length === 0) {
          state.transfers.unshift({
            id: `tr-${crypto.randomUUID().slice(0, 8)}`,
            playerTlcId: player?.tlcId || 'DISCORD-MEMBER',
            playerDiscordUserId: discordUserId,
            playerName: player?.playerName || displayName || discordUsername,
            fromClubId: club.clubId,
            fromClubName: club.name,
            toClubId: null,
            toClubName: 'Free Agent',
            transferType: 'Release',
            details: 'Team Discord role removed',
            approvedBy: actor,
            completedAt: now,
          });
        }
      }

      for (const addedId of addedClubIds) {
        const club = state.clubs.find((c) => c.status !== 'Deleted' && c.clubId === addedId);
        if (!club) continue;

        if (!allowMulti) {
          for (const mem of memberships) {
            if (
              mem.discordUserId === discordUserId &&
              mem.status === 'Active' &&
              mem.clubId !== addedId
            ) {
              mem.status = 'Transferred';
              const oldClub = state.clubs.find((c) => c.clubId === mem.clubId);
              if (oldClub?.discordRoleId) rolesToRemove.push(oldClub.discordRoleId);
            }
          }
          if (player?.currentClubId && player.currentClubId !== addedId) {
            const oldClub = state.clubs.find((c) => c.clubId === player.currentClubId);
            if (oldClub?.discordRoleId && !rolesToRemove.includes(oldClub.discordRoleId)) {
              rolesToRemove.push(oldClub.discordRoleId);
            }
          }
        }

        const exists = memberships.some(
          (m) => m.discordUserId === discordUserId && m.clubId === addedId && m.status === 'Active'
        );
        if (!exists) {
          memberships.unshift({
            id: `mem-${crypto.randomUUID().slice(0, 8)}`,
            discordUserId,
            discordUsername,
            playerTlcId: player?.tlcId,
            playerName: player?.playerName || displayName || discordUsername,
            clubId: club.clubId,
            clubName: club.name,
            roleId: club.discordRoleId,
            joinDate: now,
            status: 'Active',
          });
        }

        if (player && player.currentClubId !== addedId) {
          this.completeTransferInternal(state, {
            player,
            toClub: club,
            transferType: 'Signing',
            details: 'Synced from Discord team role assignment',
            actor,
          });
        } else if (!player && !exists) {
          state.transfers.unshift({
            id: `tr-${crypto.randomUUID().slice(0, 8)}`,
            playerTlcId: 'DISCORD-MEMBER',
            playerDiscordUserId: discordUserId,
            playerName: displayName || discordUsername,
            fromClubId: null,
            fromClubName: 'Free Agent',
            toClubId: club.clubId,
            toClubName: club.name,
            transferType: 'Signing',
            details: 'Synced from Discord team role assignment',
            approvedBy: actor,
            completedAt: now,
          });
        }
      }

      return { rolesToRemove };
    });
  }

  public getTransferHistoryForUser(discordUserId: string): TransferRecord[] {
    const player = this.state.players.find((p) => p.discordUserId === discordUserId);
    return this.state.transfers.filter(
      (t) =>
        t.playerDiscordUserId === discordUserId ||
        (player ? t.playerTlcId === player.tlcId : false)
    );
  }

  public getRejectedRequests(
    category?: RejectedRequestItem['category'] | 'all'
  ): RejectedRequestItem[] {
    const items: RejectedRequestItem[] = [];

    for (const r of this.state.registrations) {
      if (r.status === 'Rejected') {
        items.push({
          id: r.id,
          category: 'Registration',
          title: `${r.playerName} (${r.registrationType}${r.position ? ` · ${r.position}` : ''})`,
          requesterName: `@${r.discordUsername}`,
          requesterDiscordId: r.discordUserId,
          reason: r.rejectionReason || 'No reason recorded',
          rejectedBy: r.reviewedBy || 'Staff',
          rejectedAt: r.reviewedAt || r.submittedAt,
        });
      }
    }

    for (const s of this.state.signingRequests ?? []) {
      if (s.status === 'Cancelled' && s.rejectionReason) {
        items.push({
          id: s.id,
          category: 'Signing Request',
          title: `${s.playerName} → ${s.requestedClubName}`,
          requesterName: `@${s.playerDiscordUsername}`,
          requesterDiscordId: s.playerDiscordUserId,
          reason: s.rejectionReason,
          rejectedBy: s.approvedBy || 'Staff',
          rejectedAt: s.approvalDate || s.requestDate,
        });
      }
    }

    for (const o of this.state.transferOffers) {
      if ((o.status === 'Rejected by Staff' || o.status === 'Cancelled') && o.rejectionReason) {
        items.push({
          id: o.id,
          category: 'Transfer Offer',
          title: `${o.playerName}: ${o.fromClubName} → ${o.toClubName}`,
          requesterName: o.managerName,
          reason: o.rejectionReason,
          rejectedBy: o.staffReviewedBy || 'Staff',
          rejectedAt: o.staffReviewedAt || o.createdAt,
        });
      }
    }

    for (const cr of this.state.clubRegistrationRequests ?? []) {
      if (cr.status === 'Cancelled') {
        items.push({
          id: cr.id,
          category: 'Club Registration',
          title: `${cr.name} (${cr.shortCode})`,
          requesterName: `@${cr.requestedByUsername}`,
          requesterDiscordId: cr.requestedByDiscordId,
          reason: cr.rejectionReason || 'No reason recorded',
          rejectedBy: cr.reviewedBy || 'Staff',
          rejectedAt: cr.reviewedAt || cr.submittedAt,
        });
      }
    }

    for (const compReg of this.state.competitionRegistrations) {
      if (compReg.status === 'Rejected') {
        const compName =
          this.state.competitions.find((c) => c.id === compReg.competitionId)?.name || 'Competition';
        items.push({
          id: compReg.id,
          category: 'Competition Entry',
          title: `${compReg.clubName} → ${compName}`,
          requesterName: compReg.managerTlcId,
          reason: compReg.rejectionReason || 'No reason recorded',
          rejectedBy: compReg.reviewedBy || 'Staff',
          rejectedAt: compReg.reviewedAt || compReg.submittedAt,
        });
      }
    }

    for (const corr of this.state.correctionRequests) {
      if (corr.status === 'Rejected') {
        items.push({
          id: corr.id,
          category: 'Profile Correction',
          title: `Correction for ${corr.tlcId}`,
          requesterName: corr.tlcId,
          requesterDiscordId: corr.discordUserId,
          reason: corr.rejectionReason || 'No reason recorded',
          rejectedBy: corr.reviewedBy || 'Staff',
          rejectedAt: corr.reviewedAt || corr.submittedAt,
        });
      }
    }

    for (const fix of this.state.fixtures) {
      if (fix.resultStatus === 'Cancelled' && fix.resultRejectionReason) {
        items.push({
          id: fix.id,
          category: 'Match Result',
          title: `Match #${fix.matchNumber} (${fix.competitionName})`,
          requesterName: fix.resultSubmittedBy || 'Match Official',
          requesterDiscordId: fix.resultSubmittedByDiscordId,
          reason: fix.resultRejectionReason,
          rejectedBy: fix.resultApprovedBy || 'Staff',
          rejectedAt: fix.matchDate,
        });
      }
    }

    const filtered =
      category && category !== 'all' ? items.filter((i) => i.category === category) : items;
    return filtered.sort((a, b) => b.rejectedAt.localeCompare(a.rejectedAt));
  }

  // ==================== DISCIPLINARY & SANCTIONS MANAGEMENT ====================

  private syncPlayerDisciplinaryStatusInternal(
    state: TlcDatabaseState,
    playerDiscordUserId: string
  ): PlayerProfile | undefined {
    const player = state.players.find((p) => p.discordUserId === playerDiscordUserId);
    if (!player || player.status === 'Deleted') return player;

    const hasActiveSuspensionOrBan = (state.sanctions ?? []).some(
      (s) =>
        s.playerDiscordUserId === playerDiscordUserId &&
        s.status === 'Active' &&
        (s.suspensionMatchesRemaining > 0 || s.sanctionType === 'Disciplinary Ban')
    );

    if (hasActiveSuspensionOrBan) {
      player.status = 'Suspended';
    } else if (player.status === 'Suspended') {
      player.status = player.inServer ? (player.currentClubId ? 'Active' : 'Free Agent') : 'Inactive';
    }
    return player;
  }

  private recomputeSanctionCompletionInternal(sanction: SanctionRecord): void {
    if (sanction.status === 'Removed') return;
    if (sanction.sanctionType === 'Disciplinary Ban') {
      sanction.status = 'Active';
      return;
    }
    const fineCleared =
      sanction.fineAmount <= 0 ||
      sanction.fineStatus === 'PAID' ||
      sanction.fineStatus === 'WAIVED';
    const suspensionCleared = sanction.suspensionMatchesRemaining <= 0;

    if (sanction.sanctionType === 'Official Warning') {
      sanction.status = fineCleared && suspensionCleared ? 'Completed' : 'Active';
      return;
    }

    sanction.status = fineCleared && suspensionCleared ? 'Completed' : 'Active';
  }

  private advanceSuspensionsForCompletedMatchInternal(
    state: TlcDatabaseState,
    fixture: Fixture,
    homeClubId: string,
    awayClubId: string
  ): void {
    const list = state.sanctions ?? [];
    if (list.length === 0) return;

    const playedIds = new Set((fixture.playerStats || []).map((ps) => ps.playerTlcId));

    for (const s of list) {
      if (s.status !== 'Active' || s.suspensionMatchesRemaining <= 0) continue;
      if (s.servedMatchIds.includes(fixture.id)) continue;

      const player = state.players.find((p) => p.discordUserId === s.playerDiscordUserId);
      if (player && playedIds.has(player.tlcId)) continue;

      const activeMem = (state.teamMemberships ?? []).find(
        (m) => m.discordUserId === s.playerDiscordUserId && m.status === 'Active'
      );
      const effectiveClubId = player?.currentClubId ?? activeMem?.clubId ?? s.clubId;
      if (!effectiveClubId || (effectiveClubId !== homeClubId && effectiveClubId !== awayClubId)) {
        continue;
      }

      const prevRem = s.suspensionMatchesRemaining;
      s.suspensionMatchesRemaining = Math.max(0, prevRem - 1);
      s.servedMatchIds.push(fixture.id);
      s.updatedAt = new Date().toISOString();
      s.updatedBy = 'Match Result Engine';

      this.addAudit(
        state,
        'Suspension Match Served',
        'Match Result Engine',
        `${s.playerName} (${s.referenceNumber})`,
        `${prevRem} match(es) remaining`,
        `${s.suspensionMatchesRemaining} match(es) remaining (Match #${fixture.matchNumber})`
      );

      if (s.suspensionMatchesRemaining === 0) {
        this.recomputeSanctionCompletionInternal(s);
        const syncedPlayer = this.syncPlayerDisciplinaryStatusInternal(state, s.playerDiscordUserId);
        const restoredStatus = syncedPlayer?.status || 'Active';

        this.addAudit(
          state,
          'Match Suspension Completed',
          'Match Result Engine',
          `${s.playerName} (${s.referenceNumber})`,
          'Suspended',
          `Eligible (${restoredStatus})`
        );

        this.addNotification(
          state,
          'Suspension Completed',
          s.playerDiscordUserId,
          s.playerName,
          `Suspension Completed · ${s.referenceNumber}`,
          `Your match suspension under sanction ${s.referenceNumber} is now completed after Match #${fixture.matchNumber}. Your status is now ${restoredStatus}.`,
          'DM'
        );

        this.completedSuspensionAlerts.push({
          discordUserId: s.playerDiscordUserId,
          playerName: s.playerName,
          referenceNumber: s.referenceNumber,
          restoredStatus,
          fixtureMatchNumber: fixture.matchNumber,
        });
      }
    }
  }

  public getPlayerDisciplinarySummary(discordUserIdOrTlcId: string) {
    const all = (this.state.sanctions ?? []).filter(
      (s) =>
        s.playerDiscordUserId === discordUserIdOrTlcId || s.playerTlcId === discordUserIdOrTlcId
    );
    const activeSanctions = all.filter((s) => s.status === 'Active');
    const unpaidFines = all.filter(
      (s) =>
        s.status !== 'Removed' &&
        s.fineAmount > 0 &&
        (s.fineStatus === 'UNPAID' || s.fineStatus === 'PARTIALLY PAID')
    );
    const unpaidFineTotal = unpaidFines.reduce(
      (sum, s) => sum + Math.max(0, Number((s.fineAmount - s.finePaidAmount).toFixed(2))),
      0
    );
    const suspendedMatchesRemaining = activeSanctions.reduce(
      (sum, s) => sum + s.suspensionMatchesRemaining,
      0
    );
    const hasDisciplinaryBan = activeSanctions.some((s) => s.sanctionType === 'Disciplinary Ban');
    return {
      allSanctions: all,
      activeSanctions,
      unpaidFines,
      unpaidFineTotal,
      suspendedMatchesRemaining,
      hasDisciplinaryBan,
      isSuspended: suspendedMatchesRemaining > 0 || hasDisciplinaryBan,
    };
  }

  public getActiveSanctionsList(): SanctionRecord[] {
    return (this.state.sanctions ?? []).filter(
      (s) =>
        s.status === 'Active' ||
        (s.status !== 'Removed' &&
          s.fineAmount > 0 &&
          (s.fineStatus === 'UNPAID' || s.fineStatus === 'PARTIALLY PAID')) ||
        (s.status !== 'Removed' && s.suspensionMatchesRemaining > 0)
    );
  }

  public issueSanction(input: {
    playerDiscordUserId: string;
    playerDiscordUsername: string;
    fallbackPlayerName: string;
    fallbackAvatarUrl?: string;
    sanctionType: SanctionType;
    reason: string;
    fineAmount: number;
    suspensionMatches: number;
    issuedByDiscordId: string;
    issuedByUsername: string;
    dedupeKey?: string;
  }): Promise<SanctionRecord> {
    return this.commitMutation((state) => {
      const cleanReason = input.reason.trim();
      if (!cleanReason) {
        throw new Error('A sanction reason is required.');
      }

      const fineAmount = Math.max(0, Number(input.fineAmount) || 0);
      const suspensionMatches = Math.max(0, Math.floor(Number(input.suspensionMatches) || 0));

      const fingerprint =
        input.dedupeKey ||
        `${input.issuedByDiscordId}:${input.playerDiscordUserId}:${input.sanctionType}:${cleanReason}:${fineAmount}:${suspensionMatches}`;
      const nowMs = Date.now();
      const prevTs = this.recentSanctionDedupes.get(fingerprint);
      if (prevTs && nowMs - prevTs < 15000) {
        throw new Error('Duplicate sanction submission blocked. This sanction was just issued.');
      }

      const player = state.players.find((p) => p.discordUserId === input.playerDiscordUserId);
      const activeMem = (state.teamMemberships ?? []).find(
        (m) => m.discordUserId === input.playerDiscordUserId && m.status === 'Active'
      );
      const effectiveClubId = player?.currentClubId ?? activeMem?.clubId ?? null;
      const club = effectiveClubId
        ? state.clubs.find((c) => c.clubId === effectiveClubId)
        : undefined;

      const currency = state.config.sanctions?.defaultCurrency?.trim() || 'TLC Coins';
      const now = new Date().toISOString();
      const ref = this.generateSanctionRef(state);

      const sanction: SanctionRecord = {
        id: `snc-${crypto.randomUUID().slice(0, 8)}`,
        referenceNumber: ref,
        playerTlcId: player?.tlcId || null,
        playerDiscordUserId: input.playerDiscordUserId,
        playerDiscordUsername: player?.discordUsername || input.playerDiscordUsername,
        playerName: player?.playerName || input.fallbackPlayerName || input.playerDiscordUsername,
        playerAvatarUrl:
          player?.robloxAvatarUrl ||
          input.fallbackAvatarUrl ||
          '/src/assets/images/tlc_league_crest_1795467599044.jpg',
        clubId: club?.clubId || null,
        clubName: club ? `${club.logoEmoji ? `${club.logoEmoji} ` : ''}${club.name}` : 'Free Agent',
        sanctionType: input.sanctionType,
        reason: cleanReason,
        fineAmount,
        finePaidAmount: 0,
        fineCurrency: currency,
        fineStatus: fineAmount > 0 ? 'UNPAID' : 'PAID',
        fineHistory: [],
        suspensionMatchesTotal: suspensionMatches,
        suspensionMatchesRemaining: suspensionMatches,
        servedMatchIds: [],
        status: 'Active',
        issuedByDiscordId: input.issuedByDiscordId,
        issuedByUsername: input.issuedByUsername,
        issuedAt: now,
      };

      const list = (state.sanctions ??= []);
      list.unshift(sanction);
      this.recentSanctionDedupes.set(fingerprint, nowMs);

      this.syncPlayerDisciplinaryStatusInternal(state, sanction.playerDiscordUserId);

      this.addAudit(
        state,
        'Sanction Issued',
        input.issuedByUsername,
        `${sanction.playerName} (${sanction.referenceNumber})`,
        'None',
        `${sanction.sanctionType} · Fine: ${fineAmount} ${currency} · Susp: ${suspensionMatches} match(es)`
      );

      this.addNotification(
        state,
        'Disciplinary Sanction',
        sanction.playerDiscordUserId,
        sanction.playerName,
        `TLC Sanction Notice · ${sanction.referenceNumber}`,
        `You received a ${sanction.sanctionType}: ${cleanReason}${
          fineAmount > 0 ? ` | Fine: ${fineAmount} ${currency}` : ''
        }${suspensionMatches > 0 ? ` | Suspension: ${suspensionMatches} match(es)` : ''}.`,
        'DM'
      );

      return sanction;
    });
  }

  public setSanctionAnnouncementMeta(
    sanctionId: string,
    channelId: string,
    messageId: string
  ): Promise<SanctionRecord> {
    return this.commitMutation((state) => {
      const s = (state.sanctions ?? []).find((x) => x.id === sanctionId);
      if (!s) throw new Error('Sanction not found.');
      s.announcementChannelId = channelId;
      s.announcementMessageId = messageId;
      return s;
    });
  }

  public editSanction(
    sanctionId: string,
    patch: {
      sanctionType?: SanctionType;
      reason?: string;
      fineAmount?: number;
      suspensionMatches?: number;
    },
    actorUsername: string,
    actorDiscordId: string
  ): Promise<SanctionRecord> {
    return this.commitMutation((state) => {
      const s = (state.sanctions ?? []).find((x) => x.id === sanctionId);
      if (!s) throw new Error('Sanction not found.');
      if (s.status === 'Removed') {
        throw new Error('Cancelled/removed sanctions are preserved in history and cannot be edited.');
      }
      if (s.playerDiscordUserId === actorDiscordId) {
        throw new Error('Players are prohibited from modifying their own sanctions.');
      }

      const prevSummary = `${s.sanctionType} · Fine: ${s.fineAmount} ${s.fineCurrency} (${s.fineStatus}) · Susp: ${s.suspensionMatchesRemaining}/${s.suspensionMatchesTotal} · Reason: ${s.reason}`;

      if (patch.sanctionType) s.sanctionType = patch.sanctionType;
      if (patch.reason !== undefined && patch.reason.trim()) {
        s.reason = patch.reason.trim();
      }
      if (patch.fineAmount !== undefined) {
        const nextFine = Math.max(0, Number(patch.fineAmount) || 0);
        s.fineAmount = nextFine;
        if (s.fineStatus !== 'WAIVED') {
          if (nextFine === 0) {
            s.finePaidAmount = 0;
            s.fineStatus = 'PAID';
          } else if (s.finePaidAmount >= nextFine) {
            s.fineStatus = 'PAID';
          } else if (s.finePaidAmount > 0) {
            s.fineStatus = 'PARTIALLY PAID';
          } else {
            s.fineStatus = 'UNPAID';
          }
        }
      }
      if (patch.suspensionMatches !== undefined) {
        const nextTotal = Math.max(0, Math.floor(Number(patch.suspensionMatches) || 0));
        const servedCount = s.servedMatchIds.length;
        s.suspensionMatchesTotal = nextTotal;
        s.suspensionMatchesRemaining = Math.max(0, nextTotal - servedCount);
      }

      s.updatedAt = new Date().toISOString();
      s.updatedBy = actorUsername;
      this.recomputeSanctionCompletionInternal(s);
      this.syncPlayerDisciplinaryStatusInternal(state, s.playerDiscordUserId);

      const nextSummary = `${s.sanctionType} · Fine: ${s.fineAmount} ${s.fineCurrency} (${s.fineStatus}) · Susp: ${s.suspensionMatchesRemaining}/${s.suspensionMatchesTotal} · Reason: ${s.reason}`;

      this.addAudit(
        state,
        'Sanction Modified',
        actorUsername,
        `${s.playerName} (${s.referenceNumber})`,
        prevSummary,
        nextSummary
      );

      this.addNotification(
        state,
        'Disciplinary Sanction',
        s.playerDiscordUserId,
        s.playerName,
        `Sanction Updated · ${s.referenceNumber}`,
        `Your sanction (${s.referenceNumber}) was updated by ${actorUsername}. Type: ${s.sanctionType} | Fine: ${s.fineAmount} ${s.fineCurrency} (${s.fineStatus}) | Remaining Suspension: ${s.suspensionMatchesRemaining} match(es).`,
        'DM'
      );

      return s;
    });
  }

  public removeSanction(
    sanctionId: string,
    reason: string,
    actorUsername: string,
    actorDiscordId: string
  ): Promise<SanctionRecord> {
    return this.commitMutation((state) => {
      const s = (state.sanctions ?? []).find((x) => x.id === sanctionId);
      if (!s) throw new Error('Sanction not found.');
      if (s.status === 'Removed') throw new Error('This sanction has already been removed.');
      if (s.playerDiscordUserId === actorDiscordId) {
        throw new Error('Players are prohibited from removing their own sanctions.');
      }

      const cleanReason = reason.trim();
      if (!cleanReason) throw new Error('A mandatory reason is required to remove a sanction.');

      const prevState = `${s.status} (${s.sanctionType} · Susp ${s.suspensionMatchesRemaining} · Fine ${s.fineAmount} ${s.fineCurrency} [${s.fineStatus}])`;
      const now = new Date().toISOString();
      s.status = 'Removed';
      s.suspensionMatchesRemaining = 0;
      if (s.fineStatus === 'UNPAID' || s.fineStatus === 'PARTIALLY PAID') {
        s.fineStatus = 'WAIVED';
        s.fineWaiverReason = `Sanction cancelled: ${cleanReason}`;
      }
      s.removedAt = now;
      s.removedBy = actorUsername;
      s.removalReason = cleanReason;
      s.updatedAt = now;
      s.updatedBy = actorUsername;

      this.syncPlayerDisciplinaryStatusInternal(state, s.playerDiscordUserId);

      this.addAudit(
        state,
        'Sanction Removed',
        actorUsername,
        `${s.playerName} (${s.referenceNumber})`,
        prevState,
        `Removed (History Preserved) — Reason: ${cleanReason}`
      );

      this.addNotification(
        state,
        'Disciplinary Sanction',
        s.playerDiscordUserId,
        s.playerName,
        `Sanction Cancelled · ${s.referenceNumber}`,
        `Sanction ${s.referenceNumber} has been cancelled/removed by ${actorUsername}. Reason: ${cleanReason}`,
        'DM'
      );

      return s;
    });
  }

  public updateSanctionFine(
    sanctionId: string,
    input: {
      action: 'record_payment' | 'mark_paid' | 'waive';
      amount?: number;
      note?: string;
    },
    actorUsername: string,
    actorDiscordId: string
  ): Promise<SanctionRecord> {
    return this.commitMutation((state) => {
      const s = (state.sanctions ?? []).find((x) => x.id === sanctionId);
      if (!s) throw new Error('Sanction not found.');
      if (s.status === 'Removed') throw new Error('Cannot update fine for a removed sanction.');
      if (s.playerDiscordUserId === actorDiscordId) {
        throw new Error('Players cannot modify their own fine status.');
      }
      if (s.fineAmount <= 0) {
        throw new Error('This sanction has no financial fine configured.');
      }

      const now = new Date().toISOString();
      const prevDesc = `${s.fineStatus} (Paid: ${s.finePaidAmount}/${s.fineAmount} ${s.fineCurrency})`;

      if (input.action === 'record_payment') {
        const payAmt = Number(input.amount);
        if (!Number.isFinite(payAmt) || payAmt <= 0) {
          throw new Error('Payment amount must be greater than 0.');
        }
        s.finePaidAmount = Number(Math.min(s.fineAmount, s.finePaidAmount + payAmt).toFixed(2));
        s.fineStatus = s.finePaidAmount >= s.fineAmount ? 'PAID' : 'PARTIALLY PAID';
        s.fineHistory.unshift({
          id: `pay-${crypto.randomUUID().slice(0, 8)}`,
          type: 'Payment',
          amount: payAmt,
          note: input.note?.trim() || 'Fine installment recorded',
          recordedBy: actorUsername,
          recordedAt: now,
        });
      } else if (input.action === 'mark_paid') {
        const remaining = Math.max(0, Number((s.fineAmount - s.finePaidAmount).toFixed(2)));
        s.finePaidAmount = s.fineAmount;
        s.fineStatus = 'PAID';
        s.fineHistory.unshift({
          id: `pay-${crypto.randomUUID().slice(0, 8)}`,
          type: 'Payment',
          amount: remaining,
          note: input.note?.trim() || 'Marked as fully paid by staff',
          recordedBy: actorUsername,
          recordedAt: now,
        });
      } else {
        const explanation = input.note?.trim() || '';
        if (!explanation) {
          throw new Error('A mandatory explanation is required to waive a fine.');
        }
        s.fineStatus = 'WAIVED';
        s.fineWaiverReason = explanation;
        s.fineHistory.unshift({
          id: `pay-${crypto.randomUUID().slice(0, 8)}`,
          type: 'Waiver',
          amount: Math.max(0, Number((s.fineAmount - s.finePaidAmount).toFixed(2))),
          note: explanation,
          recordedBy: actorUsername,
          recordedAt: now,
        });
      }

      s.updatedAt = now;
      s.updatedBy = actorUsername;
      this.recomputeSanctionCompletionInternal(s);

      const nextDesc = `${s.fineStatus} (Paid: ${s.finePaidAmount}/${s.fineAmount} ${s.fineCurrency})`;
      this.addAudit(
        state,
        `Fine ${input.action === 'waive' ? 'Waived' : 'Payment Updated'}`,
        actorUsername,
        `${s.playerName} (${s.referenceNumber})`,
        prevDesc,
        nextDesc
      );

      this.addNotification(
        state,
        'Disciplinary Sanction',
        s.playerDiscordUserId,
        s.playerName,
        `Fine Update · ${s.referenceNumber}`,
        `Fine status updated to ${s.fineStatus} (${s.finePaidAmount}/${s.fineAmount} ${s.fineCurrency}).`,
        'DM'
      );

      return s;
    });
  }

  public submitSanctionAppeal(input: {
    sanctionId: string;
    playerDiscordUserId: string;
    playerDiscordUsername: string;
    fallbackName: string;
    explanation: string;
  }): Promise<{ appeal: SanctionAppeal; sanction: SanctionRecord }> {
    return this.commitMutation((state) => {
      const sanction = (state.sanctions ?? []).find((s) => s.id === input.sanctionId);
      if (!sanction) throw new Error('Sanction not found.');
      if (sanction.playerDiscordUserId !== input.playerDiscordUserId) {
        throw new Error('You may only appeal sanctions issued to your own account.');
      }
      if (sanction.status === 'Removed') {
        throw new Error('This sanction has already been removed.');
      }

      const appeals = (state.sanctionAppeals ??= []);
      const existingPending = appeals.find(
        (a) => a.sanctionId === sanction.id && a.status === 'Pending'
      );
      if (existingPending) {
        throw new Error(`An appeal for sanction ${sanction.referenceNumber} is already pending review.`);
      }

      const cleanExplanation = input.explanation.trim();
      if (!cleanExplanation) {
        throw new Error('Please provide an explanation for your appeal.');
      }

      const appeal: SanctionAppeal = {
        id: `apl-${crypto.randomUUID().slice(0, 8)}`,
        sanctionId: sanction.id,
        sanctionReference: sanction.referenceNumber,
        playerTlcId: sanction.playerTlcId,
        playerDiscordUserId: input.playerDiscordUserId,
        playerDiscordUsername: input.playerDiscordUsername,
        playerName: sanction.playerName || input.fallbackName,
        explanation: cleanExplanation,
        status: 'Pending',
        submittedAt: new Date().toISOString(),
      };

      appeals.unshift(appeal);
      this.addAudit(
        state,
        'Sanction Appeal Submitted',
        input.playerDiscordUsername,
        `${sanction.playerName} (${sanction.referenceNumber})`,
        'No Appeal',
        `Appeal ${appeal.id} Pending Review`
      );
      return { appeal, sanction };
    });
  }

  public reviewSanctionAppeal(
    appealId: string,
    decision: 'accept' | 'reject',
    actorUsername: string,
    actorDiscordId: string,
    reasonOrNote?: string
  ): Promise<{ appeal: SanctionAppeal; sanction?: SanctionRecord }> {
    return this.commitMutation((state) => {
      const appeal = (state.sanctionAppeals ?? []).find((a) => a.id === appealId);
      if (!appeal) throw new Error('Sanction appeal not found.');
      if (appeal.status !== 'Pending') {
        throw new Error(`This appeal has already been ${appeal.status.toLowerCase()}.`);
      }
      if (appeal.playerDiscordUserId === actorDiscordId) {
        throw new Error('Players cannot review their own sanction appeals.');
      }

      const sanction = (state.sanctions ?? []).find((s) => s.id === appeal.sanctionId);
      const now = new Date().toISOString();
      appeal.reviewedAt = now;
      appeal.reviewedBy = actorUsername;

      if (decision === 'reject') {
        const cleanReason = reasonOrNote?.trim() || '';
        if (!cleanReason) throw new Error('A mandatory rejection reason must be provided.');
        appeal.status = 'Rejected';
        appeal.rejectionReason = cleanReason;

        this.addAudit(
          state,
          'Sanction Appeal Rejected',
          actorUsername,
          `${appeal.playerName} (${appeal.sanctionReference})`,
          'Pending',
          `Rejected: ${cleanReason}`
        );
        this.addNotification(
          state,
          'Disciplinary Appeal',
          appeal.playerDiscordUserId,
          appeal.playerName,
          `Sanction Appeal Rejected · ${appeal.sanctionReference}`,
          `❌ Your appeal for ${appeal.sanctionReference} was rejected.\n\nReason: ${cleanReason}`,
          'DM'
        );
        return { appeal, sanction };
      }

      appeal.status = 'Accepted';
      appeal.resolutionNote = reasonOrNote?.trim() || `Appeal accepted by ${actorUsername}`;

      this.addAudit(
        state,
        'Sanction Appeal Accepted',
        actorUsername,
        `${appeal.playerName} (${appeal.sanctionReference})`,
        'Pending',
        appeal.resolutionNote
      );
      this.addNotification(
        state,
        'Disciplinary Appeal',
        appeal.playerDiscordUserId,
        appeal.playerName,
        `Sanction Appeal Accepted · ${appeal.sanctionReference}`,
        `✅ Your appeal for ${appeal.sanctionReference} has been accepted by ${actorUsername}.`,
        'DM'
      );

      return { appeal, sanction };
    });
  }

  // ==================== UNIFIED TICKET & REGISTRATION SYSTEM (SECTION 18) ====================

  public getTicketSystemConfig(sourceState: TlcDatabaseState = this.state): TicketSystemConfig {
    const defaults = createDefaultTicketSystemConfig();
    const saved = sourceState.config.tickets;
    if (!saved) return defaults;
    const cats =
      Array.isArray(saved.categories) && saved.categories.length > 0
        ? [
            ...saved.categories,
            ...defaults.categories.filter(
              (def) => !saved.categories.some((c) => c.key === def.key)
            ),
          ].sort((a, b) => a.order - b.order)
        : defaults.categories;
    return {
      ...defaults,
      ...saved,
      categories: cats,
    };
  }

  public getActiveCoaches(): CoachProfile[] {
    return (this.state.coaches ?? []).filter((c) => c.status !== 'Deleted');
  }

  public getTickets(): UnifiedTicket[] {
    return this.state.tickets ?? [];
  }

  public getTicketById(ticketId: string): UnifiedTicket | undefined {
    return (this.state.tickets ?? []).find((t) => t.id === ticketId);
  }

  public getTicketByChannelId(channelId: string): UnifiedTicket | undefined {
    return (this.state.tickets ?? []).find((t) => t.channelId === channelId);
  }

  private ensureMutableTicketConfig(state: TlcDatabaseState): TicketSystemConfig {
    if (!state.config.tickets) {
      state.config.tickets = createDefaultTicketSystemConfig();
    }
    const defaults = createDefaultTicketSystemConfig();
    for (const defCat of defaults.categories) {
      if (!state.config.tickets.categories.some((c) => c.key === defCat.key)) {
        state.config.tickets.categories.push(structuredClone(defCat));
      }
    }
    state.config.tickets.categories.sort((a, b) => a.order - b.order);
    return state.config.tickets;
  }

  public updateTicketSystemSettings(
    patch: Partial<
      Pick<
        TicketSystemConfig,
        | 'namingPattern'
        | 'maxOpenTicketsPerUserPerCategory'
        | 'inactivityReminderHours'
        | 'escalationHours'
        | 'panelTitle'
        | 'panelDescription'
      >
    >,
    actor: string
  ): Promise<TicketSystemConfig> {
    return this.commitMutation((state) => {
      const cfg = this.ensureMutableTicketConfig(state);
      if (patch.namingPattern !== undefined) {
        const clean = patch.namingPattern.trim().slice(0, 60);
        if (!clean) throw new Error('Naming pattern cannot be empty.');
        cfg.namingPattern = clean;
      }
      if (patch.maxOpenTicketsPerUserPerCategory !== undefined) {
        const n = Math.floor(Number(patch.maxOpenTicketsPerUserPerCategory));
        if (!Number.isFinite(n) || n < 1 || n > 10) {
          throw new Error('Max open tickets per category must be between 1 and 10.');
        }
        cfg.maxOpenTicketsPerUserPerCategory = n;
      }
      if (patch.inactivityReminderHours !== undefined) {
        const n = Math.floor(Number(patch.inactivityReminderHours));
        if (!Number.isFinite(n) || n < 1 || n > 720) {
          throw new Error('Inactivity reminder hours must be between 1 and 720.');
        }
        cfg.inactivityReminderHours = n;
      }
      if (patch.escalationHours !== undefined) {
        const n = Math.floor(Number(patch.escalationHours));
        if (!Number.isFinite(n) || n < 1 || n > 720) {
          throw new Error('Escalation hours must be between 1 and 720.');
        }
        cfg.escalationHours = n;
      }
      if (patch.panelTitle !== undefined && patch.panelTitle.trim()) {
        cfg.panelTitle = patch.panelTitle.trim().slice(0, 120);
      }
      if (patch.panelDescription !== undefined && patch.panelDescription.trim()) {
        cfg.panelDescription = patch.panelDescription.trim().slice(0, 1000);
      }
      this.addAudit(
        state,
        'Ticket Settings Updated',
        actor,
        'Ticket System Configuration',
        'Previous settings',
        `Naming: ${cfg.namingPattern} · Max/cat: ${cfg.maxOpenTicketsPerUserPerCategory} · Escalation: ${cfg.escalationHours}h`
      );
      return cfg;
    });
  }

  public toggleTicketCategory(key: TicketCategoryKey, actor: string): Promise<TicketCategoryConfig> {
    return this.commitMutation((state) => {
      const cfg = this.ensureMutableTicketConfig(state);
      const cat = cfg.categories.find((c) => c.key === key);
      if (!cat) throw new Error('Ticket category not found.');
      cat.enabled = !cat.enabled;
      this.addAudit(
        state,
        'Ticket Category Toggled',
        actor,
        cat.label,
        cat.enabled ? 'Disabled' : 'Enabled',
        cat.enabled ? 'Enabled' : 'Disabled'
      );
      return cat;
    });
  }

  public updateTicketCategoryMeta(
    key: TicketCategoryKey,
    patch: { label?: string; emoji?: string; description?: string; requireEvidence?: boolean },
    actor: string
  ): Promise<TicketCategoryConfig> {
    return this.commitMutation((state) => {
      const cfg = this.ensureMutableTicketConfig(state);
      const cat = cfg.categories.find((c) => c.key === key);
      if (!cat) throw new Error('Ticket category not found.');
      const prev = `${cat.emoji} ${cat.label}`;
      if (patch.label !== undefined && patch.label.trim()) {
        cat.label = patch.label.trim().slice(0, 60);
      }
      if (patch.emoji !== undefined && patch.emoji.trim()) {
        cat.emoji = patch.emoji.trim().slice(0, 16);
      }
      if (patch.description !== undefined && patch.description.trim()) {
        cat.description = patch.description.trim().slice(0, 100);
      }
      if (patch.requireEvidence !== undefined) {
        cat.requireEvidence = patch.requireEvidence;
      }
      this.addAudit(
        state,
        'Ticket Category Customized',
        actor,
        key,
        prev,
        `${cat.emoji} ${cat.label}`
      );
      return cat;
    });
  }

  public moveTicketCategory(
    key: TicketCategoryKey,
    direction: 'up' | 'down',
    actor: string
  ): Promise<TicketCategoryConfig[]> {
    return this.commitMutation((state) => {
      const cfg = this.ensureMutableTicketConfig(state);
      cfg.categories.sort((a, b) => a.order - b.order);
      const idx = cfg.categories.findIndex((c) => c.key === key);
      if (idx === -1) throw new Error('Ticket category not found.');
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= cfg.categories.length) {
        return cfg.categories;
      }
      const temp = cfg.categories[idx];
      cfg.categories[idx] = cfg.categories[swapIdx];
      cfg.categories[swapIdx] = temp;
      cfg.categories.forEach((c, i) => {
        c.order = i + 1;
      });
      this.addAudit(
        state,
        'Ticket Categories Reordered',
        actor,
        temp.label,
        `Position ${idx + 1}`,
        `Position ${swapIdx + 1}`
      );
      return cfg.categories;
    });
  }

  public addTicketCategoryQuestion(
    key: TicketCategoryKey,
    question: Omit<TicketQuestionConfig, 'id'>,
    actor: string
  ): Promise<TicketCategoryConfig> {
    return this.commitMutation((state) => {
      const cfg = this.ensureMutableTicketConfig(state);
      const cat = cfg.categories.find((c) => c.key === key);
      if (!cat) throw new Error('Ticket category not found.');
      if (cat.questions.length >= 15) {
        throw new Error('Maximum of 15 custom questions per category reached.');
      }
      const label = question.label.trim().slice(0, 45);
      if (!label) throw new Error('Question label is required.');
      const created: TicketQuestionConfig = {
        id: `q_${crypto.randomUUID().slice(0, 8)}`,
        label,
        placeholder: question.placeholder?.trim().slice(0, 100) || undefined,
        type: question.type,
        required: question.required,
        options: question.options?.filter((o) => o.trim()).map((o) => o.trim().slice(0, 80)),
      };
      cat.questions.push(created);
      this.addAudit(state, 'Ticket Question Added', actor, cat.label, 'None', created.label);
      return cat;
    });
  }

  public editTicketCategoryQuestion(
    key: TicketCategoryKey,
    questionId: string,
    patch: Partial<Omit<TicketQuestionConfig, 'id'>>,
    actor: string
  ): Promise<TicketCategoryConfig> {
    return this.commitMutation((state) => {
      const cfg = this.ensureMutableTicketConfig(state);
      const cat = cfg.categories.find((c) => c.key === key);
      if (!cat) throw new Error('Ticket category not found.');
      const q = cat.questions.find((item) => item.id === questionId);
      if (!q) throw new Error('Question not found.');
      const prev = q.label;
      if (patch.label !== undefined && patch.label.trim()) q.label = patch.label.trim().slice(0, 45);
      if (patch.placeholder !== undefined) q.placeholder = patch.placeholder.trim().slice(0, 100);
      if (patch.type !== undefined) q.type = patch.type;
      if (patch.required !== undefined) q.required = patch.required;
      if (patch.options !== undefined) {
        q.options = patch.options.filter((o) => o.trim()).map((o) => o.trim().slice(0, 80));
      }
      this.addAudit(state, 'Ticket Question Edited', actor, cat.label, prev, q.label);
      return cat;
    });
  }

  public removeTicketCategoryQuestion(
    key: TicketCategoryKey,
    questionId: string,
    actor: string
  ): Promise<TicketCategoryConfig> {
    return this.commitMutation((state) => {
      const cfg = this.ensureMutableTicketConfig(state);
      const cat = cfg.categories.find((c) => c.key === key);
      if (!cat) throw new Error('Ticket category not found.');
      const idx = cat.questions.findIndex((item) => item.id === questionId);
      if (idx === -1) throw new Error('Question not found.');
      const [removed] = cat.questions.splice(idx, 1);
      this.addAudit(state, 'Ticket Question Removed', actor, cat.label, removed.label, 'Removed');
      return cat;
    });
  }

  public moveTicketCategoryQuestion(
    key: TicketCategoryKey,
    questionId: string,
    direction: 'up' | 'down',
    actor: string
  ): Promise<TicketCategoryConfig> {
    return this.commitMutation((state) => {
      const cfg = this.ensureMutableTicketConfig(state);
      const cat = cfg.categories.find((c) => c.key === key);
      if (!cat) throw new Error('Ticket category not found.');
      const idx = cat.questions.findIndex((item) => item.id === questionId);
      if (idx === -1) throw new Error('Question not found.');
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= cat.questions.length) return cat;
      const tmp = cat.questions[idx];
      cat.questions[idx] = cat.questions[swapIdx];
      cat.questions[swapIdx] = tmp;
      this.addAudit(
        state,
        'Ticket Questions Reordered',
        actor,
        cat.label,
        `Question ${idx + 1}`,
        `Question ${swapIdx + 1}`
      );
      return cat;
    });
  }

  public reserveTicketIdentifiers(isComplaint: boolean): Promise<{
    ticketNumber: string;
    seqNum: number;
    complaintId?: string;
  }> {
    return this.commitMutation((state) => {
      const { num, ref } = this.generateTicketSeq(state);
      const complaintId = isComplaint ? this.generateComplaintRef(state) : undefined;
      return { ticketNumber: ref, seqNum: num, complaintId };
    });
  }

  public checkUserCanOpenTicket(
    discordUserId: string,
    categoryKey: TicketCategoryKey,
    applicationSubType?: 'Player' | 'Coach' | 'Staff' | 'Team' | null
  ): { ok: true } | { ok: false; reason: string } {
    const cfg = this.getTicketSystemConfig(this.state);
    const cat = cfg.categories.find((c) => c.key === categoryKey);
    if (!cat || !cat.enabled) {
      return { ok: false, reason: 'This ticket category is currently disabled by administrators.' };
    }

    const activeStatuses: TicketStatus[] = ['Open', 'Claimed', 'Under Review', 'Waiting Info'];
    const openInCategory = (this.state.tickets ?? []).filter(
      (t) =>
        t.creatorDiscordId === discordUserId &&
        t.categoryKey === categoryKey &&
        activeStatuses.includes(t.status) &&
        (!applicationSubType || t.applicationSubType === applicationSubType)
    );
    const limit = Math.max(1, cfg.maxOpenTicketsPerUserPerCategory || 1);
    if (openInCategory.length >= limit) {
      const existing = openInCategory[0];
      return {
        ok: false,
        reason: `You already have ${openInCategory.length} open ticket(s) in **${cat.label}** (<#${existing.channelId}> · \`${existing.ticketNumber}\`). Please use your existing ticket or wait until it is closed.`,
      };
    }

    if (categoryKey === 'register' && applicationSubType === 'Player') {
      const existingPlayer = this.state.players.find(
        (p) => p.discordUserId === discordUserId && p.status !== 'Deleted'
      );
      if (existingPlayer) {
        return {
          ok: false,
          reason: `You already hold an active official TLC Player profile (\`${existingPlayer.tlcId}\`). Duplicate Player profiles are not permitted.`,
        };
      }
    }

    if (categoryKey === 'register' && applicationSubType === 'Coach') {
      const existingCoach = (this.state.coaches ?? []).find(
        (c) => c.discordUserId === discordUserId && c.status !== 'Deleted'
      );
      if (existingCoach) {
        return {
          ok: false,
          reason: `You already hold an active official TLC Coach profile (\`${existingCoach.tlcId}\`). Duplicate Coach profiles are not permitted.`,
        };
      }
    }

    return { ok: true };
  }

  public createUnifiedTicket(input: {
    id?: string;
    ticketNumber?: string;
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
    isAnonymous?: boolean;
    complaintCategory?: ComplaintCategory;
    staffDepartment?: StaffDepartment;
    targetDiscordId?: string;
    targetUsername?: string;
    targetDisplayName?: string;
    answers?: TicketAnswerEntry[];
    metadata?: Record<string, string>;
    evidence?: TicketEvidenceItem[];
  }): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const ticketSeq = input.ticketNumber
        ? input.ticketNumber
        : this.generateTicketSeq(state).ref;
      const isComplaint =
        input.categoryKey === 'player_complaint' || input.categoryKey === 'player_report';
      const complaintId =
        input.complaintId || (isComplaint ? this.generateComplaintRef(state) : undefined);

      const now = new Date().toISOString();
      const ticket: UnifiedTicket = {
        id: input.id || `tkt-${crypto.randomUUID().slice(0, 10)}`,
        ticketNumber: ticketSeq,
        complaintId,
        categoryKey: input.categoryKey,
        applicationSubType: input.applicationSubType ?? null,
        guildId: input.guildId,
        channelId: input.channelId,
        channelName: input.channelName,
        panelMessageId: input.panelMessageId,
        creatorDiscordId: input.creatorDiscordId,
        creatorUsername: input.creatorUsername,
        creatorAvatarUrl: input.creatorAvatarUrl,
        isAnonymous: Boolean(input.isAnonymous),
        complaintCategory: input.complaintCategory,
        staffDepartment: input.staffDepartment,
        targetDiscordId: input.targetDiscordId,
        targetUsername: input.targetUsername,
        targetDisplayName: input.targetDisplayName,
        priority: 'Normal',
        status: 'Open',
        participantDiscordIds: [input.creatorDiscordId],
        answers: input.answers || [],
        metadata: input.metadata || {},
        evidence: input.evidence || [],
        staffNotes: [],
        transcript: [],
        lastActivityAt: now,
        createdAt: now,
      };

      const tickets = (state.tickets ??= []);
      tickets.unshift(ticket);

      this.addAudit(
        state,
        'Ticket Opened',
        input.isAnonymous ? 'Anonymous User' : input.creatorUsername,
        `${ticket.ticketNumber} (${ticket.categoryKey}${ticket.applicationSubType ? `:${ticket.applicationSubType}` : ''})`,
        'None',
        `Channel #${ticket.channelName}`
      );

      return ticket;
    });
  }

  public setTicketPanelMessageId(ticketId: string, messageId: string): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      t.panelMessageId = messageId;
      return t;
    });
  }

  public claimTicket(
    ticketId: string,
    staffDiscordId: string,
    staffUsername: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      if (t.status === 'Closed') throw new Error('Cannot claim a closed ticket.');
      t.claimedByDiscordId = staffDiscordId;
      t.claimedByUsername = staffUsername;
      if (t.status === 'Open') t.status = 'Claimed';
      t.lastActivityAt = new Date().toISOString();
      this.addAudit(
        state,
        'Ticket Claimed',
        staffUsername,
        t.ticketNumber,
        'Unclaimed',
        `Claimed by @${staffUsername}`
      );
      return t;
    });
  }

  public unclaimTicket(ticketId: string, actorUsername: string): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      const prev = t.claimedByUsername || 'None';
      delete t.claimedByDiscordId;
      delete t.claimedByUsername;
      if (t.status === 'Claimed') t.status = 'Open';
      t.lastActivityAt = new Date().toISOString();
      this.addAudit(state, 'Ticket Unclaimed', actorUsername, t.ticketNumber, prev, 'Unclaimed');
      return t;
    });
  }

  public updateTicketStatusOrPriority(
    ticketId: string,
    patch: { status?: TicketStatus; priority?: TicketPriority },
    actorUsername: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      const prev = `${t.status} · ${t.priority}`;
      if (patch.status) t.status = patch.status;
      if (patch.priority) t.priority = patch.priority;
      t.lastActivityAt = new Date().toISOString();
      this.addAudit(
        state,
        'Ticket Updated',
        actorUsername,
        t.ticketNumber,
        prev,
        `${t.status} · ${t.priority}`
      );
      return t;
    });
  }

  public transferTicketDepartment(
    ticketId: string,
    nextCategoryKey: TicketCategoryKey,
    actorUsername: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      const prev = t.categoryKey;
      t.categoryKey = nextCategoryKey;
      t.lastActivityAt = new Date().toISOString();
      t.staffNotes.unshift({
        id: `note-${crypto.randomUUID().slice(0, 8)}`,
        authorDiscordId: 'system',
        authorUsername: actorUsername,
        content: `Transferred ticket category from ${prev} to ${nextCategoryKey}.`,
        createdAt: new Date().toISOString(),
      });
      this.addAudit(
        state,
        'Ticket Department Transferred',
        actorUsername,
        t.ticketNumber,
        prev,
        nextCategoryKey
      );
      return t;
    });
  }

  public addTicketParticipant(
    ticketId: string,
    discordUserId: string,
    actorUsername: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      if (t.targetDiscordId === discordUserId && (t.categoryKey === 'player_complaint' || t.categoryKey === 'player_report')) {
        throw new Error('The reported user cannot be added directly to a confidential complaint/report ticket.');
      }
      if (!t.participantDiscordIds.includes(discordUserId)) {
        t.participantDiscordIds.push(discordUserId);
      }
      t.lastActivityAt = new Date().toISOString();
      this.addAudit(
        state,
        'Ticket Member Added',
        actorUsername,
        t.ticketNumber,
        'Participants',
        `Added <@${discordUserId}>`
      );
      return t;
    });
  }

  public removeTicketParticipant(
    ticketId: string,
    discordUserId: string,
    actorUsername: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      if (t.creatorDiscordId === discordUserId) {
        throw new Error('The ticket creator cannot be removed while the ticket is active.');
      }
      t.participantDiscordIds = t.participantDiscordIds.filter((id) => id !== discordUserId);
      t.lastActivityAt = new Date().toISOString();
      this.addAudit(
        state,
        'Ticket Member Removed',
        actorUsername,
        t.ticketNumber,
        'Participants',
        `Removed <@${discordUserId}>`
      );
      return t;
    });
  }

  public updateTicketChannelName(
    ticketId: string,
    newChannelName: string,
    actorUsername: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      const prev = t.channelName;
      t.channelName = newChannelName;
      t.lastActivityAt = new Date().toISOString();
      this.addAudit(state, 'Ticket Renamed', actorUsername, t.ticketNumber, prev, newChannelName);
      return t;
    });
  }

  public addTicketStaffNote(
    ticketId: string,
    authorDiscordId: string,
    authorUsername: string,
    content: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      const clean = content.trim();
      if (!clean) throw new Error('Note content cannot be empty.');
      t.staffNotes.unshift({
        id: `note-${crypto.randomUUID().slice(0, 8)}`,
        authorDiscordId,
        authorUsername,
        content: clean,
        createdAt: new Date().toISOString(),
      });
      this.addAudit(
        state,
        'Ticket Staff Note Added',
        authorUsername,
        t.ticketNumber,
        'Internal Note',
        clean.slice(0, 120)
      );
      return t;
    });
  }

  public addTicketEvidenceItem(
    ticketId: string,
    item: TicketEvidenceItem,
    options?: { setAsAvatar?: boolean; setAsTeamLogo?: boolean }
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      t.evidence.push(item);
      if (options?.setAsAvatar && item.mediaAssetId) {
        t.metadata.avatarMediaId = item.mediaAssetId;
        t.metadata.avatarFilename = item.filename || 'avatar.png';
      }
      if (options?.setAsTeamLogo && item.mediaAssetId) {
        t.metadata.teamLogoMediaId = item.mediaAssetId;
        t.metadata.teamLogoFilename = item.filename || 'logo.png';
      }
      t.lastActivityAt = new Date().toISOString();
      return t;
    });
  }

  public appendTicketTranscriptMessage(
    ticketId: string,
    entry: TicketTranscriptEntry,
    isStaffReply: boolean
  ): Promise<void> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) return;
      if (t.transcript.some((m) => m.id === entry.id)) return;
      t.transcript.push(entry);
      if (t.transcript.length > 1000) {
        t.transcript = t.transcript.slice(-1000);
      }
      t.lastActivityAt = entry.timestamp;
      if (isStaffReply && !entry.isBot) {
        t.lastStaffReplyAt = entry.timestamp;
      }
    });
  }

  public approvePlayerRegistrationTicket(
    ticketId: string,
    actorDiscordId: string,
    actorUsername: string
  ): Promise<{ ticket: UnifiedTicket; player: PlayerProfile }> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      if (t.categoryKey !== 'register' || t.applicationSubType !== 'Player') {
        throw new Error('This ticket is not a Player Registration application.');
      }
      if (t.decision) {
        throw new Error(`This application has already been ${t.decision.toLowerCase()}.`);
      }

      const existingPlayer = state.players.find((p) => p.discordUserId === t.creatorDiscordId);
      if (existingPlayer && existingPlayer.status !== 'Deleted') {
        throw new Error(
          `Discord user already holds an active official Player profile (${existingPlayer.tlcId}).`
        );
      }

      const playerName = (t.metadata.fullName || t.creatorUsername).trim();
      const rawPos = (t.metadata.position || 'CM').toUpperCase() as PlayerPosition;
      const validPos: PlayerPosition = [
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
      ].includes(rawPos)
        ? rawPos
        : 'CM';

      const avatarUrl =
        t.metadata.avatarUrl?.trim() ||
        t.creatorAvatarUrl ||
        '/src/assets/images/tlc_league_crest_1795467599044.jpg';

      const now = new Date().toISOString();
      let player: PlayerProfile;
      if (existingPlayer && existingPlayer.status === 'Deleted') {
        existingPlayer.playerName = playerName;
        existingPlayer.robloxUsername = playerName;
        existingPlayer.robloxAvatarUrl = avatarUrl;
        existingPlayer.position = validPos;
        existingPlayer.status = 'Free Agent';
        existingPlayer.inServer = true;
        delete existingPlayer.deletedAt;
        delete existingPlayer.deletedBy;
        delete existingPlayer.deletionReason;
        player = existingPlayer;
      } else {
        const tlcId = this.generateTlcId(state);
        player = {
          tlcId,
          discordUserId: t.creatorDiscordId,
          discordUsername: t.creatorUsername,
          playerName,
          robloxUsername: playerName,
          robloxAvatarUrl: avatarUrl,
          position: validPos,
          currentClubId: null,
          registrationDate: now,
          status: 'Free Agent',
          matchesPlayed: 0,
          goals: 0,
          assists: 0,
          cleanSheets: 0,
          saves: 0,
          ratingSum: 0,
          ratingCount: 0,
          averageRating: 0,
          manOfTheMatchAwards: 0,
          trophies: 0,
          achievements: [],
          careerHistory: [],
          inServer: true,
        };
        state.players.unshift(player);
      }

      t.decision = 'Approved';
      t.status = 'Approved';
      t.decidedByDiscordId = actorDiscordId;
      t.decidedByUsername = actorUsername;
      t.decidedAt = now;
      t.createdProfileTlcId = player.tlcId;
      t.lastActivityAt = now;
      t.lastStaffReplyAt = now;

      this.addAudit(
        state,
        'Player Ticket Application Approved',
        actorUsername,
        `${player.playerName} (${player.tlcId})`,
        t.ticketNumber,
        `Official TLC Player (${player.position})`
      );

      this.addNotification(
        state,
        'Registration Approval',
        t.creatorDiscordId,
        player.playerName,
        `Player Registration Approved · ${t.ticketNumber}`,
        `Your official TLC Player Registration (${player.tlcId}) has been approved by ${actorUsername}.`,
        'DM'
      );

      return { ticket: t, player };
    });
  }

  public approveCoachRegistrationTicket(
    ticketId: string,
    actorDiscordId: string,
    actorUsername: string
  ): Promise<{ ticket: UnifiedTicket; coach: CoachProfile }> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      if (t.categoryKey !== 'register' || t.applicationSubType !== 'Coach') {
        throw new Error('This ticket is not a Coach Registration application.');
      }
      if (t.decision) {
        throw new Error(`This application has already been ${t.decision.toLowerCase()}.`);
      }

      const coaches = (state.coaches ??= []);
      const existingCoach = coaches.find((c) => c.discordUserId === t.creatorDiscordId);
      if (existingCoach && existingCoach.status !== 'Deleted') {
        throw new Error(
          `Discord user already holds an active official Coach profile (${existingCoach.tlcId}).`
        );
      }

      const coachName = (t.metadata.fullName || t.creatorUsername).trim();
      const coachingExperience = (t.metadata.coachingExperience || 'Not specified').trim();
      const previousTeams = t.metadata.previousTeams?.trim() || undefined;
      const additionalInfo = t.metadata.additionalInfo?.trim() || undefined;
      const avatarUrl =
        t.metadata.avatarUrl?.trim() ||
        t.creatorAvatarUrl ||
        '/src/assets/images/tlc_league_crest_1795467599044.jpg';

      const now = new Date().toISOString();
      let coach: CoachProfile;
      if (existingCoach && existingCoach.status === 'Deleted') {
        existingCoach.coachName = coachName;
        existingCoach.coachingExperience = coachingExperience;
        existingCoach.previousTeams = previousTeams;
        existingCoach.avatarUrl = avatarUrl;
        existingCoach.additionalInfo = additionalInfo;
        existingCoach.status = 'Free Agent';
        existingCoach.inServer = true;
        delete existingCoach.deletedAt;
        delete existingCoach.deletedBy;
        delete existingCoach.deletionReason;
        coach = existingCoach;
      } else {
        const tlcId = this.generateTlcId(state);
        coach = {
          tlcId,
          discordUserId: t.creatorDiscordId,
          discordUsername: t.creatorUsername,
          coachName,
          coachingExperience,
          previousTeams,
          avatarUrl,
          additionalInfo,
          currentClubId: null,
          registrationDate: now,
          status: 'Free Agent',
          matchesCoached: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          trophies: 0,
          careerHistory: [],
          inServer: true,
        };
        coaches.unshift(coach);
      }

      t.decision = 'Approved';
      t.status = 'Approved';
      t.decidedByDiscordId = actorDiscordId;
      t.decidedByUsername = actorUsername;
      t.decidedAt = now;
      t.createdProfileTlcId = coach.tlcId;
      t.lastActivityAt = now;
      t.lastStaffReplyAt = now;

      this.addAudit(
        state,
        'Coach Registration Approved',
        actorUsername,
        `${coach.coachName} (${coach.tlcId})`,
        t.ticketNumber,
        'Official TLC Coach Profile Created (Separate from Player Profiles)'
      );

      this.addNotification(
        state,
        'Coach Registration',
        t.creatorDiscordId,
        coach.coachName,
        `Coach Registration Approved · ${t.ticketNumber}`,
        `Your official TLC Coach profile (${coach.tlcId}) has been approved by ${actorUsername}.`,
        'DM'
      );

      return { ticket: t, coach };
    });
  }

  public acceptStaffApplicationTicket(
    ticketId: string,
    actorDiscordId: string,
    actorUsername: string,
    note?: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      if (t.categoryKey !== 'staff_application') {
        throw new Error('This ticket is not a Staff Application.');
      }
      if (t.decision) {
        throw new Error(`This staff application has already been ${t.decision.toLowerCase()}.`);
      }

      const now = new Date().toISOString();
      t.decision = 'Accepted';
      t.decisionReason = note?.trim() || 'Accepted by recruitment staff';
      t.status = 'Approved';
      t.decidedByDiscordId = actorDiscordId;
      t.decidedByUsername = actorUsername;
      t.decidedAt = now;
      t.lastActivityAt = now;
      t.lastStaffReplyAt = now;

      this.addAudit(
        state,
        'Staff Application Accepted',
        actorUsername,
        `${t.creatorUsername} (${t.ticketNumber})`,
        `Dept: ${t.staffDepartment || 'General'}`,
        'Accepted (Manual Discord staff role onboarding required; Administrator NOT auto-granted)'
      );

      this.addNotification(
        state,
        'Staff Application',
        t.creatorDiscordId,
        t.creatorUsername,
        `Staff Application Accepted · ${t.ticketNumber}`,
        `Congratulations! Your TLC Staff Application (${t.staffDepartment || 'Administration'}) was accepted by ${actorUsername}.`,
        'DM'
      );

      return t;
    });
  }

  public approveTeamCreationTicket(
    ticketId: string,
    actorDiscordId: string,
    actorUsername: string,
    overrides?: { discordRoleId?: string }
  ): Promise<{ ticket: UnifiedTicket; club: Club | null; pendingRoleLink: boolean }> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      if (t.categoryKey !== 'create_team') {
        throw new Error('This ticket is not a Team Creation application.');
      }
      if (t.decision) {
        throw new Error(`This application has already been ${t.decision.toLowerCase()}.`);
      }

      const teamName = (t.metadata.teamName || '').trim();
      if (!teamName) throw new Error('Proposed Team Name is missing on this ticket.');

      const activeClubs = state.clubs.filter((c) => c.status !== 'Deleted');
      if (activeClubs.some((c) => c.name.toLowerCase() === teamName.toLowerCase())) {
        throw new Error(`An active team named "${teamName}" already exists.`);
      }

      const discordRoleId = (overrides?.discordRoleId || t.metadata.teamRoleId || '').trim();
      const ownerDiscordUserId = (t.metadata.teamOwnerDiscordId || t.creatorDiscordId).trim();
      const ownerDiscordUsername = (t.metadata.teamOwnerUsername || t.creatorUsername).trim();
      const logoEmoji = (t.metadata.teamEmoji || '⚽').trim() || '⚽';
      const logoUrl =
        t.metadata.teamLogoUrl?.trim() || '/src/assets/images/tlc_league_crest_1795467599044.jpg';

      let createdClub: Club | null = null;
      let pendingRoleLink = true;

      if (discordRoleId) {
        if (activeClubs.some((c) => c.discordRoleId === discordRoleId)) {
          throw new Error('The selected Discord role is already linked to another active team.');
        }

        const words = teamName
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const shortCode =
          (words.length >= 2
            ? words
                .map((w) => w[0])
                .join('')
                .slice(0, 5)
            : teamName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4)
          ).toUpperCase() || 'TEAM';

        const clubId = this.generateClubId(state);
        const now = new Date().toISOString();
        const ownerMgr = state.managers.find(
          (m) => m.discordUserId === ownerDiscordUserId && m.status !== 'Deleted'
        );

        createdClub = {
          clubId,
          name: teamName,
          shortCode,
          logoUrl,
          logoEmoji,
          primaryColor: '#059669',
          discordRoleId,
          ownerDiscordUserId,
          ownerDiscordUsername,
          status: 'Active',
          currentManagerTlcId: ownerMgr && !ownerMgr.currentClubId ? ownerMgr.tlcId : null,
          registrationDate: now,
          matchesPlayed: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          trophies: 0,
          currentCompetitionIds: [],
          history: [
            {
              id: `ch-${crypto.randomUUID().slice(0, 6)}`,
              date: now.slice(0, 10),
              summary: `${logoEmoji} Official team created via Ticket ${t.ticketNumber} (Owner: @${ownerDiscordUsername}) approved by ${actorUsername}.`,
            },
          ],
        };

        if (ownerMgr && !ownerMgr.currentClubId) {
          ownerMgr.currentClubId = clubId;
          ownerMgr.status = 'Active';
          if (!ownerMgr.clubsManaged.includes(clubId)) ownerMgr.clubsManaged.push(clubId);
          ownerMgr.careerHistory.unshift({
            id: `mc-${crypto.randomUUID().slice(0, 6)}`,
            clubId,
            clubName: createdClub.name,
            role: 'Manager',
            startDate: now.slice(0, 10),
            notes: `Team owner approved via ${t.ticketNumber}`,
          });
        }

        state.clubs.push(createdClub);
        t.createdClubId = clubId;
        t.metadata.teamRoleId = discordRoleId;
        pendingRoleLink = false;
      }

      const now = new Date().toISOString();
      t.decision = 'Approved';
      t.status = 'Approved';
      t.decidedByDiscordId = actorDiscordId;
      t.decidedByUsername = actorUsername;
      t.decidedAt = now;
      t.lastActivityAt = now;
      t.lastStaffReplyAt = now;

      this.addAudit(
        state,
        'Team Creation Application Approved',
        actorUsername,
        `${teamName} (${t.ticketNumber})`,
        'Pending Review',
        createdClub ? `Created Club ${createdClub.clubId}` : 'Approved (Pending Existing Discord Role Link)'
      );

      this.addNotification(
        state,
        'Ticket Update',
        t.creatorDiscordId,
        t.creatorUsername,
        `Team Application Approved · ${t.ticketNumber}`,
        createdClub
          ? `Your team **${teamName}** (${createdClub.clubId}) has been officially created and registered!`
          : `Your team application for **${teamName}** was approved! An administrator will link your Discord role to finalize setup.`,
        'DM'
      );

      return { ticket: t, club: createdClub, pendingRoleLink };
    });
  }

  public rejectOrDismissTicket(
    ticketId: string,
    decision: 'Rejected' | 'Dismissed',
    reason: string,
    actorDiscordId: string,
    actorUsername: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      const cleanReason = reason.trim();
      if (!cleanReason) {
        throw new Error(`A mandatory ${decision.toLowerCase()} reason is required.`);
      }
      const now = new Date().toISOString();
      t.decision = decision;
      t.decisionReason = cleanReason;
      t.status = decision;
      t.decidedByDiscordId = actorDiscordId;
      t.decidedByUsername = actorUsername;
      t.decidedAt = now;
      t.lastActivityAt = now;
      t.lastStaffReplyAt = now;

      this.addAudit(
        state,
        `Ticket ${decision}`,
        actorUsername,
        `${t.ticketNumber} (${t.categoryKey})`,
        'Open/Pending',
        `${decision}: ${cleanReason}`
      );

      this.addNotification(
        state,
        t.complaintId ? 'Complaint Update' : 'Ticket Update',
        t.creatorDiscordId,
        t.isAnonymous ? 'Confidential Complainant' : t.creatorUsername,
        `${t.complaintId || t.ticketNumber} · ${decision}`,
        `Your ticket \`${t.ticketNumber}\` was **${decision}** by ${actorUsername}.\nReason: ${cleanReason}`,
        'DM'
      );

      return t;
    });
  }

  public resolveComplaintTicket(
    ticketId: string,
    resolutionNote: string,
    actorDiscordId: string,
    actorUsername: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      const cleanNote = resolutionNote.trim() || 'Resolved by administration staff.';
      const now = new Date().toISOString();
      t.decision = 'Resolved';
      t.decisionReason = cleanNote;
      t.status = 'Resolved';
      t.decidedByDiscordId = actorDiscordId;
      t.decidedByUsername = actorUsername;
      t.decidedAt = now;
      t.lastActivityAt = now;
      t.lastStaffReplyAt = now;

      this.addAudit(
        state,
        'Complaint Resolved',
        actorUsername,
        `${t.complaintId || t.ticketNumber}`,
        'Under Review',
        `Resolved: ${cleanNote}`
      );

      this.addNotification(
        state,
        'Complaint Update',
        t.creatorDiscordId,
        t.isAnonymous ? 'Confidential Complainant' : t.creatorUsername,
        `${t.complaintId || t.ticketNumber} · Resolved`,
        `Your ticket \`${t.complaintId || t.ticketNumber}\` has been marked **Resolved** by ${actorUsername}.\nSummary: ${cleanNote}`,
        'DM'
      );

      return t;
    });
  }

  public closeTicket(
    ticketId: string,
    actorDiscordId: string,
    actorUsername: string,
    transcriptEntries?: TicketTranscriptEntry[]
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      if (t.status === 'Closed') throw new Error('Ticket is already closed.');

      if (transcriptEntries && transcriptEntries.length > 0) {
        const seen = new Set(t.transcript.map((e) => e.id));
        for (const entry of transcriptEntries) {
          if (!seen.has(entry.id)) {
            t.transcript.push(entry);
            seen.add(entry.id);
          }
        }
        t.transcript.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }

      const now = new Date().toISOString();
      t.status = 'Closed';
      t.closedAt = now;
      t.closedByDiscordId = actorDiscordId;
      t.closedByUsername = actorUsername;
      t.lastActivityAt = now;

      this.addAudit(
        state,
        'Ticket Closed',
        actorUsername,
        `${t.ticketNumber} (${t.categoryKey})`,
        'Open',
        `Closed with ${t.transcript.length} transcript message(s)`
      );

      return t;
    });
  }

  public reopenTicket(
    ticketId: string,
    actorDiscordId: string,
    actorUsername: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      const now = new Date().toISOString();
      t.status = 'Open';
      delete t.closedAt;
      delete t.closedByDiscordId;
      delete t.closedByUsername;
      t.lastActivityAt = now;

      this.addAudit(
        state,
        'Ticket Reopened',
        actorUsername,
        t.ticketNumber,
        'Closed',
        `Reopened by @${actorUsername} (${actorDiscordId})`
      );

      return t;
    });
  }

  public markTicketChannelDeleted(ticketId: string, actorUsername: string): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      const now = new Date().toISOString();
      t.channelDeletedAt = now;
      if (t.status !== 'Closed') {
        t.status = 'Closed';
        t.closedAt = t.closedAt || now;
        t.closedByUsername = t.closedByUsername || actorUsername;
      }
      this.addAudit(
        state,
        'Ticket Channel Deleted (Record Preserved)',
        actorUsername,
        t.ticketNumber,
        `Channel #${t.channelName}`,
        'Channel deleted; full transcript & records preserved in PostgreSQL'
      );
      return t;
    });
  }

  public submitTicketFeedback(
    ticketId: string,
    userDiscordId: string,
    rating: number,
    comment?: string
  ): Promise<UnifiedTicket> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) throw new Error('Ticket not found.');
      if (t.creatorDiscordId !== userDiscordId) {
        throw new Error('Only the ticket creator can submit staff evaluation feedback.');
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5 stars.');
      }
      t.feedbackRating = rating;
      if (comment?.trim()) t.feedbackComment = comment.trim().slice(0, 1000);
      this.addAudit(
        state,
        'Ticket Feedback Submitted',
        t.isAnonymous ? 'Anonymous User' : t.creatorUsername,
        t.ticketNumber,
        'Unrated',
        `${rating}/5 stars`
      );
      return t;
    });
  }

  public markTicketAlertSent(
    ticketId: string,
    kind: 'reminder' | 'escalation'
  ): Promise<void> {
    return this.commitMutation((state) => {
      const t = (state.tickets ?? []).find((x) => x.id === ticketId);
      if (!t) return;
      const now = new Date().toISOString();
      if (kind === 'reminder') {
        t.lastReminderAt = now;
      } else {
        t.escalatedAt = now;
      }
    });
  }

  public getTicketStatistics(): TicketStatistics {
    const all = this.state.tickets ?? [];
    const activeStatuses: TicketStatus[] = ['Open', 'Claimed', 'Under Review', 'Waiting Info'];
    const pendingStatuses: TicketStatus[] = ['Open', 'Under Review', 'Waiting Info'];

    const openTickets = all.filter((t) => activeStatuses.includes(t.status)).length;
    const closedTickets = all.filter(
      (t) =>
        t.status === 'Closed' ||
        t.status === 'Approved' ||
        t.status === 'Rejected' ||
        t.status === 'Resolved' ||
        t.status === 'Dismissed'
    ).length;
    const pendingReviewTickets = all.filter((t) => pendingStatuses.includes(t.status)).length;

    const resolutionDurationsMin: number[] = [];
    for (const t of all) {
      const endTs = t.decidedAt || t.closedAt;
      if (!endTs) continue;
      const diffMs = new Date(endTs).getTime() - new Date(t.createdAt).getTime();
      if (Number.isFinite(diffMs) && diffMs >= 0) {
        resolutionDurationsMin.push(diffMs / 60000);
      }
    }
    const averageResolutionMinutes =
      resolutionDurationsMin.length > 0
        ? Math.round(
            resolutionDurationsMin.reduce((a, b) => a + b, 0) / resolutionDurationsMin.length
          )
        : 0;

    const staffMap = new Map<string, { username: string; discordId: string; actionsCount: number }>();
    const bumpStaff = (discordId?: string, username?: string) => {
      if (!discordId || !username || discordId === 'system') return;
      const existing = staffMap.get(discordId);
      if (existing) {
        existing.actionsCount += 1;
      } else {
        staffMap.set(discordId, { discordId, username, actionsCount: 1 });
      }
    };
    for (const t of all) {
      bumpStaff(t.claimedByDiscordId, t.claimedByUsername);
      bumpStaff(t.decidedByDiscordId, t.decidedByUsername);
      bumpStaff(t.closedByDiscordId, t.closedByUsername);
    }
    const mostActiveStaff = Array.from(staffMap.values())
      .sort((a, b) => b.actionsCount - a.actionsCount)
      .slice(0, 5);

    const catCountMap = new Map<TicketCategoryKey, number>();
    for (const t of all) {
      catCountMap.set(t.categoryKey, (catCountMap.get(t.categoryKey) || 0) + 1);
    }
    const ticketsPerCategory = Array.from(catCountMap.entries())
      .map(([categoryKey, count]) => ({ categoryKey, count }))
      .sort((a, b) => b.count - a.count);

    const playerApps = all.filter(
      (t) => t.categoryKey === 'register' && t.applicationSubType === 'Player'
    );
    const coachApps = all.filter(
      (t) => t.categoryKey === 'register' && t.applicationSubType === 'Coach'
    );
    const staffApps = all.filter((t) => t.categoryKey === 'staff_application');
    const teamApps = all.filter((t) => t.categoryKey === 'create_team');
    const allApps = [...playerApps, ...coachApps, ...staffApps, ...teamApps];
    const approvedApplications = allApps.filter(
      (t) => t.decision === 'Approved' || t.decision === 'Accepted'
    ).length;
    const rejectedApplications = allApps.filter((t) => t.decision === 'Rejected').length;

    const complaints = all.filter(
      (t) => t.categoryKey === 'player_complaint' || t.categoryKey === 'player_report'
    );
    const resolvedComplaints = complaints.filter(
      (t) => t.decision === 'Resolved' || t.decision === 'Dismissed' || t.status === 'Closed'
    ).length;
    const pendingComplaints = complaints.length - resolvedComplaints;

    return {
      totalTickets: all.length,
      openTickets,
      closedTickets,
      pendingReviewTickets,
      averageResolutionMinutes,
      mostActiveStaff,
      ticketsPerCategory,
      totalPlayerApplications: playerApps.length,
      totalCoachApplications: coachApps.length,
      totalStaffApplications: staffApps.length,
      totalTeamApplications: teamApps.length,
      approvedApplications,
      rejectedApplications,
      totalComplaints: complaints.length,
      resolvedComplaints,
      pendingComplaints,
    };
  }

  // ==================== CONFIG ====================

  public updateConfig(patch: Partial<BotConfig>, actor: string): Promise<BotConfig> {
    return this.commitMutation((state) => {
      const defaultTickets = createDefaultTicketSystemConfig();
      state.config = {
        channels: { ...state.config.channels, ...(patch.channels || {}) },
        roles: { ...state.config.roles, ...(patch.roles || {}) },
        transferWindow: { ...state.config.transferWindow, ...(patch.transferWindow || {}) },
        competitions: { ...state.config.competitions, ...(patch.competitions || {}) },
        notifications: { ...state.config.notifications, ...(patch.notifications || {}) },
        sanctions: {
          defaultCurrency:
            patch.sanctions?.defaultCurrency ??
            state.config.sanctions?.defaultCurrency ??
            'TLC Coins',
        },
        tickets: {
          ...defaultTickets,
          ...(state.config.tickets || {}),
          ...(patch.tickets || {}),
        },
      };
      this.addAudit(
        state,
        'Bot Configuration Updated',
        actor,
        'System Configuration',
        'Previous Config',
        'Updated Config'
      );
      return state.config;
    });
  }
}

export const tlcStore = new TlcStore();


