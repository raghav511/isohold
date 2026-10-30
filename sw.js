// Instant launch: answer from the phone's saved copy straight away,
// then check for a newer version in the background for next launch.
// Install skips the browser's HTTP cache (cache: "reload"): a new version must not save the old files it still holds.
// The app page is saved once, as "index.html" ("./", "index.html#…" and "index.html?…" are the same page). A new version's
// install revalidates it (cache: "no-cache"): the server either confirms the copy the browser holds (304) or sends the new
// one, so a stale copy is never saved and an unchanged page is not downloaded again.
var C = "isohold-v57", PAGE = "index.html", F = ["manifest.json", "icon-180.png", "icon-192.png", "icon-512.png"];
// First install only: the open page has just downloaded index.html, so ask it for that copy (Safari's service worker
// can't see the page's HTTP cache and would download the whole page a second time). Updates always ask the server.
function fromPage() {
  if (self.registration.active) return Promise.resolve(null);
  return self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(function (cs) {
    if (!cs.length) return null;
    return new Promise(function (res) {
      var t, on = function (ev) { var d = ev.data; if (d && d.isoholdPage && d.body && /var APP_VERSION = /.test(d.body)) done(d); };
      var done = function (v) { clearTimeout(t); self.removeEventListener("message", on); res(v); };
      self.addEventListener("message", on); t = setTimeout(function () { done(null); }, 5000);
      cs.forEach(function (c) { c.postMessage({ isoholdNeedPage: true }); });
    });
  }).catch(function () { return null; });
}
self.addEventListener("install", function (e) { self.skipWaiting(); e.waitUntil(caches.open(C).then(function (c) { return Promise.all([
  c.addAll(F.map(function (u) { return new Request(u, { cache: "reload" }); })),
  fromPage().then(function (d) {
    if (d) return c.put(PAGE, new Response(d.body, { headers: d.headers }));
    return fetch(PAGE, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("page " + r.status); return c.put(PAGE, r); });
  })]); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== C; }).map(function (x) { return caches.delete(x); })); })
  // drop the copies of "index.html?v=..." that version checks used to leave behind, and the second copy older versions kept as "./"
  .then(function () { return caches.open(C).then(function (c) { return c.keys().then(function (rs) { return Promise.all(rs.filter(function (r) { return /[?&]v=/.test(r.url) || /\/$/.test(r.url); }).map(function (r) { return c.delete(r); })); }); }); })
  .then(function () { return self.clients.claim(); })); });
function isPage(req, u) { return req.mode === "navigate" || u.pathname === new URL("./", self.registration.scope).pathname || /\/index\.html$/.test(u.pathname); }
// Background check for the next launch. With the saved copy's ETag / Last-Modified the server answers 304 with no body
// when nothing changed, so an unchanged app costs a few hundred bytes, not the whole page. The copy is replaced only on a 200.
function refresh(key, hit) {
  var et = hit && hit.headers.get("ETag"), lm = hit && hit.headers.get("Last-Modified"), h = {};
  if (et) h["If-None-Match"] = et; if (lm) h["If-Modified-Since"] = lm;
  return fetch(key, et || lm ? { cache: "no-store", headers: h } : { cache: "no-cache" }).then(function (r) {
    if (r && r.status === 200 && r.type === "basic") { var copy = r.clone(); return caches.open(C).then(function (c) { return c.put(key, copy); }).then(function () { return r; }); }
    return r;
  });
}
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  // the app's "is there a newer version?" check asks for no-store: it must see the network, not this saved copy, and isn't saved
  if (e.request.cache === "no-store") return;
  var page = isPage(e.request, u), key = page ? PAGE : u.origin + u.pathname;
  e.respondWith(caches.match(key).then(function (hit) {
    if (hit) { if (page) e.waitUntil(refresh(key, hit).catch(function () {})); return hit; }
    // not saved yet (or storage was cleared): the network, saved for next time; offline, the saved page
    return refresh(key, null).then(function (r) { return page && !(r && r.ok) ? caches.match(PAGE).then(function (p) { return p || r; }) : r; },
      function () { return caches.match(PAGE); });
  }));
});
