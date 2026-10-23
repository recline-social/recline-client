![Image](./public/android-chrome-512x512.png)

# Recline Client

**Open-source communication client for Recline — currently in Open Beta.**

[![Website](https://img.shields.io/badge/Website-recline.social-5865F2)](https://recline.social)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)
![Status](https://img.shields.io/badge/Status-Open%20Beta-orange)
![React](https://img.shields.io/badge/React-TypeScript-3178C6)
![Tauri](https://img.shields.io/badge/Desktop-Tauri%202-FFC131)

**Recline** is an independently developed communication platform bringing communities, real-time messaging, encrypted conversations, voice and video calls, and file sharing together in one place.

This repository contains Recline's publicly reviewable client code, including the web interface, Tauri desktop application and Capacitor mobile integration.

**[Official Website](https://recline.social) · [Launch Recline](https://app.recline.social) · [Roadmap](https://recline.social/roadmap/) · [SourceForge](https://sourceforge.net/software/product/Recline/)**

---

## Features

### Communities and messaging

- Community Spaces with channels, roles and invitations.
- Real-time text messaging and presence.
- Encrypted direct-message text.
- Client-side encrypted Space message text.
- Reactions, mentions and pinned messages.
- File and media attachments.
- User profiles and community moderation tools.

### Voice and video

- WebRTC-based voice and video communication.
- Voice channels and direct calls.
- Screen sharing where supported.
- STUN/TURN connectivity for different network conditions.
- Audio processing and device controls.

### Privacy and account security

- Username-based accounts without mandatory email registration.
- Two-factor authentication.
- Client-side message-text encryption.
- Cryptographic key handling and recovery mechanisms.
- Publicly inspectable client implementation.

Recline is still in active development. Features and availability can vary by platform and release.

## Technology stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript |
| Build tooling | Vite |
| Styling | Tailwind CSS |
| Real-time communication | Socket.IO |
| Voice and video | WebRTC |
| Desktop application | Tauri 2, Rust |
| Mobile integration | Capacitor |
| Cryptography | Web Crypto API, AES-GCM, ECDH, HKDF, PBKDF2 |
| Testing | Vitest, TypeScript |

## Security and encryption

Recline implements client-side encryption for supported message text.

**Direct messages:** The current protocol uses P-256 ECDH key agreement, HKDF-SHA256 key derivation and AES-GCM authenticated encryption.

**Space messages:** Supported text is encrypted using AES-GCM with a key derived from a Space passphrase.

### Important security limitations

Transparency is an important part of this project.

- The current DM protocol does not provide Double Ratchet forward secrecy or post-compromise security.
- The current Space access protocol sends the passphrase to the backend during verification.
- Attachments and attachment metadata are not currently end-to-end encrypted.
- The service can observe operational metadata, including routing, membership, timestamps and moderation information.
- Browser or device compromise can undermine client-side security.
- The project has not completed an independent security audit.

Open-source code enables inspection and independent review; it does not guarantee that an implementation is vulnerability-free.

For additional architectural details, read [Inside Recline's Open-Source Chat Client](https://recline.social/blog/inside-reclines-open-source-chat-client/).

## Getting started

### Requirements

- A supported Node.js release
- npm
- Git

Use a currently supported and security-patched Node.js runtime. The official production build has used Node.js 22.23.4 as its October 2026 security baseline.

### Clone the repository

```bash
git clone https://github.com/recline-social/recline-client.git
cd recline-client
```

### Install dependencies

```bash
npm ci
```

### Run the development client

```bash
npm run dev
```

### Build for production

```bash
npm run typecheck
npm test
npm run build
```

The production frontend output is generated in `dist/`.

## Environment configuration

The Vite development server supports client-side environment configuration through `.env.local`.

Example:

```env
VITE_API_PROXY=https://app.recline.social
VITE_TURNSTILE_SITE_KEY=your_public_site_key
```

**Never put private API keys, database credentials or server secrets in `VITE_*` variables.** These values can be embedded in publicly accessible browser bundles.

## Desktop development

Recline's desktop client uses Tauri 2, combining the web interface with native desktop integration.

With the required Rust and platform dependencies installed:

```bash
npm run tauri:dev
```

To build the desktop application:

```bash
npm run tauri:build
```

Platform-specific dependencies and signing requirements may apply.

## Android development

The repository includes Capacitor integration for Android development.

```bash
npm run build:android
npm run cap:open:android
```

Android Studio and the appropriate Android SDK are required.

The presence of mobile integration code does not imply that an official mobile release is currently available.

## Repository scope

This is the **public Recline client repository**.

It includes the user interface, client-side cryptography, networking, WebRTC integration, desktop integration and associated client tests.

It does not contain the complete production backend, private infrastructure configuration, production credentials or operational databases.

The `SOURCE_VERSION` file records the source provenance of the published client mirror.

## Contributing

Community feedback, reproducible bug reports and responsible security research are welcome.

Before proposing significant changes:

1. Review existing issues and open pull requests.
2. Explain the problem and expected behaviour.
3. Keep changes focused and testable.
4. Run the available typecheck, test and build commands.
5. Avoid introducing incompatible changes to message formats, encryption keys or account recovery.

Changes to cryptography, authentication, WebRTC or persistent storage require particular care because they can affect existing user data and compatibility.

## Reporting security issues

Please avoid publicly disclosing exploitable vulnerabilities before maintainers have had an opportunity to investigate.

For security-related contact, email **hello@recline.social** with sufficient detail to reproduce the issue safely. Do not include real user credentials, private messages or production secrets.

## Project status

Recline is an independently developed, self-funded project in Open Beta.

The focus is on improving communication reliability, security, privacy, platform compatibility and community tools.

The [public roadmap](https://recline.social/roadmap/) distinguishes available features from work in progress and future ideas. Planned functionality and release dates are not guarantees.

## License

Recline Client is licensed under the **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**.

See [LICENSE](LICENSE) for the full license text.

## Links

- **Website:** https://recline.social
- **Web App:** https://app.recline.social
- **Roadmap:** https://recline.social/roadmap/
- **GitHub:** https://github.com/recline-social/recline-client
- **SourceForge:** https://sourceforge.net/software/product/Recline/
- **X:** https://x.com/ReclineApp
- **Contact:** hello@recline.social

---

**Recline — Building more meaningful online communities, one conversation at a time.**
