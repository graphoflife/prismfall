// Offline support: keeps a copy of every game file on the device, so Prismfall
// starts instantly and plays without a connection. The game is served from
// that copy; when any file changes, tools/stamp-sw.mjs gives this script a new
// VERSION, the browser notices on the next online start, downloads the new
// files in the background and uses them from the start after that.

// stamp:start (written by tools/stamp-sw.mjs, run it after changing game files)
const VERSION = '7b1b91683e1e';
const FILES = [
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'assets/gems/0.webp',
  'assets/gems/1.webp',
  'assets/gems/2.webp',
  'assets/gems/3.webp',
  'assets/gems/4.webp',
  'assets/gems/5.webp',
  'assets/gems/6.webp',
  'assets/gems/7.webp',
  'css/fonts.css',
  'css/style.css',
  'fonts/bangers.woff2',
  'fonts/cinzel-700.woff2',
  'fonts/comic-neue-400.woff2',
  'fonts/comic-neue-700.woff2',
  'fonts/lato-400.woff2',
  'fonts/lato-700.woff2',
  'fonts/pixelify-sans.woff2',
  'fonts/press-start-2p.woff2',
  'js/audio.js',
  'js/board.js',
  'js/fx.js',
  'js/game.js',
  'js/gems.js',
  'js/look.js',
  'js/main.js',
  'js/sprites.js',
  'js/theme.js',
];
// stamp:end

const CACHE = `prismfall-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the HTTP cache so a new version never mixes in old files
    await cache.addAll(['./', ...FILES].map((f) => new Request(f, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('prismfall-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) ?? fetch(req);
  })());
});
