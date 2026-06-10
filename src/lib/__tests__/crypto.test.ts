/**
 * Regression suite for client/src/lib/crypto.ts — the E2E DM encryption module.
 *
 * Purpose: lock in CURRENT behavior. This file has seen repeated regressions
 * (stale key cache, TOFU bypass, backup v3 rejection, key-history loss), so the
 * assertions below intentionally pin observable behavior — including some
 * behaviors that look odd but are deliberate (fail-open TOFU on storage errors,
 * fire-and-forget IDB wipe in clearAllDmKeys, stale-backup restores succeeding
 * while new-epoch messages stay unreadable).
 *
 * Environment: node + WebCrypto (native), fake-indexeddb, in-memory Storage
 * shims (see setup.ts). PBKDF2 at 600k iterations is real — the heavy tests are
 * kept to one full KDF roundtrip per backup version.
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  generateAuthSalt,
  deriveAuthKey,
  deriveServerKey,
  encryptText,
  decryptText,
  generateDmKeyPair,
  exportPrivateKeyJwk,
  exportPublicKeyJwk,
  importPeerPublicKey,
  encryptDmKeyBackup,
  decryptDmKeyBackupJwks,
  decryptDmKeyBackup,
  saveDmKeyPair,
  loadDmKeyPair,
  fingerprintJwk,
  checkPeerKeyTofu,
  repinPeerKey,
  isPeerKeyKnown,
  deriveDmKey,
  cacheDmKey,
  getCachedDmKey,
  clearDmKey,
  clearAllDmKeys,
  archiveCurrentKeyPair,
  rotateDmKeyPair,
  loadDmKeyHistory,
  cachePassphrase,
  importKeyFromSession,
  cacheKey,
  getCachedKey,
  clearKey,
  clearAllKeys,
} from '../crypto';

const enc = new TextEncoder();

// ── test helpers ──────────────────────────────────────────────────────────────

function b64(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

/** Build a legacy (v1 = 200k-iteration / v2 = 600k-iteration) backup blob the way
 *  old clients did: bare private JWK as the AES-GCM payload, no history field. */
