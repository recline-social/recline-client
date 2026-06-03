# Recline — Encrypted Discord Alternative

**Open-source client for [Recline](https://recline.social) — community chat with end-to-end encryption, no email, and no government ID.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Encryption: AES-GCM-256](https://img.shields.io/badge/Encryption-AES--GCM--256-22c55e.svg)](#security-model)
[![DMs: ECDH P-256](https://img.shields.io/badge/DMs-ECDH_P--256-22c55e.svg)](#security-model)
[![Built with React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[**Open the app →**](https://app.recline.social) · [**recline.social**](https://recline.social) · [**Discord alternative page**](https://recline.social/discord-alternative)

---

## What this is

Recline is a community chat platform built around a single architectural guarantee: **the server cannot read your messages.** Not a policy claim — a technical constraint. Messages are encrypted in your browser before transmission. The server stores and relays ciphertext it has no key to decrypt.

This repository contains the **client** — the React/Vite application that handles all encryption locally, plus the Tauri desktop wrapper. It is published here for **transparency and security auditing.** Server infrastructure is run by Recline and is not included.

---

## Security model

|  | Recline | Discord |
|---|---|---|
| Message encryption | **AES-GCM-256** (client-side before sending) | None — server stores plaintext |
| DM encryption | **ECDH P-256 + HKDF-SHA256** | None |
| Server can read messages | **No** — only ciphertext stored | Yes |
| Email required | **Never** | Required |
| Phone number required | **Never** | Often required |
| Government ID | **Never** | Required for some features (2026) |
| Client source code | **Public (AGPL-3.0)** | Proprietary |

### Channel encryption

Every channel message goes through this pipeline **before leaving your browser:**

1. Channel passphrase → **PBKDF2-SHA256** → 256-bit AES key
2. `crypto.getRandomValues()` → fresh 96-bit IV per message
3. **AES-GCM-256** encrypt (includes authentication tag)
4. `{ ciphertext, iv }` transmitted → server stores these bytes

Without the channel passphrase, the stored data is unreadable — including to Recline.

### Direct message encryption

1. Each user has an **ECDH P-256** keypair generated locally at registration
2. Public keys are exchanged via the server (which acts as a directory, not a key holder)
3. Alice's private key + Bob's public key → shared secret via **ECDH**
4. Shared secret → **HKDF-SHA256** → AES-256 key
5. Messages encrypted with **AES-GCM-256**, fresh IV per message

The server is a blind relay for DM content. Private keys never leave the browser and are cleared on logout.

### Other primitives

| What | How |
|---|---|
| Password hashing | Argon2id (64 MiB, t=3, p=4) |
| 2FA | TOTP RFC 6238 |
| Session tokens | 256-bit random hex |
| Voice/video encryption | WebRTC DTLS-SRTP (P2P) |

**All cryptographic operations use the browser's built-in [SubtleCrypto API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto).** The implementation is in [`src/lib/crypto.ts`](src/lib/crypto.ts) — every function that touches key derivation, encryption, or decryption is there.

---

## Features

- **Encrypted channels** — AES-GCM-256, server never holds decryption keys
- **Encrypted DMs** — ECDH P-256 key exchange, private key stays local
- **Voice & video calls** — WebRTC P2P mesh, DTLS-SRTP media encryption
- **Screen sharing** — up to 1440p, works in-browser
- **Server roles** — granular permission bitmask with channel-level overrides
- **Vanity invite links** — custom slugs, expiry, max-uses, history access control
- **File attachments** — magic-byte validated, per-user storage quota
- **Spark economy** — daily login rewards, creator tipping, animated messages, server broadcasts
- **2FA** — TOTP (RFC 6238) + backup codes, no email recovery
- **Desktop app** — Tauri v2 (Windows, macOS, Linux)
- **Android** — Capacitor scaffold (APK requires Android Studio)
- **No email** — username + password is the entire signup form
- **No government ID** — ever, under any circumstance

---

## Repository structure

```
src/
├── lib/
│   ├── crypto.ts          ← AES-GCM-256, ECDH P-256, PBKDF2, HKDF — start here
│   ├── webrtc.ts          ← WebRTC mesh CallManager, ICE restart, screen share
│   ├── api.ts             ← typed HTTP API wrapper
│   ├── permissions.ts     ← bitmask permission constants
│   ├── colors.ts          ← deterministic username colors (FNV-1a)
│   └── callSounds.ts      ← call event audio
├── components/            ← React UI (App, CallView, ChatPanel, MessageRow, etc.)
└── main.tsx               ← entry point, optional Datadog RUM init
src-tauri/                 ← Tauri v2 Rust desktop wrapper
capacitor.config.ts        ← Capacitor Android config
```

---

## Stack

| Layer | Tech |
|---|---|
| UI | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 |
| Realtime | Socket.IO client |
| Calls | WebRTC (native browser API) |
| Crypto | Web Crypto API (SubtleCrypto) |
| Desktop | Tauri v2 |
| Mobile | Capacitor v8 |

---

## Auditing the encryption

The goal of this public repository is to make the encryption auditable without trusting anyone's claims about it.

Start in [`src/lib/crypto.ts`](src/lib/crypto.ts). The key functions:

```typescript
deriveKey(passphrase, salt)          // PBKDF2-SHA256 → AES-256 key
encryptMessage(key, plaintext)       // AES-GCM-256, random IV
decryptMessage(key, ciphertext, iv)  // AES-GCM-256 decrypt + verify tag
generateDmKeyPair()                  // ECDH P-256 keypair
deriveDmSharedKey(myPrivKey, theirPubKey)  // ECDH + HKDF-SHA256
```

All calls go through the browser's native `crypto.subtle` — Recline's code coordinates the operations, the cryptographic work is done by your browser's implementation.

---

## Security disclosure

Report vulnerabilities privately to **security@recline.social** — not via public GitHub issues. Please include reproduction steps and impact assessment. We aim to respond within 48 hours.

---

## License

[AGPL-3.0-only](LICENSE) — the copyleft license that requires any modified version served to users to also be open source.
