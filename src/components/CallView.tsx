import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { playCallSound } from '../lib/callSounds';
// Note: micOn state lives in App.tsx (lifted) so it persists across channel navigation.
import { Avatar } from './Avatar';
import { userColor } from '../lib/colors';
import type { Channel, Member, User } from '../types';
import { CallManager, type PeerSnapshot, type ScreenShareOptions, type StreamKind } from '../lib/webrtc';
import { ScreenShareDialog } from './ScreenShareDialog';

type Tile = {
  key: string;
  /** null for self-tiles — no volume control for your own audio */
  socketId: string | null;
  userId: string;
  name: string;
  stream: MediaStream | null;
  kind: StreamKind;
  isSelf: boolean;
  showVideoControlled: boolean;
  connectionState?: RTCPeerConnectionState;
};

// ── Speaking detection ──────────────────────────────────────────────────────
// Analyses audio levels from all streams in the call and returns a map of
// userId → isSpeaking. Updates at 100 ms intervals. Uses a 15-frame (~1.5 s)
// silence debounce so the indicator doesn't flicker on short pauses.

function useSpeakingDetection(
  localStream: MediaStream | null,
  localUserId: string,
  peers: PeerSnapshot[],
): Record<string, boolean> {
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const speakingRef = useRef<Record<string, boolean>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; buffer: Float32Array<ArrayBuffer>; silentFrames: number }>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(() => {
    const prev = speakingRef.current;
    const next: Record<string, boolean> = {};
    let changed = false;
    for (const [userId, entry] of analysersRef.current.entries()) {
      entry.analyser.getFloatTimeDomainData(entry.buffer);
      let sum = 0;
      for (let i = 0; i < entry.buffer.length; i++) sum += entry.buffer[i] * entry.buffer[i];
      const rms = Math.sqrt(sum / entry.buffer.length);
      const was = prev[userId] ?? false;
      if (rms > 0.015) {
        next[userId] = true;
        entry.silentFrames = 0;
      } else {
        entry.silentFrames++;
        next[userId] = was && entry.silentFrames < 15;
      }
      if (next[userId] !== was) changed = true;
    }
    if (changed) {
      speakingRef.current = next;
      setSpeaking({ ...next });
    }
  }, []);

  useEffect(() => {
    // Build list of (userId, stream) pairs to analyse — camera tracks only
    const targets: { userId: string; stream: MediaStream }[] = [];
    if (localStream && localStream.getAudioTracks().length > 0) {
      targets.push({ userId: localUserId, stream: localStream });
    }
    for (const peer of peers) {
      const cam = peer.streams.find((s) => s.kind === 'camera');
      if (cam && cam.stream.getAudioTracks().length > 0) {
        targets.push({ userId: peer.userId, stream: cam.stream });
      }
    }

    if (targets.length === 0) return;

    // Create AudioContext lazily (must follow a user gesture on some browsers)
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new AudioContext(); } catch { return; }
    }
    const ctx = audioCtxRef.current;

    const wanted = new Set(targets.map((t) => t.userId));

    // Remove analysers for users who left
    for (const id of [...analysersRef.current.keys()]) {
      if (!wanted.has(id)) analysersRef.current.delete(id);
    }

    // Add analysers for new users
    for (const { userId, stream } of targets) {
      if (!analysersRef.current.has(userId)) {
        try {
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.4;
          source.connect(analyser);
          analysersRef.current.set(userId, { analyser, buffer: new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>, silentFrames: 0 });
        } catch { /* AudioContext unavailable in some environments */ }
      }
    }

    // Start / restart polling interval
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(poll, 100);

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, localUserId, peers.map((p) => p.socketId + p.streams.length).join(','), poll]);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  return speaking;
}

// Screen share is not available on most mobile browsers (no getDisplayMedia).
const canScreenShare =
  typeof navigator !== 'undefined' &&
  typeof (navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown })?.getDisplayMedia === 'function';

