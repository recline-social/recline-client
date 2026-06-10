import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // WebCrypto is native in Node 20+; storage/IDB shimmed in setup
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/lib/__tests__/setup.ts'],
    // PBKDF2 at 600k iterations (backup KDF) runs several times across the suite —
    // generous timeouts so slow CI machines don't flake.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
