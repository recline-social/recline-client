// In a browser served from the same origin as the API, we use relative paths.
// In the Tauri desktop app (origin is `tauri://localhost`), we need an absolute
// URL pointing to a Recline server.

const KEY = 'recline.serverUrl';

// The official Recline server — pre-selected on first launch for desktop/mobile.
// Users can replace this with any self-hosted Recline instance.
export const DEFAULT_SERVER_URL = 'https://app.recline.social';

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined';
}

export function getServerUrl(): string {
  if (isCapacitor()) return DEFAULT_SERVER_URL;
  if (!isDesktop()) return '';
  return (localStorage.getItem(KEY) ?? '').replace(/\/$/, '');
}

export function setServerUrl(url: string | null) {
  if (url === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, url.replace(/\/$/, ''));
}

export async function probeServer(url: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  const clean = url.replace(/\/$/, '');
  try {
    const res = await fetch(clean + '/api/health', { method: 'GET' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { ok?: boolean; name?: string };
    if (!data?.ok) return { ok: false, error: 'unexpected response' };
    return { ok: true, name: data.name };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'unreachable' };
  }
}
