import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// In the public client repository, environment files live at the repository root.
const ENV_DIR = resolve(process.cwd(), '.');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, '');
  const apiTarget = env.VITE_API_PROXY ?? 'https://app.recline.social';
  const turnstileSiteKey = env.VITE_TURNSTILE_SITE_KEY ?? '';

  return {
    envDir: ENV_DIR,
    define: {
      'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(turnstileSiteKey),
    },
    plugins: [react()],
    build: {
      target: 'es2022',
    },
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
