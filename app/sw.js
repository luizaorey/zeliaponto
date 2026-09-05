/* Service Worker — Zélia Ponto
   - App shell (HTML/JS/CSS) = NETWORK-FIRST -> sempre a versão mais nova quando online
     (cai pro cache só offline). Assim o app se ATUALIZA SOZINHO, sem reinstalar.
   - Estáticos (ícones/imagens) = cache-first (rápido), atualiza no fundo.
   - NUNCA cacheia os webhooks do n8n.
   - skipWaiting + clients.claim: um SW novo assume na hora; a página recarrega sozinha
     (listener controllerchange no app.js). */
const CACHE = "zelia-v7";
const ASSETS = ["./","./index.html","./style.css","./app.js","./manifest.json","./zelia.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-192-maskable.png","./icons/icon-512-maskable.png"];
const WEBHOOK_BASE = "https://giantfalcon-n8n.cloudfy.live/webhook";

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.href.startsWith(WEBHOOK_BASE)) { e.respondWith(fetch(e.request)); return; }   // webhooks: sempre rede
  if (url.pathname.includes("/painel")) return;                                          // painel: fora do escopo do SW
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  const isShell = e.request.mode === "navigate" || url.pathname.endsWith("/") || /\.(html|js|css)$/.test(url.pathname);
  if (isShell) {
    // NETWORK-FIRST: pega o novo quando online; cache é só o fallback offline
    e.respondWith(
      fetch(e.request).then(resp => { if (resp && resp.ok) { const c = resp.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return resp; })
        .catch(() => caches.match(e.request).then(h => h || caches.match("./index.html")))
    );
  } else {
    // estáticos: cache-first, revalida no fundo
    e.respondWith(caches.match(e.request).then(hit => {
      const rede = fetch(e.request).then(resp => { if (resp && resp.ok) { const c = resp.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return resp; }).catch(() => hit);
      return hit || rede;
    }));
  }
});

self.addEventListener("sync", e => {
  if (e.tag === "zelia-sync") {
    e.waitUntil(self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: "zelia-sync" }))));
  }
});
