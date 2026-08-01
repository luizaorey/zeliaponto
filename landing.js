/* ======================================================================
   NÚMERO DA ZÉLIA — constante ÚNICA. Trocar só aqui quando a Zélia
   Vendedora assumir (hoje aponta pro WhatsApp do Luizão).
   ====================================================================== */
const WA_NUMERO = "5571992123439";
const WA_MSG = "Oi! Quero conhecer a Zélia 👋";
const WA_LINK = "https://wa.me/" + WA_NUMERO + "?text=" + encodeURIComponent(WA_MSG);
document.querySelectorAll(".js-wa").forEach(a => { a.href = WA_LINK; a.target = "_blank"; a.rel = "noopener"; });

/* Continuidade: quem abriu como app instalado (PWA) cai direto no /app/ */
try {
  const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (standalone) location.replace("app/");
} catch (e) {}

/* SW de migração (na raiz): limpa o cache antigo do app que ficava aqui */
if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(() => {}); }

/* Mock animado da conversa: revela os balões quando entra na tela */
(function () {
  const body = document.getElementById("wa-body");
  if (!body) return;
  const t1 = document.getElementById("typing1"), t2 = document.getElementById("typing2");
  const b1 = body.querySelector('[data-step="1"]'), b2 = body.querySelector('[data-step="2"]'), b3 = body.querySelector('[data-step="3"]');
  let played = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function play() {
    if (played) return; played = true;
    t1.classList.add("show");
    await wait(1300); t1.classList.remove("show"); b1.classList.add("show");   // Zélia: alerta
    await wait(1600); b2.classList.add("show");                                 // dono responde
    await wait(700);  t2.classList.add("show");
    await wait(1200); t2.classList.remove("show"); b3.classList.add("show");    // Zélia: confirma
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es, ob) => es.forEach(e => { if (e.isIntersecting) { play(); ob.disconnect(); } }), { threshold: .4 }).observe(body);
  } else { play(); }
})();
