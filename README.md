# Recline Client

**Open Beta**

This repository contains the publicly reviewable Recline client used for the web, Tauri desktop, and Capacitor mobile experiences. It is published so users and researchers can inspect the client-side encryption, networking, WebRTC, storage, notification, and user-interface code used by official Recline builds.

The service backend and operational infrastructure are not included in this repository.

## Security boundaries

Current channel and direct-message text is encrypted by the client. The current direct-message design uses P-256 ECDH, HKDF-SHA256, and AES-GCM. Channel text uses a PBKDF2-derived AES-GCM key.

Important limitations:

- The current direct-message protocol does not provide Double Ratchet forward secrecy or post-compromise security.
- Attachments and attachment metadata are not end-to-end encrypted.
- The service can observe routing, membership, timestamps, reactions, read state, moderation records, payment records, and other operational metadata.
- Browser state remains exposed to same-origin script compromise and local-device compromise.

## Verify and build

Requirements:

- Node.js 20
- npm

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Run the browser client in development:

```bash
npm run dev
```

The Vite development server reads client-safe variables from `.env.local` in this repository. For example:

```dotenv
VITE_API_PROXY=https://app.recline.social
VITE_TURNSTILE_SITE_KEY=your_public_site_key
```

All `VITE_*` values are embedded in the browser bundle and must be treated as public configuration, never as server secrets.

## Desktop

```bash
npm run tauri:dev
npm run tauri:build
```

Official desktop builds connect to the canonical Recline service endpoint configured in the client source.

## Android

```bash
npm run build:android
npm run cap:open:android
```

## Source provenance

`SOURCE_VERSION` identifies the release branch and source revision used to generate the current public mirror. The public repository is updated automatically from the reviewed client directory in the private release source.

## License

AGPL-3.0-only. See `LICENSE`.
