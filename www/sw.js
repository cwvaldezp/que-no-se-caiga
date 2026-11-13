// Guarda el juego en el teléfono para que funcione sin internet.
// Con internet siempre se usa la versión publicada (y se guarda); sin internet, la guardada.
var CACHE = 'ahorcado-v12';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/phrases.js', 'js/voice-clips.js', 'js/letters.js', 'js/words.js', 'js/progress.js', 'js/figure.js', 'js/tracer.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  // cache: 'reload' para no guardar una copia vieja que el navegador tenga en su caché.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true });
  }));
});
