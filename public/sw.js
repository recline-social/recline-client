// Recline Service Worker — handles push notifications + offline caching

self.addEventListener('install', (event) => {
  // Take control immediately without waiting for old SW to stop
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── Push notifications ────────────────────────────────────────────────────────

/** CLIENT-003: Sanitize a push payload field to a safe string.
 *  Rejects non-strings and truncates to maxLen characters. */
function sanitizePushField(value, maxLen, fallback) {
  if (typeof value !== 'string') return fallback;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Recline', body: event.data.text() };
  }

  // CLIENT-003: validate all user-controlled fields before use.
  const title = sanitizePushField(payload.title, 500, 'Recline');
  const body  = sanitizePushField(payload.body,  500, 'New notification');
  const url   = sanitizePushField(payload.url,   500, '/');
  const options = {
    body,
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    tag: payload.tag ?? 'recline',
    data: { url },
    silent: false,
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click — focus or open the app ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url ?? '/';
  // Validate: only allow relative paths or https:// — reject http:// to prevent
  // unencrypted navigation from a push payload, and block javascript: URIs.
  const targetUrl = (rawUrl.startsWith('/') || rawUrl.startsWith('https://'))
    ? rawUrl
    : '/';

  // FEAT-003: prefer a window already at the target URL so the user lands in context
  // rather than being bounced to a random already-open tab.
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Prefer a client already at (or within) the target URL
      const exactMatch = windowClients.find(
        (c) => c.url === targetUrl || c.url.startsWith(targetUrl)
      );
      if (exactMatch) {
        return exactMatch.focus().then((c) => (c.navigate ? c.navigate(targetUrl) : c));
      }
      // Fall back to any focusable window and navigate it
      const anyWindow = windowClients.find((c) => 'focus' in c);
      if (anyWindow) {
        return anyWindow.focus().then((c) => (c.navigate ? c.navigate(targetUrl) : c));
      }
      // No window open — open a new one
      return clients.openWindow(targetUrl);
    })
  );
});
