const PBKDF2_ITERS = 300_000; // Increased from 200k for 2026 OWASP compliance (PBKDF2-SHA-256)
const SESSION_KEY_PREFIX = 'recline.aeskey.';

// ── Zero-knowledge auth key derivation ───────────────────────────────────────
// These must stay in sync with the server-side KDF parameters in auth.ts.
const AUTH_KDF_ITERATIONS = 210_000; // OWASP minimum for PBKDF2-SHA-256 (2024+)

/** Generate a cryptographically random 32-byte hex salt for auth key derivation. */
export function generateAuthSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive the 256-bit auth key from the user's password + per-user salt.
 * This derived key is sent to the server instead of the raw password —
 * the plaintext password never leaves the device.
 *
 * Output: lowercase hex string (64 chars = 32 bytes).
 * Algorithm: PBKDF2-SHA256, 100k iterations, via WebCrypto (native speed).
 */
export async function deriveAuthKey(password: string, saltHex: string): Promise<string> {
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: AUTH_KDF_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── RUM custom action helper ──────────────────────────────────────────────────
// Uses window.DD_RUM injected by the RUM SDK — no import needed, safe to call
// even before the SDK initialises (just a no-op until it's ready).
function rumTrack(name: string, context: Record<string, unknown>) {
  try { (window as any).DD_RUM?.addAction(name, context); } catch { /* RUM not ready */ }
}

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function fromB64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const buf = new ArrayBuffer(s.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return buf;
}

export async function deriveServerKey(
  passphrase: string,
  serverId: string,
  kdfSalt?: string | null, // base64 random salt from the server (#11); null/undefined = legacy
): Promise<CryptoKey> {
  const t0 = performance.now();
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  // Prefer the random per-server salt stored on the server (breaks rainbow tables).
  // Fall back to the stable deterministic salt for servers created before this change.
  const salt = kdfSalt ? fromB64(kdfSalt) : enc.encode(`recline:v1:${serverId}`);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,               // CRYPTO-001: non-extractable — raw key bytes never leave WebCrypto
    ['encrypt', 'decrypt'],
  );
  rumTrack('encryption.key_exchange', { duration_ms: performance.now() - t0, algorithm: 'PBKDF2-AES-GCM-256' });
  return key;
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<{ ciphertext: string; nonce: string }> {
  const t0 = performance.now();
  try {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, enc.encode(plaintext));
    rumTrack('encryption.encrypt', { duration_ms: performance.now() - t0, algorithm: 'AES-GCM-256' });
    return { ciphertext: toB64(buf), nonce: toB64(nonce) };
  } catch (e) {
    rumTrack('encryption.error', { operation: 'encrypt', error: String(e) });
    throw e;
  }
}

export async function decryptText(key: CryptoKey, ciphertext: string, nonce: string): Promise<string> {
  const t0 = performance.now();
  try {
    const buf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(nonce) },
      key,
      fromB64(ciphertext),
    );
    rumTrack('encryption.decrypt', { duration_ms: performance.now() - t0, algorithm: 'AES-GCM-256' });
    return new TextDecoder().decode(buf);
  } catch (e) {
    rumTrack('encryption.error', { operation: 'decrypt', error: String(e) });
    throw e;
  }
}

// ── ECDH P-256 DM key exchange ────────────────────────────────────────────────
// Key pair: generated once and stored in IndexedDB.
//   • Public key:  extractable (must be exported as JWK and uploaded to the server)
//   • Private key: stored as NON-extractable in IndexedDB after the initial backup export.
//     SECURITY NOTE: the key is generated as extractable:true to support the cross-device
//     backup feature (encryptDmKeyBackup / decryptDmKeyBackup). saveDmKeyPair() re-imports
//     the private key as extractable:false before writing to IndexedDB, so the live stored
//     key cannot be exported by same-origin script. During the generation→backup→save
//     window the extractable version exists only in memory, not in storage.
//     An XSS attacker cannot export the key from IndexedDB, but could theoretically
//     intercept it during the in-memory window if execution happens between generateDmKeyPair
//     and saveDmKeyPair. For a fully hardened deployment, use a CSP that blocks XSS entirely.
// DM AES-GCM key: ECDH shared secret → HKDF-SHA256 → AES-GCM-256.
// Per-conversation key is cached in memory by dmChannelId.

const DM_AESKEY_PREFIX       = 'recline.dm.aeskey.';
// History of previous private keys (max 5) — kept so old messages can still be decrypted
// after a key rotation. Stored as CryptoKey objects in IndexedDB, newest first.
const DM_KEYPAIR_HISTORY_MAX = 5;

// ── IndexedDB key storage ─────────────────────────────────────────────────────
// CryptoKey objects can be stored directly in IndexedDB — the browser preserves
// the non-extractable flag across storage round-trips. This replaces the old
// localStorage-JWK approach which exposed raw key material to any script on the origin.

