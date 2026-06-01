# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email: **contact@recline.social**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix

We aim to respond within 48 hours and will keep you updated on the fix timeline.

## Scope

The client encryption code in `src/lib/crypto.ts` is the primary audit target. We especially welcome review of:

- AES-GCM-256 channel encryption (`deriveServerKey`, `encryptText`, `decryptText`)
- ECDH P-256 DM key exchange (`generateDmKeyPair`, `deriveDmKey`)
- Key rotation and history (`rotateDmKeyPair`, `loadDmKeyHistory`)
- Session storage of derived keys (`cacheKey`, `exportKeyToSession`)

## Recognition

Researchers who responsibly disclose valid vulnerabilities will be credited publicly (with permission).
