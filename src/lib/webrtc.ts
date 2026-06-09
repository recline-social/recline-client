import type { Socket } from 'socket.io-client';

export type StreamKind = 'camera' | 'screen';

export type ScreenSurface = 'any' | 'monitor' | 'window' | 'browser';

export type ScreenShareOptions = {
  surface?: ScreenSurface;
  maxWidth?: number;
  maxHeight?: number;
  frameRate?: number;
  captureAudio?: boolean;
};

export type RemoteStream = {
  streamId: string;
  stream: MediaStream;
  kind: StreamKind;
};

type Peer = {
  socketId: string;
  userId: string;
  pc: RTCPeerConnection;
  streams: Map<string, RemoteStream>; // streamId -> RemoteStream
  // pendingScreenIds are announced by the remote BEFORE the track arrives;
  // we use the set to label ontrack'd streams as 'screen' when they show up.
  pendingScreenIds: Set<string>;
  // count-based fallback for when msid doesn't propagate intact: how many
  // screens this peer has announced minus how many we've already labeled.
  unmatchedScreens: number;
  // ICE candidates that arrived before setRemoteDescription completed.
  // Without queuing, 'await setRemoteDescription' yields the microtask queue
  // and the next socket event fires addIceCandidate while remoteDescription is
  // still null — it throws, the catch swallows it, and the candidate is gone.
  pendingCandidates: RTCIceCandidateInit[];
  // Timer handle for ICE restart debounce — cleared when connection recovers.
  iceRestartTimer?: ReturnType<typeof setTimeout>;
  // How many ICE restarts we've attempted for this peer (caps retries).
  iceRestartAttempts: number;
};

type Events = {
  onPeers: (peers: PeerSnapshot[]) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onLocalScreen: (stream: MediaStream | null) => void;
  /** Fired when the call actually ends (leave button, kicked, etc.) — NOT when
   *  switching voice channels internally. Lets React stay in sync with call state (#9). */
  onCallEnded?: () => void;
};

export type PeerSnapshot = {
  socketId: string;
  userId: string;
  streams: RemoteStream[];
  connectionState: RTCPeerConnectionState;
};

// ── Audio quality ────────────────────────────────────────────────────────────
// Target: 128 kbps stereo 48 kHz Opus with in-band FEC and DTX disabled.
// 48 kHz is Opus's native sample rate — requesting it avoids a browser-side
// resample step. Stereo (channelCount ideal:2) gracefully falls back to mono
// when the input device is mono-only. maxaveragebitrate is the Opus encoder
// directive; setParameters.maxBitrate is a belt-and-suspenders WebRTC cap
// applied after the connection is established.

const AUDIO_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48_000,
  channelCount: { ideal: 2, min: 1 },
};

const AUDIO_BITRATE_BPS = 128_000; // 128 kbps

/**
 * Munge the Opus fmtp line in an SDP string to request stereo + 128 kbps +
 * in-band FEC + no DTX. Works on both offer and answer SDPs.
 *
 * stereo=1         → tell the remote we want to receive stereo
 * sprop-stereo=1   → tell the remote we will send stereo
 * maxaveragebitrate → Opus encoder bitrate ceiling (bps)
 * useinbandfec=1   → Opus recovers from packet loss using redundancy in the stream
 * usedtx=0         → disable discontinuous transmission; encoder runs continuously
 *                    even during silence (cleaner for music/ambient, no clipping artefacts)
 */
