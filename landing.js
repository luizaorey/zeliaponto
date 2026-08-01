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

const wait = ms => new Promise(r => setTimeout(r, ms));

/* Animações de entrada (reveal no scroll) */
if ("IntersectionObserver" in window) {
  const revIO = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); revIO.unobserve(e.target); } }), { threshold: .15 });
  document.querySelectorAll(".reveal").forEach(el => revIO.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
}

/* Mockups de conversa: revela os balões (com "digitando") quando entram na tela */
async function playChat(body) {
  if (body.dataset.played) return; body.dataset.played = "1";
  for (const el of body.children) {
    if (el.classList.contains("typing")) { el.classList.add("show"); await wait(1050); el.classList.remove("show"); }
    else if (el.classList.contains("wb")) { el.classList.add("show"); await wait(el.classList.contains("wb-out") ? 850 : 1300); }
  }
}
if ("IntersectionObserver" in window) {
  const chatIO = new IntersectionObserver((es, ob) => es.forEach(e => { if (e.isIntersecting) { playChat(e.target); ob.unobserve(e.target); } }), { threshold: .5 });
  document.querySelectorAll("[data-chat]").forEach(b => chatIO.observe(b));
} else {
  document.querySelectorAll("[data-chat] .wb").forEach(b => b.classList.add("show"));
}

/* Painel: os números sobem de 0 até o valor quando aparece */
function countUp(b) {
  const target = +b.dataset.c || 0; let n = 0; const step = Math.max(1, Math.ceil(target / 12));
  const t = setInterval(() => { n += step; if (n >= target) { n = target; clearInterval(t); } b.textContent = n; }, 70);
}
if ("IntersectionObserver" in window) {
  const panelIO = new IntersectionObserver((es, ob) => es.forEach(e => { if (e.isIntersecting) { e.target.querySelectorAll("[data-c]").forEach(countUp); ob.unobserve(e.target); } }), { threshold: .5 });
  document.querySelectorAll(".mk-panel").forEach(p => panelIO.observe(p));
}

/* FAQ: abre uma por vez */
document.querySelectorAll(".faq details").forEach(d => d.addEventListener("toggle", () => {
  if (d.open) document.querySelectorAll(".faq details").forEach(o => { if (o !== d) o.open = false; });
}));
