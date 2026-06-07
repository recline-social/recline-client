# Recline — Open Source Client

**Encrypted community chat.** No email required, no tracking, E2E encrypted direct messages. Build it yourself, connect to any Recline server, or run the whole stack privately.

> **Live instance:** [app.recline.social](https://app.recline.social)
> **Server repo:** [recline-social/recline](https://github.com/recline-social/recline) *(private — self-host guide in that repo)*
> **Homepage:** [recline.social](https://recline.social)

---

## What this is

Recline is a Discord-style community platform built from scratch with a different security model:

- **Direct messages** use ECDH P-256 key exchange + HKDF-SHA256 key derivation + AES-GCM-256 encryption, end-to-end on the client. The server stores ciphertext and never sees plaintext.
- **Channel messages** use PBKDF2-derived keys from a channel passphrase, AES-GCM-256 encrypted before sending. Same deal — server holds ciphertext only.
- **No JWT.** Auth tokens are 256-bit random hex stored server-side in a sessions table. Nothing decodable client-side.
- **No email required** for signup.
- **No third-party analytics** baked into this codebase. The hosted instance uses Datadog RUM optionally; self-hosters get none of that.
- **ECDH private keys** live in `localStorage` and are cleared on logout via `clearAllDmKeys()`. Acceptable tradeoff for alpha — planned hardware-key backing in a later release.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 |
| Realtime | Socket.IO client |
| Desktop | Tauri 2 (Rust) |
| Mobile | Capacitor 8 (Android/iOS) |
| Crypto | Web Crypto API (native browser — no third-party crypto libs) |
| Voice/Video | WebRTC via RTCPeerConnection |

---

## Building from source

### Requirements

- Node.js 20+
- npm 10+

### Web client

```bash
git clone https://github.com/recline-social/recline-client.git
cd recline-client
npm install
```

Point it at a Recline server by setting `VITE_API_URL` in a `.env.local` file:

```
VITE_API_URL=https://your-server.example.com
```

Then:

```bash
npm run dev       # hot-reload dev server
npm run build     # production build → dist/
npm run preview   # preview production build locally
```

### Desktop (Tauri)

Requires Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
npm run tauri:dev          # dev mode with hot reload
npm run tauri:build        # signed production binary
```

For a remote server instead of the bundled backend:

```bash
npm run tauri:dev:remote
```

### Android APK (Capacitor)

Requires Android SDK, Java 17+, and a connected device or emulator.

```bash
npm run build:android         # Vite build + cap sync
cd android
./gradlew assembleDebug       # debug APK → android/app/build/outputs/apk/debug/
```

For a signed release APK set up a keystore and run `assembleRelease`.

---

## Connecting to your own server

The client talks to whatever URL you configure. You can:

1. **Use the hosted instance** at `app.recline.social` — no setup needed.
2. **Self-host the server** and point this client at it via `VITE_API_URL`.
3. **Tauri desktop**: the remote config (`tauri.remote.conf.json`) lets the desktop app connect to a remote server without serving a local backend.

The server source is in the private monorepo. The self-hosting guide covers Docker Compose deployment, PostgreSQL setup, TURN server configuration, and environment variables.

---

## File integrity — verifying you have the genuine client

This section exists because Recline handles encrypted credentials and cryptographic keys. A modified client could silently exfiltrate your private key or login token before encryption.

**Always build from this source repo.** If you download a pre-built client from anywhere other than official Recline releases, verify its hashes before using it.

### How to verify

After cloning, run the following to compute MD5 hashes of your local source files and compare them against the table below:

**Linux / macOS:**
```bash
find src index.html package.json vite.config.ts tsconfig.json \
     tailwind.config.js postcss.config.js capacitor.config.ts public/sw.js \
  -type f | sort | xargs md5sum
```

**Windows (PowerShell):**
```powershell
$base = "."
$files = @("index.html","package.json","vite.config.ts","tsconfig.json",
           "tailwind.config.js","postcss.config.js","capacitor.config.ts",
           "public/sw.js") +
         (Get-ChildItem "src" -Recurse -Include "*.ts","*.tsx","*.css" |
          ForEach-Object { $_.FullName.Replace((Resolve-Path .).Path+"\","").Replace("\","/") })
$files | Sort-Object | ForEach-Object {
  $hash = (Get-FileHash $_ -Algorithm MD5).Hash.ToLower()
  "$hash  $_"
}
```

If **any hash differs**, stop. Do not enter credentials. The file has been modified from the official source.

---

### Official source file hashes

These hashes reflect the current `main` branch. They are updated with every commit that modifies source files.

**Last updated:** 2026-06-07 — commit `main`

| MD5 | File |
|-----|------|
| `9e70006ccced243e7b9b09c0249c8ec1` | `capacitor.config.ts` |
| `4daf97a683858cde29f0c36d470b2a76` | `index.html` |
| `1360da020973f4001ec76ce8700c8141` | `package.json` |
| `c735540bb63936a123bc867d950c9f69` | `postcss.config.js` |
| `96360220da5c01d39575a9f5d0351bcf` | `public/sw.js` |
| `18eb1da93dfec025fcaaaf2aa84eb64c` | `src/App.tsx` |
| `037d42344df9ae02df712469db35625f` | `src/components/Auth.tsx` |
| `13beae7eb32c652596a57d4099aea9d7` | `src/components/Avatar.tsx` |
| `2273e972beffa9c680e9c9c5ad3aa51a` | `src/components/BroadcastButton.tsx` |
| `142afdbc8973dd9975cdfa4009884d9d` | `src/components/BroadcastOverlay.tsx` |
| `7aa671d56ce39d9812a2950593ac8d20` | `src/components/CallView.tsx` |
| `a609f7ebaa894a90dc58084e300fba41` | `src/components/ChannelList.tsx` |
| `91cd23ec475e53aab2fcc8ef6ffff2d0` | `src/components/ChatPanel.tsx` |
| `41d92c5a15784bdbd73840b0c8741cbe` | `src/components/Composer.tsx` |
| `e3a0aae5ad145acf6171229f5af6b15b` | `src/components/DmCallIncoming.tsx` |
| `debc984152061537cab3a3caeae0098c` | `src/components/DmCallWindow.tsx` |
| `c419c9463cf71f70e1c8dc0cc3b7216d` | `src/components/DmList.tsx` |
| `d58531e352f06d2c5d1ce6e6b1b82e4c` | `src/components/DmView.tsx` |
| `5b20556c1d7c3101ebb6f867c13bf974` | `src/components/EmojiPicker.tsx` |
| `63758cdb502c735b0d60f7b4924014f6` | `src/components/EmptyHome.tsx` |
| `f65e5ddb3c6663ff88fa6daebe8a5a23` | `src/components/FeedbackButton.tsx` |
| `c496c98fc8c53d7b6baa46be8aac793f` | `src/components/InviteJoinModal.tsx` |
| `0816677b59c7a36c86a66ba4d7955579` | `src/components/MarkdownContent.tsx` |
| `23e7f6056c797b750f60c195c319f61b` | `src/components/MemberList.tsx` |
| `43eccad136a724ee81581440ab572c57` | `src/components/MessageRow.tsx` |
| `c2393e109ec62aac4ede9ddb99de1517` | `src/components/Modal.tsx` |
| `17a023589ac74aa8c78874c02f3f1c05` | `src/components/ProfileDialog.tsx` |
| `2e4743cf190c518d1e8897e86b024df1` | `src/components/ReportDialog.tsx` |
| `e3f250f790af9ea032a50d3a225a82f9` | `src/components/ScreenShareDialog.tsx` |
| `81bdf7220b6415f3066ccd7a79254a40` | `src/components/ServerDialogs.tsx` |
| `1510f0acb7bb9c1035f85fb47d77a985` | `src/components/ServerHome.tsx` |
| `12ec060c43150f6a01e649b475d44dda` | `src/components/ServerRail.tsx` |
| `2a9f12fac26949e96f6d4b62f722dfc5` | `src/components/ServerSettingsDialog.tsx` |
| `e27a2f8a316ec81e7a8ced50d554b343` | `src/components/StatusDot.tsx` |
| `4868c7695393b098a00f3806caaba3f0` | `src/components/TypingIndicator.tsx` |
| `08e1081db4edf84dab09d6552a18f56e` | `src/components/UserProfileCard.tsx` |
| `1a7f08abdedba2aafa0b6a348668496d` | `src/components/VoiceBar.tsx` |
| `d6c2d355c9e5daef4805a728e504e1f5` | `src/components/Welcome.tsx` |
| `dfdcec1de14639c7de2db0888d72d327` | `src/lib/api.ts` |
| `d26079b60d6e92b7fd3f346407ee6653` | `src/lib/callSounds.ts` |
| `8541e619161b9d10e3ee5c77a58d552c` | `src/lib/colors.ts` |
| `24382fa3d9c329d3e6b9f573d7757c26` | `src/lib/crypto.ts` |
| `6e1fb7500cfbb48c1295e8b95410eb99` | `src/lib/messageAnimations.ts` |
| `6dc92db4d26993cc352e16363aedf30c` | `src/lib/notifications.ts` |
| `3f0defb643313705136908e665b365c9` | `src/lib/permissions.ts` |
| `f512c53bf7e2819951a7fa23d61feb79` | `src/lib/serverUrl.ts` |
| `d9b3b5760140bd2bffae25c2b8eaa8e7` | `src/lib/socket.ts` |
| `d09cae7479b7d8451f81eb0ae08179c8` | `src/lib/webrtc.ts` |
| `376d8c3eefd90716e83c9040380055bb` | `src/main.tsx` |
| `ac015e90b7132b17a7b0cec3534f3564` | `src/styles/index.css` |
| `0d69ed26d88d041a31eef24c087ebc10` | `src/types.ts` |
| `0352474ba2918efe13895edbc3780d94` | `src/vite-env.d.ts` |
| `4533d5801213cb63fbcceb96cc4a44e9` | `tailwind.config.js` |
| `3010c4bd00b07f30170450a38c15b47f` | `tsconfig.json` |
| `5d6c8100646132858c1b7781418c8e10` | `vite.config.ts` |

> **Note on forks:** If you're running a community fork of Recline, the maintainer of that fork should publish their own hash table for the files they distribute. Comparing against this table will always show differences for a modified fork — that's expected. The question is whether those differences are documented and intentional.

---

## Why MD5 and not SHA-256?

MD5 is intentionally used here for **quick tamper detection**, not cryptographic collision resistance. The threat model is: someone takes this source, adds a keylogger or credential-exfil function, and distributes it to Recline users. MD5 is fast to compute and fast to compare. A file-level diff is just as effective for this use case.

If you want stronger guarantees, compare the Git commit SHA on the file you're viewing against what GitHub shows for `main`. Every commit is signed by the author key.

---

## Security architecture (detailed)

### Direct message encryption

```
Alice's keypair:  ECDH P-256 — private key in localStorage, public key on server
Bob's keypair:    same

Key derivation:
  sharedSecret = ECDH(Alice.private, Bob.public)   ← same result both directions
  key = HKDF(sharedSecret, salt="recline-dm-v1", SHA-256, 32 bytes) → AES-GCM-256 key

Each message:
  nonce = crypto.getRandomValues(12 bytes)
  ciphertext = AES-GCM-256.encrypt(key, nonce, plaintext)
  server stores: { ciphertext, nonce } — no key material ever reaches server
```

### Channel encryption

```
Channel passphrase (user-set, never stored server-side):
  key = PBKDF2(passphrase, salt, 200_000 iterations, SHA-256, 32 bytes) → AES-GCM-256 key

Each message: same AES-GCM-256 pattern as above
Key stored in sessionStorage, cleared on logout
```

### Key rotation

Users can rotate their ECDH keypair via the profile dialog. Rotation generates a new P-256 keypair, re-registers the public key with the server, and clears the old private key from `localStorage`. Existing DM history encrypted to the old key becomes permanently unreadable — there's no re-encryption pass.

### What the server sees

| Data | Server access |
|------|--------------|
| DM message content | ❌ Ciphertext only |
| Channel message content | ❌ Ciphertext only |
| Message timestamps | ✅ Plaintext |
| Who messaged who | ✅ User IDs in DM channel table |
| Server membership | ✅ Stored in memberships table |
| ECDH public keys | ✅ Required for DM key exchange |
| IP addresses | ✅ In connection logs |
| Auth token | ✅ Hashed equivalent in sessions table |

---

## Project structure

```
src/
  App.tsx                  — root component, socket lifecycle, auth state
  main.tsx                 — React entry point
  types.ts                 — shared TypeScript types
  components/
    Auth.tsx               — login / register / TOTP forms
    ChatPanel.tsx          — channel message view
    DmView.tsx             — direct message view
    CallView.tsx           — voice/video call UI (WebRTC)
    ProfileDialog.tsx      — user profile, key rotation, GDPR export
    ServerDialogs.tsx      — server create / settings
    ServerSettingsDialog.tsx — moderation, roles, invites
    ...
  lib/
    crypto.ts              — WebCrypto wrappers (ECDH, HKDF, AES-GCM, PBKDF2)
    api.ts                 — typed REST client (all server requests)
    socket.ts              — Socket.IO connection lifecycle
    webrtc.ts              — RTCPeerConnection management, ICE, TURN
    notifications.ts       — Web Push subscription
    serverUrl.ts           — runtime server URL resolution (web vs Tauri vs Capacitor)
  styles/
    index.css              — Tailwind base + custom design tokens
src-tauri/                 — Tauri desktop shell (Rust)
public/
  sw.js                    — service worker (Web Push, offline shell)
```

---

## Contributing

Pull requests welcome. A few things to know:

- **No secrets in client code.** `VITE_*` env vars are baked into the build bundle — treat them as public. `VITE_TURNSTILE_SITE_KEY` is the only one in use and is intentionally public.
- **Crypto changes need a second pair of eyes.** Anything touching `src/lib/crypto.ts` — post an issue before opening a PR. Subtle bugs in key derivation or nonce reuse are silent and catastrophic.
- **TypeScript strict mode is on.** `tsc --noEmit` must pass before the build runs.
- **No runtime dependencies that touch crypto.** The goal is to use Web Crypto API natively everywhere. Don't add a `crypto-js` or `forge` dependency without a very good reason and a discussion first.

---

## License

MIT — see [LICENSE](./LICENSE) if present, otherwise treat as MIT pending formal addition.

---

*Recline is in public alpha. Encryption is real but the key management model is still maturing. Don't use it for anything where your life depends on it.*
