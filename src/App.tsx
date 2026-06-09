import { useCallback, useEffect, useMemo, useRef, useState, type FC, type MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { Auth } from './components/Auth';
import { ServerRail } from './components/ServerRail';
import { ChannelList } from './components/ChannelList';
import { ChatPanel } from './components/ChatPanel';
import { CallView } from './components/CallView';
import { MemberList } from './components/MemberList';
import { Welcome } from './components/Welcome';
import { EmptyHome } from './components/EmptyHome';
import { CreateServerDialog, JoinServerDialog, UnlockDialog } from './components/ServerDialogs';
import { ProfileDialog } from './components/ProfileDialog';
import { InviteJoinModal } from './components/InviteJoinModal';
import { ServerSettingsDialog } from './components/ServerSettingsDialog';
import { DmList } from './components/DmList';
import { DmView } from './components/DmView';
import { DmCallIncoming } from './components/DmCallIncoming';
import { DmCallWindow } from './components/DmCallWindow';
import type { DmCallState } from './types';
import { ServerHome } from './components/ServerHome';
import { getServerUrl } from './lib/serverUrl';
import { api, getToken, setToken, setUnauthorizedHandler } from './lib/api';
import { connectSocket, disconnectSocket } from './lib/socket';
import {
  cacheKey,
  cachePassphrase,
  clearKey,
  clearAllKeys,
  decryptText,
  deriveServerKey,
  encryptText,
  getCachedKey,
  importKeyFromSession,
  // DM ECDH
  generateDmKeyPair,
  loadDmKeyPair,
  saveDmKeyPair,
  exportPublicKeyJwk,
  exportPrivateKeyJwk,
  encryptDmKeyBackup,
  decryptDmKeyBackup,
  importPeerPublicKey,
  deriveDmKey,
  cacheDmKey,
  getCachedDmKey,
  clearDmKey,
  clearAllDmKeys,
  rotateDmKeyPair,
  archiveCurrentKeyPair,
  loadDmKeyHistory,
  fingerprintJwk,
  checkPeerKeyTofu,
  repinPeerKey,
} from './lib/crypto';
import { CallManager, type PeerSnapshot } from './lib/webrtc';
import { playCallSound } from './lib/callSounds';
import { VoiceBar } from './components/VoiceBar';
import { FeedbackButton } from './components/FeedbackButton';
import { UserProfileCard } from './components/UserProfileCard';
import { SearchModal, type SearchResult } from './components/SearchModal';
import { BroadcastOverlay, type BroadcastPayload } from './components/BroadcastOverlay';
import { BroadcastButton } from './components/BroadcastButton';
import { Permissions, hasPermission, computeEffectivePerms } from './lib/permissions';
import {
  requestNotificationPermission,
  registerPushSubscription,
  unregisterPushSubscription,
  showNotification,
  shouldNotify,
  setDndActive,
} from './lib/notifications';

// ── Persistent audio: keeps remote streams audible when CallView is not mounted ─
const MSG_PAGE = 50; // messages per pagination page

const AudioTrack: FC<{ stream: MediaStream; deafened?: boolean; volume?: number }> = ({ stream, deafened = false, volume = 1 }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.play().catch(() => {/* autoplay policy — browser will play on next interaction */});
    return () => {
      // Release MediaStream reference to prevent memory leak (#31)
      el.pause();
      el.srcObject = null;
    };
  }, [stream]);
  // React's `muted` attribute doesn't reflect imperatively after mount in all
  // environments — update via the DOM property directly.
  useEffect(() => {
    if (ref.current) ref.current.muted = deafened;
  }, [deafened]);
  useEffect(() => {
    if (ref.current) ref.current.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);
  return <audio ref={ref} autoPlay playsInline style={{ display: 'none' }} />;
};
import type {
  CallPeer,
  Channel,
  DecodedMessage,
  DmChannel,
  DmMessage,
  DmWireMessage,
  Friend,
  Member,
  ServerRole,
  ServerSummary,
  User,
  WireMessage,
} from './types';

type ChannelState = {
  messages: DecodedMessage[];
  loaded: boolean;
  hasMore?: boolean; // true when the last fetch returned a full page → older messages likely exist
};

