import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import type { DmCallState, DmCallFocus } from '../types';

// getDisplayMedia is desktop-only — not available in Android WebView or iOS Safari.
const canScreenShare =
  typeof navigator !== 'undefined' &&
  typeof (navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown })?.getDisplayMedia === 'function';

function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '';
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// srcObject must be re-applied whenever the element remounts (layout switches between
// dock / fullscreen / pill). A useEffect keyed on the stream misses remounts because
// the dep didn't change — a callback ref runs on every attach.
function attachStream(stream: MediaStream | null) {
  return (el: HTMLVideoElement | null) => {
    if (el && el.srcObject !== stream) el.srcObject = stream;
  };
}

/** RMS-style speaking detection on the peer's audio. */
function usePeerSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) { setSpeaking(false); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    let ctx: AudioContext;
    try { ctx = new Ctx(); } catch { return; }
    let src: MediaStreamAudioSourceNode;
    try { src = ctx.createMediaStreamSource(stream); } catch { ctx.close().catch(() => {}); return; }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let silentFrames = 0;
    const id = setInterval(() => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      if (avg > 12) { silentFrames = 0; setSpeaking(true); }
      else if (++silentFrames > 4) setSpeaking(false);
    }, 150);
    return () => {
      clearInterval(id);
      try { src.disconnect(); } catch { /* already gone */ }
      ctx.close().catch(() => {});
    };
  }, [stream]);
  return speaking;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconMicOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3m-4 0h8"/>
  </svg>
);
const IconMicOn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const IconCamOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const IconCamOn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/>
    <rect x="3" y="6" width="12" height="12" rx="2"/>
  </svg>
);
const IconCamSmall = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14"/>
    <rect x="3" y="6" width="12" height="12" rx="2"/>
  </svg>
);
const IconScreen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8m-4-4v4"/>
  </svg>
);
const IconScreenSmall = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8m-4-4v4"/>
  </svg>
);
const IconStopScreen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8m-4-4v4"/>
    <line x1="2" y1="3" x2="22" y2="17"/>
  </svg>
);
const IconPhone = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 12 19.79 19.79 0 0 1 1.18 3.36 2 2 0 0 1 3.16 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.14 8.91"/>
    <line x1="23" y1="1" x2="1" y2="23"/>
  </svg>
);
const IconVolume = ({ muted }: { muted: boolean }) => muted ? (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
) : (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
);
const IconFullscreen = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
  </svg>
);
const IconExitFullscreen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
  </svg>
);
const IconExpand = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);

