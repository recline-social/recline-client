export type User = {
  id: string;
  username: string;
  displayName: string;
  totpEnabled?: boolean;
  avatarUrl?: string | null;
  isStaff?: boolean;
  isPlatformOwner?: boolean;
  isSupporter?: boolean;
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
};

export type Channel = {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
  topic?: string | null;
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
};

export type DecodedMessage = WireMessage & {
  body: string;
  failed?: boolean;
  /** Decoded reply — populated after decrypt. Present whenever replyTo is set. */
  decodedReply?: DecodedReplyPreview | null;
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
  createdAt: number;
  lastMessageAt: number | null;
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
};

/** Decoded/displayable DM message — body is always a string after decrypt/fallback. */
export type DmMessage = DmWireMessage & {
  /** Decrypted body. '[encrypted]' if key unavailable. '[legacy]' for plaintext msgs. */
  body: string;
  /** True if decryption failed or key was missing. */
  failed?: boolean;
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
  createdAt?: number;
};
