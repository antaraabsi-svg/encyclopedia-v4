/* عامل الخدمة: يعمل فقط عند نشر البرنامج على موقع (http/https) */
var V = 'enc-shell-v2', PAGES = 'enc-pages';
var SHELL = ['./', 'index.html', 'css/style.css', 'js/data.js', 'js/extras.js', 'js/app.js', 'assets/logo.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V && k !== PAGES; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  var isImg = /\/(pages|thumbs)\//.test(r.url);
  if (isImg) {
    e.respondWith(caches.match(r).then(function (hit) {
      return hit || fetch(r).then(function (res) {
        if (res.ok) { var cp = res.clone(); caches.open(PAGES).then(function (c) { c.put(r, cp); }); }
        return res;
      });
    }));
  } else {
    e.respondWith(fetch(r).then(function (res) {
      if (res.ok) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }); }
      return res;
    }).catch(function () { return caches.match(r).then(function (h) { return h || caches.match('index.html'); }); }));
  }
});
