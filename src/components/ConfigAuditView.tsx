import { useState } from 'react';
import { ScrollText, Settings } from 'lucide-react';
import { TlcApiState, tlcApi } from '../lib/api.ts';

interface ConfigAuditViewProps {
  state: TlcApiState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function ConfigAuditView({ state, onRefresh, onNotify }: ConfigAuditViewProps) {
  const [channels, setChannels] = useState(state.config.channels);
  const [roles, setRoles] = useState(state.config.roles);
  const [staffRolesText, setStaffRolesText] = useState(state.config.roles.staffRoleIds.join(', '));
  const [competitionsCfg, setCompetitionsCfg] = useState(state.config.competitions);
  const [notificationsCfg, setNotificationsCfg] = useState(state.config.notifications);
  const [auditSearch, setAuditSearch] = useState('');

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await tlcApi.updateConfig({
        channels,
        roles: {
          ...roles,
          staffRoleIds: staffRolesText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
        competitions: competitionsCfg,
        notifications: notificationsCfg,
      });
      await onRefresh();
      onNotify('Bot configuration saved.');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const filteredLogs = state.auditLogs.filter((l) => {
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.actor.toLowerCase().includes(q) ||
      l.target.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Discord Bot Configuration */}
      <form
        onSubmit={handleSaveConfig}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-600" />
              Discord Bot Channel & Role Configuration
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              All channel IDs, role IDs, and automation toggles are persisted without hardcoding. Set DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID in Secrets to connect live.
            </p>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg shrink-0"
          >
            Save Configuration
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              #verify-yourself Channel ID
            </label>
            <input
              type="text"
              value={channels.verifyYourselfId}
              onChange={(e) => setChannels({ ...channels, verifyYourselfId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              #registration-requests Channel ID
            </label>
            <input
              type="text"
              value={channels.registrationRequestsId}
              onChange={(e) => setChannels({ ...channels, registrationRequestsId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              #transfer-market Channel ID
            </label>
            <input
              type="text"
              value={channels.transferMarketId}
              onChange={(e) => setChannels({ ...channels, transferMarketId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Fixtures Channel ID
            </label>
            <input
              type="text"
              value={channels.fixturesId}
              onChange={(e) => setChannels({ ...channels, fixturesId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Results Channel ID
            </label>
            <input
              type="text"
              value={channels.resultsId}
              onChange={(e) => setChannels({ ...channels, resultsId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              #tlc-audit-logs Channel ID
            </label>
            <input
              type="text"
              value={channels.auditLogsId}
              onChange={(e) => setChannels({ ...channels, auditLogsId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Verified Role ID</label>
            <input
              type="text"
              value={roles.verifiedRoleId}
              onChange={(e) => setRoles({ ...roles, verifiedRoleId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Player Role ID</label>
            <input
              type="text"
              value={roles.playerRoleId}
              onChange={(e) => setRoles({ ...roles, playerRoleId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Manager Role ID</label>
            <input
              type="text"
              value={roles.managerRoleId}
              onChange={(e) => setRoles({ ...roles, managerRoleId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Goalkeeper Role ID</label>
            <input
              type="text"
              value={roles.goalkeeperRoleId}
              onChange={(e) => setRoles({ ...roles, goalkeeperRoleId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Defender Role ID</label>
            <input
              type="text"
              value={roles.defenderRoleId}
              onChange={(e) => setRoles({ ...roles, defenderRoleId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Midfielder Role ID</label>
            <input
              type="text"
              value={roles.midfielderRoleId}
              onChange={(e) => setRoles({ ...roles, midfielderRoleId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Attacker Role ID</label>
            <input
              type="text"
              value={roles.attackerRoleId}
              onChange={(e) => setRoles({ ...roles, attackerRoleId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Staff Role IDs (comma-separated)
            </label>
            <input
              type="text"
              value={staffRolesText}
              onChange={(e) => setStaffRolesText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
            />
          </div>
        </div>

        {/* Rules & Notification Toggles */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={competitionsCfg.requireResultApproval}
              onChange={(e) =>
                setCompetitionsCfg({ ...competitionsCfg, requireResultApproval: e.target.checked })
              }
            />
            Require Staff Result Approval
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notificationsCfg.publishRegistrationAnnouncements}
              onChange={(e) =>
                setNotificationsCfg({
                  ...notificationsCfg,
                  publishRegistrationAnnouncements: e.target.checked,
                })
              }
            />
            Publish Registration Announcements
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notificationsCfg.announceTransfers}
              onChange={(e) =>
                setNotificationsCfg({ ...notificationsCfg, announceTransfers: e.target.checked })
              }
            />
            Announce Official Transfers (#transfer-market)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notificationsCfg.announceResults}
              onChange={(e) =>
                setNotificationsCfg({ ...notificationsCfg, announceResults: e.target.checked })
              }
            />
            Announce Official Match Results
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notificationsCfg.notifyFixtureChanges}
              onChange={(e) =>
                setNotificationsCfg({ ...notificationsCfg, notifyFixtureChanges: e.target.checked })
              }
            />
            Notify Managers on Fixture Changes
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notificationsCfg.notifyContractExpiring}
              onChange={(e) =>
                setNotificationsCfg({
                  ...notificationsCfg,
                  notifyContractExpiring: e.target.checked,
                })
              }
            />
            Notify Players on Expiring Contracts
          </label>
        </div>
      </form>

      {/* Audit Log Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-slate-500" />
            Permanent Audit Log (#tlc-audit-logs)
          </h3>
          <input
            type="text"
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
            placeholder="Filter action, actor, or target..."
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-64"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Performed By</th>
                <th className="py-2.5 px-4">Target</th>
                <th className="py-2.5 px-4">Previous → New</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.slice(0, 40).map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-900">{log.action}</td>
                  <td className="py-2.5 px-4 text-slate-700">{log.actor}</td>
                  <td className="py-2.5 px-4 text-emerald-700 font-medium">{log.target}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500">
                    {log.previousValue} → {log.newValue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
