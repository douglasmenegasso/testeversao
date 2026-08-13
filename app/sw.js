const CACHE_NAME = 'kayla-web-v5.4.3';
const APP_SHELL = './index.html';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './scanner.js',
  './js/config.js',
  './js/utils.js',
  './js/auth.js',
  './js/register.js',
  './js/clients.js',
  './js/products.js',
  './js/sales.js',
  './js/orders.js',
  './js/payment.js',
  './js/devices.js',
  './js/pdf.js',
  './js/subscription.js',
  './js/main.js',
  './reset-password.html',
  './assets/icons/icon-192-dark.png',
  './assets/icons/icon-512-dark.png',
  './assets/icons/apple-touch-icon-dark.png',
  './assets/icons/favicon.ico',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-16.png'
];

async function cacheEssentialAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(ASSETS_TO_CACHE.map(async (asset) => {
    try {
      const response = await fetch(asset, { cache: 'no-cache' });
      if (response.ok) await cache.put(asset, response);
    } catch (error) {
      // Uma falha pontual não impede que o shell disponível seja instalado.
      console.warn('[SW] Não foi possível pré-cachear', asset);
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheEssentialAssets().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('kayla-web-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'SW_READY', cache: CACHE_NAME }));
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Não cachear chamadas autenticadas, banco de dados, checkout ou bibliotecas externas.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const network = await fetch(event.request);
        if (network.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(APP_SHELL, network.clone());
        }
        return network;
      } catch (error) {
        return (await caches.match(event.request)) || (await caches.match(APP_SHELL)) || new Response('Aplicativo indisponível offline', { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) {
      event.waitUntil((async () => {
        try {
          const network = await fetch(event.request);
          if (network.ok) (await caches.open(CACHE_NAME)).put(event.request, network.clone());
        } catch (error) {
          // Mantém a cópia cacheada até a conectividade ser restaurada.
        }
      })());
      return cached;
    }

    try {
      const network = await fetch(event.request);
      if (network.ok && ['script', 'style', 'image', 'font'].includes(event.request.destination)) {
        (await caches.open(CACHE_NAME)).put(event.request, network.clone());
      }
      return network;
    } catch (error) {
      return new Response('', { status: 404 });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CHECK_INSTALLABLE' && event.ports[0]) {
    event.ports[0].postMessage({ installable: true });
  }
});
