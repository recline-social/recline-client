// Recline runs the servers. The client always connects to the canonical URL.
// Web builds use relative paths (same origin). Tauri/Capacitor use the full URL.

export const DEFAULT_SERVER_URL = 'https://app.recline.social';

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined';
}

/** True when running inside a native client (Tauri desktop or Capacitor mobile). */
export function isNativeClient(): boolean {
  return isDesktop() || isCapacitor();
}

/** Returns the base server URL prefix. Empty string for web (same-origin), full URL for Tauri/Capacitor. */
export function getServerUrl(): string {
  if (isDesktop() || isCapacitor()) return DEFAULT_SERVER_URL;
  return '';
}
