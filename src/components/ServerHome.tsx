import { useMemo } from 'react';
import type { Channel, CallPeer, Member, ServerSummary, DecodedMessage, User } from '../types';
import { Avatar } from './Avatar';
import { SocialLinks } from './SocialLinks';

type ChannelState = {
  messages: DecodedMessage[];
  loaded: boolean;
  hasMore?: boolean;
};

type Props = {
  server: ServerSummary;
  channels: Channel[];
  members: Member[];
  online: Set<string>;
  callRoster: Record<string, CallPeer[]>;
  unread: Record<string, number>;
  channelMsgs: Record<string, ChannelState>;
  keysReady: boolean;
  onUnlock: () => void;
  onSelectChannel: (ch: Channel) => void;
  me: User;
  /** Mobile only — opens the channel/server drawer */
  onOpenSidebar?: () => void;
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ServerHome({
  server,
  channels,
  members,
  online,
  callRoster,
  unread,
  channelMsgs,
  keysReady,
  onUnlock,
  onSelectChannel,
  me,
  onOpenSidebar,
}: Props) {
  const textChannels = useMemo(() => channels.filter((c) => c.type === 'text'), [channels]);
  const voiceChannels = useMemo(() => channels.filter((c) => c.type === 'voice'), [channels]);

  // Members sorted: online first, then by display name
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const aOnline = online.has(a.id) ? 0 : 1;
      const bOnline = online.has(b.id) ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [members, online]);

  const onlineCount = useMemo(
    () => members.filter((m) => online.has(m.id)).length,
    [members, online],
  );

  // Active text channels: sort by last decoded message timestamp, then unread count
  const activeSpaces = useMemo(() => {
    return [...textChannels]
      .map((ch) => {
        const st = channelMsgs[ch.id];
        const lastMsg = st?.messages[st.messages.length - 1] ?? null;
        return { ch, lastMsg, unreadCount: unread[ch.id] ?? 0 };
      })
      .sort((a, b) => {
        // Unread channels float to the top
        if ((a.unreadCount > 0) !== (b.unreadCount > 0)) return a.unreadCount > 0 ? -1 : 1;
        // Then sort by most recent message
        const aTs = a.lastMsg?.createdAt ?? 0;
        const bTs = b.lastMsg?.createdAt ?? 0;
        return bTs - aTs;
      });
  }, [textChannels, channelMsgs, unread]);

  // Voice channels enriched with who's in them
  const voiceRooms = useMemo(() => {
    return voiceChannels.map((ch) => {
      const peers = callRoster[ch.id] ?? [];
      const occupants = peers
        .map((p) => members.find((m) => m.id === p.userId))
        .filter(Boolean) as Member[];
      return { ch, occupants, live: occupants.length > 0 };
    });
  }, [voiceChannels, callRoster, members]);

  // Any active screen sharing / video — treat voice channels with 2+ people as "live"
  const liveRooms = voiceRooms.filter((r) => r.occupants.length > 1);

  return (
    <div className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-ink-950/40">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="px-4 md:px-8 pt-6 md:pt-10 pb-6 border-b border-white/[0.05]">
        {/* Mobile hamburger button */}
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="md:hidden mb-4 h-9 w-9 grid place-items-center rounded-lg text-ink-300 hover:bg-white/[0.06] hover:text-ink-100"
            aria-label="Open channel list"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-ink-100 mb-1">
              {server.name}
            </h1>
            <div className="flex items-center gap-3 text-xs text-ink-300">
              <span>{members.length} {members.length === 1 ? 'member' : 'members'}</span>
              <span className="h-1 w-1 rounded-full bg-ink-700" />
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {onlineCount} online
              </span>
            </div>
          </div>

          {/* Encryption status badge */}
          {keysReady ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Encrypted
            </div>
          ) : (
            <button
              onClick={onUnlock}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-medium shrink-0 hover:bg-amber-500/15 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 8.66-2.5"/>
              </svg>
              Locked · Tap to unlock
            </button>
          )}
        </div>

        {/* Brand line */}
        <p className="text-xs text-ink-300/50 tracking-wide">
          Your community. Your autonomy.
        </p>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-8 max-w-3xl">

        {/* ── Voice rooms ─────────────────────────────────────────── */}
        {voiceChannels.length > 0 && (
          <section>
            <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-ink-300/60 mb-3">
              Voice rooms
            </h2>
            <div className="space-y-2">
              {voiceRooms.map(({ ch, occupants, live }) => (
                <button
                  key={ch.id}
                  onClick={() => onSelectChannel(ch)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left group
                    ${live
                      ? 'bg-emerald-500/8 border-emerald-500/20 hover:bg-emerald-500/12'
                      : 'bg-ink-800/30 border-white/[0.05] hover:bg-ink-800/50 hover:border-white/10'
                    }`}
                >
                  {/* Mic icon */}
                  <div className={`h-8 w-8 rounded-lg grid place-items-center shrink-0
                    ${live ? 'bg-emerald-500/15 text-emerald-400' : 'bg-ink-700/50 text-ink-400'}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${live ? 'text-ink-100' : 'text-ink-300'}`}>
                        {ch.name}
                      </span>
                      {live && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </div>
                    {occupants.length > 0 && (
                      <div className="text-[11px] text-ink-300/70 mt-0.5">
                        {occupants.map((m) => m.displayName).join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Occupant avatars */}
                  {occupants.length > 0 && (
                    <div className="flex -space-x-2 shrink-0">
                      {occupants.slice(0, 4).map((m) => (
                        <Avatar key={m.id} name={m.displayName} id={m.id} size="sm" isSelf={m.id === me.id} imageUrl={m.avatarUrl} />
                      ))}
                      {occupants.length > 4 && (
                        <div className="h-6 w-6 rounded-full bg-ink-700 border-2 border-ink-900 grid place-items-center text-[9px] text-ink-300 font-bold">
                          +{occupants.length - 4}
                        </div>
                      )}
                    </div>
                  )}

                  {occupants.length === 0 && (
                    <span className="text-[11px] text-ink-300/40 shrink-0">Empty</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Live rooms (screen share / collab) ─────────────────── */}
        {liveRooms.length > 0 && (
          <section>
            <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-ink-300/60 mb-3">
              Live room
            </h2>
            <div className="space-y-2">
              {liveRooms.map(({ ch, occupants }) => (
                <button
                  key={ch.id}
                  onClick={() => onSelectChannel(ch)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border bg-accent-violet/5 border-accent-violet/20 hover:bg-accent-violet/8 transition-all text-left"
                >
                  <div className="h-8 w-8 rounded-lg grid place-items-center shrink-0 bg-accent-violet/15 text-accent-violet">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                      <path d="m10 17 5-3-5-3v6z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-100">{ch.name}</span>
                      <span className="text-[10px] font-semibold text-accent-violet bg-accent-violet/10 border border-accent-violet/20 px-1.5 py-0.5 rounded-full">
                        {occupants.length} sharing
                      </span>
                    </div>
                  </div>
                  <div className="flex -space-x-2 shrink-0">
                    {occupants.slice(0, 3).map((m) => (
                      <Avatar key={m.id} name={m.displayName} id={m.id} size="sm" isSelf={m.id === me.id} imageUrl={m.avatarUrl} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Active spaces ────────────────────────────────────────── */}
        {textChannels.length > 0 && (
          <section>
            <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-ink-300/60 mb-3">
              Active spaces
            </h2>
            <div className="space-y-1.5">
              {activeSpaces.map(({ ch, lastMsg, unreadCount }) => (
                <button
                  key={ch.id}
                  onClick={() => onSelectChannel(ch)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-left group
                    ${unreadCount > 0
                      ? 'bg-ink-800/50 border-white/[0.07] hover:border-white/[0.12]'
                      : 'bg-transparent border-transparent hover:bg-ink-800/30 hover:border-white/[0.05]'
                    }`}
                >
                  <span className={`text-sm font-mono transition-colors
                    ${unreadCount > 0 ? 'text-ink-300' : 'text-ink-400/60'}`}>
                    #
                  </span>
                  <span className={`flex-1 text-sm transition-colors truncate
                    ${unreadCount > 0 ? 'text-ink-100 font-medium' : 'text-ink-300'}`}>
                    {ch.name}
                  </span>

                  {/* Last message preview */}
                  {lastMsg && keysReady && !lastMsg.failed && (
                    <span className="text-[11px] text-ink-400/60 truncate max-w-[140px] hidden sm:block">
                      {lastMsg.body.slice(0, 40)}{lastMsg.body.length > 40 ? '…' : ''}
                    </span>
                  )}

                  {/* Timestamp */}
                  {lastMsg && (
                    <span className="text-[11px] text-ink-400/50 shrink-0 hidden sm:block">
                      {timeAgo(lastMsg.createdAt)}
                    </span>
                  )}

                  {/* Unread badge */}
                  {unreadCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[10px] font-bold shrink-0">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Presence ─────────────────────────────────────────────── */}
        {members.length > 0 && (
          <section>
            <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-ink-300/60 mb-3">
              Community pulse
            </h2>
            <div className="flex flex-wrap gap-2">
              {sortedMembers.map((m) => {
                const isOnline = online.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-colors
                      ${isOnline
                        ? 'bg-ink-800/50 border-white/[0.07]'
                        : 'bg-transparent border-transparent opacity-40'
                      }`}
                    title={`@${m.username}${m.id === me.id ? ' (you)' : ''}${m.role === 'owner' ? ' · owner' : ''}`}
                  >
                    <div className="relative">
                      <Avatar name={m.displayName} id={m.id} size="sm" isSelf={m.id === me.id} imageUrl={m.avatarUrl} status={isOnline ? 'online' : 'offline'} />
                    </div>
                    <span className={`text-xs font-medium truncate max-w-[96px]
                      ${isOnline ? 'text-ink-200' : 'text-ink-400'}`}>
                      {m.displayName}
                    </span>
                    {m.role === 'owner' && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent-rose shrink-0">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </div>
      <div className="px-4 md:px-8 pb-6">
        <div className="border-t border-white/[0.06] pt-4">
          <p className="text-[11px] text-ink-500 text-center mb-2">
            Stay connected with Recline updates and community highlights.
          </p>
          <SocialLinks compact />
        </div>
      </div>
    </div>
  );
}
