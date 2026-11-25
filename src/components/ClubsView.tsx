import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Club } from '../shared/types.ts';
import { TlcApiState, tlcApi } from '../lib/api.ts';
import { ClubBadge } from './ClubBadge.tsx';

interface ClubsViewProps {
  state: TlcApiState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function ClubsView({ state, onRefresh, onNotify }: ClubsViewProps) {
  const [selectedClub, setSelectedClub] = useState<Club | null>(state.clubs[0] || null);
  const [showCreate, setShowCreate] = useState(false);

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newLogo, setNewLogo] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [newManagerId, setNewManagerId] = useState('');
  const [signOfferPlayerId, setSignOfferPlayerId] = useState('');
  const [signOfferTerm, setSignOfferTerm] = useState('1 Season (60d) · First Team');
  const [clubRateFixtureId, setClubRateFixtureId] = useState('');
  const [clubRatePlayerId, setClubRatePlayerId] = useState('');
  const [clubRateScore, setClubRateScore] = useState(7.8);

  const activeClub =
    selectedClub ? state.clubs.find((c) => c.clubId === selectedClub.clubId) || state.clubs[0] : state.clubs[0];

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const club = (await tlcApi.createClub({
        name: newName,
        shortCode: newCode,
        logoUrl: newLogo || undefined,
        discordRoleId: newRoleId,
        managerTlcId: newManagerId || null,
      })) as Club;
      setShowCreate(false);
      setNewName('');
      setNewCode('');
      setNewLogo('');
      setNewRoleId('');
      setNewManagerId('');
      setSelectedClub(club);
      await onRefresh();
      onNotify(`Created official club ${club.name} (${club.clubId}).`);
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Official TLC Clubs & Rosters</h2>
          <p className="text-sm text-slate-500">
            Manage registered clubs, send Team Sign offers, review club fixtures, and rate squad performances.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create Club
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Club List */}
        <div className="lg:col-span-5 space-y-3">
          {state.clubs.map((club) => {
            const mgr = state.managers.find((m) => m.tlcId === club.currentManagerTlcId);
            const rosterCount = state.players.filter((p) => p.currentClubId === club.clubId).length;
            const isActive = activeClub?.clubId === club.clubId;
            return (
              <button
                key={club.clubId}
                type="button"
                onClick={() => {
                  setSelectedClub(club);
                  setClubRateFixtureId('');
                  setClubRatePlayerId('');
                }}
                className={`w-full text-left p-4 rounded-xl border transition-colors flex items-center justify-between gap-4 ${
                  isActive
                    ? 'bg-white border-emerald-600'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <ClubBadge src={club.logoUrl} name={club.name} size="lg" />
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-slate-500">
                      {club.clubId} · {club.shortCode}
                    </div>
                    <div className="font-bold text-slate-900 truncate">{club.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      Manager: {mgr?.managerName || 'Vacant'} · {rosterCount} Players
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                    {club.wins}W-{club.draws}D-{club.losses}L
                  </div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    {club.trophies} Trophies
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Club Detail */}
        {activeClub && (() => {
          const squadPlayers = state.players.filter((p) => p.currentClubId === activeClub.clubId);
          const clubFixtures = state.fixtures.filter(
            (f) => f.homeClubId === activeClub.clubId || f.awayClubId === activeClub.clubId
          );
          const activeRateFix =
            clubFixtures.find((f) => f.id === clubRateFixtureId) || clubFixtures[0];
          const rateTargetPlayer =
            squadPlayers.find((p) => p.tlcId === clubRatePlayerId) || squadPlayers[0];

          return (
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <ClubBadge src={activeClub.logoUrl} name={activeClub.name} size="lg" />
                  <div>
                    <div className="font-mono text-xs text-slate-500">
                      {activeClub.clubId} · Registered {activeClub.registrationDate.slice(0, 10)}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">{activeClub.name}</h3>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">
                      Role ID: {activeClub.discordRoleId || 'Unconfigured'}
                    </div>
                  </div>
                </div>

                {/* Assign / Change Manager */}
                <div className="sm:text-right">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Club Manager
                  </label>
                  <select
                    value={activeClub.currentManagerTlcId || ''}
                    onChange={async (e) => {
                      try {
                        await tlcApi.setClubManager(activeClub.clubId, e.target.value || null);
                        await onRefresh();
                        onNotify('Updated club manager assignment.');
                      } catch (err: any) {
                        onNotify(err.message, true);
                      }
                    }}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium"
                  >
                    <option value="">Vacant (No Manager)</option>
                    {state.managers.map((m) => (
                      <option key={m.tlcId} value={m.tlcId}>
                        {m.managerName} ({m.tlcId})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Club Stats Strip */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500">Played</div>
                  <div className="text-base font-bold font-mono tabular-nums">{activeClub.matchesPlayed}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500">Wins</div>
                  <div className="text-base font-bold font-mono tabular-nums text-emerald-700">{activeClub.wins}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500">Draws</div>
                  <div className="text-base font-bold font-mono tabular-nums">{activeClub.draws}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500">Losses</div>
                  <div className="text-base font-bold font-mono tabular-nums text-red-600">{activeClub.losses}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500">GF / GA</div>
                  <div className="text-base font-bold font-mono tabular-nums">
                    {activeClub.goalsFor}/{activeClub.goalsAgainst}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500">Trophies</div>
                  <div className="text-base font-bold font-mono tabular-nums">{activeClub.trophies}</div>
                </div>
              </div>

              {/* Current Roster + Avg Ratings */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    Current Squad Roster ({squadPlayers.length})
                  </h4>

                  {/* Quick Staff Add Player */}
                  <select
                    defaultValue=""
                    onChange={async (e) => {
                      const pid = e.target.value;
                      if (!pid) return;
                      e.target.value = '';
                      try {
                        await tlcApi.directTransfer({
                          playerTlcId: pid,
                          toClubId: activeClub.clubId,
                          transferType: 'Signing',
                          details: 'Staff direct squad assignment',
                        });
                        await onRefresh();
                        onNotify(`Added player to ${activeClub.name}.`);
                      } catch (err: any) {
                        onNotify(err.message, true);
                      }
                    }}
                    className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    <option value="">+ Direct Assign Free Agent</option>
                    {state.players
                      .filter((p) => !p.currentClubId)
                      .map((p) => (
                        <option key={p.tlcId} value={p.tlcId}>
                          {p.playerName} ({p.position})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Inline Team Sign Contract Offer for Club */}
                <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Team Sign (/sign):</span>
                  <select
                    value={signOfferPlayerId}
                    onChange={(e) => setSignOfferPlayerId(e.target.value)}
                    className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs flex-1 min-w-[160px]"
                  >
                    <option value="">Select Free Agent or Player...</option>
                    {state.players
                      .filter((p) => p.currentClubId !== activeClub.clubId)
                      .map((p) => (
                        <option key={p.tlcId} value={p.tlcId}>
                          {p.playerName} ({p.position}) · {p.status}
                        </option>
                      ))}
                  </select>
                  <select
                    value={signOfferTerm}
                    onChange={(e) => setSignOfferTerm(e.target.value)}
                    className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs"
                  >
                    <option value="1 Season (60d) · First Team">1 Season (60d)</option>
                    <option value="2 Seasons (120d) · Key Player">2 Seasons (120d)</option>
                    <option value="30d Loan · Squad Rotation">Loan (30d)</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const target = state.players.find((p) => p.tlcId === signOfferPlayerId);
                      const mgrId = activeClub.currentManagerTlcId || state.managers[0]?.tlcId;
                      if (!target || !mgrId) {
                        onNotify('Select a player and ensure a manager is available.', true);
                        return;
                      }
                      try {
                        await tlcApi.submitTransferOffer({
                          playerTlcId: target.tlcId,
                          toClubId: activeClub.clubId,
                          managerTlcId: mgrId,
                          transferType: target.currentClubId ? 'Permanent Transfer' : 'Signing',
                          details: signOfferTerm,
                        });
                        setSignOfferPlayerId('');
                        await onRefresh();
                        onNotify(`Sent Team Sign offer to ${target.playerName} for ${activeClub.name}.`);
                      } catch (err: any) {
                        onNotify(err.message, true);
                      }
                    }}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md whitespace-nowrap"
                  >
                    Send Contract Offer
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2 px-3">TLC ID</th>
                        <th className="py-2 px-3">Player</th>
                        <th className="py-2 px-3">Pos</th>
                        <th className="py-2 px-3 text-right">G / A</th>
                        <th className="py-2 px-3 text-right">Rating</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {squadPlayers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-xs text-slate-400">
                            No players currently signed to this club.
                          </td>
                        </tr>
                      ) : (
                        squadPlayers.map((p) => (
                          <tr key={p.tlcId}>
                            <td className="py-2 px-3 font-mono text-xs text-slate-500">{p.tlcId}</td>
                            <td className="py-2 px-3 font-medium text-slate-900">{p.playerName}</td>
                            <td className="py-2 px-3 font-mono text-xs font-semibold text-emerald-700">
                              {p.position}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-xs">
                              {p.goals}G · {p.assists}A
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-xs font-bold text-slate-900">
                              {p.averageRating.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  await tlcApi.directTransfer({
                                    playerTlcId: p.tlcId,
                                    toClubId: null,
                                    transferType: 'Release',
                                    details: `Released from ${activeClub.name}`,
                                  });
                                  await onRefresh();
                                  onNotify(`${p.playerName} released to Free Agency.`);
                                }}
                                className="text-xs text-red-600 hover:underline"
                              >
                                Release
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Club Fixtures & Quick Player Rating */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <h4 className="text-sm font-bold text-slate-900">
                  Club Fixtures & Matchday Ratings ({clubFixtures.length})
                </h4>
                {clubFixtures.length === 0 ? (
                  <div className="text-xs text-slate-400">No fixtures scheduled for this club yet.</div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {clubFixtures.slice(0, 4).map((f) => {
                      const oppId = f.homeClubId === activeClub.clubId ? f.awayClubId : f.homeClubId;
                      const oppName = state.clubs.find((c) => c.clubId === oppId)?.name || 'TBD';
                      const sideLabel = f.homeClubId === activeClub.clubId ? 'HOME' : 'AWAY';
                      return (
                        <div key={f.id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="font-mono text-slate-500">#{f.matchNumber}</span>{' '}
                            <span className="font-semibold text-slate-900">
                              {sideLabel} vs {oppName}
                            </span>
                            <div className="text-slate-500 font-mono tabular-nums">
                              {f.competitionName} · {f.matchDate} {f.matchTime}
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums">
                            {f.status === 'Completed' ? (
                              <span className="font-bold text-emerald-700">
                                {f.homeScore}–{f.awayScore} FT
                              </span>
                            ) : (
                              <span className="text-amber-700">{f.status}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeRateFix && rateTargetPlayer && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-700">Rate Squad (/rate):</span>
                    <select
                      value={activeRateFix.id}
                      onChange={(e) => setClubRateFixtureId(e.target.value)}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs"
                    >
                      {clubFixtures.map((f) => (
                        <option key={f.id} value={f.id}>
                          Match #{f.matchNumber} ({f.roundLabel})
                        </option>
                      ))}
                    </select>
                    <select
                      value={rateTargetPlayer.tlcId}
                      onChange={(e) => setClubRatePlayerId(e.target.value)}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs"
                    >
                      {squadPlayers.map((p) => (
                        <option key={p.tlcId} value={p.tlcId}>
                          {p.playerName} ({p.position})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={0.1}
                      value={clubRateScore}
                      onChange={(e) => setClubRateScore(Number(e.target.value))}
                      className="w-16 bg-white border border-slate-300 rounded-md px-2 py-1 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await tlcApi.rateMatchPlayer(activeRateFix.id, {
                            playerTlcId: rateTargetPlayer.tlcId,
                            rating: Math.min(10, Math.max(1, clubRateScore)),
                            actor: 'Club Manager',
                          });
                          await onRefresh();
                          onNotify(
                            `Rated ${rateTargetPlayer.playerName} ${clubRateScore.toFixed(1)} in Match #${activeRateFix.matchNumber}.`
                          );
                        } catch (err: any) {
                          onNotify(err.message, true);
                        }
                      }}
                      className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-md"
                    >
                      Save Rating
                    </button>
                  </div>
                )}
              </div>

              {/* Club History */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-2">Club History</h4>
                <div className="space-y-2 text-xs text-slate-600 max-h-40 overflow-y-auto">
                  {activeClub.history.map((h) => (
                    <div key={h.id} className="flex gap-3">
                      <span className="font-mono text-slate-400 shrink-0 tabular-nums">{h.date}</span>
                      <span>{h.summary}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Create Club Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900">Create Official TLC Club</h3>
            <form onSubmit={handleCreateClub} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Club Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Valencia Sporting"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Short Code</label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="VAL"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Discord Role ID</label>
                  <input
                    type="text"
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Assign Manager (optional)</label>
                <select
                  value={newManagerId}
                  onChange={(e) => setNewManagerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Assign later</option>
                  {state.managers.map((m) => (
                    <option key={m.tlcId} value={m.tlcId}>
                      {m.managerName} ({m.tlcId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Club Logo URL (optional)</label>
                <input
                  type="text"
                  value={newLogo}
                  onChange={(e) => setNewLogo(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg"
                >
                  Create Club
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
