import { useState } from 'react';
import { Award, Search, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import {
  ManagerProfile,
  PLAYER_POSITIONS,
  PlayerPosition,
  PlayerProfile,
  PlayerStatus,
} from '../shared/types.ts';
import { TlcApiState, tlcApi } from '../lib/api.ts';
import { ClubBadge } from './ClubBadge.tsx';

interface ProfilesViewProps {
  state: TlcApiState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function ProfilesView({ state, onRefresh, onNotify }: ProfilesViewProps) {
  const [tab, setTab] = useState<'players' | 'free-agents' | 'managers'>('players');
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [clubFilter, setClubFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);
  const [selectedManager, setSelectedManager] = useState<ManagerProfile | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [editName, setEditName] = useState('');
  const [editRoblox, setEditRoblox] = useState('');
  const [editPosition, setEditPosition] = useState<PlayerPosition>('CM');
  const [editStatus, setEditStatus] = useState<PlayerStatus>('Active');
  const [quickSignClubId, setQuickSignClubId] = useState(state.clubs[0]?.clubId || '');
  const [quickSignTerm, setQuickSignTerm] = useState('1 Season (60d) · First Team');

  const clubName = (clubId: string | null) =>
    clubId ? state.clubs.find((c) => c.clubId === clubId)?.name || clubId : 'Free Agent';

  const filteredPlayers = state.players.filter((p) => {
    if (tab === 'free-agents' && (p.currentClubId !== null || p.status !== 'Free Agent')) {
      return false;
    }
    if (posFilter !== 'ALL' && p.position !== posFilter) return false;
    if (clubFilter !== 'ALL') {
      if (clubFilter === 'FREE' && p.currentClubId !== null) return false;
      if (clubFilter !== 'FREE' && p.currentClubId !== clubFilter) return false;
    }
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return (
        p.playerName.toLowerCase().includes(q) ||
        p.tlcId.toLowerCase().includes(q) ||
        p.robloxUsername.toLowerCase().includes(q) ||
        p.discordUsername.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredManagers = state.managers.filter((m) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      m.managerName.toLowerCase().includes(q) ||
      m.tlcId.toLowerCase().includes(q) ||
      m.robloxUsername.toLowerCase().includes(q)
    );
  });

  const openPlayerInspector = (p: PlayerProfile) => {
    setSelectedManager(null);
    setSelectedPlayer(p);
    setEditMode(false);
    setEditName(p.playerName);
    setEditRoblox(p.robloxUsername);
    setEditPosition(p.position);
    setEditStatus(p.status);
  };

  const openManagerInspector = (m: ManagerProfile) => {
    setSelectedPlayer(null);
    setSelectedManager(m);
    setEditMode(false);
    setEditName(m.managerName);
    setEditRoblox(m.robloxUsername);
  };

  const handleSavePlayerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer) return;
    try {
      const updated = (await tlcApi.editPlayer(selectedPlayer.tlcId, {
        playerName: editName,
        robloxUsername: editRoblox,
        position: editPosition,
        status: editStatus,
      })) as PlayerProfile;
      setSelectedPlayer(updated);
      setEditMode(false);
      await onRefresh();
      onNotify(`Updated profile ${updated.tlcId}.`);
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleSaveManagerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManager) return;
    try {
      const updated = (await tlcApi.editManager(selectedManager.tlcId, {
        managerName: editName,
        robloxUsername: editRoblox,
      })) as ManagerProfile;
      setSelectedManager(updated);
      setEditMode(false);
      await onRefresh();
      onNotify(`Updated manager ${updated.tlcId}.`);
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {(
            [
              { id: 'players', label: `All Players (${state.players.length})` },
              {
                id: 'free-agents',
                label: `Free Agent Market (${state.players.filter((p) => !p.currentClubId && p.status === 'Free Agent').length})`,
              },
              { id: 'managers', label: `Managers (${state.managers.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, TLC ID, Roblox..."
              className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm w-60 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {tab !== 'managers' && (
            <>
              <select
                value={posFilter}
                onChange={(e) => setPosFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="ALL">All Positions</option>
                {PLAYER_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              {tab === 'players' && (
                <>
                  <select
                    value={clubFilter}
                    onChange={(e) => setClubFilter(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700"
                  >
                    <option value="ALL">All Clubs</option>
                    <option value="FREE">Free Agents</option>
                    {state.clubs.map((c) => (
                      <option key={c.clubId} value={c.clubId}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Free Agent">Free Agent</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Retired">Retired</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Directory Table */}
        <div
          className={`${
            selectedPlayer || selectedManager ? 'xl:col-span-7' : 'xl:col-span-12'
          } bg-white border border-slate-200 rounded-xl overflow-hidden`}
        >
          <div className="overflow-x-auto">
            {tab !== 'managers' ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">TLC ID</th>
                    <th className="py-3 px-4">Player</th>
                    <th className="py-3 px-4">Pos</th>
                    <th className="py-3 px-4">Club</th>
                    <th className="py-3 px-4 text-right">GP</th>
                    <th className="py-3 px-4 text-right">G</th>
                    <th className="py-3 px-4 text-right">A</th>
                    <th className="py-3 px-4 text-right">Avg</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredPlayers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-500">
                        No players match your search filters.
                      </td>
                    </tr>
                  ) : (
                    filteredPlayers.map((p) => (
                      <tr
                        key={p.tlcId}
                        onClick={() => openPlayerInspector(p)}
                        className={`cursor-pointer transition-colors ${
                          selectedPlayer?.tlcId === p.tlcId
                            ? 'bg-emerald-50/70'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-600 tabular-nums">
                          {p.tlcId}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{p.playerName}</div>
                          <div className="text-xs text-slate-500">@{p.discordUsername}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs font-semibold text-emerald-700">
                          {p.position}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{clubName(p.currentClubId)}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          {p.matchesPlayed}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 font-semibold">
                          {p.goals}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          {p.assists}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          {p.averageRating.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-4 text-xs font-medium">
                          <span
                            className={
                              p.status === 'Active'
                                ? 'text-emerald-700'
                                : p.status === 'Free Agent'
                                ? 'text-amber-700'
                                : p.status === 'Suspended' || p.status === 'Inactive'
                                ? 'text-red-600'
                                : 'text-slate-500'
                            }
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">TLC ID</th>
                    <th className="py-3 px-4">Manager</th>
                    <th className="py-3 px-4">Current Club</th>
                    <th className="py-3 px-4 text-right">Matches</th>
                    <th className="py-3 px-4 text-right">W-D-L</th>
                    <th className="py-3 px-4 text-right">Win %</th>
                    <th className="py-3 px-4 text-right">Trophies</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredManagers.map((m) => (
                    <tr
                      key={m.tlcId}
                      onClick={() => openManagerInspector(m)}
                      className={`cursor-pointer transition-colors ${
                        selectedManager?.tlcId === m.tlcId
                          ? 'bg-emerald-50/70'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-600 tabular-nums">
                        {m.tlcId}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900">{m.managerName}</div>
                        <div className="text-xs text-slate-500">@{m.discordUsername}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{clubName(m.currentClubId)}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {m.matchesManaged}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {m.wins}-{m.draws}-{m.losses}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {m.winRate}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{m.trophies}</td>
                      <td className="py-2.5 px-4 text-xs font-medium text-slate-700">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Profile Detail Panel */}
        {selectedPlayer && (
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <ClubBadge src={selectedPlayer.robloxAvatarUrl} name={selectedPlayer.playerName} size="lg" />
                <div>
                  <div className="font-mono text-xs font-semibold text-emerald-700">
                    {selectedPlayer.tlcId} · {selectedPlayer.position} · {selectedPlayer.status}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{selectedPlayer.playerName}</h3>
                  <div className="text-xs text-slate-500">
                    @{selectedPlayer.discordUsername} · Roblox: {selectedPlayer.robloxUsername}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            {!editMode ? (
              <>
                <div className="grid grid-cols-3 gap-3 border-y border-slate-100 py-3 text-center">
                  <div>
                    <div className="text-xs text-slate-500">Matches</div>
                    <div className="text-base font-bold font-mono tabular-nums">
                      {selectedPlayer.matchesPlayed}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Goals / Assists</div>
                    <div className="text-base font-bold font-mono tabular-nums">
                      {selectedPlayer.goals} / {selectedPlayer.assists}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Avg Rating</div>
                    <div className="text-base font-bold font-mono tabular-nums">
                      {selectedPlayer.averageRating.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Clean Sheets</div>
                    <div className="text-base font-bold font-mono tabular-nums">
                      {selectedPlayer.cleanSheets}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Saves</div>
                    <div className="text-base font-bold font-mono tabular-nums">
                      {selectedPlayer.saves}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">MOTM / Trophies</div>
                    <div className="text-base font-bold font-mono tabular-nums">
                      {selectedPlayer.manOfTheMatchAwards} / {selectedPlayer.trophies}
                    </div>
                  </div>
                </div>

                {/* Achievements */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-600" />
                    Unlocked Achievements ({selectedPlayer.achievements.length})
                  </h4>
                  {selectedPlayer.achievements.length === 0 ? (
                    <div className="text-xs text-slate-400">No milestone achievements unlocked yet.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedPlayer.achievements.map((a) => (
                        <div key={a.id} className="text-xs flex items-center justify-between">
                          <span className="font-medium text-slate-800">{a.title}</span>
                          <span className="text-slate-400">{a.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Career History */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Career & Transfer History</h4>
                  {selectedPlayer.careerHistory.length === 0 ? (
                    <div className="text-xs text-slate-400">No club history recorded yet.</div>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {selectedPlayer.careerHistory.map((h) => (
                        <div key={h.id} className="flex items-center justify-between">
                          <span className="font-medium text-slate-800">
                            {h.clubName} {h.transferType ? `(${h.transferType})` : ''}
                          </span>
                          <span className="font-mono text-slate-500 tabular-nums">
                            {h.startDate} → {h.endDate || 'Present'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Match-by-Match Rating History */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">
                    Match Ratings & Performance Log
                  </h4>
                  {(() => {
                    const matchLogs = state.fixtures
                      .filter((f) =>
                        (f.playerStats ?? []).some((st) => st.playerTlcId === selectedPlayer.tlcId)
                      )
                      .map((f) => {
                        const stat = (f.playerStats ?? []).find(
                          (st) => st.playerTlcId === selectedPlayer.tlcId
                        )!;
                        const h =
                          state.clubs.find((c) => c.clubId === f.homeClubId)?.shortCode || 'HOM';
                        const a =
                          state.clubs.find((c) => c.clubId === f.awayClubId)?.shortCode || 'AWY';
                        return {
                          fixtureId: f.id,
                          matchLabel: `#${f.matchNumber} ${h} ${f.homeScore ?? '-'}–${f.awayScore ?? '-'} ${a}`,
                          stat,
                        };
                      });
                    if (matchLogs.length === 0) {
                      return (
                        <div className="text-xs text-slate-400">
                          No individual match ratings recorded yet.
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-1.5 text-xs">
                        {matchLogs.slice(0, 6).map((m) => (
                          <div
                            key={m.fixtureId}
                            className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0"
                          >
                            <span className="text-slate-700 font-mono">
                              {m.matchLabel}
                              {m.stat.manOfTheMatch ? ' ★ MOTM' : ''}
                            </span>
                            <span className="font-mono tabular-nums text-slate-600">
                              {m.stat.goals}G {m.stat.assists}A ·{' '}
                              <strong className="text-emerald-700">
                                {m.stat.rating.toFixed(1)}
                              </strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Inline Team Sign Offer */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="text-xs font-semibold text-slate-800">
                    Team Sign Offer (/sign)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={quickSignClubId}
                      onChange={(e) => setQuickSignClubId(e.target.value)}
                      className="bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-xs flex-1 min-w-[140px]"
                    >
                      {state.clubs.map((c) => (
                        <option key={c.clubId} value={c.clubId}>
                          {c.name} ({c.shortCode})
                        </option>
                      ))}
                    </select>
                    <select
                      value={quickSignTerm}
                      onChange={(e) => setQuickSignTerm(e.target.value)}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    >
                      <option value="1 Season (60d) · First Team">1 Season (60d)</option>
                      <option value="2 Seasons (120d) · Key Player">2 Seasons (120d)</option>
                      <option value="30d Loan · Squad Rotation">Loan (30d)</option>
                    </select>
                    <button
                      type="button"
                      onClick={async () => {
                        const club = state.clubs.find((c) => c.clubId === quickSignClubId);
                        const mgrId = club?.currentManagerTlcId || state.managers[0]?.tlcId;
                        if (!club || !mgrId) {
                          onNotify('Select a valid club and manager.', true);
                          return;
                        }
                        try {
                          await tlcApi.submitTransferOffer({
                            playerTlcId: selectedPlayer.tlcId,
                            toClubId: club.clubId,
                            managerTlcId: mgrId,
                            transferType: selectedPlayer.currentClubId
                              ? 'Permanent Transfer'
                              : 'Signing',
                            details: quickSignTerm,
                          });
                          await onRefresh();
                          onNotify(
                            `Team Sign offer sent to ${selectedPlayer.playerName} from ${club.name}.`
                          );
                        } catch (err: any) {
                          onNotify(err.message, true);
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md whitespace-nowrap"
                    >
                      Send Sign Offer
                    </button>
                  </div>
                </div>

                {/* Staff Controls */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 hover:bg-slate-50 rounded-lg"
                  >
                    Edit Profile
                  </button>
                  {selectedPlayer.inServer ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await tlcApi.simulateLeave(selectedPlayer.discordUserId);
                        await onRefresh();
                        setSelectedPlayer(null);
                        onNotify(`${selectedPlayer.playerName} marked Inactive (career history preserved).`);
                      }}
                      className="px-3 py-1.5 text-xs font-medium border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg inline-flex items-center gap-1"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      Simulate Server Leave
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await tlcApi.simulateRejoin(selectedPlayer.discordUserId);
                        await onRefresh();
                        setSelectedPlayer(null);
                        onNotify(`${selectedPlayer.playerName} restored on rejoin.`);
                      }}
                      className="px-3 py-1.5 text-xs font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg inline-flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Simulate Rejoin
                    </button>
                  )}
                </div>
              </>
            ) : (
              <form onSubmit={handleSavePlayerEdit} className="space-y-3 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Player Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Roblox Username</label>
                  <input
                    type="text"
                    required
                    value={editRoblox}
                    onChange={(e) => setEditRoblox(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Position</label>
                    <select
                      value={editPosition}
                      onChange={(e) => setEditPosition(e.target.value as PlayerPosition)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    >
                      {PLAYER_POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as PlayerStatus)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    >
                      <option value="Active">Active</option>
                      <option value="Free Agent">Free Agent</option>
                      <option value="Suspended">Suspended</option>
                      <option value="Retired">Retired</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg"
                  >
                    Save Profile
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {selectedManager && (
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <ClubBadge src={selectedManager.robloxAvatarUrl} name={selectedManager.managerName} size="lg" />
                <div>
                  <div className="font-mono text-xs font-semibold text-slate-600">
                    {selectedManager.tlcId} · Manager · {selectedManager.status}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{selectedManager.managerName}</h3>
                  <div className="text-xs text-slate-500">
                    @{selectedManager.discordUsername} · Roblox: {selectedManager.robloxUsername}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedManager(null)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            {!editMode ? (
              <>
                <div className="grid grid-cols-3 gap-3 border-y border-slate-100 py-3 text-center">
                  <div>
                    <div className="text-xs text-slate-500">Managed</div>
                    <div className="text-base font-bold font-mono tabular-nums">
                      {selectedManager.matchesManaged}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">W - D - L</div>
                    <div className="text-base font-bold font-mono tabular-nums">
                      {selectedManager.wins}-{selectedManager.draws}-{selectedManager.losses}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Win Rate</div>
                    <div className="text-base font-bold font-mono tabular-nums text-emerald-700">
                      {selectedManager.winRate}%
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Managerial Career History</h4>
                  <div className="space-y-1.5 text-xs">
                    {selectedManager.careerHistory.length === 0 ? (
                      <div className="text-slate-400">No clubs managed yet.</div>
                    ) : (
                      selectedManager.careerHistory.map((h) => (
                        <div key={h.id} className="flex items-center justify-between">
                          <span className="font-medium text-slate-800">{h.clubName}</span>
                          <span className="font-mono text-slate-500 tabular-nums">
                            {h.startDate} → {h.endDate || 'Present'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Edit Manager
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveManagerEdit} className="space-y-3 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Manager Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Roblox Username</label>
                  <input
                    type="text"
                    required
                    value={editRoblox}
                    onChange={(e) => setEditRoblox(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg"
                  >
                    Save Manager
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
