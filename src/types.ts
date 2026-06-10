export type User = {
  id: string;
  username: string;
  displayName: string;
  totpEnabled?: boolean;
  avatarUrl?: string | null;
  isStaff?: boolean;
  isPlatformOwner?: boolean;
  isSupporter?: boolean;
  /** Unix ms — account creation date from users.created_at. Set by login/me/signup responses. */
  createdAt?: number;
  /** PBKDF2 salt for v2 auth key derivation. Present on /api/auth/me response for v2 users.
   *  Used by the client to derive the auth key locally before sending to confirmation endpoints. */
  authKdfSalt?: string | null;
};

export type ServerRoleBadge = {
  id: string;
  name: string;
  color: string | null;
  position: number;
};

export type ServerRole = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  permissions: number;
  isDefault: boolean;
  hoisted: boolean;
  createdAt: number;
};

export type Member = User & {
  role: 'owner' | 'member' | string;
  joinedAt: number;
  roles?: ServerRoleBadge[];
  isPlatformOwner?: boolean;
  isSupporter?: boolean;
};

export type ServerSummary = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  role: 'owner' | 'member' | string;
  created_at: number;
  /** Random PBKDF2 salt stored server-side (#11). Null for legacy servers — client
   *  falls back to the deterministic salt in that case. */
  kdf_salt?: string | null;
  /** Uploaded server icon URL (e.g. /uploads/hex.jpg). Null = use initials. */
  icon_url?: string | null;
  /** User-specific sort position for drag-to-reorder. */
  sort_position?: number;
  /** 'any' = legacy invite_code + invite_links both work.
   *  'links_only' = only active invite_links are accepted. */
  invite_mode?: 'any' | 'links_only';
};

export type InviteLink = {
  id: string;
  code: string;
  label: string | null;
  createdAt: number;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
  allowHistory: boolean;
  isActive: boolean;
  isCustom: boolean;
  createdBy: string;
};

/** A file attached to a chat message. Files are stored as plaintext so
 *  server-side and CDN-level CSAM scanning remains possible. */
export type FileAttachment = {
  url: string;
  name: string;
  size: number;
  type: string;
};

export type InviteInfo = {
  serverId: string;
  serverName: string;
  iconUrl: string | null;
  label: string | null;
  allowHistory: boolean;
  memberCount: number;
};

export type Channel = {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
  topic?: string | null;
  /** Tier ID required to access this channel, or null for unrestricted. */
  tierRequired?: string | null;
};

export type TierLevel = {
  id: string;
  serverId: string;
  name: string;
  description?: string | null;
  priceCents: number;
  stripePriceId?: string | null;
  position: number;
  createdAt: number;
};

export type Reaction = {
  emoji: string;
  count: number;
  userIds: string[];
};

/** Reply preview carried on the wire — contains encrypted content so the client can decrypt it. */
export type ReplyPreview = {
  id: string;
  /** Encrypted ciphertext of the replied-to message. */
  ciphertext: string;
  /** AES-GCM nonce for the replied-to message. */
  nonce: string;
  senderId: string;
  senderName: string;
};

/** Decoded reply preview — body is populated after decryption. */
export type DecodedReplyPreview = Omit<ReplyPreview, 'ciphertext' | 'nonce'> & {
  body: string;
  failed?: boolean;
};

export type WireMessage = {
  id: string;
  channelId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
  createdAt: number;
  editedAt?: number | null;
  reactions?: Reaction[];
  replyToId?: string | null;
  replyTo?: ReplyPreview | null;
  /** Animation type applied to this message, e.g. 'wave', 'rainbow'. Null = none. */
  animationType?: string | null;
  /** Total Sparks tipped to this message. 0 when no sparks have been sent. */
  totalSparks?: number;
  /** File attachment — all four present or all null. */
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  /** Unix ms when this message was pinned. Null/undefined = not pinned. */
  pinnedAt?: number | null;
};

export type PinnedMessage = {
  id: string;
  channelId: string;
  senderId: string;
  body: string; // decrypted
  createdAt: number;
  pinnedAt: number;
  senderName?: string;
};

export type DecodedMessage = WireMessage & {
  body: string;
  failed?: boolean;
  /** Decoded reply — populated after decrypt. Present whenever replyTo is set. */
  decodedReply?: DecodedReplyPreview | null;
  /** E2EF-001: attachment key material + real metadata recovered from the
   *  encrypted envelope. When set, fileName/fileSize/fileType on this message
   *  have already been overridden with the real (decrypted) values. */
  e2eAttachment?: import('./lib/attachmentCrypto').E2EAttachmentMeta | null;
};

