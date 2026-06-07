# Recline — Open Source Client

**Encrypted community chat.** No email required, no tracking, E2E encrypted direct messages. This is the open-source client — build it yourself and verify every line before connecting.

> **Live instance:** [app.recline.social](https://app.recline.social)
> **Homepage:** [recline.social](https://recline.social)

---

## What this is

Recline is a Discord-style community platform built from scratch with a different security model:

- **Direct messages** use ECDH P-256 key exchange + HKDF-SHA256 key derivation + AES-GCM-256 encryption, end-to-end on the client. The server stores ciphertext and never sees plaintext.
- **Channel messages** use PBKDF2-derived keys from a channel passphrase, AES-GCM-256 encrypted before sending. Same deal — server holds ciphertext only.
- **No JWT.** Auth tokens are 256-bit random hex stored server-side in a sessions table. Nothing decodable client-side.
- **No email required** for signup.
- **No third-party analytics** baked into this codebase. The hosted instance uses Datadog RUM optionally; it is not present in this source.
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
npm run tauri:dev:remote   # connects to app.recline.social instead of a local backend
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

## Connecting to Recline

This client connects to **[app.recline.social](https://app.recline.social)**. The server is closed source and not publicly available. Set `VITE_API_URL` in `.env.local` if you need to point a development build at a staging environment.

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
| `5180ea14938166a9cb27bde85a3719cd` | `capacitor.config.ts` |
| `777f245cc403f2a588eb0690a69750d3` | `index.html` |
| `638bbeca1b96d1894257ef58e29539ca` | `package.json` |
| `33fad9c02cb0ec6d6030369ef6347d57` | `postcss.config.js` |
| `9ae53ca8df28fdd7f23e94a8d9a7137d` | `public/sw.js` |
| `cc6dd6a47d605afe26d03a56040cd9ec` | `src/App.tsx` |
| `e46498198b38ae64f5c4ddb6c184e344` | `src/components/Auth.tsx` |
| `df60e243ebc9afbe7a065a4f88d12e6d` | `src/components/Avatar.tsx` |
| `42fbb5dca994c5087bf9bbfcb66f28d6` | `src/components/BroadcastButton.tsx` |
| `60d06b361b8590e02813aee8616044a6` | `src/components/BroadcastOverlay.tsx` |
| `9bf50c9c39d853bfbdb211db084369ab` | `src/components/CallView.tsx` |
| `d98fc89434164730503653ec929526ce` | `src/components/ChannelList.tsx` |
| `ca7ae3407c16f0f31378c4cd27f9f16b` | `src/components/ChatPanel.tsx` |
| `76a1aeda4510658159fc565fead37aec` | `src/components/Composer.tsx` |
| `52ddae48315ab062267bca852fa15248` | `src/components/DmCallIncoming.tsx` |
| `1260d3e8b894559df80348ed5000f078` | `src/components/DmCallWindow.tsx` |
| `639503cb6929144d0143bdbe8a799bb6` | `src/components/DmList.tsx` |
| `fd9bcc57d7b919a5c7565b4a6b501b66` | `src/components/DmView.tsx` |
| `98db0d042b93396368e1e3e7fab128cb` | `src/components/EmojiPicker.tsx` |
| `137e1a38ba9e387ba1425538000d3dc1` | `src/components/EmptyHome.tsx` |
| `3ec26cf18e38f5b8dd73388e2b5b8ff8` | `src/components/FeedbackButton.tsx` |
| `71d540493bb4d7fdd5706f3af06b4c1d` | `src/components/InviteJoinModal.tsx` |
| `129039c02661e419ebe5886f26c434ac` | `src/components/MarkdownContent.tsx` |
| `208c9dd479dbb3665e3381cdf4787acd` | `src/components/MemberList.tsx` |
| `3df9606b48fce5871865770abd1a93ce` | `src/components/MessageRow.tsx` |
| `96e5f6074abe18ed966df1952a1fdbf4` | `src/components/Modal.tsx` |
| `5dee843590effd8ea37a7b60f378db29` | `src/components/ProfileDialog.tsx` |
| `082f70d94a0d800a08f07d9ccb4f4855` | `src/components/ReportDialog.tsx` |
| `c09a1e734e8905b76ecc1bae2b1969eb` | `src/components/ScreenShareDialog.tsx` |
| `449d7ff5be1562b5515176c078ccf01a` | `src/components/ServerDialogs.tsx` |
| `bd0c6bf0df521b16e000561e4e802fa2` | `src/components/ServerHome.tsx` |
| `0b7a2b22726a395650a36d86ed721fc0` | `src/components/ServerRail.tsx` |
| `95a8d41e925654e9533ff5814f37eb15` | `src/components/ServerSettingsDialog.tsx` |
| `6acf7cc91dd233dcd7b3f5443abbb660` | `src/components/StatusDot.tsx` |
| `39418f191a79954d4e8d7cef6afa0976` | `src/components/TypingIndicator.tsx` |
| `d657183ba38d8b5cda1598df582d1be3` | `src/components/UserProfileCard.tsx` |
| `da5214fc9959c6b53832b96745f44b89` | `src/components/VoiceBar.tsx` |
| `fd00550fa2717b6132e47e5d115d5981` | `src/components/Welcome.tsx` |
| `b95010eef5b86ae456a8925763c3f9c2` | `src/lib/api.ts` |
| `c247aa4608ca836efdf21c4bdcf4d616` | `src/lib/callSounds.ts` |
| `4d0d26da228c55c1bed5fc3bf594e996` | `src/lib/colors.ts` |
| `2d2f20e6dde146634ecf55d4caef3040` | `src/lib/crypto.ts` |
| `715de05bc50a74dc55ccbcf5edee9619` | `src/lib/messageAnimations.ts` |
| `7e9f34050b023bcace8c6e2fdece1bd4` | `src/lib/notifications.ts` |
| `b6d093f351bfd454934e568af85aa7ff` | `src/lib/permissions.ts` |
| `d2dcb518a2f566cd7819a8a2dd71fbac` | `src/lib/serverUrl.ts` |
| `209878105b33c255fe1a2cb5341a1009` | `src/lib/socket.ts` |
| `481c7b64e29712dc694fc7eb98875ff9` | `src/lib/webrtc.ts` |
| `171ad37a63424ae2a913bd5e3f84287e` | `src/main.tsx` |
| `056b93f1b27ea3d6cf714230f64638f4` | `src/styles/index.css` |
| `6be37fe080ecfd8387a9a76cd0f94d58` | `src/types.ts` |
| `8f68c27c3fc38817b2726b20e2d4f1ee` | `src/vite-env.d.ts` |
| `ffa035343180a9cffbcaf0c40df0404e` | `tailwind.config.js` |
| `3c78b691084af794cd28d93176e12aaf` | `tsconfig.json` |
| `6c4aaa9b1436aa907b46ab9479938d8d` | `vite.config.ts` |

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
  key = PBKDF2(passphrase, salt, 300_000 iterations, SHA-256, 32 bytes) → AES-GCM-256 key

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
