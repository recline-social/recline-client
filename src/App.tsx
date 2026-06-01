import { useEffect, useMemo, useRef, useState, type FC, type MutableRefObject } from 'react';
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
import { ServerSettingsDialog } from './components/ServerSettingsDialog';
import { DmList } from './components/DmList';
import { DmView } from './components/DmView';
import { ServerHome } from './components/ServerHome';
import { ServerSetup } from './components/ServerSetup';
import { isDesktop, getServerUrl, setServerUrl } from './lib/serverUrl';
import { api, getToken, setToken } from './lib/api';
import { connectSocket, disconnectSocket } from './lib/socket';
import {
  cacheKey,
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
  importPeerPublicKey,
  deriveDmKey,
  cacheDmKey,
  getCachedDmKey,
  importDmKeyFromSession,
  clearAllDmKeys,
  rotateDmKeyPair,
  archiveCurrentKeyPair,
  loadDmKeyHistory,
} from './lib/crypto';
import { CallManager, type PeerSnapshot } from './lib/webrtc';
import { VoiceBar } from './components/VoiceBar';
import { FeedbackButton } from './components/FeedbackButton';
import { UserProfileCard } from './components/UserProfileCard';
import { BroadcastOverlay, type BroadcastPayload } from './components/BroadcastOverlay';
import { BroadcastButton } from './components/BroadcastButton';
import { Permissions, hasPermission, computeEffectivePerms } from './lib/permissions';
import {
  requestNotificationPermission,
  showNotification,
  shouldNotify,
} from './lib/notifications';

// ── Persistent audio: keeps remote streams audible when CallView is not mounted ─
const MSG_PAGE = 50; // messages per pagination page