// ── Founding Supporter celebration toast ──────────────────────────────────────
// Only shown when ?supporter=1 is in the URL AND the API confirms the payment.
// The URL param is just a trigger hint — the real source of truth is the DB.
function SupporterToast({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 9000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-2xl p-4 max-w-xs supporter-toast"
      style={{
        background: 'linear-gradient(135deg, rgba(13,13,22,0.98) 0%, rgba(22,14,40,0.98) 100%)',
        border: '1px solid rgba(139,92,246,0.38)',
        boxShadow: '0 0 0 1px rgba(34,211,238,0.07), 0 24px 64px rgba(0,0,0,0.7), 0 0 40px rgba(139,92,246,0.08)',
      }}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm select-none"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.28), rgba(34,211,238,0.16))',
          border: '1px solid rgba(139,92,246,0.32)',
          color: '#a78bfa',
        }}
      >
        ✦
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div
          className="text-sm font-semibold tracking-tight"
          style={{
            background: 'linear-gradient(90deg, #a78bfa 0%, #22d3ee 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Founding Supporter
        </div>
        <div className="text-[11px] text-white/45 mt-0.5 leading-relaxed">
          Thank you for believing in Recline from the start.
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="text-white/25 hover:text-white/55 transition-colors shrink-0 leading-none text-xl mt-0.5"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ── Daily Spark streak toast ──────────────────────────────────────────────────
function SparkStreakToast({
  reward,
  streak,
  onDismiss,
}: {
  reward: number;
  streak: number;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-2xl p-4 max-w-xs"
      style={{
        background: 'linear-gradient(135deg, rgba(13,13,22,0.98) 0%, rgba(26,18,8,0.98) 100%)',
        border: '1px solid rgba(251,191,36,0.28)',
        boxShadow: '0 0 0 1px rgba(251,191,36,0.06), 0 24px 64px rgba(0,0,0,0.7), 0 0 40px rgba(251,191,36,0.06)',
      }}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base select-none"
        style={{
          background: 'linear-gradient(135deg, rgba(251,191,36,0.22), rgba(245,158,11,0.14))',
          border: '1px solid rgba(251,191,36,0.28)',
          color: '#fbbf24',
        }}
      >
        ✦
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div
          className="text-sm font-semibold tracking-tight"
          style={{
            background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          +{reward} Sparks
        </div>
        <div className="text-[11px] text-white/45 mt-0.5 leading-relaxed">
          Day {streak} streak!
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="text-white/25 hover:text-white/55 transition-colors shrink-0 leading-none text-xl mt-0.5"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // server / channel state
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [channelsByServer, setChannelsByServer] = useState<Record<string, Channel[]>>({});
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [membersByServer, setMembersByServer] = useState<Record<string, Member[]>>({});
  const [rolesByServer, setRolesByServer] = useState<Record<string, ServerRole[]>>({});
  const [online, setOnline] = useState<Set<string>>(new Set());
  // FEAT-052: presence statuses. myStatus is this user's pick (persisted server-
  // side); userStatuses tracks peers ('dnd' shows a red dot — 'invisible' peers
  // simply appear offline so they never appear here).
  const [myStatus, setMyStatus] = useState<'online' | 'dnd' | 'invisible'>('online');
  const [userStatuses, setUserStatuses] = useState<Record<string, 'online' | 'dnd'>>({});
  // FEAT-006: feedback modal — state lives here so both the floating button
  // (desktop) and the user menu entry (mobile-safe) can open it.
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // FEAT-052: DND also silences LOCAL desktop notifications (push is suppressed
  // server-side). Synced into the notifications module's gate.
  useEffect(() => {
    setDndActive(myStatus === 'dnd');
  }, [myStatus]);

  // messages per channel (decoded)
  const [channelMsgs, setChannelMsgs] = useState<Record<string, ChannelState>>({});

  // typing: serverId -> channelId -> Set<userId>
  const [typing, setTyping] = useState<Record<string, Record<string, Set<string>>>>({});

  // unread counts per channel
  const [unread, setUnread] = useState<Record<string, number>>({});

  // encryption key readiness per server
  const [keysReady, setKeysReady] = useState<Record<string, boolean>>({});
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);

  // Panel resize widths — persisted to localStorage
  const clampPanel = (v: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 160 && n <= 400 ? n : fallback;
  };
  const [channelListWidth, setChannelListWidth] = useState(() => clampPanel(Number(localStorage.getItem('clw')), 220));
  const [memberListWidth, setMemberListWidth]   = useState(() => clampPanel(Number(localStorage.getItem('mlw')), 240));

  function startPanelResize(e: { clientX: number; preventDefault: () => void }, panel: 'channel' | 'member') {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panel === 'channel' ? channelListWidth : memberListWidth;
    let current = startW;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      // member list grows as you drag LEFT (negative delta)
      current = Math.max(160, Math.min(400, panel === 'channel' ? startW + delta : startW - delta));
      if (panel === 'channel') setChannelListWidth(current);
      else setMemberListWidth(current);
    }
    function onUp() {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(panel === 'channel' ? 'clw' : 'mlw', String(Math.round(current)));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Vanity invite link: code extracted from /invite/<code> URL on load.
  // Persists through the auth flow so the modal fires after login if needed.
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const m = window.location.pathname.match(/^\/invite\/([a-z0-9][a-z0-9-]{0,30}[a-z0-9]|[a-z0-9]{1,32})$/i);
    if (m) {
      // Clean the URL immediately so refreshing doesn't re-trigger the flow
      window.history.replaceState({}, '', '/');
      return m[1].toLowerCase();
    }
    return null;
  });

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<'profile' | 'security' | 'notifications' | 'sparks'>('profile');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // view mode: servers or DMs
  const [view, setView] = useState<'server' | 'dm'>('server');

  // DM state
  const [dms, setDms] = useState<DmChannel[]>([]);
  const [activeDmId, setActiveDmId] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<Record<string, DmMessage[]>>({});
  const [dmMsgLoaded, setDmMsgLoaded] = useState<Record<string, boolean>>({});
  // True once setupDmKeys has placed a key pair in dmKeyPairRef; guards loadDmMessages
  const [dmKeysReady, setDmKeysReady] = useState(false);
  // True when the local ECDH key doesn't match the server's stored key AND no password is
  // available to reconcile (page refresh scenario). DM decryption may be degraded.
  const [dmKeyMismatch, setDmKeyMismatch] = useState(false);
  const [dmSyncPw, setDmSyncPw] = useState('');
  const [dmSyncLoading, setDmSyncLoading] = useState(false);
  const [dmSyncErr, setDmSyncErr] = useState('');
  // True when a backup upload failed during key rotation — signals degraded state to ProfileDialog
  const [dmBackupOutOfSync, setDmBackupOutOfSync] = useState(false);
  const [dmHasMore, setDmHasMore] = useState<Record<string, boolean>>({});
  const [dmUnreadMap, setDmUnreadMap] = useState<Record<string, number>>({});
  // DM calls
  const [dmCall, setDmCall] = useState<DmCallState | null>(null);
  const dmCallRef = useRef<DmCallState | null>(null);
  dmCallRef.current = dmCall;
  const dmCallAutoCancelRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dmCallDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dmListRefreshingRef = useRef(false);
  // DM typing: dmChannelId → true if other person is currently typing
  const [dmTyping, setDmTyping] = useState<Record<string, boolean>>({});
  const dmTypingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // friends list
  const [friends, setFriends] = useState<Friend[]>([]);

  // socket connection state shown in the UI
  const [connectionState, setConnectionState] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');

  // mobile sidebar visibility
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileMembersOpen, setMobileMembersOpen] = useState(false);
  // Profile card — userId of member whose card is open
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  // Set of user IDs the current user has blocked
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  // CRYPTO-004 (TOFU): peer userIds whose DM key changed since first seen, and cached fingerprints
  const [peerKeyChanged, setPeerKeyChanged] = useState<Set<string>>(new Set());
  const [peerFingerprints, setPeerFingerprints] = useState<Record<string, string>>({});
  // CRYPTO-004: own DM public-key fingerprint, shown in settings for out-of-band verification
  const [myFingerprint, setMyFingerprint] = useState<string>('');
  // FEAT-040: notification mutes (scope id sets)
  const [mutedServers, setMutedServers] = useState<Set<string>>(new Set());
  const [mutedChannelIds, setMutedChannelIds] = useState<Set<string>>(new Set());
  // FEAT-020: message search modal
  const [searchOpen, setSearchOpen] = useState(false);

  // ── Spark wallet ───────────────────────────────────────────────────────────
  const [sparksBalance, setSparksBalance] = useState(0);

  // ── Broadcasts ─────────────────────────────────────────────────────────────
  // Queue of incoming broadcast payloads. BroadcastOverlay shows them sequentially.
  const [broadcastQueue, setBroadcastQueue] = useState<BroadcastPayload[]>([]);

  // ── Daily streak ───────────────────────────────────────────────────────────
  const [streakToast, setStreakToast] = useState<{ reward: number; streak: number } | null>(null);
  const [streakInfo, setStreakInfo] = useState<{ currentStreak: number; alreadyClaimedToday: boolean } | null>(null);

  // ── Founding Supporter ─────────────────────────────────────────────────────
  const [isSupporter, setIsSupporter] = useState(false);
  const [showSupporterToast, setShowSupporterToast] = useState(false);
  // Set to true when ?supporter=1 is detected in the URL — triggers polling
  // after auth resolves to confirm via API (ignores the URL param as truth).
  const pendingSupporterCheckRef = useRef(false);
  const supporterPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // call state
  const callManagerRef = useRef<CallManager | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [callPeers, setCallPeers] = useState<PeerSnapshot[]>([]);
  const [inCall, setInCall] = useState(false);
  const [callRoster, setCallRoster] = useState<Record<string, CallPeer[]>>({});

  // mic state lifted here so VoiceBar (shown in text channels) can control it
  // and it persists across channel navigation while a call is active.
  const [micOn, setMicOn] = useState(true);
  const [deafOn, setDeafOn] = useState(false);
  // Per-peer volume: socketId → 0–1. Defaults to 1 (100%) when absent.
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
  // Tracks the previous set of peer socket IDs so onPeers can diff for join/leave sounds.
  const prevPeerSocketIds = useRef<Set<string>>(new Set());

  // browser notification permission (requested once after login)
  const notifPermRef = useRef<NotificationPermission>('default');

  // ECDH DM key pair — generated once, persisted in IndexedDB, held in memory
  const dmKeyPairRef = useRef<CryptoKeyPair | null>(null);
  // Single-flight guard for setupDmKeys — see ensureDmKeys()
  const dmKeySetupPromiseRef = useRef<Promise<void> | null>(null);
  // Password held briefly (login → useEffect tick) for key backup setup, then cleared
  const setupPasswordRef = useRef<string>('');
  // Fresh DM list accessible in socket callbacks without stale-closure issues
  const dmsRef = useRef(dms);
  useEffect(() => { dmsRef.current = dms; }, [dms]);
  // Fresh dmMessages map — keeps M-8 re-decrypt effect and other callbacks
  // from reading stale closure values (same pattern as dmsRef).
  const dmMessagesRef = useRef(dmMessages);
  useEffect(() => { dmMessagesRef.current = dmMessages; }, [dmMessages]);

  const socketRef = useRef<Socket | null>(null);
  // Guard against concurrent unlock attempts (user double-clicking the unlock button)
  const unlockingRef = useRef(false);
  // Tracks DM channels currently being loaded to prevent double-fetch race (#loadDmMessages)
  const dmLoadingRef = useRef<Set<string>>(new Set());
  // Tracks channels with an in-flight loadMoreMessages fetch (REL-001 — prevents duplicate paginated fetches on rapid scroll)
  const loadMoreRef = useRef<Set<string>>(new Set());
  // tracks active typing auto-clear timers so they can be cancelled on stop/unmount
  const typingTimersRef = useRef<Map<string, number>>(new Map());
  // Guard against concurrent createChannel calls (double-click)
  const creatingChannelRef = useRef(false);
  // Guard against concurrent key rotation calls
  const rotatingRef = useRef(false);

  // refs so socket handlers always see fresh state (avoids stale closures
  // because the handlers are bound once when the socket connects).
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const channelsByServerRef = useRef(channelsByServer);
  useEffect(() => {
    channelsByServerRef.current = channelsByServer;
  }, [channelsByServer]);
  const membersByServerRef = useRef(membersByServer);
  useEffect(() => { membersByServerRef.current = membersByServer; }, [membersByServer]);
  const activeChannelIdRef = useRef(activeChannelId);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);
  const activeDmIdRef = useRef(activeDmId);
  useEffect(() => {
    activeDmIdRef.current = activeDmId;
  }, [activeDmId]);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Emit server:focus whenever the active server or view changes.
  // This lets the server know which server (if any) this socket is looking at,
  // enabling future broadcast filtering. Emits null when in DM view.
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    const serverId = view === 'dm' ? null : (activeServerId ?? null);
    s.emit('server:focus', { serverId });
  }, [activeServerId, view]);

  function lookupChannel(channelId: string): Channel | undefined {
    for (const list of Object.values(channelsByServerRef.current)) {
      const c = list.find((c) => c.id === channelId);
      if (c) return c;
    }
    return undefined;
  }

  // FEAT-033: push the read cursor to the server whenever a channel/DM is
  // viewed. Throttled per-target (5 s) — viewing fires from several paths
  // (select, refocus, live message while focused) and the upsert is
  // monotonic server-side, so dropping intermediate writes is harmless.
  const lastReadSentRef = useRef<Record<string, number>>({});
  const persistRead = useCallback((kind: 'channel' | 'dm', id: string) => {
    const key = `${kind}:${id}`;
    const now = Date.now();
    if ((lastReadSentRef.current[key] ?? 0) > now - 5_000) return;
    lastReadSentRef.current[key] = now;
    (kind === 'channel' ? api.markChannelRead(id) : api.markDmRead(id)).catch(() => {
      delete lastReadSentRef.current[key]; // failed — let the next trigger retry
    });
  }, []);

  // FEAT-033: bulk read-cursor actions (declutter unread badges)
  function handleMarkServerRead(serverId: string) {
    const chans = channelsByServerRef.current[serverId] ?? [];
    setUnread((prev) => {
      const next = { ...prev };
      for (const c of chans) delete next[c.id];
      return next;
    });
    api.markServerRead(serverId).catch(() => {});
  }

  function handleMarkAllDmsRead() {
    setDmUnreadMap({});
    api.markAllDmsRead().catch(() => {});
  }

  // FEAT-052: change own presence status. Optimistic — server ack reverts on failure.
  function handleSetStatus(status: 'online' | 'dnd' | 'invisible') {
    const prev = myStatus;
    setMyStatus(status);
    socketRef.current?.emit('status:set', status, (resp: { ok: boolean; error?: string }) => {
      if (!resp?.ok) {
        setMyStatus(prev);
        console.error('[status:set] rejected:', resp?.error);
      }
    });
  }

  // when the tab regains visibility, treat the active channel/DM as read
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      const channelId = activeChannelIdRef.current;
      if (channelId) {
        setUnread((prev) => (prev[channelId] ? { ...prev, [channelId]: 0 } : prev));
        persistRead('channel', channelId);
      }
      const dmId = activeDmIdRef.current;
      if (dmId && viewRef.current === 'dm') {
        setDmUnreadMap((prev) => (prev[dmId] ? { ...prev, [dmId]: 0 } : prev));
        persistRead('dm', dmId);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire 401 → auto-logout so expired/revoked sessions are handled for all API calls (M-2)
  useEffect(() => {
    setUnauthorizedHandler(() => logout());
    return () => setUnauthorizedHandler(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Get more Sparks" link from the spark picker opens ProfileDialog on sparks tab
  useEffect(() => {
    const handler = () => {
      setProfileInitialTab('sparks');
      setProfileOpen(true);
    };
    window.addEventListener('recline:open-sparks', handler);
    return () => window.removeEventListener('recline:open-sparks', handler);
  }, []);

  // Strip ?supporter=1 from URL immediately on mount and flag a pending check.
  // We never trust the URL param itself — the API call is the real gate.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('supporter')) {
      pendingSupporterCheckRef.current = true;
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // After auth resolves: fetch supporter status. If a pending check exists
  // (from ?supporter=1), poll up to 6 times with 2 s gaps to handle the
  // race between Stripe's redirect and the webhook updating the DB.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const { isSupporter: s } = await api.getSupporterStatus();
        if (cancelled) return;
        setIsSupporter(s);
        if (s && pendingSupporterCheckRef.current) {
          pendingSupporterCheckRef.current = false;
          setShowSupporterToast(true);
        } else if (!s && pendingSupporterCheckRef.current && attempts < 6) {
          // Webhook hasn't fired yet — retry
          supporterPollTimerRef.current = setTimeout(poll, 2000);
        } else {
          pendingSupporterCheckRef.current = false;
        }
      } catch { /* non-fatal — supporter status unavailable */ }
    };

    poll();
    return () => {
      cancelled = true;
      if (supporterPollTimerRef.current) clearTimeout(supporterPollTimerRef.current);
    };
  }, [user?.id]);

  /* ------------------------ Auth bootstrap ------------------------ */
  useEffect(() => {
    if (!getToken()) {
      setAuthChecked(true);
      return;
    }
    api
      .me()
      .then((r) => {
        setUser(r.user);
        // Request notification permission once, then subscribe to Web Push (non-blocking)
        requestNotificationPermission().then((granted) => {
          notifPermRef.current = granted ? 'granted' : Notification.permission;
          if (granted) registerPushSubscription();
        });
      })
      .catch(() => {
        setToken(null);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  /* ------------------------ Socket lifecycle ------------------------ */
  useEffect(() => {
    if (!user) return;
    setConnectionState('connecting');
    const s = connectSocket();
    socketRef.current = s;

    const onConnect = () => {
      setConnectionState('connected');
      // Clear stale presence — server will re-emit currently online shared users
      setOnline(new Set());
      // Re-emit current focus so the server has up-to-date state after reconnect
      const serverId = viewRef.current === 'dm' ? null : (activeServerId ?? null);
      s.emit('server:focus', { serverId });
    };
    const onDisconnect = () => {
      setConnectionState('disconnected');
      // The server removes this socket from all callRooms on disconnect.
      // Reset client-side call state immediately so the "in call" banner
      // doesn't persist as a phantom UI after reconnect (#27).
      // leave(false) clears CallManager's internal state without firing onCallEnded
      // (we handle the state resets explicitly here instead).
      callManagerRef.current?.leave(false);
      setInCall(false);
      setMicOn(true);
      setCallPeers([]);
      setLocalStream(null);
      setLocalScreen(null);
      setTyping({});
      setDmTyping({});
    };
    const onReconnectAttempt = () => setConnectionState('connecting');
    // Session expired or invalid — clean up and redirect to login (#22)
    const onConnectError = (err: Error) => {
      if ((err as any).message === 'unauthorized') logout();
    };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.io.on('reconnect_attempt', onReconnectAttempt);
    s.on('connect_error', onConnectError);
    // AUTH-025: handle server-side session revocation (emitted by DELETE /api/auth/sessions
    // and POST /api/auth/me/change-password). Check if OUR token is still valid first —
    // only log out if the server rejects our session with 401.
    const onSessionRevoked = async () => {
      try {
        await api.me(); // succeeds → our session is still valid (a different session was revoked)
      } catch {
        // 401 → our session was revoked — log out immediately
        logout();
      }
    };
    s.on('session:revoked', onSessionRevoked);
    if (s.connected) setConnectionState('connected');

    const onMessage = async (msg: WireMessage) => {
      const channel = lookupChannel(msg.channelId);
      if (!channel) return;
      const key = getCachedKey(channel.server_id);
      let body = '[encrypted]';
      let failed = false;
      if (key) {
        try {
          body = await decryptText(key, msg.ciphertext, msg.nonce);
        } catch {
          body = '[could not decrypt]';
          failed = true;
        }
      } else {
        body = '[locked — unlock server to read]';
        failed = true;
      }
      // Decode the reply preview if present
      let decodedReply: DecodedMessage['decodedReply'] = null;
      if (msg.replyTo && key) {
        try {
          const replyBody = await decryptText(key, msg.replyTo.ciphertext, msg.replyTo.nonce);
          decodedReply = { id: msg.replyTo.id, senderId: msg.replyTo.senderId, senderName: msg.replyTo.senderName, body: replyBody, failed: false };
        } catch {
          decodedReply = { id: msg.replyTo.id, senderId: msg.replyTo.senderId, senderName: msg.replyTo.senderName, body: '[could not decrypt]', failed: true };
        }
      } else if (msg.replyTo) {
        decodedReply = { id: msg.replyTo.id, senderId: msg.replyTo.senderId, senderName: msg.replyTo.senderName, body: '[locked]', failed: true };
      }
      setChannelMsgs((prev) => {
        const existing = prev[msg.channelId] ?? { messages: [], loaded: false };
        if (existing.messages.find((m) => m.id === msg.id)) return prev;
        return {
          ...prev,
          [msg.channelId]: {
            loaded: existing.loaded,
            messages: [...existing.messages, { ...msg, body, failed, decodedReply }],
          },
        };
      });

      // unread bookkeeping: count messages from others when not focused on
      // this channel (or when the window is not in focus).
      const isFocused =
        activeChannelIdRef.current === msg.channelId && document.visibilityState === 'visible';
      if (!isFocused && msg.senderId !== userRef.current?.id) {
        setUnread((prev) => ({ ...prev, [msg.channelId]: (prev[msg.channelId] ?? 0) + 1 }));
      } else if (isFocused) {
        // Viewing the channel as the message lands — advance the server cursor
        // so this message isn't counted as unread after a reload.
        persistRead('channel', msg.channelId);
      }

      // Desktop notification when tab is hidden and message is from someone else.
      // Also fires for mentions even when the tab is not the active channel (but
      // still hidden), using shouldNotify() as the final gate.
      if (msg.senderId !== userRef.current?.id && shouldNotify()) {
        const senderName = (() => {
          for (const members of Object.values(membersByServerRef.current)) {
            const m = members.find((m) => m.id === msg.senderId);
            if (m) return m.displayName;
          }
          return 'Someone';
        })();
        const channelName = lookupChannel(msg.channelId)?.name ?? 'unknown';
        const isMention = !failed && body.includes(`@${userRef.current?.displayName}`);

        if (!isFocused || isMention) {
          showNotification(
            isMention
              ? `Mentioned in #${channelName}`
              : `${senderName} in #${channelName}`,
            `New message in #${channelName}`,
            {
              tag: msg.channelId,
            },
          );
        }
      }
    };

    const onPresence = (data: { userId: string; online: boolean; status?: 'online' | 'dnd' }) => {
      setOnline((prev) => {
        const next = new Set(prev);
        if (data.online) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
      // FEAT-052: track peer statuses so dots can show red for DND. Offline
      // (including invisible peers — broadcast as offline) clears the entry.
      setUserStatuses((prev) => {
        if (data.online && data.status) {
          if (prev[data.userId] === data.status) return prev;
          return { ...prev, [data.userId]: data.status };
        }
        if (!data.online && prev[data.userId]) {
          const next = { ...prev };
          delete next[data.userId];
          return next;
        }
        return prev;
      });
    };

    // FEAT-052: own persisted status (sent on connect + whenever any of this
    // user's tabs/devices changes it).
    const onStatusSelf = (data: { status: 'online' | 'dnd' | 'invisible' }) => {
      setMyStatus(data.status);
    };

    const onTypingStart = (data: { channelId: string; userId: string }) => {
      const channel = lookupChannel(data.channelId);
      if (!channel || data.userId === user.id) return;
      setTyping((prev) => {
        const srvMap = { ...(prev[channel.server_id] ?? {}) };
        const set = new Set(srvMap[data.channelId] ?? []);
        set.add(data.userId);
        srvMap[data.channelId] = set;
        return { ...prev, [channel.server_id]: srvMap };
      });
      // cancel any existing timer for this user+channel before arming a new one
      const timerKey = `${data.channelId}:${data.userId}`;
      const existing = typingTimersRef.current.get(timerKey);
      if (existing) window.clearTimeout(existing);
      const tid = window.setTimeout(() => {
        typingTimersRef.current.delete(timerKey);
        setTyping((prev) => {
          const srvMap = { ...(prev[channel.server_id] ?? {}) };
          const set = new Set(srvMap[data.channelId] ?? []);
          set.delete(data.userId);
          srvMap[data.channelId] = set;
          return { ...prev, [channel.server_id]: srvMap };
        });
      }, 4000);
      typingTimersRef.current.set(timerKey, tid);
    };
    const onTypingStop = (data: { channelId: string; userId: string }) => {
      const channel = lookupChannel(data.channelId);
      if (!channel) return;
      setTyping((prev) => {
        const srvMap = { ...(prev[channel.server_id] ?? {}) };
        const set = new Set(srvMap[data.channelId] ?? []);
        set.delete(data.userId);
        srvMap[data.channelId] = set;
        return { ...prev, [channel.server_id]: srvMap };
      });
    };
    const onVoiceActivity = (data: { channelId: string; userIds: string[] }) => {
      setCallRoster((prev) => ({
        ...prev,
        [data.channelId]: data.userIds.map((userId) => ({ userId })),
      }));
    };

    const onReactionUpdate = (data: {
      messageId: string;
      channelId: string;
      counts: { emoji: string; count: number; userIds: string[] }[];
    }) => {
      setChannelMsgs((prev) => {
        const state = prev[data.channelId];
        if (!state) return prev;
        return {
          ...prev,
          [data.channelId]: {
            ...state,
            messages: state.messages.map((m) =>
              m.id === data.messageId ? { ...m, reactions: data.counts } : m,
            ),
          },
        };
      });
    };

    const onMessageEdited = async (data: {
      id: string;
      channelId: string;
      ciphertext: string;
      nonce: string;
      editedAt: number;
    }) => {
      const channel = lookupChannel(data.channelId);
      if (!channel) return;
      const key = getCachedKey(channel.server_id);
      let body = '[encrypted]';
      let failed = false;
      if (key) {
        try { body = await decryptText(key, data.ciphertext, data.nonce); }
        catch { body = '[could not decrypt]'; failed = true; }
      } else {
        body = '[locked — unlock server to read]';
        failed = true;
      }
      setChannelMsgs((prev) => {
        const state = prev[data.channelId];
        if (!state) return prev;
        return {
          ...prev,
          [data.channelId]: {
            ...state,
            messages: state.messages.map((m) =>
              m.id === data.id
                ? { ...m, ciphertext: data.ciphertext, nonce: data.nonce, body, failed, editedAt: data.editedAt }
                : m,
            ),
          },
        };
      });
    };

    const onChannelDeleted = (data: { serverId: string; channelId: string }) => {
      setChannelsByServer((prev) => {
        const list = prev[data.serverId];
        if (!list) return prev;
        return { ...prev, [data.serverId]: list.filter((c) => c.id !== data.channelId) };
      });
      setActiveChannelId((prev) => (prev === data.channelId ? null : prev));
    };

    const onChannelUpdated = (data: { channelId: string; topic: string | null }) => {
      setChannelsByServer((prev) => {
        const updated = { ...prev };
        for (const [sid, list] of Object.entries(updated)) {
          if (list.some((c) => c.id === data.channelId)) {
            updated[sid] = list.map((c) =>
              c.id === data.channelId ? { ...c, topic: data.topic } : c,
            );
          }
        }
        return updated;
      });
    };

    const onInviteUpdated = (data: { serverId: string; inviteCode: string }) => {
      setServers((prev) =>
        prev.map((s) => (s.id === data.serverId ? { ...s, invite_code: data.inviteCode } : s)),
      );
    };

    const onMemberJoined = (data: { serverId: string; member: Member }) => {
      setMembersByServer((prev) => {
        const existing = prev[data.serverId] ?? [];
        if (existing.find((m) => m.id === data.member.id)) return prev;
        return { ...prev, [data.serverId]: [...existing, data.member] };
      });
    };

    const onUserUpdated = (data: { id: string; displayName: string; avatarUrl?: string | null }) => {
      setMembersByServer((prev) => {
        const next: Record<string, Member[]> = {};
        let changed = false;
        for (const [serverId, members] of Object.entries(prev)) {
          let touched = false;
          const updated = members.map((m) => {
            if (m.id === data.id) {
              touched = true;
              changed = true;
              return { ...m, displayName: data.displayName, avatarUrl: data.avatarUrl ?? m.avatarUrl };
            }
            return m;
          });
          next[serverId] = touched ? updated : members;
        }
        return changed ? next : prev;
      });
      if (data.id === user.id) {
        setUser((u) => (u ? { ...u, displayName: data.displayName } : u));
      }
    };

    const onFriendshipAccepted = (data: { id: string; userId: string; username: string; displayName: string; avatarUrl: string | null }) => {
      setFriends((prev) => {
        const found = prev.find((f) => f.id === data.id);
        if (found) {
          return prev.map((f) => f.id === data.id ? { ...f, status: 'accepted' as const } : f);
        }
        // Not in state yet (edge case) — add it
        return [...prev, {
          id: data.id,
          status: 'accepted' as const,
          direction: 'outgoing' as const,
          userId: data.userId,
          username: data.username,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        }];
      });
    };

    const onMessageDeleted = (data: { id: string; channelId: string }) => {
      setChannelMsgs((prev) => {
        const st = prev[data.channelId];
        if (!st) return prev;
        return {
          ...prev,
          [data.channelId]: {
            loaded: st.loaded,
            messages: st.messages.filter((m) => m.id !== data.id),
          },
        };
      });
      // Do NOT decrement unread on delete — we can't tell if the deleted message
      // was read or unread, and under-counting is more harmful than over-counting.
    };

    // Server renamed
    const onServerUpdated = (data: { serverId: string; name: string }) => {
      setServers((prev) => prev.map((s) => s.id === data.serverId ? { ...s, name: data.name } : s));
    };

    // Server passphrase changed — invalidate the cached key for this server
    const onServerPassphraseChanged = (data: { serverId: string }) => {
      clearKey(data.serverId);
      setKeysReady((prev) => { const n = { ...prev }; delete n[data.serverId]; return n; });
      setChannelMsgs((prev) => {
        // Mark all messages in this server as locked
        const channels = channelsByServerRef.current[data.serverId] ?? [];
        const updates: Record<string, ChannelState> = {};
        for (const ch of channels) {
          const st = prev[ch.id];
          if (st) {
            updates[ch.id] = {
              loaded: false,
              messages: st.messages.map((m) => ({ ...m, body: '[passphrase changed — unlock to read]', failed: true })),
            };
          }
        }
        return Object.keys(updates).length ? { ...prev, ...updates } : prev;
      });
    };

    // DM message received
    const onDmMessageNew = async (wire: DmWireMessage) => {
      // Find the DM channel for key lookup + display name
      let dmChannel: DmChannel | undefined = dmsRef.current.find((d) => d.id === wire.dmChannelId);

      // Unknown channel — this is a new DM conversation (sender opened a channel we haven't
      // loaded yet). Refresh the full DM list so the conversation appears in the sidebar
      // and we have the otherPublicKey needed to decrypt the message.
      if (!dmChannel) {
        if (!dmListRefreshingRef.current) {
          dmListRefreshingRef.current = true;
          try {
            const { dms: fresh } = await api.listDms();
            // Sync ref immediately so we can decrypt in this callback without waiting for a re-render.
            dmsRef.current = fresh;
            setDms(fresh);
            dmChannel = fresh.find((d) => d.id === wire.dmChannelId);
          } catch { /* non-fatal — fall back to empty body below */ }
          finally { dmListRefreshingRef.current = false; }
        } else {
          // Another refresh is in flight — wait a moment then check dmsRef
          await new Promise((r) => setTimeout(r, 300));
          dmChannel = dmsRef.current.find((d) => d.id === wire.dmChannelId);
        }
      }

      // Decrypt — tryDecryptDm falls back through archived historical keys on failure
      let decoded: DmMessage;
      if (wire.ciphertext && wire.nonce && dmChannel) {
        try {
          const body = await tryDecryptDm(wire.ciphertext, wire.nonce, dmChannel, wire.senderEcdhPublicKey);
          decoded = { ...wire, body, failed: false };
        } catch {
          decoded = { ...wire, body: '[could not decrypt]', failed: true };
        }
      } else {
        // Legacy plaintext message or unknown channel — not E2E encrypted
        const isLegacyPlaintext = !wire.ciphertext && wire.body != null;
        decoded = { ...wire, body: wire.body ?? '[message from unknown conversation]', failed: !isLegacyPlaintext, isPlaintext: isLegacyPlaintext };
      }

      // Attach reply preview if this message is a reply
      if (wire.replyToId && dmChannel) {
        const existing = dmMessagesRef.current[wire.dmChannelId] ?? [];
        const target = existing.find((m) => m.id === wire.replyToId);
        if (target) {
          const senderName = target.senderId === dmChannel.otherUserId ? dmChannel.otherDisplayName : (user?.displayName ?? 'You');
          decoded = { ...decoded, decodedReply: { id: target.id, senderId: target.senderId, senderName, body: target.body, failed: target.failed } };
        } else {
          decoded = { ...decoded, decodedReply: null };
        }
      }

      setDmMessages((prev) => {
        const existing = prev[decoded.dmChannelId] ?? [];
        if (existing.find((m) => m.id === decoded.id)) return prev;
        return { ...prev, [decoded.dmChannelId]: [...existing, decoded] };
      });
      // Update last message timestamp in DM list (channel is already in state from refresh above)
      setDms((prev) => prev.map((d) =>
        d.id === decoded.dmChannelId ? { ...d, lastMessageAt: decoded.createdAt } : d
      ));
      // Unread badge + browser notification when not focused on this DM
      if (decoded.senderId !== userRef.current?.id) {
        const isFocused = activeDmIdRef.current === decoded.dmChannelId && viewRef.current === 'dm' && document.visibilityState === 'visible';
        if (isFocused) {
          // Viewing the DM as the message lands — advance the server cursor.
          persistRead('dm', decoded.dmChannelId);
        }
        if (!isFocused) {
          setDmUnreadMap((prev) => ({ ...prev, [decoded.dmChannelId]: (prev[decoded.dmChannelId] ?? 0) + 1 }));
          // Desktop notification
          showNotification(
            `New message from ${dmChannel?.otherDisplayName ?? 'Someone'}`,
            'New message',
            { tag: `dm:${decoded.dmChannelId}` },
          );
        }
      }
    };

    // DM message deleted
    const onDmMessageDeleted = (data: { id: string; dmChannelId: string }) => {
      setDmMessages((prev) => {
        const msgs = prev[data.dmChannelId];
        if (!msgs) return prev;
        return { ...prev, [data.dmChannelId]: msgs.filter((m) => m.id !== data.id) };
      });
    };

    // DM chat cleared — server only deletes the sender's own messages; preserve peer messages in state
    const onDmCleared = (data: { dmChannelId: string }) => {
      const myId = userRef.current?.id;
      setDmMessages((prev) => {
        const msgs = prev[data.dmChannelId] ?? [];
        // Filter out only the messages sent by the current user; peer messages survive on the server
        const remaining = myId ? msgs.filter((m) => m.senderId !== myId) : msgs;
        return { ...prev, [data.dmChannelId]: remaining };
      });
    };

    // Kicked from a server — remove it from state and eject silently (#17/#18)
    const onMemberKicked = (data: { serverId: string }) => {
      const sid = data.serverId;
      clearKey(sid);
      setServers((prev) => prev.filter((s) => s.id !== sid));
      setChannelsByServer((prev) => { const n = { ...prev }; delete n[sid]; return n; });
      setMembersByServer((prev) => { const n = { ...prev }; delete n[sid]; return n; });
      setRolesByServer((prev) => { const n = { ...prev }; delete n[sid]; return n; });
      setActiveServerId((cur) => cur === sid ? null : cur);
    };

    // Server was deleted by the owner
    const onServerDeleted = (data: { serverId: string }) => {
      onMemberKicked(data); // same cleanup
    };

    const onRoleCreated = (data: { serverId: string; role: ServerRole }) => {
      setRolesByServer((prev) => ({
        ...prev,
        [data.serverId]: [...(prev[data.serverId] ?? []), data.role],
      }));
    };
    const onRoleUpdated = (data: { serverId: string; role: Partial<ServerRole> & { id: string } }) => {
      setRolesByServer((prev) => ({
        ...prev,
        [data.serverId]: (prev[data.serverId] ?? []).map((r) =>
          r.id === data.role.id ? { ...r, ...data.role } : r,
        ),
      }));
    };
    const onRoleDeleted = (data: { serverId: string; roleId: string }) => {
      setRolesByServer((prev) => ({
        ...prev,
        [data.serverId]: (prev[data.serverId] ?? []).filter((r) => r.id !== data.roleId),
      }));
    };
    const onMemberRolesUpdated = (data: { serverId: string; userId: string }) => {
      // Re-fetch roles and member list so role badges on each row stay in sync
      api.listRoles(data.serverId).then((r) => {
        setRolesByServer((prev) => ({ ...prev, [data.serverId]: r.roles }));
      }).catch(() => {});
      api.listMembers(data.serverId).then((r) => {
        const normalized = r.members.map((m) => ({
          id: m.id,
          username: m.username,
          displayName: m.displayName,
          role: m.role,
          joinedAt: m.joinedAt,
          roles: m.roles ?? [],
        }));
        setMembersByServer((prev) => ({ ...prev, [data.serverId]: normalized }));
      }).catch(() => {});
    };

    // friendship:incoming — server sends the requester's user ID as `id`
    const onFriendshipIncoming = (data: { id: string; displayName: string; avatarUrl?: string | null }) => {
      setFriends(prev => {
        // data.id is the requester's userId — deduplicate by userId
        if (prev.some(f => f.userId === data.id)) return prev;
        return [...prev, {
          id: `incoming:${data.id}`, // placeholder row ID until a full refresh
          status: 'pending' as const,
          direction: 'incoming' as const,
          userId: data.id,
          username: data.displayName, // username not sent; use displayName as fallback
          displayName: data.displayName,
          avatarUrl: data.avatarUrl ?? null,
        }];
      });
    };

    s.on('message:new', onMessage);
    s.on('presence:update', onPresence);
    s.on('status:self', onStatusSelf);
    s.on('typing:start', onTypingStart);
    s.on('typing:stop', onTypingStop);
    s.on('voice:activity', onVoiceActivity);
    s.on('member:joined', onMemberJoined);
    s.on('user:updated', onUserUpdated);
    s.on('friendship:accepted', onFriendshipAccepted);
    s.on('friendship:incoming', onFriendshipIncoming);
    s.on('message:deleted', onMessageDeleted);
    s.on('member:kicked', onMemberKicked);
    s.on('server:deleted', onServerDeleted);
    s.on('server:updated', onServerUpdated);
    s.on('server:passphrase_changed', onServerPassphraseChanged);
    s.on('dm:message:new', onDmMessageNew);
    s.on('dm:message:deleted', onDmMessageDeleted);
    s.on('dm:cleared', onDmCleared);
    s.on('reaction:update', onReactionUpdate);

    // ── DM typing ──────────────────────────────────────────────────────────
    const onDmTypingStart = (data: { dmChannelId: string; userId: string }) => {
      if (data.userId === user.id) return;
      setDmTyping((prev) => ({ ...prev, [data.dmChannelId]: true }));
      // Auto-clear after 4s in case stop event is missed
      if (dmTypingTimers.current[data.dmChannelId]) clearTimeout(dmTypingTimers.current[data.dmChannelId]);
      dmTypingTimers.current[data.dmChannelId] = setTimeout(() => {
        setDmTyping((prev) => { const n = { ...prev }; delete n[data.dmChannelId]; return n; });
      }, 4000);
    };
    const onDmTypingStop = (data: { dmChannelId: string; userId: string }) => {
      if (data.userId === user.id) return;
      if (dmTypingTimers.current[data.dmChannelId]) clearTimeout(dmTypingTimers.current[data.dmChannelId]);
      setDmTyping((prev) => { const n = { ...prev }; delete n[data.dmChannelId]; return n; });
    };
    s.on('dm:typing:start', onDmTypingStart);
    s.on('dm:typing:stop', onDmTypingStop);

    // ── DM reactions ───────────────────────────────────────────────────────
    const onDmReactionUpdate = (data: {
      dmMessageId: string; dmChannelId: string;
      emoji: string; userId: string; action: 'add' | 'remove';
      counts: { emoji: string; count: number; userIds: string[] }[];
    }) => {
      setDmMessages((prev) => {
        const msgs = prev[data.dmChannelId];
        if (!msgs) return prev;
        return {
          ...prev,
          [data.dmChannelId]: msgs.map((m) =>
            m.id === data.dmMessageId ? { ...m, reactions: data.counts } : m
          ),
        };
      });
    };
    s.on('dm:reaction:update', onDmReactionUpdate);

    // ── DM message edited ──────────────────────────────────────────────────
    const onDmMessageEdited = async (data: { id: string; dmChannelId: string; ciphertext: string; nonce: string; editedAt: number }) => {
      // Find the DM channel for key lookup
      const dmChannel = dmsRef.current.find((d) => d.id === data.dmChannelId);
      let newBody = '[could not decrypt]';
      let failed = true;
      if (dmChannel && data.ciphertext && data.nonce) {
        try {
          newBody = await tryDecryptDm(data.ciphertext, data.nonce, dmChannel, null);
          failed = false;
        } catch { /* keep defaults */ }
      }
      setDmMessages((prev) => {
        const msgs = prev[data.dmChannelId];
        if (!msgs) return prev;
        return {
          ...prev,
          [data.dmChannelId]: msgs.map((m) =>
            m.id === data.id
              ? { ...m, ciphertext: data.ciphertext, nonce: data.nonce, body: newBody, editedAt: data.editedAt, failed }
              : m
          ),
        };
      });
    };
    s.on('dm:message:edited', onDmMessageEdited);

    // ── DM call signaling ──────────────────────────────────────────────────
    const onDmCallIncoming = (data: { dmChannelId: string; callerUserId: string; callerName: string; callerAvatarUrl: string | null; hasVideo: boolean }) => {
      // Don't overwrite an already-active call
      if (dmCallRef.current) return;
      setDmCall({
        dmChannelId: data.dmChannelId,
        peerUserId: data.callerUserId,
        peerName: data.callerName,
        peerAvatarUrl: data.callerAvatarUrl,
        status: 'incoming-ringing',
        hasVideo: data.hasVideo,
        isMuted: false,
        isVideoOff: false,
        localStream: null,
        localScreenStream: null,
        isScreenSharing: false,
        peerStream: null,
        peerScreenStream: null,
        pc: null,
        startedAt: null,
        peerVolume: 1,
      });
    };

    // BL-002 fix: dm:call:accepted is sent to BOTH caller and callee.
    // Both sides build RTCPeerConnection here with proper ICE servers.
    // Caller (outgoing-ringing) creates offer; callee (connecting, no pc yet) awaits offer.
    const onDmCallAccepted = (data: { dmChannelId: string; iceServers: RTCIceServer[] }) => {
      const call = dmCallRef.current;
      if (!call || call.dmChannelId !== data.dmChannelId) return;

      if (call.status === 'outgoing-ringing') {
        // Caller path: create PC with ICE servers, send offer.
        // offerToReceiveVideo is always true so the SDP always includes a video
        // m-line — even if the caller has audio-only, the callee may have enabled
        // their camera and needs somewhere to send it.
        const pc = buildDmPeerConnection(data.iceServers, data.dmChannelId, call.localStream);
        pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => { s.emit('dm:call:offer', { dmChannelId: data.dmChannelId, sdp: pc.localDescription! }); })
          .catch(console.error);
        setDmCall((prev) => prev ? { ...prev, status: 'connecting', pc } : prev);
      } else if (call.status === 'connecting' && !call.pc) {
        // Callee path: create PC with ICE servers, wait for offer from caller
        const pc = buildDmPeerConnection(data.iceServers, data.dmChannelId, call.localStream);
        setDmCall((prev) => prev ? { ...prev, pc } : prev);
        dmCallRef.current = { ...dmCallRef.current!, pc };
      }
    };

    const onDmCallRejected = (data: { dmChannelId: string }) => {
      if (dmCallRef.current?.dmChannelId === data.dmChannelId) teardownDmCall();
    };

    const onDmCallEnded = (data: { dmChannelId: string }) => {
      if (dmCallRef.current?.dmChannelId === data.dmChannelId) teardownDmCall();
    };

    const onDmCallOffer = async (data: { dmChannelId: string; sdp: RTCSessionDescriptionInit }) => {
      const call = dmCallRef.current;
      if (!call || call.dmChannelId !== data.dmChannelId) return;
      if (!call.pc) return;
      // Accept offers during initial SDP exchange (connecting) AND renegotiation (active — screen share)
      if (call.status !== 'connecting' && call.status !== 'active') return;
      const pc = call.pc;
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      // Drain pending ICE candidates
      const pending = call._pendingCandidates ?? [];
      call._pendingCandidates = [];
      for (const c of pending) {
        try { await pc.addIceCandidate(c); } catch { /* non-fatal */ }
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      s.emit('dm:call:answer', { dmChannelId: data.dmChannelId, sdp: pc.localDescription! });
    };

    const onDmCallAnswer = async (data: { dmChannelId: string; sdp: RTCSessionDescriptionInit }) => {
      const call = dmCallRef.current;
      if (!call || call.dmChannelId !== data.dmChannelId || !call.pc) return;
      await call.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      // Drain pending ICE candidates
      const pending = call._pendingCandidates ?? [];
      call._pendingCandidates = [];
      for (const c of pending) {
        try { await call.pc.addIceCandidate(c); } catch { /* non-fatal */ }
      }
    };

    const onDmCallIce = async (data: { dmChannelId: string; candidate: RTCIceCandidateInit }) => {
      const call = dmCallRef.current;
      if (!call || call.dmChannelId !== data.dmChannelId) return;
      try {
        if (call.pc?.remoteDescription) {
          await call.pc.addIceCandidate(data.candidate);
        } else if (call.pc) {
          // Queue until remote description is set
          call._pendingCandidates = [...(call._pendingCandidates ?? []), data.candidate];
        }
      } catch { /* non-fatal */ }
    };

    s.on('dm:call:incoming', onDmCallIncoming);
    s.on('dm:call:accepted', onDmCallAccepted);
    s.on('dm:call:rejected', onDmCallRejected);
    s.on('dm:call:ended', onDmCallEnded);
    s.on('dm:call:offer', onDmCallOffer);
    s.on('dm:call:answer', onDmCallAnswer);
    s.on('dm:call:ice', onDmCallIce);
    s.on('message:edited', onMessageEdited);
    s.on('channel:deleted', onChannelDeleted);
    s.on('channel:updated', onChannelUpdated);
    s.on('invite:updated', onInviteUpdated);
    // sparks:balance — server pushes updated balance after credits/deductions
    const onSparksBalance = (data: { balance: number }) => {
      if (typeof data?.balance === 'number') setSparksBalance(data.balance);
    };
    // sparks:update — alias emitted by some server paths
    const onSparksUpdate = (data: { balance: number }) => {
      if (typeof data?.balance === 'number') setSparksBalance(data.balance);
    };

    // message:sparked — update totalSparks on the message so the gold badge updates in real time
    const onMessageSparked = (data: { messageId: string; channelId: string; totalSparks: number }) => {
      setChannelMsgs((prev) => {
        const state = prev[data.channelId];
        if (!state) return prev;
        return {
          ...prev,
          [data.channelId]: {
            ...state,
            messages: state.messages.map((m) =>
              m.id === data.messageId ? { ...m, totalSparks: data.totalSparks } : m,
            ),
          },
        };
      });
    };

    // server:broadcast — enqueue for sequential display via BroadcastOverlay
    const onServerBroadcast = (payload: BroadcastPayload) => {
      // Only show if we are currently viewing this server
      // The server already filters by socketFocus, but guard here for safety
      setBroadcastQueue((prev) => [...prev, payload].slice(-10));
    };

    s.on('role:created', onRoleCreated);
    s.on('role:updated', onRoleUpdated);
    s.on('role:deleted', onRoleDeleted);
    s.on('member:roles_updated', onMemberRolesUpdated);
    s.on('sparks:balance', onSparksBalance);
    s.on('sparks:update', onSparksUpdate);
    s.on('server:broadcast', onServerBroadcast);
    s.on('message:sparked', onMessageSparked);

    callManagerRef.current = new CallManager(s, {
      onPeers: (peers) => {
        const nextIds = new Set(peers.map((p) => p.socketId));
        for (const id of nextIds) {
          if (!prevPeerSocketIds.current.has(id)) playCallSound('join_call');
        }
        for (const id of prevPeerSocketIds.current) {
          if (!nextIds.has(id)) playCallSound('leave_call');
        }
        prevPeerSocketIds.current = nextIds;
        setCallPeers(peers);
      },
      onLocalStream: setLocalStream,
      onLocalScreen: setLocalScreen,
      onCallEnded: () => { setInCall(false); setMicOn(true); }, // #9
    });

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.io.off('reconnect_attempt', onReconnectAttempt);
      s.off('connect_error', onConnectError);
      s.off('session:revoked', onSessionRevoked);
      s.off('message:new', onMessage);
      s.off('presence:update', onPresence);
      s.off('status:self', onStatusSelf);
      s.off('typing:start', onTypingStart);
      s.off('typing:stop', onTypingStop);
      s.off('voice:activity', onVoiceActivity);
      s.off('member:joined', onMemberJoined);
      s.off('user:updated', onUserUpdated);
      s.off('friendship:accepted', onFriendshipAccepted);
      s.off('friendship:incoming', onFriendshipIncoming);
      s.off('message:deleted', onMessageDeleted);
      s.off('member:kicked', onMemberKicked);
      s.off('server:deleted', onServerDeleted);
      s.off('server:updated', onServerUpdated);
      s.off('server:passphrase_changed', onServerPassphraseChanged);
      s.off('dm:message:new', onDmMessageNew);
      s.off('dm:message:deleted', onDmMessageDeleted);
      s.off('dm:cleared', onDmCleared);
      s.off('reaction:update', onReactionUpdate);
      s.off('dm:typing:start', onDmTypingStart);
      s.off('dm:typing:stop', onDmTypingStop);
      s.off('dm:reaction:update', onDmReactionUpdate);
      s.off('dm:message:edited', onDmMessageEdited);
      s.off('dm:call:incoming', onDmCallIncoming);
      s.off('dm:call:accepted', onDmCallAccepted);
      s.off('dm:call:rejected', onDmCallRejected);
      s.off('dm:call:ended', onDmCallEnded);
      s.off('dm:call:offer', onDmCallOffer);
      s.off('dm:call:answer', onDmCallAnswer);
      s.off('dm:call:ice', onDmCallIce);
      s.off('message:edited', onMessageEdited);
      s.off('channel:deleted', onChannelDeleted);
      s.off('channel:updated', onChannelUpdated);
      s.off('invite:updated', onInviteUpdated);
      s.off('role:created', onRoleCreated);
      s.off('role:updated', onRoleUpdated);
      s.off('role:deleted', onRoleDeleted);
      s.off('member:roles_updated', onMemberRolesUpdated);
      s.off('sparks:balance', onSparksBalance);
      s.off('sparks:update', onSparksUpdate);
      s.off('server:broadcast', onServerBroadcast);
      s.off('message:sparked', onMessageSparked);
      callManagerRef.current?.destroy();
      callManagerRef.current = null;
      disconnectSocket();
      // clear all pending typing timers so stale state updates don't fire after unmount
      for (const tid of typingTimersRef.current.values()) window.clearTimeout(tid);
      typingTimersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ------------------------ Initial server fetch + key restore ------------------------ */
  useEffect(() => {
    if (!user) return;
    api.listServers().then(async (r) => {
      // Map ServerPayload (optional snake+camel fields) → ServerSummary (required snake_case)
      const summaries: ServerSummary[] = r.servers.map((s) => ({
        id: s.id,
        name: s.name,
        invite_code: s.invite_code ?? s.inviteCode ?? '',
        owner_id: s.owner_id ?? s.ownerId ?? '',
        role: s.role,
        created_at: s.created_at ?? s.createdAt ?? Date.now(),
        kdf_salt: s.kdf_salt ?? s.kdfSalt ?? null,
        icon_url: s.icon_url ?? null,
        sort_position: s.sort_position ?? 0,
      }));
      setServers(summaries);
      if (summaries.length && !activeServerId) setActiveServerId(summaries[0].id);
      // Restore AES keys from sessionStorage — users won't be re-prompted on page reload
      const restored: Record<string, boolean> = {};
      for (const srv of summaries) {
        const cached = getCachedKey(srv.id);
        if (cached) { restored[srv.id] = true; continue; }
        const key = await importKeyFromSession(srv.id);
        if (key) {
          cacheKey(srv.id, key);
          restored[srv.id] = true;
        }
      }
      if (Object.keys(restored).length > 0) {
        setKeysReady((prev) => ({ ...prev, ...restored }));
      }
    });
    // Init ECDH DM key pair — restore from IndexedDB, server backup, or generate fresh.
    // Failures are logged loudly and retried once: a silently-swallowed rejection
    // here used to leave dmKeyPairRef null forever (= every DM send failing).
    const _setupPw = setupPasswordRef.current;
    setupPasswordRef.current = ''; // clear immediately — password must not linger
    ensureDmKeys(_setupPw).catch((err) => {
      console.error('[setupDmKeys] failed — retrying once in 2s:', err);
      setTimeout(() => {
        ensureDmKeys('').catch((err2) =>
          console.error('[setupDmKeys] retry failed — DM encryption unavailable this session:', err2));
      }, 2_000);
    });

    // Pre-fetch DMs
    api.listDms().then((r) => setDms(r.dms)).catch(() => {});
    // Pre-fetch friends list
    api.listFriends().then((r) => setFriends(r.friends)).catch(() => {});
    // Pre-fetch blocked-user list so block state is reflected across the UI
    api.listBlocked().then((r) => setBlockedUserIds(new Set(r.blocks.map((b) => b.id)))).catch(() => {});
    // Seed unread badges from the server-side read cursors (FEAT-033) so
    // unread state survives reloads and device switches. Live increments
    // after this point stay socket-driven (message:new handlers).
    api.getUnread().then((r) => {
      setUnread((prev) => ({ ...r.channels, ...prev }));
      setDmUnreadMap((prev) => ({ ...r.dms, ...prev }));
    }).catch(() => {});
    // Pre-fetch notification mutes (FEAT-040)
    api.getMutes().then((r) => {
      const servers = new Set<string>();
      const channels = new Set<string>();
      for (const m of r.mutes) { if (m.scopeType === 'server') servers.add(m.scopeId); else channels.add(m.scopeId); }
      setMutedServers(servers);
      setMutedChannelIds(channels);
    }).catch(() => {});
    // Pre-fetch spark balance
    api.sparks.balance().then((r) => setSparksBalance(r.balance)).catch(() => {});
    // Claim daily streak — fires once per session on load; server enforces 24 h gate
    api.sparks.claimDaily().then((r) => {
      if (!r.alreadyClaimed && r.reward > 0) {
        setStreakToast({ reward: r.reward, streak: r.newStreak });
        // Refresh balance so it reflects the credit immediately
        api.sparks.balance().then((b) => setSparksBalance(b.balance)).catch(() => {});
      }
      setStreakInfo({ currentStreak: r.newStreak, alreadyClaimedToday: true });
    }).catch(() => {
      // Non-fatal — fetch streak info for display even if claim fails
      api.sparks.streak().then((r) => setStreakInfo({
        currentStreak: r.currentStreak,
        alreadyClaimedToday: r.alreadyClaimedToday,
      })).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ------------------------ Active server load ------------------------ */
  useEffect(() => {
    if (!activeServerId) return;
    if (!channelsByServer[activeServerId]) {
      api.listChannels(activeServerId).then((r) => {
        setChannelsByServer((prev) => ({ ...prev, [activeServerId]: r.channels }));
        setActiveChannelId(null);
      }).catch((err) => console.error('[channels] Failed to load:', err));
    } else {
      // Switching to a server we've already loaded: go back to server home
      // unless the current channel already belongs to this server (mid-nav)
      const list = channelsByServer[activeServerId];
      const channelBelongs = activeChannelId && list.find((c) => c.id === activeChannelId);
      if (!channelBelongs) setActiveChannelId(null);
    }
    if (!membersByServer[activeServerId]) {
      api.listMembers(activeServerId).then((r) => {
        setMembersByServer((prev) => ({ ...prev, [activeServerId]: r.members }));
      }).catch((err) => console.error('[members] Failed to load:', err));
    }
    if (!rolesByServer[activeServerId]) {
      api.listRoles(activeServerId).then((r) => {
        setRolesByServer((prev) => ({ ...prev, [activeServerId]: r.roles }));
      }).catch(() => {});
    }
    if (!keysReady[activeServerId]) {
      if (getCachedKey(activeServerId)) {
        // Key is already cached (entered in a previous render/session restore)
        // but keysReady wasn't set — sync it now so encrypted=true and the
        // full UI (reactions, ✦ spark button, reply) renders correctly.
        setKeysReady((prev) => ({ ...prev, [activeServerId]: true }));
      } else {
        setUnlockTarget(activeServerId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId]);

  /* ------------------------ Active channel: fetch + decrypt history ------------------------ */
  useEffect(() => {
    if (!activeServerId || !activeChannelId) return;
    const ch = (channelsByServer[activeServerId] ?? []).find((c) => c.id === activeChannelId);
    if (!ch || ch.type !== 'text') return;
    if (channelMsgs[activeChannelId]?.loaded) return;
    const key = getCachedKey(activeServerId);
    // REL-002: cancellation flag so a slow response that resolves after the user
    // switched channels does not write stale data.
    let cancelled = false;
    api.listMessages(activeChannelId, MSG_PAGE).then(async (r) => {
      const decoded: DecodedMessage[] = [];
      for (const m of r.messages as WireMessage[]) {
        let body = '[locked]';
        let failed = true;
        if (key) {
          try {
            body = await decryptText(key, m.ciphertext, m.nonce);
            failed = false;
          } catch {
            body = '[could not decrypt]';
          }
        }
        // Decode reply preview
        let decodedReply: DecodedMessage['decodedReply'] = null;
        if (m.replyTo && key) {
          try {
            const replyBody = await decryptText(key, m.replyTo.ciphertext, m.replyTo.nonce);
            decodedReply = { id: m.replyTo.id, senderId: m.replyTo.senderId, senderName: m.replyTo.senderName, body: replyBody, failed: false };
          } catch {
            decodedReply = { id: m.replyTo.id, senderId: m.replyTo.senderId, senderName: m.replyTo.senderName, body: '[could not decrypt]', failed: true };
          }
        } else if (m.replyTo) {
          decodedReply = { id: m.replyTo.id, senderId: m.replyTo.senderId, senderName: m.replyTo.senderName, body: '[locked]', failed: true };
        }
        decoded.push({ ...m, body, failed, decodedReply });
      }
      if (cancelled) return;
      // Merge with any socket-pushed messages that arrived while we were
      // fetching, so we don't clobber them.
      setChannelMsgs((prev) => {
        const existingMsgs = prev[activeChannelId]?.messages ?? [];
        const seen = new Set(decoded.map((m) => m.id));
        const extras = existingMsgs.filter((m) => !seen.has(m.id));
        return {
          ...prev,
          [activeChannelId]: {
            messages: [...decoded, ...extras],
            loaded: true,
            hasMore: r.messages.length === MSG_PAGE,
          },
        };
      });
    }).catch(() => {/* non-fatal — leave channel unloaded so a retry can refetch */});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, activeServerId, keysReady]);

  /* ------------------------ DM message loader ------------------------ */
  useEffect(() => {
    if (!activeDmId || !dmKeysReady) return;
    loadDmMessages(activeDmId);
    // Clear unread when switching to this DM
    setDmUnreadMap((prev) => prev[activeDmId] ? { ...prev, [activeDmId]: 0 } : prev);
    persistRead('dm', activeDmId);

    // Proactively refresh otherPublicKey when it's null — this fires every time the
    // user clicks a DM in the sidebar (setActiveDmId without calling openDm), so stale
    // null keys from the initial listDms load are healed before the first send attempt.
    const dm = dmsRef.current.find((d) => d.id === activeDmId);
    if (dm && !dm.otherPublicKey) {
      api.getPeerPublicKey(dm.otherUserId)
        .then(({ publicKey }) => {
          if (!publicKey) return;
          // Evict the stale AES key so getDmKey re-derives with the fresh peer key.
          clearDmKey(activeDmId);
          setDms((prev) => {
            const next = prev.map((d) =>
              d.id === activeDmId ? { ...d, otherPublicKey: publicKey } : d,
            );
            dmsRef.current = next;
            return next;
          });
          runPeerTofu(dm.otherUserId, publicKey);
        })
        .catch(() => { /* non-fatal — peer may not have registered a key yet */ });
    } else if (dm?.otherPublicKey) {
      runPeerTofu(dm.otherUserId, dm.otherPublicKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDmId, dmKeysReady]);

  /* CRYPTO-004: TOFU check + fingerprint for a peer's DM public key. */
  function runPeerTofu(userId: string, jwkString: string) {
    const status = checkPeerKeyTofu(userId, jwkString);
    setPeerKeyChanged((prev) => {
      const want = status === 'changed';
      if (prev.has(userId) === want) return prev;
      const next = new Set(prev);
      if (want) next.add(userId); else next.delete(userId);
      return next;
    });
    fingerprintJwk(jwkString)
      .then((fp) => setPeerFingerprints((prev) => (prev[userId] === fp ? prev : { ...prev, [userId]: fp })))
      .catch(() => {});
  }

  /* CRYPTO-004: user confirms a changed peer key is legitimate — re-pin and re-derive. */
  function handleAcceptPeerKey(dmChannelId: string) {
    const dm = dmsRef.current.find((d) => d.id === dmChannelId);
    if (!dm?.otherPublicKey) return;
    repinPeerKey(dm.otherUserId, dm.otherPublicKey);
    setPeerKeyChanged((prev) => {
      if (!prev.has(dm.otherUserId)) return prev;
      const next = new Set(prev);
      next.delete(dm.otherUserId);
      return next;
    });
    clearDmKey(dmChannelId);
  }

  /* FEAT-020: Cmd/Ctrl+K opens message search. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* CRYPTO-004: compute own DM public-key fingerprint for the security settings panel. */
  useEffect(() => {
    if (!dmKeysReady || !dmKeyPairRef.current) { setMyFingerprint(''); return; }
    let cancelled = false;
    exportPublicKeyJwk(dmKeyPairRef.current.publicKey)
      .then((jwk) => fingerprintJwk(jwk))
      .then((fp) => { if (!cancelled) setMyFingerprint(fp); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmKeysReady]);

  /* ------------------------ Re-decrypt failed DMs when keys become available ------------------------ */
  useEffect(() => {
    if (!dmKeysReady) return;
    // Clear loaded state for any DM channel with failed messages so they get re-fetched and re-decrypted.
    // Use dmMessagesRef.current so we always read the latest state, not the stale closure value that
    // was captured when dmKeysReady first became true (the ref is kept in sync via its own useEffect).
    setDmMsgLoaded((prev) => {
      const current = dmMessagesRef.current;
      const updated = { ...prev };
      let changed = false;
      for (const [chanId, msgs] of Object.entries(current)) {
        if (msgs.some((m) => m.failed) && updated[chanId]) {
          delete updated[chanId];
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmKeysReady]);

  /* ------------------------ Helpers ------------------------ */
  const memberMap = useMemo(() => {
    const map: Record<string, Member> = {};
    if (activeServerId) {
      for (const m of membersByServer[activeServerId] ?? []) map[m.id] = m;
    }
    return map;
  }, [activeServerId, membersByServer]);

  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeServerId) ?? null,
    [servers, activeServerId],
  );

  const unreadByServer = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [serverId, channelList] of Object.entries(channelsByServer)) {
      let total = 0;
      for (const c of channelList) total += unread[c.id] ?? 0;
      if (total > 0) out[serverId] = total;
    }
    return out;
  }, [channelsByServer, unread]);

  const activeChannel = useMemo(() => {
    if (!activeServerId || !activeChannelId) return null;
    return (channelsByServer[activeServerId] ?? []).find((c) => c.id === activeChannelId) ?? null;
  }, [activeServerId, activeChannelId, channelsByServer]);

  const totalDmUnread = useMemo(
    () => Object.values(dmUnreadMap).reduce((a, b) => a + b, 0),
    [dmUnreadMap],
  );

  const activeDm = useMemo(
    () => dms.find((d) => d.id === activeDmId) ?? null,
    [dms, activeDmId],
  );

  const isEncrypted = !!activeServerId && !!keysReady[activeServerId];
  const channelTyping = useMemo(() => {
    if (!activeServerId || !activeChannelId) return [] as string[];
    return Array.from(typing[activeServerId]?.[activeChannelId] ?? []);
  }, [activeServerId, activeChannelId, typing]);

  // ── voice channel name for VoiceBar (must be before early returns) ───────────
  const activeCallChannel = useMemo(() => {
    const channelId = callManagerRef.current?.currentChannel();
    if (!channelId) return null;
    for (const channelList of Object.values(channelsByServer)) {
      const ch = channelList.find((c) => c.id === channelId);
      if (ch) return ch;
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCall, channelsByServer]);

  /* ------------------------ Actions ------------------------ */
  async function handleUnlock(passphrase: string) {
    if (!activeServerId) return;
    // Capture before async ops — prevents TypeScript narrowing from resetting after await
    const serverId = activeServerId;
    // Prevent concurrent unlock calls (double-click, slow network)
    if (unlockingRef.current) return;
    unlockingRef.current = true;
    try {
      // Primary check: Argon2id verify on the server side (#31).
      // This is the authoritative gate — it also handles the empty-channel case
      // where there are no ciphertext messages to sample-decrypt against.
      const { valid } = await api.verifyServerPassphrase(serverId, passphrase);
      if (!valid) throw new Error('Wrong passphrase for this server');

      // Derive the AES-GCM key using the server's random kdf_salt (#11)
      const key = await deriveServerKey(passphrase, serverId, activeServer?.kdf_salt);
      cacheKey(serverId, key);
      cachePassphrase(serverId, passphrase, activeServer?.kdf_salt);
      setKeysReady((prev) => ({ ...prev, [serverId]: true }));

      // Re-decrypt any already-fetched messages in this server
      const list = channelsByServer[serverId] ?? [];
      const updates: Record<string, ChannelState> = {};
      for (const ch of list) {
        const st = channelMsgs[ch.id];
        if (!st) continue;
        const fresh: DecodedMessage[] = [];
        for (const m of st.messages) {
          try {
            const body = await decryptText(key, m.ciphertext, m.nonce);
            // Also re-decrypt reply preview
            let decodedReply: DecodedMessage['decodedReply'] = null;
            if (m.replyTo) {
              try {
                const replyBody = await decryptText(key, m.replyTo.ciphertext, m.replyTo.nonce);
                decodedReply = { id: m.replyTo.id, senderId: m.replyTo.senderId, senderName: m.replyTo.senderName, body: replyBody, failed: false };
              } catch {
                decodedReply = { id: m.replyTo.id, senderId: m.replyTo.senderId, senderName: m.replyTo.senderName, body: '[could not decrypt]', failed: true };
              }
            }
            fresh.push({ ...m, body, failed: false, decodedReply });
          } catch {
            fresh.push({ ...m, body: '[could not decrypt]', failed: true });
          }
        }
        updates[ch.id] = { messages: fresh, loaded: st.loaded };
      }
      setChannelMsgs((prev) => ({ ...prev, ...updates }));
    } finally {
      unlockingRef.current = false;
    }
  }

  async function handleSendMessage(
    text: string,
    replyToId?: string | null,
    animationType?: string,
    attachment?: import('./types').FileAttachment,
  ) {
    if (!activeServerId || !activeChannelId) return;
    if (text.length > 4000) throw new Error('Message too long (max 4000 characters)');
    // Snapshot mutable state before the first await to avoid TOCTOU races
    const channelId = activeChannelId;
    const serverId = activeServerId;
    const key = getCachedKey(serverId);
    const socket = socketRef.current;
    if (!key || !socket) return;
    const { ciphertext, nonce } = await encryptText(key, text);
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('send timed out')), 8000);
      socket.emit(
        'message:send',
        {
          channelId, ciphertext, nonce,
          replyToId: replyToId ?? null, animationType: animationType ?? null,
          fileUrl:  attachment?.url  ?? null,
          fileName: attachment?.name ?? null,
          fileSize: attachment?.size ?? null,
          fileType: attachment?.type ?? null,
        },
        (resp: { ok: boolean; id?: string; error?: string }) => {
          clearTimeout(timer);
          if (!resp?.ok) reject(new Error(resp?.error ?? 'send failed'));
          else resolve();
        },
      );
    });
  }

  function emitTyping() {
    if (!activeChannelId || !socketRef.current) return;
    socketRef.current.emit('typing:start', activeChannelId);
  }

  async function deleteMessage(id: string) {
    const socket = socketRef.current;
    if (!socket) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('send timed out')), 8000);
      socket.emit('message:delete', { id }, (resp: { ok: boolean; error?: string } | undefined) => {
        clearTimeout(timer);
        if (resp?.ok === false) reject(new Error(resp?.error ?? 'Delete failed'));
        else resolve();
      });
    });
  }

  async function handleEditMessage(id: string, newText: string) {
    const socket = socketRef.current;
    if (!socket) return;
    // Find the channel for this message
    let channelId: string | null = null;
    for (const [cid, state] of Object.entries(channelMsgs)) {
      if (state.messages.some((m) => m.id === id)) { channelId = cid; break; }
    }
    if (!channelId) return;
    const channel = lookupChannel(channelId);
    if (!channel) return;
    const key = getCachedKey(channel.server_id);
    if (!key) return;
    const { ciphertext, nonce } = await encryptText(key, newText);
    // Use ack so the client knows if the edit was rejected (rate limit, kicked, etc.)
    // Throw on failure so MessageRow can keep the edit box open with the text. (#L-13)
    await new Promise<void>((resolve, reject) => {
      socket.emit('message:edit', { id, ciphertext, nonce }, (resp: { ok: boolean; error?: string } | undefined) => {
        if (resp?.ok === false) reject(new Error(resp?.error ?? 'Edit failed'));
        else resolve();
      });
    });
  }

  function handleReaction(messageId: string, emoji: string) {
    socketRef.current?.emit('reaction:toggle', { messageId, emoji });
  }

  function handleSparkMessage(messageId: string, amount: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) { reject(new Error('not connected — try again')); return; }
      const channelId = activeChannelId;
      if (!channelId) { reject(new Error('no active channel')); return; }

      // Timeout guard: if the server never calls the ack the Promise would hang
      // forever, leaving the button stuck in a loading state.
      const timer = setTimeout(() => {
        console.error('[spark] ack timed out after 8s');
        reject(new Error('request timed out — try again'));
      }, 8000);

      socket.emit(
        'message:spark',
        { messageId, channelId, amount },
        (resp: { ok: boolean; newBalance?: number; error?: string } | undefined) => {
          clearTimeout(timer);
          if (!resp) { reject(new Error('no response from server')); return; }
          if (!resp.ok) { reject(new Error(resp.error ?? 'spark failed')); return; }
          if (typeof resp.newBalance === 'number') setSparksBalance(resp.newBalance);
          resolve();
        },
      );
    });
  }

  async function createServer(name: string, passphrase: string) {
    const r = await api.createServer({ name, passphrase });
    const summary: ServerSummary = {
      id: r.server.id,
      name: r.server.name,
      invite_code: r.server.invite_code ?? r.server.inviteCode ?? '',
      owner_id: r.server.owner_id ?? r.server.ownerId ?? '',
      role: r.server.role,
      created_at: Date.now(),
      kdf_salt: r.server.kdf_salt ?? r.server.kdfSalt ?? null,
    };
    setServers((prev) => [...prev, summary]);
    // pre-derive key using the random kdf_salt returned by the server (#11)
    const key = await deriveServerKey(passphrase, summary.id, summary.kdf_salt);
    cacheKey(summary.id, key);
    cachePassphrase(summary.id, passphrase, summary.kdf_salt);
    setKeysReady((prev) => ({ ...prev, [summary.id]: true }));
    setActiveServerId(summary.id);
    // socket joins are managed server-side on connect; we still want this
    // socket to be re-aware of the new room.
    socketRef.current?.emit('server:join', summary.id);
  }

  async function joinServer(inviteCode: string, passphrase: string) {
    const r = await api.joinServer({ inviteCode, passphrase });
    const summary: ServerSummary = {
      id: r.server.id,
      name: r.server.name,
      invite_code: r.server.invite_code ?? r.server.inviteCode ?? '',
      owner_id: r.server.owner_id ?? r.server.ownerId ?? '',
      role: r.server.role,
      created_at: Date.now(),
      kdf_salt: r.server.kdf_salt ?? r.server.kdfSalt ?? null,
    };
    setServers((prev) => (prev.find((s) => s.id === summary.id) ? prev : [...prev, summary]));
    const key = await deriveServerKey(passphrase, summary.id, summary.kdf_salt);
    cacheKey(summary.id, key);
    cachePassphrase(summary.id, passphrase, summary.kdf_salt);
    setKeysReady((prev) => ({ ...prev, [summary.id]: true }));
    setActiveServerId(summary.id);
    socketRef.current?.emit('server:join', summary.id);
  }

  async function renameServer(serverId: string, name: string) {
    await api.updateServer(serverId, { name });
    // Optimistic update — socket event will confirm
    setServers((prev) => prev.map((s) => s.id === serverId ? { ...s, name } : s));
  }

  async function changeServerPassphrase(serverId: string, currentPassphrase: string, passphrase: string) {
    const { kdfSalt } = await api.changeServerPassphrase(serverId, { passphrase, currentPassphrase });
    // Re-derive key with new passphrase + new kdf_salt, update cache
    const key = await deriveServerKey(passphrase, serverId, kdfSalt);
    cacheKey(serverId, key);
    cachePassphrase(serverId, passphrase, kdfSalt);
    setServers((prev) => prev.map((s) => s.id === serverId ? { ...s, kdf_salt: kdfSalt } : s));
    setKeysReady((prev) => ({ ...prev, [serverId]: true }));
    // Clear all cached messages — they can't be decrypted with the new key
    setChannelMsgs((prev) => {
      const channels = channelsByServer[serverId] ?? [];
      const cleared: Record<string, ChannelState> = {};
      for (const ch of channels) {
        cleared[ch.id] = { messages: [], loaded: true };
      }
      return { ...prev, ...cleared };
    });
  }

  async function leaveServer(serverId: string) {
    await api.leaveServer(serverId);
    clearKey(serverId);
    setServers((prev) => prev.filter((s) => s.id !== serverId));
    setChannelsByServer((prev) => { const n = { ...prev }; delete n[serverId]; return n; });
    setMembersByServer((prev) => { const n = { ...prev }; delete n[serverId]; return n; });
    setActiveServerId((cur) => cur === serverId ? null : cur);
  }

  async function deleteServer(serverId: string) {
    await api.deleteServer(serverId);
    clearKey(serverId);
    setServers((prev) => prev.filter((s) => s.id !== serverId));
    setChannelsByServer((prev) => { const n = { ...prev }; delete n[serverId]; return n; });
    setMembersByServer((prev) => { const n = { ...prev }; delete n[serverId]; return n; });
    setActiveServerId((cur) => cur === serverId ? null : cur);
  }

  async function kickMember(serverId: string, userId: string) {
    await api.kickMember(serverId, userId);
    setMembersByServer((prev) => ({
      ...prev,
      [serverId]: (prev[serverId] ?? []).filter((m) => m.id !== userId),
    }));
  }

  async function banMember(serverId: string, userId: string, reason?: string) {
    await api.banMember(serverId, userId, reason);
    // Remove from local members state — they were kicked server-side
    setMembersByServer((prev) => ({
      ...prev,
      [serverId]: (prev[serverId] ?? []).filter((m) => m.id !== userId),
    }));
  }

  async function assignRole(userId: string, roleId: string) {
    if (!activeServerId) return;
    const serverId = activeServerId;
    const prevMembers = membersByServer[serverId] ?? [];
    // Optimistically update member badge; socket member:roles_updated will reconcile
    const role = (rolesByServer[serverId] ?? []).find((r) => r.id === roleId);
    if (role) {
      setMembersByServer((prev) => {
        const list = prev[serverId] ?? [];
        return {
          ...prev,
          [serverId]: list.map((m) =>
            m.id === userId
              ? { ...m, roles: [...(m.roles ?? []), { id: role.id, name: role.name, color: role.color, position: role.position }] }
              : m,
          ),
        };
      });
    }
    try {
      await api.assignRole(serverId, userId, roleId);
    } catch (err) {
      setMembersByServer((prev) => ({ ...prev, [serverId]: prevMembers }));
      throw err;
    }
  }

  async function removeRole(userId: string, roleId: string) {
    if (!activeServerId) return;
    const serverId = activeServerId;
    const prevMembers = membersByServer[serverId] ?? [];
    // Optimistically remove the role badge
    setMembersByServer((prev) => {
      const list = prev[serverId] ?? [];
      return {
        ...prev,
        [serverId]: list.map((m) =>
          m.id === userId
            ? { ...m, roles: (m.roles ?? []).filter((r) => r.id !== roleId) }
            : m,
        ),
      };
    });
    try {
      await api.removeRole(serverId, userId, roleId);
    } catch (err) {
      setMembersByServer((prev) => ({ ...prev, [serverId]: prevMembers }));
      throw err;
    }
  }

  function handleServerReorder(newOrder: string[]) {
    // Optimistic: reorder in state immediately
    const posMap = new Map(newOrder.map((id, i) => [id, i]));
    setServers((prev) =>
      [...prev].sort((a, b) => (posMap.get(a.id) ?? 0) - (posMap.get(b.id) ?? 0)),
    );
    // Persist to server — fire-and-forget; stale order is low-stakes
    api.updateServerOrder(newOrder).catch(() => {});
  }

  // ── DM actions ─────────────────────────────────────────────────────────────

  /**
   * Get (or derive) the AES-GCM key for a DM channel.
   * Returns null if our key pair isn't ready or the peer hasn't registered a key.
   */
  async function getDmKey(dmChannel: DmChannel): Promise<CryptoKey | null> {
    const cached = getCachedDmKey(dmChannel.id);
    if (cached) return cached;

    // DM AES-GCM keys are memory-only (non-extractable) — no sessionStorage persistence.
    // On page reload the key is re-derived from the ECDH key pair (cheap, ~1ms).
    if (!dmKeyPairRef.current) return null;

    // otherPublicKey can be null when the DM channel was loaded before the peer registered
    // their ECDH key, or when the initial GET /api/dms was cached and the peer registered
    // later.  Fetch fresh rather than silently failing — this unblocks the admin account
    // DMing users who registered their key after the DM list was first loaded.
    let peerKeyJwk = dmChannel.otherPublicKey;
    if (!peerKeyJwk) {
      try {
        const { publicKey } = await api.getPeerPublicKey(dmChannel.otherUserId);
        if (publicKey) {
          peerKeyJwk = publicKey;
          // Patch the cached channel so future calls (and dmsRef lookups) don't re-fetch
          setDms((prev) => {
            const next = prev.map((d) =>
              d.id === dmChannel.id ? { ...d, otherPublicKey: publicKey } : d,
            );
            dmsRef.current = next;
            return next;
          });
        }
      } catch { /* non-fatal — peer may not have registered yet; return null below */ }
    }

    if (!peerKeyJwk) return null;

    try {
      const peerKey = await importPeerPublicKey(peerKeyJwk);
      const aesKey = await deriveDmKey(dmKeyPairRef.current.privateKey, peerKey, dmChannel.id);
      cacheDmKey(dmChannel.id, aesKey);
      return aesKey;
    } catch { return null; }
  }

  /**
   * Decrypt a single DM ciphertext, falling back through archived key pairs if the
   * current derived key fails. This handles the post-rotation scenario where old
   * messages were encrypted with a previous ECDH key pair.
   *
   * CRYPTO-006: `senderEcdhPublicKey` is the sender's key at the time the message
   * was sent (snapshotted on the server).  When provided and different from the
   * current peer public key, we try it first so post-rotation historical messages
   * can be decrypted without walking all key history.
   */
  async function tryDecryptDm(
    ciphertext: string,
    nonce: string,
    dmChannel: DmChannel,
    senderEcdhPublicKey?: string | null,
  ): Promise<string> {
    // Fast path: try the current derived key (cache hit — no imports needed)
    const currentKey = await getDmKey(dmChannel);
    if (currentKey) {
      try { return await decryptText(currentKey, ciphertext, nonce); } catch {
        // Cached AES key failed — may be stale after a peer key rotation where the DM list was
        // refreshed (otherPublicKey updated) but the cache still holds the pre-rotation AES key.
        // Invalidate and immediately re-derive with the current peer public key.
        clearDmKey(dmChannel.id);
        const freshKey = await getDmKey(dmChannel);
        if (freshKey) {
          try { return await decryptText(freshKey, ciphertext, nonce); } catch { /* fall through */ }
        }
      }
    }

    // BUG 9: single lazy-loaded history cache — avoids calling loadDmKeyHistory() twice
    let _history: CryptoKeyPair[] | null = null;
    const getHistory = async () => {
      if (!_history) _history = await loadDmKeyHistory();
      return _history;
    };

    // CRYPTO-006: sender's key at send-time differs from current peer key → derive
    // against that specific epoch using current and historical own private keys.
    if (senderEcdhPublicKey && senderEcdhPublicKey !== dmChannel.otherPublicKey) {
      try {
        const snapshotKey = await importPeerPublicKey(senderEcdhPublicKey);
        const currentPair = dmKeyPairRef.current;
        if (currentPair) {
          try {
            const k = await deriveDmKey(currentPair.privateKey, snapshotKey, dmChannel.id);
            return await decryptText(k, ciphertext, nonce);
          } catch { /* fall through */ }
        }
        const history = await getHistory();
        for (const oldPair of history) {
          try {
            const k = await deriveDmKey(oldPair.privateKey, snapshotKey, dmChannel.id);
            return await decryptText(k, ciphertext, nonce);
          } catch { /* try next */ }
        }
      } catch { /* importPeerPublicKey failed — sender key snapshot invalid */ }
    }

    // Original fallback: walk all archived own keys × current peer public key
    if (dmChannel.otherPublicKey) {
      const history = await getHistory();
      if (history.length > 0) {
        const peerKey = await importPeerPublicKey(dmChannel.otherPublicKey);
        for (const oldPair of history) {
          try {
            const oldAesKey = await deriveDmKey(oldPair.privateKey, peerKey, dmChannel.id);
            return await decryptText(oldAesKey, ciphertext, nonce);
          } catch { /* try next archived key */ }
        }
      }
    }

    // BUG 8: also try senderEcdhPublicKey (the peer's key at send time) against all our
    // historical keys — handles the case where BOTH sides have rotated since the message was sent.
    if (senderEcdhPublicKey && senderEcdhPublicKey !== dmChannel.otherPublicKey) {
      try {
        const senderKeyAtSendTime = await importPeerPublicKey(senderEcdhPublicKey);
        const history2 = await getHistory();
        for (const oldPair of history2) {
          try {
            const oldAesKey = await deriveDmKey(oldPair.privateKey, senderKeyAtSendTime, dmChannel.id);
            return await decryptText(oldAesKey, ciphertext, nonce);
          } catch { continue; }
        }
      } catch { /* importPeerPublicKey failed */ }
    }

    throw new Error('decrypt failed with all available keys');
  }

  /** Decrypt a batch of DM wire messages for a channel.
   *  @param existingMsgs — already-decoded messages in the channel (used for reply lookups). */
  async function decryptDmMessages(wire: DmWireMessage[], dmChannel: DmChannel, existingMsgs?: DmMessage[]): Promise<DmMessage[]> {
    const result: DmMessage[] = [];
    for (const m of wire) {
      if (m.ciphertext && m.nonce) {
        try {
          const body = await tryDecryptDm(m.ciphertext, m.nonce, dmChannel, m.senderEcdhPublicKey);
          result.push({ ...m, body, failed: false });
        } catch {
          result.push({ ...m, body: '[could not decrypt]', failed: true });
        }
      } else {
        // Legacy plaintext message — not E2E encrypted
        result.push({ ...m, body: m.body ?? '', failed: false, isPlaintext: true });
      }
    }
    // Attach decodedReply — look up within decoded batch first, then caller-supplied existing msgs
    const pool = new Map<string, DmMessage>();
    for (const m of existingMsgs ?? []) pool.set(m.id, m);
    for (const m of result) pool.set(m.id, m);
    return result.map((m) => {
      if (!m.replyToId) return m;
      const target = pool.get(m.replyToId);
      if (!target) return { ...m, decodedReply: null };
      const senderName = target.senderId === dmChannel.otherUserId ? dmChannel.otherDisplayName : (user?.displayName ?? 'You');
      return {
        ...m,
        decodedReply: { id: target.id, senderId: target.senderId, senderName, body: target.body, failed: target.failed },
      };
    });
  }

  async function openDm(userId: string) {
    const { dm } = await api.openDm(userId);
    const dmChannel: DmChannel = dm;
    setDms((prev) => {
      const exists = prev.some((d) => d.id === dmChannel.id);
      // Always refresh the peer's otherPublicKey from the fresh server response.
      // If we just returned prev unchanged, a stale null key would persist — blocking
      // encryption for any user who registered their key after we first loaded the DM list.
      const next = exists
        ? prev.map((d) => d.id === dmChannel.id
            ? { ...d, otherPublicKey: dmChannel.otherPublicKey }
            : d)
        : [dmChannel, ...prev];
      // Sync ref immediately so sendDmMessage sees the fresh key without waiting for
      // the useEffect → re-render cycle to propagate the state update.
      dmsRef.current = next;
      return next;
    });
    // Pre-derive the DM key so encryption is ready before the user types
    getDmKey(dmChannel).catch(() => {});
    setView('dm');
    setActiveDmId(dmChannel.id);
  }

  async function loadDmMessages(dmId: string) {
    if (dmMsgLoaded[dmId] || dmLoadingRef.current.has(dmId)) return;
    dmLoadingRef.current.add(dmId);
    try {
      const dmChannel = dmsRef.current.find((d) => d.id === dmId);
      const { messages } = await api.getDmMessages(dmId, MSG_PAGE);
      const decoded = dmChannel
        ? await decryptDmMessages(messages as DmWireMessage[], dmChannel)
        : (messages as DmWireMessage[]).map((m) => ({ ...m, body: m.body ?? '', failed: false, isPlaintext: true }));
      setDmMessages((prev) => ({ ...prev, [dmId]: decoded }));
      setDmMsgLoaded((prev) => ({ ...prev, [dmId]: true }));
      setDmHasMore((prev) => ({ ...prev, [dmId]: messages.length === MSG_PAGE }));
    } finally {
      dmLoadingRef.current.delete(dmId);
    }
  }

  async function loadMoreMessages(channelId: string) {
    const state = channelMsgs[channelId];
    if (!state?.hasMore) return;
    // REL-001: skip if a paginated fetch for this channel is already in flight
    if (loadMoreRef.current.has(channelId)) return;
    // Resolve which server owns this channel
    let serverId: string | null = null;
    for (const [sid, chList] of Object.entries(channelsByServer)) {
      if (chList.find((c) => c.id === channelId)) { serverId = sid; break; }
    }
    if (!serverId) return;
    const key = getCachedKey(serverId);
    const oldest = state.messages[0];
    if (!oldest) return;
    const cursor = `${oldest.createdAt},${oldest.id}`;
    loadMoreRef.current.add(channelId);
    try {
    const r = await api.listMessages(channelId, MSG_PAGE, cursor);
    const decoded: DecodedMessage[] = [];
    for (const m of r.messages as WireMessage[]) {
      let body = '[locked]';
      let failed = true;
      if (key) {
        try {
          body = await decryptText(key, m.ciphertext, m.nonce);
          failed = false;
        } catch {
          body = '[could not decrypt]';
        }
      }
      // Decode reply preview
      let decodedReply: DecodedMessage['decodedReply'] = null;
      if (m.replyTo && key) {
        try {
          const replyBody = await decryptText(key, m.replyTo.ciphertext, m.replyTo.nonce);
          decodedReply = { id: m.replyTo.id, senderId: m.replyTo.senderId, senderName: m.replyTo.senderName, body: replyBody, failed: false };
        } catch {
          decodedReply = { id: m.replyTo.id, senderId: m.replyTo.senderId, senderName: m.replyTo.senderName, body: '[could not decrypt]', failed: true };
        }
      } else if (m.replyTo) {
        decodedReply = { id: m.replyTo.id, senderId: m.replyTo.senderId, senderName: m.replyTo.senderName, body: '[locked]', failed: true };
      }
      decoded.push({ ...m, body, failed, decodedReply });
    }
    setChannelMsgs((prev) => {
      const st = prev[channelId];
      if (!st) return prev;
      const existingIds = new Set(st.messages.map((m) => m.id));
      const fresh = decoded.filter((m) => !existingIds.has(m.id));
      return {
        ...prev,
        [channelId]: {
          messages: [...fresh, ...st.messages],
          loaded: true,
          hasMore: r.messages.length === MSG_PAGE,
        },
      };
    });
    } finally {
      loadMoreRef.current.delete(channelId);
    }
  }

  async function loadMoreDmMessages(dmId: string) {
    if (!dmHasMore[dmId]) return;
    const msgs = dmMessages[dmId] ?? [];
    const oldest = msgs[0];
    if (!oldest) return;
    // REL-001: skip if a paginated DM fetch is already in flight ('dm:' prefix avoids channel-id collision)
    const guardKey = `dm:${dmId}`;
    if (loadMoreRef.current.has(guardKey)) return;
    const cursor = `${oldest.createdAt},${oldest.id}`;
    loadMoreRef.current.add(guardKey);
    try {
      const { messages } = await api.getDmMessages(dmId, MSG_PAGE, cursor);
      const dmChannel = dmsRef.current.find((d) => d.id === dmId);
      const currentMsgs = dmMessagesRef.current[dmId] ?? [];
      const decoded = dmChannel
        ? await decryptDmMessages(messages as DmWireMessage[], dmChannel, currentMsgs)
        : (messages as DmWireMessage[]).map((m) => ({ ...m, body: m.body ?? '', failed: false, isPlaintext: true }));
      setDmMessages((prev) => {
        const existing = prev[dmId] ?? [];
        const existingIds = new Set(existing.map((m) => m.id));
        const fresh = decoded.filter((m) => !existingIds.has(m.id));
        return { ...prev, [dmId]: [...fresh, ...existing] };
      });
      setDmHasMore((prev) => ({ ...prev, [dmId]: messages.length === MSG_PAGE }));
    } finally {
      loadMoreRef.current.delete(guardKey);
    }
  }

  // ── DM Call management ────────────────────────────────────────────────────

  function teardownDmCall() {
    if (dmCallAutoCancelRef.current) { clearTimeout(dmCallAutoCancelRef.current); dmCallAutoCancelRef.current = null; }
    if (dmCallDisconnectTimerRef.current) { clearTimeout(dmCallDisconnectTimerRef.current); dmCallDisconnectTimerRef.current = null; }
    setDmCall((prev) => {
      if (!prev) return null;
      prev.pc?.close();
      prev.localStream?.getTracks().forEach((t) => t.stop());
      prev.localScreenStream?.getTracks().forEach((t) => t.stop());
      return null;
    });
    playCallSound('leave_call');
  }

  async function startDmCall(dmId: string, hasVideo: boolean) {
    if (dmCallRef.current) return; // already in a call
    const dm = dms.find((d) => d.id === dmId);
    if (!dm) return;
    let localStream: MediaStream | null = null;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48000, channelCount: { ideal: 2, min: 1 }, echoCancellation: true, noiseSuppression: true },
        video: hasVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
    } catch (err) {
      console.error('[DM call] getUserMedia failed:', err);
      return;
    }
    const callState: DmCallState = {
      dmChannelId: dmId,
      peerUserId: dm.otherUserId,
      peerName: dm.otherDisplayName,
      peerAvatarUrl: dm.otherAvatarUrl ?? null,
      status: 'outgoing-ringing',
      hasVideo,
      isMuted: false,
      isVideoOff: false,
      localStream,
      localScreenStream: null,
      isScreenSharing: false,
      peerStream: null,
      peerScreenStream: null,
      pc: null,
      startedAt: null,
      peerVolume: 1,
    };
    // Store in ref synchronously so teardown can find the stream even before setDmCall processes
    dmCallRef.current = callState;
    setDmCall(callState);
    playCallSound('join_call');
    socketRef.current?.emit('dm:call:invite', { dmChannelId: dmId, hasVideo });
    // Auto-cancel after 45s if no answer
    dmCallAutoCancelRef.current = setTimeout(() => {
      if (dmCallRef.current?.dmChannelId === dmId && dmCallRef.current?.status === 'outgoing-ringing') {
        socketRef.current?.emit('dm:call:end', { dmChannelId: dmId });
        teardownDmCall();
      }
      dmCallAutoCancelRef.current = null;
    }, 45_000);
  }

  async function acceptDmCall(withVideo: boolean) {
    const call = dmCallRef.current;
    if (!call || call.status !== 'incoming-ringing') return;
    let localStream: MediaStream | null = null;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48000, channelCount: { ideal: 2, min: 1 }, echoCancellation: true, noiseSuppression: true },
        video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
    } catch (err) {
      console.error('[DM call] getUserMedia failed:', err);
      return;
    }
    // BL-002 fix: don't create RTCPeerConnection yet — wait for dm:call:accepted
    // which delivers ICE servers from the server. The onDmCallAccepted handler
    // (below) creates the PC with proper ICE servers for BOTH caller and callee.
    // Store localStream and pending state; PC is created on dm:call:accepted.
    //
    // STALE-STREAM FIX: update dmCallRef.current synchronously HERE so that when
    // onDmCallAccepted fires (potentially before the React re-render), it sees the
    // correct localStream. Without this the callee's video tracks are never added
    // to the PeerConnection because localStream is still null in the ref.
    const nextCallState: import('./types').DmCallState = {
      ...call,
      status: 'connecting',
      hasVideo: withVideo,
      localStream,
      localScreenStream: null,
      isScreenSharing: false,
      peerScreenStream: null,
      peerVolume: call.peerVolume ?? 1,
      pc: null,
    };
    dmCallRef.current = nextCallState;
    setDmCall(nextCallState);
    playCallSound('join_call');
    socketRef.current?.emit('dm:call:accept', { dmChannelId: call.dmChannelId });
  }

  function buildDmPeerConnection(iceServers: RTCIceServer[], dmChannelId: string, localStream: MediaStream | null): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers });
    if (localStream) {
      for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current?.emit('dm:call:ice', { dmChannelId, candidate: candidate.toJSON() });
    };

    // Stream-ID-based track separation:
    //   First stream ID seen = peer's main stream (audio + camera)
    //   Any NEW stream ID later = screen share stream (added via renegotiation)
    let mainPeerStreamId: string | null = null;
    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0];
      if (!stream) return;
      if (!mainPeerStreamId || stream.id === mainPeerStreamId) {
        mainPeerStreamId = stream.id;
        setDmCall((prev) => prev ? { ...prev, peerStream: stream } : prev);
      } else {
        // New stream = peer started screen sharing
        setDmCall((prev) => prev ? { ...prev, peerScreenStream: stream } : prev);
        track.onended = () => setDmCall((prev) => prev ? { ...prev, peerScreenStream: null } : prev);
      }
    };

    // Renegotiation for mid-call changes (screen share start/stop).
    // Guard: only renegotiate when already active — initial offer is sent manually.
    let isNegotiating = false;
    pc.onnegotiationneeded = async () => {
      const call = dmCallRef.current;
      if (!call || call.status !== 'active') return;
      if (isNegotiating) return;
      isNegotiating = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          socketRef.current?.emit('dm:call:offer', { dmChannelId, sdp: pc.localDescription });
        }
      } catch (err) {
        console.error('[DM renegotiation] offer failed:', err);
      } finally {
        isNegotiating = false;
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        setDmCall((prev) => prev ? { ...prev, status: 'active', startedAt: Date.now() } : prev);
        if (dmCallDisconnectTimerRef.current) { clearTimeout(dmCallDisconnectTimerRef.current); dmCallDisconnectTimerRef.current = null; }
      } else if (state === 'failed') {
        if (dmCallDisconnectTimerRef.current) clearTimeout(dmCallDisconnectTimerRef.current);
        teardownDmCall();
      } else if (state === 'disconnected') {
        dmCallDisconnectTimerRef.current = setTimeout(() => {
          // Only tear down if still disconnected (not recovered to connected/completed)
          const currentState = dmCallRef.current?.pc?.iceConnectionState;
          if (currentState === 'disconnected' || currentState === 'failed') {
            teardownDmCall();
          }
          dmCallDisconnectTimerRef.current = null;
        }, 8_000);
      }
    };
    return pc;
  }

  function rejectDmCall() {
    const call = dmCallRef.current;
    if (!call) return;
    socketRef.current?.emit('dm:call:reject', { dmChannelId: call.dmChannelId });
    teardownDmCall();
  }

  function hangUpDmCall() {
    const call = dmCallRef.current;
    if (!call) return;
    socketRef.current?.emit('dm:call:end', { dmChannelId: call.dmChannelId });
    teardownDmCall();
  }

  function toggleDmMute() {
    const call = dmCallRef.current;
    if (!call?.localStream) return;
    const newMuted = !call.isMuted;
    call.localStream.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
    setDmCall((prev) => prev ? { ...prev, isMuted: newMuted } : prev);
    playCallSound(newMuted ? 'mute' : 'unmute');
  }

  function toggleDmVideo() {
    const call = dmCallRef.current;
    if (!call?.localStream) return;
    const newOff = !call.isVideoOff;
    call.localStream.getVideoTracks().forEach((t) => { t.enabled = !newOff; });
    setDmCall((prev) => prev ? { ...prev, isVideoOff: newOff } : prev);
  }

  async function startDmScreenShare() {
    const call = dmCallRef.current;
    if (!call?.pc || call.status !== 'active' || call.isScreenSharing) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) { screenStream.getTracks().forEach((t) => t.stop()); return; }

      // Add track to its own MediaStream so the receiver distinguishes it from camera via stream ID
      call.pc.addTrack(screenTrack, screenStream); // triggers onnegotiationneeded → renegotiation

      // User stops sharing via browser's native "Stop sharing" button
      screenTrack.onended = () => stopDmScreenShare();

      const updated = { ...call, localScreenStream: screenStream, isScreenSharing: true };
      dmCallRef.current = updated;
      setDmCall(updated);
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') console.error('[DM screen share] getDisplayMedia:', err);
    }
  }

  function stopDmScreenShare() {
    const call = dmCallRef.current;
    if (!call?.pc || !call.isScreenSharing) return;
    // Stop track(s)
    call.localScreenStream?.getTracks().forEach((t) => t.stop());
    // Remove sender from PC — triggers renegotiation (onnegotiationneeded)
    for (const sender of call.pc.getSenders()) {
      if (sender.track && call.localScreenStream?.getTracks().includes(sender.track)) {
        call.pc.removeTrack(sender);
      }
    }
    const updated = { ...call, localScreenStream: null, isScreenSharing: false };
    dmCallRef.current = updated;
    setDmCall(updated);
  }

  function setDmPeerVolume(vol: number) {
    setDmCall((prev) => prev ? { ...prev, peerVolume: Math.max(0, Math.min(1, vol)) } : prev);
  }

  function handleDmReact(dmMessageId: string, dmChannelId: string, emoji: string) {
    socketRef.current?.emit('dm:reaction:toggle', { dmMessageId, dmChannelId, emoji });
  }

  function handleDmTyping(dmChannelId: string) {
    socketRef.current?.emit('dm:typing:start', dmChannelId);
  }

  /**
   * Build a SPECIFIC error message when DM encryption is impossible. getDmKey
   * collapses several distinct causes into `null`; surfacing which one actually
   * happened turns "weird, DMs just don't work" into an actionable message.
   */
  async function describeDmKeyFailure(dmChannel: DmChannel | undefined): Promise<string> {
    const prefix = 'Unable to encrypt message — ';
    if (!dmChannel) return prefix + 'this conversation failed to load. Try reloading.';
    if (!dmKeyPairRef.current) return prefix + 'your encryption keys are still loading. Try again in a few seconds.';
    try {
      const { publicKey } = await api.getPeerPublicKey(dmChannel.otherUserId);
      if (!publicKey) {
        return prefix + `${dmChannel.otherDisplayName} hasn't set up encryption yet. They need to log in once first.`;
      }
      return prefix + 'key derivation failed. Try reloading.';
    } catch (err) {
      const status = (err as Error & { status?: number })?.status;
      if (status === 404) {
        return prefix + `${dmChannel.otherDisplayName} hasn't set up encryption yet. They need to log in once first.`;
      }
      if (status === 403) {
        return prefix + `the server blocked access to ${dmChannel.otherDisplayName}'s key: ${(err as Error).message}`;
      }
      return prefix + `couldn't fetch ${dmChannel.otherDisplayName}'s key (${(err as Error).message}). Check your connection and try again.`;
    }
  }

  async function sendDmMessage(dmId: string, text: string, file?: { fileUrl: string; fileName: string; fileSize: number; fileType: string }, replyToId?: string | null) {
    // Self-heal: if the login-time key setup failed or is still in flight,
    // actively (re-)run it now instead of blind-polling. ensureDmKeys is
    // single-flight, so this either joins the in-progress attempt or starts a
    // fresh one — the old 8 s poll could never recover from a failed setup.
    if (!dmKeyPairRef.current) {
      try {
        await ensureDmKeys();
      } catch (err) {
        console.error('[sendDmMessage] key setup failed on demand:', err);
      }
      if (!dmKeyPairRef.current) {
        throw new Error(
          'Unable to encrypt message — your encryption keys could not be initialised. ' +
          'Close any other Recline tabs and reload. If it persists, use Profile → Security → Sync keys.',
        );
      }
    }
    const dmChannel = dmsRef.current.find((d) => d.id === dmId);
    const key = dmChannel ? await getDmKey(dmChannel) : null;
    const fileFields = file ? { fileUrl: file.fileUrl, fileName: file.fileName, fileSize: file.fileSize, fileType: file.fileType } : {};
    const replyField = replyToId ? { replyToId } : {};
    if (text.trim()) {
      if (key) {
        const { ciphertext, nonce } = await encryptText(key, text);
        await api.sendDmMessage(dmId, { ciphertext, nonce, ...fileFields, ...replyField });
      } else {
        console.error('[sendDmMessage] no DM key available — refusing to send plaintext');
        throw new Error(await describeDmKeyFailure(dmChannel));
      }
    } else if (file) {
      // File-only message — no text body
      await api.sendDmMessage(dmId, { ...fileFields, ...replyField } as any);
    }
    // Stop typing indicator when message is sent
    socketRef.current?.emit('dm:typing:stop', dmId);
  }

  async function editDmMessage(dmId: string, msgId: string, newText: string) {
    const dmChannel = dmsRef.current.find((d) => d.id === dmId);
    const key = dmChannel ? await getDmKey(dmChannel) : null;
    if (!key) throw new Error('DM key not available — cannot edit message');
    const { ciphertext, nonce } = await encryptText(key, newText);
    await api.editDmMessage(dmId, msgId, { ciphertext, nonce });
  }

  async function deleteDmMessage(dmId: string, msgId: string) {
    await api.deleteDmMessage(dmId, msgId);
  }

  async function clearDmChat(dmId: string) {
    await api.clearDmChat(dmId);
  }

  async function createChannel(name: string, type: 'text' | 'voice') {
    if (!activeServerId) return;
    if (creatingChannelRef.current) return;
    creatingChannelRef.current = true;
    try {
      const r = await api.createChannel(activeServerId, { name, type });
      setChannelsByServer((prev) => ({
        ...prev,
        [activeServerId]: [...(prev[activeServerId] ?? []), r.channel],
      }));
    } finally {
      creatingChannelRef.current = false;
    }
  }

  async function handleDeleteChannel(channelId: string, _channelName: string) {
    if (!activeServerId) return;
    try {
      await api.deleteChannel(activeServerId, channelId);
      // Optimistic: server will also emit channel:deleted via socket which
      // re-syncs — but remove locally immediately for snappy UX.
      setChannelsByServer((prev) => {
        const list = prev[activeServerId];
        if (!list) return prev;
        return { ...prev, [activeServerId]: list.filter((c) => c.id !== channelId) };
      });
      setActiveChannelId((prev) => (prev === channelId ? null : prev));
    } catch (err: any) {
      console.error('Failed to delete channel:', err?.message);
    }
  }

  function selectChannel(channel: Channel) {
    setActiveChannelId(channel.id);
    setUnread((prev) => (prev[channel.id] ? { ...prev, [channel.id]: 0 } : prev));
    persistRead('channel', channel.id);
    if (channel.type === 'voice') {
      // Sync inCall with whether the manager is actually in this voice channel.
      setInCall(callManagerRef.current?.isInCall(channel.id) ?? false);
    }
    // When switching to a text channel we deliberately leave inCall unchanged —
    // the call keeps running and VoiceBar renders in the text view instead.
    // Close mobile sidebar after selecting a channel
    setMobileSidebarOpen(false);
  }

  function handleLeaveCall() {
    playCallSound('leave_call');
    callManagerRef.current?.leave();
    setInCall(false);
    setMicOn(true);
    setDeafOn(false);
    prevPeerSocketIds.current = new Set();
  }

  function handleToggleDeafen(v: boolean) {
    setDeafOn(v);
    if (v) {
      // Deafening: stop transmitting audio immediately. Mic stays off after
      // undeafen — user must manually unmute, same as Discord behaviour.
      callManagerRef.current?.toggleMic(false);
      setMicOn(false);
    }
  }

  function returnToCall() {
    const channelId = callManagerRef.current?.currentChannel();
    if (!channelId) return;
    for (const [servId, channelList] of Object.entries(channelsByServer)) {
      const ch = channelList.find((c) => c.id === channelId);
      if (ch) {
        setActiveServerId(servId);
        setActiveChannelId(channelId);
        setInCall(true);
        break;
      }
    }
  }

  function logout() {
    api.logout().catch(() => {});
    setToken(null);
    clearAllKeys(); // wipe memory cache + sessionStorage in one shot (#32)
    clearAllDmKeys(); // flush DM AES keys from memory + sessionStorage
    try { sessionStorage.removeItem('recline.session.authKey'); } catch {}
    unregisterPushSubscription(); // remove push subscription from server + browser
    dmKeyPairRef.current = null;
    // Clear stale dm typing timers so callbacks don't fire state updates after logout
    Object.values(dmTypingTimers.current).forEach(clearTimeout);
    dmTypingTimers.current = {};
    // Tear down any active DM call (closes PC + stops tracks + clears timers)
    teardownDmCall();
    if (dmCallAutoCancelRef.current) { clearTimeout(dmCallAutoCancelRef.current); dmCallAutoCancelRef.current = null; }
    if (dmCallDisconnectTimerRef.current) { clearTimeout(dmCallDisconnectTimerRef.current); dmCallDisconnectTimerRef.current = null; }
    setUser(null);
    setServers([]);
    setActiveServerId(null);
    setActiveChannelId(null);
    setChannelsByServer({});
    setMembersByServer({});
    setRolesByServer({});
    setChannelMsgs({});
    setKeysReady({});
    setOnline(new Set());
    setTyping({});
    setInCall(false);
    setMicOn(true);
    setDeafOn(false);
    prevPeerSocketIds.current = new Set();
    setDms([]);
    setActiveDmId(null);
    setDmMessages({});
    setDmMsgLoaded({});
    setDmKeysReady(false);
    setDmUnreadMap({});
    lastReadSentRef.current = {};
    setMyStatus('online');
    setUserStatuses({});
    setFeedbackOpen(false);
    setView('server');
    setFriends([]);
    setBlockedUserIds(new Set());
    setMutedServers(new Set());
    setMutedChannelIds(new Set());
    setPeerKeyChanged(new Set());
    setPeerFingerprints({});
    setSparksBalance(0);
    setIsSupporter(false);
    setShowSupporterToast(false);
    setBroadcastQueue([]);
    setStreakInfo(null);
    setStreakToast(null);
    setProfileCardUserId(null);
    pendingSupporterCheckRef.current = false;
    callManagerRef.current?.leave();
    disconnectSocket();
  }

  /**
   * Set up the ECDH DM key pair on login.
   * Priority: (1) existing IndexedDB key → (2) server backup → (3) generate fresh.
   * When a key already exists locally, uploads a backup if the server has none yet.
   */
  /** Compare two exported public key JWK strings by their elliptic curve point (x, y, crv).
   *  Safer than string equality — avoids false-mismatches from JSON field ordering. */
  function jwkPointMatches(a: string | null, b: string | null): boolean {
    if (!a || !b) return false;
    try {
      const ja = JSON.parse(a);
      const jb = JSON.parse(b);
      return ja.x === jb.x && ja.y === jb.y && ja.crv === jb.crv;
    } catch { return false; }
  }

  /**
   * Single-flight wrapper around setupDmKeys: concurrent callers (login effect,
   * a retry, a send-path self-heal) share one in-progress attempt instead of
   * racing IndexedDB and the key-registration endpoint against each other.
   * Resolves immediately when the key pair already exists.
   */
  function ensureDmKeys(pw = ''): Promise<void> {
    if (dmKeyPairRef.current) return Promise.resolve();
    if (!dmKeySetupPromiseRef.current) {
      dmKeySetupPromiseRef.current = setupDmKeys(pw).finally(() => {
        dmKeySetupPromiseRef.current = null;
      });
    }
    return dmKeySetupPromiseRef.current;
  }

  async function setupDmKeys(suppliedPw: string): Promise<void> {
    // M-7: Raw password is no longer cached in sessionStorage (was 'recline.session.pw').
    // On page refresh, suppliedPw is empty and we rely on IndexedDB for the key pair.
    // If a mismatch is detected without a password, the UI banner prompts re-login.
    const password = suppliedPw;
    // authKdfSalt is included in the /api/auth/me response for v2 users.
    const authKdfSalt = user?.authKdfSalt ?? null;

    // STEP 1: Fetch what the server currently has registered as our public key.
    // By comparing first we avoid blindly attempting a PUT that would 400 — eliminating
    // the persistent 400 loop that appears in the network tab on every page refresh.
    let serverKeyJwk: string | null = null;
    try {
      const { publicKey } = await api.getMyPublicKey();
      serverKeyJwk = publicKey;
    } catch { /* non-fatal — treat as unknown server state, proceed normally */ }

    let pair = await loadDmKeyPair();

    // A corrupt stored pair must not strand the whole key pipeline — treat it
    // as missing and fall through to backup-restore / fresh generation.
    let localJwk = '';
    if (pair) {
      try {
        localJwk = await exportPublicKeyJwk(pair.publicKey);
      } catch (err) {
        console.error('[setupDmKeys] stored key pair unusable — regenerating:', err);
        pair = null;
      }
    }

    if (pair) {

      // ── Case 1: keys match ────────────────────────────────────────────────
      if (jwkPointMatches(localJwk, serverKeyJwk)) {
        setDmKeyMismatch(false);
        dmKeyPairRef.current = pair;
        setDmKeysReady(true);
        setDmMsgLoaded({});
        // Opportunistically upload a backup if the server doesn't have one yet
        if (password) {
          try {
            const { backup } = await api.getDmKeyBackup(password, authKdfSalt);
            if (!backup) {
              const privJwk = await exportPrivateKeyJwk(pair.privateKey);
              if (privJwk) {
                const blob = await encryptDmKeyBackup(privJwk, password);
                await api.putDmKeyBackup(blob);
              }
            }
          } catch { /* non-fatal */ }
        }
        return;
      }

      // ── Case 2: server has no key yet — first-time registration ──────────
      if (serverKeyJwk === null) {
        await api.registerPublicKey(localJwk).catch(() => {});
        setDmKeyMismatch(false);
        dmKeyPairRef.current = pair;
        setDmKeysReady(true);
        setDmMsgLoaded({});
        if (password) {
          try {
            const privJwk = await exportPrivateKeyJwk(pair.privateKey);
            if (privJwk) {
              const blob = await encryptDmKeyBackup(privJwk, password);
              await api.putDmKeyBackup(blob);
            }
          } catch { /* non-fatal */ }
        }
        return;
      }

      // ── Case 3: genuine mismatch (e.g. key rotated on another device) ────
      if (password) {
        // Priority 1: restore from backup — it should hold the key the server knows.
        let restored: CryptoKeyPair | null = null;
        try {
          const { backup } = await api.getDmKeyBackup(password, authKdfSalt);
          if (backup) restored = await decryptDmKeyBackup(backup, password);
        } catch { /* non-fatal */ }

        if (restored) {
          const restoredJwk = await exportPublicKeyJwk(restored.publicKey);
          // Persistence failure must not block using the key this session.
          await saveDmKeyPair(restored).catch((err) =>
            console.error('[setupDmKeys] could not persist restored key (continuing in-memory):', err));
          pair = restored;
          // If the restored key already matches the server key, no re-registration needed.
          if (!jwkPointMatches(restoredJwk, serverKeyJwk)) {
            await api.registerPublicKey(restoredJwk, password).catch(() => {});
          }
          dmKeyPairRef.current = pair;
          setDmKeyMismatch(false);
          setDmKeysReady(true);
          setDmMsgLoaded({});
          return;
        }

        // Priority 2: force-register local key with password + upload fresh backup.
        await api.registerPublicKey(localJwk, password).catch(() => {});
        dmKeyPairRef.current = pair;
        setDmKeyMismatch(false);
        setDmKeysReady(true);
        setDmMsgLoaded({});
        try {
          const privJwk = await exportPrivateKeyJwk(pair.privateKey);
          if (privJwk) {
            const blob = await encryptDmKeyBackup(privJwk, password);
            await api.putDmKeyBackup(blob);
          }
        } catch { /* non-fatal */ }
        return;
      }

      // Mismatch + no password (page refresh) — can't reconcile without credentials.
      // Use local key anyway; show a banner telling the user to log out → log in.
      setDmKeyMismatch(true);
      dmKeyPairRef.current = pair;
      setDmKeysReady(true);
      setDmMsgLoaded({});
      return;
    }

    // ── No local key at all ───────────────────────────────────────────────────
    // Try restoring from server backup (requires login password).
    if (password) {
      try {
        const { backup } = await api.getDmKeyBackup(password, authKdfSalt);
        if (backup) {
          const restored = await decryptDmKeyBackup(backup, password);
          if (restored) {
            await saveDmKeyPair(restored);
            dmKeyPairRef.current = restored;
            setDmKeyMismatch(false);
            setDmKeysReady(true);
            setDmMsgLoaded({});
            const restoredJwk = await exportPublicKeyJwk(restored.publicKey);
            if (!jwkPointMatches(restoredJwk, serverKeyJwk)) {
              // BUG 7: pass password so server can verify ownership before overwriting existing key
              await api.registerPublicKey(restoredJwk, password).catch(() => {});
            }
            return;
          }
        }
      } catch { /* non-fatal — fall through to generate */ }
    }

    // Generate a fresh key pair — either first-ever login or no backup available.
    pair = await generateDmKeyPair();
    // Set the ref BEFORE any persistence/network step — an IndexedDB write
    // failure must degrade to an in-memory key, never to "no key at all"
    // (the old unguarded await here stranded dmKeyPairRef as null forever).
    dmKeyPairRef.current = pair;
    await saveDmKeyPair(pair).catch((err) =>
      console.error('[setupDmKeys] could not persist fresh key (continuing in-memory):', err));
    setDmMsgLoaded({});
    const freshJwk = await exportPublicKeyJwk(pair.publicKey);
    // CLIENT-004: await registerPublicKey before setDmKeysReady so the server
    // has the public key before we start sending/receiving DMs.  Use try/catch
    // so a network error is visible in the console but never blocks the user.
    try {
      if (serverKeyJwk === null) {
        // Server has no key — register freely (no password needed).
        await api.registerPublicKey(freshJwk);
        setDmKeyMismatch(false);
      } else if (password) {
        // Server has a different key — override with password.
        await api.registerPublicKey(freshJwk, password);
        setDmKeyMismatch(false);
      } else {
        // Server has a key we can't override without credentials.
        // Flag mismatch — user needs to log in once to reconcile.
        setDmKeyMismatch(true);
      }
    } catch (err) {
      console.error('[setupDmKeys] registerPublicKey failed:', err);
      // Still mark keys ready so the user is not blocked from the DM UI.
    }
    setDmKeysReady(true);
    if (password) {
      try {
        const privJwk = await exportPrivateKeyJwk(pair.privateKey);
        if (privJwk) {
          const blob = await encryptDmKeyBackup(privJwk, password);
          await api.putDmKeyBackup(blob);
        }
      } catch { /* non-fatal */ }
    }
  }

  /**
   * Sync the local DM key pair from the server backup.
   * Used when a user has different keys on two devices — call from Security tab.
   * Clears the current local key and restores the backup using the provided password.
   */
  async function handleSyncDmKey(password: string): Promise<void> {
    const { backup } = await api.getDmKeyBackup(password, user?.authKdfSalt ?? null);
    if (!backup) throw new Error('No key backup found on server. Log in on your other device first.');
    const restored = await decryptDmKeyBackup(backup, password);
    if (!restored) throw new Error('Wrong password or corrupted backup.');
    await saveDmKeyPair(restored);
    dmKeyPairRef.current = restored;
    clearAllDmKeys();
    setDmMsgLoaded({});
    setDmMessages({});
    const pubJwk = await exportPublicKeyJwk(restored.publicKey);
    // BUG 6: pass password so the server can verify ownership before overwriting an existing key
    await api.registerPublicKey(pubJwk, password).catch(() => {});
    setDmKeyMismatch(false);
    // Clear backup-out-of-sync flag now that sync succeeded
    setDmBackupOutOfSync(false);
    // M-7: Raw password is not cached in sessionStorage.
    // Key pair is already saved to IndexedDB by saveDmKeyPair above — no password cache needed.
  }

  async function handleRotateKey(password: string): Promise<void> {
    // BUG 1: concurrent invocation guard
    if (rotatingRef.current) return;
    rotatingRef.current = true;

    // BUG 2: mark keys not ready during rotation so concurrent DM ops don't use a half-rotated key
    setDmKeysReady(false);
    // BUG 4: clear any previous backup-out-of-sync flag at the start of a new attempt
    setDmBackupOutOfSync(false);

    let newKeySaved = false;
    try {
      // BUG 5 (reordered): safe rotation order:
      // 1. Generate a new key pair (nothing touched yet).
      // 2. Export the public key JWK.
      // 3. Archive the current key FIRST — if this throws, abort before touching anything.
      // 4. Save the new key to IDB — if this throws, old key is in history.
      // 5. Update the in-memory ref.
      // 6. Push new public key to the server — if this fails, local state is correct; user can retry.
      // 7. Clear AES cache, reset DM message state.
      // 8. Upload backup (non-fatal).
      const newPair = await generateDmKeyPair();
      const pubJwk = await exportPublicKeyJwk(newPair.publicKey);

      // Step 3: archive old key first
      await archiveCurrentKeyPair();

      // Export private key BEFORE saving (while still extractable — saveDmKeyPair re-imports as non-extractable)
      const privJwkForBackup = await exportPrivateKeyJwk(newPair.privateKey);

      // Step 4: persist new key to IDB
      await saveDmKeyPair(newPair);
      newKeySaved = true;

      // Step 5: update in-memory ref
      dmKeyPairRef.current = newPair;

      // Step 6: register new public key on the server (password required to override existing key)
      // CRYPTO-005: prevents stolen-session MITM attacks.
      await api.registerPublicKey(pubJwk, password); // throws on network/server error

      // Step 7: flush cached AES-GCM keys so they are re-derived from the new private key
      clearAllDmKeys();
      // BUG 3: mirror handleSyncDmKey — clear stale decrypted DM messages after rotation
      setDmMsgLoaded({});
      setDmMessages({});

      // Step 8: upload new backup blob so other devices can restore the rotated key.
      // CRYPTO-014: without this, any device synced before rotation retains the old key.
      if (privJwkForBackup && password) {
        try {
          const blob = await encryptDmKeyBackup(privJwkForBackup, password);
          await api.putDmKeyBackup(blob);
        } catch {
          // BUG 4: surface backup failure instead of swallowing it silently
          setDmBackupOutOfSync(true);
        }
      }
    } catch (err) {
      // If the new key was never saved, re-enable keys so the user is not locked out
      // (the old key pair is still valid — either in IDB or now in archive history).
      // If it was saved but server registration failed, the user should retry rotation.
      if (!newKeySaved) {
        // Old key pair still intact — restore dmKeysReady so the user can still use DMs
        setDmKeysReady(true);
      }
      throw err;
    } finally {
      rotatingRef.current = false;
      // Only restore dmKeysReady here if the new key was saved successfully
      if (newKeySaved) {
        setDmKeysReady(true);
      }
    }
  }

  async function handleSetDnd(hours: number) {
    try {
      await api.setDnd(hours);
    } catch (err) {
      console.error('Failed to set DND', err);
    }
  }

  async function handleBlockUser(userId: string) {
    // Optimistic — revert on failure.
    setBlockedUserIds((prev) => new Set(prev).add(userId));
    try {
      await api.blockUser(userId);
    } catch (err) {
      console.error('Failed to block user', err);
      setBlockedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  async function handleToggleMute(scopeType: 'server' | 'channel', scopeId: string) {
    const current = scopeType === 'server' ? mutedServers : mutedChannelIds;
    const setFn = scopeType === 'server' ? setMutedServers : setMutedChannelIds;
    const nowMuted = !current.has(scopeId);
    setFn((prev) => {
      const next = new Set(prev);
      if (nowMuted) next.add(scopeId); else next.delete(scopeId);
      return next;
    });
    try {
      await api.setMute(scopeType, scopeId, nowMuted);
    } catch (err) {
      console.error('Failed to toggle mute', err);
      setFn((prev) => {
        const next = new Set(prev);
        if (nowMuted) next.delete(scopeId); else next.add(scopeId);
        return next;
      });
    }
  }

  // FEAT-020: client-side search over messages decrypted in memory (server only holds
  // ciphertext, so search cannot run server-side without breaking E2E).
  function buildSearchResults(q: string): SearchResult[] {
    if (!user) return [];
    const needle = q.toLowerCase();
    const out: SearchResult[] = [];
    const nameOf = (uid: string): string => {
      if (uid === user.id) return 'You';
      const m = Object.values(membersByServer).flat().find((mm) => mm.id === uid);
      if (m) return m.displayName;
      const d = dms.find((dd) => dd.otherUserId === uid);
      if (d) return d.otherDisplayName;
      return 'Unknown';
    };
    for (const [channelId, state] of Object.entries(channelMsgs)) {
      let channelName = 'channel';
      let serverName = '';
      for (const [sid, chList] of Object.entries(channelsByServer)) {
        const ch = chList.find((c) => c.id === channelId);
        if (ch) { channelName = ch.name; serverName = servers.find((s) => s.id === sid)?.name ?? ''; break; }
      }
      for (const m of state.messages) {
        if (m.failed || !m.body) continue;
        if (m.body.toLowerCase().includes(needle)) {
          out.push({
            id: m.id, kind: 'channel', containerId: channelId,
            containerName: `#${channelName}${serverName ? ' · ' + serverName : ''}`,
            senderName: nameOf(m.senderId), body: m.body, createdAt: m.createdAt,
          });
        }
      }
    }
    for (const [dmId, msgs] of Object.entries(dmMessages)) {
      const dm = dms.find((d) => d.id === dmId);
      const containerName = dm ? `@${dm.otherDisplayName}` : 'Direct message';
      for (const m of msgs) {
        if (m.failed || !m.body) continue;
        if (m.body.toLowerCase().includes(needle)) {
          out.push({
            id: m.id, kind: 'dm', containerId: dmId, containerName,
            senderName: m.senderId === user.id ? 'You' : (dm?.otherDisplayName ?? 'Them'),
            body: m.body, createdAt: m.createdAt,
          });
        }
      }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out.slice(0, 50);
  }

  function handleSearchSelect(r: SearchResult) {
    if (r.kind === 'dm') {
      setView('dm');
      setActiveDmId(r.containerId);
      return;
    }
    for (const [sid, chList] of Object.entries(channelsByServer)) {
      if (chList.some((c) => c.id === r.containerId)) {
        setView('server');
        setActiveServerId(sid);
        setActiveChannelId(r.containerId);
        break;
      }
    }
  }

  async function handleUnblockUser(userId: string) {
    setBlockedUserIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    try {
      await api.unblockUser(userId);
    } catch (err) {
      console.error('Failed to unblock user', err);
      setBlockedUserIds((prev) => new Set(prev).add(userId));
    }
  }

  async function handleRevokeOtherSessions() {
    try {
      await api.revokeOtherSessions();
      // The server will emit 'session:revoked' to other devices.
      // On this device, nothing changes.
    } catch (err) {
      console.error('Failed to revoke sessions', err);
    }
  }

  async function handleExportData() {
    try {
      const blob = await api.exportMyData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recline-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export data', err);
    }
  }

  async function handleDeleteAccount(password: string) {
    try {
      await api.deleteMyAccount(password);
      // Treat same as logout — clear all state
      logout();
    } catch (err) {
      console.error('Failed to delete account', err);
    }
  }

  /* ------------------------ Render ------------------------ */
  if (!authChecked) return (
    <div className="h-full grid place-items-center bg-ink-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-600 to-rose-500 grid place-items-center text-2xl select-none">
          🔒
        </div>
        <div className="h-5 w-5 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
      </div>
    </div>
  );
  if (!user) return <Auth onAuthed={(u, pw) => {
    setupPasswordRef.current = pw;
    setUser(u);
    // M-7: Raw password is no longer written to sessionStorage.
    // The key pair is persisted in IndexedDB by setupDmKeys; page refreshes load it from there.
    // Subscribe to Web Push if permission already granted (user may have granted it in a prior session)
    if (Notification.permission === 'granted') registerPushSubscription();
  }} />;

  const channels = activeServerId ? channelsByServer[activeServerId] ?? [] : [];
  const members = activeServerId ? membersByServer[activeServerId] ?? [] : [];
  const activeMsgs = activeChannelId ? channelMsgs[activeChannelId]?.messages ?? [] : [];
  const canManage = activeServer?.role === 'owner';

  // Whether the current user can assign/remove roles in the active server
  const canManageRoles = (() => {
    if (!activeServer || !user) return false;
    if (activeServer.role === 'owner') return true;
    const myMember = members.find((m) => m.id === user.id);
    if (!myMember?.roles?.length) return false;
    const serverRoles = activeServerId ? (rolesByServer[activeServerId] ?? []) : [];
    const myRolePerms = myMember.roles
      .map((mr) => serverRoles.find((sr) => sr.id === mr.id)?.permissions ?? 0);
    return hasPermission(computeEffectivePerms(myRolePerms), Permissions.MANAGE_ROLES);
  })();

  return (
    <>
    {/* Persistent audio — keeps remote call audio playing regardless of which
        channel view is shown. All <video> elements in CallView are muted;
        these <audio> elements handle playback. */}
    {callPeers.flatMap((peer) =>
      peer.streams.map((rs) => (
        <AudioTrack
          key={`${peer.socketId}:${rs.streamId}`}
          stream={rs.stream}
          deafened={deafOn}
          volume={peerVolumes[peer.socketId] ?? 1}
        />
      ))
    )}

    {/* Mobile scrim — closes any open sidebar when tapped */}
    {(mobileSidebarOpen || mobileMembersOpen) && (
      <div
        className="mobile-scrim md:hidden"
        onClick={() => { setMobileSidebarOpen(false); setMobileMembersOpen(false); }}
      />
    )}

    <div className="h-full w-full flex bg-app-grad overflow-hidden">
      {/* ServerRail: always visible on desktop; on mobile sits above everything as a thin strip
          hidden behind the sidebar toggle — we keep it visible but it's only 72px wide */}
      <ServerRail
        servers={servers}
        activeId={activeServerId}
        onSelect={(id) => {
          setView('server');
          setMobileSidebarOpen(false);
          setMobileMembersOpen(false);
          if (id === activeServerId) {
            // Re-clicking the active server → return to server home
            setActiveChannelId(null);
          } else {
            setActiveServerId(id);
          }
        }}
        onCreate={() => setCreateOpen(true)}
        onJoin={() => setJoinOpen(true)}
        onLogout={logout}
        onOpenProfile={() => setProfileOpen(true)}
        onViewProfile={() => setProfileCardUserId(user.id)}
        myStatus={myStatus}
        onSetStatus={handleSetStatus}
        onSendFeedback={() => setFeedbackOpen(true)}
        me={user}
        unreadByServer={unreadByServer}
        connectionState={connectionState}
        view={view}
        onViewChange={(v) => { setView(v); setMobileSidebarOpen(false); setMobileMembersOpen(false); }}
        dmUnread={totalDmUnread}
        onReorder={handleServerReorder}
        sparksBalance={sparksBalance}
      />

      {view === 'dm' ? (
        <>
          {/* DM list: full panel on desktop, slide-in overlay on mobile */}
          <div className="hidden md:block">
            <DmList
              dms={dms}
              activeDmId={activeDmId}
              unread={dmUnreadMap}
              online={online}
              onSelect={(dm) => { setActiveDmId(dm.id); setMobileSidebarOpen(false); }}
              friends={friends}
              onFriendsChange={setFriends}
              onOpenDmWithUser={openDm}
              onMarkAllRead={handleMarkAllDmsRead}
              statuses={userStatuses}
            />
          </div>
          {/* Mobile slide-in DM list */}
          <div className={`mobile-sidebar md:hidden ${mobileSidebarOpen ? 'open' : 'closed'}`}>
            <div className="w-full h-full flex flex-col overflow-hidden">
              <DmList
                dms={dms}
                activeDmId={activeDmId}
                unread={dmUnreadMap}
                online={online}
                onSelect={(dm) => { setActiveDmId(dm.id); setMobileSidebarOpen(false); }}
                friends={friends}
                onFriendsChange={setFriends}
                onOpenDmWithUser={(userId) => { openDm(userId); setMobileSidebarOpen(false); }}
                onMarkAllRead={handleMarkAllDmsRead}
                statuses={userStatuses}
              />
            </div>
          </div>

          {dmKeyMismatch && (
            <div className="mx-4 mt-3 mb-0 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 text-[12px] text-amber-300 shrink-0">
              <div className="flex items-start gap-2 mb-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span className="flex-1">DM encryption keys out of sync — enter your password to restore end-to-end encryption.</span>
                <button onClick={() => { setDmKeyMismatch(false); setDmSyncPw(''); setDmSyncErr(''); }} className="shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!dmSyncPw || dmSyncLoading) return;
                  setDmSyncLoading(true);
                  setDmSyncErr('');
                  try {
                    await handleSyncDmKey(dmSyncPw);
                    setDmSyncPw('');
                  } catch (err: unknown) {
                    setDmSyncErr((err as Error).message ?? 'Sync failed — check your password.');
                  } finally {
                    setDmSyncLoading(false);
                  }
                }}
                className="flex gap-2 items-center"
              >
                <input
                  type="password"
                  value={dmSyncPw}
                  onChange={(e) => setDmSyncPw(e.target.value)}
                  placeholder="Account password"
                  className="flex-1 min-w-0 bg-ink-800 border border-white/[0.09] rounded-lg px-3 py-1.5 text-[12px] text-ink-100 placeholder:text-ink-500 outline-none focus:border-amber-500/50"
                  disabled={dmSyncLoading}
                  autoComplete="current-password"
                />
                <button
                  type="submit"
                  disabled={!dmSyncPw || dmSyncLoading}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {dmSyncLoading ? 'Syncing…' : 'Sync Keys'}
                </button>
              </form>
              {dmSyncErr && <p className="mt-1.5 text-red-400 text-[11px]">{dmSyncErr}</p>}
            </div>
          )}

          {activeDm ? (
            <DmView
              dm={activeDm}
              messages={dmMessages[activeDm.id] ?? []}
              me={user}
              online={online}
              onSend={(text, file, replyToId) => sendDmMessage(activeDm.id, text, file, replyToId)}
              onDelete={(msgId) => deleteDmMessage(activeDm.id, msgId)}
              onEdit={(msgId, newText) => editDmMessage(activeDm.id, msgId, newText)}
              onClearChat={() => clearDmChat(activeDm.id)}
              onReact={(dmMessageId, emoji) => handleDmReact(dmMessageId, activeDm.id, emoji)}
              onTyping={() => handleDmTyping(activeDm.id)}
              isTyping={!!dmTyping[activeDm.id]}
              call={dmCall?.dmChannelId === activeDm.id ? dmCall : null}
              onCallStart={(hasVideo) => startDmCall(activeDm.id, hasVideo)}
              hasMore={dmHasMore[activeDm.id] ?? false}
              onLoadMore={() => loadMoreDmMessages(activeDm.id)}
              onOpenSidebar={() => setMobileSidebarOpen(true)}
              onClickUser={setProfileCardUserId}
              peerFingerprint={peerFingerprints[activeDm.otherUserId]}
              peerKeyChanged={peerKeyChanged.has(activeDm.otherUserId)}
              onAcceptPeerKey={() => handleAcceptPeerKey(activeDm.id)}
            />
          ) : (
            <div className="flex-1 grid place-items-center text-ink-300 text-sm px-4 text-center">
              <div className="flex flex-col items-center gap-3">
                <button
                  className="md:hidden btn-primary px-5 py-3 text-base rounded-xl flex items-center gap-2"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Open Conversations
                </button>
                <p className="hidden md:block">Select a conversation or open one from the member list</p>
                <p className="md:hidden text-ink-400 text-xs">Tap above to view your conversations</p>
              </div>
            </div>
          )}
        </>
      ) : activeServer ? (
        <>
          {/* Channel list: full panel on desktop, slide-in overlay on mobile */}
          <div className="hidden md:block shrink-0 overflow-hidden" style={{ width: channelListWidth }}>
            <ChannelList
              server={activeServer}
              channels={channels}
              activeChannelId={activeChannelId}
              onSelect={selectChannel}
              onCreateChannel={(name, type) => createChannel(name, type)}
              canManage={canManage}
              inviteCode={activeServer.invite_code}
              encrypted={isEncrypted}
              callRoster={callRoster}
              unread={unread}
              onOpenSettings={() => setSettingsOpen(true)}
              onDeleteChannel={handleDeleteChannel}
              serverMuted={mutedServers.has(activeServer.id)}
              mutedChannels={mutedChannelIds}
              onToggleServerMute={() => handleToggleMute('server', activeServer.id)}
              onToggleChannelMute={(cid) => handleToggleMute('channel', cid)}
              onOpenSearch={() => setSearchOpen(true)}
              onMarkAllRead={() => handleMarkServerRead(activeServer.id)}
            />
          </div>
          {/* Resize handle — desktop only */}
          <div
            className="hidden md:block w-1 shrink-0 cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors"
            onMouseDown={(e) => startPanelResize(e, 'channel')}
          />
          {/* Mobile slide-in channel list */}
          <div className={`mobile-sidebar md:hidden ${mobileSidebarOpen ? 'open' : 'closed'}`}>
            <ChannelList
              server={activeServer}
              channels={channels}
              activeChannelId={activeChannelId}
              onSelect={selectChannel}
              onCreateChannel={(name, type) => createChannel(name, type)}
              canManage={canManage}
              inviteCode={activeServer.invite_code}
              encrypted={isEncrypted}
              callRoster={callRoster}
              unread={unread}
              onOpenSettings={() => { setSettingsOpen(true); setMobileSidebarOpen(false); }}
              onDeleteChannel={handleDeleteChannel}
              serverMuted={mutedServers.has(activeServer.id)}
              mutedChannels={mutedChannelIds}
              onToggleServerMute={() => handleToggleMute('server', activeServer.id)}
              onToggleChannelMute={(cid) => handleToggleMute('channel', cid)}
              onOpenSearch={() => { setSearchOpen(true); setMobileSidebarOpen(false); }}
              onMarkAllRead={() => handleMarkServerRead(activeServer.id)}
            />
          </div>

          {activeChannel ? (
            activeChannel.type === 'text' ? (
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                {/* VoiceBar: shown whenever a call is active in another channel */}
                {inCall && activeCallChannel && (
                  <VoiceBar
                    channelName={activeCallChannel.name}
                    micOn={micOn}
                    onToggleMic={() => {
                      const next = callManagerRef.current?.toggleMic(!micOn) ?? micOn;
                      setMicOn(next);
                      playCallSound(next ? 'unmute' : 'mute');
                    }}
                    deafOn={deafOn}
                    onToggleDeafen={handleToggleDeafen}
                    onLeave={handleLeaveCall}
                    onReturn={returnToCall}
                  />
                )}
                <ChatPanel
                  channel={activeChannel}
                  messages={activeMsgs}
                  members={memberMap}
                  me={user}
                  encrypted={isEncrypted}
                  typingIds={channelTyping}
                  onSend={handleSendMessage}
                  onTyping={emitTyping}
                  onUnlock={() => setUnlockTarget(activeServerId)}
                  onDelete={deleteMessage}
                  onEdit={handleEditMessage}
                  onReaction={handleReaction}
                  onSpark={handleSparkMessage}
                  onReport={activeServerId ? async (messageId, senderId, reason, note) => {
                    await api.submitReport(activeServerId, {
                      reason,
                      note: note || undefined,
                      messageId,
                      reportedUserId: senderId,
                    });
                  } : undefined}
                  hasMore={channelMsgs[activeChannelId!]?.hasMore ?? false}
                  onLoadMore={() => loadMoreMessages(activeChannelId!)}
                  onOpenSidebar={() => setMobileSidebarOpen(true)}
                  onOpenMembers={() => setMobileMembersOpen(true)}
                  onClickUser={setProfileCardUserId}
                  sparksBalance={sparksBalance}
                  headerActions={activeServerId ? (
                    <BroadcastButton
                      serverId={activeServerId}
                      sparksBalance={sparksBalance}
                      socket={socketRef.current}
                      isOwner={canManage}
                    />
                  ) : undefined}
                />
              </div>
            ) : (
              <CallView
                channel={activeChannel}
                manager={callManagerRef.current!}
                me={user}
                members={memberMap}
                inCall={inCall}
                micOn={micOn}
                onToggleMic={setMicOn}
                onJoinSuccess={() => { setInCall(true); playCallSound('join_call'); }}
                onLeave={handleLeaveCall}
                localStream={localStream}
                localScreen={localScreen}
                peers={callPeers}
                deafOn={deafOn}
                onToggleDeafen={handleToggleDeafen}
                peerVolumes={peerVolumes}
                onSetVolume={(socketId, vol) => setPeerVolumes((prev) => ({ ...prev, [socketId]: vol }))}
                onOpenSidebar={() => setMobileSidebarOpen(true)}
              />
            )
          ) : (
            <ServerHome
              server={activeServer}
              channels={channels}
              members={members}
              online={online}
              callRoster={callRoster}
              unread={unread}
              channelMsgs={channelMsgs}
              keysReady={isEncrypted}
              onUnlock={() => setUnlockTarget(activeServerId)}
              onSelectChannel={selectChannel}
              me={user}
              onOpenSidebar={() => setMobileSidebarOpen(true)}
            />
          )}

          {/* Member list: always rendered but hidden on mobile via CSS; slide-in overlay uses portal pattern */}
          {/* Resize handle — desktop only */}
          <div
            className="hidden md:block w-1 shrink-0 cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors"
            onMouseDown={(e) => startPanelResize(e, 'member')}
          />
          <div className="hidden md:flex shrink-0 overflow-hidden" style={{ width: memberListWidth }}>
            <MemberList
              members={members}
              online={online}
              statuses={userStatuses}
              me={user}
              onOpenDm={openDm}
              onClickUser={setProfileCardUserId}
              className="w-full"
              roles={activeServerId ? (rolesByServer[activeServerId] ?? []) : []}
              canManageRoles={canManageRoles}
              onAssignRole={assignRole}
              onRemoveRole={removeRole}
            />
          </div>
          {/* Mobile member list slide-in */}
          <div className={`mobile-sidebar-right md:hidden ${mobileMembersOpen ? 'open' : 'closed'}`}>
            <MemberList
              members={members}
              online={online}
              statuses={userStatuses}
              me={user}
              onOpenDm={(userId) => { openDm(userId); setMobileMembersOpen(false); }}
              onClickUser={(uid) => { setProfileCardUserId(uid); setMobileMembersOpen(false); }}
              roles={activeServerId ? (rolesByServer[activeServerId] ?? []) : []}
              canManageRoles={canManageRoles}
              onAssignRole={assignRole}
              onRemoveRole={removeRole}
            />
          </div>
        </>
      ) : servers.length === 0 ? (
        <EmptyHome
          onCreateServer={() => setCreateOpen(true)}
          onJoinServer={() => setJoinOpen(true)}
        />
      ) : (
        <Welcome onCreate={() => setCreateOpen(true)} onJoin={() => setJoinOpen(true)} />
      )}

      {/* Vanity invite join modal — shown when user arrives via /invite/<code> */}
      {user && pendingInviteCode && (
        <InviteJoinModal
          code={pendingInviteCode}
          onClose={() => setPendingInviteCode(null)}
          onJoined={async (server, channels, passphrase) => {
            setPendingInviteCode(null);
            // Pre-populate channels so the UI is ready immediately
            setChannelsByServer((prev) => ({ ...prev, [server.id]: channels }));
            setServers((prev) => (prev.find((s) => s.id === server.id) ? prev : [...prev, server]));
            // Derive + cache AES key from the passphrase the user just typed
            const key = await deriveServerKey(passphrase, server.id, server.kdf_salt ?? null);
            cacheKey(server.id, key);
            cachePassphrase(server.id, passphrase, server.kdf_salt ?? null);
            setKeysReady((prev) => ({ ...prev, [server.id]: true }));
            setActiveServerId(server.id);
            socketRef.current?.emit('server:join', server.id);
          }}
        />
      )}

      <CreateServerDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createServer} />
      <JoinServerDialog open={joinOpen} onClose={() => setJoinOpen(false)} onJoin={joinServer} />
      <UnlockDialog
        open={!!unlockTarget && unlockTarget === activeServerId && !keysReady[unlockTarget!]}
        serverName={activeServer?.name ?? ''}
        onClose={() => setUnlockTarget(null)}
        onUnlock={handleUnlock}
      />
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        search={buildSearchResults}
        onSelect={handleSearchSelect}
      />
      <ProfileDialog
        open={profileOpen}
        onClose={() => { setProfileOpen(false); setProfileInitialTab('profile'); }}
        me={user}
        initialTab={profileInitialTab}
        onUpdated={(u) => setUser(u)}
        onRotateKey={handleRotateKey}
        onSyncKey={handleSyncDmKey}
        isSupporter={isSupporter}
        sparksBalance={sparksBalance}
        onSparksUpdate={setSparksBalance}
        dmBackupOutOfSync={dmBackupOutOfSync}
        myFingerprint={myFingerprint}
        onSetDnd={handleSetDnd}
        onRevokeOtherSessions={handleRevokeOtherSessions}
        onExportData={handleExportData}
        onDeleteAccount={handleDeleteAccount}
      />
      {activeServer && settingsOpen && (
        <ServerSettingsDialog
          open={settingsOpen}
          server={activeServer}
          members={members}
          me={user}
          onClose={() => setSettingsOpen(false)}
          onRename={(name) => renameServer(activeServer.id, name)}
          onChangePassphrase={(current, pass) => changeServerPassphrase(activeServer.id, current, pass)}
          onKick={(userId) => kickMember(activeServer.id, userId)}
          onBan={(userId, reason) => banMember(activeServer.id, userId, reason)}
          onLeave={() => leaveServer(activeServer.id)}
          onDelete={() => deleteServer(activeServer.id)}
          onIconChange={(iconUrl) =>
            setServers((prev) =>
              prev.map((s) => s.id === activeServer.id ? { ...s, icon_url: iconUrl } : s),
            )
          }
          roles={rolesByServer[activeServer.id] ?? []}
          onRolesChange={(roles) => setRolesByServer((prev) => ({ ...prev, [activeServer.id]: roles }))}
        />
      )}
      <FeedbackButton open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {/* DM incoming call modal — shown on top of everything */}
      {dmCall?.status === 'incoming-ringing' && (
        <DmCallIncoming
          callerUserId={dmCall.peerUserId}
          callerName={dmCall.peerName}
          callerAvatarUrl={dmCall.peerAvatarUrl}
          hasVideo={dmCall.hasVideo}
          onAccept={(withVideo) => acceptDmCall(withVideo)}
          onDecline={rejectDmCall}
        />
      )}

      {/* DM call window — floating, draggable, shown for all active call states */}
      {dmCall && dmCall.status !== 'incoming-ringing' && (
        <DmCallWindow
          call={dmCall}
          myName={user.displayName}
          myAvatarUrl={user.avatarUrl ?? null}
          myId={user.id}
          onMute={toggleDmMute}
          onToggleVideo={toggleDmVideo}
          onScreenShare={startDmScreenShare}
          onStopScreenShare={stopDmScreenShare}
          onSetPeerVolume={setDmPeerVolume}
          onHangUp={hangUpDmCall}
        />
      )}

      {/* Broadcast overlay — shown sequentially when server broadcasts arrive */}
      <BroadcastOverlay
        queue={broadcastQueue}
        onDequeue={() => setBroadcastQueue((prev) => prev.slice(1))}
      />
      {showSupporterToast && (
        <SupporterToast onDismiss={() => setShowSupporterToast(false)} />
      )}
      {streakToast && (
        <SparkStreakToast
          reward={streakToast.reward}
          streak={streakToast.streak}
          onDismiss={() => setStreakToast(null)}
        />
      )}
      {/* User profile card — shown when clicking a member/DM user anywhere in the app */}
      {profileCardUserId && (() => {
        // 0. If viewing own profile, build from user session (always has badges)
        if (profileCardUserId === user.id) {
          const selfMember: import('./types').Member = {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl ?? null,
            isStaff: user.isStaff ?? false,
            isPlatformOwner: user.isPlatformOwner ?? false,
            isSupporter: user.isSupporter ?? false,
            role: 'member',
            // Use account creation date for own profile "Joined" date.
            // user.createdAt is set by the login/me/signup responses (users.created_at).
            joinedAt: user.createdAt ?? 0,
            roles: Object.values(membersByServer).flat().find((m) => m.id === user.id)?.roles ?? [],
          };
          return (
            <UserProfileCard
              member={selfMember}
              me={user}
              online={true}
              onClose={() => setProfileCardUserId(null)}
            />
          );
        }

        // 1. Check server member lists (richest data — includes roles + badges)
        const allMembers = Object.values(membersByServer).flat();
        let profileMember = allMembers.find((m) => m.id === profileCardUserId);

        // 2. Fall back to DM channel data (for users with no shared server)
        if (!profileMember) {
          const dm = dms.find((d) => d.otherUserId === profileCardUserId);
          if (dm) {
            profileMember = {
              id: dm.otherUserId,
              username: dm.otherUsername,
              displayName: dm.otherDisplayName,
              avatarUrl: dm.otherAvatarUrl ?? null,
              role: 'member',
              joinedAt: dm.otherCreatedAt ?? 0,
              roles: [],
            } as import('./types').Member;
          }
        }

        // 3. Fall back to friends list
        if (!profileMember) {
          const friend = friends.find((f) => f.userId === profileCardUserId);
          if (friend) {
            profileMember = {
              id: friend.userId,
              username: friend.username,
              displayName: friend.displayName,
              avatarUrl: friend.avatarUrl ?? null,
              role: 'member',
              joinedAt: friend.otherCreatedAt ?? 0,
              roles: [],
            } as import('./types').Member;
          }
        }

        if (!profileMember) return null;
        return (
          <UserProfileCard
            member={profileMember}
            me={user}
            online={online.has(profileMember.id) || profileMember.id === user.id}
            onClose={() => setProfileCardUserId(null)}
            onDm={profileMember.id !== user.id ? () => { openDm(profileMember.id); setProfileCardUserId(null); } : undefined}
            isBlocked={blockedUserIds.has(profileMember.id)}
            onBlock={() => handleBlockUser(profileMember!.id)}
            onUnblock={() => handleUnblockUser(profileMember!.id)}
          />
        );
      })()}
    </div>
    </>
  );
}
