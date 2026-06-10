import { useEffect, useState, useCallback } from 'react';

// Dynamically import Tauri plugins — they only exist in the desktop build.
// In the browser / Capacitor these imports will 404 gracefully since we guard
// on window.__TAURI_INTERNALS__ before calling anything.

export interface UpdaterState {
  available: boolean;
  version: string | null;
  installing: boolean;
  applyUpdate: () => void;
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useUpdater(): UpdaterState {
  const [available, setAvailable] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  // Store the resolved Update object so applyUpdate can relaunch.
  // We keep it in a ref-like closure via a module-level variable to avoid
  // re-triggering the effect.
  const [pendingRelaunch, setPendingRelaunch] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (cancelled || !update) return;

        // Download silently in the background — don't install yet.
        // We'll install + relaunch when the user clicks "Restart now".
        setVersion(update.version);

        await update.downloadAndInstall(() => {
          // Progress callback — could surface a progress bar later
        });

        if (!cancelled) {
          setAvailable(true);
        }
      } catch (err) {
        // Non-fatal: missing update server, no network, etc.
        console.warn('[updater] check/download failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Once update is downloaded, relaunch on demand.
  useEffect(() => {
    if (!pendingRelaunch) return;
    (async () => {
      try {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } catch (err) {
        console.error('[updater] relaunch failed:', err);
        setInstalling(false);
        setPendingRelaunch(false);
      }
    })();
  }, [pendingRelaunch]);

  const applyUpdate = useCallback(() => {
    setInstalling(true);
    setPendingRelaunch(true);
  }, []);

  return { available, version, installing, applyUpdate };
}