type Props = {
  channel: Channel;
  manager: CallManager;
  me: User;
  members: Record<string, Member>;
  inCall: boolean;
  micOn: boolean;
  onToggleMic: (v: boolean) => void;
  onJoinSuccess: () => void;
  onLeave: () => void;
  localStream: MediaStream | null;
  localScreen: MediaStream | null;
  peers: PeerSnapshot[];
  deafOn: boolean;
  onToggleDeafen: (v: boolean) => void;
  /** Per-peer volume map: socketId → 0–1. Missing key = 1.0. */
  peerVolumes: Record<string, number>;
  onSetVolume: (socketId: string, vol: number) => void;
  /** Mobile only — opens the channel list drawer */
  onOpenSidebar?: () => void;
};

export function CallView({
  channel,
  manager,
  me,
  members,
  inCall,
  micOn,
  onToggleMic,
  onJoinSuccess,
  onLeave,
  localStream,
  localScreen,
  peers,
  deafOn,
  onToggleDeafen,
  peerVolumes,
  onSetVolume,
  onOpenSidebar,
}: Props) {
  const [camOn, setCamOn] = useState(false);
  const [joining, setJoining] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // key of the tile currently pinned to the featured (large) position — null = auto layout
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  // Noise suppression — on by default; toggle lets streamers/musicians pass audio raw
  const [nsOn, setNsOn] = useState(() => manager.getNoiseSuppression());

  const speaking = useSpeakingDetection(localStream, me.id, peers);

  useEffect(() => {
    setSharing(localScreen !== null);
  }, [localScreen]);

  async function join(withVideo: boolean) {
    setJoining(true);
    setError(null);
    try {
      await manager.join(channel.id, { video: withVideo });
      onToggleMic(true);
      setCamOn(withVideo);
      onJoinSuccess();
    } catch (err: any) {
      setError(err?.message ?? 'Could not access microphone');
    } finally {
      setJoining(false);
    }
  }

  function leave() {
    setSharing(false);
    onLeave();
  }

  async function toggleScreen() {
    if (!canScreenShare) {
      setError('Screen sharing is not supported in this browser.');
      return;
    }
    setError(null);
    if (manager.isSharingScreen()) {
      try {
        await manager.stopScreenShare();
      } catch (err: any) {
        setError(err?.message ?? 'Could not stop screen share');
        return;
      }
      setSharing(false);
    } else {
      setShareDialogOpen(true);
    }
  }

  async function startSharing(opts: ScreenShareOptions) {
    if (!canScreenShare) {
      setError('Screen sharing is not supported in this browser.');
      return;
    }
    setError(null);
    try {
      await manager.startScreenShare(opts);
      setSharing(true);
    } catch (err: any) {
      // NotAllowedError / AbortError = user closed or denied the picker → close quietly
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
        setError(err?.message ?? 'Could not start screen share');
      }
    }
  }

  const tiles = useMemo<Tile[]>(() => {
    const t: Tile[] = [];
    if (inCall) {
      t.push({
        key: 'self-cam',
        socketId: null,
        userId: me.id,
        name: members[me.id]?.displayName ?? me.displayName,
        stream: localStream,
        kind: 'camera',
        isSelf: true,
        showVideoControlled: camOn,
      });
      if (localScreen) {
        t.push({
          key: 'self-screen',
          socketId: null,
          userId: me.id,
          name: (members[me.id]?.displayName ?? me.displayName) + ' — screen',
          stream: localScreen,
          kind: 'screen',
          isSelf: true,
          showVideoControlled: true,
        });
      }
    }
    for (const peer of peers) {
      for (const rs of peer.streams) {
        const name = members[peer.userId]?.displayName ?? 'user';
        t.push({
          key: `${peer.socketId}:${rs.streamId}`,
          socketId: peer.socketId,
          userId: peer.userId,
          name: rs.kind === 'screen' ? `${name} — screen` : name,
          stream: rs.stream,
          kind: rs.kind,
          isSelf: false,
          showVideoControlled: true,
        });
      }
      // ensure every peer shows at least an avatar tile, even with no streams yet
      if (peer.streams.length === 0) {
        t.push({
          key: `${peer.socketId}:placeholder`,
          socketId: peer.socketId,
          userId: peer.userId,
          name: members[peer.userId]?.displayName ?? 'user',
          stream: null,
          kind: 'camera',
          isSelf: false,
          showVideoControlled: false,
          connectionState: peer.connectionState,
        });
      }
    }
    return t;
  }, [inCall, localStream, localScreen, peers, me, members, camOn]);

  // Auto-clear pin when the pinned peer leaves the call
  useEffect(() => {
    if (pinnedKey && !tiles.some((t) => t.key === pinnedKey)) {
      setPinnedKey(null);
    }
  }, [tiles, pinnedKey]);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-ink-900/40">
      <header className="h-12 px-3 md:px-5 flex items-center justify-between border-b border-white/5 bg-ink-900/60 backdrop-blur shrink-0 gap-2">
        {/* Mobile hamburger — opens channel list */}
        {onOpenSidebar && (
          <button
            onClick={onOpenSidebar}
            className="md:hidden h-9 w-9 grid place-items-center rounded-lg text-ink-300 hover:bg-white/[0.06] hover:text-ink-100 shrink-0"
            aria-label="Open channel list"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-ink-300">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          </span>
          <h2 className="text-[14px] font-semibold truncate">{channel.name}</h2>
          <span className="h-3.5 w-px bg-white/10 mx-2 hidden sm:block" />
          <span className="text-[11px] text-ink-300 hidden sm:block">
            {inCall ? `Connected · ${peers.length + 1} in call` : 'Voice room'}
          </span>
        </div>
        {inCall && (
          <span className="pill bg-emerald-500/10 text-emerald-300 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulseDot" /> live
          </span>
        )}
      </header>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* ICE failure banner — shown when every peer has permanently failed to connect */}
        {inCall && peers.length > 0 && peers.every((p) => p.connectionState === 'failed') && (
          <div className="shrink-0 mx-3 mt-3 px-3 py-2 rounded-lg bg-rose-900/30 border border-rose-700/30 text-rose-300 text-xs">
            ⚠ Connection failed — peers may be on different networks. A TURN relay server is required for cross-network calls.
          </div>
        )}
        {!inCall ? (
          /* Pre-join: scrollable so small screens can reach the buttons */
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <PreJoin
              channelName={channel.name}
              joining={joining}
              error={error}
              onJoin={join}
            />
          </div>
        ) : (
          /* In call: must fill the remaining height cleanly — no scroll wrapper */
          <div className="flex-1 min-h-0 p-2 md:p-4 flex flex-col">
            <CallStage
              allTiles={tiles}
              pinnedKey={pinnedKey}
              onPin={setPinnedKey}
              speaking={speaking}
              peerVolumes={peerVolumes}
              onSetVolume={onSetVolume}
            />
          </div>
        )}
      </div>

      <ScreenShareDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        onStart={startSharing}
      />

      {inCall && (
        <div className="px-5 pb-5 pt-2">
          {error && (
            <div className="text-rose-300 text-xs mb-2 px-1">{error}</div>
          )}
          <div className="panel-inner rounded-2xl px-4 py-3 flex items-center justify-center gap-3 overflow-x-auto">
            <ControlButton
              active={micOn}
              disabled={deafOn}
              onClick={() => {
                const next = manager.toggleMic(!micOn);
                onToggleMic(next);
                playCallSound(next ? 'unmute' : 'mute');
              }}
              label={deafOn ? 'Deafened' : micOn ? 'Mute' : 'Unmute'}
              variant={micOn ? 'on' : 'muted'}
              icon={
                micOn ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M19 10a7 7 0 0 1-14 0M12 19v3" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="2" y1="2" x2="22" y2="22" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9V5a3 3 0 0 0-5.94-.6" />
                    <path d="M19 10a7 7 0 0 1-.11 1.23M12 19v3" />
                  </svg>
                )
              }
            />
            <ControlButton
              active={!deafOn}
              onClick={() => {
                const next = !deafOn;
                onToggleDeafen(next);
                playCallSound(next ? 'deafen' : 'undeafen');
              }}
              label={deafOn ? 'Undeafen' : 'Deafen'}
              variant={deafOn ? 'muted' : 'on'}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
                  <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              }
            />
            <ControlButton
              active={camOn}
              onClick={async () => {
                if (manager.hasVideo()) {
                  setCamOn(manager.toggleCam(!camOn));
                } else {
                  // Pass false so onCallEnded doesn't fire — we're rejoining immediately.
                  // Firing it would set inCall=false in App.tsx, breaking the UI mid-rejoin.
                  manager.leave(false);
                  try {
                    await manager.join(channel.id, { video: true });
                    onToggleMic(true);
                    setCamOn(true);
                    onJoinSuccess();
                  } catch (err: any) {
                    setError(err?.message ?? 'Could not access camera');
                  }
                }
              }}
              label={camOn ? 'Stop video' : 'Start video'}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
              }
            />
            {canScreenShare && (
              <ControlButton
                active={sharing}
                onClick={toggleScreen}
                label={sharing ? 'Stop sharing' : 'Share screen'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                }
              />
            )}
            {/* Noise suppression toggle */}
            <ControlButton
              active={nsOn}
              onClick={async () => {
                const next = !nsOn;
                setNsOn(next);
                await manager.setNoiseSuppression(next);
              }}
              label={nsOn ? 'Noise suppression on' : 'Noise suppression off'}
              variant={nsOn ? 'on' : 'muted'}
              icon={
                nsOn ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    {/* shield tick */}
                    <path d="M9 12l2 2 4-4" strokeWidth="2.2" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    {/* slash through */}
                    <line x1="4" y1="4" x2="20" y2="20" />
                  </svg>
                )
              }
            />
            <button className="btn-danger !rounded-xl !px-4 !py-2" onClick={leave}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                <line x1="23" y1="1" x2="1" y2="23" />
              </svg>
              Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreJoin({
  channelName,
  joining,
  error,
  onJoin,
}: {
  channelName: string;
  joining: boolean;
  error: string | null;
  onJoin: (withVideo: boolean) => void;
}) {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center max-w-md">
        <div className="mx-auto h-16 w-16 grid place-items-center rounded-2xl bg-accent-teal/15 text-accent-teal mb-4">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">{channelName}</h3>
        <p className="text-sm text-ink-300 mt-1 mb-5">
          Start or join a peer-to-peer call. Audio, video and screen share stay between you and the other people in the room.
        </p>
        {error && <div className="text-rose-300 text-xs mb-3">{error}</div>}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button className="btn-primary w-full sm:w-auto" disabled={joining} onClick={() => onJoin(false)}>
            {joining ? 'Connecting…' : 'Join voice'}
          </button>
          <button className="btn-ghost border border-white/10 w-full sm:w-auto" disabled={joining} onClick={() => onJoin(true)}>
            Join with video
          </button>
        </div>
      </div>
    </div>
  );
}

