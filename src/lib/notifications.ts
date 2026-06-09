/**
 * Desktop notification helpers for Recline.
 *
 * Permission is requested once after login. All helpers are no-ops when the
 * Notification API is unavailable (e.g. insecure context, some mobile browsers).
 *
 * localStorage key: 'recline:notif:enabled'
 *   - 'true'  → user wants notifications (we still respect the browser permission)
 *   - 'false' → user explicitly disabled in settings
 *   - absent  → not yet decided (default: enabled if granted)
 */

import { api } from './api';

const PREF_KEY = 'recline:notif:enabled';

// ── Availability ───────────────────────────────────────────────────────────────

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

// ── Permission ─────────────────────────────────────────────────────────────────

/**
 * Request notification permission. Returns true if granted.
 * Safe to call multiple times — browser de-dupes the prompt.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** Current browser permission state. */
export function getNotificationPermission(): NotificationPermission {
  if (!notificationsSupported()) return 'denied';
  return Notification.permission;
}

// ── User preference ────────────────────────────────────────────────────────────

/** Read the user's stored preference (true = want notifications). */
export function getNotificationPref(): boolean {
  if (!notificationsSupported()) return false;
  const stored = localStorage.getItem(PREF_KEY);
  // Default: enabled when permission is granted
  if (stored === null) return Notification.permission === 'granted';
  return stored === 'true';
}

/** Persist the user's preference. */
export function setNotificationPref(enabled: boolean): void {
  localStorage.setItem(PREF_KEY, String(enabled));
}

// ── Gate ───────────────────────────────────────────────────────────────────────

// FEAT-052: set true while the user's status is Do Not Disturb — silences all
// local desktop notifications (server-side push is suppressed independently).
let dndActive = false;
export function setDndActive(active: boolean): void {
  dndActive = active;
}

/**
 * Returns true when a notification should actually fire:
 *   - The user is not in Do Not Disturb
 *   - Notifications are supported
 *   - Browser permission is granted
 *   - User preference is enabled
 *   - The document tab is currently hidden (backgrounded)
 */
export function shouldNotify(): boolean {
  if (dndActive) return false;
  if (!notificationsSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  if (!getNotificationPref()) return false;
  return document.visibilityState === 'hidden';
}

// ── Web Push subscription ──────────────────────────────────────────────────────

/** Convert a URL-safe base64 VAPID public key to a Uint8Array for pushManager.subscribe(). */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

let _swRegistration: ServiceWorkerRegistration | null = null;

/** Register the service worker once and cache the registration. */
async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  if (_swRegistration) return _swRegistration;
  _swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  // Wait until the SW is active before using push
  await navigator.serviceWorker.ready;
  return _swRegistration;
}

/**
 * Register the service worker, subscribe to Web Push, and persist the
 * subscription to the server. Idempotent — safe to call on every login.
 *
 * Silently no-ops if:
 *   - push is not supported in this browser/context
 *   - notification permission has not been granted
 *   - the server has not configured VAPID keys
 */
export async function registerPushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  if (Notification.permission !== 'granted') return;

  try {
    // Fetch VAPID public key — returns 503 if server hasn't set VAPID env vars
    const { publicKey } = await api.getPushVapidKey();
    if (!publicKey) return;

    const reg = await getSwRegistration();

    // Check for an existing subscription first to avoid unnecessary re-subscribe
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

    await api.subscribePush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch (err) {
    // Non-fatal — push is a nice-to-have
    console.warn('[push] subscription failed:', err);
  }
}

/**
 * Unsubscribe from Web Push and remove the subscription from the server.
 * Called on logout or when the user disables notifications in settings.
 */
export async function unregisterPushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await api.unsubscribePush(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  } catch (err) {
    console.warn('[push] unsubscribe failed:', err);
  }
}

// ── Show ───────────────────────────────────────────────────────────────────────

export interface ShowNotificationOptions {
  /** Icon URL. Defaults to /favicon.ico. */
  icon?: string;
  /**
   * Deduplication / replacement key. Notifications with the same tag replace
   * each other in the notification tray.
   */
  tag?: string;
  /** Called when the user clicks the notification. */
  onClick?: () => void;
}

/**
 * Show a desktop notification if shouldNotify() returns true.
 *
 * onClick will focus the window and invoke the supplied callback (e.g. navigate
 * to the relevant conversation).
 */
export function showNotification(
  title: string,
  body: string,
  options: ShowNotificationOptions = {},
): void {
  if (!shouldNotify()) return;

  const { icon = '/favicon.ico', tag, onClick } = options;

  let notif: Notification;
  try {
    notif = new Notification(title, {
      body,
      icon,
      tag,
      silent: false,
    });
  } catch {
    // Notification API unavailable in this context (e.g. insecure origin)
    return;
  }

  if (onClick) {
    notif.onclick = () => {
      // Bring the tab back to the front
      try { window.focus(); } catch { /* some browsers block this */ }
      onClick();
      notif.close();
    };
  }
}