const IDB_NAME    = 'recline.keys';
const IDB_VERSION = 1;
const IDB_STORE   = 'keypairs';

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess  = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror    = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess  = () => resolve((req.result as T) ?? null);
    req.onerror    = () => reject(req.error);
    tx.oncomplete  = () => db.close();
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { reject(tx.error); };
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbClear(): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => reject(tx.error);
  });
}

export async function generateDmKeyPair(): Promise<CryptoKeyPair> {
  // extractable:true so we can export the private key for cross-device backup.
  // The backup is encrypted with the user's password before upload, so the raw
  // private JWK never leaves the client unencrypted.
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
}

/** Export the private key as JWK for backup. Returns null for legacy non-extractable keys. */
export async function exportPrivateKeyJwk(privateKey: CryptoKey): Promise<JsonWebKey | null> {
  try {
    return await crypto.subtle.exportKey('jwk', privateKey);
  } catch {
    return null; // non-extractable — cannot back up; user must rotate key
  }
}

/** Derive an AES-GCM-256 key from a password + random salt (PBKDF2 / SHA-256). */
async function deriveBackupKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations = 600_000): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  return btoa(String.fromCharCode(...bytes));
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(s);
  const out = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) out[i] = decoded.charCodeAt(i);
  return out;
}

/**
 * Encrypt a private key JWK with the user's password.
 * Returns a JSON string suitable for server storage — the server sees only opaque ciphertext.
 */
export async function encryptDmKeyBackup(privJwk: JsonWebKey, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveBackupKey(password, salt);
  const ct   = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(privJwk)),
  );
  return JSON.stringify({ v: 2, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}

/**
 * Decrypt a backup blob and reconstruct the full CryptoKeyPair.
 * Returns null if the password is wrong or the blob is corrupt.
 */
export async function decryptDmKeyBackup(blob: string, password: string): Promise<CryptoKeyPair | null> {
  try {
    const { v, salt, iv, ct } = JSON.parse(blob) as { v: number; salt: string; iv: string; ct: string };
    if (v !== 1 && v !== 2) return null;
    // v1 backups used 200k iterations; v2 uses 600k. Pass explicit count for v1 compatibility.
    const iters    = v === 1 ? 200_000 : 600_000;
    const key      = await deriveBackupKey(password, unb64(salt), iters);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
    const privJwk  = JSON.parse(new TextDecoder().decode(plainBuf)) as JsonWebKey;
    // Reconstruct the public key from the private JWK — P-256 JWKs carry x and y.
    const pubJwk: JsonWebKey = { kty: privJwk.kty, crv: privJwk.crv, x: privJwk.x, y: privJwk.y };
    // Import the restored key pair. Public key is extractable (needed for JWK upload).
    // Private key is imported as extractable:true here so exportPrivateKeyJwk() can be
    // called if a new backup needs to be uploaded immediately after restore. saveDmKeyPair()
    // will re-import as non-extractable when storing to IndexedDB.
    const [publicKey, privateKey] = await Promise.all([
      crypto.subtle.importKey('jwk', pubJwk,  { name: 'ECDH', namedCurve: 'P-256' }, true,  []),
      crypto.subtle.importKey('jwk', privJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']),
    ]);
    return { publicKey, privateKey };
  } catch {
    return null;
  }
}

/** Export the public key as a JWK string suitable for the server. */
export async function exportPublicKeyJwk(publicKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return JSON.stringify(jwk);
}

/** Persist the key pair to IndexedDB.
 *
 * AUTH-012/CRYPTO-003: If the private key is extractable (e.g. freshly generated for backup
 * export), re-import it as NON-extractable before storing. This ensures the key in IndexedDB
 * cannot be exported by same-origin script (XSS, malicious extension). The backup export
 * should happen BEFORE calling saveDmKeyPair — callers hold the extractable version in memory
 * only long enough to encrypt the backup, then this function stores it non-extractably.
 */
export async function saveDmKeyPair(pair: CryptoKeyPair): Promise<void> {
  try {
    let privateKey = pair.privateKey;
    if (privateKey.extractable) {
      // Re-import as non-extractable so the stored key cannot be exfiltrated by XSS.
      const privJwk = await crypto.subtle.exportKey('jwk', privateKey);
      privateKey = await crypto.subtle.importKey(
        'jwk', privJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,                          // NON-extractable
        ['deriveKey', 'deriveBits'],    // CRYPTO-010: must NOT be [] — empty usages makes the key permanently unusable for ECDH operations
      );
    }
    const pubJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    await idbSet('current', { pubJwk, privateKey });
  } catch { /* non-fatal */ }
}

/** Load a previously saved key pair from IndexedDB. Returns null if none. */
export async function loadDmKeyPair(): Promise<CryptoKeyPair | null> {
  try {
    // Migrate from old localStorage JWK format if present
    const legacyRaw = localStorage.getItem('recline.dm.keypair');
    if (legacyRaw) {
      const { pub, priv } = JSON.parse(legacyRaw);
      const [publicKey, privateKey] = await Promise.all([
        crypto.subtle.importKey('jwk', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
        crypto.subtle.importKey('jwk', priv, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']),
      ]);
      const pair = { publicKey, privateKey };
      await saveDmKeyPair(pair);
      localStorage.removeItem('recline.dm.keypair');
      localStorage.removeItem('recline.dm.keypair.history');
      // Clean up any legacy DM history / message-cache entries left in localStorage.
      try {
        const legacyKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('dm_')) legacyKeys.push(k);
        }
        legacyKeys.forEach((k) => localStorage.removeItem(k));
      } catch { /* non-fatal — key loading must not fail over cleanup errors */ }
      return pair;
    }

    const stored = await idbGet<{ pubJwk: JsonWebKey; privateKey: CryptoKey }>('current');
    if (!stored) return null;
    const publicKey = await crypto.subtle.importKey(
      'jwk', stored.pubJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true, [],
    );
    return { publicKey, privateKey: stored.privateKey };
  } catch {
    await idbDelete('current').catch(() => {});
    return null;
  }
}

/** Import a peer's public key from the JWK string stored on the server. */
export async function importPeerPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

/**
 * Derive the AES-GCM-256 key for a DM channel using ECDH + HKDF.
 * HKDF info includes the channel ID so each DM channel gets a distinct key
 * even if two users share multiple DMs (impossible in practice due to the UNIQUE
 * constraint, but good hygiene regardless).
 */
export async function deriveDmKey(
  myPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  dmChannelId: string,
): Promise<CryptoKey> {
  const t0 = performance.now();
  const enc = new TextEncoder();

  // ECDH → raw shared secret
  const sharedSecret = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    myPrivateKey,
    { name: 'HKDF' },  // HKDF as the "derived key" algorithm
    false,
    ['deriveKey'],
  );

  // HKDF → AES-GCM-256
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('recline:dm:v1'),
      info: enc.encode(`dm:${dmChannelId}`),
    },
    sharedSecret,
    { name: 'AES-GCM', length: 256 },
    false, // DM AES key: non-extractable (never needs to leave memory)
    ['encrypt', 'decrypt'],
  );
  rumTrack('encryption.key_exchange', { duration_ms: performance.now() - t0, algorithm: 'ECDH-HKDF-AES-GCM-256' });
  return key;
}

