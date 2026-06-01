import { getServerUrl } from './serverUrl';

const TOKEN_KEY = 'recline.token';

// Token storage strategy:
//   sessionStorage  — default. Clears when the tab/window is closed (or the
//                     Tauri app exits). Safe from disk-based extraction and
//                     limits the blast radius of localStorage-scraping malware.
//   localStorage    — opt-in via setToken(token, true). Persists across restarts
//                     for convenience, but is readable by any JS on the same
//                     origin if XSS occurs. The CSP in tauri.conf.json is the
//                     primary defence against that.
export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null, remember = false) {
  if (token === null) {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } else if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const url = (getServerUrl() || '') + path;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(data?.error ?? `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data as T;
}

// ── Shared types ─────────────────────────────────────────────────────────────

export interface UserPayload {
  id: string;
  username: string;
  displayName: string;
  totpEnabled?: boolean;
  avatarUrl?: string | null;
  isStaff?: boolean;
  isPlatformOwner?: boolean;
  isSupporter?: boolean;
}

export interface ServerPayload {
  id: string;
  name: string;
  inviteCode?: string;
  invite_code?: string;
  ownerId?: string;
  owner_id?: string;
  role: 'owner' | 'member' | string;
  createdAt?: number;
  created_at?: number;
  kdfSalt?: string | null;
  kdf_salt?: string | null;
  icon_url?: string | null;
  sort_position?: number;
}

export interface ChannelPayload {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
  topic?: string | null;
}

export interface MemberPayload {
  id: string;
  username: string;
  displayName: string;
  role: 'owner' | 'member' | string;
  joinedAt: number;
  roles?: { id: string; name: string; color: string | null; position: number }[];
}

export interface MessagePayload {
  id: string;
  channelId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
  createdAt: number;
  editedAt?: number | null;
  reactions?: { emoji: string; count: number; userIds: string[] }[];
}

export interface DmChannelPayload {
  id: string;
  otherUserId: string;
  otherDisplayName: string;
  otherUsername: string;
  otherPublicKey: string | null;
  otherAvatarUrl?: string | null;
  createdAt: number;
  lastMessageAt: number | null;
}

export interface DmMessagePayload {
  id: string;
  dmChannelId: string;
  senderId: string;
  ciphertext: string | null;
  nonce: string | null;
  body: string | null;
  createdAt: number;
}

export interface ReportPayload {
  id: string;
  serverId: string;
  reporterId: string;
  /** Joined from users table by the server. */
  reporterUsername?: string;
  reporterDisplayName?: string;
  reportedUserId?: string | null;
  /** Joined from users table by the server. */
  reportedUsername?: string | null;
  reportedDisplayName?: string | null;
  messageId?: string | null;
  channelId?: string | null;
  reason: string;
  note?: string | null;
  status: 'pending' | 'reviewed' | 'actioned';
  createdAt: number;
}

export interface FeedbackPayload {
  id: string;
  user_id: string;
  username: string;
  kind: 'feedback' | 'bug' | 'feature';
  body: string;
  context: string | null;
  created_at: number;
}

// ── Login result variants ─────────────────────────────────────────────────────
// Happy path
export interface LoginSuccess {
  token: string;
  user: UserPayload;
  totp_required?: never;
}
// TOTP required — caller needs to submit pending_token + code to /login/2fa
export interface LoginTotpChallenge {
  totp_required: true;
  pending_token: string;
  token?: never;
  user?: never;
}
export type LoginResult = LoginSuccess | LoginTotpChallenge;

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  signup: (body: { username: string; password: string; displayName?: string; cfTurnstileResponse?: string }) =>
    request<{ token: string; user: UserPayload; backupCodes: string[] }>(
      '/api/auth/signup',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  login: (body: { username: string; password: string; totpCode?: string; cfTurnstileResponse?: string }) =>
    request<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Complete a TOTP-gated login after receiving a pending_token. */
  login2fa: (body: { pending_token: string; code: string }) =>
    request<{ token: string; user: UserPayload }>('/api/auth/login/2fa', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  me: () => request<{ user: UserPayload }>('/api/auth/me'),

  /** Upload this client's ECDH public key so peers can derive DM keys. */
  registerPublicKey: (jwkString: string) =>
    request<{ ok: boolean }>('/api/auth/me/public-key', {
      method: 'PUT',
      body: JSON.stringify({ publicKey: jwkString }),
    }),

  /** Fetch a peer's ECDH public key. Returns null publicKey if not set. */
  getPeerPublicKey: (userId: string) =>
    request<{ publicKey: string | null }>(`/api/users/${userId}/public-key`),

  updateMe: (body: { displayName?: string; avatarUrl?: string | null }) =>
    request<{ user: UserPayload }>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  /** Recover access using a backup code — resets password, invalidates all sessions. */
  resetPassword: (body: { username: string; backupCode: string; newPassword: string }) =>
    request<{ ok: boolean }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Regenerate backup codes (requires current password). Returns fresh codes. */
  regenerateBackupCodes: (body: { password: string }) =>
    request<{ backupCodes: string[] }>('/api/auth/backup-codes/regenerate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Step 1: generate TOTP secret + otpauth URL for QR scan. */
  setup2fa: () =>
    request<{ secret: string; otpauthUrl: string }>('/api/auth/2fa/setup', { method: 'POST' }),

  /** Step 2: confirm TOTP setup by verifying first code from authenticator. */
  confirm2fa: (body: { code: string }) =>
    request<{ ok: boolean }>('/api/auth/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Disable TOTP (requires current TOTP code or a backup code). */
  disable2fa: (body: { code: string }) =>
    request<{ ok: boolean }>('/api/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Servers ───────────────────────────────────────────────────────────────
  listServers: () => request<{ servers: ServerPayload[] }>('/api/servers'),

  createServer: (body: { name: string; passphrase: string }) =>
    request<{ server: ServerPayload }>('/api/servers', { method: 'POST', body: JSON.stringify(body) }),

  joinServer: (body: { inviteCode: string; passphrase: string }) =>
    request<{ server: ServerPayload }>('/api/servers/join', { method: 'POST', body: JSON.stringify(body) }),

  deleteServer: (serverId: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}`, { method: 'DELETE' }),

  leaveServer: (serverId: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/leave`, { method: 'POST' }),

  updateServer: (serverId: string, body: { name?: string; iconUrl?: string | null }) =>
    request<{ server: { id: string; name: string } }>(`/api/servers/${serverId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  changeServerPassphrase: (serverId: string, body: { passphrase: string; currentPassphrase: string }) =>
    request<{ kdfSalt: string }>(`/api/servers/${serverId}/change-passphrase`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Verify a passphrase against the server-side Argon2id hash without needing sample messages. */
  verifyServerPassphrase: (serverId: string, passphrase: string) =>
    request<{ valid: boolean }>(`/api/servers/${serverId}/verify-passphrase`, {
      method: 'POST',
      body: JSON.stringify({ passphrase }),
    }),

  kickMember: (serverId: string, userId: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/members/${userId}`, { method: 'DELETE' }),

  banMember: (serverId: string, userId: string, reason?: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/bans`, {
      method: 'POST',
      body: JSON.stringify({ userId, reason }),
    }),

  listBans: (serverId: string) =>
    request<{ bans: { id: string; userId: string; username: string; displayName: string; reason: string | null; createdAt: number }[] }>(
      `/api/servers/${serverId}/bans`,
    ),

  unbanMember: (serverId: string, userId: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/bans/${userId}`, { method: 'DELETE' }),

  listChannels: (serverId: string) =>
    request<{ channels: ChannelPayload[] }>(`/api/servers/${serverId}/channels`),

  createChannel: (serverId: string, body: { name: string; type?: 'text' | 'voice' }) =>
    request<{ channel: ChannelPayload }>(`/api/servers/${serverId}/channels`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listMembers: (serverId: string) =>
    request<{ members: MemberPayload[] }>(`/api/servers/${serverId}/members`),

  // before is a compound cursor: "${createdAt},${id}" — see Finding #15 in SESSION_LOG
  listMessages: (channelId: string, limit = 50, before?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before !== undefined) params.set('before', before);
    return request<{ messages: MessagePayload[] }>(`/api/channels/${channelId}/messages?${params}`);
  },

  // ── DMs ───────────────────────────────────────────────────────────────────
  listDms: () => request<{ dms: DmChannelPayload[] }>('/api/dms'),

  openDm: (userId: string) =>
    request<{ dm: DmChannelPayload }>('/api/dms', { method: 'POST', body: JSON.stringify({ userId }) }),

  getDmMessages: (dmId: string, limit = 50, before?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before !== undefined) params.set('before', before);
    return request<{ messages: DmMessagePayload[] }>(`/api/dms/${dmId}/messages?${params}`);
  },

  /** Send an E2E encrypted DM message (primary path). */
  sendDmMessage: (dmId: string, payload: { ciphertext: string; nonce: string } | { body: string }) =>
    request<{ message: DmMessagePayload }>(`/api/dms/${dmId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteDmMessage: (dmId: string, msgId: string) =>
    request<{ ok: boolean }>(`/api/dms/${dmId}/messages/${msgId}`, { method: 'DELETE' }),

  clearDmChat: (dmId: string) =>
    request<{ ok: boolean }>(`/api/dms/${dmId}/messages`, { method: 'DELETE' }),

  // ── Channels ──────────────────────────────────────────────────────────────
  deleteChannel: (serverId: string, channelId: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/channels/${channelId}`, { method: 'DELETE' }),

  updateChannelTopic: (serverId: string, channelId: string, topic: string | null) =>
    request<{ ok: boolean; topic: string | null }>(`/api/servers/${serverId}/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify({ topic }),
    }),

  regenerateInvite: (serverId: string) =>
    request<{ inviteCode: string }>(`/api/servers/${serverId}/regenerate-invite`, { method: 'POST' }),

  // ── Moderation / Reports ──────────────────────────────────────────────────
  submitReport: (
    serverId: string,
    body: {
      reason: string;
      note?: string;
      messageId?: string;
      channelId?: string;
      reportedUserId?: string;
    },
  ) =>
    request<{ reportId: string }>(`/api/servers/${serverId}/reports`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listReports: (serverId: string, opts?: { status?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return request<{ reports: ReportPayload[] }>(`/api/servers/${serverId}/reports${qs ? `?${qs}` : ''}`);
  },

  updateReport: (serverId: string, reportId: string, status: 'pending' | 'reviewed' | 'actioned') =>
    request<{ ok: boolean; status: string }>(`/api/servers/${serverId}/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // ── Feedback ──────────────────────────────────────────────────────────────
  submitFeedback: (body: { kind: 'feedback' | 'bug' | 'feature'; body: string; context?: string }) =>
    request<{ ok: boolean }>('/api/feedback', { method: 'POST', body: JSON.stringify(body) }),

  /** Admin-only: list feedback submissions. Requires ADMIN_USER_IDS on the server. */
  listFeedback: (opts?: { kind?: 'feedback' | 'bug' | 'feature'; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.kind) params.set('kind', opts.kind);
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return request<{ feedback: FeedbackPayload[]; total: number; limit: number; offset: number }>(
      `/api/admin/feedback${qs ? `?${qs}` : ''}`,
    );
  },

  // ── Payment ───────────────────────────────────────────────────────────────
  /** Check whether the authenticated user is a Founding Supporter. */
  getSupporterStatus: () =>
    request<{ isSupporter: boolean }>('/api/payment/status'),

  /**
   * Start the Stripe checkout flow for the Founding Supporter plan.
   * Returns the Stripe Checkout URL — redirect the user to it.
   * (Server-side: GET /api/payment/checkout redirects automatically,
   *  so calling window.location.href = '/api/payment/checkout' works directly.)
   */
  getCheckoutUrl: () => `${getServerUrl() || ''}/api/payment/checkout`,

  // ── Uploads ──────────────────────────────────────────────────────────────
  /**
   * Upload an image file. Returns a relative URL (/uploads/hex.ext) that can
   * be stored in avatar_url / icon_url fields. The client reads the file as a
   * data-URL (base64) and sends it as JSON — no multipart needed.
   */
  uploadFile: (file: File): Promise<{ url: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        request<{ url: string }>('/api/upload', {
          method: 'POST',
          body: JSON.stringify({ data, mimeType: file.type }),
        }).then(resolve).catch(reject);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    }),

  // ── Friends ──────────────────────────────────────────────────────────────
  listFriends: () =>
    request<{ friends: import('../types').Friend[] }>('/api/friends'),

  sendFriendRequest: (username: string) =>
    request<{ friendship: import('../types').Friend }>('/api/friends', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  respondFriendRequest: (id: string, action: 'accept' | 'reject') =>
    request<{ ok: boolean }>(`/api/friends/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    }),

  removeFriend: (id: string) =>
    request<{ ok: boolean }>(`/api/friends/${id}`, { method: 'DELETE' }),

  // ── Roles ─────────────────────────────────────────────────────────────────
  listRoles: (serverId: string) =>
    request<{ roles: import('../types').ServerRole[] }>(`/api/servers/${serverId}/roles`),

  createRole: (serverId: string, body: { name: string; color?: string | null; permissions?: number; hoisted?: boolean; position?: number }) =>
    request<{ role: import('../types').ServerRole }>(`/api/servers/${serverId}/roles`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateRole: (serverId: string, roleId: string, body: { name?: string; color?: string | null; permissions?: number; hoisted?: boolean; position?: number }) =>
    request<{ role: import('../types').ServerRole }>(`/api/servers/${serverId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteRole: (serverId: string, roleId: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/roles/${roleId}`, { method: 'DELETE' }),

  assignRole: (serverId: string, userId: string, roleId: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: 'POST' }),

  removeRole: (serverId: string, userId: string, roleId: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' }),

  getChannelPermissions: (serverId: string, channelId: string) =>
    request<{ overrides: { roleId: string; allow: number; deny: number }[] }>(`/api/servers/${serverId}/channels/${channelId}/permissions`),

  setChannelPermission: (serverId: string, channelId: string, roleId: string, body: { allow: number; deny: number }) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/channels/${channelId}/permissions/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteChannelPermission: (serverId: string, channelId: string, roleId: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/channels/${channelId}/permissions/${roleId}`, { method: 'DELETE' }),

  // ── Server order ─────────────────────────────────────────────────────────
  /** Persist the user's custom server sort order (drag-to-reorder). */
  updateServerOrder: (order: string[]) =>
    request<{ ok: boolean }>('/api/servers/order', {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),

  // ── Sparks wallet ─────────────────────────────────────────────────────────
  sparks: {
    /** Get the authenticated user's current spark balance. */
    balance: () =>
      request<{ balance: number }>('/api/sparks/balance'),

    /** List available purchasable spark packs. */
    packs: () =>
      request<{
        packs: {
          id: string;
          name: string;
          sparkCount: number;
          priceCents: number;
          stripePriceId: string | null;
          active: boolean;
        }[];
      }>('/api/sparks/packs'),

    /** Fetch recent spark transactions for the authenticated user. */
    transactions: (limit?: number) => {
      const qs = limit !== undefined ? `?limit=${limit}` : '';
      return request<{
        transactions: {
          id: string;
          userId: string;
          delta: number;
          reason: string;
          createdAt: number;
        }[];
      }>(`/api/sparks/transactions${qs}`);
    },

    /** Claim the daily login streak reward. Returns reward=0 if already claimed today. */
    claimDaily: () =>
      request<{ reward: number; newStreak: number; alreadyClaimed: boolean }>(
        '/api/sparks/claim-daily',
        { method: 'POST' },
      ),

    /** Fetch current streak info without claiming. */
    streak: () =>
      request<{
        currentStreak: number;
        lastClaimAt: number | null;
        weekMultiplier: number;
        alreadyClaimedToday: boolean;
      }>('/api/sparks/streak'),
  },

  broadcasts: {
    submit: (serverId: string, payload: { type: string; text?: string; url?: string }) =>
      request<{ ok: boolean; id: string; position: number; sparkCost: number; surgeMultiplier: number; immediate: boolean }>(
        `/api/servers/${serverId}/broadcasts`,
        { method: 'POST', body: JSON.stringify(payload) },
      ),
    queue: (serverId: string) =>
      request<{ depth: number; surgeMult: number; estimatedWaitSec: number }>(
        `/api/servers/${serverId}/broadcasts/queue`,
      ),
    cancel: (serverId: string, broadcastId: string) =>
      request<{ ok: boolean; refunded: number }>(`/api/servers/${serverId}/broadcasts/${broadcastId}/cancel`, {
        method: 'POST',
      }),
    updateSettings: (
      serverId: string,
      settings: { enabled?: boolean; floorSparks?: number; approvalRequired?: boolean },
    ) =>
      request<{ ok: boolean; settings: { enabled: boolean; floor_sparks: number; approval_required: boolean } }>(
        `/api/servers/${serverId}/broadcast-settings`,
        { method: 'PATCH', body: JSON.stringify(settings) },
      ),
  },
};
