// ============================================================
// SERVICE WORKER - PWA Support
// Provides offline functionality and caching
// ============================================================

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `arsip-anka-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `arsip-anka-dynamic-${CACHE_VERSION}`;
const LEGACY_CACHE = /^arsip-anka-(v1|static-v1|dynamic-v1)$/;

// Files to cache immediately
const STATIC_ASSETS = [
    '/',
    '/dashboard.html',
    '/index.html',
    '/css/style.css',
    '/css/mobile.css',
    '/css/tailwind.generated.css',
    '/js/config.js',
    '/js/api.js',
    '/js/auth.js',
    '/js/utils.js',
    '/js/sidebar.js',
    '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .catch((err) => {
                console.error('[SW] Cache installation failed:', err);
            })
    );
    
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                const hadLegacyCache = cacheNames.some((cacheName) => LEGACY_CACHE.test(cacheName));

                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                ).then(() => hadLegacyCache);
            })
            .then(async (hadLegacyCache) => {
                await self.clients.claim();

                // Versi lama memakai cache-first. Setelah cache lama dibuang,
                // reload semua tab sekali supaya HTML/JS baru langsung dipakai.
                if (hadLegacyCache) {
                    const windowClients = await self.clients.matchAll({ type: 'window' });
                    await Promise.all(
                        windowClients.map((client) => client.navigate(client.url).catch(() => null))
                    );
                }
            })
    );
});

async function networkFirst(request, cacheName) {
    try {
        const networkResponse = await fetch(request);

        // Cache hanya respons same-origin yang sukses.
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const cache = await caches.open(cacheName);
            await cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (err) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        if (request.mode === 'navigate') {
            const offlinePage = await caches.match('/offline.html');
            if (offlinePage) return offlinePage;
        }

        throw err;
    }
}

async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const cache = await caches.open(DYNAMIC_CACHE);
        await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}

// Fetch event - HTML/JS/CSS selalu ambil versi terbaru (network-first),
// aset statis lain boleh cache-first. Ini mencegah HTML/JS lama tertahan.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip API calls (don't cache API responses)
    if (url.pathname.startsWith('/api/')) {
        return;
    }
    
    // Skip external resources
    if (url.origin !== location.origin) {
        return;
    }

    const criticalAsset =
        request.mode === 'navigate' ||
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'worker';

    const cacheName = request.destination === 'script' || request.destination === 'style'
        ? STATIC_CACHE
        : DYNAMIC_CACHE;

    event.respondWith(
        criticalAsset
            ? networkFirst(request, cacheName)
            : cacheFirst(request)
    );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);
    
    if (event.tag === 'sync-offline-actions') {
        event.waitUntil(syncOfflineActions());
    }
});

async function syncOfflineActions() {
    // Get offline actions from IndexedDB and sync them
    console.log('[SW] Syncing offline actions...');
    // Implementation depends on your offline storage strategy
}

// Push notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');
    
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Arsip Anka';
    const options = {
        body: data.body || 'You have a new notification',
        icon: '/images/icon-192x192.png',
        badge: '/images/icon-72x72.png',
        tag: data.tag || 'notification',
        data: data.url ? { url: data.url } : {}
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/dashboard.html';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // Check if there's already a window open
                for (let client of windowClients) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Message handler for communication with the app
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            })
        );
    }
});
