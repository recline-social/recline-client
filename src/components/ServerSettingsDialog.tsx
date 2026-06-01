import { useEffect, useRef, useState } from 'react';
import type { InviteLink, Member, ServerRole, ServerSummary, User } from '../types';
import { api } from '../lib/api';
import { getServerUrl } from '../lib/serverUrl';
import { Permissions } from '../lib/permissions';

type Tab = 'general' | 'security' | 'members' | 'roles' | 'bans' | 'reports' | 'invites' | 'danger';

type Report = {
  id: string;
  reporterId: string;
  reporterUsername?: string;
  reporterDisplayName?: string;
  messageId?: string | null;
  channelId?: string | null;
  reportedUserId?: string | null;
  reportedUsername?: string | null;
  reportedDisplayName?: string | null;
  reason: string;
  note?: string | null;
  status: string;
  createdAt: number;
};

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  hate_speech: 'Hate speech',
  nsfw: 'NSFW',
  misinformation: 'Misinformation',
  other: 'Other',
};

type BanEntry = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  reason: string | null;
  createdAt: number;
};

type Props = {
  open: boolean;
  server: ServerSummary;
  members: Member[];
  me: User;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
  onChangePassphrase: (currentPassphrase: string, passphrase: string) => Promise<void>;
  onKick: (userId: string) => Promise<void>;
  onBan: (userId: string, reason?: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onIconChange?: (iconUrl: string | null) => void;
  roles?: ServerRole[];
  onRolesChange?: (roles: ServerRole[]) => void;
};

export function ServerSettingsDialog({
  open,
  server,
  members,
  me,
  onClose,
  onRename,
  onChangePassphrase,
  onKick,
  onBan,
  onLeave,
  onDelete,
  onIconChange,
  roles = [],
  onRolesChange,
}: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // General
  const [newName, setNewName] = useState(server.name);
  const [copied, setCopied] = useState(false);

  // Icon upload
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [iconErr, setIconErr] = useState<string | null>(null);

  // Security
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passWarning, setPassWarning] = useState(false);

  // Danger
  const [deleteConfirm, setDeleteConfirm] = useState('');

  // Reports
  const isOwner = server.role === 'owner';

  const [reports, setReports] = useState<Report[]>([]);
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'reviewed' | 'actioned'>('pending');
  const [reportsLoading, setReportsLoading] = useState(false);

  // Bans
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [bansLoading, setBansLoading] = useState(false);
  const [banReasonInputs, setBanReasonInputs] = useState<Record<string, string>>({});

  // Role assignment (members tab)
  const [roleMenuFor, setRoleMenuFor] = useState<string | null>(null); // userId whose dropdown is open
  const [roleActionLoading, setRoleActionLoading] = useState<Record<string, boolean>>({});
  const [memberRoles, setMemberRoles] = useState<Record<string, { id: string; name: string; color: string | null; position: number }[]>>({});

  // Sync memberRoles from members prop
  useEffect(() => {
    const map: Record<string, { id: string; name: string; color: string | null; position: number }[]> = {};
    for (const m of members) map[m.id] = m.roles ?? [];
    setMemberRoles(map);
  }, [members]);

  async function handleAssignRole(userId: string, roleId: string) {
    const key = `${userId}:${roleId}`;
    setRoleActionLoading((p) => ({ ...p, [key]: true }));
    try {
      await api.assignRole(server.id, userId, roleId);
      const role = roles.find((r) => r.id === roleId);
      if (role) {
        setMemberRoles((prev) => ({
          ...prev,
          [userId]: [...(prev[userId] ?? []), { id: role.id, name: role.name, color: role.color, position: role.position }]
            .sort((a, b) => b.position - a.position),
        }));
      }
    } catch (ex: any) {
      setErr(ex?.message ?? 'Failed to assign role');
    } finally {
      setRoleActionLoading((p) => { const n = { ...p }; delete n[key]; return n; });
      setRoleMenuFor(null);
    }
  }

  async function handleRemoveRole(userId: string, roleId: string) {
    const key = `${userId}:${roleId}`;
    setRoleActionLoading((p) => ({ ...p, [key]: true }));
    try {
      await api.removeRole(server.id, userId, roleId);
      setMemberRoles((prev) => ({
        ...prev,
        [userId]: (prev[userId] ?? []).filter((r) => r.id !== roleId),
      }));
    } catch (ex: any) {
      setErr(ex?.message ?? 'Failed to remove role');
    } finally {
      setRoleActionLoading((p) => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  useEffect(() => {
    if (tab !== 'reports' || !isOwner) return;
    setReportsLoading(true);
    const status = reportFilter === 'all' ? undefined : reportFilter;
    api.listReports(server.id, { status, limit: 100 })
      .then((r) => setReports(r.reports as Report[]))
      .catch(() => setReports([]))
      .finally(() => setReportsLoading(false));
  }, [tab, reportFilter, server.id, isOwner]);

  useEffect(() => {
    if (tab !== 'bans' || !isOwner) return;
    setBansLoading(true);
    api.listBans(server.id)
      .then((r) => setBans(r.bans))
      .catch(() => setBans([]))
      .finally(() => setBansLoading(false));
  }, [tab, server.id, isOwner]);

  async function handleUpdateReport(reportId: string, status: 'pending' | 'reviewed' | 'actioned') {
    try {
      await api.updateReport(server.id, reportId, status);
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status } : r));
    } catch (ex: any) {
      setErr(ex?.message ?? 'Failed to update report');
    }
  }

  // Close role dropdown when clicking outside
  useEffect(() => {
    if (!roleMenuFor) return;
    function onDocClick() { setRoleMenuFor(null); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [roleMenuFor]);

  if (!open) return null;

  function reset() {
    setErr('');
    setBusy(false);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === server.name) return;
    setErr('');
    setBusy(true);
    try {
      await onRename(newName.trim());
      setErr('');
    } catch (ex: any) {
      setErr(ex.message ?? 'rename failed');
    } finally {
      setBusy(false);
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(server.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleIconPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIconUploading(true);
    setIconErr(null);
    try {
      const { url } = await api.uploadFile(file);
      await api.updateServer(server.id, { iconUrl: url });
      onIconChange?.(url);
    } catch (ex: any) {
      setIconErr(ex?.message ?? 'Upload failed');
    } finally {
      setIconUploading(false);
    }
  }

  async function handleRemoveIcon() {
    setIconUploading(true);
    setIconErr(null);
    try {
      await api.updateServer(server.id, { iconUrl: null });
      onIconChange?.(null);
    } catch (ex: any) {
      setIconErr(ex?.message ?? 'Could not remove icon');
    } finally {
      setIconUploading(false);
    }
  }

  function resolvedIconUrl(): string | null {
    const u = server.icon_url;
    if (!u) return null;
    return u.startsWith('/') ? (getServerUrl() || '') + u : u;
  }

  function serverInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPass) { setErr('current passphrase required'); return; }
    if (newPass !== confirmPass) { setErr('passphrases do not match'); return; }
    if (newPass.length < 6) { setErr('passphrase must be at least 6 chars'); return; }
    setPassWarning(true);
  }

  async function confirmPassphraseChange() {
    setPassWarning(false);
    setErr('');
    setBusy(true);
    try {
      await onChangePassphrase(currentPass, newPass);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (ex: any) {
      setErr(ex.message ?? 'change failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setBusy(true);
    try {
      await onLeave();
      onClose();
    } catch (ex: any) {
      setErr(ex.message ?? 'leave failed');
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== server.name) { setErr('space name does not match'); return; }
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } catch (ex: any) {
      setErr(ex.message ?? 'delete failed');
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = isOwner
    ? [
        { id: 'general', label: 'General' },
        { id: 'security', label: 'Security' },
        { id: 'members', label: 'People' },
        { id: 'roles', label: 'Roles' },
        { id: 'bans', label: 'Bans' },
        { id: 'reports', label: 'Reports' },
        { id: 'invites', label: 'Invites' },
        { id: 'danger', label: 'Danger' },
      ]
    : [
        { id: 'general', label: 'General' },
        { id: 'members', label: 'People' },
        { id: 'danger', label: 'Leave' },
      ];

  // ── Roles Tab ─────────────────────────────────────────────────────────────
  // Defined outside the main return so JSX below can reference it.

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { reset(); onClose(); } }}
    >
      <div className="panel w-[560px] max-h-[80vh] flex flex-col rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
          <div>
            <div className="font-semibold text-sm">{server.name}</div>
            <div className="text-[11px] text-ink-300">Space Settings</div>
          </div>
          <button
            onClick={() => { reset(); onClose(); }}
            className="btn-ghost h-7 w-7 grid place-items-center rounded-lg"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-5 pt-3 border-b border-white/5 pb-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setErr(''); setTab(t.id); }}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-t-md transition-colors border-b-2 -mb-px
                ${tab === t.id
                  ? 'text-white border-accent-violet'
                  : 'text-ink-300 border-transparent hover:text-ink-100'
                } ${t.id === 'danger' ? (tab === t.id ? '!border-rose-500 !text-rose-400' : 'hover:!text-rose-300') : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4">
          {err && (
            <div className="text-[12px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {err}
            </div>
          )}

          {/* ── General ─────────────────────────────────────────── */}
          {tab === 'general' && (
            <div className="space-y-5">

              {/* Server icon upload (owner only) */}
              {isOwner && (
                <div className="space-y-2">
                  <label className="block text-[11px] uppercase tracking-widest text-ink-300 font-semibold">
                    Space icon
                  </label>
                  <div className="flex items-center gap-3">
                    {/* Preview */}
                    <div className="h-14 w-14 rounded-xl overflow-hidden shrink-0 border border-white/[0.06] bg-ink-800 grid place-items-center">
                      {resolvedIconUrl() ? (
                        <img src={resolvedIconUrl()!} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[13px] font-bold text-ink-300 select-none">
                          {serverInitials(server.name)}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => !iconUploading && iconInputRef.current?.click()}
                        disabled={iconUploading}
                        className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-40"
                      >
                        {iconUploading ? 'Uploading…' : 'Upload image'}
                      </button>
                      {server.icon_url && !iconUploading && (
                        <button
                          type="button"
                          onClick={handleRemoveIcon}
                          className="block text-[11px] text-rose-400/70 hover:text-rose-300 transition-colors"
                        >
                          Remove icon
                        </button>
                      )}
                      <input
                        ref={iconInputRef}
                        type="file"
                        hidden
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleIconPick}
                      />
                    </div>
                  </div>
                  {iconErr && (
                    <div className="text-[11px] text-rose-300">{iconErr}</div>
                  )}
                </div>
              )}

              {isOwner && (
                <form onSubmit={handleRename} className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-widest text-ink-300 font-semibold">
                    Space name
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      maxLength={40}
                      className="input flex-1 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={busy || !newName.trim() || newName.trim() === server.name}
                      className="btn-primary text-sm px-4 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-widest text-ink-300 font-semibold">
                  Invite code
                </label>
                <div className="flex items-center gap-2 bg-ink-800/60 rounded-lg px-3 py-2 border border-white/5">
                  <code className="flex-1 text-xs text-ink-100 font-mono select-all">{server.invite_code}</code>
                  <button
                    onClick={copyInvite}
                    className="btn-ghost text-[11px] px-2 py-1"
                  >
                    {copied ? '✓ copied' : 'copy'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Security (owner only) ─────────────────────────── */}
          {tab === 'security' && isOwner && (
            <div className="space-y-4">
              {passWarning ? (
                <div className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 space-y-2">
                    <div className="text-[13px] font-semibold text-amber-300">⚠ This will erase all message history</div>
                    <div className="text-[12px] text-ink-300 leading-relaxed">
                      Changing the passphrase requires a new encryption key. All existing messages cannot be
                      decrypted with the new key, so they will be permanently deleted. This cannot be undone.
                    </div>
                    <div className="text-[12px] text-ink-300">
                      Other members will be prompted to enter the new passphrase next time they open the space.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPassWarning(false)}
                      className="btn-ghost flex-1 text-sm py-2"
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmPassphraseChange}
                      disabled={busy}
                      className="flex-1 py-2 rounded-lg text-sm font-medium bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 transition-colors disabled:opacity-40"
                    >
                      {busy ? 'Changing…' : 'Yes, erase history & change passphrase'}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submitPassphrase} className="space-y-3">
                  <div className="text-[12px] text-ink-300 leading-relaxed">
                    Changing the passphrase generates a new encryption key. All message history will be deleted
                    since it cannot be re-encrypted retroactively.
                  </div>
                  <label className="block text-[11px] uppercase tracking-widest text-ink-300 font-semibold">
                    Current passphrase
                  </label>
                  <input
                    type="password"
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    placeholder="confirm your identity"
                    className="input w-full text-sm"
                    autoComplete="current-password"
                  />
                  <label className="block text-[11px] uppercase tracking-widest text-ink-300 font-semibold">
                    New passphrase
                  </label>
                  <input
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="at least 6 characters"
                    className="input w-full text-sm"
                    autoComplete="new-password"
                  />
                  <label className="block text-[11px] uppercase tracking-widest text-ink-300 font-semibold">
                    Confirm passphrase
                  </label>
                  <input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    placeholder="repeat passphrase"
                    className="input w-full text-sm"
                    autoComplete="new-password"
                  />
                  <button
                    type="submit"
                    disabled={busy || !currentPass || !newPass || !confirmPass}
                    className="w-full py-2 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors disabled:opacity-40"
                  >
                    Change passphrase…
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── Members ──────────────────────────────────────────── */}
          {tab === 'members' && (
            <div className="space-y-1">
              {members.map((m) => {
                const mRoles = memberRoles[m.id] ?? [];
                const assignableRoles = roles.filter(
                  (r) => !r.isDefault && !mRoles.find((mr) => mr.id === r.id)
                );
                const isMenuOpen = roleMenuFor === m.id;
                return (
                  <div key={m.id} className="px-3 py-2 rounded-lg hover:bg-white/[0.03] group">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-ink-700 grid place-items-center text-xs font-semibold text-ink-200 shrink-0">
                        {m.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate text-ink-100">
                          {m.displayName}
                          {m.id === me.id && (
                            <span className="ml-1.5 text-[10px] text-ink-400">(you)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-300 truncate">
                          @{m.username} · {m.role}
                        </div>
                      </div>
                      {isOwner && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Assign role — available for ALL members including the owner's own row */}
                          {assignableRoles.length > 0 && (
                            <div className="relative">
                              <button
                                onClick={() => setRoleMenuFor(isMenuOpen ? null : m.id)}
                                className="text-[11px] text-accent-violet hover:text-accent-teal transition-colors px-2 py-1 rounded hover:bg-accent-violet/10"
                                title="Assign role"
                              >
                                + Role
                              </button>
                              {isMenuOpen && (
                                <div
                                  className="absolute right-0 top-full mt-1 z-50 min-w-[150px] rounded-xl py-1 shadow-soft"
                                  style={{ background: 'rgba(14,11,20,0.97)', border: '1px solid rgba(255,255,255,0.09)' }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  {assignableRoles.map((r) => (
                                    <button
                                      key={r.id}
                                      onClick={() => handleAssignRole(m.id, r.id)}
                                      disabled={!!roleActionLoading[`${m.id}:${r.id}`]}
                                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-ink-200 hover:bg-white/[0.05] transition-colors disabled:opacity-40"
                                    >
                                      <span
                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                        style={{ background: r.color ?? '#6C6C7A' }}
                                      />
                                      {r.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Kick / ban — other members only, never self */}
                          {m.id !== me.id && (
                            <>
                              <button
                                onClick={async () => {
                                  setBusy(true);
                                  try { await onKick(m.id); } catch (ex: any) { setErr(ex.message ?? 'kick failed'); } finally { setBusy(false); }
                                }}
                                disabled={busy}
                                className="text-[11px] text-rose-400 hover:text-rose-300 transition-colors px-2 py-1 rounded hover:bg-rose-500/10 disabled:opacity-40"
                              >
                                Kick
                              </button>
                              <button
                                onClick={async () => {
                                  setBusy(true);
                                  try { await onBan(m.id, banReasonInputs[m.id]?.trim() || undefined); } catch (ex: any) { setErr(ex.message ?? 'ban failed'); } finally { setBusy(false); }
                                }}
                                disabled={busy}
                                className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors px-2 py-1 rounded hover:bg-amber-500/10 disabled:opacity-40"
                              >
                                Ban
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Role badges */}
                    {mRoles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5 pl-11">
                        {mRoles.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => isOwner && handleRemoveRole(m.id, r.id)}
                            disabled={!!roleActionLoading[`${m.id}:${r.id}`] || !isOwner}
                            title={isOwner ? `Remove ${r.name}` : r.name}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors disabled:cursor-default"
                            style={{
                              background: r.color ? `${r.color}22` : 'rgba(79,117,255,0.12)',
                              color: r.color ?? '#C4C4D0',
                              border: `1px solid ${r.color ? `${r.color}44` : 'rgba(79,117,255,0.22)'}`,
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ background: r.color ?? '#6C6C7A' }}
                            />
                            {r.name}
                            {isOwner && (
                              <span className="opacity-50 ml-0.5">×</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Roles ────────────────────────────────────────────── */}
          {tab === 'roles' && isOwner && (
            <RolesTab
              serverId={server.id}
              roles={roles}
              onRolesChange={onRolesChange ?? (() => {})}
            />
          )}

          {/* ── Bans ─────────────────────────────────────────────── */}
          {tab === 'bans' && isOwner && (
            <div className="space-y-3">
              <div className="text-[12px] text-ink-300">
                Banned people cannot rejoin via invite code. Unban to allow them back.
              </div>

              {bansLoading ? (
                <div className="text-center py-8 text-ink-400 text-[12px]">Loading bans…</div>
              ) : bans.length === 0 ? (
                <div className="text-center py-8 text-ink-400 text-[12px]">No banned people.</div>
              ) : (
                <div className="space-y-1.5">
                  {bans.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-ink-800/40 border border-white/[0.05] group"
                    >
                      <div className="h-8 w-8 rounded-full bg-rose-900/40 border border-rose-500/20 grid place-items-center text-xs font-semibold text-rose-300 shrink-0">
                        {b.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate text-ink-100">{b.displayName}</div>
                        <div className="text-[11px] text-ink-400 truncate">
                          @{b.username}
                          {b.reason && <span className="ml-1.5 text-ink-500">· "{b.reason}"</span>}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await api.unbanMember(server.id, b.userId);
                            setBans((prev) => prev.filter((x) => x.id !== b.id));
                          } catch (ex: any) {
                            setErr(ex?.message ?? 'unban failed');
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-[11px] text-emerald-400 hover:text-emerald-300 transition-all px-2 py-1 rounded hover:bg-emerald-500/10"
                      >
                        Unban
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Reports ────────────────────────────────────────── */}
          {tab === 'reports' && isOwner && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-ink-300">People-submitted content reports</div>
                <div className="flex gap-1">
                  {(['all', 'pending', 'reviewed', 'actioned'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setReportFilter(f)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors
                        ${reportFilter === f
                          ? 'bg-accent-violet/20 text-accent-violet border border-accent-violet/30'
                          : 'text-ink-400 hover:text-ink-200 border border-white/[0.06]'
                        }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {reportsLoading ? (
                <div className="text-center py-8 text-ink-400 text-[12px]">Loading reports…</div>
              ) : reports.length === 0 ? (
                <div className="text-center py-8 text-ink-400 text-[12px]">
                  {reportFilter === 'pending' ? 'No pending reports.' : 'No reports in this category.'}
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {reports.map((r) => (
                    <div key={r.id} className="bg-ink-800/50 border border-white/[0.06] rounded-lg px-3 py-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded
                              ${r.reason === 'harassment' || r.reason === 'hate_speech' ? 'bg-rose-500/20 text-rose-300' :
                                r.reason === 'spam' ? 'bg-amber-500/20 text-amber-300' :
                                'bg-ink-700 text-ink-300'}`}
                            >
                              {REASON_LABELS[r.reason] ?? r.reason}
                            </span>
                            <span className={`text-[11px] px-1.5 py-0.5 rounded border
                              ${r.status === 'pending' ? 'border-amber-500/30 text-amber-400' :
                                r.status === 'actioned' ? 'border-emerald-500/30 text-emerald-400' :
                                'border-white/10 text-ink-400'}`}
                            >
                              {r.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-ink-300">
                            by <span className="text-ink-200">@{r.reporterUsername}</span>
                            {r.reportedUsername && (
                              <> · against <span className="text-ink-200">@{r.reportedUsername}</span></>
                            )}
                          </div>
                          {r.note && (
                            <div className="text-[11px] text-ink-400 italic">"{r.note}"</div>
                          )}
                          <div className="text-[10px] text-ink-500">
                            {new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {r.status !== 'reviewed' && (
                            <button
                              onClick={() => handleUpdateReport(r.id, 'reviewed')}
                              className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-ink-400 hover:text-ink-200 hover:border-white/20 transition-colors"
                            >
                              Mark reviewed
                            </button>
                          )}
                          {r.status !== 'actioned' && (
                            <button
                              onClick={() => handleUpdateReport(r.id, 'actioned')}
                              className="text-[10px] px-2 py-0.5 rounded border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            >
                              Action taken
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Invites ────────────────────────────────────────── */}
          {tab === 'invites' && isOwner && (
            <InvitesTab server={server} />
          )}

          {/* ── Danger ─────────────────────────────────────────── */}
          {tab === 'danger' && (
            <div className="space-y-5">
              {!isOwner ? (
                <div className="space-y-3">
                  <div className="text-[12px] text-ink-300">
                    You'll lose access to all channels and message history in <strong className="text-ink-100">{server.name}</strong>.
                    You can rejoin with an invite code later.
                  </div>
                  <button
                    onClick={handleLeave}
                    disabled={busy}
                    className="w-full py-2 rounded-lg text-sm font-medium bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/25 transition-colors disabled:opacity-40"
                  >
                    {busy ? 'Leaving…' : `Leave "${server.name}"`}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3 space-y-1">
                    <div className="text-[13px] font-semibold text-rose-400">Delete space</div>
                    <div className="text-[12px] text-ink-300 leading-relaxed">
                      Permanently deletes <strong className="text-ink-100">{server.name}</strong>, all channels,
                      and all encrypted messages. All members will be removed. This cannot be undone.
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] text-ink-300">
                      Type <strong className="text-ink-100">{server.name}</strong> to confirm
                    </label>
                    <input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={server.name}
                      className="input w-full text-sm"
                    />
                  </div>
                  <button
                    onClick={handleDelete}
                    disabled={busy || deleteConfirm !== server.name}
                    className="w-full py-2 rounded-lg text-sm font-medium bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 transition-colors disabled:opacity-40"
                  >
                    {busy ? 'Deleting…' : 'Delete space permanently'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Permission labels for the roles editor ────────────────────────────────────
const PERM_LABELS: { flag: number; label: string; description: string }[] = [
  { flag: Permissions.VIEW_CHANNEL,    label: 'View Channels',     description: 'Can see channels and read messages' },
  { flag: Permissions.SEND_MESSAGES,   label: 'Send Messages',     description: 'Can send messages in text channels' },
  { flag: Permissions.MANAGE_MESSAGES, label: 'Manage Messages',   description: 'Can delete messages from others' },
  { flag: Permissions.MANAGE_CHANNELS, label: 'Manage Channels',   description: 'Can create, rename and delete channels' },
  { flag: Permissions.KICK_MEMBERS,    label: 'Kick People',       description: 'Can remove people from the space' },
  { flag: Permissions.BAN_MEMBERS,     label: 'Ban People',        description: 'Can permanently ban people' },
  { flag: Permissions.MANAGE_ROLES,    label: 'Manage Roles',      description: 'Can create and assign roles' },
  { flag: Permissions.MANAGE_SERVER,   label: 'Manage Space',      description: 'Can change space name and icon' },
  { flag: Permissions.CONNECT_VOICE,   label: 'Connect to Voice',  description: 'Can join voice channels' },
  { flag: Permissions.SPEAK_VOICE,     label: 'Speak in Voice',    description: 'Can speak in voice channels' },
  { flag: Permissions.ADMINISTRATOR,   label: 'Administrator',     description: 'Bypasses all permission checks — use carefully' },
];

const ROLE_PRESETS = [
  '#f87171', '#fb923c', '#fbbf24', '#f59e0b',
  '#a3e635', '#10b981', '#34d399', '#22d3ee',
  '#38bdf8', '#818cf8', '#6366f1', '#a78bfa',
  '#e879f9', '#f472b6', '#94a3b8', '#ffffff',
];

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(value);
  const isCustom = isValid && !ROLE_PRESETS.includes(value.toLowerCase()) && !ROLE_PRESETS.includes(value);

  return (
    <div className="space-y-2">
      {/* Swatch grid */}
      <div className="flex flex-wrap gap-1.5">
        {ROLE_PRESETS.map((hex) => {
          const active = value.toLowerCase() === hex.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              disabled={disabled}
              onClick={() => onChange(hex)}
              title={hex}
              className="w-6 h-6 rounded-md border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40 shrink-0"
              style={{
                background: hex,
                borderColor: active ? '#ffffff' : 'rgba(255,255,255,0.08)',
                boxShadow: active ? '0 0 0 1px rgba(255,255,255,0.4)' : undefined,
              }}
            >
              {active && (
                <svg viewBox="0 0 24 24" fill="none" stroke={hex === '#ffffff' ? '#000' : '#fff'} strokeWidth="3" className="w-3.5 h-3.5 mx-auto">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}

        {/* "Other" swatch → opens native color picker */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => nativeRef.current?.click()}
          title="Custom color"
          className="w-6 h-6 rounded-md border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40 shrink-0 flex items-center justify-center"
          style={{
            background: isCustom ? value : 'transparent',
            borderColor: isCustom ? '#ffffff' : 'rgba(255,255,255,0.2)',
            boxShadow: isCustom ? '0 0 0 1px rgba(255,255,255,0.4)' : undefined,
          }}
        >
          {isCustom ? (
            <svg viewBox="0 0 24 24" fill="none" stroke={value === '#ffffff' ? '#000' : '#fff'} strokeWidth="3" className="w-3.5 h-3.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <span className="text-[10px] text-ink-300 leading-none font-bold">+</span>
          )}
          <input
            ref={nativeRef}
            type="color"
            className="sr-only"
            value={isValid ? value : '#818cf8'}
            onChange={(e) => onChange(e.target.value)}
            tabIndex={-1}
            disabled={disabled}
          />
        </button>
      </div>

      {/* Hex text input */}
      <div className="flex items-center gap-2">
        {isValid && (
          <div className="w-5 h-5 rounded shrink-0 border border-white/10" style={{ background: value }} />
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB or leave blank"
          maxLength={7}
          className="input flex-1 text-sm font-mono"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function RolesTab({
  serverId,
  roles,
  onRolesChange,
}: {
  serverId: string;
  roles: ServerRole[];
  onRolesChange: (roles: ServerRole[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newHoisted, setNewHoisted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Edit state
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editHoisted, setEditHoisted] = useState(false);
  const [editPerms, setEditPerms] = useState(0);

  const selected = roles.find((r) => r.id === selectedId) ?? null;

  function openEdit(role: ServerRole) {
    setSelectedId(role.id);
    setEditName(role.name);
    setEditColor(role.color ?? '');
    setEditHoisted(role.hoisted);
    setEditPerms(role.permissions);
    setErr('');
    setCreating(false);
  }

  function closeEdit() {
    setSelectedId(null);
    setErr('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { setErr('name required'); return; }
    const color = newColor.trim() || undefined;
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) { setErr('color must be #RRGGBB'); return; }
    setBusy(true);
    setErr('');
    try {
      const { role } = await api.createRole(serverId, { name, color: color ?? null, hoisted: newHoisted, permissions: 0 });
      onRolesChange([...roles, role]);
      setNewName('');
      setNewColor('');
      setNewHoisted(false);
      setCreating(false);
    } catch (ex: any) {
      setErr(ex.message ?? 'create failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const name = editName.trim();
    if (!name) { setErr('name required'); return; }
    const color = editColor.trim() || null;
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) { setErr('color must be #RRGGBB'); return; }
    setBusy(true);
    setErr('');
    try {
      const { role } = await api.updateRole(serverId, selected.id, { name, color, hoisted: editHoisted, permissions: editPerms });
      onRolesChange(roles.map((r) => r.id === selected.id ? { ...r, ...role } : r));
      closeEdit();
    } catch (ex: any) {
      setErr(ex.message ?? 'save failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected || selected.isDefault) return;
    if (!window.confirm(`Delete role "${selected.name}"? This cannot be undone.`)) return;
    setBusy(true);
    setErr('');
    try {
      await api.deleteRole(serverId, selected.id);
      onRolesChange(roles.filter((r) => r.id !== selected.id));
      closeEdit();
    } catch (ex: any) {
      setErr(ex.message ?? 'delete failed');
    } finally {
      setBusy(false);
    }
  }

  function togglePerm(flag: number) {
    setEditPerms((prev) => (prev & flag) !== 0 ? prev & ~flag : prev | flag);
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={closeEdit}
            className="btn-ghost text-[12px] px-2 py-1 flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <span className="text-[13px] font-semibold text-ink-100">Edit role</span>
          {selected.isDefault && (
            <span className="text-[10px] text-ink-400 bg-ink-800 px-2 py-0.5 rounded">@everyone</span>
          )}
        </div>

        {err && (
          <div className="text-[12px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-widest text-ink-300 font-semibold">
              Role name
            </label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={32}
              className="input w-full text-sm"
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-widest text-ink-300 font-semibold">
              Color (optional)
            </label>
            <ColorPicker value={editColor} onChange={setEditColor} disabled={busy} />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="edit-hoisted"
              checked={editHoisted}
              onChange={(e) => setEditHoisted(e.target.checked)}
              className="accent-violet-500"
              disabled={busy}
            />
            <label htmlFor="edit-hoisted" className="text-[13px] text-ink-200 cursor-pointer">
              Display members with this role separately
            </label>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-widest text-ink-300 font-semibold">
              Permissions
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {PERM_LABELS.map(({ flag, label, description }) => {
                const checked = (editPerms & flag) !== 0;
                return (
                  <label
                    key={flag}
                    className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePerm(flag)}
                      className="mt-0.5 accent-violet-500 shrink-0"
                      disabled={busy}
                    />
                    <div>
                      <div className="text-[12px] font-medium text-ink-100">{label}</div>
                      <div className="text-[10px] text-ink-400">{description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="btn-primary text-sm px-4 py-2 flex-1 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            {!selected.isDefault && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/20 transition-colors disabled:opacity-40"
              >
                Delete
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-ink-300">
          Manage roles and permissions for this space.
        </div>
        <button
          onClick={() => { setCreating((v) => !v); setErr(''); }}
          className="btn-ghost text-[12px] px-3 py-1.5"
        >
          {creating ? 'Cancel' : '+ New role'}
        </button>
      </div>

      {err && (
        <div className="text-[12px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="bg-ink-800/60 border border-white/[0.06] rounded-xl px-4 py-4 space-y-3">
          <div className="text-[12px] font-semibold text-ink-100 mb-1">New role</div>
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={32}
              placeholder="e.g. Moderator"
              className="input w-full text-sm"
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Color (optional)</label>
            <ColorPicker value={newColor} onChange={setNewColor} disabled={busy} />
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              id="new-hoisted"
              checked={newHoisted}
              onChange={(e) => setNewHoisted(e.target.checked)}
              className="accent-violet-500"
              disabled={busy}
            />
            <label htmlFor="new-hoisted" className="text-[12px] text-ink-300 cursor-pointer">
              Show separately in member list
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setCreating(false); setErr(''); }}
              className="btn-ghost text-sm px-4 py-2 flex-1"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="btn-primary text-sm px-4 py-2 flex-1 disabled:opacity-40"
            >
              {busy ? 'Creating…' : 'Create role'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {roles.length === 0 && (
          <div className="text-center py-6 text-ink-400 text-[12px]">No roles yet. Create one above.</div>
        )}
        {[...roles].sort((a, b) => b.position - a.position || a.name.localeCompare(b.name)).map((role) => (
          <button
            key={role.id}
            onClick={() => openEdit(role)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left group"
          >
            <div
              className="w-3 h-3 rounded-full shrink-0 border border-white/10"
              style={{ background: role.color ?? 'rgba(255,255,255,0.15)' }}
            />
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-medium text-ink-100 truncate" style={{ color: role.color ?? undefined }}>
                {role.name}
              </span>
              {role.isDefault && (
                <span className="ml-1.5 text-[10px] text-ink-500">@everyone</span>
              )}
            </div>
            <div className="text-[10px] text-ink-500 shrink-0">
              {PERM_LABELS.filter(({ flag }) => (role.permissions & flag) !== 0).length} perms
            </div>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="text-ink-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Invites Tab ───────────────────────────────────────────────────────────────
function InvitesTab({ server }: { server: ServerSummary }) {
  const baseUrl = `${window.location.origin}/invite/`;

  const [links, setLinks]               = useState<InviteLink[]>([]);
  const [loading, setLoading]           = useState(true);
  const [err, setErr]                   = useState('');
  const [inviteMode, setInviteMode]     = useState<'any' | 'links_only'>(server.invite_mode ?? 'any');
  const [modeWorking, setModeWorking]   = useState(false);
  const [creating, setCreating]         = useState(false);
  const [copied, setCopied]             = useState<string | null>(null);

  // Create form state
  const [newCode, setNewCode]           = useState('');
  const [newLabel, setNewLabel]         = useState('');
  const [newMaxUses, setNewMaxUses]     = useState('');
  const [newExpiry, setNewExpiry]       = useState('');
  const [newHistory, setNewHistory]     = useState(true);
  const [createErr, setCreateErr]       = useState('');
  const [showCreate, setShowCreate]     = useState(false);

  useEffect(() => {
    api.invites.list(server.id)
      .then((r) => { setLinks(r.links); setLoading(false); })
      .catch((e: Error) => { setErr(e.message); setLoading(false); });
  }, [server.id]);

  async function toggleMode() {
    const next = inviteMode === 'any' ? 'links_only' : 'any';
    setModeWorking(true);
    try {
      await api.invites.setInviteMode(server.id, next);
      setInviteMode(next);
    } catch (e: any) { setErr(e.message); }
    finally { setModeWorking(false); }
  }

  async function handleCreate() {
    setCreateErr('');
    const opts: Parameters<typeof api.invites.create>[1] = {
      allowHistory: newHistory,
    };
    if (newCode.trim()) opts.code = newCode.trim();
    if (newLabel.trim()) opts.label = newLabel.trim();
    const mu = parseInt(newMaxUses, 10);
    if (newMaxUses && !Number.isNaN(mu)) opts.maxUses = mu;
    if (newExpiry) {
      const ts = new Date(newExpiry).getTime();
      if (!Number.isNaN(ts) && ts > Date.now()) opts.expiresAt = ts;
      else { setCreateErr('Expiry must be a future date'); return; }
    }
    setCreating(true);
    try {
      const r = await api.invites.create(server.id, opts);
      setLinks((prev) => [r.link, ...prev]);
      setNewCode(''); setNewLabel(''); setNewMaxUses(''); setNewExpiry('');
      setNewHistory(true); setShowCreate(false);
    } catch (e: any) { setCreateErr(e.message); }
    finally { setCreating(false); }
  }

  async function toggleLink(link: InviteLink) {
    try {
      await api.invites.update(server.id, link.id, { isActive: !link.isActive });
      setLinks((prev) => prev.map((l) => l.id === link.id ? { ...l, isActive: !l.isActive } : l));
    } catch (e: any) { setErr(e.message); }
  }

  async function deleteLink(linkId: string) {
    if (!confirm('Delete this invite link? It cannot be undone.')) return;
    try {
      await api.invites.delete(server.id, linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (e: any) { setErr(e.message); }
  }

  function copyLink(code: string) {
    navigator.clipboard.writeText(`${baseUrl}${code}`).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function fmtExpiry(ts: number | null) {
    if (!ts) return null;
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const isExpired = (link: InviteLink) => !!(link.expiresAt && link.expiresAt < Date.now());
  const isExhausted = (link: InviteLink) => !!(link.maxUses !== null && link.uses >= link.maxUses);

  return (
    <div className="space-y-5">
      {err && <p className="text-rose-400 text-sm">{err}</p>}

      {/* ── Join policy ──────────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-2">
        <p className="text-[13px] font-semibold text-ink-100">Join policy</p>
        <p className="text-[12px] text-ink-400 leading-snug">
          {inviteMode === 'any'
            ? 'Anyone with the server code or an active invite link can join.'
            : 'Only people with an active invite link can join — the legacy server code is disabled.'}
        </p>
        <button
          onClick={toggleMode}
          disabled={modeWorking}
          className="mt-1 btn-secondary text-[12px] px-3 py-1.5 disabled:opacity-50"
        >
          {modeWorking
            ? 'Saving…'
            : inviteMode === 'any'
              ? 'Switch to links only'
              : 'Allow legacy code too'}
        </button>
      </div>

      {/* ── Create new link ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[13px] font-semibold text-ink-100">Invite links</p>
          <button
            onClick={() => { setShowCreate((p) => !p); setCreateErr(''); }}
            className="btn-primary text-[12px] px-3 py-1.5"
          >
            {showCreate ? 'Cancel' : '+ New link'}
          </button>
        </div>

        {showCreate && (
          <div className="mb-4 p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3">
            {createErr && <p className="text-rose-400 text-[12px]">{createErr}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">
                  Custom slug (optional)
                </label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="my-server"
                  maxLength={32}
                  className="input-field text-[12px] w-full"
                />
                <p className="text-[10px] text-ink-500 mt-1">{baseUrl}<span className="text-ink-300">{newCode || '<random>'}</span></p>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Discord import"
                  maxLength={64}
                  className="input-field text-[12px] w-full"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">
                  Max uses (optional)
                </label>
                <input
                  type="number"
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  placeholder="unlimited"
                  min={1}
                  max={100000}
                  className="input-field text-[12px] w-full"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">
                  Expires (optional)
                </label>
                <input
                  type="datetime-local"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="input-field text-[12px] w-full"
                />
              </div>
            </div>

            {/* History toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={newHistory}
                onClick={() => setNewHistory((p) => !p)}
                className={`relative w-9 h-5 rounded-full transition-colors ${newHistory ? 'bg-accent-violet' : 'bg-ink-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${newHistory ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-[12px] text-ink-300">
                {newHistory ? 'New members can see message history' : 'New members see only new messages'}
              </span>
            </label>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary text-[12px] px-4 py-2 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create invite link'}
            </button>
          </div>
        )}

        {/* Link list */}
        {loading ? (
          <p className="text-ink-400 text-sm text-center py-6">Loading…</p>
        ) : links.length === 0 ? (
          <p className="text-ink-400 text-sm text-center py-6">No invite links yet — create one above.</p>
        ) : (
          <div className="space-y-2">
            {links.map((link) => {
              const expired   = isExpired(link);
              const exhausted = isExhausted(link);
              const dead      = !link.isActive || expired || exhausted;
              return (
                <div
                  key={link.id}
                  className={`p-3 rounded-xl border transition-colors ${dead ? 'border-white/[0.05] bg-white/[0.01] opacity-60' : 'border-white/[0.08] bg-white/[0.03]'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Code + copy */}
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => copyLink(link.code)}
                          className="font-mono text-[13px] text-accent-violet hover:text-blue-300 transition-colors truncate"
                          title="Click to copy"
                        >
                          {link.code}
                        </button>
                        {copied === link.code ? (
                          <span className="text-[10px] text-emerald-400 font-semibold">Copied!</span>
                        ) : (
                          <button
                            onClick={() => copyLink(link.code)}
                            className="text-ink-500 hover:text-ink-300 transition-colors"
                            title="Copy link"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Meta pills */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {link.label && (
                          <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-ink-300">{link.label}</span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-ink-400">
                          {link.uses}{link.maxUses !== null ? `/${link.maxUses}` : ''} uses
                        </span>
                        {link.allowHistory ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">history ✓</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">no history</span>
                        )}
                        {fmtExpiry(link.expiresAt) && (
                          <span className={`px-1.5 py-0.5 rounded ${expired ? 'bg-rose-500/10 text-rose-400' : 'bg-white/[0.06] text-ink-400'}`}>
                            {expired ? 'expired' : `expires ${fmtExpiry(link.expiresAt)}`}
                          </span>
                        )}
                        {exhausted && <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400">limit reached</span>}
                        {!link.isActive && !expired && !exhausted && (
                          <span className="px-1.5 py-0.5 rounded bg-ink-700 text-ink-400">disabled</span>
                        )}
                        <span className="text-ink-500">by {link.createdBy}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleLink(link)}
                        title={link.isActive ? 'Disable link' : 'Enable link'}
                        className={`h-7 w-7 grid place-items-center rounded-md border transition-colors text-[10px] font-bold ${
                          link.isActive
                            ? 'border-white/[0.08] text-ink-400 hover:text-rose-300 hover:border-rose-500/30'
                            : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                      >
                        {link.isActive ? '⏸' : '▶'}
                      </button>
                      <button
                        onClick={() => deleteLink(link.id)}
                        title="Delete link"
                        className="h-7 w-7 grid place-items-center rounded-md border border-white/[0.08] text-ink-400 hover:text-rose-300 hover:border-rose-500/30 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