function CallStage({
  allTiles,
  pinnedKey,
  onPin,
  speaking,
  peerVolumes,
  onSetVolume,
}: {
  allTiles: Tile[];
  pinnedKey: string | null;
  onPin: (key: string | null) => void;
  speaking: Record<string, boolean>;
  peerVolumes: Record<string, number>;
  onSetVolume: (socketId: string, vol: number) => void;
}) {
  const screenTiles = allTiles.filter((t) => t.kind === 'screen');
  const camTiles    = allTiles.filter((t) => t.kind === 'camera');

  // Helper — props shared between every Tile render
  const tp = (t: Tile, variant: 'grid' | 'primary' | 'strip') => ({
    key: t.key,
    tile: t,
    variant,
    isSpeaking: variant !== 'primary' ? !!speaking[t.userId] : false,
    isPinned: pinnedKey === t.key,
    onPin: () => onPin(pinnedKey === t.key ? null : t.key),
    volume: t.socketId ? (peerVolumes[t.socketId] ?? 1) : 1,
    onSetVolume: t.socketId ? (vol: number) => onSetVolume(t.socketId!, vol) : undefined,
  });

  // ── Pinned layout: chosen tile fills the main area, rest go to strip ──────
  if (pinnedKey) {
    const pinned = allTiles.find((t) => t.key === pinnedKey);
    const rest   = allTiles.filter((t) => t.key !== pinnedKey);
    if (pinned) {
      return (
        <div className="flex-1 min-h-0 flex flex-col gap-2 md:gap-3">
          <div className="flex-1 min-h-0">
            <Tile {...tp(pinned, 'primary')} />
          </div>
          {rest.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
              {rest.map((t) => (
                <div key={t.key} className="w-32 md:w-44 shrink-0">
                  <Tile {...tp(t, 'strip')} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
  }

  // ── Default layout ─────────────────────────────────────────────────────────
  if (screenTiles.length === 0) {
    const cols = camTiles.length <= 1 ? 1 : camTiles.length <= 4 ? 2 : 3;
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
        <div
          className="w-full max-w-5xl grid gap-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {camTiles.map((t) => <Tile {...tp(t, 'grid')} />)}
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 md:gap-3">
      <div
        className="flex-1 min-h-0 grid gap-2 md:gap-3"
        style={{ gridTemplateColumns: `repeat(${screenTiles.length <= 1 ? 1 : 2}, minmax(0, 1fr))` }}
      >
        {screenTiles.map((t) => <Tile {...tp(t, 'primary')} />)}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
        {camTiles.map((t) => (
          <div key={t.key} className="w-32 md:w-44 shrink-0">
            <Tile {...tp(t, 'strip')} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({
  tile,
  variant = 'grid',
  isSpeaking = false,
  isPinned = false,
  onPin,
  volume = 1,
  onSetVolume,
}: {
  tile: Tile;
  variant?: 'grid' | 'primary' | 'strip';
  isSpeaking?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  volume?: number;
  onSetVolume?: (vol: number) => void;
}) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    v.srcObject = tile.stream;
    // Check both enabled (local control) and !muted (sender stopped sending frames).
    // Remote camera disable causes the receiving track to go muted; without this
    // check the tile would show black frames instead of an avatar.
    const update = () =>
      setHasVideo(
        (tile.stream?.getVideoTracks().filter((t) => t.enabled && !t.muted).length ?? 0) > 0,
      );
    update();
    const tracks = tile.stream?.getTracks() ?? [];
    tracks.forEach((t) => {
      t.addEventListener('ended', update);
      t.addEventListener('mute', update);
      t.addEventListener('unmute', update);
    });
    return () => {
      tracks.forEach((t) => {
        t.removeEventListener('ended', update);
        t.removeEventListener('mute', update);
        t.removeEventListener('unmute', update);
      });
      // Release MediaStream reference to prevent memory leak (#32)
      v.pause();
      v.srcObject = null;
    };
  }, [tile.stream]);

  const c = userColor(tile.userId, tile.isSelf);
  const showVid = hasVideo && tile.showVideoControlled;
  const isScreen = tile.kind === 'screen';
  const cs = tile.connectionState;
  const isConnecting = !tile.isSelf && (cs === 'new' || cs === 'connecting');
  const isFailed = !tile.isSelf && cs === 'failed';
  const isStrip = variant === 'strip';

  const baseClasses =
    variant === 'primary'
      ? 'group relative h-full w-full rounded-2xl overflow-hidden border border-white/5 bg-black'
      : isStrip
      ? 'group relative aspect-video rounded-xl overflow-hidden border border-white/5 bg-ink-800/60'
      : 'group relative aspect-video rounded-2xl overflow-hidden border border-white/5 bg-ink-800/60';

  // mirror local camera; never mirror screen captures
  const mirror = tile.isSelf && tile.kind === 'camera';

  const ringStyle = isPinned
    ? '0 0 0 2px rgba(99,102,241,0.8), 0 0 14px rgba(99,102,241,0.25)'
    : isFailed
    ? 'inset 0 0 0 2px rgba(239,68,68,0.5)'
    : isSpeaking
    ? '0 0 0 2px rgba(74,222,128,0.9), 0 0 16px rgba(74,222,128,0.35)'
    : `inset 0 0 0 1px ${c.ring}`;

  const volPct = Math.round(volume * 100);

  return (
    <div
      className={baseClasses}
      style={{
        boxShadow: ringStyle,
        transition: 'box-shadow 0.15s ease',
      }}
    >
      {/* Always muted — audio for remote peers is handled by persistent <audio>
          elements in App.tsx so it keeps playing when the user navigates to a
          text channel while in a call. Self is always muted to prevent echo. */}
      <video
        ref={vidRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full ${isScreen ? 'object-contain bg-black' : 'object-cover'} ${
          showVid ? '' : 'opacity-0'
        } ${mirror ? '-scale-x-100' : ''}`}
      />
      {!showVid && (
        <div className="absolute inset-0 grid place-items-center">
          <Avatar name={tile.name} id={tile.userId} size={isStrip ? 'md' : 'lg'} isSelf={tile.isSelf} />
        </div>
      )}

      {/* ── Controls overlay ───────────────────────────────────────────────── */}
      {/* Mobile: always visible (no hover on touch). Desktop md+: fade on hover. */}
      {/* Volume is hidden on strip variant (too narrow) and for self tiles.       */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-2 py-1.5 bg-gradient-to-b from-black/70 to-transparent opacity-100 pointer-events-auto md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto transition-opacity duration-150 z-10">
        {!tile.isSelf && !isStrip && onSetVolume && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Volume icon — adapts to level */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-white/70">
              {volPct === 0 ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : volPct < 50 ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
            <input
              type="range"
              min={0}
              max={100}
              value={volPct}
              onChange={(e) => onSetVolume(Number(e.target.value) / 100)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 h-1 cursor-pointer rounded-full"
              style={{ accentColor: '#818cf8' }}
            />
            <span className="text-[10px] text-white/50 w-7 text-right shrink-0">{volPct}%</span>
          </div>
        )}
        {onPin && (
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            title={isPinned ? 'Unpin' : 'Pin to focus'}
            className={`ml-auto h-6 w-6 rounded-md grid place-items-center transition-colors shrink-0 ${
              isPinned ? 'text-accent-violet' : 'text-white/60 hover:text-white'
            }`}
          >
            {/* Pin icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Connecting spinner overlay */}
      {isConnecting && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <svg className="animate-spin text-white/40" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
      )}
      {/* Failed badge */}
      {isFailed && (
        <div className="absolute top-2 left-2 right-2 flex justify-center pointer-events-none">
          <span className="pill text-[10px] bg-rose-900/80 text-rose-300 border-rose-700/40">
            connection failed
          </span>
        </div>
      )}
      <div className="absolute left-2 bottom-2 right-2 flex items-center justify-between gap-2">
        <span
          className="pill text-[11px] backdrop-blur truncate max-w-full"
          style={{
            background: 'rgba(0,0,0,0.55)',
            color: c.text,
            boxShadow: `inset 0 0 0 1px ${c.ring}`,
          }}
        >
          {isScreen && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
            </svg>
          )}
          <span className="truncate">{tile.name}{tile.isSelf && tile.kind === 'camera' && ' · you'}</span>
        </span>
        {/* Pinned badge — always visible when tile is pinned */}
        {isPinned && (
          <span className="pill text-[10px] bg-accent-violet/20 text-accent-violet border-accent-violet/30 shrink-0">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
            pinned
          </span>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  label,
  icon,
  variant = 'on',
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  variant?: 'on' | 'muted';
  disabled?: boolean;
}) {
  const cls = disabled
    ? 'bg-ink-800/30 border-white/5 text-ink-600 cursor-not-allowed'
    : active
    ? 'bg-accent-violet/20 border-accent-violet/30 text-accent-violet'
    : variant === 'muted'
    ? 'bg-rose-500/15 border-rose-500/20 text-rose-300'
    : 'bg-ink-800/70 border-white/5 text-ink-200 hover:text-ink-100';
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={label}
      disabled={disabled}
      className={`h-12 w-12 md:h-11 md:w-11 rounded-xl grid place-items-center transition-colors border ${cls}`}
    >
      {icon}
    </button>
  );
}
