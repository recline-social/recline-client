import { useEffect, useRef, useState } from 'react';
import type { ServerSummary } from '../types';
import { Avatar } from './Avatar';
import { getServerUrl } from '../lib/serverUrl';

type Props = {
  servers: ServerSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  onViewProfile: () => void;

  me: { id: string; displayName: string; username: string; avatarUrl?: string | null };
  unreadByServer: Record<string, number>;
  connectionState: 'connected' | 'connecting' | 'disconnected';
  view: 'server' | 'dm';
  onViewChange: (v: 'server' | 'dm') => void;
  dmUnread: number;
  onReorder: (newOrder: string[]) => void;
  sparksBalance?: number;
};

function initialsOfServer(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function resolveIconUrl(iconUrl: string | null | undefined): string | null {
  if (!iconUrl) return null;
  return iconUrl.startsWith('/') ? (getServerUrl() || '') + iconUrl : iconUrl;
}

export function ServerRail({
  servers,
  activeId,
  onSelect,
  onCreate,
  onJoin,
  onLogout,
  onOpenProfile,
  onViewProfile,

  me,
  unreadByServer,
  connectionState,
  view,
  onViewChange,
  dmUnread,
  onReorder,
  sparksBalance = 0,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragSrcRef = useRef<string | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const connDot =
    connectionState === 'connected'
      ? 'bg-emerald-400'
      : connectionState === 'connecting'
      ? 'bg-amber-400 animate-pulseDot'
      : 'bg-rose-500';
  const connLabel =
    connectionState === 'connected'
      ? 'Online'
      : connectionState === 'connecting'
      ? 'Reconnecting'
      : 'Offline';

  // ── HTML5 native drag-to-reorder ──────────────────────────────────────────
  function handleDragStart(serverId: string, e: React.DragEvent) {
    dragSrcRef.current = serverId;
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleDragOver(e: React.DragEvent, serverId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragSrcRef.current && dragSrcRef.current !== serverId) {
      setDragOver(serverId);
    }
  }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const srcId = dragSrcRef.current;
    if (!srcId || srcId === targetId) { setDragOver(null); return; }
    const ids = servers.map((s) => s.id);
    const srcIdx = ids.indexOf(srcId);
    const tgtIdx = ids.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) { setDragOver(null); return; }
    const newIds = [...ids];
    newIds.splice(srcIdx, 1);
    newIds.splice(tgtIdx, 0, srcId);
    onReorder(newIds);
    setDragOver(null);
    dragSrcRef.current = null;
  }
  function handleDragEnd() {
    setDragOver(null);
    dragSrcRef.current = null;
  }

  return (
    <aside className="h-full w-[62px] flex flex-col items-center py-3 gap-1.5 bg-ink-950 border-r border-white/[0.09]">

      {/* Recline home button — navigates to DM / home view */}
      <button
        onClick={() => onViewChange('dm')}
        className={`h-10 w-10 grid place-items-center rounded-2xl mb-1 shrink-0 ring-1 transition-all duration-150 shadow-glow
          ${view === 'dm'
            ? 'bg-accent-violet ring-white/20 scale-105'
            : 'bg-accent-violet/80 ring-white/10 hover:bg-accent-violet hover:ring-white/20 hover:scale-105'
          }`}
        title="Home"
        aria-label="Go to home / direct messages"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </button>

      <div className="h-px w-8 bg-white/[0.07] shrink-0" />

      {/* DM / Messages toggle */}
      <button
        onClick={() => onViewChange(view === 'dm' ? 'server' : 'dm')}
        className={`group relative h-10 w-10 grid place-items-center rounded-xl transition-all duration-150 shrink-0 ${
          view === 'dm'
            ? 'bg-accent-violet/20 text-accent-violet'
            : 'text-ink-400 hover:bg-white/[0.07] hover:text-ink-100'
        }`}
        title="Direct Messages"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {dmUnread > 0 && view !== 'dm' && (
          <span className="absolute -right-0.5 -bottom-0.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[9px] font-bold leading-none border border-ink-950">
            {dmUnread > 99 ? '99+' : dmUnread}
          </span>
        )}
      </button>

      <div className="h-px w-8 bg-white/[0.07] shrink-0" />

      {/* Server list — scrollable, drag-to-reorder */}
      <div className="flex-1 min-h-0 w-full overflow-y-auto flex flex-col items-center gap-1.5 px-2">
        {servers.map((s) => {
          const active = s.id === activeId;
          const unread = unreadByServer[s.id] ?? 0;
          const iconUrl = resolveIconUrl(s.icon_url);
          const isDragTarget = dragOver === s.id;

          return (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => handleDragStart(s.id, e)}
              onDragOver={(e) => handleDragOver(e, s.id)}
              onDrop={(e) => handleDrop(e, s.id)}
              onDragEnd={handleDragEnd}
              className="relative group shrink-0"
              title={s.name}
            >
              {/* Active indicator dot (below icon) */}
              <span
                className={`absolute left-1/2 -translate-x-1/2 -bottom-1.5 rounded-full transition-all duration-200 ${
                  active
                    ? 'w-1.5 h-1.5 bg-white'
                    : unread > 0
                    ? 'w-1 h-1 bg-white/70'
                    : 'w-0 h-0 bg-white/0 group-hover:w-1 group-hover:h-1 group-hover:bg-white/40'
                }`}
              />
              <button
                onClick={() => onSelect(s.id)}
                className={`h-10 w-10 grid place-items-center overflow-hidden transition-all duration-150 rounded-full ${
                  isDragTarget ? 'scale-110' : ''
                } ${
                  active
                    ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-ink-950'
                    : 'hover:ring-2 hover:ring-white/20 hover:ring-offset-2 hover:ring-offset-ink-950'
                } ${
                  iconUrl ? '' : active
                    ? 'bg-accent-violet/25 text-white'
                    : 'bg-ink-800 text-ink-100 hover:bg-ink-700'
                }`}
              >
                {iconUrl ? (
                  <img src={iconUrl} alt={s.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[11px] font-bold tracking-wide select-none">
                    {initialsOfServer(s.name)}
                  </span>
                )}
              </button>

              {/* Unread badge */}
              {unread > 0 && !active && (
                <span className="absolute -right-0.5 -bottom-0.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[9px] font-bold border border-ink-950">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          );
        })}

        {/* Create + Join server */}
        <div className="flex flex-col items-center gap-1.5 mt-1 shrink-0">
          <button
            onClick={onCreate}
            className="h-10 w-10 grid place-items-center rounded-xl bg-ink-800/60 hover:bg-emerald-500/15 text-ink-400 hover:text-emerald-300 transition-all duration-150 border border-white/[0.06]"
            title="Create a Space"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={onJoin}
            className="h-10 w-10 grid place-items-center rounded-xl bg-ink-800/60 hover:bg-sky-500/12 text-ink-400 hover:text-sky-300 transition-all duration-150 border border-white/[0.06]"
            title="Join a Space"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="h-px w-8 bg-white/[0.07] shrink-0" />

      {/* User account menu */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`h-10 w-10 grid place-items-center rounded-xl transition-colors relative ${
            menuOpen ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
          }`}
          title={`${me.displayName} · ${connLabel}`}
        >
          <Avatar name={me.displayName} id={me.id} size="md" isSelf imageUrl={me.avatarUrl} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-950 ${connDot}`}
          />
        </button>

        {menuOpen && (
          <div className="absolute left-[54px] bottom-0 z-30 w-56 rounded-xl py-1.5 shadow-soft overflow-hidden bg-ink-950/95 border border-white/[0.09] backdrop-blur-2xl">
            {/* User identity */}
            <div className="px-3 py-2.5 border-b border-white/[0.07]">
              <div className="flex items-center gap-2.5">
                <Avatar name={me.displayName} id={me.id} size="sm" isSelf imageUrl={me.avatarUrl} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">{me.displayName}</div>
                  <div className="text-[11px] text-ink-400 truncate">@{me.username}</div>
                </div>
              </div>
              {/* Sparks balance badge */}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${connDot}`} />
                  <span className="text-[10px] text-ink-400">{connLabel}</span>
                </div>
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent-amber/10 border border-accent-amber/25 text-accent-amber"
                  title="Spark balance"
                >
                  <span className="text-[8px]">✦</span>
                  {sparksBalance.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="py-1">
              <MenuItem
                onClick={() => { setMenuOpen(false); onViewProfile(); }}
                icon={<BadgeIcon />}
                label="View my profile"
              />
              <MenuItem
                onClick={() => { setMenuOpen(false); onOpenProfile(); }}
                icon={<UserIcon />}
                label="Account settings"
              />
              <div className="my-1 mx-2 border-t border-white/[0.06]" />
              <MenuItem
                onClick={() => { setMenuOpen(false); onLogout(); }}
                icon={<LogoutIcon />}
                label="Log out"
                danger
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Menu sub-components ────────────────────────────────────────────────────

function MenuItem({
  onClick,
  icon,
  label,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors ${
        danger
          ? 'text-rose-300 hover:bg-rose-500/10'
          : 'text-ink-200 hover:bg-white/[0.05] hover:text-ink-100'
      }`}
    >
      <span className={danger ? 'text-rose-400' : 'text-ink-400'}>{icon}</span>
      {label}
    </button>
  );
}

function BadgeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
