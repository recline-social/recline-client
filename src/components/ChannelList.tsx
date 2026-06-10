import React, { useState, useEffect } from 'react';
import type { Channel, ServerSummary } from '../types';

type Props = {
  server: ServerSummary;
  channels: Channel[];
  activeChannelId: string | null;
  onSelect: (channel: Channel) => void;
  onCreateChannel: (name: string, type: 'text' | 'voice') => void;
  canManage: boolean;
  inviteCode: string;
  encrypted: boolean;
  callRoster: Record<string, { userId: string }[]>; // channelId -> peers
  unread: Record<string, number>;
  onOpenSettings: () => void;
  onDeleteChannel?: (channelId: string, channelName: string) => void;
  // FEAT-040: notification mutes
  serverMuted?: boolean;
  mutedChannels?: Set<string>;
  onToggleServerMute?: () => void;
  onToggleChannelMute?: (channelId: string) => void;
  // FEAT-020: open message search
  onOpenSearch?: () => void;
  // FEAT-033: mark every channel in this server as read
  onMarkAllRead?: () => void;
};

function BellIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13.73 21a2 2 0 0 1-3.46 0" /><path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" /><path d="M18 8a6 6 0 0 0-9.33-5" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function RoomDot() {
  return (
    <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-60 shrink-0" />
  );
}

function MicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function ChannelList(props: Props) {
  const {
    server,
    channels,
    activeChannelId,
    onSelect,
    onCreateChannel,
    canManage,
    inviteCode,
    encrypted,
    callRoster,
    unread,
    onOpenSettings,
    onDeleteChannel,
    serverMuted,
    mutedChannels,
    onToggleServerMute,
    onToggleChannelMute,
    onOpenSearch,
    onMarkAllRead,
  } = props;
  const hasUnread = channels.some((c) => (unread[c.id] ?? 0) > 0);
  const [creating, setCreating] = useState<'text' | 'voice' | null>(null);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Auto-reset delete confirmation after 3s of inactivity
  useEffect(() => {
    if (!confirmDeleteId) return;
    const t = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !creating) return;
    onCreateChannel(name.trim(), creating);
    setName('');
    setCreating(null);
  }

  function copyInvite() {
    const url = `${window.location.origin}/invite/${inviteCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const text  = channels.filter((c) => c.type === 'text');
  const voice = channels.filter((c) => c.type === 'voice');

  return (
    <div className="h-full flex flex-col bg-ink-900/60 border-r border-white/5">
      {/* ── Server header ─────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${encrypted ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <div className="text-[13px] font-semibold truncate min-w-0 text-ink-100">{server.name}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onMarkAllRead && hasUnread && (
            <button
              onClick={onMarkAllRead}
              className="h-6 w-6 grid place-items-center rounded-md text-ink-500 hover:text-ink-200 hover:bg-white/[0.05] transition-colors"
              title="Mark all as read"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 13 5 17 11 9" /><polyline points="11 13 15 17 23 7" />
              </svg>
            </button>
          )}
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="h-6 w-6 grid place-items-center rounded-md text-ink-500 hover:text-ink-200 hover:bg-white/[0.05] transition-colors"
              title="Search messages (Ctrl/⌘K)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
          {canManage && (
            <button
              onClick={copyInvite}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] border transition-all duration-150 ${
                copied
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-ink-800 border-white/[0.08] text-ink-400 hover:text-ink-200 hover:border-white/[0.14]'
              }`}
              title="Copy invite link"
            >
              {copied ? (
                <>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  copied
                </>
              ) : (
                inviteCode.slice(0, 6) + '…'
              )}
            </button>
          )}
          {onToggleServerMute && (
            <button
              onClick={onToggleServerMute}
              className={`h-6 w-6 grid place-items-center rounded-md transition-colors ${
                serverMuted ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10' : 'text-ink-500 hover:text-ink-200 hover:bg-white/[0.05]'
              }`}
              title={serverMuted ? 'Unmute this space' : 'Mute notifications for this space'}
            >
              {serverMuted ? <BellOffIcon /> : <BellIcon />}
            </button>
          )}
          <button
            onClick={onOpenSettings}
            className="h-6 w-6 grid place-items-center rounded-md text-ink-500 hover:text-ink-200 hover:bg-white/[0.05] transition-colors"
            title="Space Settings"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Channel list ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-5">
        <Section
          title="Rooms"
          canAdd={canManage}
          onAdd={() => setCreating('text')}
          adding={creating === 'text'}
        >
          {creating === 'text' && (
            <form onSubmit={submit} className="px-1 pb-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => !name && setCreating(null)}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(null)}
                placeholder="channel-name"
                maxLength={32}
                className="input text-xs py-1.5"
              />
              {name && /[^a-z0-9\-_]/.test(name) && (
                <p className="text-[11px] text-rose-400 px-1 mt-1">Use lowercase letters, numbers, and hyphens only</p>
              )}
              <div className="flex justify-end px-1 mt-0.5">
                <span className="text-[10px] text-ink-500">{name.length}/32</span>
              </div>
            </form>
          )}
          {text.map((c) => {
            const n = unread[c.id] ?? 0;
            return (
              <ChannelItem
                key={c.id}
                channelId={c.id}
                icon={<RoomDot />}
                name={c.name}
                active={c.id === activeChannelId}
                onClick={() => onSelect(c)}
                unread={n > 0 && c.id !== activeChannelId ? n : 0}
                onDelete={canManage ? () => onDeleteChannel?.(c.id, c.name) : undefined}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
                muted={mutedChannels?.has(c.id)}
                onToggleMute={onToggleChannelMute ? () => onToggleChannelMute(c.id) : undefined}
                tierRequired={c.tierRequired}
              />
            );
          })}
        </Section>

        <Section
          title="Voice"
          canAdd={canManage}
          onAdd={() => setCreating('voice')}
          adding={creating === 'voice'}
        >
          {creating === 'voice' && (
            <form onSubmit={submit} className="px-1 pb-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => !name && setCreating(null)}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(null)}
                placeholder="channel-name"
                maxLength={32}
                className="input text-xs py-1.5"
              />
              {name && /[^a-z0-9\-_]/.test(name) && (
                <p className="text-[11px] text-rose-400 px-1 mt-1">Use lowercase letters, numbers, and hyphens only</p>
              )}
              <div className="flex justify-end px-1 mt-0.5">
                <span className="text-[10px] text-ink-500">{name.length}/32</span>
              </div>
            </form>
          )}
          {voice.map((c) => {
            const roster = callRoster[c.id] ?? [];
            return (
              <div key={c.id}>
                <ChannelItem
                  channelId={c.id}
                  icon={<MicIcon />}
                  name={c.name}
                  active={c.id === activeChannelId}
                  onClick={() => onSelect(c)}
                  badge={roster.length > 0 ? `${roster.length}` : undefined}
                  onDelete={canManage ? () => onDeleteChannel?.(c.id, c.name) : undefined}
                  confirmDeleteId={confirmDeleteId}
                  setConfirmDeleteId={setConfirmDeleteId}
                  muted={mutedChannels?.has(c.id)}
                  onToggleMute={onToggleChannelMute ? () => onToggleChannelMute(c.id) : undefined}
                  tierRequired={c.tierRequired}
                />
              </div>
            );
          })}
        </Section>

        {canManage && text.length === 0 && voice.length === 0 && (
          <div className="mx-3 mt-4 rounded-lg border border-dashed border-ink-600 p-3 text-center">
            <p className="text-[12px] text-ink-400">No channels yet.</p>
            <p className="text-[11px] text-ink-500 mt-0.5">Click <span className="font-semibold text-ink-300">+</span> above to create your first room.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  canAdd,
  onAdd,
  adding,
  children,
}: {
  title: string;
  canAdd: boolean;
  onAdd: () => void;
  adding: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* Section header with fading divider line */}
      <div className="flex items-center gap-2 px-1 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-semibold shrink-0 select-none">
          {title}
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-white/[0.07] to-transparent" />
        {canAdd && !adding && (
          <button
            onClick={onAdd}
            className="text-ink-400 hover:text-ink-100 transition-colors shrink-0"
            title={`Add ${title.toLowerCase()} channel`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-500">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ChannelItem({
  channelId,
  icon,
  name,
  active,
  onClick,
  badge,
  unread = 0,
  onDelete,
  confirmDeleteId,
  setConfirmDeleteId,
  muted,
  onToggleMute,
  tierRequired,
}: {
  channelId: string;
  icon: React.ReactNode;
  name: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
  unread?: number;
  onDelete?: () => void;
  confirmDeleteId?: string | null;
  setConfirmDeleteId?: (id: string | null) => void;
  muted?: boolean;
  onToggleMute?: () => void;
  tierRequired?: string | null;
}) {
  const hasUnread = unread > 0;
  const isConfirming = !!onDelete && confirmDeleteId === channelId;

  return (
    <div className="group/item relative">
      {/* Active left accent bar */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-0.5 h-4 rounded-r-full bg-accent-violet pointer-events-none" />
      )}
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] transition-all duration-100 ${
          active
            ? 'bg-accent-violet/10 text-ink-100'
            : hasUnread
            ? 'text-white hover:bg-white/[0.05]'
            : 'text-ink-300 hover:bg-white/[0.04] hover:text-ink-200'
        }`}
      >
        <span className={active ? 'text-accent-violet/70' : hasUnread ? 'text-ink-200' : 'text-ink-500'}>
          {icon}
        </span>
        <span className={`truncate flex-1 text-left text-[13px] ${hasUnread && !active ? 'font-semibold' : ''}`}>
          {name}
        </span>
        {tierRequired && (
          <span title="Tier required — subscribe to access this channel" className="shrink-0">
            <LockIcon />
          </span>
        )}
        {badge && (
          <span className="pill bg-accent-violet/15 text-accent-violet border-0 text-[10px]">{badge}</span>
        )}
        {hasUnread && (
          <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {/* Muted indicator — persistent (when muted) but hidden while hovering so the actions show */}
      {muted && !isConfirming && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-amber-400/70 pointer-events-none group-hover/item:opacity-0 transition-opacity">
          <BellOffIcon />
        </span>
      )}

      {/* Delete confirmation takes over the action area */}
      {isConfirming ? (
        <div
          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); setConfirmDeleteId?.(null); }}
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-rose-300 bg-rose-500/20 hover:bg-rose-500/35 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId?.(null); }}
            className="px-1.5 py-0.5 rounded text-[10px] text-ink-400 hover:text-ink-200 hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (onToggleMute || onDelete) && (
        /* Hover actions: mute toggle + delete */
        <div
          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {onToggleMute && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
              title={muted ? 'Unmute channel' : 'Mute channel notifications'}
              className={`h-5 w-5 grid place-items-center rounded ${muted ? 'text-amber-400 hover:bg-amber-500/15' : 'text-ink-400 hover:text-ink-200 hover:bg-white/[0.06]'}`}
            >
              {muted ? <BellOffIcon /> : <BellIcon />}
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId?.(channelId); }}
              title={`Delete #${name}`}
              className="h-5 w-5 grid place-items-center rounded text-ink-400 hover:text-rose-300 hover:bg-rose-500/15"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