function boostOpusQuality(sdp: string): string {
  // Find the dynamic payload type the browser assigned to opus/48000/2
  const rtpmapMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!rtpmapMatch) return sdp; // no Opus — leave untouched

  const pt = rtpmapMatch[1];

  const desired: Record<string, string> = {
    stereo: '1',
    'sprop-stereo': '1',
    maxaveragebitrate: String(AUDIO_BITRATE_BPS),
    useinbandfec: '1',
    // usedtx=1 enables Opus Discontinuous Transmission: the encoder stops
    // sending packets when the input is silence. Peers hear nothing instead of
    // continuous low-level background noise. This is the primary voice-channel
    // suppression mechanism — without it, every ambient sound in the room is
    // transmitted at full bitrate even while nobody is speaking.
    usedtx: '1',
  };

  const fmtpRe = new RegExp(`(a=fmtp:${pt} )(.+)`);
  if (fmtpRe.test(sdp)) {
    return sdp.replace(fmtpRe, (_m, prefix, existing) => {
      // Parse existing k=v pairs, override/append our targets.
      const map = new Map<string, string>(
        existing.split(';').map((s: string) => {
          const [k, ...v] = s.trim().split('=');
          return [k, v.join('=')];
        }),
      );
      for (const [k, v] of Object.entries(desired)) map.set(k, v);
      return prefix + Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join(';');
    });
  }

  // No fmtp line yet — insert one directly after the rtpmap line.
  const fmtpLine = `a=fmtp:${pt} ${Object.entries(desired).map(([k, v]) => `${k}=${v}`).join(';')}`;
  return sdp.replace(
    `a=rtpmap:${pt} opus/48000/2`,
    `a=rtpmap:${pt} opus/48000/2\r\n${fmtpLine}`,
  );
}

// ── ICE server fallback ───────────────────────────────────────────────────────
// Used only when the server doesn't return iceServers in the call:join response
// (e.g., TURN_URL/TURN_SECRET not configured).
// Set VITE_ICE_SERVERS to a JSON array to override at build time.
function buildFallbackIceServers(): RTCIceServer[] {
  try {
    const raw = (import.meta as any).env?.VITE_ICE_SERVERS as string | undefined;
    if (raw) return JSON.parse(raw) as RTCIceServer[];
  } catch { /* ignore */ }
  // Multiple STUN servers so 701 errors on one don't leave peers candidate-less
  return [{
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun.cloudflare.com:3478',
    ],
  }];
}
const FALLBACK_ICE_SERVERS: RTCIceServer[] = buildFallbackIceServers();

export class CallManager {
  private socket: Socket;
  private channelId: string | null = null;
  private peers = new Map<string, Peer>();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private events: Events;
  private wantVideo = false;
  // Per-call auth token — issued by the server on successful call:join.
  // Must be included in all subsequent signaling events so the server can
  // verify the socket completed an authenticated join before relaying signals.
  private callToken: string | null = null;
  // ICE servers — updated from call:join response; falls back to FALLBACK_ICE_SERVERS
  private iceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;
  // signaling guards
  private makingOffer = new Map<string, boolean>();
  // screen-on events that arrived for a peer we haven't created yet
  private pendingScreensBySocketId = new Map<string, Set<string>>();

  constructor(socket: Socket, events: Events) {
    this.socket = socket;
    this.events = events;
    this.socket.on('call:peer-joined', this.handlePeerJoined);
    this.socket.on('call:peer-left', this.handlePeerLeft);
    this.socket.on('call:signal', this.handleSignal);
    this.socket.on('call:screen-on', this.handleRemoteScreenOn);
    this.socket.on('call:screen-off', this.handleRemoteScreenOff);
  }

  destroy() {
    this.socket.off('call:peer-joined', this.handlePeerJoined);
    this.socket.off('call:peer-left', this.handlePeerLeft);
    this.socket.off('call:signal', this.handleSignal);
    this.socket.off('call:screen-on', this.handleRemoteScreenOn);
    this.socket.off('call:screen-off', this.handleRemoteScreenOff);
    this.leave(false); // don't fire onCallEnded — socket lifecycle handles this
  }

  isInCall(channelId?: string) {
    if (!channelId) return this.channelId !== null;
    return this.channelId === channelId;
  }

  currentChannel() {
    return this.channelId;
  }

