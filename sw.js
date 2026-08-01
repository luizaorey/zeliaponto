/* SW de MIGRAÇÃO da raiz: a raiz agora é a landing (estática). Limpa o cache
   do app antigo que ficava aqui e NÃO cacheia a landing (sempre rede). O app
   do funcionário vive em /app/ com o SW próprio dele (cache zelia-app-v1). */
const KEEP = "zelia-app-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => { e.waitUntil((async () => {
  const ks = await caches.keys();
  await Promise.all(ks.filter(k => k !== KEEP).map(k => caches.delete(k)));
  await self.clients.claim();
})()); });
self.addEventListener("fetch", () => {});