// ── Shared props ──────────────────────────────────────────────────────────────
type BaseProps = {
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

function derive(call: DmCallState) {
  const isRinging    = call.status === 'outgoing-ringing';
  const isConnecting = call.status === 'connecting';
  const isActive     = call.status === 'active';
  const peerHasCam    = !!(call.peerStream?.getVideoTracks().some(t => t.readyState === 'live'));
  const selfHasCam    = !!(call.localStream && !call.isVideoOff && call.localStream.getVideoTracks().length > 0);
  const peerScreening = !!call.peerScreenStream;
  const selfScreening = call.isScreenSharing;
  const statusTitle = isRinging ? 'Calling' : isConnecting ? 'Connecting'
    : selfScreening ? 'Sharing screen' : peerScreening ? 'Screen share'
    : (peerHasCam || call.hasVideo) ? 'Video call' : 'Voice call';
  return { isRinging, isConnecting, isActive, peerHasCam, selfHasCam, peerScreening, selfScreening, statusTitle };
}

/** Tiles that can be focused in fullscreen, in display-priority order. */
function availableFocusTargets(d: ReturnType<typeof derive>): Exclude<DmCallFocus, 'auto'>[] {
  const out: Exclude<DmCallFocus, 'auto'>[] = [];
  if (d.peerScreening) out.push('peer-screen');
  if (d.selfScreening) out.push('self-screen');
  out.push('peer-cam', 'self-cam');
  return out;
}

function resolveFocus(focus: DmCallFocus, d: ReturnType<typeof derive>): Exclude<DmCallFocus, 'auto'> {
  const avail = availableFocusTargets(d);
  if (focus !== 'auto' && avail.includes(focus)) return focus;
  return avail[0];
}

// ── Tile primitives ───────────────────────────────────────────────────────────
// NOTE: every <video> in this file is muted — peer audio plays exclusively through
// the dedicated hidden <audio> element in DmCallOverlay. An unmuted peer video
// (a) doubles the audio (echo, and the volume slider only controls one copy) and
// (b) is blocked from autoplaying by iOS Safari, leaving the tile permanently black.
function ScreenTile({ stream, label, self, onFullscreen }: {
  stream: MediaStream | null;
  label: string;
  self: boolean;
  onFullscreen?: () => void;
}) {
  void self;
  return (
    <div className="relative rounded-xl overflow-hidden bg-black group" style={{ aspectRatio: '16/9' }}>
      <video ref={attachStream(stream)} autoPlay playsInline muted className="w-full h-full object-contain bg-black" />
      <span className="absolute bottom-1.5 left-2 text-[10px] text-white/70 bg-black/50 rounded px-1.5 py-0.5 flex items-center gap-1">
        <IconScreenSmall />
        {label}
      </span>
      {onFullscreen && (
        <button
          onClick={onFullscreen}
          className="absolute top-1.5 right-1.5 h-8 w-8 grid place-items-center rounded-lg bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
          title="Fullscreen"
        >
          <IconFullscreen />
        </button>
      )}
    </div>
  );
}

function CamTile({ stream, live, name, userId, avatarUrl, self, speaking, onFullscreen }: {
  stream: MediaStream | null;
  live: boolean;
  name: string;
  userId: string;
  avatarUrl: string | null;
  self: boolean;
  speaking?: boolean;
  onFullscreen?: () => void;
}) {
  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-ink-950 group transition-shadow ${speaking ? 'ring-2 ring-emerald-400/70' : ''}`}
      style={{ aspectRatio: '16/10' }}
    >
      {live ? (
        <video
          ref={attachStream(stream)}
          autoPlay playsInline muted
          className={`absolute inset-0 w-full h-full object-cover ${self ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar name={name} id={userId} size="md" imageUrl={avatarUrl} />
        </div>
      )}
      <span className="absolute bottom-1.5 left-2 text-[10px] text-white/70 bg-black/50 rounded px-1.5 py-0.5">{self ? 'You' : name}</span>
      {onFullscreen && (
        <button
          onClick={onFullscreen}
          className="absolute top-1.5 right-1.5 h-8 w-8 grid place-items-center rounded-lg bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
          title="Fullscreen"
        >
          <IconFullscreen />
        </button>
      )}
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────
function CallControls({ call, d, big, onMute, onToggleVideo, onScreenShare, onStopScreenShare, onHangUp }: BaseProps & {
  d: ReturnType<typeof derive>;
  big: boolean;
}) {
  const btn = big ? 'h-11 w-11' : 'h-10 w-10';
  return (
    <>
      <button
        onClick={onMute} title={call.isMuted ? 'Unmute' : 'Mute'}
        className={`${btn} grid place-items-center rounded-xl border transition-all shrink-0 ${
          call.isMuted
            ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
            : 'bg-white/[0.04] border-white/[0.08] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
        }`}
      >
        {call.isMuted ? <IconMicOff /> : <IconMicOn />}
      </button>
      <button
        onClick={onToggleVideo} title={d.selfHasCam ? 'Turn camera off' : 'Turn camera on'}
        className={`${btn} grid place-items-center rounded-xl border transition-all shrink-0 ${
          d.selfHasCam
            ? 'bg-accent-violet/20 border-accent-violet/30 text-accent-violet'
            : 'bg-white/[0.04] border-white/[0.08] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
        }`}
      >
        {d.selfHasCam ? <IconCamOn /> : <IconCamOff />}
      </button>
      {d.isActive && canScreenShare && (
        <button
          onClick={d.selfScreening ? onStopScreenShare : onScreenShare}
          title={d.selfScreening ? 'Stop sharing screen' : 'Share screen'}
          className={`${btn} grid place-items-center rounded-xl border transition-all shrink-0 ${
            d.selfScreening
              ? 'bg-accent-violet/20 border-accent-violet/30 text-accent-violet'
              : 'bg-white/[0.04] border-white/[0.08] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
          }`}
        >
          {d.selfScreening ? <IconStopScreen /> : <IconScreen />}
        </button>
      )}
      <button
        onClick={onHangUp} title="End call"
        className={`${big ? 'h-11 px-6' : 'h-10 flex-1'} flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 transition-colors font-medium text-[12px]`}
      >
        <IconPhone />
        End
      </button>
    </>
  );
}

function VolumeSlider({ call, onSetPeerVolume, className }: Pick<BaseProps, 'call' | 'onSetPeerVolume'> & { className?: string }) {
  return (
    <div className={`flex items-center gap-2 bg-ink-800/60 border border-white/[0.06] rounded-xl px-3 py-2 ${className ?? ''}`}>
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
  );
}

// ── DmCallDock — docked right-side panel inside the DM view (desktop) ─────────
export function DmCallDock(props: BaseProps & { onFullscreen: (focus: DmCallFocus) => void }) {
  const { call, myName, myAvatarUrl, myId, onFullscreen, onSetPeerVolume, onHangUp } = props;
  const d = derive(call);
  const peerSpeaking = usePeerSpeaking(d.isActive ? call.peerStream : null);
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (call.status !== 'active' || !call.startedAt) return;
    const tick = () => setElapsed(formatDuration(call.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.status, call.startedAt]);

  return (
    <div className="hidden md:flex flex-col w-[300px] shrink-0 border-l border-white/[0.06] bg-ink-950/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
          <span className="text-[11px] font-semibold text-ink-300 tracking-wide uppercase select-none truncate">{d.statusTitle}</span>
          {d.isActive && elapsed && <span className="text-[11px] text-ink-400 shrink-0">· {elapsed}</span>}
        </div>
        <button
          onClick={() => onFullscreen('auto')}
          className="h-7 w-7 grid place-items-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition-colors shrink-0"
          title="Fullscreen"
        >
          <IconFullscreen />
        </button>
      </div>

      {d.isRinging || d.isConnecting ? (
        /* Ringing / connecting */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-3">
          <div className="relative">
            <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-accent-violet scale-150" />
            <Avatar name={call.peerName} id={call.peerUserId} size="lg" imageUrl={call.peerAvatarUrl} />
          </div>
          <span className="text-[13px] font-medium text-ink-200">{call.peerName}</span>
          <span className="text-[12px] text-ink-400">{d.isRinging ? 'Calling…' : 'Connecting…'}</span>
          <button
            onClick={onHangUp}
            className="mt-2 h-10 px-6 flex items-center gap-2 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 transition-colors font-medium text-[12px]"
          >
            <IconPhone />
            {d.isRinging ? 'Cancel' : 'End'}
          </button>
        </div>
      ) : (
        /* Active call */
        <div className="flex-1 min-h-0 overflow-y-auto px-3 flex flex-col gap-2">
          {/* Screen share tiles */}
          {d.peerScreening && (
            <ScreenTile stream={call.peerScreenStream} label={`${call.peerName}'s screen`} self={false} onFullscreen={() => onFullscreen('peer-screen')} />
          )}
          {d.selfScreening && (
            <ScreenTile stream={call.localScreenStream} label="Your screen" self onFullscreen={() => onFullscreen('self-screen')} />
          )}

          {/* Camera tiles */}
          <CamTile
            stream={call.peerStream} live={d.peerHasCam}
            name={call.peerName} userId={call.peerUserId} avatarUrl={call.peerAvatarUrl}
            self={false} speaking={peerSpeaking}
            onFullscreen={() => onFullscreen('peer-cam')}
          />
          <CamTile
            stream={call.localStream} live={d.selfHasCam}
            name={myName} userId={myId} avatarUrl={myAvatarUrl}
            self
            onFullscreen={() => onFullscreen('self-cam')}
          />

          {/* Participants */}
          <div className="rounded-xl bg-ink-900/50 border border-white/[0.05] px-2.5 py-2 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-ink-400 tracking-wide uppercase">In call — 2</span>
            <div className="flex items-center gap-2">
              <div className={`rounded-full ${peerSpeaking ? 'ring-2 ring-emerald-400/80' : ''}`}>
                <Avatar name={call.peerName} id={call.peerUserId} size="xs" imageUrl={call.peerAvatarUrl} />
              </div>
              <span className="flex-1 text-[12px] text-ink-100 truncate">{call.peerName}</span>
              {d.peerScreening && <span className="text-accent-violet" title="Sharing screen"><IconScreenSmall /></span>}
              {d.peerHasCam && <span className="text-ink-300" title="Camera on"><IconCamSmall /></span>}
            </div>
            <div className="flex items-center gap-2">
              <Avatar name={myName} id={myId} size="xs" imageUrl={myAvatarUrl} />
              <span className="flex-1 text-[12px] text-ink-100 truncate">{myName} <span className="text-ink-500">(you)</span></span>
              {call.isMuted && <span className="text-[9px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded-full">muted</span>}
              {d.selfScreening && <span className="text-accent-violet" title="Sharing screen"><IconScreenSmall /></span>}
              {d.selfHasCam && <span className="text-ink-300" title="Camera on"><IconCamSmall /></span>}
            </div>
          </div>

          {/* Peer volume */}
          <VolumeSlider call={call} onSetPeerVolume={onSetPeerVolume} />
        </div>
      )}

      {/* Controls */}
      {!d.isRinging && !d.isConnecting && (
        <div className="flex items-center gap-1.5 px-3 py-3 shrink-0 border-t border-white/[0.05]">
          <CallControls {...props} d={d} big={false} />
        </div>
      )}
    </div>
  );
}

// ── DmCallOverlay — fullscreen stage or floating pill (portal) ────────────────
export function DmCallOverlay(props: BaseProps & {
  fullscreen: boolean;
  focus: DmCallFocus;
  /** True while the user is viewing the DM this call belongs to — the docked panel
   *  (desktop) or the DmView call bar (mobile) is the call surface there, so the
   *  floating pill is suppressed entirely. */
  viewingCallDm: boolean;
  onSetFullscreen: (v: boolean) => void;
  onSetFocus: (f: DmCallFocus) => void;
}) {
  const {
    call, myName, myAvatarUrl, myId,
    fullscreen, focus, viewingCallDm, onSetFullscreen, onSetFocus,
    onSetPeerVolume, onHangUp,
  } = props;
  const d = derive(call);
  const peerSpeaking = usePeerSpeaking(fullscreen && d.isActive ? call.peerStream : null);
  const [elapsed, setElapsed] = useState('');
  const [showVolume, setShowVolume] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const dragRef   = useRef<{ ox: number; oy: number; startX: number; startY: number } | null>(null);
  const pillRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (call.status !== 'active' || !call.startedAt) return;
    const tick = () => setElapsed(formatDuration(call.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.status, call.startedAt]);

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = call.peerVolume ?? 1;
  }, [call.peerVolume]);

  // Escape exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSetFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, onSetFullscreen]);

  // ── Pill drag (mouse + touch) ──────────────────────────────────────────────
  function startDrag(clientX: number, clientY: number) {
    // Read the actual on-screen position — the resting spot differs between
    // mobile (top-right) and desktop (bottom-right), so don't assume either.
    const rect = pillRef.current?.getBoundingClientRect();
    dragRef.current = {
      ox: rect?.left ?? 16,
      oy: rect?.top ?? 16,
      startX: clientX,
      startY: clientY,
    };
  }
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button,input')) return;
    startDrag(e.clientX, e.clientY);
    e.preventDefault();
  }
  function onTouchStart(e: React.TouchEvent) {
    if ((e.target as HTMLElement).closest('button,input')) return;
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
    // Don't preventDefault here — would block tap events on child elements
  }
  useEffect(() => {
    const applyDrag = (clientX: number, clientY: number) => {
      if (!dragRef.current) return;
      const w = pillRef.current?.offsetWidth ?? 260;
      const h = pillRef.current?.offsetHeight ?? 44;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - w,  dragRef.current.ox + clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - h, dragRef.current.oy + clientY - dragRef.current.startY)),
      });
    };
    const onMove  = (e: MouseEvent)  => applyDrag(e.clientX, e.clientY);
    const onUp    = ()               => { dragRef.current = null; };
    const onTouch = (e: TouchEvent)  => { const t = e.touches[0]; if (t) applyDrag(t.clientX, t.clientY); };
    const onTouchEnd = ()            => { dragRef.current = null; };
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('mouseup',    onUp);
    window.addEventListener('touchmove',  onTouch,   { passive: true });
    window.addEventListener('touchend',   onTouchEnd);
    return () => {
      window.removeEventListener('mousemove',  onMove);
      window.removeEventListener('mouseup',    onUp);
      window.removeEventListener('touchmove',  onTouch);
      window.removeEventListener('touchend',   onTouchEnd);
    };
  }, []);

  const statusLine = d.isRinging ? `Calling ${call.peerName}…`
    : d.isConnecting ? 'Connecting…'
    : (elapsed || 'Connected');

  // ── Fullscreen stage ───────────────────────────────────────────────────────
  const focused = resolveFocus(focus, d);
  const thumbs = availableFocusTargets(d).filter((t) => t !== focused);

  const renderFocused = () => {
    switch (focused) {
      case 'peer-screen':
        return <video ref={attachStream(call.peerScreenStream)} autoPlay playsInline muted className="w-full h-full object-contain bg-black" />;
      case 'self-screen':
        return (
          <div className="relative w-full h-full">
            <video ref={attachStream(call.localScreenStream)} autoPlay playsInline muted className="w-full h-full object-contain bg-black" />
            <span className="absolute top-3 left-1/2 -translate-x-1/2 text-[11px] text-white/50 bg-black/40 rounded-full px-2.5 py-1">Your screen</span>
          </div>
        );
      case 'peer-cam':
        return d.peerHasCam ? (
          <video ref={attachStream(call.peerStream)} autoPlay playsInline muted className="w-full h-full object-contain bg-black" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className={`relative rounded-full ${peerSpeaking ? 'ring-4 ring-emerald-400/60' : ''}`}>
              {(d.isRinging || d.isConnecting) && (
                <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-accent-violet scale-150" />
              )}
              <Avatar name={call.peerName} id={call.peerUserId} size="lg" imageUrl={call.peerAvatarUrl} />
            </div>
            <span className="text-[15px] font-medium text-ink-100">{call.peerName}</span>
            <span className="text-[12px] text-ink-400">{statusLine}</span>
          </div>
        );
      case 'self-cam':
        return d.selfHasCam ? (
          <video ref={attachStream(call.localStream)} autoPlay playsInline muted className="w-full h-full object-contain bg-black scale-x-[-1]" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <Avatar name={myName} id={myId} size="lg" imageUrl={myAvatarUrl} />
            <span className="text-[15px] font-medium text-ink-100">{myName} <span className="text-ink-500">(you)</span></span>
          </div>
        );
    }
  };

  const renderThumb = (t: Exclude<DmCallFocus, 'auto'>) => {
    const common = 'relative w-32 h-20 md:w-44 md:h-28 rounded-lg overflow-hidden bg-ink-900 border border-white/[0.12] shadow-lg cursor-pointer hover:border-accent-violet/50 transition-colors shrink-0';
    switch (t) {
      case 'peer-screen':
        return (
          <div key={t} className={common} onClick={() => onSetFocus(t)} title={`${call.peerName}'s screen`}>
            <video ref={attachStream(call.peerScreenStream)} autoPlay playsInline muted className="w-full h-full object-cover" />
            <span className="absolute bottom-1 left-1.5 text-[9px] text-white/70 bg-black/50 rounded px-1 flex items-center gap-0.5"><IconScreenSmall />{call.peerName}</span>
          </div>
        );
      case 'self-screen':
        return (
          <div key={t} className={common} onClick={() => onSetFocus(t)} title="Your screen">
            <video ref={attachStream(call.localScreenStream)} autoPlay playsInline muted className="w-full h-full object-cover" />
            <span className="absolute bottom-1 left-1.5 text-[9px] text-white/70 bg-black/50 rounded px-1 flex items-center gap-0.5"><IconScreenSmall />You</span>
          </div>
        );
      case 'peer-cam':
        return (
          <div key={t} className={`${common} ${peerSpeaking ? 'ring-2 ring-emerald-400/70' : ''}`} onClick={() => onSetFocus(t)} title={call.peerName}>
            {d.peerHasCam ? (
              <video ref={attachStream(call.peerStream)} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Avatar name={call.peerName} id={call.peerUserId} size="sm" imageUrl={call.peerAvatarUrl} />
              </div>
            )}
            <span className="absolute bottom-1 left-1.5 text-[9px] text-white/70 bg-black/50 rounded px-1">{call.peerName}</span>
          </div>
        );
      case 'self-cam':
        return (
          <div key={t} className={common} onClick={() => onSetFocus(t)} title="You">
            {d.selfHasCam ? (
              <video ref={attachStream(call.localStream)} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Avatar name={myName} id={myId} size="sm" imageUrl={myAvatarUrl} />
              </div>
            )}
            <span className="absolute bottom-1 left-1.5 text-[9px] text-white/70 bg-black/50 rounded px-1">You</span>
          </div>
        );
    }
  };

  const fullscreenView = (
    <div className="fixed inset-0 z-[180] bg-[#0F0C14] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${d.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
          <span className="text-[13px] font-semibold text-ink-100 truncate">{call.peerName}</span>
          <span className="text-[12px] text-ink-400 shrink-0">{statusLine}</span>
          {d.peerScreening && <span className="text-[10px] text-accent-violet bg-accent-violet/10 border border-accent-violet/20 px-1.5 py-0.5 rounded-full shrink-0">screen</span>}
          {call.isMuted && <span className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full shrink-0">Muted</span>}
        </div>
        <button
          onClick={() => onSetFullscreen(false)}
          className="h-8 w-8 grid place-items-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition-colors shrink-0"
          title="Exit fullscreen (Esc)"
        >
          <IconExitFullscreen />
        </button>
      </div>

      {/* Stage */}
      <div className="flex-1 min-h-0 relative px-3 pb-2">
        <div className="w-full h-full rounded-xl overflow-hidden bg-black">
          {renderFocused()}
        </div>
        {/* Switchable thumbnails */}
        {d.isActive && thumbs.length > 0 && (
          <div className="absolute bottom-4 right-5 flex gap-2 max-w-[calc(100%-40px)] overflow-x-auto">
            {thumbs.map(renderThumb)}
          </div>
        )}
      </div>

      {/* Volume slider */}
      {showVolume && d.isActive && (
        <VolumeSlider call={call} onSetPeerVolume={onSetPeerVolume} className="mx-auto mb-2 w-full max-w-xs" />
      )}

      {/* Controls */}
      <div
        className="flex items-center justify-center gap-2 px-4 pt-1 shrink-0"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        {d.isActive && (
          <button
            onClick={() => setShowVolume(v => !v)}
            title="Peer volume"
            className={`h-11 w-11 grid place-items-center rounded-xl border transition-all shrink-0 ${
              showVolume
                ? 'bg-accent-violet/20 border-accent-violet/30 text-accent-violet'
                : 'bg-white/[0.04] border-white/[0.08] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100'
            }`}
          >
            <IconVolume muted={(call.peerVolume ?? 1) === 0} />
          </button>
        )}
        <CallControls {...props} d={d} big />
      </div>
    </div>
  );

  // ── Floating pill ──────────────────────────────────────────────────────────
  // Resting position: top-right on phones (bottom-right sits exactly on the
  // composer's send button — same collision as the old FeedbackButton mistake),
  // bottom-right on desktop. Dragging switches to explicit coordinates.
  const pillStyle: React.CSSProperties = {
    position: 'fixed',
    left: pos ? `${pos.x}px` : undefined,
    top:  pos ? `${pos.y}px` : undefined,
    zIndex: 180,
    userSelect: 'none',
  };

  const pillView = (
    <div
      ref={pillRef}
      style={pillStyle}
      className={`bg-[#0F0C14] border border-white/[0.1] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden select-none w-max ${
        pos ? '' : 'top-16 right-3 md:top-auto md:bottom-4 md:right-4'
      }`}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${d.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
        <span className="text-[12px] font-medium text-ink-100 whitespace-nowrap">
          {d.isRinging ? `Calling ${call.peerName}…` : d.isConnecting ? 'Connecting…' : `${call.peerName}${elapsed ? ` · ${elapsed}` : ''}`}
        </span>
        {(d.selfScreening || d.peerScreening) && (
          <span className="text-[10px] text-accent-violet bg-accent-violet/10 border border-accent-violet/20 px-1.5 py-0.5 rounded-full shrink-0">
            {d.selfScreening ? 'sharing' : 'screen'}
          </span>
        )}
        <button onClick={() => onSetFullscreen(true)} className="ml-1 h-7 w-7 grid place-items-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/[0.06] transition-colors shrink-0" title="Open call">
          <IconExpand />
        </button>
        <button onClick={onHangUp} className="h-7 w-7 grid place-items-center rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors shrink-0" title="Hang up">
          <IconPhone />
        </button>
      </div>
    </div>
  );

  return createPortal(
    <>
      {/* Hidden peer audio — always mounted while the call is alive, regardless of view */}
      <audio
        ref={(el) => {
          audioRef.current = el;
          if (el && el.srcObject !== call.peerStream) el.srcObject = call.peerStream;
        }}
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />
      {fullscreen ? fullscreenView : viewingCallDm ? null : pillView}
    </>,
    document.body,
  );
}