  async join(channelId: string, opts: { video?: boolean } = {}) {
    // When switching voice channels, leave the old call without firing onCallEnded
    // (we're immediately joining a new one — React should not reset inCall state).
    if (this.channelId && this.channelId !== channelId) this.leave(false);
    if (this.channelId === channelId) return;
    this.channelId = channelId;
    this.wantVideo = !!opts.video;

    try {
      this.localStream = await this._getUserMediaWithFallback(this.wantVideo);
    } catch (err) {
      this.channelId = null;
      this.localStream = null;
      this.events.onLocalStream(null);
      throw err;
    }
    this.events.onLocalStream(this.localStream);

    const existing = await new Promise<{
      peers: { socketId: string; userId: string }[];
      screens: { fromSocketId: string; streamId: string }[];
    }>((resolve, reject) => {
      // 15 s hard timeout — guards against the server catch block eating the exception
      // and never calling ack, which would leave the client stuck on "Connecting…".
      const timeoutId = setTimeout(() => {
        reject(new Error('Server did not respond — please try again'));
      }, 15_000);

      this.socket.emit(
        'call:join',
        channelId,
        (resp: {
          peers: { socketId: string; userId: string }[];
          screens?: { fromSocketId: string; streamId: string }[];
          callToken?: string;
          iceServers?: RTCIceServer[];
          error?: string;
        }) => {
          clearTimeout(timeoutId);
          if (resp?.error) {
            reject(new Error(resp.error === 'unauthorized' ? 'Not authorised to join this call' : resp.error));
            return;
          }
          // Store the per-call auth token for all subsequent signaling operations.
          this.callToken = resp?.callToken ?? null;
          // Use ICE servers from the server (includes time-limited TURN credentials)
          // if provided; otherwise fall back to the build-time static config.
          if (resp?.iceServers?.length) this.iceServers = resp.iceServers as RTCIceServer[];
          resolve({
            peers: resp?.peers ?? [],
            screens: resp?.screens ?? [],
          });
        },
      );
    });

    for (const peer of existing.peers) {
      const created = this.createPeer(peer.socketId, peer.userId);
      for (const s of existing.screens) {
        if (s.fromSocketId === peer.socketId) {
          if (!created.pendingScreenIds.has(s.streamId)) {
            created.pendingScreenIds.add(s.streamId);
            created.unmatchedScreens += 1;
          }
        }
      }
      await this.makeOffer(created);
    }
    this.emitPeers();
  }

  /** @param fireCallback - set false when switching voice channels internally
   *  so React doesn't reset inCall state mid-join (#9 / #33). */
  leave(fireCallback = true) {
    if (this.channelId) {
      if (this.screenStream) {
        this.socket.emit('call:screen-off', {
          channelId: this.channelId,
          streamId: this.screenStream.id,
          callToken: this.callToken,
        });
      }
      this.socket.emit('call:leave', this.channelId);
      this.channelId = null;
      this.callToken = null; // revoke local token on leave
    }
    for (const peer of this.peers.values()) {
      if (peer.iceRestartTimer !== undefined) clearTimeout(peer.iceRestartTimer);
      peer.pc.close();
    }
    this.peers.clear();
    this.pendingScreensBySocketId.clear();
    this.makingOffer.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    this.events.onLocalStream(null);
    this.events.onLocalScreen(null);
    this.emitPeers();
    if (fireCallback) this.events.onCallEnded?.();
  }

  getMicEnabled(): boolean {
    return this.localStream?.getAudioTracks()[0]?.enabled ?? true;
  }

  toggleMic(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    const tracks = this.localStream.getAudioTracks();
    const next = enabled ?? !tracks[0]?.enabled;
    tracks.forEach((t) => (t.enabled = next));
    return next;
  }

