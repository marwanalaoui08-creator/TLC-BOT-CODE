import { useEffect, useState } from 'react';
import { Award, Trophy } from 'lucide-react';
import { TlcApiState, tlcApi } from '../lib/api.ts';

interface AwardsLeaderboardsViewProps {
  state: TlcApiState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

const PRESET_AWARDS = [
  'Golden Boot',
  'Golden Glove',
  'Ballon d’Or',
  'Player of the Season',
  'Team of the Season',
  'Player of the Month',
  'Manager of the Season',
  'Manager of the Month',
  'Best Manager',
  'League Champion',
  'Cup Winner',
  'Runner-Up',
];

export function AwardsLeaderboardsView({
  state,
  onRefresh,
  onNotify,
}: AwardsLeaderboardsViewProps) {
  const [category, setCategory] = useState<
    'goals' | 'assists' | 'saves' | 'matches' | 'ratings' | 'trophies' | 'managers'
  >('goals');
  const [compFilter, setCompFilter] = useState<string>('all');
  const [rows, setRows] = useState<
    {
      rank: number;
      tlcId: string;
      name: string;
      position?: string;
      clubName: string;
      primaryValue: number;
      secondaryLabel: string;
    }[]
  >([]);

  const [awardName, setAwardName] = useState('Golden Boot');
  const [recipientType, setRecipientType] = useState<'Player' | 'Manager' | 'Club'>('Player');
  const [recipientId, setRecipientId] = useState(state.players[0]?.tlcId || '');
  const [awardCompId, setAwardCompId] = useState(state.competitions[0]?.id || '');

  useEffect(() => {
    tlcApi
      .getLeaderboard(category, compFilter)
      .then(setRows)
      .catch(() => {});
  }, [category, compFilter, state]);

  const handleGrantAward = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await tlcApi.grantAward({
        name: awardName,
        recipientType,
        recipientId,
        competitionId: awardCompId || undefined,
      });
      await onRefresh();
      onNotify(`Awarded ${awardName}.`);
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Leaderboards */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-emerald-600" />
            Official TLC Leaderboards
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'goals', label: 'Goals' },
                  { id: 'assists', label: 'Assists' },
                  { id: 'saves', label: 'Goalkeepers' },
                  { id: 'matches', label: 'Matches' },
                  { id: 'ratings', label: 'Ratings' },
                  { id: 'trophies', label: 'Trophies' },
                  { id: 'managers', label: 'Managers' },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    category === c.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {category !== 'managers' && (
              <select
                value={compFilter}
                onChange={(e) => setCompFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="all">All Competitions</option>
                {state.competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.season})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 px-4 w-14">Rank</th>
                <th className="py-2.5 px-4">TLC ID</th>
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4">Club</th>
                <th className="py-2.5 px-4">Details</th>
                <th className="py-2.5 px-4 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No leaderboard records for this filter yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.tlcId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-slate-600">
                      #{r.rank}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{r.tlcId}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{r.name}</td>
                    <td className="py-2.5 px-4 text-slate-700">{r.clubName}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-500">{r.secondaryLabel}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                      {r.primaryValue}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grant Award & Official Honours */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600" />
            Grant Official Award (/award)
          </h3>
          <form onSubmit={handleGrantAward} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Award Title</label>
              <select
                value={awardName}
                onChange={(e) => setAwardName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {PRESET_AWARDS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Recipient Type</label>
              <select
                value={recipientType}
                onChange={(e) => {
                  const t = e.target.value as 'Player' | 'Manager' | 'Club';
                  setRecipientType(t);
                  if (t === 'Player') setRecipientId(state.players[0]?.tlcId || '');
                  else if (t === 'Manager') setRecipientId(state.managers[0]?.tlcId || '');
                  else setRecipientId(state.clubs[0]?.clubId || '');
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Player">Player</option>
                <option value="Manager">Manager</option>
                <option value="Club">Club</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Recipient</label>
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {recipientType === 'Player' &&
                  state.players.map((p) => (
                    <option key={p.tlcId} value={p.tlcId}>
                      {p.playerName} ({p.tlcId})
                    </option>
                  ))}
                {recipientType === 'Manager' &&
                  state.managers.map((m) => (
                    <option key={m.tlcId} value={m.tlcId}>
                      {m.managerName} ({m.tlcId})
                    </option>
                  ))}
                {recipientType === 'Club' &&
                  state.clubs.map((c) => (
                    <option key={c.clubId} value={c.clubId}>
                      {c.name} ({c.clubId})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Competition</label>
              <select
                value={awardCompId}
                onChange={(e) => setAwardCompId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Community-Wide</option>
                {state.competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg"
            >
              Grant Official Award
            </button>
          </form>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Honours & Awards Registry</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {state.awards.map((a) => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="font-semibold text-slate-900">{a.name}</div>
                  <div className="text-xs text-slate-500">
                    {a.recipientType}: {a.recipientName} ({a.recipientId})
                    {a.competitionName ? ` · ${a.competitionName}` : ''}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400 font-mono tabular-nums">
                  {a.awardedAt.slice(0, 10)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