const AudioTrack: FC<{ stream: MediaStream }> = ({ stream }) => {
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

  // messages per channel (decoded)
  const [channelMsgs, setChannelMsgs] = useState<Record<string, ChannelState>>({});

  // typing: serverId -> channelId -> Set<userId>
  const [typing, setTyping] = useState<Record<string, Record<string, Set<string>>>>({});

  // unread counts per channel
  const [unread, setUnread] = useState<Record<string, number>>({});

  // encryption key readiness per server
  const [keysReady, setKeysReady] = useState<Record<string, boolean>>({});
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);

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
  const [dmHasMore, setDmHasMore] = useState<Record<string, boolean>>({});
  const [dmUnreadMap, setDmUnreadMap] = useState<Record<string, number>>({});

  // friends list
  const [friends, setFriends] = useState<Friend[]>([]);

  // socket connection state shown in the UI
  const [connectionState, setConnectionState] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');

  // desktop builds need a configured server URL before anything else
  const [needsServer, setNeedsServer] = useState<boolean>(() => isDesktop() && !getServerUrl());

  // mobile sidebar visibility
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileMembersOpen, setMobileMembersOpen] = useState(false);
  // Profile card — userId of member whose card is open
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);

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

  // browser notification permission (requested once after login)
  const notifPermRef = useRef<NotificationPermission>('default');

  // ECDH DM key pair — generated once, persisted in localStorage, held in memory
  const dmKeyPairRef = useRef<CryptoKeyPair | null>(null);
  // Fresh DM list accessible in socket callbacks without stale-closure issues
  const dmsRef = useRef(dms);
  useEffect(() => { dmsRef.current = dms; }, [dms]);

  const socketRef = useRef<Socket | null>(null);
  // Guard against concurrent unlock attempts (user double-clicking the unlock button)
  const unlockingRef = useRef(false);
  // Tracks DM channels currently being loaded to prevent double-fetch race (#loadDmMessages)
  const dmLoadingRef = useRef<Set<string>>(new Set());
  // tracks active typing auto-clear timers so they can be cancelled on stop/unmount
  const typingTimersRef = useRef<Map<string, number>>(new Map());

  // refs so socket handlers always see fresh state (avoids stale closures
  // because the handlers are bound once when the socket connects).
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

  // when the tab regains visibility, treat the active channel/DM as read
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      const channelId = activeChannelIdRef.current;
      if (channelId) {
        setUnread((prev) => (prev[channelId] ? { ...prev, [channelId]: 0 } : prev));
      }
      const dmId = activeDmIdRef.current;
      if (dmId && viewRef.current === 'dm') {
        setDmUnreadMap((prev) => (prev[dmId] ? { ...prev, [dmId]: 0 } : prev));
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
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
    if (needsServer) {
      setAuthChecked(true);
      return;
    }
    if (!getToken()) {
      setAuthChecked(true);
      return;
    }
    api
      .me()
      .then((r) => {
        setUser(r.user);
        // Request notification permission once (non-blocking)
        requestNotificationPermission().then((granted) => {
          notifPermRef.current = granted ? 'granted' : Notification.permission;
        });
      })
      .catch(() => {
        setToken(null);
      })
      .finally(() => setAuthChecked(true));
  }, [needsServer]);

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
      if (!isFocused && msg.senderId !== user.id) {
        setUnread((prev) => ({ ...prev, [msg.channelId]: (prev[msg.channelId] ?? 0) + 1 }));
      }

      // Desktop notification when tab is hidden and message is from someone else.
      // Also fires for mentions even when the tab is not the active channel (but
      // still hidden), using shouldNotify() as the final gate.
      if (msg.senderId !== user.id && shouldNotify()) {
        const senderName = (() => {
          for (const members of Object.values(membersByServerRef.current)) {
            const m = members.find((m) => m.id === msg.senderId);
            if (m) return m.displayName;
          }
          return 'Someone';
        })();
        const channelName = lookupChannel(msg.channelId)?.name ?? 'unknown';
        const isMention = !failed && body.includes(`@${user.displayName}`);

        if (!isFocused || isMention) {
          showNotification(
            isMention
              ? `Mentioned in #${channelName}`
              : `${senderName} in #${channelName}`,
            key ? body : 'New encrypted message',
            {
              tag: msg.channelId,
            },
          );
        }
      }
    };

    const onPresence = (data: { userId: string; online: boolean }) => {
      setOnline((prev) => {
        const next = new Set(prev);
        if (data.online) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
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
      // Decrement unread when a message that was unread gets deleted (#25)
      setUnread((prev) => {
        const cur = prev[data.channelId] ?? 0;
        return cur > 0 ? { ...prev, [data.channelId]: cur - 1 } : prev;
      });
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
        try {
          const { dms: fresh } = await api.listDms();
          // Sync ref immediately so we can decrypt in this callback without waiting for a re-render.
          dmsRef.current = fresh;
          setDms(fresh);
          dmChannel = fresh.find((d) => d.id === wire.dmChannelId);
        } catch { /* non-fatal — fall back to empty body below */ }
      }

      // Decrypt — tryDecryptDm falls back through archived historical keys on failure
      let decoded: DmMessage;
      if (wire.ciphertext && wire.nonce && dmChannel) {
        try {
          const body = await tryDecryptDm(wire.ciphertext, wire.nonce, dmChannel);
          decoded = { ...wire, body, failed: false };
        } catch {
          decoded = { ...wire, body: '[could not decrypt]', failed: true };
        }
      } else {
        decoded = { ...wire, body: wire.body ?? '', failed: false };
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
      if (decoded.senderId !== user.id) {
        const isFocused = activeDmIdRef.current === decoded.dmChannelId && viewRef.current === 'dm' && document.visibilityState === 'visible';
        if (!isFocused) {
          setDmUnreadMap((prev) => ({ ...prev, [decoded.dmChannelId]: (prev[decoded.dmChannelId] ?? 0) + 1 }));
          // Desktop notification
          showNotification(
            `New message from ${dmChannel?.otherDisplayName ?? 'Someone'}`,
            decoded.failed ? 'New encrypted message' : (decoded.body || 'New message'),
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

    // DM chat cleared
    const onDmCleared = (data: { dmChannelId: string }) => {
      setDmMessages((prev) => ({ ...prev, [data.dmChannelId]: [] }));
      setDmUnreadMap((prev) => { const n = { ...prev }; delete n[data.dmChannelId]; return n; });
      setDms((prev) => prev.map((d) => d.id === data.dmChannelId ? { ...d, lastMessageAt: null } : d));
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

    s.on('message:new', onMessage);
    s.on('presence:update', onPresence);
    s.on('typing:start', onTypingStart);
    s.on('typing:stop', onTypingStop);
    s.on('voice:activity', onVoiceActivity);
    s.on('member:joined', onMemberJoined);
    s.on('user:updated', onUserUpdated);
    s.on('friendship:accepted', onFriendshipAccepted);
    s.on('message:deleted', onMessageDeleted);
    s.on('member:kicked', onMemberKicked);
    s.on('server:deleted', onServerDeleted);
    s.on('server:updated', onServerUpdated);
    s.on('server:passphrase_changed', onServerPassphraseChanged);
    s.on('dm:message:new', onDmMessageNew);
    s.on('dm:message:deleted', onDmMessageDeleted);
    s.on('dm:cleared', onDmCleared);
    s.on('reaction:update', onReactionUpdate);
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
      setBroadcastQueue((prev) => [...prev, payload]);
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
      onPeers: setCallPeers,
      onLocalStream: setLocalStream,
      onLocalScreen: setLocalScreen,
      onCallEnded: () => { setInCall(false); setMicOn(true); }, // #9
    });

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.io.off('reconnect_attempt', onReconnectAttempt);
      s.off('connect_error', onConnectError);
      s.off('message:new', onMessage);
      s.off('presence:update', onPresence);
      s.off('typing:start', onTypingStart);
      s.off('typing:stop', onTypingStop);
      s.off('voice:activity', onVoiceActivity);
      s.off('member:joined', onMemberJoined);
      s.off('user:updated', onUserUpdated);
      s.off('friendship:accepted', onFriendshipAccepted);
      s.off('message:deleted', onMessageDeleted);
      s.off('member:kicked', onMemberKicked);
      s.off('server:deleted', onServerDeleted);
      s.off('server:updated', onServerUpdated);
      s.off('server:passphrase_changed', onServerPassphraseChanged);
      s.off('dm:message:new', onDmMessageNew);
      s.off('dm:message:deleted', onDmMessageDeleted);
      s.off('dm:cleared', onDmCleared);
      s.off('reaction:update', onReactionUpdate);
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
    // Init ECDH DM key pair (generate once, persist in localStorage)
    (async () => {
      let pair = await loadDmKeyPair();
      if (!pair) {
        pair = await generateDmKeyPair();
        await saveDmKeyPair(pair);
      }
      dmKeyPairRef.current = pair;
      // Register public key with server so peers can derive shared secrets
      const pubJwk = await exportPublicKeyJwk(pair.publicKey);
      await api.registerPublicKey(pubJwk).catch(() => {/* non-fatal */});
    })();

    // Pre-fetch DMs
    api.listDms().then((r) => setDms(r.dms)).catch(() => {});
    // Pre-fetch friends list
    api.listFriends().then((r) => setFriends(r.friends)).catch(() => {});
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
    if (!keysReady[activeServerId] && !getCachedKey(activeServerId)) {
      setUnlockTarget(activeServerId);
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, activeServerId, keysReady]);

  /* ------------------------ DM message loader ------------------------ */
  useEffect(() => {
    if (!activeDmId) return;
    loadDmMessages(activeDmId);
    // Clear unread when switching to this DM
    setDmUnreadMap((prev) => prev[activeDmId] ? { ...prev, [activeDmId]: 0 } : prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDmId]);

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

  async function handleSendMessage(text: string, replyToId?: string | null, animationType?: string) {
    if (!activeServerId || !activeChannelId) return;
    if (text.length > 4000) throw new Error('Message too long (max 4000 characters)');
    const key = getCachedKey(activeServerId);
    const socket = socketRef.current;
    if (!key || !socket) return;
    const { ciphertext, nonce } = await encryptText(key, text);
    return new Promise<void>((resolve, reject) => {
      socket.emit(
        'message:send',
        { channelId: activeChannelId, ciphertext, nonce, replyToId: replyToId ?? null, animationType: animationType ?? null },
        (resp: { ok: boolean; id?: string; error?: string }) => {
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
      socket.emit('message:delete', { id }, (resp: { ok: boolean; error?: string } | undefined) => {
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

  function handleSparkMessage(messageId: string, amount: number) {
    const socket = socketRef.current;
    if (!socket) return;
    // Find the channel for this message to pass channelId
    let channelId: string | null = null;
    for (const [cid, state] of Object.entries(channelMsgs)) {
      if (state.messages.some((m) => m.id === messageId)) { channelId = cid; break; }
    }
    if (!channelId) return;
    socket.emit(
      'message:spark',
      { messageId, channelId, amount },
      (resp: { ok: boolean; newBalance?: number; error?: string } | undefined) => {
        if (resp?.ok && typeof resp.newBalance === 'number') {
          setSparksBalance(resp.newBalance);
        }
      },
    );
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
    await api.assignRole(activeServerId, userId, roleId);
    // Optimistically update member badge; socket member:roles_updated will reconcile
    const role = (rolesByServer[activeServerId] ?? []).find((r) => r.id === roleId);
    if (role) {
      setMembersByServer((prev) => {
        const list = prev[activeServerId] ?? [];
        return {
          ...prev,
          [activeServerId]: list.map((m) =>
            m.id === userId
              ? { ...m, roles: [...(m.roles ?? []), { id: role.id, name: role.name, color: role.color, position: role.position }] }
              : m,
          ),
        };
      });
    }
  }

  async function removeRole(userId: string, roleId: string) {
    if (!activeServerId) return;
    await api.removeRole(activeServerId, userId, roleId);
    // Optimistically remove the role badge
    setMembersByServer((prev) => {
      const list = prev[activeServerId] ?? [];
      return {
        ...prev,
        [activeServerId]: list.map((m) =>
          m.id === userId
            ? { ...m, roles: (m.roles ?? []).filter((r) => r.id !== roleId) }
            : m,
        ),
      };
    });
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

    // Try session storage first (survives page refresh without re-deriving)
    const fromSession = await importDmKeyFromSession(dmChannel.id);
    if (fromSession) {
      cacheDmKey(dmChannel.id, fromSession);
      return fromSession;
    }

    if (!dmKeyPairRef.current || !dmChannel.otherPublicKey) return null;
    try {
      const peerKey = await importPeerPublicKey(dmChannel.otherPublicKey);
      const aesKey = await deriveDmKey(dmKeyPairRef.current.privateKey, peerKey, dmChannel.id);
      cacheDmKey(dmChannel.id, aesKey);
      return aesKey;
    } catch { return null; }
  }

  /**
   * Decrypt a single DM ciphertext, falling back through archived key pairs if the
   * current derived key fails. This handles the post-rotation scenario where old
   * messages were encrypted with a previous ECDH key pair.
   */
  async function tryDecryptDm(
    ciphertext: string,
    nonce: string,
    dmChannel: DmChannel,
  ): Promise<string> {
    // Try the current derived key first (fast path — cache hit)
    const currentKey = await getDmKey(dmChannel);
    if (currentKey) {
      try { return await decryptText(currentKey, ciphertext, nonce); } catch { /* fall through */ }
    }

    // Current key failed — walk through archived historical key pairs (post-rotation fallback)
    if (dmChannel.otherPublicKey) {
      const history = await loadDmKeyHistory();
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

    throw new Error('decrypt failed with all available keys');
  }

  /** Decrypt a batch of DM wire messages for a channel. */
  async function decryptDmMessages(wire: DmWireMessage[], dmChannel: DmChannel): Promise<DmMessage[]> {
    const result: DmMessage[] = [];
    for (const m of wire) {
      if (m.ciphertext && m.nonce) {
        try {
          const body = await tryDecryptDm(m.ciphertext, m.nonce, dmChannel);
          result.push({ ...m, body, failed: false });
        } catch {
          result.push({ ...m, body: '[could not decrypt]', failed: true });
        }
      } else {
        // Legacy plaintext message
        result.push({ ...m, body: m.body ?? '', failed: false });
      }
    }
    return result;
  }

  async function openDm(userId: string) {
    const { dm } = await api.openDm(userId);
    const dmChannel: DmChannel = dm;
    setDms((prev) => {
      if (prev.find((d) => d.id === dmChannel.id)) return prev;
      return [dmChannel, ...prev];
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
        : (messages as DmWireMessage[]).map((m) => ({ ...m, body: m.body ?? '', failed: false }));
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
  }

  async function loadMoreDmMessages(dmId: string) {
    if (!dmHasMore[dmId]) return;
    const msgs = dmMessages[dmId] ?? [];
    const oldest = msgs[0];
    if (!oldest) return;
    const cursor = `${oldest.createdAt},${oldest.id}`;
    const { messages } = await api.getDmMessages(dmId, MSG_PAGE, cursor);
    const dmChannel = dmsRef.current.find((d) => d.id === dmId);
    const decoded = dmChannel
      ? await decryptDmMessages(messages as DmWireMessage[], dmChannel)
      : (messages as DmWireMessage[]).map((m) => ({ ...m, body: m.body ?? '', failed: false }));
    setDmMessages((prev) => {
      const existing = prev[dmId] ?? [];
      const existingIds = new Set(existing.map((m) => m.id));
      const fresh = decoded.filter((m) => !existingIds.has(m.id));
      return { ...prev, [dmId]: [...fresh, ...existing] };
    });
    setDmHasMore((prev) => ({ ...prev, [dmId]: messages.length === MSG_PAGE }));
  }

  async function sendDmMessage(dmId: string, text: string) {
    const dmChannel = dmsRef.current.find((d) => d.id === dmId);
    const key = dmChannel ? await getDmKey(dmChannel) : null;
    if (key) {
      const { ciphertext, nonce } = await encryptText(key, text);
      await api.sendDmMessage(dmId, { ciphertext, nonce });
    } else {
      // Fallback: legacy plaintext (peer hasn't registered an ECDH key yet)
      await api.sendDmMessage(dmId, { body: text });
    }
  }

  async function deleteDmMessage(dmId: string, msgId: string) {
    await api.deleteDmMessage(dmId, msgId);
  }

  async function clearDmChat(dmId: string) {
    await api.clearDmChat(dmId);
  }

  async function createChannel(name: string, type: 'text' | 'voice') {
    if (!activeServerId) return;
    const r = await api.createChannel(activeServerId, { name, type });
    setChannelsByServer((prev) => ({
      ...prev,
      [activeServerId]: [...(prev[activeServerId] ?? []), r.channel],
    }));
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
    callManagerRef.current?.leave();
    setInCall(false);
    setMicOn(true);
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
    dmKeyPairRef.current = null;
    setUser(null);
    setServers([]);
    setActiveServerId(null);
    setActiveChannelId(null);
    setChannelsByServer({});
    setMembersByServer({});
    setRolesByServer({});
    setChannelMsgs({});
    setKeysReady({});
    setInCall(false);
    setMicOn(true);
    setDms([]);
    setActiveDmId(null);
    setDmMessages({});
    setDmMsgLoaded({});
    setDmUnreadMap({});
    setView('server');
    setFriends([]);
    callManagerRef.current?.leave();
    disconnectSocket();
  }

  async function handleRotateKey(): Promise<void> {
    // CRYPTO-012: server update must succeed BEFORE local state is committed.
    // 1. Generate a new key pair (do not archive yet, do not touch dmKeyPairRef).
    // 2. Export the public key JWK.
    // 3. Push the new public key to the server — if this throws, abort entirely so
    //    local and remote keys never desync.
    // 4. Only on success: archive the old key, persist the new pair, update the ref,
    //    and flush cached AES-GCM keys so they're re-derived from the new private key.
    try {
      const newPair = await generateDmKeyPair();
      const pubJwk = await exportPublicKeyJwk(newPair.publicKey);
      await api.registerPublicKey(pubJwk); // throws on network/server error
      // Server accepted the key — now commit locally
      await archiveCurrentKeyPair();
      await saveDmKeyPair(newPair);
      dmKeyPairRef.current = newPair;
      clearAllDmKeys();
    } catch (err) {
      // Re-throw so KeyRotation component can surface the error to the user
      throw err;
    }
  }

  function switchServer() {
    // desktop-only: forget the current Recline server and prompt for a new one
    logout();
    clearAllKeys(); // belt-and-suspenders: flush any keys not caught by logout (#27)
    setServerUrl(null);
    setNeedsServer(true);
  }

  /* ------------------------ Render ------------------------ */
  if (needsServer) return <ServerSetup onDone={() => setNeedsServer(false)} />;
  if (!authChecked) return <div className="h-full grid place-items-center text-ink-300">Loading…</div>;
  if (!user) return <Auth onAuthed={setUser} onSwitchServer={isDesktop() ? switchServer : undefined} />;

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
        <AudioTrack key={`${peer.socketId}:${rs.streamId}`} stream={rs.stream} />
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
        onSwitchServer={isDesktop() ? switchServer : undefined}
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
              />
            </div>
          </div>

          {activeDm ? (
            <DmView
              dm={activeDm}
              messages={dmMessages[activeDm.id] ?? []}
              me={user}
              online={online}
              onSend={(text) => sendDmMessage(activeDm.id, text)}
              onDelete={(msgId) => deleteDmMessage(activeDm.id, msgId)}
              onClearChat={() => clearDmChat(activeDm.id)}
              hasMore={dmHasMore[activeDm.id] ?? false}
              onLoadMore={() => loadMoreDmMessages(activeDm.id)}
              onOpenSidebar={() => setMobileSidebarOpen(true)}
              onClickUser={setProfileCardUserId}
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
          <div className="hidden md:block">
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
            />
          </div>
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
                    }}
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
                onJoinSuccess={() => setInCall(true)}
                onLeave={handleLeaveCall}
                localStream={localStream}
                localScreen={localScreen}
                peers={callPeers}
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
          <MemberList
            members={members}
            online={online}
            me={user}
            onOpenDm={openDm}
            onClickUser={setProfileCardUserId}
            className="hidden md:flex"
            roles={activeServerId ? (rolesByServer[activeServerId] ?? []) : []}
            canManageRoles={canManageRoles}
            onAssignRole={assignRole}
            onRemoveRole={removeRole}
          />
          {/* Mobile member list slide-in */}
          <div className={`mobile-sidebar-right md:hidden ${mobileMembersOpen ? 'open' : 'closed'}`}>
            <MemberList
              members={members}
              online={online}
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

      <CreateServerDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createServer} />
      <JoinServerDialog open={joinOpen} onClose={() => setJoinOpen(false)} onJoin={joinServer} />
      <UnlockDialog
        open={!!unlockTarget && unlockTarget === activeServerId && !keysReady[unlockTarget!]}
        serverName={activeServer?.name ?? ''}
        onClose={() => setUnlockTarget(null)}
        onUnlock={handleUnlock}
      />
      <ProfileDialog
        open={profileOpen}
        onClose={() => { setProfileOpen(false); setProfileInitialTab('profile'); }}
        me={user}
        initialTab={profileInitialTab}
        onUpdated={(u) => setUser(u)}
        onRotateKey={handleRotateKey}
        isSupporter={isSupporter}
        sparksBalance={sparksBalance}
        onSparksUpdate={setSparksBalance}
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
      <FeedbackButton />
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
            joinedAt: 0,
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
              joinedAt: 0,
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
              joinedAt: 0,
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
          />
        );
      })()}
    </div>
    </>
  );
}
