/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const CACHE_NAME = `teamtime-${version}`;

// Only cache build assets and static files (JS, CSS, images, fonts)
const ASSETS = [...build, ...files];

self.addEventListener('install', (event: ExtendableEvent) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => {
			(self as unknown as ServiceWorkerGlobalScope).skipWaiting();
		})
	);
});

self.addEventListener('activate', (event: ExtendableEvent) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			// Delete old caches
			for (const key of keys) {
				if (key !== CACHE_NAME) {
					await caches.delete(key);
				}
			}
			(self as unknown as ServiceWorkerGlobalScope).clients.claim();
		})
	);
});

self.addEventListener('fetch', (event: FetchEvent) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// NEVER cache API requests
	if (url.pathname.startsWith('/api/')) {
		return;
	}

	// NEVER cache HTML pages (navigation requests)
	// This prevents stale user data from being shown after login/logout
	if (event.request.mode === 'navigate' ||
		event.request.headers.get('accept')?.includes('text/html')) {
		event.respondWith(
			fetch(event.request).catch(() => {
				return caches.match('/offline.html') || new Response('Offline', { status: 503 });
			})
		);
		return;
	}

	// Only serve from cache for static assets (JS, CSS, images, fonts)
	const isStaticAsset = ASSETS.some(asset => url.pathname.endsWith(asset) || url.pathname === asset) ||
		url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico|webp)$/);

	if (!isStaticAsset) {
		// Not a static asset - go to network
		return;
	}

	// For static assets: try cache first, then network
	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) {
				return cached;
			}

			return fetch(event.request).then((response) => {
				if (response.status === 200) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, clone);
					});
				}
				return response;
			}).catch(() => {
				return new Response('Offline', { status: 503 });
			});
		})
	);
});

// Handle push notifications
self.addEventListener('push', (event: PushEvent) => {
	const data = event.data?.json() || {};

	const options: NotificationOptions = {
		body: data.body || '',
		icon: '/icon-192.png',
		badge: '/icon-192.png',
		vibrate: [100, 50, 100],
		data: data.data || {},
		actions: data.actions || []
	};

	event.waitUntil(
		(self as unknown as ServiceWorkerGlobalScope).registration.showNotification(data.title || 'TeamTime', options)
	);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event: NotificationEvent) => {
	event.notification.close();

	const data = event.notification.data || {};
	let url = '/dashboard';

	if (data.conversationId) {
		url = `/messages/${data.conversationId}`;
	} else if (data.taskId) {
		url = `/tasks/${data.taskId}`;
	} else if (data.purchaseRequestId) {
		url = `/purchase-requests/${data.purchaseRequestId}`;
	}

	event.waitUntil(
		(self as unknown as ServiceWorkerGlobalScope).clients.matchAll({ type: 'window' }).then((clients) => {
			for (const client of clients) {
				if (client.url.includes(url) && 'focus' in client) {
					return client.focus();
				}
			}
			return (self as unknown as ServiceWorkerGlobalScope).clients.openWindow(url);
		})
	);
});
