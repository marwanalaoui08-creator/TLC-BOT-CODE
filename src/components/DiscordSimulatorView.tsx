import { useState } from 'react';
import { Hash, Send, Terminal } from 'lucide-react';
import { PLAYER_POSITIONS, PlayerPosition, RegistrationType } from '../shared/types.ts';
import { TlcApiState, tlcApi } from '../lib/api.ts';
import { ClubBadge } from './ClubBadge.tsx';

interface DiscordSimulatorViewProps {
  state: TlcApiState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

type SimChannel =
  | 'verify-yourself'
  | 'registration-requests'
  | 'team-signings'
  | 'transfer-market'
  | 'fixtures'
  | 'match-ratings'
  | 'results'
  | 'tlc-audit-logs';

type SimSlashCmd =
  | '/register'
  | '/sign-player'
  | '/player'
  | '/manager'
  | '/club'
  | '/table'
  | '/free-agents'
  | '/leaderboard'
  | '/sign'
  | '/fixtures'
  | '/rate'
  | '/ratings';

const CONTRACT_TERM_PRESETS = [
  { label: '1 Season (60d)', value: '1 Season (60d) · First Team' },
  { label: '2 Seasons (120d)', value: '2 Seasons (120d) · Key Player' },
  { label: 'Short-Term Loan (30d)', value: '30d Loan · Squad Rotation' },
  { label: 'Trial Contract (14d)', value: '14d Trial · Reserve Squad' },
];

export function DiscordSimulatorView({
  state,
  onRefresh,
  onNotify,
}: DiscordSimulatorViewProps) {
  const [channel, setChannel] = useState<SimChannel>('verify-yourself');
  const [slashCmd, setSlashCmd] = useState<SimSlashCmd>('/player');
  const [slashArg, setSlashArg] = useState('Kieran Silva');
  const [slashResult, setSlashResult] = useState<{ title: string; subtitle: string; lines: string[] } | null>(null);

  // Verify Modal State
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [regType, setRegType] = useState<RegistrationType>('Player');
  const [position, setPosition] = useState<PlayerPosition>('CM');
  const [playerName, setPlayerName] = useState('');
  const [robloxUsername, setRobloxUsername] = useState('');
  const [robloxAvatarUrl, setRobloxAvatarUrl] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');
  const [discordUserId, setDiscordUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reject Reason Modal
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // #team-signings & /sign-player Flow State
  const [signPlayerFilter, setSignPlayerFilter] = useState<'free-agents' | 'all'>('free-agents');
  const [signSearchQuery, setSignSearchQuery] = useState('');
  const [signSearchPos, setSignSearchPos] = useState<string>('ALL');
  const [signPlayerId, setSignPlayerId] = useState(
    () =>
      state.players.find((p) => !p.currentClubId)?.tlcId ||
      state.players[0]?.tlcId ||
      ''
  );
  const [signClubId, setSignClubId] = useState(() => state.clubs[0]?.clubId || '');
  const [signManagerId, setSignManagerId] = useState(() => state.managers[0]?.tlcId || '');
  const [signType, setSignType] = useState<'Signing' | 'Permanent Transfer' | 'Loan'>('Signing');
  const [signTermPreset, setSignTermPreset] = useState(CONTRACT_TERM_PRESETS[0].value);
  const [signCustomNote, setSignCustomNote] = useState('');
  const [signBusy, setSignBusy] = useState(false);
  const [botPowerBusy, setBotPowerBusy] = useState(false);
  const [lastApprovedAnnouncement, setLastApprovedAnnouncement] = useState<{
    playerName: string;
    clubName: string;
    roleId: string;
  } | null>(null);

  // #fixtures Quick Action State
  const [showQuickFixtureForm, setShowQuickFixtureForm] = useState(false);
  const [newFixCompId, setNewFixCompId] = useState(() => state.competitions[0]?.id || '');
  const [newFixHomeId, setNewFixHomeId] = useState(() => state.clubs[0]?.clubId || '');
  const [newFixAwayId, setNewFixAwayId] = useState(() => state.clubs[1]?.clubId || state.clubs[0]?.clubId || '');
  const [newFixRound, setNewFixRound] = useState('Matchweek 4');
  const [newFixDate, setNewFixDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newFixTime, setNewFixTime] = useState('20:00 UTC');
  const [newFixReferee, setNewFixReferee] = useState('TLC Match Official');
  const [refereeDraftByFix, setRefereeDraftByFix] = useState<Record<string, string>>({});
  const [scoreDraftByFix, setScoreDraftByFix] = useState<
    Record<string, { home: string; away: string; open: boolean }>
  >({});

  // #match-ratings /rate Form State
  const [rateFixtureId, setRateFixtureId] = useState(
    () => state.fixtures.find((f) => f.status === 'Completed')?.id || state.fixtures[0]?.id || ''
  );
  const [ratePlayerId, setRatePlayerId] = useState(() => state.players[0]?.tlcId || '');
  const [rateScore, setRateScore] = useState(7.5);
  const [rateGoals, setRateGoals] = useState(0);
  const [rateAssists, setRateAssists] = useState(0);
  const [rateSaves, setRateSaves] = useState(0);
  const [rateCleanSheet, setRateCleanSheet] = useState(false);
  const [rateMotm, setRateMotm] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const autoDiscordId = discordUserId.trim() || `881${Date.now().toString().slice(-15)}`;
      await tlcApi.submitRegistration({
        discordUserId: autoDiscordId,
        discordUsername: discordUsername.trim() || playerName.toLowerCase().replace(/\s+/g, '_'),
        playerName,
        robloxUsername,
        robloxAvatarUrl: robloxAvatarUrl.trim() || undefined,
        registrationType: regType,
        position: regType === 'Player' ? position : undefined,
      });
      setShowVerifyModal(false);
      setPlayerName('');
      setRobloxUsername('');
      setRobloxAvatarUrl('');
      setDiscordUsername('');
      setDiscordUserId('');
      await onRefresh();
      setChannel('registration-requests');
      onNotify('Registration submitted to #registration-requests for staff review.');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSubmitting(false);
    }
  };

  const signCandidatePool =
    signPlayerFilter === 'free-agents'
      ? state.players.filter((p) => !p.currentClubId)
      : state.players;
  const signQueryLower = signSearchQuery.trim().toLowerCase();
  const filteredSignMatches = signCandidatePool.filter((p) => {
    if (signSearchPos !== 'ALL' && p.position !== signSearchPos) return false;
    if (
      signQueryLower &&
      !p.playerName.toLowerCase().includes(signQueryLower) &&
      !p.tlcId.toLowerCase().includes(signQueryLower)
    ) {
      return false;
    }
    return true;
  });
  const selectedSignPlayer =
    filteredSignMatches.find((p) => p.tlcId === signPlayerId) || filteredSignMatches[0];

