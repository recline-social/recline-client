import React, { useState } from 'react';
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
};

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
  } = props;
  const [creating, setCreating] = useState<'text' | 'voice' | null>(null);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !creating) return;
    onCreateChannel(name.trim(), creating);
    setName('');
    setCreating(null);
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const text = channels.filter((c) => c.type === 'text');
  const voice = channels.filter((c) => c.type === 'voice');

  return (
    <div className="h-full flex flex-col bg-ink-900/60 border-r border-white/5">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${encrypted ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <div className="text-[13px] font-semibold truncate min-w-0 text-ink-100">{server.name}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canManage && (
            <button
              onClick={copyInvite}
              className="btn-ghost text-[11px] px-2 py-1 font-mono text-ink-400 hover:text-ink-200"
              title="Copy invite code"
            >
              {copied ? 'copied' : inviteCode.slice(0, 6) + '…'}
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

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-4">
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
                className="input text-xs py-1.5"
              />
            </form>
          )}
          {text.map((c) => {
            const n = unread[c.id] ?? 0;
            return (
              <ChannelItem
                key={c.id}
                icon={<RoomDot />}
                name={c.name}
                active={c.id === activeChannelId}
                onClick={() => onSelect(c)}
                unread={n > 0 && c.id !== activeChannelId ? n : 0}
                onDelete={canManage ? () => onDeleteChannel?.(c.id, c.name) : undefined}
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
                className="input text-xs py-1.5"
              />
            </form>
          )}
          {voice.map((c) => {
            const roster = callRoster[c.id] ?? [];
            return (
              <div key={c.id}>
                <ChannelItem
                  icon={<MicIcon />}
                  name={c.name}
                  active={c.id === activeChannelId}
                  onClick={() => onSelect(c)}
                  badge={roster.length > 0 ? `${roster.length}` : undefined}
                  onDelete={canManage ? () => onDeleteChannel?.(c.id, c.name) : undefined}
                />
              </div>
            );
          })}
        </Section>
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
      <div className="flex items-center justify-between px-2 mb-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-300 font-semibold">{title}</span>
        {canAdd && !adding && (
          <button
            onClick={onAdd}
            className="text-ink-300 hover:text-ink-100 transition-colors"
            title="Add channel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
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

function ChannelItem({
  icon,
  name,
  active,
  onClick,
  badge,
  unread = 0,
  onDelete,
}: {
  icon: React.ReactNode;
  name: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
  unread?: number;
  onDelete?: () => void;
}) {
  const hasUnread = unread > 0;
  return (
    <div className="group/item relative">
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors
          ${
            active
              ? 'bg-white/[0.07] text-ink-100'
              : hasUnread
              ? 'text-white hover:bg-white/[0.04]'
              : 'text-ink-200 hover:bg-white/[0.04] hover:text-ink-100'
          }`}
      >
        <span className={active || hasUnread ? 'text-ink-100' : 'text-ink-300'}>{icon}</span>
        <span className={`truncate flex-1 text-left ${hasUnread && !active ? 'font-semibold' : ''}`}>{name}</span>
        {badge && (
          <span className="pill bg-accent-violet/20 text-accent-violet">{badge}</span>
        )}
        {hasUnread && (
          <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            // Confirm before deleting — channel delete is permanent and cascades
            // all messages; a single misclick would cause unrecoverable data loss. (#L-9)
            if (window.confirm(`Delete #${name}? This removes all messages and cannot be undone.`)) {
              onDelete();
            }
          }}
          title={`Delete #${name}`}
          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity h-5 w-5 grid place-items-center rounded text-ink-400 hover:text-rose-300 hover:bg-rose-500/15"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
