import { useState } from 'react';
import { ArrowRightLeft, FileText, Lock, Unlock } from 'lucide-react';
import { TransferType } from '../shared/types.ts';
import { TlcApiState, tlcApi } from '../lib/api.ts';

interface TransfersContractsViewProps {
  state: TlcApiState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

const TEAM_SIGN_PRESETS = [
  { label: '1 Season (60d) — First Team', value: '1 Season (60d) · First Team' },
  { label: '2 Seasons (120d) — Key Player', value: '2 Seasons (120d) · Key Player' },
  { label: 'Short-Term Loan (30d)', value: '30d Loan · Squad Rotation' },
  { label: 'Trial Contract (14d)', value: '14d Trial · Reserve Squad' },
];

export function TransfersContractsView({
  state,
  onRefresh,
  onNotify,
}: TransfersContractsViewProps) {
  const [subTab, setSubTab] = useState<'transfers' | 'contracts'>('transfers');

  // Team Sign & Offer Form State
  const [playerPoolFilter, setPlayerPoolFilter] = useState<'free-agents' | 'all'>('free-agents');
  const [offerPlayerId, setOfferPlayerId] = useState(
    () =>
      state.players.find((p) => !p.currentClubId)?.tlcId ||
      state.players[0]?.tlcId ||
      ''
  );
  const [offerClubId, setOfferClubId] = useState(state.clubs[0]?.clubId || '');
  const [offerManagerId, setOfferManagerId] = useState(state.managers[0]?.tlcId || '');
  const [offerType, setOfferType] = useState<TransferType>('Signing');
  const [contractPreset, setContractPreset] = useState(TEAM_SIGN_PRESETS[0].value);
  const [offerDetails, setOfferDetails] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);

  // Direct Action State
  const [directPlayerId, setDirectPlayerId] = useState(state.players[0]?.tlcId || '');
  const [directAction, setDirectAction] = useState<'Release' | 'Resignation' | 'Return from Loan'>('Release');

  const win = state.config.transferWindow;
  const freeAgents = state.players.filter((p) => !p.currentClubId);
  const selectablePlayers =
    playerPoolFilter === 'free-agents' && freeAgents.length > 0 ? freeAgents : state.players;