  const handleTeamSignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPlayerId = selectedSignPlayer?.tlcId || '';
    if (!targetPlayerId || !signClubId || !signManagerId) {
      onNotify('Select a player, destination club, and manager first.', true);
      return;
    }
    setSignBusy(true);
    try {
      const details = signCustomNote.trim()
        ? `${signTermPreset} — ${signCustomNote.trim()}`
        : signTermPreset;
      await tlcApi.submitTransferOffer({
        playerTlcId: targetPlayerId,
        toClubId: signClubId,
        managerTlcId: signManagerId,
        transferType: signType,
        details,
        actor: state.managers.find((m) => m.tlcId === signManagerId)?.managerName || 'Club Manager',
      });
      setSignCustomNote('');
      await onRefresh();
      onNotify('Team Sign contract offer posted to #team-signings.');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSignBusy(false);
    }
  };

  const handleQuickCreateFixture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFixCompId || !newFixHomeId || !newFixAwayId || newFixHomeId === newFixAwayId) {
      onNotify('Select a competition and two distinct clubs.', true);
      return;
    }
    try {
      await tlcApi.createFixture({
        competitionId: newFixCompId,
        homeClubId: newFixHomeId,
        awayClubId: newFixAwayId,
        roundLabel: newFixRound.trim() || 'Matchweek',
        matchDate: newFixDate,
        matchTime: newFixTime.trim() || '20:00 UTC',
        referee: newFixReferee.trim() || 'TBD',
      });
      setShowQuickFixtureForm(false);
      await onRefresh();
      onNotify('Official fixture scheduled in #fixtures.');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleRatePlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateFixtureId || !ratePlayerId) {
      onNotify('Select both a fixture and a verified player.', true);
      return;
    }
    setRateBusy(true);
    try {
      await tlcApi.rateMatchPlayer(rateFixtureId, {
        playerTlcId: ratePlayerId,
        rating: rateScore,
        goals: rateGoals,
        assists: rateAssists,
        saves: rateSaves,
        cleanSheet: rateCleanSheet,
        manOfTheMatch: rateMotm,
        actor: 'TLC Match Official',
      });
      await onRefresh();
      onNotify('Player match rating saved and career average recalculated.');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setRateBusy(false);
    }
  };

  const handleRunSlashCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = slashArg.trim().toLowerCase();

    if (slashCmd === '/register') {
      setChannel('verify-yourself');
      setShowVerifyModal(true);
      setSlashResult({
        title: '/register — Official TLC Verification Flow',
        subtitle: 'Opened Player/Manager Registration Form',
        lines: [
          '1. Select Player or Manager (Positions shown only for Players).',
          '2. Submit official TLC Name, Roblox Username, and Avatar URL.',
          '3. Submission routes to #registration-requests for Staff Approval.',
        ],
      });
    } else if (slashCmd === '/player') {
      const p = state.players.find(
        (x) => x.playerName.toLowerCase().includes(q) || x.tlcId.toLowerCase() === q
      );
      if (!p) {
        setSlashResult({
          title: '/player — Not Found',
          subtitle: `Query: "${slashArg}"`,
          lines: ['No verified player matched that name or TLC ID.'],
        });
        return;
      }
      const club = state.clubs.find((c) => c.clubId === p.currentClubId)?.name || 'Free Agent';
      setSlashResult({
        title: `${p.playerName} (${p.tlcId})`,
        subtitle: `${p.position} · ${club} · ${p.status}`,
        lines: [
          `Discord: @${p.discordUsername} · Roblox: ${p.robloxUsername}`,
          `Matches: ${p.matchesPlayed} · Goals: ${p.goals} · Assists: ${p.assists} · Clean Sheets: ${p.cleanSheets} · Saves: ${p.saves}`,
          `Avg Rating: ${p.averageRating.toFixed(2)} · MOTM: ${p.manOfTheMatchAwards} · Trophies: ${p.trophies}`,
        ],
      });
    } else if (slashCmd === '/manager') {
      const m = state.managers.find(
        (x) => x.managerName.toLowerCase().includes(q) || x.tlcId.toLowerCase() === q
      );
      if (!m) {
        setSlashResult({
          title: '/manager — Not Found',
          subtitle: `Query: "${slashArg}"`,
          lines: ['No verified manager matched that name or TLC ID.'],
        });
        return;
      }
      const club = state.clubs.find((c) => c.clubId === m.currentClubId)?.name || 'Free Agent';
      setSlashResult({
        title: `${m.managerName} (${m.tlcId})`,
        subtitle: `Manager · ${club} · ${m.status}`,
        lines: [
          `Discord: @${m.discordUsername} · Roblox: ${m.robloxUsername}`,
          `Matches Managed: ${m.matchesManaged} · Record: ${m.wins}W-${m.draws}D-${m.losses}L · Win Rate: ${m.winRate}%`,
          `Clubs Managed: ${m.clubsManaged.length} · Trophies: ${m.trophies}`,
        ],
      });
    } else if (slashCmd === '/club') {
      const c = state.clubs.find(
        (x) => x.name.toLowerCase().includes(q) || x.clubId.toLowerCase() === q
      );
      if (!c) {
        setSlashResult({
          title: '/club — Not Found',
          subtitle: `Query: "${slashArg}"`,
          lines: ['No club matched that name or ID.'],
        });
        return;
      }
      const mgr = state.managers.find((m) => m.tlcId === c.currentManagerTlcId)?.managerName || 'Vacant';
      const rosterCount = state.players.filter((p) => p.currentClubId === c.clubId).length;
      setSlashResult({
        title: `${c.name} (${c.shortCode}) · ${c.clubId}`,
        subtitle: `Manager: ${mgr} · Squad: ${rosterCount} players`,
        lines: [
          `Played: ${c.matchesPlayed} · W: ${c.wins} · D: ${c.draws} · L: ${c.losses}`,
          `Goals For: ${c.goalsFor} · Goals Against: ${c.goalsAgainst} · Trophies: ${c.trophies}`,
        ],
      });
    } else if (slashCmd === '/table') {
      const comp =
        state.competitions.find((c) => c.name.toLowerCase().includes(q)) || state.competitions[0];
      if (!comp) return;
      const rows = state.standingsByCompetition[comp.id] || [];
      setSlashResult({
        title: `${comp.name} — Standings`,
        subtitle: `${comp.season} · ${comp.type}`,
        lines: rows.map(
          (r) =>
            `#${r.position} ${r.clubName} — P:${r.played} W:${r.won} D:${r.drawn} L:${r.lost} GD:${r.goalDifference >= 0 ? `+${r.goalDifference}` : r.goalDifference} Pts:${r.points}`
        ),
      });
    } else if (slashCmd === '/free-agents') {
      const fa = state.players.filter((p) => !p.currentClubId && p.status === 'Free Agent');
      setSlashResult({
        title: `TLC Free Agent Market (${fa.length})`,
        subtitle: 'Available verified players without a club',
        lines: fa.map(
          (p) => `${p.tlcId} · ${p.playerName} (${p.position}) — ${p.matchesPlayed} GP, ${p.goals}G ${p.assists}A`
        ),
      });
    } else if (slashCmd === '/leaderboard') {
      const top = [...state.players].sort((a, b) => b.goals - a.goals).slice(0, 5);
      setSlashResult({
        title: 'TLC Top Scorers Leaderboard',
        subtitle: 'All-time official competition goals',
        lines: top.map((p, idx) => `#${idx + 1} ${p.playerName} (${p.position}) — ${p.goals} Goals`),
      });
    } else if (slashCmd === '/sign' || slashCmd === '/sign-player') {
      setChannel('team-signings');
      setSignPlayerFilter('free-agents');
      setSignSearchQuery(slashArg.trim());
      setSignSearchPos('ALL');
      const freeAgents = state.players.filter((p) => {
        if (p.currentClubId || p.status !== 'Free Agent') return false;
        if (q && !p.playerName.toLowerCase().includes(q) && !p.tlcId.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      });
      if (freeAgents[0]) {
        setSignPlayerId(freeAgents[0].tlcId);
      }
      const pendingSignings = state.transferOffers.filter(
        (o) => o.status === 'Pending Player' || o.status === 'Pending Staff'
      );
      setSlashResult({
        title: `${slashCmd} — Free Agent Search & Formal Signing Flow`,
        subtitle: `Switched to #team-signings · ${freeAgents.length} Matching Free Agents · ${pendingSignings.length} Active Offers`,
        lines: [
          '1. Search & select an available Free Agent in #team-signings below.',
          '2. Send a Formal Signing Offer -> Player Accepts -> Staff Approves.',
          '3. Upon approval: Club Roster updates, Club Role assigns, and #transfer-market announces publicly.',
          ...freeAgents
            .slice(0, 4)
            .map(
              (p) =>
                `Free Agent: ${p.playerName} (${p.position} · ${p.tlcId}) — Avg ${p.averageRating.toFixed(2)}`
            ),
        ],
      });
    } else if (slashCmd === '/fixtures') {
      setChannel('fixtures');
      const upcoming = state.fixtures.filter(
        (f) =>
          f.status !== 'Completed' &&
          (!q ||
            f.competitionName.toLowerCase().includes(q) ||
            f.roundLabel.toLowerCase().includes(q) ||
            (state.clubs.find((c) => c.clubId === f.homeClubId)?.name.toLowerCase().includes(q) ?? false) ||
            (state.clubs.find((c) => c.clubId === f.awayClubId)?.name.toLowerCase().includes(q) ?? false))
      );
      setSlashResult({
        title: `/fixture — Schedule Feed (${upcoming.length})`,
        subtitle: 'Switched to #fixtures · Official TLC Match Calendar',
        lines:
          upcoming.length > 0
            ? upcoming.slice(0, 6).map((f) => {
                const h = state.clubs.find((c) => c.clubId === f.homeClubId)?.shortCode || f.homeClubId;
                const a = state.clubs.find((c) => c.clubId === f.awayClubId)?.shortCode || f.awayClubId;
                return `#${f.matchNumber} ${h} vs ${a} · ${f.roundLabel} · ${f.matchDate} ${f.matchTime} · Ref: ${f.referee || 'TBD'} · ${f.status}`;
              })
            : ['No upcoming fixtures matched that filter. Create one in #fixtures below.'],
      });
    } else if (slashCmd === '/rate') {
      setChannel('match-ratings');
      const targetFix =
        state.fixtures.find((f) => String(f.matchNumber) === q || f.id.toLowerCase() === q) ||
        state.fixtures.find((f) => f.status === 'Completed') ||
        state.fixtures[0];
      if (targetFix) {
        setRateFixtureId(targetFix.id);
      }
      setSlashResult({
        title: '/rate — Matchday Rating Sheet Ready',
        subtitle: 'Switched to #match-ratings · Scale 1.0–10.0',
        lines: [
          targetFix
            ? `Loaded Match #${targetFix.matchNumber} (${targetFix.competitionName} · ${targetFix.roundLabel}) in the #match-ratings grader.`
            : 'Select a fixture in #match-ratings to grade player ratings.',
          'All ratings immediately recalculate official career Average Rating and MOTM counts.',
        ],
      });
    } else if (slashCmd === '/ratings') {
      setChannel('match-ratings');
      const filtered = [...state.players]
        .filter((p) => !q || p.position.toLowerCase() === q || p.playerName.toLowerCase().includes(q))
        .sort((a, b) => b.averageRating - a.averageRating)
        .slice(0, 6);
      setSlashResult({
        title: `/ratings — Player Rating Standings${q ? ` (${slashArg})` : ''}`,
        subtitle: 'Ranked by official Average Match Rating (1.0–10.0)',
        lines: filtered.map(
          (p, i) =>
            `#${i + 1} ${p.playerName} (${p.position}) · Avg ${p.averageRating.toFixed(2)} · MOTM: ${p.manOfTheMatchAwards} · ${p.matchesPlayed} GP`
        ),
      });
    }
  };

  const pendingRegistrations = state.registrations.filter((r) => r.status === 'Pending');
  const pendingTransfers = state.transferOffers.filter(
    (o) => o.status === 'Pending Player' || o.status === 'Pending Staff'
  );
  const upcomingFixtures = state.fixtures.filter((f) => f.status !== 'Completed');
  const completedResults = state.fixtures.filter((f) => f.status === 'Completed');

  const activeRateFixture = state.fixtures.find((f) => f.id === rateFixtureId) || state.fixtures[0];
  const recordedRatingsFeed = state.fixtures
    .filter((f) => (f.playerStats?.length ?? 0) > 0)
    .flatMap((f) => {
      const home = state.clubs.find((c) => c.clubId === f.homeClubId)?.shortCode || 'HOM';
      const away = state.clubs.find((c) => c.clubId === f.awayClubId)?.shortCode || 'AWY';
      return (f.playerStats ?? []).map((st) => ({
        fixtureId: f.id,
        matchLabel: `#${f.matchNumber} ${home} ${f.homeScore ?? '-'}–${f.awayScore ?? '-'} ${away}`,
        competitionName: f.competitionName,
        ...st,
      }));
    })
    .slice(0, 12);
  const topRatedPlayers = [...state.players]
    .sort((a, b) => b.averageRating - a.averageRating)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Verified Players</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {state.players.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {state.players.filter((p) => !p.currentClubId).length} Free Agents
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Verified Managers</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {state.managers.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {state.clubs.length} Official Clubs
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Pending Reviews</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-600">
            {pendingRegistrations.length + state.transferOffers.filter((o) => o.status === 'Pending Staff').length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {pendingRegistrations.length} Reg · {state.transferOffers.filter((o) => o.status === 'Pending Staff').length} Signings
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Transfer Window</div>
          <div
            className={`mt-1 text-2xl font-bold font-mono ${
              state.config.transferWindow.isOpen ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {state.config.transferWindow.isOpen ? 'OPEN' : 'CLOSED'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Ends {state.config.transferWindow.deadline}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Competitions</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {state.competitions.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {state.fixtures.filter((f) => f.status === 'Scheduled').length} Upcoming Matches
          </div>
        </div>
      </div>

      {/* Interactive Discord Server Preview & Slash Command Runner */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Discord Channel Sidebar */}
        <div className="lg:col-span-3 bg-slate-900 text-slate-300 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
              <ClubBadge
                src="/src/assets/images/tlc_league_crest_1795467599044.jpg"
                name="Touchline League"
                size="md"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">Touchline Official</div>
                <div className="text-xs text-slate-400">Discord Bot Channels</div>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              {(
                [
                  { id: 'verify-yourself', label: 'verify-yourself', count: 0 },
                  { id: 'registration-requests', label: 'registration-requests', count: pendingRegistrations.length },
                  { id: 'team-signings', label: 'team-signings', count: pendingTransfers.length },
                  { id: 'transfer-market', label: 'transfer-market', count: 0 },
                  { id: 'fixtures', label: 'fixtures', count: upcomingFixtures.length },
                  { id: 'match-ratings', label: 'match-ratings', count: recordedRatingsFeed.length },
                  { id: 'results', label: 'results', count: 0 },
                  { id: 'tlc-audit-logs', label: 'tlc-audit-logs', count: 0 },
                ] as const
              ).map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setChannel(ch.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    channel === ch.id
                      ? 'bg-slate-800 text-white font-medium'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Hash className="w-4 h-4 shrink-0 text-slate-500" />
                    <span className="truncate">{ch.label}</span>
                  </span>
                  {ch.count > 0 && (
                    <span className="font-mono tabular-nums text-xs text-amber-400 font-semibold">
                      {ch.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-200">Discord.js Gateway</span>
              <span
                className={`font-mono font-semibold ${
                  state.botStatus.connected ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {state.botStatus.connected ? 'ONLINE' : 'SIMULATOR'}
              </span>
            </div>
            <div>
              {state.botStatus.connected
                ? `Connected as ${state.botStatus.botTag} (${state.botStatus.guildCount} guild${
                    state.botStatus.guildCount === 1 ? '' : 's'
                  })`
                : state.botStatus.tokenConfigured
                ? state.botStatus.lastError || 'Token detected — click Turn Bot Online to connect.'
                : 'Add DISCORD_BOT_TOKEN in Secrets to connect live Discord, then click Turn Bot Online.'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {!state.botStatus.connected ? (
                <button
                  type="button"
                  disabled={botPowerBusy}
                  onClick={async () => {
                    setBotPowerBusy(true);
                    try {
                      const res = await tlcApi.setBotPower('online');
                      await onRefresh();
                      onNotify(res.message || 'Discord bot is now online.');
                    } catch (err: any) {
                      onNotify(err.message, true);
                    } finally {
                      setBotPowerBusy(false);
                    }
                  }}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md disabled:opacity-50"
                >
                  {botPowerBusy ? 'Connecting...' : 'Turn Bot Online'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={botPowerBusy}
                    onClick={async () => {
                      setBotPowerBusy(true);
                      try {
                        const res = await tlcApi.setBotPower('deploy-commands');
                        await onRefresh();
                        onNotify(res.message);
                      } catch (err: any) {
                        onNotify(err.message, true);
                      } finally {
                        setBotPowerBusy(false);
                      }
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-medium rounded-md"
                  >
                    Sync Commands
                  </button>
                  <button
                    type="button"
                    disabled={botPowerBusy}
                    onClick={async () => {
                      setBotPowerBusy(true);
                      try {
                        const res = await tlcApi.setBotPower('offline');
                        await onRefresh();
                        onNotify(res.message);
                      } catch (err: any) {
                        onNotify(err.message, true);
                      } finally {
                        setBotPowerBusy(false);
                      }
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-md"
                  >
                    Go Offline
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Discord Channel Viewport */}
        <div className="lg:col-span-9 flex flex-col bg-slate-950 text-slate-100 min-h-[580px]">
          {/* Channel Header & Slash Command Executor */}
          <div className="px-5 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Hash className="w-4 h-4 text-slate-400" />
              <span>{channel}</span>
            </div>

            <form onSubmit={handleRunSlashCommand} className="flex items-center gap-2">
              <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                <span className="pl-2.5 text-slate-400">
                  <Terminal className="w-3.5 h-3.5" />
                </span>
                <select
                  value={slashCmd}
                  onChange={(e) => {
                    const next = e.target.value as SimSlashCmd;
                    setSlashCmd(next);
                    if (next === '/player') setSlashArg('Kieran Silva');
                    else if (next === '/manager') setSlashArg('Marcus Vance');
                    else if (next === '/club') setSlashArg('Northstar');
                    else if (next === '/table') setSlashArg('Premier');
                    else if (next === '/rate') setSlashArg('1');
                    else setSlashArg('');
                  }}
                  className="bg-transparent text-xs font-mono text-emerald-400 px-2 py-1.5 focus:outline-none"
                >
                  <option value="/register" className="bg-slate-900">/register</option>
                  <option value="/sign-player" className="bg-slate-900">/sign-player</option>
                  <option value="/player" className="bg-slate-900">/player</option>
                  <option value="/manager" className="bg-slate-900">/manager</option>
                  <option value="/club" className="bg-slate-900">/club</option>
                  <option value="/table" className="bg-slate-900">/table</option>
                  <option value="/free-agents" className="bg-slate-900">/free-agents</option>
                  <option value="/leaderboard" className="bg-slate-900">/leaderboard</option>
                  <option value="/sign" className="bg-slate-900">/sign</option>
                  <option value="/fixtures" className="bg-slate-900">/fixtures</option>
                  <option value="/rate" className="bg-slate-900">/rate</option>
                  <option value="/ratings" className="bg-slate-900">/ratings</option>
                </select>
                {(slashCmd === '/sign-player' ||
                  slashCmd === '/player' ||
                  slashCmd === '/manager' ||
                  slashCmd === '/club' ||
                  slashCmd === '/table' ||
                  slashCmd === '/fixtures' ||
                  slashCmd === '/rate' ||
                  slashCmd === '/ratings') && (
                  <input
                    type="text"
                    value={slashArg}
                    onChange={(e) => setSlashArg(e.target.value)}
                    placeholder={
                      slashCmd === '/sign-player'
                        ? 'Search player (opt)'
                        : slashCmd === '/rate'
                        ? 'Match #'
                        : slashCmd === '/ratings'
                        ? 'Position (opt)'
                        : 'Query...'
                    }
                    className="bg-transparent text-xs text-slate-200 px-2 py-1.5 w-32 border-l border-slate-700 focus:outline-none"
                  />
                )}
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                Run Command
              </button>
            </form>
          </div>

          {/* Slash Command Output Banner */}
          {slashResult && (
            <div className="mx-5 mt-4 p-4 rounded-lg bg-slate-900 border border-emerald-500/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-emerald-400">{slashResult.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{slashResult.subtitle}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSlashResult(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
              <div className="mt-2.5 space-y-1 text-xs font-mono text-slate-200">
                {slashResult.lines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          )}

          {/* Channel Message Feed */}
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {channel === 'verify-yourself' && (
              <div className="space-y-4">
                <div className="max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                    <span className="font-semibold text-emerald-400">TLC Bot</span>
                    <span>·</span>
                    <span>Permanent Verification Message</span>
                  </div>
                  <h3 className="text-base font-bold text-white">
                    Touchline (TLC) — Official Registration & Verification
                  </h3>
                  <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                    Every verified player and manager receives a permanent TLC ID (e.g.{' '}
                    <span className="font-mono text-emerald-400">TLC-00001</span>), official career
                    profile, club eligibility, and verified server access.
                  </p>
                  <div className="mt-4 text-xs text-slate-400 space-y-1">
                    <div>· Players select a position (GK, CB, LB, RB, CDM, CM, CAM, LW, RW, ST).</div>
                    <div>· Managers register without a player position.</div>
                    <div>· One official TLC profile per Discord User ID.</div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowVerifyModal(true)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('team-signings')}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      Team Sign (/sign)
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('fixtures')}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      Fixtures (/fixture)
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('match-ratings')}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      Match Ratings (/rate)
                    </button>
                  </div>
                </div>

                {/* Integrated Post-Registration Hub: Team Sign · Fixtures · Ratings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-emerald-400">
                        Team Sign Ready ({state.players.filter((p) => !p.currentClubId).length})
                      </div>
                      <div className="mt-2 space-y-1.5 text-xs">
                        {state.players
                          .filter((p) => !p.currentClubId)
                          .slice(0, 3)
                          .map((fa) => (
                            <div key={fa.tlcId} className="flex items-center justify-between gap-2">
                              <span className="text-slate-200 truncate">
                                {fa.playerName} <span className="font-mono text-slate-400">({fa.position})</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSignPlayerFilter('free-agents');
                                  setSignPlayerId(fa.tlcId);
                                  setChannel('team-signings');
                                }}
                                className="text-emerald-400 hover:underline shrink-0 font-medium"
                              >
                                Sign
                              </button>
                            </div>
                          ))}
                        {state.players.filter((p) => !p.currentClubId).length === 0 && (
                          <div className="text-slate-500">No unsigned Free Agents right now.</div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChannel('team-signings')}
                      className="text-left text-xs text-slate-400 hover:text-white"
                    >
                      Open #team-signings →
                    </button>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-emerald-400">
                        Upcoming Fixtures ({upcomingFixtures.length})
                      </div>
                      <div className="mt-2 space-y-1.5 text-xs">
                        {upcomingFixtures.slice(0, 2).map((fix) => {
                          const h = state.clubs.find((c) => c.clubId === fix.homeClubId)?.shortCode || 'HOM';
                          const a = state.clubs.find((c) => c.clubId === fix.awayClubId)?.shortCode || 'AWY';
                          return (
                            <div key={fix.id} className="text-slate-200 font-mono tabular-nums">
                              #{fix.matchNumber} {h} vs {a} · <span className="text-slate-400">{fix.matchDate}</span>
                            </div>
                          );
                        })}
                        {upcomingFixtures.length === 0 && (
                          <div className="text-slate-500">All scheduled fixtures completed.</div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChannel('fixtures')}
                      className="text-left text-xs text-slate-400 hover:text-white"
                    >
                      Manage in #fixtures →
                    </button>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-emerald-400">
                        Top Match Ratings (/ratings)
                      </div>
                      <div className="mt-2 space-y-1.5 text-xs">
                        {topRatedPlayers.slice(0, 3).map((p) => (
                          <div key={p.tlcId} className="flex items-center justify-between gap-2">
                            <span className="text-slate-200 truncate">
                              {p.playerName} <span className="font-mono text-slate-400">({p.position})</span>
                            </span>
                            <span className="font-mono tabular-nums font-bold text-emerald-400">
                              {p.averageRating.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChannel('match-ratings')}
                      className="text-left text-xs text-slate-400 hover:text-white"
                    >
                      Grade in #match-ratings →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {channel === 'registration-requests' && (
              <div className="space-y-4">
                {state.registrations.slice(0, 8).map((req) => (
                  <div
                    key={req.id}
                    className="max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span>
                        <strong className="text-emerald-400">TLC Bot</strong> · Registration Review
                      </span>
                      <span className="font-mono tabular-nums">{req.submittedAt.slice(0, 10)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ClubBadge src={req.robloxAvatarUrl} name={req.playerName} size="md" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {req.playerName}
                          {req.tlcId ? ` (${req.tlcId})` : ''}
                        </div>
                        <div className="text-xs text-slate-400">
                          @{req.discordUsername} · ID <span className="font-mono">{req.discordUserId}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-slate-500">Roblox Username</div>
                        <div className="text-slate-200 font-medium">{req.robloxUsername}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Type</div>
                        <div className="text-slate-200 font-medium">{req.registrationType}</div>
                      </div>
                      {req.registrationType === 'Player' && req.position && (
                        <div>
                          <div className="text-slate-500">Position</div>
                          <div className="text-emerald-400 font-mono font-semibold">{req.position}</div>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                      <span
                        className={`text-xs font-medium ${
                          req.status === 'Approved'
                            ? 'text-emerald-400'
                            : req.status === 'Rejected'
                            ? 'text-red-400'
                            : 'text-amber-400'
                        }`}
                      >
                        Status: {req.status}
                        {req.rejectionReason ? ` — ${req.rejectionReason}` : ''}
                      </span>

                      {req.status === 'Pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await tlcApi.approveRegistration(req.id);
                                await onRefresh();
                                onNotify(`Approved ${req.playerName} and generated permanent TLC ID.`);
                              } catch (err: any) {
                                onNotify(err.message, true);
                              }
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTargetId(req.id);
                              setRejectReason('');
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-md transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}

                      {req.status === 'Approved' && req.registrationType === 'Player' && req.tlcId && (
                        <button
                          type="button"
                          onClick={() => {
                            setSignPlayerFilter('all');
                            setSignPlayerId(req.tlcId!);
                            setChannel('team-signings');
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-medium rounded-md transition-colors"
                        >
                          Offer Contract (/sign)
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {channel === 'team-signings' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                  {/* Interactive /sign-player Search & Offer Flow */}
                  <form
                    onSubmit={handleTeamSignSubmit}
                    className="xl:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-emerald-400">
                        TLC Bot · /sign-player Manager Flow
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setSignPlayerFilter('free-agents');
                            const firstFa = state.players.find((p) => !p.currentClubId);
                            if (firstFa) setSignPlayerId(firstFa.tlcId);
                          }}
                          className={`px-2 py-0.5 rounded ${
                            signPlayerFilter === 'free-agents'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Free Agents ({state.players.filter((p) => !p.currentClubId).length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSignPlayerFilter('all')}
                          className={`px-2 py-0.5 rounded ${
                            signPlayerFilter === 'all'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          All ({state.players.length})
                        </button>
                      </div>
                    </div>

                    {/* Step 1: Search Available Free Agents */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-300">
                        1. Search & Select Available Player
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={signSearchQuery}
                          onChange={(e) => setSignSearchQuery(e.target.value)}
                          placeholder="Search by name or TLC ID..."
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                        />
                        <select
                          value={signSearchPos}
                          onChange={(e) => setSignSearchPos(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                        >
                          <option value="ALL">ALL POS</option>
                          {PLAYER_POSITIONS.map((pos) => (
                            <option key={pos} value={pos}>
                              {pos}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800/80 bg-slate-950/60">
                        {filteredSignMatches.length === 0 ? (
                          <div className="p-3 text-xs text-slate-500">
                            No free agents matched your search criteria.
                          </div>
                        ) : (
                          filteredSignMatches.map((p) => {
                            const selected = selectedSignPlayer?.tlcId === p.tlcId;
                            return (
                              <button
                                key={p.tlcId}
                                type="button"
                                onClick={() => setSignPlayerId(p.tlcId)}
                                className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                                  selected
                                    ? 'bg-emerald-950/70 text-white'
                                    : 'text-slate-300 hover:bg-slate-900'
                                }`}
                              >
                                <div className="min-w-0 truncate">
                                  <span className="font-mono text-emerald-400 mr-1.5">{p.position}</span>
                                  <span className="font-semibold">{p.playerName}</span>{' '}
                                  <span className="font-mono text-slate-500">({p.tlcId})</span>
                                </div>
                                <div className="font-mono tabular-nums text-slate-400 shrink-0">
                                  Avg {p.averageRating.toFixed(1)} · {p.goals}G {p.assists}A
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Step 2: Formal Offer Configuration */}
                    <div className="pt-1 space-y-2.5">
                      <div className="text-xs font-medium text-slate-300">
                        2. Formal Signing Offer{' '}
                        {selectedSignPlayer && (
                          <span className="text-emerald-400 font-semibold">
                            → {selectedSignPlayer.playerName} ({selectedSignPlayer.tlcId})
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Signing Club</label>
                          <select
                            value={signClubId}
                            onChange={(e) => {
                              const cid = e.target.value;
                              setSignClubId(cid);
                              const clubObj = state.clubs.find((c) => c.clubId === cid);
                              if (clubObj?.currentManagerTlcId) {
                                setSignManagerId(clubObj.currentManagerTlcId);
                              }
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                          >
                            {state.clubs.map((c) => (
                              <option key={c.clubId} value={c.clubId}>
                                {c.name} ({c.shortCode})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Club Manager</label>
                          <select
                            value={signManagerId}
                            onChange={(e) => setSignManagerId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                          >
                            {state.managers.map((m) => (
                              <option key={m.tlcId} value={m.tlcId}>
                                {m.managerName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Contract Type</label>
                          <select
                            value={signType}
                            onChange={(e) =>
                              setSignType(e.target.value as 'Signing' | 'Permanent Transfer' | 'Loan')
                            }
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                          >
                            <option value="Signing">Free Agent Signing</option>
                            <option value="Permanent Transfer">Permanent Transfer</option>
                            <option value="Loan">Loan Deal</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Term Preset</label>
                          <select
                            value={signTermPreset}
                            onChange={(e) => setSignTermPreset(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                          >
                            {CONTRACT_TERM_PRESETS.map((t) => (
                              <option key={t.label} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1">
                          Squad Role / Clause Note (optional)
                        </label>
                        <input
                          type="text"
                          value={signCustomNote}
                          onChange={(e) => setSignCustomNote(e.target.value)}
                          placeholder="e.g. Starting XI #9 · Captaincy clause"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={signBusy || !selectedSignPlayer}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                      >
                        {signBusy ? 'Sending Formal Offer...' : 'Send Formal Signing Offer (/sign-player)'}
                      </button>
                    </div>
                  </form>

                  {/* Step 3 & 4: Active Offer Pipeline + Approval Announcement Confirmation */}
                  <div className="xl:col-span-6 space-y-3">
                    {lastApprovedAnnouncement && (
                      <div className="bg-slate-900 border border-emerald-500/50 rounded-xl p-4 space-y-2">
                        <div className="text-xs font-semibold text-emerald-400">
                          SIGNING APPROVED · AUTOMATION COMPLETE
                        </div>
                        <div className="text-xs text-slate-200 space-y-1">
                          <div>
                            · Roster updated: <strong>{lastApprovedAnnouncement.playerName}</strong> added to{' '}
                            <strong>{lastApprovedAnnouncement.clubName}</strong>
                          </div>
                          <div>
                            · Club role synced:{' '}
                            <span className="font-mono text-emerald-400">
                              {lastApprovedAnnouncement.roleId || 'Configured Club Role'}
                            </span>
                          </div>
                          <div>· Public announcement published in #transfer-market</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setChannel('transfer-market')}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md"
                        >
                          View Announcement in #transfer-market →
                        </button>
                      </div>
                    )}

                    {pendingTransfers.length === 0 ? (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-xs text-slate-400">
                        No active contract proposals right now. Search & select a Free Agent on the left to test Player Accept → Staff Approval → Roster + Club Role + #transfer-market Announcement.
                      </div>
                    ) : (
                      pendingTransfers.map((offer) => {
                        const destClub = state.clubs.find((c) => c.clubId === offer.toClubId);
                        return (
                          <div
                            key={offer.id}
                            className="bg-slate-900 border border-slate-800 rounded-xl p-4"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-emerald-400">
                                TLC Bot · Formal Signing Offer ({offer.transferType})
                              </span>
                              <span className="font-mono text-amber-400">{offer.status}</span>
                            </div>
                            <div className="mt-1.5 text-sm font-bold text-white">
                              {offer.playerName}{' '}
                              <span className="font-mono text-xs text-slate-400">
                                ({offer.playerTlcId})
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-slate-300">
                              {offer.fromClubName} → <strong className="text-white">{offer.toClubName}</strong> · Offered by {offer.managerName}
                            </div>
                            <div className="mt-1 text-xs font-mono text-slate-400">{offer.details}</div>

                            <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-2">
                              {offer.status === 'Pending Player' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const res = (await tlcApi.respondTransferOffer(
                                          offer.id,
                                          'accept',
                                          offer.playerName
                                        )) as { status?: string };
                                        if (res.status === 'Approved') {
                                          setLastApprovedAnnouncement({
                                            playerName: offer.playerName,
                                            clubName: offer.toClubName,
                                            roleId: destClub?.discordRoleId || 'Club Role',
                                          });
                                        }
                                        await onRefresh();
                                        onNotify(`${offer.playerName} accepted the formal signing offer.`);
                                      } catch (err: any) {
                                        onNotify(err.message, true);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md"
                                  >
                                    Sign Contract (Accept)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await tlcApi.respondTransferOffer(offer.id, 'decline', offer.playerName);
                                        await onRefresh();
                                        onNotify(`${offer.playerName} declined the contract.`);
                                      } catch (err: any) {
                                        onNotify(err.message, true);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-md"
                                  >
                                    Decline
                                  </button>
                                </>
                              )}
                              {offer.status === 'Pending Staff' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await tlcApi.reviewTransferOffer(offer.id, 'approve');
                                        setLastApprovedAnnouncement({
                                          playerName: offer.playerName,
                                          clubName: offer.toClubName,
                                          roleId: destClub?.discordRoleId || 'Club Role',
                                        });
                                        await onRefresh();
                                        onNotify(
                                          `Approved signing: ${offer.playerName} joined ${offer.toClubName}. Announced in #transfer-market.`
                                        );
                                      } catch (err: any) {
                                        onNotify(err.message, true);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md"
                                  >
                                    Approve Signing (Update Roster & Announce)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await tlcApi.reviewTransferOffer(offer.id, 'reject');
                                        await onRefresh();
                                        onNotify('Contract rejected by TLC Staff.');
                                      } catch (err: any) {
                                        onNotify(err.message, true);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-md"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
            )}

            {channel === 'transfer-market' && (
              <div className="space-y-4">
                {pendingTransfers.map((offer) => (
                  <div
                    key={offer.id}
                    className="max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-4"
                  >
                    <div className="text-xs text-amber-400 font-medium">
                      Transfer Offer · {offer.status}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {offer.playerName} ({offer.playerTlcId}) — {offer.fromClubName} → {offer.toClubName}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {offer.transferType} · Manager: {offer.managerName} · {offer.details}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {offer.status === 'Pending Player' && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await tlcApi.respondTransferOffer(offer.id, 'accept', offer.playerName);
                              await onRefresh();
                              onNotify(`${offer.playerName} accepted the offer.`);
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md"
                          >
                            Player: Accept
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await tlcApi.respondTransferOffer(offer.id, 'decline', offer.playerName);
                              await onRefresh();
                              onNotify(`${offer.playerName} declined the offer.`);
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-md"
                          >
                            Player: Decline
                          </button>
                        </>
                      )}
                      {offer.status === 'Pending Staff' && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await tlcApi.reviewTransferOffer(offer.id, 'approve');
                              await onRefresh();
                              onNotify(`Official transfer completed for ${offer.playerName}.`);
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md"
                          >
                            Approve Transfer
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await tlcApi.reviewTransferOffer(offer.id, 'reject');
                              await onRefresh();
                              onNotify('Transfer rejected by staff.');
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-md"
                          >
                            Reject Transfer
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {state.transfers.slice(0, 6).map((tr) => (
                  <div
                    key={tr.id}
                    className="max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-4"
                  >
                    <div className="text-xs font-semibold text-emerald-400">
                      OFFICIAL {tr.transferType.toUpperCase()}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {tr.playerName} ({tr.playerTlcId})
                    </div>
                    <div className="mt-1 text-xs text-slate-300">
                      {tr.fromClubName} → {tr.toClubName}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {tr.details} · Approved by {tr.approvedBy}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {channel === 'fixtures' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div>
                    <div className="text-xs font-semibold text-emerald-400">
                      TLC Bot · Official Fixtures Calendar
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Postpone fixtures, assign match referees, or complete matches directly from Discord.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuickFixtureForm((v) => !v)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                  >
                    {showQuickFixtureForm ? 'Close Form' : '+ Schedule Fixture (/fixture-create)'}
                  </button>
                </div>

                {showQuickFixtureForm && (
                  <form
                    onSubmit={handleQuickCreateFixture}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
                  >
                    <select
                      value={newFixCompId}
                      onChange={(e) => setNewFixCompId(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      {state.competitions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newFixHomeId}
                      onChange={(e) => setNewFixHomeId(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      {state.clubs.map((c) => (
                        <option key={c.clubId} value={c.clubId}>
                          Home: {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newFixAwayId}
                      onChange={(e) => setNewFixAwayId(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      {state.clubs.map((c) => (
                        <option key={c.clubId} value={c.clubId}>
                          Away: {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newFixRound}
                      onChange={(e) => setNewFixRound(e.target.value)}
                      placeholder="Round Label"
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="date"
                      value={newFixDate}
                      onChange={(e) => setNewFixDate(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFixTime}
                        onChange={(e) => setNewFixTime(e.target.value)}
                        placeholder="20:00 UTC"
                        className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
                      />
                      <input
                        type="text"
                        value={newFixReferee}
                        onChange={(e) => setNewFixReferee(e.target.value)}
                        placeholder="Referee"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                      />
                    </div>
                    <div className="sm:col-span-3 flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                      >
                        Publish Fixture Embed
                      </button>
                    </div>
                  </form>
                )}

                {upcomingFixtures.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-xs text-slate-400">
                    All fixtures are currently completed. Create a new fixture above.
                  </div>
                ) : (
                  upcomingFixtures.map((fix) => {
                    const home = state.clubs.find((c) => c.clubId === fix.homeClubId)?.name || 'Home';
                    const away = state.clubs.find((c) => c.clubId === fix.awayClubId)?.name || 'Away';
                    const scoreDraft = scoreDraftByFix[fix.id] || { home: '2', away: '1', open: false };
                    const refDraft = refereeDraftByFix[fix.id] ?? (fix.referee || '');
                    return (
                      <div
                        key={fix.id}
                        className="max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-emerald-400">
                            MATCH #{fix.matchNumber} · {fix.competitionName} · {fix.roundLabel}
                          </span>
                          <span
                            className={`font-mono ${
                              fix.status === 'Postponed' ? 'text-amber-400' : 'text-slate-300'
                            }`}
                          >
                            {fix.status}
                          </span>
                        </div>
                        <div className="text-base font-bold text-white">
                          {home} <span className="text-slate-500 font-normal">vs</span> {away}
                        </div>
                        <div className="text-xs text-slate-400 font-mono tabular-nums">
                          {fix.matchDate} · {fix.matchTime} · Referee: {fix.referee || 'TBD'}
                        </div>

                        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const nextStatus =
                                  fix.status === 'Postponed' ? 'Scheduled' : 'Postponed';
                                await tlcApi.editFixture(fix.id, { status: nextStatus });
                                await onRefresh();
                                onNotify(`Match #${fix.matchNumber} marked ${nextStatus}.`);
                              } catch (err: any) {
                                onNotify(err.message, true);
                              }
                            }}
                            className="px-2.5 py-1 border border-slate-700 hover:bg-slate-800 text-xs text-amber-300 rounded-md"
                          >
                            {fix.status === 'Postponed' ? 'Resume Scheduled' : 'Postpone'}
                          </button>

                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={refDraft}
                              onChange={(e) =>
                                setRefereeDraftByFix((prev) => ({
                                  ...prev,
                                  [fix.id]: e.target.value,
                                }))
                              }
                              placeholder="Referee name"
                              className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 w-32"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await tlcApi.editFixture(fix.id, {
                                    referee: refDraft.trim() || 'TBD',
                                  });
                                  await onRefresh();
                                  onNotify(`Assigned referee to Match #${fix.matchNumber}.`);
                                } catch (err: any) {
                                  onNotify(err.message, true);
                                }
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-md"
                            >
                              Assign Ref
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setScoreDraftByFix((prev) => ({
                                ...prev,
                                [fix.id]: { ...scoreDraft, open: !scoreDraft.open },
                              }))
                            }
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md"
                          >
                            Complete Match
                          </button>
                        </div>

                        {scoreDraft.open && (
                          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-slate-400">Final Score:</span>
                            <input
                              type="number"
                              min={0}
                              value={scoreDraft.home}
                              onChange={(e) =>
                                setScoreDraftByFix((prev) => ({
                                  ...prev,
                                  [fix.id]: { ...scoreDraft, home: e.target.value },
                                }))
                              }
                              className="w-14 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white"
                            />
                            <span className="text-slate-500">–</span>
                            <input
                              type="number"
                              min={0}
                              value={scoreDraft.away}
                              onChange={(e) =>
                                setScoreDraftByFix((prev) => ({
                                  ...prev,
                                  [fix.id]: { ...scoreDraft, away: e.target.value },
                                }))
                              }
                              className="w-14 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-white"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await tlcApi.submitResult(fix.id, {
                                    homeScore: Number(scoreDraft.home) || 0,
                                    awayScore: Number(scoreDraft.away) || 0,
                                    autoApprove: true,
                                    actor: 'Discord Match Official',
                                  });
                                  await onRefresh();
                                  onNotify(`Match #${fix.matchNumber} completed and standings updated.`);
                                } catch (err: any) {
                                  onNotify(err.message, true);
                                }
                              }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded"
                            >
                              Submit Result
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {channel === 'match-ratings' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Interactive /rate Embed Form */}
                <form
                  onSubmit={handleRatePlayerSubmit}
                  className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3"
                >
                  <div className="text-xs font-semibold text-emerald-400">
                    TLC Bot · /rate Match Player Grader
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Select Match</label>
                    <select
                      value={rateFixtureId}
                      onChange={(e) => setRateFixtureId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      {state.fixtures.map((f) => {
                        const h = state.clubs.find((c) => c.clubId === f.homeClubId)?.shortCode || 'HOM';
                        const a = state.clubs.find((c) => c.clubId === f.awayClubId)?.shortCode || 'AWY';
                        return (
                          <option key={f.id} value={f.id}>
                            #{f.matchNumber} {h} {f.homeScore ?? '-'}–{f.awayScore ?? '-'} {a} ({f.roundLabel})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Player</label>
                    <select
                      value={ratePlayerId}
                      onChange={(e) => setRatePlayerId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      {state.players.map((p) => {
                        const isMatchClub =
                          activeRateFixture &&
                          (p.currentClubId === activeRateFixture.homeClubId ||
                            p.currentClubId === activeRateFixture.awayClubId);
                        return (
                          <option key={p.tlcId} value={p.tlcId}>
                            {isMatchClub ? '★ ' : ''}
                            {p.playerName} ({p.position}) · Avg {p.averageRating.toFixed(2)}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Match Rating (1.0 – 10.0)</span>
                      <span className="font-mono tabular-nums text-sm font-bold text-emerald-400">
                        {rateScore.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.1}
                      value={rateScore}
                      onChange={(e) => setRateScore(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Goals</label>
                      <input
                        type="number"
                        min={0}
                        value={rateGoals}
                        onChange={(e) => setRateGoals(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Assists</label>
                      <input
                        type="number"
                        min={0}
                        value={rateAssists}
                        onChange={(e) => setRateAssists(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Saves</label>
                      <input
                        type="number"
                        min={0}
                        value={rateSaves}
                        onChange={(e) => setRateSaves(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-300 pt-1">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rateCleanSheet}
                        onChange={(e) => setRateCleanSheet(e.target.checked)}
                      />
                      Clean Sheet
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rateMotm}
                        onChange={(e) => setRateMotm(e.target.checked)}
                      />
                      Man of the Match
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={rateBusy}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    {rateBusy ? 'Saving Rating...' : 'Publish Player Rating (/rate)'}
                  </button>
                </form>

                {/* Live Rating Cards + Top Rated Summary */}
                <div className="xl:col-span-7 space-y-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs font-semibold text-emerald-400 mb-2">
                      Top Rated Players (/ratings)
                    </div>
                    <div className="divide-y divide-slate-800 text-xs">
                      {topRatedPlayers.map((p, i) => (
                        <div key={p.tlcId} className="py-2 flex items-center justify-between gap-2">
                          <div className="text-slate-200">
                            <span className="font-mono text-slate-500 mr-2">#{i + 1}</span>
                            <span className="font-semibold text-white">{p.playerName}</span>{' '}
                            <span className="text-slate-400">· {p.position}</span>
                          </div>
                          <div className="font-mono tabular-nums text-slate-300">
                            <span className="text-emerald-400 font-bold">{p.averageRating.toFixed(2)}</span>{' '}
                            <span className="text-slate-500">· MOTM {p.manOfTheMatchAwards}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {recordedRatingsFeed.map((r, idx) => (
                      <div
                        key={`${r.fixtureId}-${r.playerTlcId}-${idx}`}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-xs text-slate-400">
                            {r.matchLabel} · {r.competitionName}
                          </div>
                          <div className="text-sm font-semibold text-white mt-0.5">
                            {r.playerName}{' '}
                            <span className="font-mono text-xs text-slate-400">
                              ({r.playerTlcId})
                            </span>
                            {r.manOfTheMatch && (
                              <span className="ml-2 text-xs font-semibold text-amber-400">★ MOTM</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                            G:{r.goals} · A:{r.assists} · SV:{r.saves}
                            {r.cleanSheet ? ' · Clean Sheet' : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500">Rating</div>
                          <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">
                            {r.rating.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {channel === 'results' && (
              <div className="space-y-4">
                {completedResults.map((fix) => {
                  const h = state.clubs.find((c) => c.clubId === fix.homeClubId)?.name || 'Home';
                  const a = state.clubs.find((c) => c.clubId === fix.awayClubId)?.name || 'Away';
                  return (
                    <div
                      key={fix.id}
                      className="max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-4"
                    >
                      <div className="text-xs font-semibold text-emerald-400">OFFICIAL RESULT</div>
                      <div className="mt-1 text-base font-bold text-white font-mono tabular-nums">
                        {h} {fix.homeScore}–{fix.awayScore} {a}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {fix.competitionName} · {fix.roundLabel} · Status: {fix.status}
                      </div>
                      {fix.notes && <div className="mt-2 text-xs text-slate-300">{fix.notes}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {channel === 'tlc-audit-logs' && (
              <div className="space-y-3">
                {state.auditLogs.slice(0, 12).map((log) => (
                  <div
                    key={log.id}
                    className="max-w-2xl bg-slate-900 border border-slate-800 rounded-lg p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="font-semibold text-slate-200">{log.action}</span>
                      <span className="font-mono tabular-nums">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-300">
                      Actor: <span className="text-white">{log.actor}</span> · Target:{' '}
                      <span className="text-emerald-400">{log.target}</span>
                    </div>
                    <div className="mt-1 text-slate-500 font-mono">
                      {log.previousValue} → {log.newValue}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Verify Modal (Discord Modal Simulation) */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900">TLC Registration Form</h3>
            <p className="text-xs text-slate-500 mt-1">
              Submit your official Touchline profile. Staff approval is required before verification access is granted.
            </p>

            <form onSubmit={handleVerifySubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Registration Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Player', 'Manager'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setRegType(t)}
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        regType === t
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {regType === 'Player' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Position (Players Only)
                  </label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as PlayerPosition)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {PLAYER_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {regType === 'Player' ? 'Player Name (Official TLC Name)' : 'Manager Name (Official TLC Name)'}
                </label>
                <input
                  type="text"
                  required
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Julian Alvarez"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Roblox Username
                </label>
                <input
                  type="text"
                  required
                  value={robloxUsername}
                  onChange={(e) => setRobloxUsername(e.target.value)}
                  placeholder="e.g. AlvarezTLC"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Discord Username
                  </label>
                  <input
                    type="text"
                    value={discordUsername}
                    onChange={(e) => setDiscordUsername(e.target.value)}
                    placeholder="optional in sim"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Discord User ID
                  </label>
                  <input
                    type="text"
                    value={discordUserId}
                    onChange={(e) => setDiscordUserId(e.target.value)}
                    placeholder="auto-assigned"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Roblox Avatar / Image URL (optional)
                </label>
                <input
                  type="text"
                  value={robloxAvatarUrl}
                  onChange={(e) => setRobloxAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVerifyModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectTargetId && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900">Reject Registration</h3>
            <p className="text-xs text-slate-500 mt-1">
              Optionally provide a rejection reason sent to the applicant.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Roblox account could not be verified."
              className="mt-3 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTargetId(null)}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await tlcApi.rejectRegistration(rejectTargetId, rejectReason, true);
                    setRejectTargetId(null);
                    await onRefresh();
                    onNotify('Registration rejected.');
                  } catch (err: any) {
                    onNotify(err.message, true);
                  }
                }}
                className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