// socketId is intentionally omitted — the server-wide voice:activity feed contains only
// userIds so call socket handles are never exposed to non-participants.
export type CallPeer = { userId: string };

export type DmChannel = {
  id: string;
  otherUserId: string;
  otherDisplayName: string;
  otherUsername: string;
  /** Peer's ECDH public key (JWK string). Null if they haven't registered one yet. */
  otherPublicKey: string | null;
  otherAvatarUrl?: string | null;
  /** Peer's account creation timestamp — used as the "Joined" date on profile cards. */
  otherCreatedAt?: number;
  createdAt: number;
  lastMessageAt: number | null;
};

/** Decoded reply preview for a DM message — populated client-side from local state. */
export type DmReplyPreview = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  failed?: boolean;
};

/** Wire format from the server — may be E2E encrypted or legacy plaintext. */
export type DmWireMessage = {
  id: string;
  dmChannelId: string;
  senderId: string;
  /** Set for E2E encrypted messages (primary path). */
  ciphertext: string | null;
  nonce: string | null;
  /** Set only for legacy plaintext messages (deprecated). */
  body: string | null;
  /**
   * CRYPTO-006: Snapshot of the sender's ECDH public key at the time the message
   * was sent.  Use this (instead of dmChannel.otherPublicKey) when retrying
   * decryption after a key rotation — it points to whichever key epoch was active
   * when the ciphertext was produced.
   */
  senderEcdhPublicKey?: string | null;
  createdAt: number;
  editedAt?: number | null;
  /** ID of the message being replied to, if this is a reply. */
  replyToId?: string | null;
  /** File attachment fields — not E2E encrypted (same limitation as channel attachments). */
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  /** Emoji reactions — included in history responses; updated live via dm:reaction:update. */
  reactions?: DmReaction[];
};

/** Decoded/displayable DM message — body is always a string after decrypt/fallback. */
export type DmMessage = DmWireMessage & {
  /** Decrypted body. '[encrypted]' if key unavailable. '[legacy]' for plaintext msgs. */
  body: string;
  /** True if decryption failed or key was missing. */
  failed?: boolean;
  /** True for legacy messages that arrived as plaintext (no ciphertext/nonce) — not E2E encrypted. */
  isPlaintext?: boolean;
  /** True when the message only decrypted via a sender-key snapshot that matches no
   *  key ever pinned/accepted for this peer (TOFU) — possible server-side forgery. */
  unverifiedKey?: boolean;
  /** Emoji reactions on this message. */
  reactions?: DmReaction[];
  /** Reply preview — populated client-side by looking up the replied-to message in local state. */
  decodedReply?: DmReplyPreview | null;
  /** E2EF-001: attachment key material + real metadata recovered from the
   *  encrypted envelope — see DecodedMessage.e2eAttachment. */
  e2eAttachment?: import('./lib/attachmentCrypto').E2EAttachmentMeta | null;
};

export type DmReaction = {
  emoji: string;
  count: number;
  userIds: string[];
};

// ── DM call types ─────────────────────────────────────────────────────────────
export type DmCallStatus =
  | 'outgoing-ringing'  // we initiated, waiting for peer to pick up
  | 'incoming-ringing'  // peer initiated, showing incoming call modal
  | 'connecting'        // accepted, WebRTC negotiation in progress
  | 'active';           // call fully connected

export type DmCallState = {
  dmChannelId: string;
  peerUserId: string;
  peerName: string;
  peerAvatarUrl: string | null;
  status: DmCallStatus;
  hasVideo: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  /** Camera + microphone stream */
  localStream: MediaStream | null;
  /** Our screen share stream (null when not sharing) */
  localScreenStream: MediaStream | null;
  /** Whether we are currently broadcasting our screen */
  isScreenSharing: boolean;
  /** Peer's camera + audio stream */
  peerStream: MediaStream | null;
  /** Peer's screen share stream — populated via renegotiation when they share */
  peerScreenStream: MediaStream | null;
  pc: RTCPeerConnection | null;
  startedAt: number | null;  // unix ms when status hit 'active'
  /** Peer audio volume, 0–1. Default 1. */
  peerVolume: number;
  /** ICE candidates queued before remote description is set, drained in offer/answer handlers. */
  _pendingCandidates?: RTCIceCandidateInit[];
};

export type FriendStatus = 'pending' | 'accepted';

export type Friend = {
  /** Friendship row ID */
  id: string;
  status: FriendStatus;
  /** 'outgoing' = current user sent the request; 'incoming' = received it */
  direction: 'outgoing' | 'incoming';
  /** The other user's ID */
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  /** Friendship creation timestamp */
  createdAt?: number;
  /** The other user's account creation timestamp — used as "Joined" date on profile cards. */
  otherCreatedAt?: number;
};
