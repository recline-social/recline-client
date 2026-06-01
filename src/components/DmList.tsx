import { useState } from 'react';
import type { DmChannel, Friend } from '../types';
import { Avatar } from './Avatar';
import { api } from '../lib/api';

type Tab = 'messages' | 'friends';

type Props = {
  dms: DmChannel[];
  activeDmId: string | null;
  unread: Record<string, number>;
  online: Set<string>;
  onSelect: (dm: DmChannel) => void;
  friends: Friend[];
  onFriendsChange: (friends: Friend[]) => void;
  onOpenDmWithUser?: (userId: string) => void;
};

function timeAgo(ts: number | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export function DmList({ dms, activeDmId, unread, online, onSelect, friends, onFriendsChange, onOpenDmWithUser }: Props) {
  const [tab, setTab] = useState<Tab>('messages');
  const [addUsername, setAddUsername] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const sorted = [...dms].sort((a, b) => {
    const aTs = a.lastMessageAt ?? a.createdAt;
    const bTs = b.lastMessageAt ?? b.createdAt;
    return bTs - aTs;
  });

  const accepted = friends.filter((f) => f.status === 'accepted');
  const incoming = friends.filter((f) => f.status === 'pending' && f.direction === 'incoming');
  const outgoing = friends.filter((f) => f.status === 'pending' && f.direction === 'outgoing');
  const onlineFriends = accepted.filter((f) => online.has(f.userId));
  const offlineFriends = accepted.filter((f) => !online.has(f.userId));
  const pendingCount = incoming.length;

  async function handleAddFriend(e: React.FormEvent) {
    e.preventDefault();
    const uname = addUsername.trim();
    if (!uname) return;
    setAddLoading(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      const { friendship } = await api.sendFriendRequest(uname);
      // Deduplicate: if the server auto-accepted a mutual request, update the existing
      // pending entry instead of appending a duplicate
      const existing = friends.find((f) => f.id === friendship.id);
      onFriendsChange(existing
        ? friends.map((f) => f.id === friendship.id ? { ...f, status: friendship.status as 'accepted' | 'pending' } : f)
        : [...friends, friendship]);
      setAddUsername('');
      setAddSuccess(
        friendship.status === 'accepted'
          ? `Now friends with ${friendship.displayName}!`
          : `Request sent to ${friendship.displayName}.`
      );
      setTimeout(() => setAddSuccess(null), 3500);
    } catch (err: any) {
      setAddError(err?.message ?? 'Could not send request');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleAccept(id: string) {
    if (actionLoading[id]) return;
    setActionLoading((p) => ({ ...p, [id]: true }));
    setActionError(null);
    try {
      await api.respondFriendRequest(id, 'accept');
      onFriendsChange(friends.map((f) => f.id === id ? { ...f, status: 'accepted' as const } : f));
    } catch (err: any) {
      setActionError(err?.message ?? 'Could not accept request');
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  }

  async function handleReject(id: string) {
    if (actionLoading[id]) return;
    setActionLoading((p) => ({ ...p, [id]: true }));
    setActionError(null);
    try {
      await api.respondFriendRequest(id, 'reject');
      onFriendsChange(friends.filter((f) => f.id !== id));
    } catch (err: any) {
      setActionError(err?.message ?? 'Could not decline request');
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  }

  async function handleRemove(id: string) {
    if (actionLoading[id]) return;
    setActionLoading((p) => ({ ...p, [id]: true }));
    setActionError(null);
    try {
      await api.removeFriend(id);
      onFriendsChange(friends.filter((f) => f.id !== id));
    } catch (err: any) {
      setActionError(err?.message ?? 'Could not remove friend');
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  }

  return (
    <div className="h-full flex flex-col border-r border-white/[0.06] bg-ink-900/55">

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 shrink-0">
        <TabBtn active={tab === 'messages'} onClick={() => setTab('messages')}>
          Messages
        </TabBtn>
        <TabBtn
          active={tab === 'friends'}
          onClick={() => setTab('friends')}
          badge={pendingCount > 0 ? pendingCount : undefined}
        >
          Friends
        </TabBtn>
      </div>

      {/* ── Messages tab ── */}
      {tab === 'messages' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          {sorted.length === 0 ? (
            <div className="px-3 py-10 text-center space-y-2">
              <div className="text-[28px] leading-none select-none">💬</div>
              <div className="text-[12px] text-ink-200 leading-relaxed">No conversations yet.</div>
              <div className="text-[11px] text-ink-300">Click a member in any server to start a DM.</div>
            </div>
          ) : (
            <div className="space-y-0.5 pt-1">
              {sorted.map((dm) => {
                const active = dm.id === activeDmId;
                const n = unread[dm.id] ?? 0;
                const isOnline = online.has(dm.otherUserId);
                return (
                  <button
                    key={dm.id}
                    onClick={() => onSelect(dm)}
                    className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all ${
                      active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        name={dm.otherDisplayName}
                        id={dm.otherUserId}
                        size="sm"
                        imageUrl={dm.otherAvatarUrl}
                        status={isOnline ? 'online' : 'offline'}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[14px] sm:text-[13px] truncate ${n > 0 ? 'font-semibold text-white' : 'font-medium text-ink-100'}`}>
                        {dm.otherDisplayName}
                      </div>
                      <div className="text-[12px] sm:text-[11px] text-ink-300 truncate">@{dm.otherUsername}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {dm.lastMessageAt && (
                        <span className="text-[11px] sm:text-[10px] text-ink-200">{timeAgo(dm.lastMessageAt)}</span>
                      )}
                      {n > 0 && (
                        <span className="min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[9px] font-bold">
                          {n > 99 ? '99+' : n}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Friends tab ── */}
      {tab === 'friends' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-4">

          {/* Add friend form */}
          <div className="pt-2 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-300 font-semibold">Add Friend</div>
            <form onSubmit={handleAddFriend} className="flex gap-1.5">
              <input
                value={addUsername}
                onChange={(e) => { setAddUsername(e.target.value); setAddError(null); }}
                placeholder="@username"
                className="input text-[12px] py-1.5 flex-1 min-w-0"
                disabled={addLoading}
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={addLoading || !addUsername.trim()}
                className="btn-primary text-[12px] px-2.5 py-1.5 shrink-0"
              >
                {addLoading ? '…' : 'Add'}
              </button>
            </form>
            {addError && (
              <div className="text-[11px] text-rose-300 bg-rose-900/20 border border-rose-900/30 rounded-lg px-2.5 py-1.5">
                {addError}
              </div>
            )}
            {addSuccess && (
              <div className="text-[11px] text-emerald-300 bg-emerald-900/20 border border-emerald-900/30 rounded-lg px-2.5 py-1.5">
                {addSuccess}
              </div>
            )}
          </div>

          {/* Action error banner */}
          {actionError && (
            <div className="text-[11px] text-rose-300 bg-rose-900/20 border border-rose-900/30 rounded-lg px-2.5 py-1.5">
              {actionError}
              <button onClick={() => setActionError(null)} className="ml-2 text-rose-400 hover:text-rose-200">✕</button>
            </div>
          )}

          {/* Incoming requests */}
          {incoming.length > 0 && (
            <div className="space-y-1.5">
              <SectionHeader>
                Pending
                <span className="ml-1.5 bg-rose-500 text-white text-[9px] font-bold px-1.5 rounded-full">
                  {incoming.length}
                </span>
              </SectionHeader>
              {incoming.map((f) => (
                <FriendRow key={f.id} friend={f} online={false}>
                  <button
                    onClick={() => handleAccept(f.id)}
                    disabled={!!actionLoading[f.id]}
                    className="h-8 w-8 sm:h-6 sm:w-6 grid place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                    title="Accept"
                  >
                    {actionLoading[f.id] ? <SpinIcon /> : <CheckIcon />}
                  </button>
                  <button
                    onClick={() => handleReject(f.id)}
                    disabled={!!actionLoading[f.id]}
                    className="h-8 w-8 sm:h-6 sm:w-6 grid place-items-center rounded-lg bg-rose-500/12 text-rose-400 hover:bg-rose-500/22 transition-colors disabled:opacity-40"
                    title="Decline"
                  >
                    <XIcon />
                  </button>
                </FriendRow>
              ))}
            </div>
          )}

          {/* Outgoing requests */}
          {outgoing.length > 0 && (
            <div className="space-y-1.5">
              <SectionHeader>Sent</SectionHeader>
              {outgoing.map((f) => (
                <FriendRow key={f.id} friend={f} online={false} dim>
                  <button
                    onClick={() => handleRemove(f.id)}
                    disabled={!!actionLoading[f.id]}
                    className="h-8 w-8 sm:h-6 sm:w-6 grid place-items-center rounded-lg text-ink-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                    title="Cancel request"
                  >
                    {actionLoading[f.id] ? <SpinIcon /> : <XIcon />}
                  </button>
                </FriendRow>
              ))}
            </div>
          )}

          {/* Online friends */}
          {onlineFriends.length > 0 && (
            <div className="space-y-1.5">
              <SectionHeader>Online — {onlineFriends.length}</SectionHeader>
              {onlineFriends.map((f) => (
                <FriendRow key={f.id} friend={f} online>
                  {onOpenDmWithUser && (
                    <button
                      onClick={() => onOpenDmWithUser(f.userId)}
                      className="h-8 w-8 sm:h-6 sm:w-6 grid place-items-center rounded-lg text-ink-300 hover:text-accent-violet hover:bg-accent-violet/10 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100"
                      title="Message"
                    >
                      <MsgIcon />
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(f.id)}
                    disabled={!!actionLoading[f.id]}
                    className="h-8 w-8 sm:h-6 sm:w-6 grid place-items-center rounded-lg text-ink-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100 disabled:opacity-40"
                    title="Remove friend"
                  >
                    {actionLoading[f.id] ? <SpinIcon /> : <XIcon />}
                  </button>
                </FriendRow>
              ))}
            </div>
          )}

          {/* Offline friends */}
          {offlineFriends.length > 0 && (
            <div className="space-y-1.5">
              <SectionHeader>Offline — {offlineFriends.length}</SectionHeader>
              {offlineFriends.map((f) => (
                <FriendRow key={f.id} friend={f} online={false} dim>
                  {onOpenDmWithUser && (
                    <button
                      onClick={() => onOpenDmWithUser(f.userId)}
                      className="h-8 w-8 sm:h-6 sm:w-6 grid place-items-center rounded-lg text-ink-300 hover:text-accent-violet hover:bg-accent-violet/10 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100"
                      title="Message"
                    >
                      <MsgIcon />
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(f.id)}
                    disabled={!!actionLoading[f.id]}
                    className="h-8 w-8 sm:h-6 sm:w-6 grid place-items-center rounded-lg text-ink-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100 disabled:opacity-40"
                    title="Remove friend"
                  >
                    {actionLoading[f.id] ? <SpinIcon /> : <XIcon />}
                  </button>
                </FriendRow>
              ))}
            </div>
          )}

          {/* Empty state */}
          {accepted.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
            <div className="py-10 text-center space-y-2">
              <div className="text-[28px] leading-none select-none">👥</div>
              <div className="text-[12px] text-ink-200">No friends yet.</div>
              <div className="text-[11px] text-ink-300">Type a @username above to send a request.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Internal sub-components ────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 text-[12px] font-medium py-2.5 sm:py-1.5 rounded-lg transition-colors ${
        active ? 'bg-white/[0.09] text-ink-100' : 'text-ink-400 hover:text-ink-200 hover:bg-white/[0.04]'
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[9px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.14em] text-ink-300 font-semibold flex items-center">
      {children}
    </div>
  );
}

function FriendRow({
  friend,
  online,
  children,
  dim,
}: {
  friend: Friend;
  online: boolean;
  children?: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <div className="group/row flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-white/[0.04] transition-colors">
      <div className="relative shrink-0">
        <Avatar
          name={friend.displayName}
          id={friend.userId}
          size="sm"
          imageUrl={friend.avatarUrl}
          status={online ? 'online' : 'offline'}
        />
      </div>
      <div className={`flex-1 min-w-0 ${dim ? 'opacity-65' : ''}`}>
        <div className="text-[12px] font-medium text-ink-100 truncate">{friend.displayName}</div>
        <div className="text-[10px] text-ink-300 truncate">@{friend.username}</div>
      </div>
      {children && (
        <div className="flex items-center gap-1 shrink-0">{children}</div>
      )}
    </div>
  );
}

function SpinIcon() {
  return (
    <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function MsgIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
