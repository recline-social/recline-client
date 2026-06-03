import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import type { DmCallState } from '../types';

function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '';
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconMicOff = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3m-4 0h8"/>
  </svg>
);
const IconMicOn = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const IconCamOff = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const IconCamOn = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/>
    <rect x="3" y="6" width="12" height="12" rx="2"/>
  </svg>
);
const IconScreen = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8m-4-4v4"/>
  </svg>
);
const IconStopScreen = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8m-4-4v4"/>
    <line x1="2" y1="3" x2="22" y2="17"/>
  </svg>
);
const IconPhone = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 12 19.79 19.79 0 0 1 1.18 3.36 2 2 0 0 1 3.16 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.14 8.91"/>
    <line x1="23" y1="1" x2="1" y2="23"/>
  </svg>
);
const IconVolume = ({ muted }: { muted: boolean }) => muted ? (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
) : (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
);

// ── Props ─────────────────────────────────────────────────────────────────────
type Props = {
  call: DmCallState;
  myName: string;
  myAvatarUrl: string | null;
  myId: string;
  onMute: () => void;
  onToggleVideo: () => void;
  onScreenShare: () => void;
  onStopScreenShare: () => void;
  onSetPeerVolume: (vol: number) => void;
  onHangUp: () => void;
};

// ── DmCallWindow ──────────────────────────────────────────────────────────────
export function DmCallWindow({
  call, myName, myAvatarUrl, myId,
  onMute, onToggleVideo, onScreenShare, onStopScreenShare, onSetPeerVolume, onHangUp,
}: Props) {
  const [elapsed, setElapsed]   = useState('');
  const [minimized, setMinimized] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [pos, setPos]           = useState<{ x: number; y: number } | null>(null);

  // Video element refs
  const peerVideoRef      = useRef<HTMLVideoElement>(null);
  const selfVideoRef      = useRef<HTMLVideoElement>(null);
  const peerScreenRef     = useRef<HTMLVideoElement>(null);
  const selfScreenRef     = useRef<HTMLVideoElement>(null);
  const audioRef          = useRef<HTMLAudioElement>(null);

  // Drag
  const dragRef   = useRef<{ ox: number; oy: number; startX: number; startY: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (call.status !== 'active' || !call.startedAt) return;
    const tick = () => setElapsed(formatDuration(call.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.status, call.startedAt]);

  // ── Media wiring ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!peerVideoRef.current) return;
    const hasLiveCam = !!(call.peerStream?.getVideoTracks().some(t => t.readyState === 'live'));
    peerVideoRef.current.srcObject = hasLiveCam ? call.peerStream : null;
  }, [call.peerStream]);

  useEffect(() => {
    if (!selfVideoRef.current) return;
    selfVideoRef.current.srcObject = (call.localStream && !call.isVideoOff) ? call.localStream : null;
  }, [call.localStream, call.isVideoOff]);

  useEffect(() => {
    if (!peerScreenRef.current) return;
    peerScreenRef.current.srcObject = call.peerScreenStream ?? null;
  }, [call.peerScreenStream]);

  useEffect(() => {
    if (!selfScreenRef.current) return;
    selfScreenRef.current.srcObject = call.localScreenStream ?? null;
  }, [call.localScreenStream]);

  // Audio — peer's camera/mic stream
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = call.peerStream ?? null;
  }, [call.peerStream]);

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = call.peerVolume ?? 1;
  }, [call.peerVolume]);

  // ── Drag ───────────────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button,input')) return;
    dragRef.current = {
      ox: pos?.x ?? (window.innerWidth - 340),
      oy: pos?.y ?? (window.innerHeight - 460),
      startX: e.clientX,
      startY: e.clientY,
    };
    e.preventDefault();
  }
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const w = windowRef.current?.offsetWidth ?? 320;
      const h = windowRef.current?.offsetHeight ?? 460;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - w,  dragRef.current.ox + e.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - h, dragRef.current.oy + e.clientY - dragRef.current.startY)),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isRinging    = call.status === 'outgoing-ringing';
  const isConnecting = call.status === 'connecting';
  const isActive     = call.status === 'active';

  const peerHasCam    = !!(call.peerStream?.getVideoTracks().some(t => t.readyState === 'live'));
  const peerScreening = !!call.peerScreenStream;
  const selfScreening = call.isScreenSharing;
  // Show screen share as the main content when either party is sharing
  const anyScreenShare = peerScreening || selfScreening;
  // Show video panel when either party has camera OR screen share
  const showMedia = peerHasCam || anyScreenShare || (call.localStream && !call.isVideoOff);

  // Window width: wider when screen sharing for better aspect ratio
  const windowWidth = anyScreenShare ? 400 : 304;

  const style: React.CSSProperties = {
    position: 'fixed',
    right: pos ? undefined : '16px',
    bottom: pos ? undefined : '16px',
    left: pos ? `${pos.x}px` : undefined,
    top:  pos ? `${pos.y}px` : undefined,
    zIndex: 180,
    width: minimized ? undefined : `${windowWidth}px`,
    userSelect: 'none',
  };

  // ── Minimized pill ─────────────────────────────────────────────────────────
  const minimizedPill = (
    <div
      className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing"
      onMouseDown={onMouseDown}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
      <span className="text-[12px] font-medium text-ink-100 whitespace-nowrap">
        {isRinging ? `Calling ${call.peerName}…` : isConnecting ? 'Connecting…' : `${call.peerName}${elapsed ? ` · ${elapsed}` : ''}`}
      </span>
      {call.isScreenSharing && (
        <span className="text-[10px] text-accent-violet bg-accent-violet/10 border border-accent-violet/20 px-1.5 py-0.5 rounded-full shrink-0">sharing</span>
      )}
      <button onClick={() => setMinimized(false)} className="ml-1 h-6 w-6 grid place-items-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition-colors shrink-0" title="Expand">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
          <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
        </svg>
      </button>
      <button onClick={onHangUp} className="h-6 w-6 grid place-items-center rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors shrink-0" title="Hang up">
        <IconPhone />
      </button>
    </div>
  );

  // ── Expanded window ────────────────────────────────────────────────────────
  const expanded = (
    <>
      {/* Header — drag zone */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 cursor-grab active:cursor-grabbing" onMouseDown={onMouseDown}>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
          <span className="text-[11px] font-semibold text-ink-300 tracking-wide uppercase select-none">
            {isRinging ? 'Calling' : isConnecting ? 'Connecting' : selfScreening ? 'Sharing screen' : peerScreening ? 'Screen share' : (peerHasCam || call.hasVideo) ? 'Video call' : 'Voice call'}
          </span>
        </div>
        <button onClick={() => setMinimized(true)} className="h-6 w-6 grid place-items-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition-colors" title="Minimise">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      {/* ── Screen share main area ─────────────────────────────────────────── */}
      {anyScreenShare && (
        <div className="mx-3 rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
          {peerScreening ? (
            /* Peer is sharing their screen — show it large */
            <video ref={peerScreenRef} autoPlay playsInline className="w-full h-full object-contain bg-black" />
          ) : selfScreening ? (
            /* We're sharing — show our own screen as preview */
            <div className="relative w-full h-full">
              <video ref={selfScreenRef} autoPlay playsInline muted className="w-full h-full object-contain bg-black" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[11px] text-white/50 bg-black/40 rounded-full px-2 py-1">Your screen</span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Camera tiles row ──────────────────────────────────────────────── */}
      {showMedia && (
        <div className={`mx-3 ${anyScreenShare ? 'mt-2' : ''} relative rounded-xl overflow-hidden bg-ink-950`}
          style={{ aspectRatio: anyScreenShare ? (peerHasCam && !call.isVideoOff ? '2/1' : '1/1') : '16/10' }}
        >
          {anyScreenShare ? (
            /* When screen sharing: two small camera tiles side-by-side */
            <div className="absolute inset-0 flex gap-1 p-1">
              {/* Peer cam */}
              <div className="flex-1 rounded-lg overflow-hidden bg-ink-900 relative">
                {peerHasCam ? (
                  <video ref={peerVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Avatar name={call.peerName} id={call.peerUserId} size="sm" imageUrl={call.peerAvatarUrl} />
                  </div>
                )}
                <span className="absolute bottom-1 left-1.5 text-[9px] text-white/60 bg-black/40 rounded px-1">{call.peerName}</span>
              </div>
              {/* Self cam */}
              <div className="flex-1 rounded-lg overflow-hidden bg-ink-900 relative">
                {call.localStream && !call.isVideoOff ? (
                  <video ref={selfVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Avatar name={myName} id={myId} size="sm" imageUrl={myAvatarUrl} />
                  </div>
                )}
                <span className="absolute bottom-1 left-1.5 text-[9px] text-white/60 bg-black/40 rounded px-1">You</span>
              </div>
            </div>
          ) : (
            /* No screen share: peer camera large, self PiP */
            <>
              {peerHasCam ? (
                <video ref={peerVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
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
              {/* Self PiP */}
              {call.localStream && !call.isVideoOff ? (
                <div className="absolute bottom-2 right-2 w-20 h-14 rounded-lg overflow-hidden border border-white/[0.15] bg-ink-900 shadow-lg">
                  <video ref={selfVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                </div>
              ) : (
                <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full overflow-hidden border-2 border-ink-800 shadow">
                  <Avatar name={myName} id={myId} size="sm" imageUrl={myAvatarUrl} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Audio-only state: just show big avatar */}
      {!showMedia && (
        <div className="mx-3 rounded-xl bg-ink-950 flex flex-col items-center justify-center py-6 gap-2">
          <div className="relative">
            {(isRinging || isConnecting) && (
              <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-accent-violet scale-150" />
            )}
            <Avatar name={call.peerName} id={call.peerUserId} size="lg" imageUrl={call.peerAvatarUrl} />
          </div>
          <span className="text-[12px] font-medium text-ink-200">{call.peerName}</span>
        </div>
      )}

      {/* ── Status row ────────────────────────────────────────────────────── */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <div className="min-w-0 flex items-center gap-2">
          <p className="text-[12px] font-medium text-ink-200 truncate">
            {isRinging && `Calling ${call.peerName}…`}
            {isConnecting && 'Connecting…'}
            {isActive && (elapsed || 'Connected')}
          </p>
          {peerScreening && <span className="text-[10px] text-accent-violet bg-accent-violet/10 border border-accent-violet/20 px-1.5 py-0.5 rounded-full shrink-0">screen</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {call.isMuted && <span className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full">Muted</span>}
          {/* Volume toggle */}
          {isActive && (
            <button
              onClick={() => setShowVolume(v => !v)}
              title="Peer volume"
              className={`h-6 w-6 grid place-items-center rounded-lg transition-colors ${showVolume ? 'text-accent-violet bg-accent-violet/10' : 'text-ink-400 hover:text-ink-100 hover:bg-white/[0.06]'}`}
            >
              <IconVolume muted={(call.peerVolume ?? 1) === 0} />
            </button>
          )}
        </div>
      </div>

      {/* ── Volume slider ─────────────────────────────────────────────────── */}
      {showVolume && isActive && (
        <div className="mx-3 mb-1 flex items-center gap-2 bg-ink-800/40 border border-white/[0.06] rounded-xl px-3 py-2">
          <IconVolume muted={(call.peerVolume ?? 1) === 0} />
          <input
            type="range" min={0} max={1} step={0.05}
            value={call.peerVolume ?? 1}
            onChange={(e) => onSetPeerVolume(Number(e.target.value))}
            className="flex-1 h-1 accent-accent-violet cursor-pointer"
            title={`${Math.round((call.peerVolume ?? 1) * 100)}%`}
          />
          <span className="text-[10px] text-ink-400 w-8 text-right shrink-0">{Math.round((call.peerVolume ?? 1) * 100)}%</span>
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 pb-3 pt-1">
        {/* Mute mic */}
        <button
          onClick={onMute} title={call.isMuted ? 'Unmute' : 'Mute'}
          className={`h-9 w-9 grid place-items-center rounded-xl border transition-all shrink-0 ${
            call.isMuted
              ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
              : 'bg-white/[0.04] border-white/[0.08] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
          }`}
        >
          {call.isMuted ? <IconMicOff /> : <IconMicOn />}
        </button>

        {/* Camera toggle */}
        <button
          onClick={onToggleVideo} title={call.isVideoOff ? 'Turn camera on' : 'Turn camera off'}
          className={`h-9 w-9 grid place-items-center rounded-xl border transition-all shrink-0 ${
            call.isVideoOff
              ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
              : (call.localStream && !call.isVideoOff)
              ? 'bg-accent-violet/20 border-accent-violet/30 text-accent-violet'
              : 'bg-white/[0.04] border-white/[0.08] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
          }`}
        >
          {call.isVideoOff ? <IconCamOff /> : <IconCamOn />}
        </button>

        {/* Screen share */}
        {isActive && (
          <button
            onClick={selfScreening ? onStopScreenShare : onScreenShare}
            title={selfScreening ? 'Stop sharing screen' : 'Share screen'}
            className={`h-9 w-9 grid place-items-center rounded-xl border transition-all shrink-0 ${
              selfScreening
                ? 'bg-accent-violet/20 border-accent-violet/30 text-accent-violet'
                : 'bg-white/[0.04] border-white/[0.08] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
            }`}
          >
            {selfScreening ? <IconStopScreen /> : <IconScreen />}
          </button>
        )}

        {/* End call */}
        <button
          onClick={onHangUp} title="End call"
          className="h-9 flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 transition-colors font-medium text-[12px]"
        >
          <IconPhone />
          End
        </button>
      </div>
    </>
  );

  return createPortal(
    <div
      ref={windowRef}
      style={style}
      className={`bg-[#0F0C14] border border-white/[0.1] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden select-none ${minimized ? 'w-max' : ''}`}
    >
      {/* Hidden peer audio — always mounted while call is alive */}
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
      {minimized ? minimizedPill : expanded}
    </div>,
    document.body,
  );
}
