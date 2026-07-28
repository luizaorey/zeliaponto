/* Painel do Dono — Zélia
   - Sessão do dono (token no localStorage, prefixo painel_)
   - empresa_id/regras vêm sempre do backend; aqui é só UI
   - 401 / sessao_invalida -> volta pro login */
"use strict";
const WB = "https://giantfalcon-n8n.cloudfy.live/webhook";
const EP = {
  login: WB + "/zelia-dono-login", senha: WB + "/zelia-dono-senha",
  lista: WB + "/zelia-func-lista", criar: WB + "/zelia-func-criar",
  desativar: WB + "/zelia-func-desativar", reativar: WB + "/zelia-func-reativar",
  reset: WB + "/zelia-func-reset-senha",
  dia: WB + "/zelia-painel-dia", config: WB + "/zelia-config-salvar",
  locais: WB + "/zelia-locais", localSalvar: WB + "/zelia-local-salvar",
  localOff: WB + "/zelia-local-desativar", localOn: WB + "/zelia-local-reativar",
};
const LS_TOKEN = "zelia_painel_token", LS_NOME = "zelia_painel_nome", LS_EMPRESA = "zelia_painel_empresa";

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const getToken = () => localStorage.getItem(LS_TOKEN) || "";
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function toast(msg){ const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600); }
function openModal(html){ $("modal").innerHTML = html; $("modal-bg").classList.add("show"); }
function closeModal(){ $("modal-bg").classList.remove("show"); }
$("modal-bg").addEventListener("click", e => { if (e.target === $("modal-bg")) closeModal(); });

function togglePw(btn){
  const inp = btn.parentNode.querySelector("input");
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  btn.querySelector(".eye-on").style.display = show ? "none" : "";
  btn.querySelector(".eye-off").style.display = show ? "" : "none";
  btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
}
function go(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  const logged = (id === "s-home" || id === "s-funcionarios" || id === "s-dia" || id === "s-locais" || id === "s-local-form");
  $("topbar").style.display = logged ? "flex" : "none";
}

/* ---------- CPF ---------- */
const soDig = v => (v || "").replace(/\D/g, "").slice(0, 11);
function mascaraCpf(v){ v = soDig(v);
  return v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
function cpfValido(c){ c = soDig(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base, p) => { let s = 0; for (let i = 0; i < base.length; i++) s += (+base[i]) * (p - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(c.slice(0, 9), 10) === (+c[9]) && dv(c.slice(0, 10), 11) === (+c[10]); }

/* ---------- fetch autenticado (trata 401) ---------- */
async function apiGet(url){
  let r, d;
  try { r = await fetch(url + "?token=" + encodeURIComponent(getToken())); d = await r.json().catch(() => ({})); }
  catch(e){ toast("Sem conexão. Tente de novo."); throw e; }
  if (r.status === 401 || (d && d.motivo === "sessao_invalida")){ sair(true); throw new Error("401"); }
  return d;
}
async function apiPost(url, body){
  let r, d;
  try { r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(body || {}), token: getToken() }) }); d = await r.json().catch(() => ({})); }
  catch(e){ toast("Sem conexão. Tente de novo."); throw e; }
  if (r.status === 401 || (d && d.motivo === "sessao_invalida")){ sair(true); throw new Error("401"); }
  return d;
}

