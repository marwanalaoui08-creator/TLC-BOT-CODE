import { useState } from 'react';
import { PLAYER_POSITIONS, PlayerPosition, RegistrationRequest, RegistrationType } from '../shared/types.ts';
import { TlcApiState, tlcApi } from '../lib/api.ts';
import { ClubBadge } from './ClubBadge.tsx';

interface RegistrationsViewProps {
  state: TlcApiState;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function RegistrationsView({ state, onRefresh, onNotify }: RegistrationsViewProps) {
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [editing, setEditing] = useState<RegistrationRequest | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoblox, setEditRoblox] = useState('');
  const [editType, setEditType] = useState<RegistrationType>('Player');
  const [editPos, setEditPos] = useState<PlayerPosition>('CM');

  const [rejecting, setRejecting] = useState<RegistrationRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [allowResubmit, setAllowResubmit] = useState(true);
  const [signClubByTlcId, setSignClubByTlcId] = useState<Record<string, string>>({});

  const filtered = state.registrations.filter((r) => filter === 'All' || r.status === filter);

  const openEdit = (r: RegistrationRequest) => {
    setEditing(r);
    setEditName(r.playerName);
    setEditRoblox(r.robloxUsername);
    setEditType(r.registrationType);
    setEditPos(r.position || 'CM');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await tlcApi.editRegistration(editing.id, {
        playerName: editName,
        robloxUsername: editRoblox,
        registrationType: editType,
        position: editType === 'Player' ? editPos : undefined,
      });
      setEditing(null);
      await onRefresh();
      onNotify('Registration details updated.');
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Registration Review Queue</h2>
          <p className="text-sm text-slate-500">
            Staff review panel mirroring #registration-requests. Approvals generate permanent TLC IDs and assign Discord roles.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {(['All', 'Pending', 'Approved', 'Rejected'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Registrations Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="py-3 px-4">Applicant</th>
                <th className="py-3 px-4">Discord ID</th>
                <th className="py-3 px-4">Roblox</th>
                <th className="py-3 px-4">Type / Position</th>
                <th className="py-3 px-4">Submitted</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No registration requests in this view.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <ClubBadge src={r.robloxAvatarUrl} name={r.playerName} size="sm" />
                        <div>
                          <div className="font-semibold text-slate-900">{r.playerName}</div>
                          <div className="text-xs text-slate-500">@{r.discordUsername}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                      {r.discordUserId}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{r.robloxUsername}</td>
                    <td className="py-3 px-4 text-slate-700">
                      <span>{r.registrationType}</span>
                      {r.registrationType === 'Player' && r.position && (
                        <span className="text-slate-400">
                          {' '}
                          · <span className="font-mono font-semibold text-emerald-700">{r.position}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums">
                      {r.submittedAt.slice(0, 10)}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span
                        className={
                          r.status === 'Approved'
                            ? 'text-emerald-700'
                            : r.status === 'Rejected'
                            ? 'text-red-600'
                            : 'text-amber-600'
                        }
                      >
                        {r.status}
                        {r.tlcId ? ` · ${r.tlcId}` : ''}
                      </span>
                      {r.rejectionReason && (
                        <div className="text-slate-400 truncate max-w-[180px]" title={r.rejectionReason}>
                          {r.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {r.status === 'Pending' ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await tlcApi.approveRegistration(r.id);
                                await onRefresh();
                                onNotify(`Approved ${r.playerName}.`);
                              } catch (err: any) {
                                onNotify(err.message, true);
                              }
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-md"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md"
                          >
                            Edit Info
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejecting(r);
                              setRejectReason('');
                              setAllowResubmit(true);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-md"
                          >
                            Reject
                          </button>
                        </div>
                      ) : r.status === 'Approved' && r.registrationType === 'Player' && r.tlcId ? (() => {
                        const player = state.players.find((p) => p.tlcId === r.tlcId);
                        if (!player || player.currentClubId) {
                          const clubName =
                            state.clubs.find((c) => c.clubId === player?.currentClubId)?.shortCode ||
                            'Signed';
                          return (
                            <span className="text-xs text-slate-500">
                              Signed ({clubName}) · Reviewed by {r.reviewedBy || 'Staff'}
                            </span>
                          );
                        }
                        const chosenClubId =
                          signClubByTlcId[player.tlcId] || state.clubs[0]?.clubId || '';
                        return (
                          <div className="inline-flex items-center gap-1.5">
                            <select
                              value={chosenClubId}
                              onChange={(e) =>
                                setSignClubByTlcId((prev) => ({
                                  ...prev,
                                  [player.tlcId]: e.target.value,
                                }))
                              }
                              className="border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 bg-white"
                            >
                              {state.clubs.map((c) => (
                                <option key={c.clubId} value={c.clubId}>
                                  {c.shortCode}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={async () => {
                                const club = state.clubs.find((c) => c.clubId === chosenClubId);
                                const mgrId = club?.currentManagerTlcId || state.managers[0]?.tlcId;
                                if (!club || !mgrId) {
                                  onNotify('Select a club with an available manager.', true);
                                  return;
                                }
                                try {
                                  await tlcApi.submitTransferOffer({
                                    playerTlcId: player.tlcId,
                                    toClubId: club.clubId,
                                    managerTlcId: mgrId,
                                    transferType: 'Signing',
                                    details: '1 Season (60d) · Post-Registration Team Sign',
                                  });
                                  await onRefresh();
                                  onNotify(`Sent Team Sign offer to ${player.playerName} (${club.name}).`);
                                } catch (err: any) {
                                  onNotify(err.message, true);
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-md"
                            >
                              Send Sign Offer
                            </button>
                          </div>
                        );
                      })() : (
                        <span className="text-xs text-slate-400">Reviewed by {r.reviewedBy || 'Staff'}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profile Correction Requests */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-base font-bold text-slate-900">Profile Correction Requests</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Verified members can submit correction requests rather than creating duplicate profiles.
        </p>

        {state.correctionRequests.length === 0 ? (
          <div className="mt-4 py-6 text-sm text-slate-500 border-t border-slate-100">
            No pending profile correction requests.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            {state.correctionRequests.map((c) => (
              <div key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-mono font-semibold text-slate-900">{c.tlcId}</span>
                  <span className="text-slate-400"> · </span>
                  <span className="text-slate-700">{c.reason}</span>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Requested:{' '}
                    {Object.entries(c.requestedFields)
                      .filter(([, v]) => Boolean(v))
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ') || 'No field changes'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.status === 'Pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          await tlcApi.reviewCorrection(c.id, 'approve');
                          await onRefresh();
                          onNotify(`Approved correction for ${c.tlcId}.`);
                        }}
                        className="px-3 py-1 bg-emerald-600 text-white text-xs font-medium rounded-md"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await tlcApi.reviewCorrection(c.id, 'reject');
                          await onRefresh();
                          onNotify('Correction rejected.');
                        }}
                        className="px-3 py-1 border border-red-200 text-red-600 text-xs font-medium rounded-md"
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-slate-500">{c.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900">Edit Pending Registration</h3>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Official Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Roblox Username</label>
                <input
                  type="text"
                  required
                  value={editRoblox}
                  onChange={(e) => setEditRoblox(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as RegistrationType)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Player">Player</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>
              {editType === 'Player' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Position</label>
                  <select
                    value={editPos}
                    onChange={(e) => setEditPos(e.target.value as PlayerPosition)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {PLAYER_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejecting && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900">Reject {rejecting.playerName}</h3>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Optional rejection reason..."
              className="mt-3 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={allowResubmit}
                onChange={(e) => setAllowResubmit(e.target.checked)}
              />
              Allow user to submit another registration
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await tlcApi.rejectRegistration(rejecting.id, rejectReason, allowResubmit);
                  setRejecting(null);
                  await onRefresh();
                  onNotify('Registration rejected.');
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg"
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
