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

const PREF_KEY = 'recline:notif:enabled';

// ── Availability ───────────────────────────────────────────────────────────────

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
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

/**
 * Returns true when a notification should actually fire:
 *   - Notifications are supported
 *   - Browser permission is granted
 *   - User preference is enabled
 *   - The document tab is currently hidden (backgrounded)
 */
export function shouldNotify(): boolean {
  if (!notificationsSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  if (!getNotificationPref()) return false;
  return document.visibilityState === 'hidden';
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
