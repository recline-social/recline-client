import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { api } from '../lib/api';
import {
  decryptText,
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
  clearDmAesKeyCache,
  wipeDmIdentityKeysForReset,
  archiveCurrentKeyPair,
  loadDmKeyHistory,
  fingerprintJwk,
  checkPeerKeyTofu,
  repinPeerKey,
  isPeerKeyKnown,
  decryptDmKeyBackupJwks,
} from '../lib/crypto';
import { unwrapAttachmentEnvelope } from '../lib/attachmentCrypto';
import type { DmChannel, DmMessage, DmWireMessage, User } from '../types';

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

/** Stable string key for an EC JWK by its curve point (works for both pub and priv JWKs). */
function jwkPoint(jwk: JsonWebKey): string {
  return `${String(jwk.crv)}:${String(jwk.x)}:${String(jwk.y)}`;
}

/**
 * Build the history array for a new backup, incorporating any chained history
 * from an existing backup while deduplicating against the new current key.
 *
 * Uses the same logic as rotation (carry old priv + its predecessors) so that
 * normal-login re-uploads don't silently erase old epochs — including the case
 * where decryptDmKeyBackupJwks returns a v1/v2 blob with history:[] but a
 * non-current old.priv that must still be chained.
 *
 * @param old      Decrypted old backup JWKs, or null if no backup exists yet.
 * @param currentKey  The new current private JWK (or public JWK — only x/y used for dedup).
 */
function preservedHistory(
  old: { priv: JsonWebKey; history: JsonWebKey[] } | null,
  currentKey: JsonWebKey,
): JsonWebKey[] {
  if (!old) return [];
  const seen = new Set<string>([jwkPoint(currentKey)]);
  const out: JsonWebKey[] = [];
  for (const jwk of [old.priv, ...old.history]) {
    const p = jwkPoint(jwk);
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(jwk);
  }
  return out;
}

export type UseDmKeysParams = {
  user: User | null;
  /** Fresh DM list accessible in socket callbacks without stale-closure issues. */
  dmsRef: MutableRefObject<DmChannel[]>;
  setDms: Dispatch<SetStateAction<DmChannel[]>>;
  /** Fresh dmMessages map — same ref pattern as dmsRef. */
  dmMessagesRef: MutableRefObject<Record<string, DmMessage[]>>;
  setDmMessages: Dispatch<SetStateAction<Record<string, DmMessage[]>>>;
  setDmMsgLoaded: Dispatch<SetStateAction<Record<string, boolean>>>;
};

/**
 * DM encryption key lifecycle — owns the ECDH key pair, its setup/restore/
 * rotation/sync flows, per-channel AES key derivation, decrypt fallback
 * through historical keys, and TOFU peer-key tracking.
 *
 * Extracted verbatim from App.tsx. The functions returned here are recreated
 * each render (same as when they lived in App); socket handlers that capture
 * them rely on the refs inside (dmKeyPairRef, dmsRef, dmMessagesRef) for
 * freshness — do not convert those refs to state.
 */