/* ---------- LOGIN / TROCA ---------- */
async function fazerLoginDono(){
  const email = $("in-email").value.trim().toLowerCase();
  const senha = $("in-senha").value;
  const err = $("login-err"); err.textContent = "";
  if (!email || !senha){ err.textContent = "Preencha e-mail e senha."; return; }
  let d;
  try { const r = await fetch(EP.login, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) }); d = await r.json().catch(() => ({})); }
  catch(e){ err.textContent = "Sem conexão. Tente de novo."; return; }
  if (!d.ok){ err.textContent = d.mensagem || "E-mail ou senha incorretos"; return; }
  localStorage.setItem(LS_TOKEN, d.token);
  localStorage.setItem(LS_NOME, d.nome || "");
  localStorage.setItem(LS_EMPRESA, d.empresa || "");
  $("in-senha").value = "";
  if (d.senha_provisoria){ go("s-trocar"); return; }
  entrar();
}
async function fazerTrocaDono(){
  const nova = $("in-nova").value.trim();
  const err = $("trocar-err"); err.textContent = "";
  if (nova.length < 6){ err.textContent = "Mínimo 6 caracteres."; return; }
  const d = await apiPost(EP.senha, { nova_senha: nova });
  if (!d.ok){ err.textContent = ({ senha_curta: "Mínimo 6 caracteres.", senha_trivial: "Escolha uma senha menos óbvia.", senha_igual_email: "A senha não pode ser o seu e-mail." })[d.motivo] || "Não foi possível salvar."; return; }
  $("in-nova").value = "";
  entrar();
}
function entrar(){
  $("dono-nome").textContent = localStorage.getItem(LS_NOME) || "";
  $("tb-empresa").textContent = localStorage.getItem(LS_EMPRESA) || "";
  go("s-home");
}
function sair(expirou){
  localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_NOME); localStorage.removeItem(LS_EMPRESA);
  go("s-login");
  if (expirou) toast("Sessão expirada — entre de novo.");
}

/* ---------- NAV ---------- */
function irHome(){ go("s-home"); }
function irFuncionarios(){ go("s-funcionarios"); carregarFuncionarios(); }

/* ---------- FUNCIONÁRIOS ---------- */
let FUNCS = [];
async function carregarFuncionarios(){
  $("func-loading").style.display = "block";
  $("func-lista").innerHTML = "";
  let d;
  try { d = await apiGet(EP.lista); } catch(e){ return; }
  $("func-loading").style.display = "none";
  if (!d.ok){ toast("Não foi possível carregar."); return; }
  FUNCS = d.funcionarios || [];
  renderFuncionarios();
}
function statusBadges(f){
  const st = f.ativo ? `<span class="badge b-ok">Ativo</span>` : `<span class="badge b-off">Inativo</span>`;
  const pr = (f.ativo && f.senha_provisoria) ? `<span class="badge b-prov">senha provisória</span>` : "";
  return st + pr;
}
function acoesHtml(f){
  const foto = `<button class="act" disabled title="Em breve (app)">Atualizar fotos</button>`;
  const reset = `<button class="act" onclick="resetarSenha('${f.id}')">Resetar senha</button>`;
  const toggle = f.ativo
    ? `<button class="act red" onclick="desativar('${f.id}')">Desativar</button>`
    : `<button class="act green" onclick="reativar('${f.id}')">Reativar</button>`;
  return `<div class="acoes">${f.ativo ? reset : ""}${toggle}${foto}</div>`;
}
function renderFuncionarios(){
  if (!FUNCS.length){ $("func-lista").innerHTML = `<p class="muted" style="padding:14px 4px">Nenhum funcionário ainda. Clique em <b>+ Cadastrar</b>.</p>`; return; }
  const rows = FUNCS.map(f => `
    <tr class="${f.ativo ? "" : "inativo"}">
      <td class="nome">${esc(f.nome)}</td>
      <td class="cpf">${mascaraCpf(f.cpf)}</td>
      <td>${(Number(f.carga_horaria_minutos) / 60).toLocaleString("pt-BR")}h</td>
      <td>${statusBadges(f)}</td>
      <td>${acoesHtml(f)}</td>
    </tr>`).join("");
  const cards = FUNCS.map(f => `
    <div class="fcard ${f.ativo ? "" : "inativo"}">
      <div class="r1"><div><div class="nome">${esc(f.nome)}</div>
        <div class="meta">${mascaraCpf(f.cpf)} · ${(Number(f.carga_horaria_minutos) / 60).toLocaleString("pt-BR")}h</div></div>
        <div>${statusBadges(f)}</div></div>
      ${acoesHtml(f)}
    </div>`).join("");
  $("func-lista").innerHTML =
    `<table class="tbl"><thead><tr><th>Nome</th><th>CPF</th><th>Carga</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>
     <div class="fcards">${cards}</div>`;
}

