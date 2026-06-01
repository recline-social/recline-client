# Recline — Client

This is the public client source for [Recline](https://recline.social), a private encrypted community chat app.

**The client code is published here for transparency.** You can audit exactly how your messages are encrypted before they leave your device. Recline runs the servers — you verify the math.

## What this is

Recline is an encrypted group chat with WebRTC voice and video. Messages are encrypted in your browser before they're sent. The server stores ciphertext it can never read.

- **Channel messages** — AES-GCM-256, key derived from your passphrase via PBKDF2
- **Direct messages** — ECDH P-256 key exchange + HKDF-SHA256 → AES-GCM-256
- **Voice/video** — WebRTC peer-to-peer, DTLS-SRTP. Recline is never in the media path
- **No email required** — signup is a username and password, nothing else

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS v3
- Socket.IO client
- Web Crypto API (all encryption runs in the browser)
- WebRTC mesh

## Auditing the encryption

The encryption implementation lives in [`src/lib/crypto.ts`](src/lib/crypto.ts). Key functions:

| Function | What it does |
|---|---|
| `deriveServerKey` | PBKDF2-SHA256 → AES-GCM-256 key from channel passphrase |
| `encryptText` / `decryptText` | AES-GCM-256 encrypt/decrypt with random IV |
| `generateDmKeyPair` | ECDH P-256 key pair generation |
| `deriveDmKey` | ECDH shared secret → HKDF-SHA256 → AES-GCM-256 |
| `rotateDmKeyPair` | Rotate DM key pair, archive old keys for history |

## Use the app

**[app.recline.social](https://app.recline.social)**

## License

See [LICENSE](LICENSE).