const dmMemoryKeys = new Map<string, CryptoKey>();

export function cacheDmKey(dmChannelId: string, key: CryptoKey) {
  // DM AES-GCM keys are derived via HKDF and imported as non-extractable.
  // They live in memory only — no sessionStorage export is attempted because
  // non-extractable keys cannot be serialised and any XSS would find nothing to steal.
  // Cost: the key must be re-derived from the ECDH shared secret on each page load.
  dmMemoryKeys.set(dmChannelId, key);
}

export function getCachedDmKey(dmChannelId: string): CryptoKey | undefined {
  return dmMemoryKeys.get(dmChannelId);
}

export function clearDmKey(dmChannelId: string) {
  dmMemoryKeys.delete(dmChannelId);
  // Also remove any legacy sessionStorage entry from the old scheme (pre-memory-only migration)
  sessionStorage.removeItem(DM_AESKEY_PREFIX + dmChannelId);
}

export function clearAllDmKeys() {
  dmMemoryKeys.clear();
  const toDelete: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(DM_AESKEY_PREFIX)) toDelete.push(k);
  }
  toDelete.forEach((k) => sessionStorage.removeItem(k));
  // Wipe all ECDH keypairs from IndexedDB on logout so a shared-device scenario
  // cannot recover keys after the user signs out. (#H-6)
  idbClear().catch(() => {});
  // Also clear any legacy localStorage keys that survived migration
  localStorage.removeItem('recline.dm.keypair');
  localStorage.removeItem('recline.dm.keypair.history');
}

// ── Key rotation ──────────────────────────────────────────────────────────────
// Generates a brand-new ECDH key pair and archives the current one to history
// (up to DM_KEYPAIR_HISTORY_MAX previous keys kept for decrypting old messages).
// The new keypair becomes the "current" one; the caller must upload the new
// public key to the server via api.registerPublicKey() to complete rotation.

/** Archive the current keypair to history (called before rotation). */
export async function archiveCurrentKeyPair(): Promise<void> {
  try {
    const current = await idbGet<{ pubJwk: JsonWebKey; privateKey: CryptoKey }>('current');
    if (!current) return;
    const history = (await idbGet<typeof current[]>('history')) ?? [];
    history.unshift(current); // newest first
    if (history.length > DM_KEYPAIR_HISTORY_MAX) history.splice(DM_KEYPAIR_HISTORY_MAX);
    await idbSet('history', history);
  } catch { /* non-fatal */ }
}