/* ---------- CADASTRO ---------- */
function abrirCadastro(){
  openModal(`
    <h3>Cadastrar funcionário</h3>
    <div class="field"><label>Nome</label><input id="c-nome" class="txt" placeholder="Nome completo"></div>
    <div class="field"><label>CPF</label><input id="c-cpf" class="txt" inputmode="numeric" placeholder="000.000.000-00" maxlength="14"></div>
    <div class="field"><label>Carga diária (horas)</label><input id="c-carga" class="txt" type="number" min="1" max="12" step="0.5" value="8"></div>
    <div class="err" id="c-err"></div>
    <p class="hint">A senha inicial será <b>123</b>. O funcionário troca no primeiro acesso.</p>
    <div class="modal-acts"><button class="btn ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" id="c-salvar" onclick="salvarFuncionario()">Cadastrar</button></div>`);
  const cpf = $("c-cpf");
  cpf.addEventListener("input", () => { cpf.value = mascaraCpf(cpf.value); });
  setTimeout(() => $("c-nome").focus(), 50);
}
async function salvarFuncionario(){
  const nome = $("c-nome").value.trim();
  const cpf = soDig($("c-cpf").value);
  const horas = parseFloat($("c-carga").value);
  const err = $("c-err"); err.textContent = "";
  if (!nome){ err.textContent = "Informe o nome."; return; }
  if (!cpfValido(cpf)){ err.textContent = "CPF inválido — confira os números."; return; }
  const carga = (horas > 0 && horas <= 24) ? Math.round(horas * 60) : 480;
  $("c-salvar").disabled = true;
  const d = await apiPost(EP.criar, { nome, cpf, carga_horaria_minutos: carga });
  $("c-salvar").disabled = false;
  if (d.ok){ closeModal(); toast("Funcionário cadastrado."); carregarFuncionarios(); return; }
  if (d.motivo === "cpf_existe"){ err.textContent = "Já há um funcionário com esse CPF."; return; }
  if (d.motivo === "cpf_inativo"){
    closeModal();
    const ok = await confirmar({ titulo: "CPF já cadastrado", texto: `Este CPF já foi funcionário (<b>${esc(d.nome)}</b>), mas está inativo. Deseja reativar?`, ok: "Reativar", cor: "green" });
    if (ok){ const r = await apiPost(EP.reativar, { profissional_id: d.profissional_id }); if (r.ok){ toast("Funcionário reativado."); carregarFuncionarios(); } }
    return;
  }
  err.textContent = d.mensagem || "Não foi possível cadastrar.";
}

/* ---------- AÇÕES (com confirmação) ---------- */
function confirmar({ titulo, texto, ok = "Confirmar", cor = "" }){
  return new Promise(res => {
    openModal(`<h3>${titulo}</h3><p>${texto}</p>
      <div class="modal-acts"><button class="btn ghost" id="m-cancel">Cancelar</button>
        <button class="btn ${cor}" id="m-ok">${esc(ok)}</button></div>`);
    $("m-cancel").onclick = () => { closeModal(); res(false); };
    $("m-ok").onclick = () => { closeModal(); res(true); };
  });
}
const nomeDe = id => { const f = FUNCS.find(x => x.id === id); return f ? f.nome : "este funcionário"; };
async function desativar(id){
  const nome = nomeDe(id);
  if (!await confirmar({ titulo: "Desativar funcionário", texto: `Desativar <b>${esc(nome)}</b>? Ele não conseguirá mais bater ponto.`, ok: "Desativar", cor: "red" })) return;
  const d = await apiPost(EP.desativar, { profissional_id: id });
  if (d.ok){ toast(`${nome} foi desativado.`); carregarFuncionarios(); } else toast("Não foi possível desativar.");
}
async function reativar(id){
  const nome = nomeDe(id);
  if (!await confirmar({ titulo: "Reativar funcionário", texto: `Reativar <b>${esc(nome)}</b>? Ele volta a bater ponto com a senha atual.`, ok: "Reativar", cor: "green" })) return;
  const d = await apiPost(EP.reativar, { profissional_id: id });
  if (d.ok){ toast(`${nome} foi reativado.`); carregarFuncionarios(); } else toast("Não foi possível reativar.");
}
async function resetarSenha(id){
  const nome = nomeDe(id);
  if (!await confirmar({ titulo: "Resetar senha", texto: `Resetar a senha de <b>${esc(nome)}</b>? A senha volta a ser <b>123</b> e ele deverá criar uma nova no próximo login. A sessão atual dele cai na hora.`, ok: "Resetar senha", cor: "amber" })) return;
  const d = await apiPost(EP.reset, { profissional_id: id });
  if (d.ok){ toast(`Senha de ${nome} resetada para 123.`); carregarFuncionarios(); } else toast("Não foi possível resetar.");
}

