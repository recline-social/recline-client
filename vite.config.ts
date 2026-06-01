import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// The .env file lives one level up (0Recline/.env), not inside client/.
// Point Vite at the repo root so VITE_* vars are picked up in dev mode.
// Docker builds inject them as ARG/ENV at build time, so this only matters
// for `npm run dev` from inside the client/ directory.
const ENV_DIR = resolve(process.cwd(), '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, '');
  const apiTarget = env.VITE_API_PROXY ?? 'http://localhost:4321';

  // Belt-and-suspenders: explicitly inject Turnstile site key via define so it
  // is guaranteed to be in the bundle even when Vite's env-file discovery misses
  // it (e.g. Docker builds where the .env lives outside the build context).
  // loadEnv with prefix '' reads ALL process.env vars, so this picks up the key
  // whether it came from a .env file (local dev) or a Docker ARG→ENV chain.
  const turnstileSiteKey = env.VITE_TURNSTILE_SITE_KEY ?? '';

  return {
    envDir: ENV_DIR,
    define: {
      'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(turnstileSiteKey),
    },
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, ws: true, changeOrigin: true },
      },
    },
  };
});