  toggleCam(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    const tracks = this.localStream.getVideoTracks();
    if (tracks.length === 0) return false;
    const next = enabled ?? !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = next));
    return next;
  }

  hasVideo() {
    return (this.localStream?.getVideoTracks().length ?? 0) > 0;
  }

  /**
   * Toggle browser-native noise suppression + echo cancellation on the live
   * audio track. Applies applyConstraints() on the captured track; Chrome and
   * Edge support this at runtime. Other browsers silently ignore unsupported
   * constraints — they stay on their previous setting, which is fine.
   */
  async setNoiseSuppression(enabled: boolean): Promise<void> {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        noiseSuppression: enabled,
        echoCancellation: enabled,
        autoGainControl: enabled,
      });
    } catch {
      // Not all browsers support runtime constraint changes — fail silently.
    }
  }

  isSharingScreen() {
    return this.screenStream !== null;
  }

  /**
   * getUserMedia with an Android-safe fallback.
   *
   * Android hardware frequently rejects the rich AUDIO_CAPTURE_CONSTRAINTS
   * (particularly sampleRate:48000 and stereo channelCount) with
   * OverconstrainedError. We try the full quality set first; if the device
   * refuses, we retry with the minimal set that every device supports.
   * The original error is surfaced if both attempts fail.
   *
   * On mobile we also request facingMode:'user' so the front camera opens
   * by default instead of the rear one.
   */
  private async _getUserMediaWithFallback(wantVideo: boolean): Promise<MediaStream> {
    const videoConstraints: MediaTrackConstraints | false = wantVideo
      ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'user' } }
      : false;

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CAPTURE_CONSTRAINTS,
        video: videoConstraints,
      });
    } catch (firstErr) {
      // Retry with baseline constraints — guaranteed to succeed on any device
      // that has a working microphone/camera and the right manifest permissions.
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: wantVideo ? { facingMode: { ideal: 'user' } } : false,
        });
      } catch {
        // Neither set of constraints worked — throw the original error so the
        // message ("Permission denied", "Overconstrained", etc.) is meaningful.
        throw firstErr;
      }
    }
  }

  async startScreenShare(opts: ScreenShareOptions = {}): Promise<MediaStream> {
    if (!this.channelId) throw new Error('Not in a call');
    // getDisplayMedia is a desktop browser API — not available in Android WebView,
    // iOS Safari, or most mobile browsers. The CallView already hides the button
    // via canScreenShare, but guard here too so any direct call fails clearly.
    if (typeof (navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown })?.getDisplayMedia !== 'function') {
      throw new Error('Screen sharing is not supported on this device');
    }
    if (this.screenStream) return this.screenStream;

    const video: MediaTrackConstraints = {};
    if (opts.maxWidth) video.width = { max: opts.maxWidth };
    if (opts.maxHeight) video.height = { max: opts.maxHeight };
    if (opts.frameRate) video.frameRate = { ideal: opts.frameRate, max: opts.frameRate };
    if (opts.surface && opts.surface !== 'any') {
      // displaySurface is a hint to the browser picker — non-matching surfaces
      // remain hidden if the browser honors the constraint.
      (video as MediaTrackConstraints & { displaySurface?: string }).displaySurface = opts.surface;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: Object.keys(video).length ? video : true,
        audio: opts.captureAudio !== false,
      });
    } catch (err) {
      // user denied / closed picker — surface a clean failure
      throw err;
    }

    this.screenStream = stream;
    // announce so peers label the inbound streamId as a screen, not a camera
    this.socket.emit('call:screen-on', {
      channelId: this.channelId,
      streamId: stream.id,
      callToken: this.callToken,
    });

    for (const peer of this.peers.values()) {
      for (const track of stream.getTracks()) peer.pc.addTrack(track, stream);
      await this.makeOffer(peer);
    }

    // auto-stop when the user clicks the browser's "Stop sharing" UI
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      this.stopScreenShare().catch(() => {});
    });

    this.events.onLocalScreen(stream);
    return stream;
  }

  async stopScreenShare() {
    if (!this.screenStream || !this.channelId) return;
    const stream = this.screenStream;
    const streamId = stream.id;
    const tracks = stream.getTracks();
    const channelId = this.channelId;

    // Null out FIRST so when track.stop() below fires 'ended', the listener's
    // re-entry into stopScreenShare hits the guard and bails immediately.
    this.screenStream = null;

    for (const peer of this.peers.values()) {
      const senders = peer.pc.getSenders();
      for (const t of tracks) {
        const sender = senders.find((s) => s.track === t);
        if (sender) {
          try {
            peer.pc.removeTrack(sender);
          } catch {
            /* ignore */
          }
        }
      }
      await this.makeOffer(peer);
    }

    tracks.forEach((t) => t.stop());
    this.events.onLocalScreen(null);
    this.socket.emit('call:screen-off', { channelId, streamId, callToken: this.callToken });
  }

  /* ------------------------ Internal ------------------------ */

  private handlePeerJoined = (data: { channelId: string; userId: string; socketId: string }) => {
    if (data.channelId !== this.channelId) return;
    if (!this.peers.has(data.socketId)) {
      this.createPeer(data.socketId, data.userId);
      this.emitPeers();
    }
  };

  private handlePeerLeft = (data: { channelId: string; userId: string; socketId: string }) => {
    if (data.channelId !== this.channelId) return;
    const peer = this.peers.get(data.socketId);
    if (peer) {
      if (peer.iceRestartTimer !== undefined) clearTimeout(peer.iceRestartTimer);
      peer.pc.close();
      this.peers.delete(data.socketId);
      // Also flush any queued screen-on events for this socket so stale
      // entries don't get applied if the same socketId reconnects later.
      this.pendingScreensBySocketId.delete(data.socketId);
      this.emitPeers();
    }
  };

  private handleRemoteScreenOn = (data: {
    channelId: string;
    fromSocketId: string;
    streamId: string;
  }) => {
    if (data.channelId !== this.channelId) return;
    const peer = this.peers.get(data.fromSocketId);
    if (!peer) {
      // peer object not yet created (race during join). Queue so it's applied
      // when createPeer runs.
      const q = this.pendingScreensBySocketId.get(data.fromSocketId) ?? new Set<string>();
      q.add(data.streamId);
      this.pendingScreensBySocketId.set(data.fromSocketId, q);
      return;
    }
    const existing = peer.streams.get(data.streamId);
    if (existing) {
      if (existing.kind !== 'screen') {
        existing.kind = 'screen';
        this.emitPeers();
      }
    } else {
      peer.pendingScreenIds.add(data.streamId);
      peer.unmatchedScreens += 1;
    }
  };

  private handleRemoteScreenOff = (data: {
    channelId: string;
    fromSocketId: string;
    streamId: string;
  }) => {
    if (data.channelId !== this.channelId) return;
    const queued = this.pendingScreensBySocketId.get(data.fromSocketId);
    if (queued) {
      queued.delete(data.streamId);
      if (queued.size === 0) this.pendingScreensBySocketId.delete(data.fromSocketId);
    }
    const peer = this.peers.get(data.fromSocketId);
    if (!peer) return;
    if (peer.pendingScreenIds.delete(data.streamId)) {
      peer.unmatchedScreens = Math.max(0, peer.unmatchedScreens - 1);
    }
    // If we have a stream matched by streamId, drop it. Otherwise drop the
    // most recent stream we tagged 'screen' (covers the msid-mismatch case).
    if (peer.streams.has(data.streamId)) {
      peer.streams.delete(data.streamId);
      this.emitPeers();
      return;
    }
    for (const [id, rs] of Array.from(peer.streams.entries()).reverse()) {
      if (rs.kind === 'screen') {
        peer.streams.delete(id);
        this.emitPeers();
        return;
      }
    }
  };

  private handleSignal = async (data: {
    channelId: string;
    fromSocketId: string;
    fromUserId: string;
    payload: any;
  }) => {
    if (data.channelId !== this.channelId) return;
    let peer = this.peers.get(data.fromSocketId);
    if (!peer) peer = this.createPeer(data.fromSocketId, data.fromUserId);
    const pc = peer.pc;
    const p = data.payload;

    try {
      if (p?.type === 'offer') {
        // perfect-negotiation lite: if we are also making an offer, the
        // glare-resolution rule is "lower socketId wins". Here we just
        // accept the remote offer when we aren't already mid-offer.
        const isOffering = this.makingOffer.get(peer.socketId) ?? false;
        const collision = isOffering || pc.signalingState !== 'stable';
        if (collision) {
          // Rollback our pending offer, THEN apply the remote offer.
          // (Promise.all would race the two; rollback must complete first.)
          try {
            await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
          } catch {
            /* some browsers throw if not in have-local-offer; that's fine */
          }
          await pc.setRemoteDescription(new RTCSessionDescription(p));
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(p));
        }
        // Drain any ICE candidates that arrived while setRemoteDescription
        // was awaited — they would have been queued in pendingCandidates.
        await this.drainPendingCandidates(peer);
        const rawAnswer = await pc.createAnswer();
        const answerSdp = boostOpusQuality(rawAnswer.sdp ?? '');
        await pc.setLocalDescription({ type: 'answer', sdp: answerSdp });
        this.socket.emit('call:signal', {
          channelId: this.channelId,
          toSocketId: data.fromSocketId,
          callToken: this.callToken,
          payload: { type: 'answer', sdp: answerSdp },
        });
      } else if (p?.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(p));
          // Drain candidates queued before the answer was processed.
          await this.drainPendingCandidates(peer);
        }
      } else if (p?.candidate) {
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(p.candidate));
          } catch {
            /* ignore stale/invalid candidates */
          }
        } else {
          // Remote description not yet applied — queue and apply after setRemoteDescription.
          // Without this, 'await setRemoteDescription' above yields the microtask queue,
          // allowing subsequent socket events to call addIceCandidate before remoteDescription
          // is set, causing it to throw and silently drop the candidate.
          peer.pendingCandidates.push(p.candidate);
        }
      }
    } catch (err) {
      console.warn('signal error', err);
    }
  };

  private async drainPendingCandidates(peer: Peer) {
    const queued = peer.pendingCandidates.splice(0);
    for (const c of queued) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* ignore */
      }
    }
  }

  private createPeer(socketId: string, userId: string): Peer {
    const existing = this.peers.get(socketId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = {
      socketId,
      userId,
      pc,
      streams: new Map(),
      pendingScreenIds: new Set(),
      unmatchedScreens: 0,
      pendingCandidates: [],
      iceRestartAttempts: 0,
    };
    // drain any screen-on events queued before this peer existed
    const queued = this.pendingScreensBySocketId.get(socketId);
    if (queued) {
      for (const id of queued) peer.pendingScreenIds.add(id);
      peer.unmatchedScreens += queued.size;
      this.pendingScreensBySocketId.delete(socketId);
    }
    this.peers.set(socketId, peer);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    }
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) pc.addTrack(track, this.screenStream);
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.channelId) {
        this.socket.emit('call:signal', {
          channelId: this.channelId,
          toSocketId: socketId,
          callToken: this.callToken,
          payload: { candidate: ev.candidate.toJSON() },
        });
      }
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream) return;

      // existing stream? just maybe upgrade kind, don't reclassify
      if (peer.streams.has(stream.id)) {
        const rs = peer.streams.get(stream.id)!;
        if (rs.kind !== 'screen' && peer.pendingScreenIds.has(stream.id)) {
          rs.kind = 'screen';
          peer.pendingScreenIds.delete(stream.id);
          peer.unmatchedScreens = Math.max(0, peer.unmatchedScreens - 1);
        }
        this.emitPeers();
        return;
      }

      let kind: StreamKind;
      if (peer.pendingScreenIds.has(stream.id)) {
        kind = 'screen';
        peer.pendingScreenIds.delete(stream.id);
        peer.unmatchedScreens = Math.max(0, peer.unmatchedScreens - 1);
      } else if (peer.unmatchedScreens > 0 && peer.streams.size > 0) {
        // fallback: msid didn't propagate but we know this peer is sharing AND
        // we already have their camera stream. Treat this new stream as screen.
        kind = 'screen';
        peer.unmatchedScreens -= 1;
      } else {
        kind = 'camera';
      }

      peer.streams.set(stream.id, { streamId: stream.id, stream, kind });
      stream.addEventListener('removetrack', () => {
        if (stream.getTracks().length === 0) {
          peer.streams.delete(stream.id);
          this.emitPeers();
        }
      });
      this.emitPeers();
    };

    pc.onnegotiationneeded = async () => {
      // we drive negotiation manually after add/removeTrack to keep ordering
      // predictable. The browser may still fire this; we ignore unless we are
      // currently the polite side and not already negotiating.
    };

    pc.onconnectionstatechange = () => {
      // Emit on every state transition so the UI reflects 'connecting' →
      // 'connected' → 'failed' in real time.
      this.emitPeers();

      const state = pc.connectionState;

      if (state === 'connected') {
        // Connection (re)established — reset restart counter and clear any
        // pending restart timer.
        peer.iceRestartAttempts = 0;
        if (peer.iceRestartTimer !== undefined) {
          clearTimeout(peer.iceRestartTimer);
          peer.iceRestartTimer = undefined;
        }
        // Belt-and-suspenders bitrate cap on the sender side.
        this.applyAudioSenderBitrate(peer);
      } else if (state === 'disconnected') {
        // Transient drop (network blip, TURN allocation expiry, background tab).
        // Wait 4 s before restarting — many disconnections recover on their own.
        if (peer.iceRestartTimer === undefined && peer.iceRestartAttempts < 3) {
          peer.iceRestartTimer = setTimeout(() => {
            peer.iceRestartTimer = undefined;
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              this.attemptIceRestart(peer);
            }
          }, 4000);
        }
      } else if (state === 'failed') {
        // Hard failure — restart immediately (up to 3 times total).
        if (peer.iceRestartTimer !== undefined) {
          clearTimeout(peer.iceRestartTimer);
          peer.iceRestartTimer = undefined;
        }
        if (peer.iceRestartAttempts < 3) {
          this.attemptIceRestart(peer);
        }
      }
    };

    return peer;
  }

  private async makeOffer(peer: Peer) {
    if (!this.channelId) return;
    this.makingOffer.set(peer.socketId, true);
    try {
      const raw = await peer.pc.createOffer();
      const sdp = boostOpusQuality(raw.sdp ?? '');
      await peer.pc.setLocalDescription({ type: 'offer', sdp });
      this.socket.emit('call:signal', {
        channelId: this.channelId,
        toSocketId: peer.socketId,
        callToken: this.callToken,
        payload: { type: 'offer', sdp },
      });
    } catch (err) {
      console.warn('makeOffer error', err);
    } finally {
      this.makingOffer.set(peer.socketId, false);
    }
  }

  // ICE restart — creates a new offer with iceRestart:true to get fresh TURN
  // candidates. Fixes calls dropping when TURN allocations expire (~10-15 min
  // on most free-tier servers) or when a transient network blip kills the relay.
  /** REL-023: pull fresh ICE servers (new time-limited TURN creds) from the
   *  server so an ICE restart isn't gathering candidates against expired creds. */
  private async refreshIceServers(): Promise<void> {
    try {
      const fresh = await new Promise<RTCIceServer[] | null>((resolve) => {
        const t = setTimeout(() => resolve(null), 5_000);
        this.socket.emit('call:ice-servers', (resp: { iceServers?: RTCIceServer[] }) => {
          clearTimeout(t);
          resolve(resp?.iceServers ?? null);
        });
      });
      if (fresh?.length) this.iceServers = fresh;
    } catch { /* keep existing iceServers */ }
  }

  private async attemptIceRestart(peer: Peer) {
    if (!this.channelId || !this.callToken) return;
    peer.iceRestartAttempts++;
    console.info(`[webrtc] ICE restart attempt ${peer.iceRestartAttempts} for ${peer.socketId}`);
    try {
      // Refresh TURN credentials, then push them onto the existing connection so
      // the restart gathers relay candidates against valid creds.
      await this.refreshIceServers();
      try {
        const cfg = peer.pc.getConfiguration();
        peer.pc.setConfiguration({ ...cfg, iceServers: this.iceServers });
      } catch { /* setConfiguration unsupported on some engines — restart still helps */ }
      const raw = await peer.pc.createOffer({ iceRestart: true });
      const sdp = boostOpusQuality(raw.sdp ?? '');
      await peer.pc.setLocalDescription({ type: 'offer', sdp });
      this.socket.emit('call:signal', {
        channelId: this.channelId,
        toSocketId: peer.socketId,
        callToken: this.callToken,
        payload: { type: 'offer', sdp },
      });
    } catch (err) {
      console.warn('[webrtc] ICE restart failed', err);
    }
  }

  /**
   * Belt-and-suspenders: after the connection is up, tell the RTP sender to
   * cap at AUDIO_BITRATE_BPS. This complements the SDP fmtp directive and
   * ensures Chrome/Firefox honour the limit even if fmtp negotiation differed.
   */
  private applyAudioSenderBitrate(peer: Peer) {
    for (const sender of peer.pc.getSenders()) {
      if (sender.track?.kind !== 'audio') continue;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = AUDIO_BITRATE_BPS;
      sender.setParameters(params).catch(() => { /* best-effort — not fatal */ });
    }
  }

  private emitPeers() {
    const snapshots: PeerSnapshot[] = Array.from(this.peers.values()).map((p) => ({
      socketId: p.socketId,
      userId: p.userId,
      streams: Array.from(p.streams.values()),
      connectionState: p.pc.connectionState,
    }));
    this.events.onPeers(snapshots);
  }
}
