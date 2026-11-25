import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw, Shield, Terminal } from 'lucide-react';
import { TlcApiState, tlcApi } from './lib/api.ts';
import { ClubBadge } from './components/ClubBadge.tsx';

export default function App() {
  const [state, setState] = useState<TlcApiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await tlcApi.getState();
      setState(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load TLC bot status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const channelChecklist = state
    ? [
        { label: 'Registration Channel', id: state.config.channels.verifyYourselfId },
        { label: 'Registration Review Channel', id: state.config.channels.registrationRequestsId },
        { label: 'Signing Request Channel (/demande)', id: state.config.channels.signingRequestsId || '' },
        { label: 'Team Management Channel', id: state.config.channels.teamManagementId || '' },
        { label: 'Transfer Market Channel', id: state.config.channels.transferMarketId },
        { label: 'Fixtures Channel', id: state.config.channels.fixturesId },
        { label: 'Results Channel', id: state.config.channels.resultsId },
        { label: 'Audit Log Channel', id: state.config.channels.auditLogsId },
        { label: 'Announcements Channel', id: state.config.channels.announcementsId },
      ]
    : [];

  const roleChecklist = state
    ? [
        { label: 'Verified Role', id: state.config.roles.verifiedRoleId },
        { label: 'Player Role', id: state.config.roles.playerRoleId },
        { label: 'Manager Role', id: state.config.roles.managerRoleId },
        { label: 'Goalkeeper Role', id: state.config.roles.goalkeeperRoleId },
        { label: 'Defender Role', id: state.config.roles.defenderRoleId },
        { label: 'Midfielder Role', id: state.config.roles.midfielderRoleId },
        { label: 'Attacker Role', id: state.config.roles.attackerRoleId },
        {
          label: 'Staff Roles',
          id: state.config.roles.staffRoleIds.length > 0 ? `${state.config.roles.staffRoleIds.length} selected` : '',
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClubBadge
            src="/src/assets/images/tlc_league_crest_1795467599044.jpg"
            name="Touchline"
            size="sm"
          />
          <div>
            <div className="text-sm font-bold text-slate-900">Touchline (TLC) Discord Bot</div>
            <div className="text-xs text-slate-500">Discord-Only Management & Manual Configuration</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {loading ? (
          <div className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ) : error || !state ? (
          <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
            <div className="font-semibold">Unable to reach TLC Bot runtime</div>
            <div className="mt-1 text-xs">{error}</div>
          </div>
        ) : (
          <>
            {/* Discord Gateway Summary */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  Discord Gateway Runtime
                </div>
                <h1 className="text-lg font-bold text-slate-900">
                  {state.botStatus.connected
                    ? `Online as ${state.botStatus.botTag}`
                    : 'Waiting for Discord Bot Connection'}
                </h1>
                <p className="text-xs text-slate-600">
                  All server roles, channels, registrations, transfers, fixtures, and approvals are managed directly inside Discord.
                </p>
                {state.botStatus.lastError && !state.botStatus.connected && (
                  <p className="text-xs font-mono text-amber-700 mt-1">{state.botStatus.lastError}</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                <div>
                  <div className="text-xs text-slate-500">Servers</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {state.botStatus.guildCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Commands</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {state.botStatus.commandsDeployedCount || 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">TLC Profiles</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                    {state.players.filter((p) => p.status !== 'Deleted').length +
                      state.managers.filter((m) => m.status !== 'Deleted').length}
                  </div>
                </div>
              </div>
            </section>

            {/* Discord /setup Configuration Checklist (Read-Only) */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-bold text-slate-900">Discord Channels (/setup)</h2>
                  <span className="text-xs font-mono text-slate-500">
                    {channelChecklist.filter((c) => Boolean(c.id)).length}/{channelChecklist.length} set
                  </span>
                </div>
                <div className="space-y-2">
                  {channelChecklist.map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{item.label}</span>
                      {item.id ? (
                        <span className="inline-flex items-center gap-1 font-mono text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {item.id}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <CircleAlert className="w-3.5 h-3.5" />
                          Run /setup in Discord
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-bold text-slate-900">Discord Roles (/setup)</h2>
                  <span className="text-xs font-mono text-slate-500">
                    {roleChecklist.filter((r) => Boolean(r.id)).length}/{roleChecklist.length} set
                  </span>
                </div>
                <div className="space-y-2">
                  {roleChecklist.map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{item.label}</span>
                      {item.id ? (
                        <span className="inline-flex items-center gap-1 font-mono text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {item.id}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <CircleAlert className="w-3.5 h-3.5" />
                          Run /setup in Discord
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Discord Command Reference */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Terminal className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">Discord Slash Commands</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono font-semibold text-emerald-700">/setup general &amp; /setup teams</div>
                  <div className="text-slate-600 mt-0.5">
                    Admin: Native Discord role &amp; channel selectors to manually bind server channels, roles, team signing channels, and multi-team role rules.
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono font-semibold text-emerald-700">/create-team &amp; /delete-team</div>
                  <div className="text-slate-600 mt-0.5">
                    Admin: Create teams using native Discord role &amp; owner pickers with emoji logos, or safely deactivate teams while preserving history.
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono font-semibold text-emerald-700">/demande &amp; /release</div>
                  <div className="text-slate-600 mt-0.5">
                    Players request to join teams via dropdown for Staff Approve/Cancel review; Team Owners &amp; Admins release players with automatic role sync.
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono font-semibold text-emerald-700">/teams, /team, /roster &amp; /transfer-history</div>
                  <div className="text-slate-600 mt-0.5">
                    Browse active teams, inspect team profiles, view rosters, and check player transfer history directly in Discord.
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono font-semibold text-emerald-700">/post-verify-panel &amp; /register</div>
                  <div className="text-slate-600 mt-0.5">
                    Post permanent Verify button or register directly as Player/Manager; Staff click APPROVE or CANCEL in your review channel.
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono font-semibold text-emerald-700">/sign-player, /fixtures, /result &amp; /rate</div>
                  <div className="text-slate-600 mt-0.5">
                    Manage free-agent offers, match schedules, APPROVE/CANCEL result reviews, and player match ratings (1.0–10.0).
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono font-semibold text-emerald-700">/delete-player, /restore-player, /delete-manager &amp; /restore-manager</div>
                  <div className="text-slate-600 mt-0.5">
                    Admin: Searchable soft-delete &amp; restoration of player and manager profiles with Discord role cleanup and full preservation of match, transfer &amp; trophy history.
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-mono font-semibold text-emerald-700">/rejected-requests</div>
                  <div className="text-slate-600 mt-0.5">
                    Staff: Browse previously rejected registrations, signings, transfers, and match results with their mandatory rejection reasons.
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
