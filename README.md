# Recline Client

Recline Client is the frontend application for the Recline chat experience.

It delivers private messaging, community chat, and real-time calling across:
- **Web** (React + Vite)
- **Desktop** (Tauri)
- **Android** (Capacitor)

---

## Overview

Recline Client is designed to feel fast, clean, and familiar while supporting advanced communication features:

- Real-time channels and direct messages
- End-to-end encrypted messaging flows in-app
- Voice/video calls with screen sharing
- Reactions, mentions, pins, and unread tracking
- Shared UI across browser, desktop, and mobile builds

---

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Socket.IO Client
- Tauri v2
- Capacitor
- Vitest

---

## Quick Start

From `client/`:

```bash
npm install
npm run dev
```

Default development URL: `http://localhost:5173`

Run client and local server together:

```bash
npm run dev:withserver
```

---

## Build and Test

```bash
npm run build
npm run test
```

Additional useful commands:

```bash
npm run preview
npm run dev:vite-only
```

---

## Desktop (Tauri)

Run desktop in development:

```bash
npm run tauri:dev
```

Build desktop release artifacts:

```bash
npm run tauri:build
```

Generate icons:

```bash
npm run tauri:icon -- /path/to/source.png
```

---

## Android (Capacitor)

Build and sync Android project:

```bash
npm run build:android
```

Open Android Studio:

```bash
npm run cap:open:android
```

Sync only:

```bash
npm run cap:sync
```

---

## Environment

In development, the client reads environment values from the repository root (`../.env`).

Common variables:

- `VITE_API_PROXY` - local API/socket proxy target
- `VITE_TURNSTILE_SITE_KEY` - client-side Turnstile site key

`VITE_*` variables are embedded at build time, so rebuild after updates.

---

## Project Structure

```text
client/
  src/
    components/      UI components
    hooks/           app hooks
    lib/             API, crypto, WebRTC, notifications, utilities
  src-tauri/         desktop configuration
  android/           Android project
```

---

## Reviewer Guide

For readers and reviewers, these files are good starting points:

- `src/App.tsx`
- `src/lib/crypto.ts`
- `src/hooks/useDmKeys.ts`
- `src/lib/webrtc.ts`
- `src/components/MarkdownContent.tsx`

---

## License

See repository licensing files for current terms.