import { useEffect } from 'react';
import { Avatar } from './Avatar';
import type { Member, User } from '../types';

type Props = {
  member: Member;
  me: User;
  online: boolean;
  onClose: () => void;
  onDm?: () => void;
};

function PlatformOwnerBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide"
      style={{
        background: 'linear-gradient(90deg, rgba(251,191,36,0.15), rgba(245,158,11,0.08))',
        border: '1px solid rgba(251,191,36,0.28)',
        color: '#fbbf24',
      }}
    >
      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      Platform Owner
    </span>
  );
}

function StaffBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide"
      style={{
        background: 'rgba(20,184,166,0.12)',
        border: '1px solid rgba(20,184,166,0.25)',
        color: '#2dd4bf',
      }}
    >
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      Staff
    </span>
  );
}

function FounderBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide"
      style={{
        background: 'linear-gradient(90deg, rgba(139,92,246,0.15), rgba(34,211,238,0.08))',
        border: '1px solid rgba(139,92,246,0.28)',
        color: '#a78bfa',
      }}
    >
      <span style={{ fontSize: '8px' }}>✦</span>
      Founding Supporter
    </span>
  );
}

export function UserProfileCard({ member, me, online, onClose, onDm }: Props) {
  const isSelf = member.id === me.id;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const topColorRole = (member.roles ?? [])
    .filter((r) => r.color)
    .sort((a, b) => b.position - a.position)[0] ?? null;

  const accentColor = topColorRole?.color ?? '#4F75FF';
  const hasBadges = member.isPlatformOwner || member.isStaff || member.isSupporter;
  const assignedRoles = (member.roles ?? []);

  const joinedDate = new Date(member.joinedAt).toLocaleDateString([], {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-72 rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: '#0F0C14',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: `0 40px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04), 0 0 60px ${accentColor}18`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle glow at top driven by role color */}
        <div
          className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${accentColor}22 0%, transparent 70%)`,
          }}
        />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 h-7 w-7 grid place-items-center rounded-lg text-ink-500 hover:text-ink-200 hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="relative px-5 pt-7 pb-5 flex flex-col items-center text-center">

          {/* Avatar — centered, large */}
          <div className="relative">
            <Avatar
              name={member.displayName}
              id={member.id}
              size="lg"
              isSelf={isSelf}
              imageUrl={member.avatarUrl}
              status={online ? 'online' : 'offline'}
            />
            {/* Soft ring matching accent */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{ boxShadow: `0 0 0 2px ${accentColor}44` }}
            />
          </div>

          {/* Name */}
          <div
            className="mt-3 text-[16px] font-semibold leading-tight"
            style={{ color: topColorRole?.color ?? '#F2F2F6' }}
          >
            {member.displayName}
          </div>
          <div className="text-[12px] text-ink-400 mt-0.5">@{member.username}</div>

          {/* Online pill */}
          <div
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
            style={{
              background: online ? 'rgba(52,211,153,0.1)' : 'rgba(100,90,120,0.15)',
              border: `1px solid ${online ? 'rgba(52,211,153,0.25)' : 'rgba(100,90,120,0.25)'}`,
              color: online ? '#34d399' : '#6b6480',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: online ? '#34d399' : '#6b6480' }}
            />
            {online ? 'Online' : 'Offline'}
          </div>

          {/* Platform badges */}
          {hasBadges && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-3">
              {member.isPlatformOwner && <PlatformOwnerBadge />}
              {member.isStaff && !member.isPlatformOwner && <StaffBadge />}
              {member.isSupporter && <FounderBadge />}
            </div>
          )}

          {/* Roles */}
          {(member.role === 'owner' || assignedRoles.length > 0) && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-3">
              {member.role === 'owner' && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
                  style={{
                    background: 'rgba(251,113,133,0.12)',
                    border: '1px solid rgba(251,113,133,0.25)',
                    color: '#fb7185',
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  Owner
                </span>
              )}
              {assignedRoles.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
                  style={{
                    background: r.color ? `${r.color}18` : 'rgba(110,96,128,0.15)',
                    border: `1px solid ${r.color ? `${r.color}35` : 'rgba(110,96,128,0.25)'}`,
                    color: r.color ?? '#9E8FB8',
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: r.color ?? '#6E6080' }} />
                  {r.name}
                </span>
              ))}
            </div>
          )}

          {/* Info row — joined date */}
          <div
            className="mt-4 w-full rounded-xl px-4 py-3 flex items-center justify-between text-left"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div>
              <div className="text-[10px] text-ink-500 mb-0.5">Joined</div>
              <div className="text-[12px] text-ink-200 font-medium">{joinedDate}</div>
              {member.createdAt && (
                <div className="text-[11px] text-ink-400">
                  Account created {new Date(member.createdAt).toLocaleDateString()}
                </div>
              )}
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-600">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>

          {/* Message button */}
          {!isSelf && onDm && (
            <button
              onClick={() => { onDm(); onClose(); }}
              className="mt-3 w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all"
              style={{
                background: `linear-gradient(135deg, ${accentColor}28, ${accentColor}14)`,
                border: `1px solid ${accentColor}40`,
                color: accentColor,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(135deg, ${accentColor}38, ${accentColor}22)`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(135deg, ${accentColor}28, ${accentColor}14)`;
              }}
            >
              Message
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
