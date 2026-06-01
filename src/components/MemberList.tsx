import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Avatar } from './Avatar';
import { userColor } from '../lib/colors';
import type { Member, ServerRole, User } from '../types';

type Props = {
  members: Member[];
  online: Set<string>;
  me: User;
  onOpenDm?: (userId: string) => void;
  onClickUser?: (userId: string) => void;
  /** Extra classes added to the root aside element (e.g. "hidden md:flex" for responsive hiding) */
  className?: string;
  roles?: ServerRole[];
  /** All server roles for the assign/remove role context menu */
  allRoles?: ServerRole[];
  /** True if the current user can manage roles (owner or has MANAGE_ROLES perm) */
  canManageRoles?: boolean;
  onAssignRole?: (userId: string, roleId: string) => Promise<void>;
  onRemoveRole?: (userId: string, roleId: string) => Promise<void>;
};

// ── ContextMenu ───────────────────────────────────────────────────────────────

type ContextMenuState = {
  x: number;
  y: number;
  targetMember: Member;
};

function ContextMenu({
  state,
  allRoles,
  canManageRoles,
  onAssignRole,
  onRemoveRole,
  onOpenDm,
  onClose,
  me,
}: {
  state: ContextMenuState;
  allRoles: ServerRole[];
  canManageRoles: boolean;
  onAssignRole?: (userId: string, roleId: string) => Promise<void>;
  onRemoveRole?: (userId: string, roleId: string) => Promise<void>;
  onOpenDm?: (userId: string) => void;
  onClose: () => void;
  me: User;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  const isSelf = state.targetMember.id === me.id;
  const memberRoleIds = new Set((state.targetMember.roles ?? []).map((r) => r.id));
  const assignableRoles = allRoles
    .filter((r) => !r.isDefault && !memberRoleIds.has(r.id))
    .sort((a, b) => b.position - a.position);
  const removableRoles = allRoles
    .filter((r) => !r.isDefault && memberRoleIds.has(r.id))
    .sort((a, b) => b.position - a.position);

  // Clamp to viewport after first paint
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      x: rect.right > vw ? Math.max(0, state.x - rect.width) : state.x,
      y: rect.bottom > vh ? Math.max(0, state.y - rect.height) : state.y,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on click-outside or ESC
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  async function handleAssign(roleId: string) {
    if (!onAssignRole || loading) return;
    setLoading(roleId);
    try { await onAssignRole(state.targetMember.id, roleId); }
    finally { setLoading(null); onClose(); }
  }

  async function handleRemove(roleId: string) {
    if (!onRemoveRole || loading) return;
    setLoading(roleId);
    try { await onRemoveRole(state.targetMember.id, roleId); }
    finally { setLoading(null); onClose(); }
  }

  const spinnerSvg = (
    <svg className="ml-auto shrink-0 animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999 }}
      className="min-w-[186px] rounded-lg border border-white/[0.08] bg-ink-900 shadow-2xl shadow-black/70 py-1 text-[13px] select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Member name header */}
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-400 font-semibold border-b border-white/[0.06] mb-1 truncate">
        {state.targetMember.displayName}
      </div>

      {/* Send DM */}
      {!isSelf && onOpenDm && (
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-white/[0.06] text-ink-200 transition-colors flex items-center gap-2"
          onClick={() => { onOpenDm(state.targetMember.id); onClose(); }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-400">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Send DM
        </button>
      )}

      {/* Role management — only for admins, only targeting others */}
      {canManageRoles && !isSelf && (
        <>
          <div className="border-t border-white/[0.06] my-1" />

          {/* Assign Role */}
          <div>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-2 disabled:cursor-default"
              onClick={() => { setAssignOpen((v) => !v); setRemoveOpen(false); }}
              disabled={assignableRoles.length === 0}
            >
              <span className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-400">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <span className={assignableRoles.length === 0 ? 'text-ink-500' : 'text-ink-200'}>
                  Assign Role
                </span>
              </span>
              {assignableRoles.length > 0 && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-ink-400 shrink-0">
                  <polyline points={assignOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
                </svg>
              )}
            </button>
            {assignOpen && (
              <div className="mx-2 mb-1 rounded-md border border-white/[0.06] bg-ink-800/80 overflow-hidden">
                {assignableRoles.map((r) => (
                  <button
                    key={r.id}
                    disabled={!!loading}
                    onClick={() => handleAssign(r.id)}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/[0.06] transition-colors flex items-center gap-2 text-ink-200 disabled:opacity-60"
                  >
                    {r.color
                      ? <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.color }} />
                      : <span className="h-2 w-2 rounded-full shrink-0 bg-ink-600" />
                    }
                    <span className="truncate flex-1">{r.name}</span>
                    {loading === r.id && spinnerSvg}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Remove Role */}
          <div>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-2 disabled:cursor-default"
              onClick={() => { setRemoveOpen((v) => !v); setAssignOpen(false); }}
              disabled={removableRoles.length === 0}
            >
              <span className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-400">
                  <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <span className={removableRoles.length === 0 ? 'text-ink-500' : 'text-ink-200'}>
                  Remove Role
                </span>
              </span>
              {removableRoles.length > 0 && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-ink-400 shrink-0">
                  <polyline points={removeOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
                </svg>
              )}
            </button>
            {removeOpen && (
              <div className="mx-2 mb-1 rounded-md border border-white/[0.06] bg-ink-800/80 overflow-hidden">
                {removableRoles.map((r) => (
                  <button
                    key={r.id}
                    disabled={!!loading}
                    onClick={() => handleRemove(r.id)}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/[0.06] transition-colors flex items-center gap-2 text-ink-200 disabled:opacity-60"
                  >
                    {r.color
                      ? <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.color }} />
                      : <span className="h-2 w-2 rounded-full shrink-0 bg-ink-600" />
                    }
                    <span className="truncate flex-1">{r.name}</span>
                    {loading === r.id && spinnerSvg}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── MemberList ────────────────────────────────────────────────────────────────

export function MemberList({
  members,
  online,
  me,
  onOpenDm,
  onClickUser,
  className = '',
  roles = [],
  allRoles,
  canManageRoles = false,
  onAssignRole,
  onRemoveRole,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const isOnline = (m: Member) => online.has(m.id) || m.id === me.id;

  // allRoles falls back to roles when not separately provided
  const effectiveAllRoles = allRoles ?? roles;

  // Hoisted roles sorted highest position first
  const hoistedRoles = useMemo(
    () => roles.filter((r) => r.hoisted && !r.isDefault).sort((a, b) => b.position - a.position),
    [roles],
  );

  // For each member, find their highest-position hoisted role id (if any)
  function topHoistedRoleId(m: Member): string | null {
    if (!m.roles?.length) return null;
    const memberRoleIds = new Set(m.roles.map((r) => r.id));
    for (const hr of hoistedRoles) {
      if (memberRoleIds.has(hr.id)) return hr.id;
    }
    return null;
  }

  // Build hoisted sections: roleId → { role, online[], offline[] }
  const hoistedSections = useMemo(() => {
    const map = new Map<string, { role: ServerRole; online: Member[]; offline: Member[] }>();
    for (const hr of hoistedRoles) map.set(hr.id, { role: hr, online: [], offline: [] });

    for (const m of members) {
      const rid = topHoistedRoleId(m);
      if (rid && map.has(rid)) {
        if (isOnline(m)) map.get(rid)!.online.push(m);
        else map.get(rid)!.offline.push(m);
      }
    }
    // Drop empty sections
    return [...map.values()].filter((s) => s.online.length + s.offline.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, hoistedRoles, online]);

  // Members with no hoisted role
  const hoistedMemberIds = useMemo(
    () => new Set(members.filter((m) => topHoistedRoleId(m) !== null).map((m) => m.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, hoistedRoles],
  );

  const unhoistedOnline = members.filter((m) => !hoistedMemberIds.has(m.id) && isOnline(m));
  const unhoistedOffline = members.filter((m) => !hoistedMemberIds.has(m.id) && !isOnline(m));

  const handleContextMenu = useCallback((e: React.MouseEvent, m: Member) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, targetMember: m });
  }, []);

  // Long-press for mobile (500 ms)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressCoords = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent, m: Member) => {
    const touch = e.touches[0];
    longPressCoords.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      if (longPressCoords.current) {
        setContextMenu({ ...longPressCoords.current, targetMember: m });
      }
    }, 500);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressCoords.current = null;
  }, []);

  function rowProps(m: Member) {
    return {
      m,
      isSelf: m.id === me.id,
      online: isOnline(m),
      onDm: m.id !== me.id && onOpenDm ? () => onOpenDm!(m.id) : undefined,
      onClickUser: onClickUser ? () => onClickUser!(m.id) : undefined,
      onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, m),
      onTouchStart: (e: React.TouchEvent) => handleTouchStart(e, m),
      onTouchEnd: cancelLongPress,
      onTouchMove: cancelLongPress,
    };
  }

  return (
    <aside className={`h-full flex flex-col bg-ink-900/50 border-l border-white/5 ${className}`}>
      <div className="h-12 px-4 flex items-center border-b border-white/5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">
          People · {members.length}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-3">

        {/* Hoisted role sections — online first, then offline within each */}
        {hoistedSections.map(({ role, online: onl, offline: offl }) => (
          <Group
            key={role.id}
            title={role.name}
            count={onl.length + offl.length}
            color={role.color ?? undefined}
          >
            {onl.map((m) => <Row key={m.id} {...rowProps(m)} />)}
            {offl.map((m) => <Row key={m.id} {...rowProps(m)} dim />)}
          </Group>
        ))}

        {/* Unhoisted online */}
        {unhoistedOnline.length > 0 && (
          <Group title="Online" count={unhoistedOnline.length}>
            {unhoistedOnline.map((m) => <Row key={m.id} {...rowProps(m)} />)}
          </Group>
        )}

        {/* Unhoisted offline */}
        {unhoistedOffline.length > 0 && (
          <Group title="Offline" count={unhoistedOffline.length}>
            {unhoistedOffline.map((m) => <Row key={m.id} {...rowProps(m)} dim />)}
          </Group>
        )}

      </div>

      {/* Context menu — rendered inside the aside so it inherits stacking context */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          allRoles={effectiveAllRoles}
          canManageRoles={canManageRoles}
          onAssignRole={onAssignRole}
          onRemoveRole={onRemoveRole}
          onOpenDm={onOpenDm}
          onClose={() => setContextMenu(null)}
          me={me}
        />
      )}
    </aside>
  );
}

// ── Group ─────────────────────────────────────────────────────────────────────

function Group({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-2 mb-1 flex items-center gap-1.5">
        {color && (
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
        )}
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-300 font-semibold truncate">
          {title} — {count}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({
  m,
  isSelf,
  online,
  dim,
  onDm,
  onClickUser,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
}: {
  m: Member;
  isSelf: boolean;
  online: boolean;
  dim?: boolean;
  onDm?: () => void;
  onClickUser?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: () => void;
  onTouchMove?: () => void;
}) {
  const c = userColor(m.id, isSelf);

  // Highest-position role with a color drives the name color
  const topColorRole = (m.roles ?? [])
    .filter((r) => r.color)
    .sort((a, b) => b.position - a.position)[0] ?? null;
  const nameColor = topColorRole?.color ?? c.text;

  const status = online ? 'online' as const : 'offline' as const;

  return (
    <div
      onClick={onClickUser}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      className={`flex items-center gap-2.5 px-2 py-2 sm:py-1.5 rounded-md transition-colors hover:bg-white/[0.04] group ${
        dim ? 'opacity-50' : ''
      } ${onClickUser ? 'cursor-pointer' : ''}`}
    >
      <Avatar name={m.displayName} id={m.id} size="sm" isSelf={isSelf} status={status} imageUrl={m.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-medium truncate" style={{ color: nameColor }}>
            {m.displayName}
          </span>
          {isSelf && (
            <span className="pill text-[9px]" style={{ background: c.soft, color: c.text }}>
              you
            </span>
          )}
          {m.isStaff && (
            <span
              className="pill text-[9px] font-semibold"
              style={{ background: 'rgba(20,184,166,0.18)', color: '#2dd4bf', border: '1px solid rgba(20,184,166,0.25)' }}
            >
              Staff
            </span>
          )}
        </div>
        <div className="text-[10px] text-ink-300 truncate">
          {m.role === 'owner' ? 'owner' : `@${m.username}`}
        </div>
      </div>
      {onDm && (
        <button
          onClick={(e) => { e.stopPropagation(); onDm(); }}
          title="Send message"
          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 grid place-items-center rounded-md hover:bg-white/[0.06] text-ink-400 hover:text-ink-200"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
    </div>
  );
}
