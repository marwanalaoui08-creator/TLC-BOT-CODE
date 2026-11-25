import {
  BotConfig,
  Competition,
  PlayerMatchStat,
  PlayerPosition,
  TlcDatabaseState,
  TransferType,
} from '../shared/types.ts';

export interface TlcApiState extends TlcDatabaseState {
  standingsByCompetition: Record<
    string,
    {
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
    }[]
  >;
  botStatus: {
    tokenConfigured: boolean;
    connected: boolean;
    botTag: string | null;
    guildCount: number;
    lastError?: string | null;
    commandsDeployedCount?: number;
  };
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const tlcApi = {
  getState: () => request<TlcApiState>('/api/state'),

  submitRegistration: (body: {
    discordUserId: string;
    discordUsername: string;
    playerName: string;
    robloxUsername: string;
    robloxAvatarUrl?: string;
    registrationType: 'Player' | 'Manager';
    position?: PlayerPosition;
  }) => request('/api/registrations', { method: 'POST', body: JSON.stringify(body) }),

  editRegistration: (id: string, body: Record<string, unknown>) =>
    request(`/api/registrations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  approveRegistration: (id: string, actor = 'TLC Staff') =>
    request(`/api/registrations/${id}/approve`, { method: 'POST', body: JSON.stringify({ actor }) }),

  rejectRegistration: (id: string, reason: string, allowResubmit: boolean, actor = 'TLC Staff') =>
    request(`/api/registrations/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason, allowResubmit, actor }),
    }),

  submitCorrection: (body: Record<string, unknown>) =>
    request('/api/corrections', { method: 'POST', body: JSON.stringify(body) }),

  reviewCorrection: (id: string, decision: 'approve' | 'reject', actor = 'TLC Staff') =>
    request(`/api/corrections/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, actor }),
    }),

  editPlayer: (tlcId: string, body: Record<string, unknown>) =>
    request(`/api/players/${tlcId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  editManager: (tlcId: string, body: Record<string, unknown>) =>
    request(`/api/managers/${tlcId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteProfile: (tlcId: string, actor = 'TLC Staff') =>
    request(`/api/profiles/${tlcId}`, { method: 'DELETE', body: JSON.stringify({ actor }) }),

  simulateLeave: (discordUserId: string) =>
    request(`/api/members/${discordUserId}/leave`, { method: 'POST' }),

  simulateRejoin: (discordUserId: string) =>
    request(`/api/members/${discordUserId}/rejoin`, { method: 'POST' }),

  createClub: (body: Record<string, unknown>) =>
    request('/api/clubs', { method: 'POST', body: JSON.stringify(body) }),

  editClub: (clubId: string, body: Record<string, unknown>) =>
    request(`/api/clubs/${clubId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  setClubManager: (clubId: string, managerTlcId: string | null, actor = 'TLC Staff') =>
    request(`/api/clubs/${clubId}/manager`, {
      method: 'POST',
      body: JSON.stringify({ managerTlcId, actor }),
    }),

  submitTransferOffer: (body: {
    playerTlcId: string;
    toClubId: string;
    managerTlcId: string;
    transferType: TransferType;
    details?: string;
    actor?: string;
  }) => request('/api/transfers/offer', { method: 'POST', body: JSON.stringify(body) }),

  respondTransferOffer: (id: string, decision: 'accept' | 'decline', actor = 'Player') =>
    request(`/api/transfers/offers/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ decision, actor }),
    }),

  reviewTransferOffer: (id: string, decision: 'approve' | 'reject' | 'cancel', actor = 'TLC Staff') =>
    request(`/api/transfers/offers/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, actor }),
    }),

  directTransfer: (body: {
    playerTlcId: string;
    toClubId: string | null;
    transferType: TransferType;
    details?: string;
    actor?: string;
  }) => request('/api/transfers/direct', { method: 'POST', body: JSON.stringify(body) }),

  createContract: (body: Record<string, unknown>) =>
    request('/api/contracts', { method: 'POST', body: JSON.stringify(body) }),

  contractAction: (id: string, action: 'renew' | 'terminate', newExpirationDate?: string) =>
    request(`/api/contracts/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, newExpirationDate, actor: 'TLC Staff' }),
    }),

  checkContractExpirations: () =>
    request<{ expiringCount: number; expiredCount: number }>('/api/contracts/check-expirations', {
      method: 'POST',
      body: JSON.stringify({ actor: 'TLC Staff' }),
    }),

  createCompetition: (body: Partial<Competition> & Record<string, unknown>) =>
    request('/api/competitions', { method: 'POST', body: JSON.stringify(body) }),

  registerTeamForCompetition: (compId: string, body: Record<string, unknown>) =>
    request(`/api/competitions/${compId}/register-team`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  reviewCompetitionRegistration: (id: string, decision: 'approve' | 'reject') =>
    request(`/api/competition-registrations/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, actor: 'TLC Staff' }),
    }),

  generateFixtures: (compId: string) =>
    request(`/api/competitions/${compId}/generate-fixtures`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'TLC Staff' }),
    }),

  createFixture: (body: Record<string, unknown>) =>
    request('/api/fixtures', { method: 'POST', body: JSON.stringify(body) }),

  editFixture: (id: string, body: Record<string, unknown>) =>
    request(`/api/fixtures/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  submitResult: (
    fixtureId: string,
    body: {
      homeScore: number;
      awayScore: number;
      notes?: string;
      playerStats?: PlayerMatchStat[];
      autoApprove?: boolean;
      actor?: string;
    }
  ) => request(`/api/fixtures/${fixtureId}/result`, { method: 'POST', body: JSON.stringify(body) }),

  approveResult: (fixtureId: string) =>
    request(`/api/fixtures/${fixtureId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'TLC Staff' }),
    }),

  editMatchStats: (fixtureId: string, playerStats: PlayerMatchStat[]) =>
    request(`/api/fixtures/${fixtureId}/stats`, {
      method: 'PATCH',
      body: JSON.stringify({ playerStats, actor: 'TLC Staff' }),
    }),

  rateMatchPlayer: (
    fixtureId: string,
    body: {
      playerTlcId: string;
      rating: number;
      goals?: number;
      assists?: number;
      saves?: number;
      cleanSheet?: boolean;
      manOfTheMatch?: boolean;
      actor?: string;
    }
  ) =>
    request(`/api/fixtures/${fixtureId}/rate-player`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  grantAward: (body: Record<string, unknown>) =>
    request('/api/awards', { method: 'POST', body: JSON.stringify(body) }),

  getLeaderboard: (category: string, competitionId?: string) =>
    request<
      {
        rank: number;
        tlcId: string;
        name: string;
        position?: string;
        clubName: string;
        primaryValue: number;
        secondaryLabel: string;
      }[]
    >(
      `/api/leaderboards?category=${encodeURIComponent(category)}&competitionId=${encodeURIComponent(
        competitionId || 'all'
      )}`
    ),

  updateConfig: (patch: Partial<BotConfig>) =>
    request<BotConfig>('/api/config', { method: 'PATCH', body: JSON.stringify(patch) }),

  setBotPower: (action: 'online' | 'offline' | 'deploy-commands') =>
    request<{ ok: boolean; message: string; botStatus: TlcApiState['botStatus'] }>(
      '/api/bot/power',
      {
        method: 'POST',
        body: JSON.stringify({ action }),
      }
    ),
};