export function useDmKeys({ user, dmsRef, setDms, dmMessagesRef, setDmMessages, setDmMsgLoaded }: UseDmKeysParams) {
  // True once setupDmKeys has placed a key pair in dmKeyPairRef; guards loadDmMessages
  const [dmKeysReady, setDmKeysReady] = useState(false);
  // Monotonically-incrementing counter — bumped after every successful key change
  // (sync, rotation, reset). App.tsx includes this in the DM loader effect deps so
  // a successful sync/rotation triggers a re-decrypt even when dmKeysReady was
  // already true (i.e. the false→true transition doesn't fire as a no-op).
  const [dmKeyEpoch, setDmKeyEpoch] = useState(0);
  // True when the local ECDH key doesn't match the server's stored key AND no password is
  // available to reconcile (page refresh scenario). DM decryption may be degraded.
  const [dmKeyMismatch, setDmKeyMismatch] = useState(false);
  // True when a backup upload failed during key rotation — signals degraded state to ProfileDialog
  const [dmBackupOutOfSync, setDmBackupOutOfSync] = useState(false);
  // CRYPTO-004 (TOFU): peer userIds whose DM key changed since first seen, and cached fingerprints
  const [peerKeyChanged, setPeerKeyChanged] = useState<Set<string>>(new Set());
  const [peerFingerprints, setPeerFingerprints] = useState<Record<string, string>>({});
  // CRYPTO-004: own DM public-key fingerprint, shown in settings for out-of-band verification
  const [myFingerprint, setMyFingerprint] = useState<string>('');

  // ECDH DM key pair — generated once, persisted in IndexedDB, held in memory
  const dmKeyPairRef = useRef<CryptoKeyPair | null>(null);
  // Authoritative send-readiness state — separate from dmKeyMismatch which is UI-dismissible.
  //   'locked'       — no usable key pair; all DM operations unavailable
  //   'decrypt-only' — local key exists but server registration unconfirmed or mismatched;
  //                    old messages may decrypt but sending new encrypted DMs is unsafe
  //   'send-ready'   — local key confirmed registered with server; full DM operation allowed
  const dmKeyStatusRef = useRef<'locked' | 'decrypt-only' | 'send-ready'>('locked');
  // Single-flight guard for setupDmKeys — see ensureDmKeys()
  const dmKeySetupPromiseRef = useRef<Promise<void> | null>(null);
  // Password held briefly (login → useEffect tick) for key backup setup, then cleared
  const setupPasswordRef = useRef<string>('');
  // Guard against concurrent key rotation calls
  const rotatingRef = useRef(false);

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
  ): Promise<{ body: string; unverifiedKey: boolean }> {
    // Fast path: try the current derived key (cache hit — no imports needed)
    const currentKey = await getDmKey(dmChannel);
    if (currentKey) {
      try { return { body: await decryptText(currentKey, ciphertext, nonce), unverifiedKey: false }; } catch {
        // Cached AES key failed — may be stale after a peer key rotation where the DM list was
        // refreshed (otherPublicKey updated) but the cache still holds the pre-rotation AES key.
        // Invalidate and immediately re-derive with the current peer public key.
        clearDmKey(dmChannel.id);
        const freshKey = await getDmKey(dmChannel);
        if (freshKey) {
          try { return { body: await decryptText(freshKey, ciphertext, nonce), unverifiedKey: false }; } catch { /* fall through */ }
        }
      }
    }

    // BUG 9: single lazy-loaded history cache — avoids calling loadDmKeyHistory() twice
    let _history: CryptoKeyPair[] | null = null;
    const getHistory = async () => {
      if (!_history) _history = await loadDmKeyHistory(user?.id ?? '');
      return _history;
    };

    // CRYPTO-006: sender's key at send-time differs from current peer key → derive
    // against that specific epoch using current and historical own private keys.
    //
    // TOFU gate: the snapshot key is server-supplied and the server can forge
    // ciphertext that decrypts against a key it invented (it knows our public key
    // and the channel ID). A snapshot that matches no key ever pinned or accepted
    // for this peer is still decrypted — it may be a legit pre-TOFU epoch — but
    // the result is flagged so the UI can warn instead of silently trusting it.
    const snapshotIsKnown = senderEcdhPublicKey
      ? isPeerKeyKnown(dmChannel.otherUserId, senderEcdhPublicKey)
      : true;
    if (senderEcdhPublicKey && senderEcdhPublicKey !== dmChannel.otherPublicKey) {
      try {
        const snapshotKey = await importPeerPublicKey(senderEcdhPublicKey);
        const currentPair = dmKeyPairRef.current;
        if (currentPair) {
          try {
            const k = await deriveDmKey(currentPair.privateKey, snapshotKey, dmChannel.id);
            return { body: await decryptText(k, ciphertext, nonce), unverifiedKey: !snapshotIsKnown };
          } catch { /* fall through */ }
        }
        const history = await getHistory();
        for (const oldPair of history) {
          try {
            const k = await deriveDmKey(oldPair.privateKey, snapshotKey, dmChannel.id);
            return { body: await decryptText(k, ciphertext, nonce), unverifiedKey: !snapshotIsKnown };
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
            return { body: await decryptText(oldAesKey, ciphertext, nonce), unverifiedKey: false };
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
            return { body: await decryptText(oldAesKey, ciphertext, nonce), unverifiedKey: !snapshotIsKnown };
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
          const r = await tryDecryptDm(m.ciphertext, m.nonce, dmChannel, m.senderEcdhPublicKey);
          const env = unwrapAttachmentEnvelope(r.body);
          result.push({
            ...m, body: env.text, failed: false, unverifiedKey: r.unverifiedKey, e2eAttachment: env.att,
            ...(env.att ? { fileName: env.att.name, fileSize: env.att.size, fileType: env.att.type } : {}),
          });
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

  /**
   * Resolve authKdfSalt for password-protected DM key operations.
   * Some login responses may not include it immediately; /api/auth/me is the
   * source of truth for authenticated sessions.
   */
  async function resolveAuthKdfSalt(): Promise<string | null> {
    if (user?.authKdfSalt) return user.authKdfSalt;
    try {
      const { user: me } = await api.me();
      return me.authKdfSalt ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Set up the ECDH DM key pair on login.
   * Priority: (1) existing IndexedDB key → (2) server backup → (3) generate fresh.
   * When a key already exists locally, uploads a backup if the server has none yet.
   */
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
    let serverKeyFetchFailed = false;
    try {
      const { publicKey } = await api.getMyPublicKey();
      serverKeyJwk = publicKey;
    } catch {
      // Network error — keep serverKeyFetchFailed so downstream checks can distinguish
      // "server confirmed no key" from "couldn't reach server" (Fix 4).
      serverKeyFetchFailed = true;
    }

    const userId = user?.id ?? '';
    let pair = await loadDmKeyPair(userId);

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
        dmKeyStatusRef.current = 'send-ready';
        setDmKeysReady(true);
        setDmMsgLoaded({});
        // Always upload a fresh backup on login — re-encrypts with current password and
        // preserves the full key rotation history chain so devices that haven't synced
        // yet can still decrypt messages from previous key epochs.
        if (password) {
          try {
            // Try to export the IDB private key. saveDmKeyPair() stores it as
            // non-extractable, so this returns null for already-persisted keys.
            let privJwk = await exportPrivateKeyJwk(pair.privateKey);

            // Fetch the existing backup before overwriting — we need it to:
            //   (a) preserve history[], and
            //   (b) recover privJwk when the IDB key is non-extractable.
            let old: { priv: JsonWebKey; history: JsonWebKey[] } | null = null;
            try {
              const { backup: oldBlob } = await api.getDmKeyBackup(password, authKdfSalt);
              if (oldBlob) old = await decryptDmKeyBackupJwks(oldBlob, password);
            } catch { /* no existing backup or wrong password — non-fatal */ }

            // If IDB key is non-extractable but the backup's priv matches our public key,
            // re-use the backup's private JWK so we can still write an updated blob.
            if (!privJwk && old && jwkPointMatches(JSON.stringify(old.priv), localJwk)) {
              privJwk = old.priv;
            }

            if (privJwk) {
              const currentJwk = JSON.parse(localJwk) as JsonWebKey;
              const historyJwks = preservedHistory(old, currentJwk);
              const blob = await encryptDmKeyBackup(privJwk, password, historyJwks);
              await api.putDmKeyBackup(blob);
            }
            // If privJwk is still null here (non-extractable IDB key, no matching backup),
            // we can't produce a backup this session — non-fatal, user can rotate to create one.
          } catch { /* non-fatal */ }
        }
        return;
      }

      // ── Case 2: server has no key yet — first-time registration ──────────
      // Guard: only enter when the fetch succeeded and positively confirmed no key.
      // A fetch failure must not trigger unprotected registration (Fix 4).
      if (serverKeyJwk === null && !serverKeyFetchFailed) {
        let case2Registered = false;
        try {
          await api.registerPublicKey(localJwk);
          case2Registered = true;
        } catch (err) {
          console.error('[setupDmKeys] Case 2 registerPublicKey failed:', err);
        }
        dmKeyPairRef.current = pair;
        dmKeyStatusRef.current = case2Registered ? 'send-ready' : 'decrypt-only';
        // Allow reading DMs even if registration failed — existing messages can still
        // decrypt with our local key. Show mismatch banner so the user knows the server
        // doesn't have the key yet and new inbound DMs may not encrypt to us correctly.
        setDmKeysReady(true);
        setDmKeyMismatch(!case2Registered);
        setDmMsgLoaded({});
        if (password) {
          try {
            let privJwk = await exportPrivateKeyJwk(pair.privateKey);
            let old: { priv: JsonWebKey; history: JsonWebKey[] } | null = null;
            try {
              const { backup: oldBlob } = await api.getDmKeyBackup(password, authKdfSalt);
              if (oldBlob) old = await decryptDmKeyBackupJwks(oldBlob, password);
            } catch { /* non-fatal */ }
            if (!privJwk && old && jwkPointMatches(JSON.stringify(old.priv), localJwk)) {
              privJwk = old.priv;
            }
            if (privJwk) {
              const currentJwk = JSON.parse(localJwk) as JsonWebKey;
              const historyJwks = preservedHistory(old, currentJwk);
              const blob = await encryptDmKeyBackup(privJwk, password, historyJwks);
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
          if (backup) restored = await decryptDmKeyBackup(backup, password, userId);
        } catch { /* non-fatal */ }

        if (restored) {
          const restoredJwk = await exportPublicKeyJwk(restored.publicKey);
          // Fix 3: if the backup key doesn't match the server's current key, the backup
          // is stale — another device has rotated since this snapshot was made. Registering
          // an older key over the current server key would permanently break messages already
          // encrypted to the newer one. Surface the conflict instead of silently overwriting.
          if (!jwkPointMatches(restoredJwk, serverKeyJwk)) {
            dmKeyStatusRef.current = 'locked';
            setDmKeyMismatch(true);
            setDmBackupOutOfSync(true);
            return;
          }
          // Backup matches server key — restore locally, no re-registration needed.
          await saveDmKeyPair(userId, restored).catch((err) =>
            console.error('[setupDmKeys] could not persist restored key (continuing in-memory):', err));
          pair = restored;
          dmKeyPairRef.current = pair;
          dmKeyStatusRef.current = 'send-ready';
          setDmKeyMismatch(false);
          setDmKeysReady(true);
          setDmMsgLoaded({});
          return;
        }

        // Backup restore failed — don't blindly overwrite the server's current key.
        // It may be newer (from another device's rotation); pushing the local key back
        // would permanently break messages encrypted to that newer key.
        // Surface the conflict so the user can sync from another device or explicitly reset.
        dmKeyStatusRef.current = 'locked';
        setDmKeyMismatch(true);
        setDmBackupOutOfSync(true);
        return;
      }

      // Mismatch + no password (page refresh) — can't reconcile without credentials.
      // Use local key for decrypting historical messages (decrypt-only); show banner.
      setDmKeyMismatch(true);
      dmKeyPairRef.current = pair;
      dmKeyStatusRef.current = 'decrypt-only';
      setDmKeysReady(true);
      setDmMsgLoaded({});
      return;
    }

    // ── No local key at all ───────────────────────────────────────────────────
    // Try restoring from server backup (requires login password).
    if (password) {
      // Phase A: fetch + decrypt — non-fatal (no backup, wrong password, network blip)
      let restored: CryptoKeyPair | null = null;
      try {
        const { backup } = await api.getDmKeyBackup(password, authKdfSalt);
        if (backup) restored = await decryptDmKeyBackup(backup, password, userId);
      } catch { /* non-fatal — backup fetch/decrypt failure */ }

      // Phase B: handle restored key OUTSIDE the non-fatal catch so registration
      // failures propagate correctly (Issue 2: .catch(() => {}) swallowed them before).
      if (restored) {
        const restoredJwk = await exportPublicKeyJwk(restored.publicKey);
        await saveDmKeyPair(userId, restored);
        dmKeyPairRef.current = restored;
        setDmMsgLoaded({});

        if (serverKeyFetchFailed) {
          // Can't verify server state — restore locally so DMs can decrypt, but
          // flag mismatch until we confirm the server holds the same key.
          dmKeyStatusRef.current = 'decrypt-only';
          setDmKeysReady(true);
          setDmKeyMismatch(true);
          setDmBackupOutOfSync(true);
          return;
        }
        if (serverKeyJwk === null) {
          // Server confirmed empty — registration required; failure is non-ignorable.
          try {
            await api.registerPublicKey(restoredJwk, { password, authKdfSalt });
          } catch (err) {
            dmKeyStatusRef.current = 'decrypt-only';
            setDmKeyMismatch(true);
            setDmBackupOutOfSync(true);
            setDmKeysReady(true); // key is in memory; allow decryption of any existing messages
            throw err;
          }
          dmKeyStatusRef.current = 'send-ready';
          setDmKeyMismatch(false);
          setDmKeysReady(true);
          return;
        }
        if (!jwkPointMatches(restoredJwk, serverKeyJwk)) {
          // Stale backup: server has a different (newer) key from another device's rotation.
          // Restore locally for decryption of old messages but don't push the stale key back.
          dmKeyStatusRef.current = 'decrypt-only';
          setDmKeysReady(true);
          setDmKeyMismatch(true);
          setDmBackupOutOfSync(true);
          return;
        }
        // Backup matches server key — fully in sync.
        dmKeyStatusRef.current = 'send-ready';
        setDmKeyMismatch(false);
        setDmKeysReady(true);
        return;
      }

      // Restore failed (no backup on server, corrupt blob, or wrong password).
      // If the server already has a registered public key, auto-generating a fresh
      // pair here would silently overwrite it — permanently breaking decryption
      // of every DM sent to or from this account. Block and surface the state so
      // the user can either sync from another device or explicitly choose to reset.
      // Also guard on serverKeyFetchFailed — a transient network error must not be
      // treated as a confirmed-empty server (Fix 4).
      if (serverKeyJwk !== null || serverKeyFetchFailed) {
        dmKeyStatusRef.current = 'locked';
        setDmKeyMismatch(true);
        setDmBackupOutOfSync(true);
        // dmKeysReady stays false — DMs are inaccessible until this is resolved.
        return;
      }
    }

    // Fix 1 / Fix 4: don't auto-generate when we can't confirm the server is empty
    // and we lack credentials to safely override any existing key.
    //   • !password && serverKeyJwk !== null  → server confirmed has a key; no creds to override
    //   • !password && serverKeyFetchFailed   → couldn't reach server; can't assume empty
    if (!password && (serverKeyJwk !== null || serverKeyFetchFailed)) {
      dmKeyStatusRef.current = 'locked';
      setDmKeyMismatch(true);
      // dmKeysReady stays false — user must log in with password to reconcile.
      return;
    }

    // Generate a fresh key pair — safe to proceed: either the server is confirmed empty,
    // or we have a password to authorize the override.
    pair = await generateDmKeyPair();
    // Set the ref BEFORE any persistence/network step — an IndexedDB write
    // failure must degrade to an in-memory key, never to "no key at all"
    // (the old unguarded await here stranded dmKeyPairRef as null forever).
    dmKeyPairRef.current = pair;
    await saveDmKeyPair(userId, pair).catch((err) =>
      console.error('[setupDmKeys] could not persist fresh key (continuing in-memory):', err));
    setDmMsgLoaded({});
    const freshJwk = await exportPublicKeyJwk(pair.publicKey);
    // CLIENT-004: register the new public key with the server before declaring keys ready.
    // Only set dmKeysReady(true) when registration is confirmed — a freshly-generated key
    // has no prior encrypted messages, so there's nothing to decrypt until the server knows
    // our key. Leaving dmKeysReady(false) on failure prompts the user to retry/re-login.
    let freshRegistered = false;
    try {
      if (serverKeyJwk === null && !serverKeyFetchFailed) {
        // Server confirmed has no key — register freely (no password needed).
        await api.registerPublicKey(freshJwk);
        setDmKeyMismatch(false);
        freshRegistered = true;
      } else if (password) {
        // Server has a different key — override with password.
        await api.registerPublicKey(freshJwk, { password, authKdfSalt });
        setDmKeyMismatch(false);
        freshRegistered = true;
      } else {
        // Server has a key we can't override without credentials.
        // Flag mismatch — user needs to log in once to reconcile.
        setDmKeyMismatch(true);
      }
    } catch (err) {
      console.error('[setupDmKeys] registerPublicKey failed:', err);
      setDmKeyMismatch(true);
    }
    // Only mark ready when registration succeeded. A fresh key has no prior messages,
    // so there's nothing to decrypt before the server knows the key.
    dmKeyStatusRef.current = freshRegistered ? 'send-ready' : 'locked';
    setDmKeysReady(freshRegistered);
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
    const authKdfSalt = await resolveAuthKdfSalt();
    const { backup } = await api.getDmKeyBackup(password, authKdfSalt);
    if (!backup) throw new Error('No key backup found on server. Log in on your other device first.');
    const restored = await decryptDmKeyBackup(backup, password);
    if (!restored) throw new Error('Wrong password or corrupted backup.');
    const pubJwk = await exportPublicKeyJwk(restored.publicKey);

    // ── Verify ALL server state BEFORE touching any local state (Issue 1) ──────
    // Any throw here leaves the current local key pair completely intact.
    let currentServerKey: string | null = null;
    try {
      const { publicKey } = await api.getMyPublicKey();
      currentServerKey = publicKey;
    } catch {
      // Fail closed — can't verify server state, refuse to overwrite local key.
      throw new Error('Could not verify the current server key — check your connection and try again.');
    }

    if (currentServerKey !== null && !jwkPointMatches(pubJwk, currentServerKey)) {
      throw new Error(
        'Backup is outdated — it doesn\'t match the key on the server. ' +
        'Log in on the device with the current key to refresh the backup, then sync here.',
      );
    }

    if (currentServerKey === null) {
      // Server confirmed no key — register the restored backup key.
      // This is the required step; failure means sync cannot complete.
      await api.registerPublicKey(pubJwk, { password, authKdfSalt });
    }
    // currentServerKey matched pubJwk — server already correct, no registration needed.

    // ── All checks passed — now mutate local state ────────────────────────────
    await saveDmKeyPair(user?.id ?? '', restored);
    dmKeyPairRef.current = restored;
    dmKeyStatusRef.current = 'send-ready';
    // Flush only the derived AES cache — NOT IndexedDB, which now holds the restored key.
    clearDmAesKeyCache();
    setDmMsgLoaded({});
    setDmMessages({});
    setDmKeyMismatch(false);
    setDmBackupOutOfSync(false);
    setDmKeyEpoch((v) => v + 1);
    setDmKeysReady(true);
    // M-7: Raw password is not cached in sessionStorage.
  }

  async function handleRotateKey(password: string): Promise<void> {
    // BUG 1: concurrent invocation guard
    if (rotatingRef.current) return;
    rotatingRef.current = true;

    // Snapshot pre-rotation state so we can restore it if we fail before saving the new key.
    // (The old key might be decrypt-only or locked — don't accidentally upgrade it to send-ready.)
    const prevReady = dmKeysReady;
    const prevStatus = dmKeyStatusRef.current;
    const prevMismatch = dmKeyMismatch;
    const prevBackupOutOfSync = dmBackupOutOfSync;

    // BUG 2: mark keys not ready during rotation so concurrent DM ops don't use a half-rotated key
    setDmKeysReady(false);
    dmKeyStatusRef.current = 'locked';
    // BUG 4: clear any previous backup-out-of-sync flag at the start of a new attempt
    setDmBackupOutOfSync(false);

    let newKeySaved = false;
    let registrationSucceeded = false;
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
      await archiveCurrentKeyPair(user?.id ?? '');

      // Export private key BEFORE saving (while still extractable — saveDmKeyPair re-imports as non-extractable)
      const privJwkForBackup = await exportPrivateKeyJwk(newPair.privateKey);

      // Step 4: persist new key to IDB
      await saveDmKeyPair(user?.id ?? '', newPair);
      newKeySaved = true;

      // Step 5: update in-memory ref
      dmKeyPairRef.current = newPair;

      // Step 6: register new public key on the server (password required to override existing key)
      // CRYPTO-005: prevents stolen-session MITM attacks.
      await api.registerPublicKey(pubJwk, { password, authKdfSalt: user?.authKdfSalt ?? null }); // throws on network/server error
      registrationSucceeded = true;

      // Step 7: flush cached AES-GCM keys so they are re-derived from the new private key.
      // Use the AES-only clear — NOT clearAllDmKeys(), which would wipe the new IDB key pair.
      clearDmAesKeyCache();
      // BUG 3: mirror handleSyncDmKey — clear stale decrypted DM messages after rotation
      setDmMsgLoaded({});
      setDmMessages({});

      // Step 8: upload new backup blob so other devices can restore the rotated key.
      // CRYPTO-014: without this, any device synced before rotation retains the old key.
      if (privJwkForBackup && password) {
        try {
          // Chain the outgoing key (and its predecessors) into the new backup.
          // The old private key in IDB is non-extractable, so the previous backup
          // blob is the only recoverable copy — without chaining, rotating then
          // logging out anywhere makes pre-rotation messages permanently unreadable.
          // Use the same preservedHistory() helper as the normal-login path so
          // the deduplication logic is consistent and duplicate epochs can't
          // accumulate across multiple rotation+backup cycles.
          let historyJwks: JsonWebKey[] = [];
          try {
            const { backup: oldBlob } = await api.getDmKeyBackup(password, user?.authKdfSalt ?? null);
            if (oldBlob) {
              const old = await decryptDmKeyBackupJwks(oldBlob, password);
              if (old) historyJwks = preservedHistory(old, JSON.parse(pubJwk) as JsonWebKey);
            }
          } catch { /* no old backup to chain — non-fatal */ }
          const blob = await encryptDmKeyBackup(privJwkForBackup, password, historyJwks);
          await api.putDmKeyBackup(blob);
        } catch {
          // BUG 4: surface backup failure instead of swallowing it silently
          setDmBackupOutOfSync(true);
        }
      }
    } catch (err) {
      if (!newKeySaved) {
        // Old key pair still intact (error before IDB write) — restore the exact pre-rotation
        // state rather than blindly promoting to send-ready. The old key might have been
        // decrypt-only or locked before rotation started.
        setDmKeysReady(prevReady);
        dmKeyStatusRef.current = prevStatus;
        setDmKeyMismatch(prevMismatch);
        setDmBackupOutOfSync(prevBackupOutOfSync);
      } else if (!registrationSucceeded) {
        // New key saved locally but server registration failed — local/server split.
        // Peers still encrypt to the old server key; local key is now mismatched.
        // Flag mismatch so the UI prompts a retry; dmKeysReady stays false.
        dmKeyStatusRef.current = 'decrypt-only';
        setDmKeyMismatch(true);
        setDmKeysReady(false);
      }
      // else: newKeySaved && registrationSucceeded — post-registration step (e.g. backup) failed.
      // dmKeyStatusRef stays 'locked' but the finally block promotes it to send-ready since
      // both flags are true (the key IS valid and registered despite the backup issue).
      throw err;
    } finally {
      rotatingRef.current = false;
      // Fix 5: only declare ready when both steps completed — local save AND server registration.
      // newKeySaved && !registrationSucceeded leaves a local/server split that the mismatch
      // banner must surface; dmKeysReady must stay false until the user retries rotation.
      if (newKeySaved && registrationSucceeded) {
        dmKeyStatusRef.current = 'send-ready';
        setDmKeyEpoch((v) => v + 1);
        setDmKeysReady(true);
      }
    }
  }

  /**
   * Explicitly reset the DM key pair — generates a fresh ECDH key, registers it on the server
   * (password required to override the existing key), and uploads a new backup.
   *
   * ⚠ Destructive: DMs that were encrypted to the previous key and have not yet been decrypted
   * on this device will become permanently unreadable. This is the intentional escape hatch for
   * irrecoverable backup-out-of-sync states — called only from the danger-zone UI action.
   */
  async function handleResetDmKey(password: string): Promise<void> {
    // Issue 4: snapshot current UI state so we can fully restore it on pre-registration failure.
    const prevReady = dmKeysReady;
    const prevMismatch = dmKeyMismatch;
    const prevBackupOutOfSync = dmBackupOutOfSync;
    const prevStatus = dmKeyStatusRef.current;

    // Issue 5: track whether server registration committed — if true, any subsequent local
    // failure leaves a split state (server has new key, local is uncertain).
    let registrationDone = false;

    try {
      setDmKeysReady(false);
      dmKeyStatusRef.current = 'locked';

      // Step 1: generate new pair in memory — nothing on disk or server is touched yet.
      const newPair = await generateDmKeyPair();
      const freshJwk = await exportPublicKeyJwk(newPair.publicKey);
      const privJwk  = await exportPrivateKeyJwk(newPair.privateKey);

      // Step 2: register with the server FIRST, before touching local state.
      // If registration fails, the old local key is still in IDB — no split-state.
      await api.registerPublicKey(freshJwk, {
        password,
        authKdfSalt: user?.authKdfSalt ?? null,
      });
      registrationDone = true;

      // Step 3: server confirmed — now atomically wipe the old identity keys.
      // wipeDmIdentityKeysForReset() properly awaits idbClear() so the store is empty
      // before saveDmKeyPair() writes; prevents the race where clearAllDmKeys()'s
      // fire-and-forget idbClear() completes *after* the new key is written, wiping it.
      await wipeDmIdentityKeysForReset();

      // Step 4: persist new pair and update in-memory ref.
      // Do NOT swallow this error: if IDB write fails after the server accepted the new public
      // key, the user is in a split state (server knows new key, local has nothing on disk).
      // The outer catch handles this as a post-registration failure.
      await saveDmKeyPair(user?.id ?? '', newPair);
      dmKeyPairRef.current = newPair;
      clearDmAesKeyCache();

      // Step 5: upload fresh backup. Reset intentionally starts with empty history (old keys
      // discarded). Surface failure so the user knows recovery on other devices is at risk.
      if (privJwk) {
        try {
          const blob = await encryptDmKeyBackup(privJwk, password, []);
          await api.putDmKeyBackup(blob);
          setDmBackupOutOfSync(false);
        } catch {
          setDmBackupOutOfSync(true);
        }
      } else {
        // freshly-generated key should always be extractable — this is a hard unexpected case
        setDmBackupOutOfSync(true);
      }

      setDmMsgLoaded({});
      setDmMessages({});
      setDmKeyMismatch(false);
      dmKeyStatusRef.current = 'send-ready';
      setDmKeyEpoch((v) => v + 1);
      setDmKeysReady(true);
    } catch (err) {
      if (!registrationDone) {
        // Pre-registration failure — server never saw the new key, old key intact.
        // Fully restore previous UI state so the user can keep using DMs.
        setDmKeysReady(prevReady);
        setDmKeyMismatch(prevMismatch);
        setDmBackupOutOfSync(prevBackupOutOfSync);
        dmKeyStatusRef.current = prevStatus;
      } else {
        // Post-registration split: server has the new key but local wipe/save threw.
        // We can't use the old key (server won't recognise it) and local key state is
        // uncertain — force mismatch so the UI prompts the user to sync or try again.
        setDmKeyMismatch(true);
        setDmBackupOutOfSync(true);
        setDmKeysReady(false);
        dmKeyStatusRef.current = 'locked';
      }
      throw err;
    }
  }

  return {
    // state (setters exposed where App.tsx mutates them directly — banner dismiss, logout)
    dmKeysReady,
    setDmKeysReady,
    dmKeyEpoch,
    dmKeyMismatch,
    setDmKeyMismatch,
    dmBackupOutOfSync,
    myFingerprint,
    peerKeyChanged,
    setPeerKeyChanged,
    peerFingerprints,
    setPeerFingerprints,
    // refs — socket handlers and the login effect rely on these being refs
    dmKeyPairRef,
    dmKeyStatusRef,
    setupPasswordRef,
    // key lifecycle API
    ensureDmKeys,
    getDmKey,
    tryDecryptDm,
    decryptDmMessages,
    describeDmKeyFailure,
    runPeerTofu,
    handleAcceptPeerKey,
    handleSyncDmKey,
    handleRotateKey,
    handleResetDmKey,
  };
}