  const handleOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerPlayerId || !offerClubId || !offerManagerId) {
      onNotify('Select a player, club, and manager first.', true);
      return;
    }
    setSubmittingOffer(true);
    try {
      const mergedDetails = offerDetails.trim()
        ? `${contractPreset} — ${offerDetails.trim()}`
        : contractPreset;
      await tlcApi.submitTransferOffer({
        playerTlcId: offerPlayerId,
        toClubId: offerClubId,
        managerTlcId: offerManagerId,
        transferType: offerType,
        details: mergedDetails,
      });
      setOfferDetails('');
      await onRefresh();
      onNotify('Team Sign / Transfer offer sent to player for response.');
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleToggleWindow = async () => {
    try {
      await tlcApi.updateConfig({
        transferWindow: { ...win, isOpen: !win.isOpen },
      });
      await onRefresh();
      onNotify(`Transfer window is now ${!win.isOpen ? 'OPEN' : 'CLOSED'}.`);
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Transfer Window Control Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-bold text-slate-900">Transfer Window Governance</span>
          <span className="text-slate-300">|</span>
          <span className={`font-semibold font-mono ${win.isOpen ? 'text-emerald-700' : 'text-red-600'}`}>
            {win.isOpen ? 'OPEN' : 'CLOSED'}
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-xs text-slate-600 font-mono tabular-nums">
            Deadline: {win.deadline}
          </span>
          <span className="text-slate-400">·</span>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={win.allowFreeAgentExceptions}
              onChange={async (e) => {
                await tlcApi.updateConfig({
                  transferWindow: { ...win, allowFreeAgentExceptions: e.target.checked },
                });
                await onRefresh();
              }}
            />
            Allow Free Agent signings when closed
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={win.requireStaffApproval}
              onChange={async (e) => {
                await tlcApi.updateConfig({
                  transferWindow: { ...win, requireStaffApproval: e.target.checked },
                });
                await onRefresh();
              }}
            />
            Require Staff Approval
          </label>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleWindow}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 text-white ${
              win.isOpen ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {win.isOpen ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {win.isOpen ? 'Close Window' : 'Open Window'}
          </button>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start w-fit">
        <button
          type="button"
          onClick={() => setSubTab('transfers')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            subTab === 'transfers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          Team Sign & Transfer Market
        </button>
        <button
          type="button"
          onClick={() => setSubTab('contracts')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            subTab === 'contracts' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          Club Contracts ({state.contracts.length})
        </button>
      </div>

      {subTab === 'transfers' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Team Sign & Transfer Offer Panel */}
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-emerald-600" />
                  Team Sign & Offer (/sign)
                </h3>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPlayerPoolFilter('free-agents');
                    setOfferType('Signing');
                    if (freeAgents[0]) setOfferPlayerId(freeAgents[0].tlcId);
                  }}
                  className={`py-1.5 rounded-md font-medium transition-colors ${
                    playerPoolFilter === 'free-agents'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Free Agents ({freeAgents.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlayerPoolFilter('all');
                    if (state.players[0]) setOfferPlayerId(state.players[0].tlcId);
                  }}
                  className={`py-1.5 rounded-md font-medium transition-colors ${
                    playerPoolFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Players ({state.players.length})
                </button>
              </div>

              <form onSubmit={handleOfferSubmit} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {playerPoolFilter === 'free-agents' ? 'Free Agent Target' : 'Player'}
                  </label>
                  <select
                    value={offerPlayerId}
                    onChange={(e) => setOfferPlayerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {selectablePlayers.map((p) => (
                      <option key={p.tlcId} value={p.tlcId}>
                        {p.playerName} ({p.position}) · {p.status} · Avg {p.averageRating.toFixed(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Signing / Destination Club
                  </label>
                  <select
                    value={offerClubId}
                    onChange={(e) => setOfferClubId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {state.clubs.map((c) => (
                      <option key={c.clubId} value={c.clubId}>
                        {c.name} ({c.shortCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Submitting Manager
                  </label>
                  <select
                    value={offerManagerId}
                    onChange={(e) => setOfferManagerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {state.managers.map((m) => (
                      <option key={m.tlcId} value={m.tlcId}>
                        {m.managerName} ({m.tlcId})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Deal Type</label>
                  <select
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as TransferType)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="Signing">Signing (Free Agent)</option>
                    <option value="Permanent Transfer">Permanent Transfer</option>
                    <option value="Loan">Loan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contract Duration Preset
                  </label>
                  <select
                    value={contractPreset}
                    onChange={(e) => setContractPreset(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {TEAM_SIGN_PRESETS.map((preset) => (
                      <option key={preset.label} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Squad Role / Notes (optional)
                  </label>
                  <input
                    type="text"
                    value={offerDetails}
                    onChange={(e) => setOfferDetails(e.target.value)}
                    placeholder="Starting XI, shirt #10, release terms..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingOffer}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {submittingOffer ? 'Sending Offer...' : 'Send Team Sign Offer'}
                </button>
              </form>
            </div>

            {/* Release / Resignation / Loan Return */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-900">Club Departures & Loan Returns</h3>
              <div className="mt-3 space-y-3">
                <select
                  value={directPlayerId}
                  onChange={(e) => setDirectPlayerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {state.players.map((p) => (
                    <option key={p.tlcId} value={p.tlcId}>
                      {p.playerName} ({p.tlcId})
                    </option>
                  ))}
                </select>
                <select
                  value={directAction}
                  onChange={(e) => setDirectAction(e.target.value as typeof directAction)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Release">Release Player to Free Agency</option>
                  <option value="Resignation">Player Resignation</option>
                  <option value="Return from Loan">Return from Loan</option>
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await tlcApi.directTransfer({
                        playerTlcId: directPlayerId,
                        toClubId: null,
                        transferType: directAction,
                        details: `${directAction} processed in console`,
                      });
                      await onRefresh();
                      onNotify(`Executed ${directAction}.`);
                    } catch (err: any) {
                      onNotify(err.message, true);
                    }
                  }}
                  className="w-full py-2 border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-medium rounded-lg"
                >
                  Execute {directAction}
                </button>
              </div>
            </div>
          </div>

          {/* Active Offers + Completed Transfers */}
          <div className="lg:col-span-8 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                Active & Recent Transfer Offers
              </h3>
              <div className="divide-y divide-slate-100">
                {state.transferOffers.length === 0 ? (
                  <div className="py-6 text-sm text-slate-400">No transfer offers recorded.</div>
                ) : (
                  state.transferOffers.map((o) => (
                    <div
                      key={o.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {o.playerName} ({o.playerTlcId}) · {o.fromClubName} → {o.toClubName}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {o.transferType} · Manager: {o.managerName} · {o.details}
                        </div>
                        <div
                          className={`text-xs font-medium mt-1 ${
                            o.status === 'Approved'
                              ? 'text-emerald-700'
                              : o.status.startsWith('Rejected') || o.status === 'Cancelled'
                              ? 'text-red-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {o.status}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {o.status === 'Pending Player' && (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                await tlcApi.respondTransferOffer(o.id, 'accept', o.playerName);
                                await onRefresh();
                                onNotify('Player accepted offer.');
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-medium rounded-md"
                            >
                              Player Accept
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await tlcApi.respondTransferOffer(o.id, 'decline', o.playerName);
                                await onRefresh();
                                onNotify('Player declined offer.');
                              }}
                              className="px-2.5 py-1 border border-red-200 text-red-600 text-xs font-medium rounded-md"
                            >
                              Player Decline
                            </button>
                          </>
                        )}
                        {o.status === 'Pending Staff' && (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                await tlcApi.reviewTransferOffer(o.id, 'approve');
                                await onRefresh();
                                onNotify('Transfer officially approved.');
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-medium rounded-md"
                            >
                              Approve Transfer
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await tlcApi.reviewTransferOffer(o.id, 'reject');
                                await onRefresh();
                                onNotify('Transfer rejected by staff.');
                              }}
                              className="px-2.5 py-1 border border-red-200 text-red-600 text-xs font-medium rounded-md"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await tlcApi.reviewTransferOffer(o.id, 'cancel');
                                await onRefresh();
                                onNotify('Transfer cancelled.');
                              }}
                              className="px-2.5 py-1 border border-slate-200 text-slate-600 text-xs font-medium rounded-md"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">Official Transfer History (#transfer-market)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Player</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">From → To</th>
                      <th className="py-2.5 px-4">Approved By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.transfers.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2.5 px-4 font-mono text-xs text-slate-500 tabular-nums">
                          {t.completedAt.slice(0, 10)}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {t.playerName}{' '}
                          <span className="font-mono text-xs text-slate-400">({t.playerTlcId})</span>
                        </td>
                        <td className="py-2.5 px-4 text-xs font-medium text-emerald-700">
                          {t.transferType}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          {t.fromClubName} → {t.toClubName}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-slate-500">{t.approvedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Player Contracts Ledger</h3>
            </div>
            <button
              type="button"
              onClick={async () => {
                const res = await tlcApi.checkContractExpirations();
                await onRefresh();
                onNotify(
                  `Contract check complete: ${res.expiringCount} expiring soon, ${res.expiredCount} expired.`
                );
              }}
              className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg"
            >
              Run Expiration Check
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 px-4">Player</th>
                  <th className="py-2.5 px-4">Club</th>
                  <th className="py-2.5 px-4">Start</th>
                  <th className="py-2.5 px-4">Expiration</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {c.playerName}{' '}
                      <span className="font-mono text-xs text-slate-400">({c.playerTlcId})</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{c.clubName}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500 tabular-nums">
                      {c.startDate}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {c.expirationDate}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-semibold">
                      <span
                        className={
                          c.status === 'Active'
                            ? 'text-emerald-700'
                            : c.status === 'Expiring'
                            ? 'text-amber-600'
                            : 'text-red-600'
                        }
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      {(c.status === 'Active' || c.status === 'Expiring') && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await tlcApi.contractAction(c.id, 'renew');
                              await onRefresh();
                              onNotify(`Renewed contract for ${c.playerName}.`);
                            }}
                            className="text-xs font-medium text-emerald-700 hover:underline"
                          >
                            Renew +60d
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await tlcApi.contractAction(c.id, 'terminate');
                              await onRefresh();
                              onNotify(`Terminated contract for ${c.playerName}.`);
                            }}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Terminate
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
