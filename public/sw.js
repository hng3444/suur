const STATIC_CACHE = 'suur-static-v7';
const PRIVATE_CACHE_PREFIX = 'suur-private-v2-';
const PRIVATE_META_CACHE = 'suur-private-meta-v2';
const PRIVATE_META_KEY = '/__suur_private_user__';
const OFFLINE_SHELL = '/__suur_offline_shell__';
const APP_SHELL = ['/offline.html', '/manifest.webmanifest', '/suuricon.png', '/icon-192.png', '/icon-512.png'];

function safeUserId(value) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) : '';
}

async function setPrivateNamespace(userId) {
  const safe = safeUserId(userId);
  if (!safe) return null;
  const meta = await caches.open(PRIVATE_META_CACHE);
  await meta.put(PRIVATE_META_KEY, new Response(safe));
  return `${PRIVATE_CACHE_PREFIX}${safe}`;
}

async function privateCacheName() {
  const marker = await caches.match(PRIVATE_META_KEY, { cacheName: PRIVATE_META_CACHE });
  const safe = marker ? safeUserId(await marker.text()) : '';
  return safe ? `${PRIVATE_CACHE_PREFIX}${safe}` : null;
}

async function clearPrivateCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key === PRIVATE_META_CACHE || key === 'suur-private-v1' || key.startsWith(PRIVATE_CACHE_PREFIX)).map((key) => caches.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => (key.startsWith('suur-static-') && key !== STATIC_CACHE) || key === 'suur-private-v1').map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && !response.redirected && url.pathname === '/') {
          const name = await privateCacheName();
          if (name) await (await caches.open(name)).put(OFFLINE_SHELL, response.clone());
        }
        return response;
      } catch {
        const name = await privateCacheName();
        const privateShell = name ? await caches.match(OFFLINE_SHELL, { cacheName: name }) : null;
        return privateShell || caches.match('/offline.html');
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const isPrivateAsset = url.pathname.startsWith('/api/attachments/') || url.pathname.includes('/avatar');
    if (!isPrivateAsset) return;
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const name = await privateCacheName();
          if (name) await (await caches.open(name)).put(request, response.clone());
        }
        return response;
      } catch {
        const name = await privateCacheName();
        return (name ? await caches.match(request, { cacheName: name }) : null) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});

async function checkRemindersInBackground() {
  try {
    const response = await fetch('/api/notes?view=reminders', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return;
    const { notes } = await response.json();
    const now = Date.now();
    const name = await privateCacheName();
    if (!name) return;
    const cache = await caches.open(name);
    for (const note of notes || []) {
      if (!note.reminderAt) continue;
      const due = new Date(note.reminderAt).getTime();
      if (due > now || due < now - 86_400_000) continue;
      const tag = `notified:${note.id}:${note.reminderAt}`;
      const marker = new Request(new URL(`/__suur_notification__/${encodeURIComponent(tag)}`, self.location.origin));
      if (await cache.match(marker)) continue;
      await self.registration.showNotification(note.title || 'Suur', {
        body: note.type === 'checklist'
          ? note.items.filter((item) => !item.checked).slice(0, 3).map((item) => item.text).join(' · ')
          : String(note.content || '').slice(0, 180),
        icon: '/icon-192.png', badge: '/icon-192.png', tag, data: { url: '/#reminders' },
      });
      await cache.put(marker, new Response(new Date().toISOString()));
    }
  } catch {
    // A foreground check will retry when the server is reachable again.
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'suur-reminders') event.waitUntil(checkRemindersInBackground());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_PRIVATE_SHELL') {
    event.waitUntil((async () => {
      try {
        const name = await setPrivateNamespace(event.data.userId);
        if (!name) return;
        const response = await fetch('/', { credentials: 'include', cache: 'no-store' });
        if (!response.ok || response.redirected) return;
        const cache = await caches.open(name);
        await cache.put(OFFLINE_SHELL, response);
      } catch {
        // The next successful navigation will refresh the shell.
      }
    })());
  }
  if (event.data?.type === 'CLEAR_PRIVATE') {
    event.waitUntil(clearPrivateCaches().finally(() => event.ports?.[0]?.postMessage({ cleared: true })));
  }
  if (event.data?.type === 'CHECK_REMINDERS') event.waitUntil(checkRemindersInBackground());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || '/#reminders';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      existing.navigate(destination);
      return;
    }
    await self.clients.openWindow(destination);
  })());
});
