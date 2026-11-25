import { useState } from 'react';
import { Calendar, Plus, Trophy } from 'lucide-react';
import { CompetitionType, Fixture, FixtureStatus, PlayerMatchStat } from '../shared/types.ts';
import { TlcApiState, tlcApi } from '../lib/api.ts';
import { ClubBadge } from './ClubBadge.tsx';

interface CompetitionsMatchesViewProps {
  state: TlcApiState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function CompetitionsMatchesView({
  state,
  onRefresh,
  onNotify,
}: CompetitionsMatchesViewProps) {
  const [selectedCompId, setSelectedCompId] = useState<string>(state.competitions[0]?.id || '');
  const [showCreateComp, setShowCreateComp] = useState(false);

  // Create Competition Form
  const [compName, setCompName] = useState('');
  const [compType, setCompType] = useState<CompetitionType>('League');
  const [compSeason, setCompSeason] = useState('Season 1');
  const [compFormat, setCompFormat] = useState<'Single Leg' | 'Home & Away'>('Home & Away');
  const [compClubs, setCompClubs] = useState<string[]>(state.clubs.map((c) => c.clubId));

  // Create Fixture Modal (/fixture-create)
  const [showCreateFixture, setShowCreateFixture] = useState(false);
  const [newFixHomeId, setNewFixHomeId] = useState(state.clubs[0]?.clubId || '');
  const [newFixAwayId, setNewFixAwayId] = useState(state.clubs[1]?.clubId || '');
  const [newFixRound, setNewFixRound] = useState('Matchday 4');
  const [newFixDate, setNewFixDate] = useState(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  const [newFixTime, setNewFixTime] = useState('20:00 UTC');
  const [newFixRef, setNewFixRef] = useState('');

  // Edit / Reschedule Fixture Modal (/fixture-edit)
  const [editingFixture, setEditingFixture] = useState<Fixture | null>(null);
  const [editFixRound, setEditFixRound] = useState('');
  const [editFixDate, setEditFixDate] = useState('');
  const [editFixTime, setEditFixTime] = useState('');
  const [editFixRef, setEditFixRef] = useState('');

  // Register Team for Competition (/register-team)
  const [showRegisterTeam, setShowRegisterTeam] = useState(false);
  const [regClubId, setRegClubId] = useState(state.clubs[0]?.clubId || '');
  const [regManagerId, setRegManagerId] = useState(state.managers[0]?.tlcId || '');

  // Matchday Player Rating Sheet (/rate)
  const [ratingFixture, setRatingFixture] = useState<Fixture | null>(null);
  const [ratePlayerId, setRatePlayerId] = useState('');
  const [rateScore, setRateScore] = useState(8.0);
  const [rateGoals, setRateGoals] = useState(0);
  const [rateAssists, setRateAssists] = useState(0);
  const [rateSaves, setRateSaves] = useState(0);
  const [rateCleanSheet, setRateCleanSheet] = useState(false);
  const [rateMotm, setRateMotm] = useState(false);

  // Result Submission Modal
  const [resultFixture, setResultFixture] = useState<Fixture | null>(null);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [resultNotes, setResultNotes] = useState('');
  const [statPlayerId, setStatPlayerId] = useState(state.players[0]?.tlcId || '');
  const [statGoals, setStatGoals] = useState(1);
  const [statAssists, setStatAssists] = useState(0);
  const [statSaves, setStatSaves] = useState(0);
  const [statRating, setStatRating] = useState(8.0);
  const [statCleanSheet, setStatCleanSheet] = useState(false);
  const [statMotm, setStatMotm] = useState(true);
  const [queuedStats, setQueuedStats] = useState<PlayerMatchStat[]>([]);

  const selectedComp =
    state.competitions.find((c) => c.id === selectedCompId) || state.competitions[0];
  const compFixtures = selectedComp
    ? state.fixtures.filter((f) => f.competitionId === selectedComp.id)
    : [];
  const compTeamRegs = selectedComp
    ? state.competitionRegistrations.filter((r) => r.competitionId === selectedComp.id)
    : [];
  const standings = selectedComp ? state.standingsByCompetition[selectedComp.id] || [] : [];

  const clubName = (id: string | null) =>
    id ? state.clubs.find((c) => c.clubId === id)?.name || id : 'TBD';
  const clubLogo = (id: string | null) =>
    id ? state.clubs.find((c) => c.clubId === id)?.logoUrl : null;

  const handleCreateComp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = (await tlcApi.createCompetition({
        name: compName,
        type: compType,
        season: compSeason,
        matchFormat: compFormat,
        participatingClubIds: compClubs,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
      })) as { id: string; name: string };
      setSelectedCompId(created.id);
      setShowCreateComp(false);
      setCompName('');
      await onRefresh();
      onNotify(`Created competition ${created.name}.`);
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const addQueuedStat = () => {
    const p = state.players.find((x) => x.tlcId === statPlayerId);
    if (!p) return;
    setQueuedStats((prev) => [
      ...prev.filter((x) => x.playerTlcId !== p.tlcId),
      {
        playerTlcId: p.tlcId,
        playerName: p.playerName,
        clubId: p.currentClubId || resultFixture?.homeClubId || '',
        goals: Number(statGoals),
        assists: Number(statAssists),
        saves: Number(statSaves),
        cleanSheet: statCleanSheet,
        rating: Number(statRating),
        manOfTheMatch: statMotm,
      },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Header & Competition Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {state.competitions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCompId(c.id)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                selectedComp?.id === c.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowCreateComp(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Competition
        </button>
      </div>

      {selectedComp && (
        <>
          {/* Competition Meta & Fixture Generator Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-emerald-700">
                {selectedComp.type} · {selectedComp.season} · {selectedComp.matchFormat} · {selectedComp.status}
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5">{selectedComp.name}</h2>
              <p className="text-xs text-slate-500 mt-1">
                {selectedComp.participatingClubIds.length} Participating Clubs · {selectedComp.rules}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowRegisterTeam(true)}
                className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg"
              >
                Register Team (/register-team)
              </button>
              <button
                type="button"
                onClick={() => setShowCreateFixture(true)}
                className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Fixture
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const created = (await tlcApi.generateFixtures(selectedComp.id)) as Fixture[];
                    await onRefresh();
                    onNotify(`Generated ${created.length} fixtures for ${selectedComp.name}.`);
                  } catch (err: any) {
                    onNotify(err.message, true);
                  }
                }}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                Generate {selectedComp.type === 'Knockout Tournament' ? 'Bracket' : 'Fixtures'}
              </button>
            </div>
          </div>

          {compTeamRegs.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-slate-700">Competition Team Entries</h3>
              <div className="divide-y divide-slate-100">
                {compTeamRegs.map((reg) => (
                  <div key={reg.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-semibold text-slate-900">{reg.clubName}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="font-mono text-slate-600">{reg.rosterTlcIds.length} Players</span>
                      <span className="text-slate-400"> · </span>
                      <span
                        className={
                          reg.status === 'Approved'
                            ? 'text-emerald-700 font-medium'
                            : reg.status === 'Rejected'
                            ? 'text-red-600 font-medium'
                            : 'text-amber-600 font-medium'
                        }
                      >
                        {reg.status}
                      </span>
                    </div>
                    {reg.status === 'Pending' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await tlcApi.reviewCompetitionRegistration(reg.id, 'approve');
                            await onRefresh();
                            onNotify(`Approved ${reg.clubName} entry.`);
                          }}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded-md font-medium"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await tlcApi.reviewCompetitionRegistration(reg.id, 'reject');
                            await onRefresh();
                            onNotify(`Rejected ${reg.clubName} entry.`);
                          }}
                          className="px-2.5 py-1 border border-red-200 text-red-600 rounded-md font-medium"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Standings Table (for League / Group) OR Bracket (for Knockout) */}
          {selectedComp.type !== 'Knockout Tournament' ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-emerald-600" />
                  Official League Standings (/table)
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  W:{selectedComp.pointsWin} · D:{selectedComp.pointsDraw} · L:{selectedComp.pointsLoss}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2.5 px-4 w-10">#</th>
                      <th className="py-2.5 px-4">Club</th>
                      <th className="py-2.5 px-3 text-right">MP</th>
                      <th className="py-2.5 px-3 text-right">W</th>
                      <th className="py-2.5 px-3 text-right">D</th>
                      <th className="py-2.5 px-3 text-right">L</th>
                      <th className="py-2.5 px-3 text-right">GF</th>
                      <th className="py-2.5 px-3 text-right">GA</th>
                      <th className="py-2.5 px-3 text-right">GD</th>
                      <th className="py-2.5 px-4 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {standings.map((row) => (
                      <tr key={row.clubId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-slate-500">
                          {row.position}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <ClubBadge src={row.clubLogoUrl} name={row.clubName} size="sm" />
                            <span className="font-semibold text-slate-900">{row.clubName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.played}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.won}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.drawn}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.lost}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.goalsFor}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.goalsAgainst}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {row.goalDifference >= 0 ? `+${row.goalDifference}` : row.goalDifference}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {row.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-600" />
                Knockout Bracket Progression
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(['Quarter-Final', 'Semi-Final', 'Final'] as const).map((round) => {
                  const roundMatches = compFixtures.filter((f) => f.roundLabel === round);
                  if (roundMatches.length === 0) return null;
                  return (
                    <div key={round} className="space-y-3">
                      <div className="text-xs font-semibold text-slate-500">{round}</div>
                      {roundMatches.map((m) => (
                        <div key={m.id} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
                          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                            <span>Match #{m.matchNumber}</span>
                            <span>{m.status}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm font-semibold">
                            <span className="truncate">{clubName(m.homeClubId)}</span>
                            <span className="font-mono tabular-nums">{m.homeScore ?? '—'}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm font-semibold">
                            <span className="truncate">{clubName(m.awayClubId)}</span>
                            <span className="font-mono tabular-nums">{m.awayScore ?? '—'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fixtures & Results Schedule */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Fixtures & Match Results</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {compFixtures.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No fixtures generated yet. Click Generate Fixtures above.
                </div>
              ) : (
                compFixtures.map((fix) => (
                  <div
                    key={fix.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/60"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="font-mono text-xs text-slate-500 w-16 shrink-0 tabular-nums">
                        #{fix.matchNumber}
                        <div className="text-[11px] text-slate-400">{fix.roundLabel}</div>
                      </div>

                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <ClubBadge src={clubLogo(fix.homeClubId)} name={clubName(fix.homeClubId)} size="sm" />
                          <span className="font-semibold text-sm text-slate-900 truncate">
                            {clubName(fix.homeClubId)}
                          </span>
                        </div>
                        <span className="font-mono text-sm font-bold px-2 py-0.5 bg-slate-100 rounded tabular-nums">
                          {fix.homeScore !== undefined && fix.awayScore !== undefined
                            ? `${fix.homeScore} – ${fix.awayScore}`
                            : 'vs'}
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                          <ClubBadge src={clubLogo(fix.awayClubId)} name={clubName(fix.awayClubId)} size="sm" />
                          <span className="font-semibold text-sm text-slate-900 truncate">
                            {clubName(fix.awayClubId)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {fix.matchDate} · {fix.matchTime} · {fix.status}
                        {fix.referee ? ` · Ref: ${fix.referee}` : ''}
                      </div>

                      {fix.homeClubId && fix.awayClubId && (
                        <button
                          type="button"
                          onClick={() => {
                            const eligible = state.players.filter(
                              (p) =>
                                p.currentClubId === fix.homeClubId ||
                                p.currentClubId === fix.awayClubId
                            );
                            setRatingFixture(fix);
                            setRatePlayerId(eligible[0]?.tlcId || '');
                            setRateScore(8.0);
                            setRateGoals(0);
                            setRateAssists(0);
                            setRateSaves(0);
                            setRateCleanSheet(false);
                            setRateMotm(false);
                          }}
                          className="px-2.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-medium rounded-md"
                        >
                          Rate Players ({fix.playerStats?.length || 0})
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingFixture(fix);
                          setEditFixRound(fix.roundLabel);
                          setEditFixDate(fix.matchDate);
                          setEditFixTime(fix.matchTime);
                          setEditFixRef(fix.referee || '');
                        }}
                        className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-md"
                      >
                        Edit Fixture
                      </button>

                      {fix.status !== 'Completed' && fix.homeClubId && fix.awayClubId && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setResultFixture(fix);
                              setHomeScore(fix.homeScore ?? 0);
                              setAwayScore(fix.awayScore ?? 0);
                              setResultNotes(fix.notes || '');
                              setQueuedStats(fix.playerStats || []);
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md"
                          >
                            Submit Result
                          </button>
                          <select
                            value={fix.status}
                            onChange={async (e) => {
                              await tlcApi.editFixture(fix.id, {
                                status: e.target.value as FixtureStatus,
                              });
                              await onRefresh();
                              onNotify(`Match #${fix.matchNumber} marked ${e.target.value}.`);
                            }}
                            className="border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700"
                          >
                            <option value="Scheduled">Scheduled</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Postponed">Postponed</option>
                            <option value="Cancelled">Cancelled</option>
                            <option value="Forfeit">Forfeit</option>
                          </select>
                        </>
                      )}

                      {fix.resultStatus === 'Pending Approval' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await tlcApi.approveResult(fix.id);
                            await onRefresh();
                            onNotify(`Official result approved for Match #${fix.matchNumber}.`);
                          }}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-md"
                        >
                          Approve Result
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Create Competition Modal */}
      {showCreateComp && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900">Create Competition</h3>
            <form onSubmit={handleCreateComp} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Competition Name</label>
                <input
                  type="text"
                  required
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="e.g. TLC Champions Shield"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={compType}
                    onChange={(e) => setCompType(e.target.value as CompetitionType)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="League">League</option>
                    <option value="Knockout Tournament">Knockout Tournament</option>
                    <option value="Group Stage">Group Stage</option>
                    <option value="Group Stage + Knockout">Group Stage + Knockout</option>
                    <option value="Friendly Matches">Friendly Matches</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Format</label>
                  <select
                    value={compFormat}
                    onChange={(e) => setCompFormat(e.target.value as 'Single Leg' | 'Home & Away')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="Home & Away">Home & Away</option>
                    <option value="Single Leg">Single Leg</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Season</label>
                <input
                  type="text"
                  required
                  value={compSeason}
                  onChange={(e) => setCompSeason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Participating Clubs</label>
                <div className="space-y-1 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2">
                  {state.clubs.map((c) => (
                    <label key={c.clubId} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={compClubs.includes(c.clubId)}
                        onChange={(e) => {
                          if (e.target.checked) setCompClubs((prev) => [...prev, c.clubId]);
                          else setCompClubs((prev) => prev.filter((x) => x !== c.clubId));
                        }}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateComp(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg"
                >
                  Create Competition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Match Result + Player Match Stats Modal */}
      {resultFixture && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">
              Submit Match Result · #{resultFixture.matchNumber}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {clubName(resultFixture.homeClubId)} vs {clubName(resultFixture.awayClubId)}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {clubName(resultFixture.homeClubId)} Score
                </label>
                <input
                  type="number"
                  min={0}
                  value={homeScore}
                  onChange={(e) => setHomeScore(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {clubName(resultFixture.awayClubId)} Score
                </label>
                <input
                  type="number"
                  min={0}
                  value={awayScore}
                  onChange={(e) => setAwayScore(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">Match Notes</label>
              <input
                type="text"
                value={resultNotes}
                onChange={(e) => setResultNotes(e.target.value)}
                placeholder="Optional match summary..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {/* Optional Player Match Stats */}
            <div className="mt-5 pt-4 border-t border-slate-200">
              <h4 className="text-xs font-bold text-slate-800 mb-2">
                Optional Player Match Statistics
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <select
                  value={statPlayerId}
                  onChange={(e) => setStatPlayerId(e.target.value)}
                  className="col-span-2 sm:col-span-3 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                >
                  {state.players
                    .filter(
                      (p) =>
                        p.currentClubId === resultFixture.homeClubId ||
                        p.currentClubId === resultFixture.awayClubId
                    )
                    .map((p) => (
                      <option key={p.tlcId} value={p.tlcId}>
                        {p.playerName} ({p.position})
                      </option>
                    ))}
                </select>
                <div>
                  <label className="text-[11px] text-slate-500">Goals</label>
                  <input
                    type="number"
                    min={0}
                    value={statGoals}
                    onChange={(e) => setStatGoals(Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Assists</label>
                  <input
                    type="number"
                    min={0}
                    value={statAssists}
                    onChange={(e) => setStatAssists(Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Saves</label>
                  <input
                    type="number"
                    min={0}
                    value={statSaves}
                    onChange={(e) => setStatSaves(Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Rating</label>
                  <input
                    type="number"
                    step={0.1}
                    min={1}
                    max={10}
                    value={statRating}
                    onChange={(e) => setStatRating(Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 pt-4">
                  <input
                    type="checkbox"
                    checked={statCleanSheet}
                    onChange={(e) => setStatCleanSheet(e.target.checked)}
                  />
                  Clean Sheet
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 pt-4">
                  <input
                    type="checkbox"
                    checked={statMotm}
                    onChange={(e) => setStatMotm(e.target.checked)}
                  />
                  MOTM
                </label>
              </div>
              <button
                type="button"
                onClick={addQueuedStat}
                className="mt-2 px-3 py-1 border border-slate-300 text-xs font-medium rounded-md hover:bg-slate-50"
              >
                + Add Player Line
              </button>

              {queuedStats.length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  {queuedStats.map((s) => (
                    <div key={s.playerTlcId} className="font-mono">
                      {s.playerName}: {s.goals}G {s.assists}A {s.saves}SV · Rating {s.rating}
                      {s.manOfTheMatch ? ' · MOTM' : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResultFixture(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await tlcApi.submitResult(resultFixture.id, {
                      homeScore,
                      awayScore,
                      notes: resultNotes,
                      playerStats: queuedStats,
                      autoApprove: !state.config.competitions.requireResultApproval,
                    });
                    setResultFixture(null);
                    await onRefresh();
                    onNotify('Match result submitted.');
                  } catch (err: any) {
                    onNotify(err.message, true);
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg"
              >
                Submit Result
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Fixture Modal (/fixture-create) */}
      {showCreateFixture && selectedComp && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900">Create Fixture · {selectedComp.name}</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await tlcApi.createFixture({
                    competitionId: selectedComp.id,
                    roundLabel: newFixRound,
                    homeClubId: newFixHomeId,
                    awayClubId: newFixAwayId,
                    matchDate: newFixDate,
                    matchTime: newFixTime,
                    referee: newFixRef || undefined,
                  });
                  setShowCreateFixture(false);
                  await onRefresh();
                  onNotify('New fixture scheduled and participating managers notified.');
                } catch (err: any) {
                  onNotify(err.message, true);
                }
              }}
              className="mt-4 space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Home Club</label>
                  <select
                    value={newFixHomeId}
                    onChange={(e) => setNewFixHomeId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {state.clubs.map((c) => (
                      <option key={c.clubId} value={c.clubId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Away Club</label>
                  <select
                    value={newFixAwayId}
                    onChange={(e) => setNewFixAwayId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {state.clubs.map((c) => (
                      <option key={c.clubId} value={c.clubId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Match Date</label>
                  <input
                    type="date"
                    required
                    value={newFixDate}
                    onChange={(e) => setNewFixDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kickoff Time</label>
                  <input
                    type="text"
                    required
                    value={newFixTime}
                    onChange={(e) => setNewFixTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Round Label</label>
                  <input
                    type="text"
                    required
                    value={newFixRound}
                    onChange={(e) => setNewFixRound(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Referee (optional)</label>
                  <input
                    type="text"
                    value={newFixRef}
                    onChange={(e) => setNewFixRef(e.target.value)}
                    placeholder="Ref_Julian"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFixture(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg"
                >
                  Schedule Fixture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Reschedule Fixture Modal */}
      {editingFixture && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900">
              Edit Fixture #{editingFixture.matchNumber}
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await tlcApi.editFixture(editingFixture.id, {
                    roundLabel: editFixRound,
                    matchDate: editFixDate,
                    matchTime: editFixTime,
                    referee: editFixRef,
                  });
                  setEditingFixture(null);
                  await onRefresh();
                  onNotify(`Fixture #${editingFixture.matchNumber} updated.`);
                } catch (err: any) {
                  onNotify(err.message, true);
                }
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Round Label</label>
                <input
                  type="text"
                  required
                  value={editFixRound}
                  onChange={(e) => setEditFixRound(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Match Date</label>
                  <input
                    type="date"
                    required
                    value={editFixDate}
                    onChange={(e) => setEditFixDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kickoff Time</label>
                  <input
                    type="text"
                    required
                    value={editFixTime}
                    onChange={(e) => setEditFixTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Referee</label>
                <input
                  type="text"
                  value={editFixRef}
                  onChange={(e) => setEditFixRef(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingFixture(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg"
                >
                  Save Fixture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register Team for Competition Modal (/register-team) */}
      {showRegisterTeam && selectedComp && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900">
              Register Club · {selectedComp.name}
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const rosterIds = state.players
                    .filter((p) => p.currentClubId === regClubId)
                    .map((p) => p.tlcId);
                  await tlcApi.registerTeamForCompetition(selectedComp.id, {
                    clubId: regClubId,
                    managerTlcId: regManagerId,
                    rosterTlcIds: rosterIds,
                  });
                  setShowRegisterTeam(false);
                  await onRefresh();
                  onNotify('Club competition entry submitted for staff approval.');
                } catch (err: any) {
                  onNotify(err.message, true);
                }
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Club</label>
                <select
                  value={regClubId}
                  onChange={(e) => setRegClubId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {state.clubs.map((c) => (
                    <option key={c.clubId} value={c.clubId}>
                      {c.name} ({state.players.filter((p) => p.currentClubId === c.clubId).length} players)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Verified Manager</label>
                <select
                  value={regManagerId}
                  onChange={(e) => setRegManagerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {state.managers.map((m) => (
                    <option key={m.tlcId} value={m.tlcId}>
                      {m.managerName} ({m.tlcId})
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterTeam(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg"
                >
                  Submit Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Matchday Player Rating Sheet Modal (/rate) */}
      {ratingFixture && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Match Player Ratings · #{ratingFixture.matchNumber}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {clubName(ratingFixture.homeClubId)} vs {clubName(ratingFixture.awayClubId)} ({ratingFixture.roundLabel})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRatingFixture(null)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            {/* Recorded Match Ratings Table */}
            <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-3">Player</th>
                    <th className="py-2 px-3 text-right">G / A</th>
                    <th className="py-2 px-3 text-right">Saves</th>
                    <th className="py-2 px-3 text-right">Rating</th>
                    <th className="py-2 px-3 text-right">MOTM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(ratingFixture.playerStats || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">
                        No player ratings recorded for this match yet.
                      </td>
                    </tr>
                  ) : (
                    (ratingFixture.playerStats || []).map((ps) => (
                      <tr key={ps.playerTlcId}>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {ps.playerName}{' '}
                          <span className="font-mono text-slate-400">({ps.playerTlcId})</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {ps.goals} / {ps.assists}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{ps.saves}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {ps.rating.toFixed(1)}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-amber-700">
                          {ps.manOfTheMatch ? 'MOTM' : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Rate / Update Player Performance Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = (await tlcApi.rateMatchPlayer(ratingFixture.id, {
                    playerTlcId: ratePlayerId,
                    rating: rateScore,
                    goals: rateGoals,
                    assists: rateAssists,
                    saves: rateSaves,
                    cleanSheet: rateCleanSheet,
                    manOfTheMatch: rateMotm,
                  })) as { fixture: Fixture };
                  setRatingFixture(res.fixture);
                  await onRefresh();
                  onNotify(`Saved match rating (${rateScore.toFixed(1)}) for player.`);
                } catch (err: any) {
                  onNotify(err.message, true);
                }
              }}
              className="mt-5 pt-4 border-t border-slate-200 space-y-3"
            >
              <h4 className="text-xs font-bold text-slate-800">Grade Player Performance (/rate)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Player</label>
                  <select
                    value={ratePlayerId}
                    onChange={(e) => setRatePlayerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  >
                    {state.players
                      .filter(
                        (p) =>
                          p.currentClubId === ratingFixture.homeClubId ||
                          p.currentClubId === ratingFixture.awayClubId
                      )
                      .map((p) => (
                        <option key={p.tlcId} value={p.tlcId}>
                          {p.playerName} ({p.position})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Rating (1.0 – 10.0): <span className="font-mono font-bold text-emerald-700">{rateScore.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.1}
                    value={rateScore}
                    onChange={(e) => setRateScore(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 items-end">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Goals</label>
                  <input
                    type="number"
                    min={0}
                    value={rateGoals}
                    onChange={(e) => setRateGoals(Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Assists</label>
                  <input
                    type="number"
                    min={0}
                    value={rateAssists}
                    onChange={(e) => setRateAssists(Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Saves</label>
                  <input
                    type="number"
                    min={0}
                    value={rateSaves}
                    onChange={(e) => setRateSaves(Number(e.target.value))}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 pb-1">
                  <input
                    type="checkbox"
                    checked={rateCleanSheet}
                    onChange={(e) => setRateCleanSheet(e.target.checked)}
                  />
                  Clean Sheet
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 pb-1">
                  <input
                    type="checkbox"
                    checked={rateMotm}
                    onChange={(e) => setRateMotm(e.target.checked)}
                  />
                  MOTM
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg"
                >
                  Save Player Rating
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
