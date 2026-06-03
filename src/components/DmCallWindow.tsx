import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import type { DmCallState } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '';
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────
type Props = {
  call: DmCallState;
  myName: string;
  myAvatarUrl: string | null;
  myId: string;
  onMute: () => void;
  onToggleVideo: () => void;
  onHangUp: () => void;
};

// ── DmCallWindow ──────────────────────────────────────────────────────────────
export function DmCallWindow({ call, myName, myAvatarUrl, myId, onMute, onToggleVideo, onHangUp }: Props) {
  const [elapsed, setElapsed] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const peerVideoRef  = useRef<HTMLVideoElement>(null);
  const selfVideoRef  = useRef<HTMLVideoElement>(null);
  const audioRef      = useRef<HTMLAudioElement>(null);
  const dragRef       = useRef<{ ox: number; oy: number; startX: number; startY: number } | null>(null);
  const windowRef     = useRef<HTMLDivElement>(null);

  // Elapsed timer
  useEffect(() => {
    if (call.status !== 'active' || !call.startedAt) return;
    const tick = () => setElapsed(formatDuration(call.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.status, call.startedAt]);

  // Wire peer video
  useEffect(() => {
    if (!peerVideoRef.current) return;
    const hasPeerVideo = !!(call.peerStream && call.peerStream.getVideoTracks().some(t => t.enabled && !t.muted));
    peerVideoRef.current.srcObject = hasPeerVideo ? call.peerStream : null;
  }, [call.peerStream]);

  // Wire self video
  useEffect(() => {
    if (!selfVideoRef.current) return;
    selfVideoRef.current.srcObject =
      call.localStream && !call.isVideoOff ? call.localStream : null;
  }, [call.localStream, call.isVideoOff]);

  // Wire audio (peer's audio always plays regardless of video state)
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = call.peerStream ?? null;
  }, [call.peerStream]);

  // Drag handlers
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = {
      ox: pos?.x ?? (window.innerWidth - 320),
      oy: pos?.y ?? (window.innerHeight - 420),
      startX: e.clientX,
      startY: e.clientY,
    };
    e.preventDefault();
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const nx = dragRef.current.ox + dx;
      const ny = dragRef.current.oy + dy;
      const w = windowRef.current?.offsetWidth ?? 300;
      const h = windowRef.current?.offsetHeight ?? 400;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - w, nx)),
        y: Math.max(0, Math.min(window.innerHeight - h, ny)),
      });
    }
    function onMouseUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, []);

  const isRinging   = call.status === 'outgoing-ringing';
  const isConnecting = call.status === 'connecting';
  const isActive    = call.status === 'active';

  // Determine if peer is actually sending video (stream has an enabled, live video track)
  const peerHasVideo = !!(call.peerStream && call.peerStream.getVideoTracks().some(t => t.readyState === 'live'));
  // Either party has video capability → show video layout
  const showVideoLayout = call.hasVideo || peerHasVideo;

  const defaultX = window.innerWidth - 324;
  const defaultY = window.innerHeight - (minimized ? 76 : showVideoLayout ? 450 : 340);

  const style: React.CSSProperties = {
    position: 'fixed',
    right: pos ? undefined : '16px',
    bottom: pos ? undefined : '16px',
    left: pos ? `${pos.x}px` : undefined,
    top:  pos ? `${pos.y}px` : undefined,
    zIndex: 180,
    width: minimized ? undefined : '300px',
    userSelect: 'none',
  };

  const statusText = isRinging
    ? `Calling ${call.peerName}…`
    : isConnecting
    ? 'Connecting…'
    : isActive
    ? (elapsed ? elapsed : call.peerName)
    : '';

  const content = (
    <div
      ref={windowRef}
      style={style}
      className={`bg-[#0F0C14] border border-white/[0.1] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden select-none ${minimized ? 'w-max' : ''}`}
    >
      {/* ── Hidden audio element — always plays peer audio ─────────────────── */}
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      {minimized ? (
        /* ── Minimized pill ──────────────────────────────────────────────── */
        <div
          className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing"
          onMouseDown={onMouseDown}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
          <span className="text-[12px] font-medium text-ink-100 whitespace-nowrap">
            {isRinging ? `Calling ${call.peerName}…` : isConnecting ? 'Connecting…' : `${call.peerName} · ${elapsed}`}
          </span>
          <button
            onClick={() => setMinimized(false)}
            className="ml-1 h-6 w-6 grid place-items-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition-colors shrink-0"
            title="Expand"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
          <button
            onClick={onHangUp}
            className="h-6 w-6 grid place-items-center rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors shrink-0"
            title="Hang up"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 12 19.79 19.79 0 0 1 1.18 3.36 2 2 0 0 1 3.16 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.14 8.91"/>
              <line x1="23" y1="1" x2="1" y2="23"/>
            </svg>
          </button>
        </div>
      ) : (
        /* ── Expanded window ──────────────────────────────────────────────── */
        <>
          {/* Header — drag zone */}
          <div
            className="flex items-center justify-between px-3 pt-3 pb-2 cursor-grab active:cursor-grabbing"
            onMouseDown={onMouseDown}
          >
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
              <span className="text-[11px] font-semibold text-ink-300 tracking-wide uppercase">
                {isRinging ? 'Calling' : isConnecting ? 'Connecting' : showVideoLayout ? 'Video call' : 'Voice call'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimized(true)}
                className="h-6 w-6 grid place-items-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition-colors"
                title="Minimise"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Video / Avatar area ──────────────────────────────────────────── */}
          <div className="relative mx-3 rounded-xl overflow-hidden bg-ink-950" style={{ aspectRatio: showVideoLayout ? '16/10' : 'auto', minHeight: showVideoLayout ? undefined : '108px' }}>

            {/* Peer view — video or avatar */}
            {peerHasVideo ? (
              <video
                ref={peerVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 py-5">
                <div className="relative">
                  {(isRinging || isConnecting) && (
                    <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-accent-violet scale-150" />
                  )}
                  <Avatar name={call.peerName} id={call.peerUserId} size="lg" imageUrl={call.peerAvatarUrl} />
                </div>
                <span className="text-[12px] font-medium text-ink-200">{call.peerName}</span>
              </div>
            )}

            {/* Self PiP — shown when local video is enabled */}
            {call.localStream && !call.isVideoOff && (
              <div className="absolute bottom-2 right-2 w-20 h-14 rounded-lg overflow-hidden border border-white/[0.15] bg-ink-900 shadow-lg">
                <video ref={selfVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              </div>
            )}

            {/* Self avatar PiP when no video — show as small badge */}
            {(!call.localStream || call.isVideoOff) && (
              <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full overflow-hidden border-2 border-ink-800 shadow">
                <Avatar name={myName} id={myId} size="sm" imageUrl={myAvatarUrl} />
              </div>
            )}
          </div>

          {/* ── Status + name ────────────────────────────────────────────────── */}
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink-100 truncate">{call.peerName}</p>
              <p className="text-[10px] text-ink-400 mt-0.5">
                {isRinging && 'Ringing…'}
                {isConnecting && 'Connecting…'}
                {isActive && (elapsed || 'Connected')}
              </p>
            </div>
            {call.isMuted && (
              <span className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full shrink-0">Muted</span>
            )}
          </div>

          {/* ── Controls ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-center gap-2 px-3 pb-3 pt-1">
            {/* Mute */}
            <button
              onClick={onMute}
              title={call.isMuted ? 'Unmute' : 'Mute'}
              className={`h-10 w-10 grid place-items-center rounded-xl border transition-all ${
                call.isMuted
                  ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                  : 'bg-white/[0.04] border-white/[0.08] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
              }`}
            >
              {call.isMuted ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3m-4 0h8"/></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )}
            </button>

            {/* Camera toggle — always show so users can turn camera on mid-call */}
            <button
              onClick={onToggleVideo}
              title={call.isVideoOff ? 'Turn camera on' : 'Turn camera off'}
              className={`h-10 w-10 grid place-items-center rounded-xl border transition-all ${
                call.isVideoOff
                  ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                  : call.localStream && !call.isVideoOff
                  ? 'bg-accent-violet/20 border-accent-violet/30 text-accent-violet'
                  : 'bg-white/[0.04] border-white/[0.08] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
              }`}
            >
              {call.isVideoOff ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
              )}
            </button>

            {/* Hang up */}
            <button
              onClick={onHangUp}
              title="Hang up"
              className="h-10 flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 transition-colors font-medium text-[12px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 12 19.79 19.79 0 0 1 1.18 3.36 2 2 0 0 1 3.16 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.14 8.91"/>
                <line x1="23" y1="1" x2="1" y2="23"/>
              </svg>
              End call
            </button>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