async function makeLegacyBackupBlob(privJwk: JsonWebKey, password: string, version: 1 | 2): Promise<string> {
  const iterations = version === 1 ? 200_000 : 600_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(privJwk)));
  return JSON.stringify({ v: version, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}

async function pubFingerprint(key: CryptoKey): Promise<string> {
  return fingerprintJwk(await exportPublicKeyJwk(key));
}

/**
 * Build a CryptoKeyPair whose private key is ALREADY non-extractable.
 *
 * Needed because of a live bug locked in below: saveDmKeyPair() cannot persist
 * extractable keys (its re-import requests ['deriveKey','deriveBits'] but the
 * exported JWK carries key_ops:['deriveKey'] — DataError per the WebCrypto spec,
 * verified identical in headless Chrome). A pair that is already non-extractable
 * skips the re-import branch, so it is currently the only kind that can be
 * persisted — we use it to exercise the storage/rotation/history machinery.
 */
async function makeNonExtractablePair(): Promise<CryptoKeyPair> {
  const gen = await generateDmKeyPair();
  const privJwk = await crypto.subtle.exportKey('jwk', gen.privateKey);
  const privateKey = await crypto.subtle.importKey(
    'jwk', privJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey'],
  );
  return { publicKey: gen.publicKey, privateKey };
}

/** Encrypt a message FROM `sender` TO the owner of `recipientPub` on a DM channel. */
async function encryptTo(
  senderPriv: CryptoKey,
  recipientPub: CryptoKey,
  channelId: string,
  plaintext: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const key = await deriveDmKey(senderPriv, recipientPub, channelId);
  return encryptText(key, plaintext);
}

/** Decrypt a message addressed to `myPriv`, sent by the owner of `senderPub`. */
async function decryptFrom(
  myPriv: CryptoKey,
  senderPub: CryptoKey,
  channelId: string,
  msg: { ciphertext: string; nonce: string },
): Promise<string> {
  const key = await deriveDmKey(myPriv, senderPub, channelId);
  return decryptText(key, msg.ciphertext, msg.nonce);
}

beforeEach(() => {
  // Fresh state for every test: crypto.ts reads the `indexedDB` global at call
  // time, so swapping in a new factory wipes all persisted keys instantly
  // (no async clear needed). Storage shims are module-level — clear them too.
  (globalThis as Record<string, unknown>).indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 7. pure helpers ───────────────────────────────────────────────────────────

describe('generateAuthSalt', () => {
  it('returns 32 random bytes as lowercase hex', () => {
    const a = generateAuthSalt();
    const b = generateAuthSalt();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('deriveAuthKey', () => {
  it('matches the pinned PBKDF2-SHA256/210k test vector (locks KDF params)', async () => {
    // Any change to iteration count, hash, or output length breaks server-side
    // auth for every existing user — this vector pins all three.
    const salt = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    const out = await deriveAuthKey('correct horse battery staple', salt);
    expect(out).toBe('21b56cc03fd2b98bd4586a0cf8a904c40c142af2d57822a0e1f105b9002301eb');
  });
});

describe('fingerprintJwk', () => {
  const x = 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU';
  const y = 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0';

  it('matches the pinned vector and grouped-hex format', async () => {
    const fp = await fingerprintJwk({ kty: 'EC', crv: 'P-256', x, y });
    expect(fp).toBe('F7EE 5482 CA9A A2BC 6BC1 2E0E 7656 76D1');
    expect(fp).toMatch(/^([0-9A-F]{4} ){7}[0-9A-F]{4}$/);
  });

  it('accepts a JWK JSON string and yields the same result as the object form', async () => {
    const obj = { kty: 'EC', crv: 'P-256', x, y };
    expect(await fingerprintJwk(JSON.stringify(obj))).toBe(await fingerprintJwk(obj));
  });

  it('depends only on crv/x/y — private JWK fingerprints equal the public one', async () => {
    const pair = await generateDmKeyPair();
    const privJwk = (await exportPrivateKeyJwk(pair.privateKey))!;
    expect(await fingerprintJwk(privJwk)).toBe(await pubFingerprint(pair.publicKey));
  });

  it('returns empty string for unparseable JSON input', async () => {
    expect(await fingerprintJwk('not json {{{')).toBe('');
  });

  it('differs between distinct keys', async () => {
    const [a, b] = await Promise.all([generateDmKeyPair(), generateDmKeyPair()]);
    expect(await pubFingerprint(a.publicKey)).not.toBe(await pubFingerprint(b.publicKey));
  });
});

// ── server channel encryption (PBKDF2 passphrase → AES-GCM) ──────────────────

describe('deriveServerKey + encryptText/decryptText', () => {
  it('roundtrips; per-server kdfSalt changes the key; tampering fails AEAD', async () => {
    const kLegacy = await deriveServerKey('hunter2', 'srv-1'); // legacy deterministic salt path
    const kSalted = await deriveServerKey('hunter2', 'srv-1', b64(crypto.getRandomValues(new Uint8Array(16))));

    const msg = await encryptText(kLegacy, 'channel secret 🎉');
    expect(msg.ciphertext).not.toContain('channel secret');
    // 12-byte nonce, fresh per message
    expect(atob(msg.nonce).length).toBe(12);
    const msg2 = await encryptText(kLegacy, 'channel secret 🎉');
    expect(msg2.nonce).not.toBe(msg.nonce);

    expect(await decryptText(kLegacy, msg.ciphertext, msg.nonce)).toBe('channel secret 🎉');

    // random-salted key must NOT decrypt the legacy-salt ciphertext
    await expect(decryptText(kSalted, msg.ciphertext, msg.nonce)).rejects.toThrow();

    // bit-flip the ciphertext → AES-GCM auth failure
    const raw = atob(msg.ciphertext);
    const flipped = String.fromCharCode(raw.charCodeAt(0) ^ 0xff) + raw.slice(1);
    await expect(decryptText(kLegacy, btoa(flipped), msg.nonce)).rejects.toThrow();
  });
});

// ── 6. DM message encrypt/decrypt between two key pairs ──────────────────────

describe('deriveDmKey (ECDH P-256 + HKDF → AES-GCM)', () => {
  it('both sides derive the same channel key; messages roundtrip', async () => {
    const [alice, bob] = await Promise.all([generateDmKeyPair(), generateDmKeyPair()]);
    const msg = await encryptTo(alice.privateKey, bob.publicKey, 'dm-ch-1', 'hi bob');
    expect(await decryptFrom(bob.privateKey, alice.publicKey, 'dm-ch-1', msg)).toBe('hi bob');
  });

  it('the channel ID is bound into the key — same pair, different channel cannot decrypt', async () => {
    const [alice, bob] = await Promise.all([generateDmKeyPair(), generateDmKeyPair()]);
    const msg = await encryptTo(alice.privateKey, bob.publicKey, 'dm-ch-1', 'hi');
    await expect(decryptFrom(bob.privateKey, alice.publicKey, 'dm-ch-OTHER', msg)).rejects.toThrow();
  });

  it('peer public key survives the server JWK-string roundtrip (export → import)', async () => {
    const [alice, bob] = await Promise.all([generateDmKeyPair(), generateDmKeyPair()]);
    const bobPubString = await exportPublicKeyJwk(bob.publicKey); // what gets uploaded
    const bobPubImported = await importPeerPublicKey(bobPubString); // what a peer downloads
    expect(await pubFingerprint(bobPubImported)).toBe(await pubFingerprint(bob.publicKey));
    const msg = await encryptTo(alice.privateKey, bobPubImported, 'dm-ch-2', 'via server jwk');
    expect(await decryptFrom(bob.privateKey, alice.publicKey, 'dm-ch-2', msg)).toBe('via server jwk');
  });
});

// ── key pair persistence (IndexedDB) ──────────────────────────────────────────

describe('saveDmKeyPair / loadDmKeyPair / exportPrivateKeyJwk', () => {
  it('loadDmKeyPair returns null when nothing is stored', async () => {
    expect(await loadDmKeyPair()).toBeNull();
  });

  it('persists a freshly generated (extractable) pair non-extractably (CRYPTO-011 regression)', async () => {
    // Regression for CRYPTO-011: exportKey('jwk') emits key_ops:['deriveKey']
    // and the non-extractable re-import used to request ['deriveKey','deriveBits'],
    // violating the WebCrypto usages-⊆-key_ops rule — every fresh/restored pair
    // threw DataError and no DM key pair was ever persisted. saveDmKeyPair now
    // strips key_ops before the re-import.
    const pair = await generateDmKeyPair();
    expect(pair.privateKey.extractable).toBe(true); // fresh keys are extractable for backup
    await saveDmKeyPair(pair);

    const loaded = (await loadDmKeyPair())!;
    expect(loaded).not.toBeNull();
    expect(loaded.privateKey.extractable).toBe(false); // stored non-exfiltratable
    expect(await pubFingerprint(loaded.publicKey)).toBe(await pubFingerprint(pair.publicKey));

    // and the stored key still performs ECDH
    const peer = await generateDmKeyPair();
    const msg = await encryptTo(peer.privateKey, pair.publicKey, 'dm-fresh-1', 'fresh key persisted');
    expect(await decryptFrom(loaded.privateKey, peer.publicKey, 'dm-fresh-1', msg)).toBe('fresh key persisted');
  });

  it('persists a pair whose private key is already non-extractable; loaded pair still works', async () => {
    const pair = await makeNonExtractablePair();
    await saveDmKeyPair(pair);

    const loaded = (await loadDmKeyPair())!;
    expect(loaded).not.toBeNull();
    expect(loaded.privateKey.extractable).toBe(false); // AUTH-012/CRYPTO-003
    expect(await exportPrivateKeyJwk(loaded.privateKey)).toBeNull(); // cannot exfiltrate
    expect(await pubFingerprint(loaded.publicKey)).toBe(await pubFingerprint(pair.publicKey));

    // the non-extractable stored key must still be usable for ECDH (CRYPTO-010)
    const peer = await generateDmKeyPair();
    const msg = await encryptTo(peer.privateKey, pair.publicKey, 'dm-st-1', 'stored key works');
    expect(await decryptFrom(loaded.privateKey, peer.publicKey, 'dm-st-1', msg)).toBe('stored key works');
  });

  it('exportPrivateKeyJwk returns the JWK (with d) for extractable keys', async () => {
    const pair = await generateDmKeyPair();
    const jwk = (await exportPrivateKeyJwk(pair.privateKey))!;
    expect(jwk.kty).toBe('EC');
    expect(jwk.crv).toBe('P-256');
    expect(typeof jwk.d).toBe('string');
  });
});

// ── 3. rotation + history chaining ────────────────────────────────────────────

describe('rotateDmKeyPair / archiveCurrentKeyPair / loadDmKeyHistory', () => {
  it('rotateDmKeyPair archives the old key and persists a new current pair (CRYPTO-011 regression)', async () => {
    // Used to reject mid-way (saveDmKeyPair DataError) leaving a half-rotated
    // state: old key duplicated into history, 'current' unchanged.
    const original = await makeNonExtractablePair();
    await saveDmKeyPair(original);
    const originalFp = await pubFingerprint(original.publicKey);

    const rotated = await rotateDmKeyPair();
    expect(rotated.privateKey.extractable).toBe(true); // returned pair supports backup export

    const current = (await loadDmKeyPair())!;
    const rotatedFp = await pubFingerprint(rotated.publicKey);
    expect(await pubFingerprint(current.publicKey)).toBe(rotatedFp); // current is the NEW key
    expect(rotatedFp).not.toBe(originalFp);
    expect(current.privateKey.extractable).toBe(false); // persisted non-exfiltratable

    const history = await loadDmKeyHistory();
    expect(history.length).toBe(1); // exactly one archive entry — no duplicates
    expect(await pubFingerprint(history[0].publicKey)).toBe(originalFp);
  });

  it('archive + save chains history: old-epoch messages still decrypt via loadDmKeyHistory', async () => {
    // Drives the rotation flow through its building blocks directly.
    const original = await makeNonExtractablePair();
    await saveDmKeyPair(original);
    const peer = await generateDmKeyPair();
    const oldMsg = await encryptTo(peer.privateKey, original.publicKey, 'dm-rot-1', 'sent before rotation');

    await archiveCurrentKeyPair();
    const next = await makeNonExtractablePair();
    await saveDmKeyPair(next);

    // current key changed
    const current = (await loadDmKeyPair())!;
    expect(await pubFingerprint(current.publicKey)).toBe(await pubFingerprint(next.publicKey));

    // old key is in history (newest first) and still decrypts the old message
    const history = await loadDmKeyHistory();
    expect(history.length).toBe(1);
    expect(await pubFingerprint(history[0].publicKey)).toBe(await pubFingerprint(original.publicKey));
    expect(await decryptFrom(history[0].privateKey, peer.publicKey, 'dm-rot-1', oldMsg)).toBe('sent before rotation');

    // and the NEW key must NOT decrypt the old-epoch message
    await expect(decryptFrom(next.privateKey, peer.publicKey, 'dm-rot-1', oldMsg)).rejects.toThrow();
  });

  it('history is capped at 5 — the 6th archive evicts the oldest key with a console warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fps: string[] = [];
    for (let i = 0; i < 6; i++) {
      const pair = await makeNonExtractablePair();
      fps.push(await pubFingerprint(pair.publicKey));
      await saveDmKeyPair(pair);
      await archiveCurrentKeyPair();
      if (i === 4) {
        expect((await loadDmKeyHistory()).length).toBe(5); // at cap, nothing dropped yet
        expect(warn).not.toHaveBeenCalled();
      }
    }
    const history = await loadDmKeyHistory();
    expect(history.length).toBe(5);
    expect(warn).toHaveBeenCalledTimes(1);
    const histFps = await Promise.all(history.map((p) => pubFingerprint(p.publicKey)));
    expect(histFps).toEqual([fps[5], fps[4], fps[3], fps[2], fps[1]]); // newest first
    expect(histFps).not.toContain(fps[0]); // oldest evicted
  });

  it('archiveCurrentKeyPair is a no-op when no current key exists', async () => {
    await archiveCurrentKeyPair();
    expect(await loadDmKeyHistory()).toEqual([]);
  });
});

// ── 1/2. backup roundtrips per version + failure modes ───────────────────────

describe('DM key backups', () => {
  const PASSWORD = 'backup-pass-w0rd';
  // Shared fixture: ONE expensive (600k-iteration) v3 blob reused across tests.
  let alice: CryptoKeyPair;
  let historyPair: CryptoKeyPair;
  let peer: CryptoKeyPair;
  let alicePrivJwk: JsonWebKey;
  let historyPrivJwk: JsonWebKey;
  let v3Blob: string;
  let msgToAlice: { ciphertext: string; nonce: string };

  beforeAll(async () => {
    [alice, historyPair, peer] = await Promise.all([generateDmKeyPair(), generateDmKeyPair(), generateDmKeyPair()]);
    alicePrivJwk = (await exportPrivateKeyJwk(alice.privateKey))!;
    historyPrivJwk = (await exportPrivateKeyJwk(historyPair.privateKey))!;
    v3Blob = await encryptDmKeyBackup(alicePrivJwk, PASSWORD, [historyPrivJwk]);
    msgToAlice = await encryptTo(peer.privateKey, alice.publicKey, 'dm-bk-1', 'pre-backup message');
  });

  it('encryptDmKeyBackup emits a v3 envelope: {v:3, salt(16B), iv(12B), ct} base64', () => {
    const parsed = JSON.parse(v3Blob) as { v: number; salt: string; iv: string; ct: string };
    expect(parsed.v).toBe(3);
    expect(atob(parsed.salt).length).toBe(16);
    expect(atob(parsed.iv).length).toBe(12);
    expect(atob(parsed.ct).length).toBeGreaterThan(0);
    expect(v3Blob).not.toContain(alicePrivJwk.d!); // private scalar never in cleartext
  });

  it('v3: decryptDmKeyBackupJwks returns {priv, history} matching the originals', async () => {
    const jwks = (await decryptDmKeyBackupJwks(v3Blob, PASSWORD))!;
    expect(jwks).not.toBeNull();
    expect(jwks.priv.d).toBe(alicePrivJwk.d);
    expect(jwks.priv.x).toBe(alicePrivJwk.x);
    expect(jwks.history.length).toBe(1);
    expect(jwks.history[0].d).toBe(historyPrivJwk.d);
  });

  it('v3: decryptDmKeyBackup restores a working pair AND merges real-world history JWKs into IndexedDB (CRYPTO-011 regression)', async () => {
    const restored = (await decryptDmKeyBackup(v3Blob, PASSWORD))!;
    expect(restored).not.toBeNull();
    expect(await pubFingerprint(restored.publicKey)).toBe(await pubFingerprint(alice.publicKey));
    // restored private key derives the same shared secret → decrypts the original message
    expect(await decryptFrom(restored.privateKey, peer.publicKey, 'dm-bk-1', msgToAlice)).toBe('pre-backup message');
    // restored key is extractable so a fresh backup can be uploaded right away
    expect(restored.privateKey.extractable).toBe(true);

    // CRYPTO-011 regression: real history JWKs carry key_ops:['deriveKey'] (they
    // come from exportPrivateKeyJwk); importHistoryEntry used to choke on them and
    // device history stayed empty after every restore. It must merge them now.
    const deviceHistory = await loadDmKeyHistory();
    expect(deviceHistory.length).toBe(1);
    expect(await pubFingerprint(deviceHistory[0].publicKey)).toBe(await pubFingerprint(historyPair.publicKey));
    expect(deviceHistory[0].privateKey.extractable).toBe(false); // merged non-extractably
    const histMsg = await encryptTo(peer.privateKey, historyPair.publicKey, 'dm-bk-h2', 'old epoch via real blob');
    expect(await decryptFrom(deviceHistory[0].privateKey, peer.publicKey, 'dm-bk-h2', histMsg)).toBe('old epoch via real blob');
  });

  it('v3: history JWKs WITHOUT key_ops also merge into device history', async () => {
    // Bare JWKs (no key_ops member) must keep working alongside the
    // exportPrivateKeyJwk-produced ones covered above.
    const bareHistoryJwk: JsonWebKey = { ...historyPrivJwk };
    delete bareHistoryJwk.key_ops;
    const blob = await encryptDmKeyBackup(alicePrivJwk, PASSWORD, [bareHistoryJwk]);
    const restored = await decryptDmKeyBackup(blob, PASSWORD);
    expect(restored).not.toBeNull();

    const deviceHistory = await loadDmKeyHistory();
    expect(deviceHistory.length).toBe(1);
    expect(await pubFingerprint(deviceHistory[0].publicKey)).toBe(await pubFingerprint(historyPair.publicKey));
    expect(deviceHistory[0].privateKey.extractable).toBe(false); // merged non-extractably
    const histMsg = await encryptTo(peer.privateKey, historyPair.publicKey, 'dm-bk-h', 'old epoch');
    expect(await decryptFrom(deviceHistory[0].privateKey, peer.publicKey, 'dm-bk-h', histMsg)).toBe('old epoch');
  });

  it('v1 (legacy 200k iterations, bare JWK payload): full restore roundtrip', async () => {
    const blob = await makeLegacyBackupBlob(alicePrivJwk, PASSWORD, 1);
    const jwks = (await decryptDmKeyBackupJwks(blob, PASSWORD))!;
    expect(jwks.priv.d).toBe(alicePrivJwk.d);
    expect(jwks.history).toEqual([]); // pre-v3 blobs carry no history

    const restored = (await decryptDmKeyBackup(blob, PASSWORD))!;
    expect(await decryptFrom(restored.privateKey, peer.publicKey, 'dm-bk-1', msgToAlice)).toBe('pre-backup message');
    expect(await loadDmKeyHistory()).toEqual([]); // nothing merged
  });

  it('v2 (600k iterations, bare JWK payload): decrypts with empty history', async () => {
    const blob = await makeLegacyBackupBlob(alicePrivJwk, PASSWORD, 2);
    const jwks = (await decryptDmKeyBackupJwks(blob, PASSWORD))!;
    expect(jwks.priv.d).toBe(alicePrivJwk.d);
    expect(jwks.history).toEqual([]);
  });

  it('wrong password → null from both APIs, and NO partial state lands in IndexedDB', async () => {
    expect(await decryptDmKeyBackupJwks(v3Blob, 'wrong-password')).toBeNull();
    expect(await decryptDmKeyBackup(v3Blob, 'wrong-password')).toBeNull();
    expect(await loadDmKeyHistory()).toEqual([]); // history NOT merged on failure
    expect(await loadDmKeyPair()).toBeNull(); // current key NOT touched
  });

  it('tampered ciphertext → null (AES-GCM auth rejects)', async () => {
    const parsed = JSON.parse(v3Blob);
    const raw = atob(parsed.ct);
    parsed.ct = btoa(String.fromCharCode(raw.charCodeAt(0) ^ 0xff) + raw.slice(1));
    expect(await decryptDmKeyBackup(JSON.stringify(parsed), PASSWORD)).toBeNull();
  });

  it('garbage and unknown-version blobs → null (no throw)', async () => {
    expect(await decryptDmKeyBackup('not even json', PASSWORD)).toBeNull();
    expect(await decryptDmKeyBackupJwks('{"v":4,"salt":"AA==","iv":"AA==","ct":"AA=="}', PASSWORD)).toBeNull();
    expect(await decryptDmKeyBackupJwks('{}', PASSWORD)).toBeNull();
  });

  it('backup history is capped at 10 entries (BACKUP_HISTORY_MAX)', async () => {
    // 12 distinct history JWKs in → only the first 10 survive in the blob
    const jwks: JsonWebKey[] = [];
    for (let i = 0; i < 12; i++) {
      const p = await generateDmKeyPair();
      jwks.push((await exportPrivateKeyJwk(p.privateKey))!);
    }
    const blob = await encryptDmKeyBackup(alicePrivJwk, PASSWORD, jwks);
    const out = (await decryptDmKeyBackupJwks(blob, PASSWORD))!;
    expect(out.history.length).toBe(10);
    expect(out.history.map((j) => j.d)).toEqual(jwks.slice(0, 10).map((j) => j.d));
  });
});

// ── 4. restore from a STALE backup (made before a rotation) ───────────────────

describe('stale backup restore (backup predates a key rotation)', () => {
  it('restore succeeds with the old key; post-rotation messages stay unreadable (locked-in behavior)', async () => {
    const PASSWORD = 'stale-pass';
    // Device 1: key A, backed up, then rotated to key B. (Rotation is modelled by
    // generating B directly; the backup-staleness semantics are the same.)
    const pairA = await generateDmKeyPair();
    const staleBlob = await encryptDmKeyBackup((await exportPrivateKeyJwk(pairA.privateKey))!, PASSWORD); // no history
    const pairB = await generateDmKeyPair();

    const peer = await generateDmKeyPair();
    const msgUnderA = await encryptTo(peer.privateKey, pairA.publicKey, 'dm-stale', 'epoch A');
    const msgUnderB = await encryptTo(peer.privateKey, pairB.publicKey, 'dm-stale', 'epoch B');

    // Device 2 (fresh): wipe everything, restore the STALE backup.
    (globalThis as Record<string, unknown>).indexedDB = new IDBFactory();
    localStorage.clear();
    sessionStorage.clear();

    const restored = (await decryptDmKeyBackup(staleBlob, PASSWORD))!;
    expect(restored).not.toBeNull(); // restore itself succeeds — no staleness rejection
    expect(await pubFingerprint(restored.publicKey)).toBe(await pubFingerprint(pairA.publicKey));

    // Epoch-A messages decrypt fine…
    expect(await decryptFrom(restored.privateKey, peer.publicKey, 'dm-stale', msgUnderA)).toBe('epoch A');

    // …but epoch-B (post-rotation) messages are NOT recoverable: the stale blob
    // carried no history, device history is empty, and the restored A key fails
    // AEAD against B-epoch ciphertext. Current behavior = decryptText REJECTS
    // (callers must catch); it does not return null or partial plaintext.
    expect(await loadDmKeyHistory()).toEqual([]);
    await expect(decryptFrom(restored.privateKey, peer.publicKey, 'dm-stale', msgUnderB)).rejects.toThrow();
  });
});

// ── 5. TOFU peer-key pinning ──────────────────────────────────────────────────

describe('TOFU (checkPeerKeyTofu / repinPeerKey / isPeerKeyKnown)', () => {
  const k = (i: number) => JSON.stringify({ kty: 'EC', crv: 'P-256', x: `x-${i}`, y: `y-${i}` });

  it('first sight pins; same key verifies; changed key flags WITHOUT replacing the pin', () => {
    expect(checkPeerKeyTofu('user-1', k(0))).toBe('first');
    expect(checkPeerKeyTofu('user-1', k(0))).toBe('same');
    expect(checkPeerKeyTofu('user-1', k(1))).toBe('changed');
    // the pin must NOT silently advance on 'changed' — original still verifies
    expect(checkPeerKeyTofu('user-1', k(0))).toBe('same');
    expect(localStorage.getItem('recline.tofu.peerkey.user-1')).toBe(k(0));
  });

  it('pins are per-user', () => {
    expect(checkPeerKeyTofu('user-a', k(0))).toBe('first');
    expect(checkPeerKeyTofu('user-b', k(1))).toBe('first');
    expect(checkPeerKeyTofu('user-a', k(0))).toBe('same');
    expect(checkPeerKeyTofu('user-b', k(0))).toBe('changed');
  });

  it('repinPeerKey archives the previous pin; both old and new count as known', () => {
    checkPeerKeyTofu('user-2', k(0));
    repinPeerKey('user-2', k(1));
    expect(checkPeerKeyTofu('user-2', k(1))).toBe('same'); // new pin active
    expect(isPeerKeyKnown('user-2', k(1))).toBe(true); // current pin
    expect(isPeerKeyKnown('user-2', k(0))).toBe(true); // archived accepted key
    expect(isPeerKeyKnown('user-2', k(99))).toBe(false); // never seen → unverified path
  });

  it('repinning the same key does not pollute the accepted list', () => {
    checkPeerKeyTofu('user-3', k(0));
    repinPeerKey('user-3', k(0));
    expect(localStorage.getItem('recline.tofu.peerkey.accepted.user-3')).toBeNull();
  });

  it('repin with no prior pin just sets the pin', () => {
    repinPeerKey('user-4', k(0));
    expect(checkPeerKeyTofu('user-4', k(0))).toBe('same');
    expect(localStorage.getItem('recline.tofu.peerkey.accepted.user-4')).toBeNull();
  });

  it('accepted list is capped at 10 (TOFU_ACCEPTED_MAX) — the 11th archived key evicts the oldest', () => {
    checkPeerKeyTofu('user-5', k(0)); // pin k0
    for (let i = 1; i <= 11; i++) repinPeerKey('user-5', k(i)); // archives k0..k10
    const list = JSON.parse(localStorage.getItem('recline.tofu.peerkey.accepted.user-5')!) as string[];
    expect(list.length).toBe(10);
    expect(list[0]).toBe(k(10)); // newest-first ordering
    expect(isPeerKeyKnown('user-5', k(0))).toBe(false); // oldest evicted
    expect(isPeerKeyKnown('user-5', k(1))).toBe(true); // survivor
    expect(isPeerKeyKnown('user-5', k(11))).toBe(true); // current pin
  });

  it('duplicate archive entries are not added twice', () => {
    checkPeerKeyTofu('user-6', k(0));
    repinPeerKey('user-6', k(1)); // archives k0
    repinPeerKey('user-6', k(0)); // back to k0, archives k1
    repinPeerKey('user-6', k(1)); // archives k0 again — already present, no dup
    const list = JSON.parse(localStorage.getItem('recline.tofu.peerkey.accepted.user-6')!) as string[];
    expect(list.filter((e) => e === k(0)).length).toBe(1);
  });
});

// ── key caches (memory + sessionStorage) ──────────────────────────────────────

describe('DM key cache (memory-only)', () => {
  it('cache / get / clear, including legacy sessionStorage cleanup', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    expect(getCachedDmKey('dm-c1')).toBeUndefined();
    cacheDmKey('dm-c1', key);
    expect(getCachedDmKey('dm-c1')).toBe(key);

    sessionStorage.setItem('recline.dm.aeskey.dm-c1', 'legacy-entry');
    clearDmKey('dm-c1');
    expect(getCachedDmKey('dm-c1')).toBeUndefined();
    expect(sessionStorage.getItem('recline.dm.aeskey.dm-c1')).toBeNull();
  });

  it('clearAllDmKeys wipes memory cache, legacy storage keys, and (async) IndexedDB key pairs', async () => {
    const pair = await makeNonExtractablePair();
    await saveDmKeyPair(pair);
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    cacheDmKey('dm-c2', key);
    sessionStorage.setItem('recline.dm.aeskey.dm-c2', 'legacy');
    localStorage.setItem('recline.dm.keypair', 'legacy-jwk');
    localStorage.setItem('recline.dm.keypair.history', 'legacy-history');

    clearAllDmKeys();

    // synchronous effects
    expect(getCachedDmKey('dm-c2')).toBeUndefined();
    expect(sessionStorage.getItem('recline.dm.aeskey.dm-c2')).toBeNull();
    expect(localStorage.getItem('recline.dm.keypair')).toBeNull();
    expect(localStorage.getItem('recline.dm.keypair.history')).toBeNull();

    // LOCKED-IN BEHAVIOR: the IndexedDB wipe is fire-and-forget (not awaited by
    // clearAllDmKeys), so we poll until it lands rather than asserting immediately.
    await vi.waitFor(async () => {
      expect(await loadDmKeyPair()).toBeNull();
    }, { timeout: 10_000 });
  });
});

describe('server key cache + passphrase session persistence', () => {
  it('cacheKey / getCachedKey / clearKey / clearAllKeys', async () => {
    const k1 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const k2 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    cacheKey('srv-a', k1);
    cacheKey('srv-b', k2);
    expect(getCachedKey('srv-a')).toBe(k1);

    sessionStorage.setItem('recline.passphrase.srv-a', '{"passphrase":"p","kdfSalt":null}');
    sessionStorage.setItem('recline.aeskey.srv-a', 'legacy'); // old scheme
    clearKey('srv-a');
    expect(getCachedKey('srv-a')).toBeUndefined();
    expect(sessionStorage.getItem('recline.passphrase.srv-a')).toBeNull();
    expect(sessionStorage.getItem('recline.aeskey.srv-a')).toBeNull();
    expect(getCachedKey('srv-b')).toBe(k2); // untouched

    sessionStorage.setItem('recline.passphrase.srv-b', '{"passphrase":"p","kdfSalt":null}');
    clearAllKeys();
    expect(getCachedKey('srv-b')).toBeUndefined();
    expect(sessionStorage.getItem('recline.passphrase.srv-b')).toBeNull();
  });

  it('cachePassphrase + importKeyFromSession re-derives a key equivalent to the original', async () => {
    const kdfSalt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const original = await deriveServerKey('open sesame', 'srv-sess', kdfSalt);
    const msg = await encryptText(original, 'reload survivor');

    cachePassphrase('srv-sess', 'open sesame', kdfSalt);
    const rederived = (await importKeyFromSession('srv-sess'))!;
    expect(rederived).not.toBeNull();
    expect(await decryptText(rederived, msg.ciphertext, msg.nonce)).toBe('reload survivor');
  });

  it('importKeyFromSession: null when nothing stored; corrupt entries are removed', async () => {
    expect(await importKeyFromSession('srv-none')).toBeNull();

    sessionStorage.setItem('recline.passphrase.srv-bad', 'not json at all');
    expect(await importKeyFromSession('srv-bad')).toBeNull();
    expect(sessionStorage.getItem('recline.passphrase.srv-bad')).toBeNull(); // cleaned up

    // LOCKED-IN BEHAVIOR: an empty passphrase returns null but the entry is KEPT
    sessionStorage.setItem('recline.passphrase.srv-empty', '{"passphrase":"","kdfSalt":null}');
    expect(await importKeyFromSession('srv-empty')).toBeNull();
    expect(sessionStorage.getItem('recline.passphrase.srv-empty')).not.toBeNull();
  });
});
