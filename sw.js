// Instant launch: answer from the phone's saved copy straight away,
// then fetch the latest version in the background for next launch.
// Install skips the browser's HTTP cache (cache: "reload"): a new version must not save the old index.html it still holds.
var C = "isohold-v53", F = ["./", "index.html", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", function (e) { self.skipWaiting(); e.waitUntil(caches.open(C).then(function (c) { return c.addAll(F.map(function (u) { return new Request(u, { cache: "reload" }); })); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== C; }).map(function (x) { return caches.delete(x); })); })
  // drop the copies of "index.html?v=..." that version checks used to leave behind, one per check
  .then(function () { return caches.open(C).then(function (c) { return c.keys().then(function (rs) { return Promise.all(rs.filter(function (r) { return /[?&]v=/.test(r.url); }).map(function (r) { return c.delete(r); })); }); }); })
  .then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // the app's "is there a newer version?" check asks for no-store: it must see the network, not this saved copy, and isn't saved
  if (e.request.cache === "no-store") return;
  var fresh = fetch(e.request, { cache: "no-cache" }).then(function (r) {
    if (r && r.ok) { var copy = r.clone(); caches.open(C).then(function (c) { c.put(e.request, copy); }); }
    return r;
  });
  e.waitUntil(fresh.catch(function () {}));
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fresh.catch(function () { return caches.match("index.html"); });
  }));
});
