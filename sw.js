/* Service Worker — Zélia Ponto
   - Cache-first dos assets do app (abre offline)
   - NUNCA cacheia os webhooks do n8n
   - Sync: notifica a página aberta para esvaziar a fila (o envio real acontece
     na página, que tem o token no localStorage — token NUNCA é gravado no IndexedDB) */
const CACHE = "zelia-v3";
const ASSETS = ["./","./index.html","./style.css","./app.js","./manifest.json","./zelia.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-192-maskable.png","./icons/icon-512-maskable.png"];
const WEBHOOK_BASE = "https://giantfalcon-n8n.cloudfy.live/webhook";

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.href.startsWith(WEBHOOK_BASE)) { e.respondWith(fetch(e.request)); return; }        // webhooks: sempre rede
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request).then(hit => {
    const rede = fetch(e.request).then(resp => { if (resp && resp.ok) { const c = resp.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return resp; })
      .catch(() => hit || caches.match("./index.html"));
    return hit || rede;
  }));
});

self.addEventListener("sync", e => {
  if (e.tag === "zelia-sync") {
    e.waitUntil(self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: "zelia-sync" }))));
  }
});