/* ---------- VISÃO DO DIA ---------- */
let DIA = null;
const STATUS = { trabalhando: "trabalhando agora", em_pausa: "em pausa", ja_saiu: "já saiu" };
const STCLS = { trabalhando: "det-ok", em_pausa: "det-pausa", ja_saiu: "det-saiu" };
function minToH(m){ m = Math.max(0, Math.round(m)); const h = Math.floor(m/60), mm = m%60; if (h && mm) return h+"h"+String(mm).padStart(2,"0"); if (h) return h+"h"; return mm+"min"; }
function fmtData(s){ try { return new Date(s+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"}); } catch(e){ return s; } }

function irDia(){ go("s-dia"); carregarDia(); }
async function carregarDia(){
  $("dia-loading").style.display = "block";
  let d; try { d = await apiGet(EP.dia); } catch(e){ return; }
  $("dia-loading").style.display = "none";
  if (!d.ok){ toast("Não foi possível carregar o dia."); return; }
  DIA = d; renderDia();
}
function tile(cls,k,n,sub){ return `<div class="dtile dt-${cls}"><div class="k">${k}</div><div class="n">${n}</div><div class="sub">${sub||""}</div></div>`; }
function tileNeutro(k,sub){ return `<div class="dtile dt-neutro"><div class="k">${k}</div><div class="n">—</div><div class="sub">${sub||""}</div></div>`; }
function tileConfig(){ return `<div class="dtile dt-neutro"><div class="k">Atrasados</div><div class="n">—</div><button class="cfg" onclick="abrirConfigDia()">Configurar horário</button></div>`; }
function secao(titulo,cor,linhas){ return `<div class="dia-sec"><h3><span class="dot" style="background:${cor}"></span>${titulo} <span class="muted" style="font-weight:600">(${linhas.length})</span></h3>${linhas.join("")}</div>`; }
function row(nome,det,cls){ return `<div class="dia-row"><span class="nm">${esc(nome)}</span><span class="det ${cls||""}">${det}</span></div>`; }
function renderDia(){
  const d = DIA, t = d.tiles, L = d.listas;
  $("dia-data").textContent = fmtData(d.data);
  const desc = $("dia-descanso");
  if (!d.dia_util){ desc.style.display = "flex"; desc.innerHTML = "🌴 Hoje é dia de <b>descanso</b> — sem expediente. Ninguém falta hoje."; }
  else desc.style.display = "none";
  const totalAtivos = (t.presentes||0) + (t.ausentes||0);
  const sumExtra = (L.em_extra||[]).reduce((s,x)=>s+(x.extra_min||0),0);
  const sumAtraso = (L.atrasados||[]).reduce((s,x)=>s+(x.atraso_min||0),0);
  const ts = [];
  ts.push(tile("presentes","Presentes", t.presentes, totalAtivos ? `de ${totalAtivos} ativos` : ""));
  if (t.ausentes === null) ts.push(tileNeutro("Ausentes","Descanso"));
  else ts.push(tile("ausentes","Ausentes", t.ausentes, t.ausentes ? "precisam de atenção" : "todos vieram"));
  if (t.atrasados === null) ts.push(d.dia_util ? tileConfig() : tileNeutro("Atrasados","Descanso"));
  else ts.push(tile("atrasados","Atrasados", t.atrasados, t.atrasados ? `+${minToH(sumAtraso)} de atraso` : "ninguém atrasado"));
  ts.push(tile("extra","Em extra", t.em_extra, sumExtra ? `+${minToH(sumExtra)} hoje` : ""));
  $("dia-tiles").innerHTML = ts.join("");
  // seções: problema primeiro (ausentes → atrasados → em extra → presentes)
  const sec = [];
  if (d.dia_util && (L.ausentes||[]).length) sec.push(secao("Ausentes","var(--red)", L.ausentes.map(x=>row(x.nome,"não compareceu","det-ausente"))));
  if ((L.atrasados||[]).length) sec.push(secao("Atrasados","var(--amber)", L.atrasados.map(x=>row(x.nome,`${x.entrada} · +${minToH(x.atraso_min)} atrasado`,"det-atraso"))));
  if ((L.em_extra||[]).length) sec.push(secao("Em extra","var(--orange)", L.em_extra.map(x=>row(x.nome,`+${minToH(x.extra_min)}`,"det-extra"))));
  if ((L.presentes||[]).length) sec.push(secao("Presentes","var(--green)", L.presentes.map(x=>row(x.nome, `${STATUS[x.status]||x.status} · desde ${x.desde}`, STCLS[x.status]||""))));
  $("dia-secoes").innerHTML = sec.join("") || `<div class="dia-vazio">Nenhum registro hoje.</div>`;
}
function abrirConfigDia(){
  openModal(`
    <h3>Horário de entrada</h3>
    <p>Defina o horário esperado e a tolerância. A partir disso, quem entrar depois aparece em <b>Atrasados</b>.</p>
    <div class="field"><label>Entrada prevista</label><input id="cf-ep" class="txt" type="time" value="08:00"></div>
    <div class="field"><label>Tolerância (minutos)</label><input id="cf-tol" class="txt" type="number" min="0" max="60" value="10"></div>
    <div class="err" id="cf-err"></div>
    <div class="modal-acts"><button class="btn ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" id="cf-salvar" onclick="salvarConfigDia()">Salvar</button></div>`);
}
async function salvarConfigDia(){
  const ep = $("cf-ep").value; const tol = parseInt($("cf-tol").value,10);
  const err = $("cf-err"); err.textContent = "";
  if (!/^\d{2}:\d{2}$/.test(ep)){ err.textContent = "Informe o horário de entrada."; return; }
  $("cf-salvar").disabled = true;
  const d = await apiPost(EP.config, { entrada_prevista: ep, tolerancia_minutos: (tol>=0 && tol<=180) ? tol : 10 });
  $("cf-salvar").disabled = false;
  if (d.ok){ closeModal(); toast("Horário salvo."); carregarDia(); }
  else err.textContent = "Não foi possível salvar.";
}

/* ---------- LOCAIS ---------- */
let LOCAIS = [], LF = null, MAP = null, CIRCLE = null;
function formatRaio(m){ m = Math.round(m); return m < 1000 ? `${m} m` : `${(m/1000).toLocaleString("pt-BR",{maximumFractionDigits:1})} km`; }
const fraseRecusa = nome => `Você está fora da área de trabalho. Registre na ${nome || "{nome}"}. Aproxime-se do local para registrar o ponto.`;

function irLocais(){ go("s-locais"); carregarLocais(); }
function voltarLocais(){ go("s-locais"); carregarLocais(); }
async function carregarLocais(){
  $("loc-loading").style.display = "block"; $("loc-lista").innerHTML = "";
  let d; try { d = await apiGet(EP.locais); } catch(e){ return; }
  $("loc-loading").style.display = "none";
  if (!d.ok){ toast("Não foi possível carregar."); return; }
  LOCAIS = d.locais || []; renderLocais();
}
function renderLocais(){
  if (!LOCAIS.length){ $("loc-lista").innerHTML = `<p class="muted" style="padding:14px 4px">Nenhum local ainda. Clique em <b>+ Novo local</b> pra cadastrar onde o funcionário bate ponto.</p>`; return; }
  $("loc-lista").innerHTML = LOCAIS.map(l => {
    const modo = l.modo_geofence === "travar"
      ? `<span class="loc-badge lb-travar">Travar</span>`
      : `<span class="loc-badge lb-avisar">Avisar</span>`;
    const st = l.ativo ? "" : `<span class="loc-badge lb-avisar" style="background:var(--bg-off);color:var(--tx-off)">Inativo</span>`;
    const acoes = `<button class="act" onclick="abrirLocalForm('${l.id}')">Editar</button>` +
      (l.ativo ? `<button class="act red" onclick="desativarLocal('${l.id}')">Desativar</button>`
               : `<button class="act green" onclick="reativarLocal('${l.id}')">Reativar</button>`);
    return `<div class="loc-card ${l.ativo?"":"inativo"}">
      <div class="r1"><div><div class="nm">${esc(l.nome)}</div>
        <div class="meta">Raio ${formatRaio(l.raio_metros)} · ${Number(l.latitude).toFixed(5)}, ${Number(l.longitude).toFixed(5)}</div></div>
        <div style="display:flex;gap:6px">${modo}${st}</div></div>
      <div class="acoes">${acoes}</div></div>`;
  }).join("");
}

function abrirLocalForm(id){
  const l = id ? LOCAIS.find(x => x.id === id) : null;
  const base = LOCAIS.find(x => x.latitude != null); // centro padrão: um local existente
  LF = l ? { id:l.id, lat:+l.latitude, lon:+l.longitude, raio:+l.raio_metros, modo:l.modo_geofence }
         : { id:null, lat: base ? +base.latitude : -23.55, lon: base ? +base.longitude : -46.633, raio:200, modo:"avisar" };
  $("lf-titulo").textContent = l ? "Editar local" : "Novo local";
  $("lf-nome").value = l ? l.nome : "";
  $("lf-raio").value = LF.raio; $("lf-raio-txt").textContent = formatRaio(LF.raio);
  setModo(LF.modo); $("lf-err").textContent = "";
  go("s-local-form");
  setTimeout(initMap, 60);
}
function initMap(){
  if (typeof L === "undefined"){ toast("Mapa não carregou (sem internet?)."); return; }
  if (!MAP){
    MAP = L.map("map", { zoomControl:true });
    const ruas = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom:19, attribution:"© OpenStreetMap" });
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom:19, attribution:"Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics" });
    sat.addTo(MAP); // default: satélite (o dono reconhece o telhado da loja)
    L.control.layers({ "Satélite": sat, "Mapa": ruas }, null, { position:"topright", collapsed:false }).addTo(MAP);
    CIRCLE = L.circle([0,0], { radius:200, color:"#FF7A3C", fillColor:"#FF7A3C", fillOpacity:.14, weight:3 }).addTo(MAP);
    // modelo pino-central: o local é SEMPRE o centro do mapa; arrastar o mapa reposiciona.
    MAP.on("move", () => { if (CIRCLE) CIRCLE.setLatLng(MAP.getCenter()); });
    MAP.on("moveend", () => { if (!LF) return; const c = MAP.getCenter(); LF.lat = c.lat; LF.lon = c.lng; });
    // garante que os tiles carreguem assim que o container ganha tamanho real (evita mapa cinza)
    if (window.ResizeObserver) new ResizeObserver(() => MAP && MAP.invalidateSize()).observe(document.getElementById("map"));
  }
  MAP.setView([LF.lat, LF.lon], 16);
  if (CIRCLE){ CIRCLE.setLatLng([LF.lat, LF.lon]); CIRCLE.setRadius(LF.raio); }
  setTimeout(() => MAP.invalidateSize(), 80);
  setTimeout(() => MAP.invalidateSize(), 260);
}
function setPino(lat, lon, zoom){
  LF.lat = lat; LF.lon = lon;
  if (MAP) MAP.setView([lat, lon], zoom || MAP.getZoom()); // dispara move/moveend → centra círculo e grava LF
  if (CIRCLE) CIRCLE.setLatLng([lat, lon]);
}
function atualizarRaio(){
  LF.raio = parseInt($("lf-raio").value, 10);
  $("lf-raio-txt").textContent = formatRaio(LF.raio);
  if (CIRCLE) CIRCLE.setRadius(LF.raio);
}
function setModo(m){
  LF.modo = (m === "travar") ? "travar" : "avisar";
  $("lf-avisar").classList.toggle("on", LF.modo === "avisar");
  $("lf-travar").classList.toggle("on", LF.modo === "travar");
  atualizarPreview();
}
function atualizarPreview(){
  const nome = $("lf-nome").value.trim();
  const box = $("lf-modo-info");
  if (LF && LF.modo === "travar")
    box.innerHTML = `<b>Travar:</b> fora do raio, o funcionário <b>não bate ponto</b>. Ele verá:<div class="frase">"${esc(fraseRecusa(nome))}"</div>`;
  else
    box.innerHTML = `<b>Avisar:</b> registra mesmo fora do raio e <b>marca pra sua revisão</b> (não bloqueia no campo).`;
}
function usarMinhaLocalizacao(){
  if (!navigator.geolocation){ toast("Sem GPS no navegador."); return; }
  toast("Buscando sua localização…");
  navigator.geolocation.getCurrentPosition(p => {
    setPino(p.coords.latitude, p.coords.longitude, 17);
  }, () => toast("Não consegui pegar o GPS."), { enableHighAccuracy:true, timeout:12000 });
}
function abrirColarCoord(){
  const lat0 = (LF && LF.lat != null) ? (+LF.lat).toFixed(6) : "";
  const lon0 = (LF && LF.lon != null) ? (+LF.lon).toFixed(6) : "";
  openModal(`<h3>Colar coordenadas</h3><p>São as coordenadas do pino agora. Cole outras (do Google Maps, por ex.) pra mover.</p>
    <div class="field"><label>Latitude</label><input id="cc-lat" class="txt" inputmode="decimal" value="${lat0}" placeholder="-12.669259"></div>
    <div class="field"><label>Longitude</label><input id="cc-lon" class="txt" inputmode="decimal" value="${lon0}" placeholder="-38.543518"></div>
    <div class="err" id="cc-err"></div>
    <div class="modal-acts"><button class="btn ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="aplicarCoord()">Aplicar</button></div>`);
}
function aplicarCoord(){
  const lat = parseFloat(($("cc-lat").value||"").replace(",", ".")), lon = parseFloat(($("cc-lon").value||"").replace(",", "."));
  if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)){ $("cc-err").textContent = "Digite latitude e longitude válidas."; return; }
  closeModal();
  setPino(lat, lon, 17);
}
async function salvarLocal(){
  const nome = $("lf-nome").value.trim();
  const err = $("lf-err"); err.textContent = "";
  if (!nome){ err.textContent = "Dê um nome ao local."; return; }
  if (LF.lat == null || LF.lon == null){ err.textContent = "Posicione o pino no mapa."; return; }
  $("lf-salvar").disabled = true;
  const d = await apiPost(EP.localSalvar, { id: LF.id || undefined, nome, latitude: LF.lat, longitude: LF.lon, raio_metros: LF.raio, modo_geofence: LF.modo });
  $("lf-salvar").disabled = false;
  if (d.ok){ toast(LF.id ? "Local atualizado." : "Local cadastrado."); voltarLocais(); }
  else err.textContent = d.motivo === "coord" ? "Posicione o pino no mapa." : "Não foi possível salvar.";
}
const nomeLocal = id => { const l = LOCAIS.find(x => x.id === id); return l ? l.nome : "este local"; };
async function desativarLocal(id){
  if (!await confirmar({ titulo:"Desativar local", texto:`Desativar <b>${esc(nomeLocal(id))}</b>? Ele deixa de valer no controle de ponto (a cerca some).`, ok:"Desativar", cor:"red" })) return;
  const d = await apiPost(EP.localOff, { id }); if (d.ok){ toast("Local desativado."); carregarLocais(); } else toast("Não foi possível.");
}
async function reativarLocal(id){
  if (!await confirmar({ titulo:"Reativar local", texto:`Reativar <b>${esc(nomeLocal(id))}</b>? Ele volta a valer no controle de ponto.`, ok:"Reativar", cor:"green" })) return;
  const d = await apiPost(EP.localOn, { id }); if (d.ok){ toast("Local reativado."); carregarLocais(); } else toast("Não foi possível.");
}