/**
 * Generate a new DM ECDH key pair, archive the old one, and persist the new one.
 * After calling this, upload the new public key with api.registerPublicKey() and
 * call clearAllDmKeys() to flush derived AES key caches.
 */
export async function rotateDmKeyPair(): Promise<CryptoKeyPair> {
  await archiveCurrentKeyPair();
  const pair = await generateDmKeyPair();
  await saveDmKeyPair(pair);
  return pair;
}

/** Load all historical (pre-rotation) key pairs from IndexedDB. */
export async function loadDmKeyHistory(): Promise<CryptoKeyPair[]> {
  try {
    const entries = (await idbGet<{ pubJwk: JsonWebKey; privateKey: CryptoKey }[]>('history')) ?? [];
    const pairs: CryptoKeyPair[] = [];
    for (const { pubJwk, privateKey } of entries) {
      try {
        const publicKey = await crypto.subtle.importKey(
          'jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [],
        );
        pairs.push({ publicKey, privateKey });
      } catch { /* corrupt entry — skip */ }
    }
    return pairs;
  } catch { return []; }
}

const memoryKeys = new Map<string, CryptoKey>();

// ── sessionStorage persistence ────────────────────────────────────────────────
// Previously we exported the raw AES-GCM key JWK to sessionStorage — any XSS
// could read the raw key bytes and decrypt all messages offline without any further
// work. Now we store only the passphrase + kdfSalt and re-derive on reload.
//
// SECURITY NOTE (CRYPTO-001): storing the passphrase in sessionStorage is a
// deliberate UX trade-off for reload persistence. An XSS attacker on the same
// origin CAN read sessionStorage, obtain both the passphrase and kdfSalt, run
// PBKDF2 locally (< 1 second in-browser), and reconstruct the AES-GCM-256 key.
// This design improves on raw-key storage (attacker can no longer directly import
// extracted bytes into other environments) but does NOT prevent a sophisticated
// XSS from decrypting server channel messages in-browser.
// For maximum security: do not persist to sessionStorage and require the user to
// re-enter the passphrase on every page reload.
//
// Prefix change: 'recline.aeskey.' → 'recline.passphrase.' — old keys are stale
// and will be ignored / cleaned up by the new removeKeyFromSession.

const SESSION_PASS_PREFIX = 'recline.passphrase.';

/** Persist passphrase + kdfSalt so the key can be re-derived on page reload. */
export function cachePassphrase(serverId: string, passphrase: string, kdfSalt: string | null | undefined): void {
  try {
    sessionStorage.setItem(
      SESSION_PASS_PREFIX + serverId,
      JSON.stringify({ passphrase, kdfSalt: kdfSalt ?? null }),
    );
  } catch { /* quota exceeded — non-fatal, user will re-enter on reload */ }
}

/** Re-derive the AES key from the stored passphrase. Returns null if nothing stored. */
export async function importKeyFromSession(serverId: string): Promise<CryptoKey | null> {
  try {
    const raw = sessionStorage.getItem(SESSION_PASS_PREFIX + serverId);
    if (!raw) return null;
    const { passphrase, kdfSalt } = JSON.parse(raw) as { passphrase: string; kdfSalt: string | null };
    if (!passphrase) return null;
    return await deriveServerKey(passphrase, serverId, kdfSalt);
  } catch {
    sessionStorage.removeItem(SESSION_PASS_PREFIX + serverId);
    return null;
  }
}

function removeKeyFromSession(serverId: string) {
  sessionStorage.removeItem(SESSION_PASS_PREFIX + serverId);
  // Also clear any legacy key entries from the old scheme
  sessionStorage.removeItem(SESSION_KEY_PREFIX + serverId);
}

function clearSessionKeys() {
  const toDelete: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(SESSION_PASS_PREFIX) || k?.startsWith(SESSION_KEY_PREFIX)) toDelete.push(k);
  }
  toDelete.forEach((k) => sessionStorage.removeItem(k));
}

export function cacheKey(serverId: string, key: CryptoKey) {
  memoryKeys.set(serverId, key);
  // Key is non-extractable — we do NOT write it to sessionStorage here.
  // Call cachePassphrase() alongside cacheKey() to enable reload recovery.
}
export function getCachedKey(serverId: string): CryptoKey | undefined {
  return memoryKeys.get(serverId);
}
export function clearKey(serverId: string) {
  memoryKeys.delete(serverId);
  removeKeyFromSession(serverId);
}
/** Clear ALL cached keys — call on server switch to avoid stale keys in memory (#27). */
export function clearAllKeys() {
  memoryKeys.clear();
  clearSessionKeys();
}