/* ---------- Enter nos campos ---------- */
["in-email","in-senha"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter") fazerLoginDono(); }));
$("in-nova").addEventListener("keydown", e => { if (e.key === "Enter") fazerTrocaDono(); });

/* ---------- INIT ---------- */
if (getToken()) entrar(); else go("s-login");

/* ---------- modo demo local (SÓ localhost — nunca em produção) — p/ screenshots/revisão ---------- */
(function(){
  if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  const scr = new URLSearchParams(location.search).get("_demo");
  if (!scr) return;
  const mock = [
    { id:"1", nome:"Maria Silva", cpf:"39053344705", carga_horaria_minutos:480, senha_provisoria:false, ativo:true },
    { id:"2", nome:"João Pereira", cpf:"11144477735", carga_horaria_minutos:360, senha_provisoria:true, ativo:true },
    { id:"3", nome:"Ana Souza", cpf:"52998224725", carga_horaria_minutos:480, senha_provisoria:false, ativo:false },
  ];
  $("dono-nome").textContent = "Luiz Antônio"; $("tb-empresa").textContent = "Makro Boutique";
  if (scr === "home"){ go("s-home"); return; }
  if (scr.indexOf("dia") === 0){
    DIA = { ok:true, data:"2026-07-27", dia_util:true, atraso_configurado:true,
      tiles:{ presentes:3, ausentes:1, atrasados:1, em_extra:2 },
      listas:{
        presentes:[{nome:"Maria Silva",desde:"08:05",status:"trabalhando"},{nome:"João Pereira",desde:"08:20",status:"em_pausa"},{nome:"Ana Souza",desde:"06:00",status:"ja_saiu"}],
        ausentes:[{nome:"Carlos Lima"}],
        atrasados:[{nome:"João Pereira",entrada:"08:20",atraso_min:10}],
        em_extra:[{nome:"Maria Silva",extra_min:332},{nome:"Ana Souza",extra_min:60}] } };
    if (scr === "dia_sem"){ DIA.atraso_configurado=false; DIA.tiles.atrasados=null; DIA.listas.atrasados=[]; }
    if (scr === "dia_descanso"){ DIA.dia_util=false; DIA.tiles.ausentes=null; DIA.tiles.atrasados=null; DIA.listas.ausentes=[]; DIA.listas.atrasados=[]; }
    go("s-dia"); $("dia-loading").style.display="none"; renderDia(); return;
  }
  if (scr === "locais"){
    LOCAIS = [
      { id:"1", nome:"Makro Boutique", latitude:-12.669259, longitude:-38.543518, raio_metros:80, modo_geofence:"avisar", ativo:true },
      { id:"2", nome:"Obra Norte", latitude:-12.6912, longitude:-38.3184, raio_metros:250, modo_geofence:"travar", ativo:true },
      { id:"3", nome:"Depósito Velho", latitude:-12.70, longitude:-38.50, raio_metros:150, modo_geofence:"avisar", ativo:false },
    ];
    go("s-locais"); $("loc-loading").style.display="none"; renderLocais(); return;
  }
  if (scr === "local"){
    LOCAIS = [{ id:"2", nome:"Makro Boutique", latitude:-12.669259, longitude:-38.543518, raio_metros:200, modo_geofence:"travar", ativo:true }];
    abrirLocalForm("2"); return;
  }
  FUNCS = mock; go("s-funcionarios"); $("func-loading").style.display = "none"; renderFuncionarios();
  if (scr === "confirm") confirmar({ titulo:"Desativar funcionário", texto:"Desativar <b>Maria Silva</b>? Ela não conseguirá mais bater ponto.", ok:"Desativar", cor:"red" });
})();
