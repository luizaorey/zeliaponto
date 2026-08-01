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
  dia: WB + "/zelia-painel-dia", config: WB + "/zelia-config-salvar", configLer: WB + "/zelia-config-ler",
  locais: WB + "/zelia-locais", localSalvar: WB + "/zelia-local-salvar",
  localOff: WB + "/zelia-local-desativar", localOn: WB + "/zelia-local-reativar",
  aprovacoes: WB + "/zelia-aprovacoes-lista", decidir: WB + "/zelia-aprovacao-decidir",
  relatorio: WB + "/zelia-relatorio-mes", fechamentos: WB + "/zelia-fechamentos-lista",
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
  const logged = (id === "s-home" || id === "s-funcionarios" || id === "s-dia" || id === "s-locais" || id === "s-local-form" || id === "s-aprovacoes" || id === "s-relatorios" || id === "s-config");
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
  atualizarBadgeAprovacoes();
}
function sair(expirou){
  localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_NOME); localStorage.removeItem(LS_EMPRESA);
  go("s-login");
  if (expirou) toast("Sessão expirada — entre de novo.");
}

/* ---------- NAV ---------- */
function irHome(){ go("s-home"); atualizarBadgeAprovacoes(); }
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
    <div class="field"><label>WhatsApp <span class="muted">(pra Zélia falar com ele)</span></label>${phoneFieldHTML('c-wa','')}</div>
    <div class="field"><label>Data de admissão</label><input id="c-adm" class="txt" type="date"></div>
    <div class="field"><label>Carga diária (horas)</label><input id="c-carga" class="txt" type="number" min="1" max="12" step="0.5" value="8"></div>
    <details class="opt-block">
      <summary>Mais dados <span class="muted">(opcional — a Zélia usa se você preencher)</span></summary>
      <div class="field"><label>Cargo / função</label><input id="c-cargo" class="txt" maxlength="40" placeholder="Ex.: Vendedor(a)"></div>
      <div class="field"><label>Tipo de contrato</label><select id="c-contrato" class="txt">
        <option value="">—</option><option value="clt">CLT</option><option value="experiencia">Contrato de experiência</option><option value="jovem_aprendiz">Jovem aprendiz</option></select></div>
      <div class="field"><label>Data de nascimento</label><input id="c-nasc" class="txt" type="date"></div>
    </details>
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
  const vwa = phoneValido('c-wa');
  if (!vwa.ok){ err.textContent = vwa.msg; return; }
  if (vwa.empty){ err.textContent = "Informe o WhatsApp do funcionário."; return; }
  const whatsapp = vwa.canonical;
  const data_admissao = $("c-adm").value;
  if (!data_admissao){ err.textContent = "Informe a data de admissão."; return; }
  const cargo = $("c-cargo") ? $("c-cargo").value.trim() : "";
  const tipo_contrato = $("c-contrato") ? $("c-contrato").value : "";
  const data_nascimento = $("c-nasc") ? $("c-nasc").value : "";
  const carga = (horas > 0 && horas <= 24) ? Math.round(horas * 60) : 480;
  $("c-salvar").disabled = true;
  const d = await apiPost(EP.criar, { nome, cpf, carga_horaria_minutos: carga, whatsapp, data_admissao, cargo, tipo_contrato, data_nascimento });
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

/* ---------- APROVAÇÕES ---------- */
let APROVS = [];
const AP_TIPO = { entrada:"Entrada", pausa:"Pausa", retorno:"Retorno", saida:"Saída" };
function irAprovacoes(){ go("s-aprovacoes"); carregarAprovacoes(); }
function setBadge(n){
  const b = $("aprov-badge"); if (!b) return;
  if (n > 0){ b.textContent = n > 99 ? "99+" : n; b.style.display = ""; } else b.style.display = "none";
}
async function atualizarBadgeAprovacoes(){
  try { const d = await apiGet(EP.aprovacoes); setBadge((d.pendencias || []).length); } catch(e){}
}
async function carregarAprovacoes(){
  $("aprov-loading").style.display = "block"; $("aprov-lista").innerHTML = "";
  let d; try { d = await apiGet(EP.aprovacoes); } catch(e){ return; }
  $("aprov-loading").style.display = "none";
  if (!d.ok){ toast("Não foi possível carregar."); return; }
  APROVS = d.pendencias || []; renderAprovacoes(); setBadge(APROVS.length);
}
function apMotivo(p){
  if (p.motivo === "relogio") return { txt:"Relógio do aparelho suspeito", cls:"mot-relogio" };
  if (p.motivo === "sem_gps") return { txt:"Sem localização (GPS desligado)", cls:"mot-sem_gps" };
  if (p.motivo === "fora_raio") return { txt:`Fora do raio · ${p.distancia_metros != null ? formatRaio(p.distancia_metros) : "?"}`, cls:"mot-fora_raio" };
  return { txt:"Precisa de conferência", cls:"mot-fora_raio" };
}
function renderAprovacoes(){
  if (!APROVS.length){ $("aprov-lista").innerHTML = `<div class="vazio-ap"><div class="emoji">🎉</div><p><b>Nenhuma pendência.</b><br><span class="muted">Tudo em dia — as batidas estão dentro das regras.</span></p></div>`; return; }
  $("aprov-lista").innerHTML = APROVS.map((p, i) => {
    const m = apMotivo(p);
    const foto = p.foto_url
      ? `<img class="ap-foto" src="${esc(p.foto_url)}" alt="selfie de ${esc(p.funcionario||"")}" onclick="verFoto(${i})" onerror="fotoFalhou(this)">`
      : `<div class="ap-foto semfoto"></div>`;
    return `<div class="ap-card">
      ${foto}
      <div class="ap-info">
        <div class="ap-nome">${esc(p.funcionario || "—")}</div>
        <div class="ap-meta"><span class="ap-tipo">${AP_TIPO[p.tipo] || esc(p.tipo)}</span> · ${esc(p.hora || "")}</div>
        <span class="ap-motivo ${m.cls}">${esc(m.txt)}</span>
      </div>
      <div class="ap-acoes">
        <button class="btn small green" onclick="decidir('${p.id}','aprovar',${i})">Aprovar</button>
        <button class="btn small red" onclick="decidir('${p.id}','recusar',${i})">Recusar</button>
      </div>
    </div>`;
  }).join("");
}
function fotoFalhou(img){ img.outerHTML = '<div class="ap-foto semfoto"></div>'; } // 0 byte/quebrada → placeholder limpo
function verFoto(i){
  const p = APROVS[i]; if (!p || !p.foto_url) return;
  openModal(`<div class="foto-modal"><img src="${esc(p.foto_url)}" alt="selfie"><div class="fm-cap"><b>${esc(p.funcionario||"")}</b> · ${esc(AP_TIPO[p.tipo]||p.tipo)} · ${esc(p.hora||"")}</div><div class="modal-acts"><button class="btn ghost" onclick="closeModal()">Fechar</button></div></div>`);
}
async function decidir(id, decisao, i){
  const p = APROVS[i] || {};
  const aprovar = decisao === "aprovar";
  const ok = await confirmar({
    titulo: aprovar ? "Aprovar batida" : "Recusar batida",
    texto: `${aprovar ? "Aprovar" : "Recusar"} a ${(AP_TIPO[p.tipo] || p.tipo || "batida").toLowerCase()} de <b>${esc(p.funcionario || "funcionário")}</b>?`,
    ok: aprovar ? "Aprovar" : "Recusar", cor: aprovar ? "green" : "red" });
  if (!ok) return;
  const d = await apiPost(EP.decidir, { registro_id: id, decisao });
  if (d.ok){ toast(aprovar ? "Batida aprovada." : "Batida recusada."); APROVS.splice(i, 1); renderAprovacoes(); setBadge(APROVS.length); }
  else toast("Não foi possível.");
}

/* ---------- RELATÓRIOS ---------- */
let REL = null, RELMES = null;
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const DOW = ["dom","seg","ter","qua","qui","sex","sáb"];
function mesAtual(){ const p = new Intl.DateTimeFormat("en-CA",{ timeZone:"America/Bahia", year:"numeric", month:"2-digit" }).formatToParts(new Date()).reduce((o,x)=>(o[x.type]=x.value,o),{}); return `${p.year}-${p.month}`; }
function mesLabel(m){ const [y,mm] = m.split("-").map(Number); const n = MESES[mm-1]; return `${n[0].toUpperCase()+n.slice(1)} ${y}`; }
function hMin(m){ if (m == null) return "—"; const neg = m < 0; m = Math.abs(Math.round(m)); return (neg?"−":"") + Math.floor(m/60) + "h" + String(m%60).padStart(2,"0"); }
function hSaldo(m){ if (m == null) return "—"; m = Math.round(m); if (m === 0) return "0h00"; const s = m>0?"+":"−"; m = Math.abs(m); return s + Math.floor(m/60) + "h" + String(m%60).padStart(2,"0"); }
function irRelatorios(){ RELMES = mesAtual(); go("s-relatorios"); carregarRelatorio(); carregarFechamentos(); }
async function carregarFechamentos(){
  const box = $("rel-fechamentos"); if (!box) return; box.innerHTML = "";
  let d; try { d = await apiGet(EP.fechamentos); } catch(e){ return; }
  const fs = (d && d.ok && d.fechamentos) ? d.fechamentos : [];
  if (!fs.length){ box.innerHTML = ""; return; }
  const rows = fs.map(f => {
    const t = f.totais || {}, [Y,M] = f.mes.split("-").map(Number);
    const lbl = `${MESES[M-1][0].toUpperCase()+MESES[M-1].slice(1)} ${Y}`;
    const pdf = f.pdf_url ? `<a class="btn small ghost" href="${esc(f.pdf_url)}" target="_blank" rel="noopener">📄 PDF</a>` : "";
    const csv = f.csv_url ? `<a class="btn small ghost" href="${esc(f.csv_url)}" target="_blank" rel="noopener">📊 CSV</a>` : "";
    const sub = `${t.funcionarios||0} func. · ${hMin(t.trabalhado_min)} · saldo ${hSaldo(t.saldo_min)}`;
    return `<div class="fech-row"><div><div class="fech-mes">${lbl}</div><div class="fech-sub">${sub}</div></div><div class="fech-acts">${pdf}${csv}</div></div>`;
  }).join("");
  box.innerHTML = `<h3 class="fech-titulo">📁 Fechamentos gerados</h3><p class="rel-nota" style="margin:2px 4px 12px">Baixe o PDF ou a planilha de qualquer mês pra reenviar pro contador. Links renovados a cada acesso.</p>${rows}`;
}
function mudarMes(delta){
  let [y,m] = RELMES.split("-").map(Number); m += delta; if (m < 1){ m = 12; y--; } if (m > 12){ m = 1; y++; }
  const novo = `${y}-${String(m).padStart(2,"0")}`;
  if (novo > mesAtual()) return; // não navega pro futuro
  RELMES = novo; carregarRelatorio();
}
async function carregarRelatorio(){
  $("rel-mes-lbl").textContent = mesLabel(RELMES);
  $("rel-next").disabled = (RELMES >= mesAtual());
  $("rel-loading").style.display = "block"; $("rel-conteudo").innerHTML = "";
  const url = EP.relatorio + "?token=" + encodeURIComponent(getToken()) + "&mes=" + RELMES;
  let r, d; try { r = await fetch(url); d = await r.json().catch(() => ({})); } catch(e){ toast("Sem conexão. Tente de novo."); return; }
  if (r.status === 401 || (d && d.motivo === "sessao_invalida")){ sair(true); return; }
  $("rel-loading").style.display = "none";
  if (!d.ok){ toast("Não foi possível carregar."); return; }
  renderRelatorio(d);
}
function renderRelatorio(d){
  REL = d; const fs = d.funcionarios || [];
  $("rel-csv").disabled = !fs.length;
  if (!fs.length){ $("rel-conteudo").innerHTML = `<p class="muted" style="padding:16px 4px">Nenhum funcionário com dados neste mês.</p>`; return; }
  const t = d.totais || {}, ac = d.atraso_configurado;
  const cls = m => m>0?"pos":m<0?"neg":"";
  const rows = fs.map((f,i) => {
    const pend = f.pendencias>0 ? `<span class="rel-pend" title="${f.pendencias} batida(s) aguardando aprovação">⚠ ${f.pendencias}</span>` : `<span class="muted">—</span>`;
    const atr = ac ? (f.dias_atraso>0 ? `${f.dias_atraso}d · ${hMin(f.atraso_min)}` : `<span class="muted">—</span>`) : `<span class="muted">—</span>`;
    return `<tr onclick="verDetalheRel(${i})">
      <td class="rel-nome">${esc(f.nome)}${f.ativo?"":' <span class="rel-inativo">inativo</span>'}</td>
      <td class="num">${f.dias_trabalhados}</td>
      <td class="num">${hMin(f.trabalhado_min)}</td>
      <td class="num ${cls(f.saldo_min)}">${hSaldo(f.saldo_min)}</td>
      <td class="num ${f.faltas>0?'neg':''}">${f.faltas}</td>
      <td class="num">${atr}</td>
      <td class="num">${pend}</td></tr>`;
  }).join("");
  $("rel-conteudo").innerHTML = `
    <div class="rel-scroll"><table class="rel-tbl">
      <thead><tr><th>Funcionário</th><th class="num">Dias</th><th class="num">Trabalhado</th><th class="num">Saldo</th><th class="num">Faltas</th><th class="num">Atrasos</th><th class="num">Pend.</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total da empresa</td><td class="num">—</td><td class="num">${hMin(t.trabalhado_min)}</td><td class="num ${cls(t.saldo_min)}">${hSaldo(t.saldo_min)}</td><td class="num ${t.faltas>0?'neg':''}">${t.faltas}</td><td class="num">—</td><td class="num">${t.pendencias||0}</td></tr></tfoot>
    </table></div>
    <p class="rel-nota">Clique num funcionário pra ver o detalhe por dia. <b>Saldo</b> = trabalhado − carga. <b>Faltas</b> = dias úteis (seg–sex) sem batida. Batidas recusadas não entram no cálculo; pendentes contam e aparecem em ⚠.</p>`;
}
function verDetalheRel(i){
  const f = REL.funcionarios[i]; if (!f) return;
  const cls = m => m>0?"pos":m<0?"neg":"";
  const stLbl = { completo:"", falta:"falta", incompleto:"incompleto", em_andamento:"em andamento", fim_de_semana:"trabalhou no fim de semana" };
  const linhas = (f.dias||[]).slice().reverse().map(dd => {
    const rc = dd.status==="falta" ? "d-falta" : (dd.status==="completo" ? "" : "d-inc");
    const [ , M, D] = dd.data.split("-");
    const st = stLbl[dd.status] != null ? stLbl[dd.status] : dd.status;
    const ultima = dd.atraso_min ? `<span class="neg">atraso ${hMin(dd.atraso_min)}</span>` : (st ? `<span class="muted">${st}</span>` : "—");
    return `<tr class="${rc}">
      <td>${D}/${M} <span class="muted">${DOW[dd.dow]}</span></td>
      <td>${dd.entrada||"—"}</td><td>${dd.saida||"—"}</td>
      <td class="num">${hMin(dd.trabalhado_min)}</td>
      <td class="num ${cls(dd.saldo_min)}">${hSaldo(dd.saldo_min)}</td>
      <td class="num">${ultima}</td></tr>`;
  }).join("");
  openModal(`<div class="rel-det"><h3>${esc(f.nome)}</h3>
    <div class="rel-det-sub">${mesLabel(REL.mes)} · ${f.dias_trabalhados} dias · ${hMin(f.trabalhado_min)} · saldo <b class="${cls(f.saldo_min)}">${hSaldo(f.saldo_min)}</b></div>
    <div class="rel-scroll"><table class="rel-tbl det"><thead><tr><th>Dia</th><th>Entrada</th><th>Saída</th><th class="num">Trab.</th><th class="num">Saldo</th><th>Atraso / situação</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <div class="modal-acts"><button class="btn ghost" onclick="closeModal()">Fechar</button></div></div>`);
}
function baixarCSV(){
  if (!REL || !REL.funcionarios || !REL.funcionarios.length) return;
  const head = ["Funcionário","Dias trabalhados","Trabalhado","Saldo","Faltas","Dias com atraso","Atraso total","Pendências"];
  const asc = s => String(s).replace(/−/g,"-");
  const rows = REL.funcionarios.map(f => [f.nome, f.dias_trabalhados, asc(hMin(f.trabalhado_min)), asc(hSaldo(f.saldo_min)), f.faltas, f.dias_atraso, asc(hMin(f.atraso_min)), f.pendencias]);
  const q = v => { v = String(v); return /[";\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const csv = [head, ...rows].map(r => r.map(q).join(";")).join("\r\n");
  const blob = new Blob(["﻿"+csv], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `zelia-relatorio-${REL.mes}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  toast("CSV baixado.");
}

/* ---------- CONFIGURAÇÕES ---------- */
let CFG = null;
function irConfig(){ go("s-config"); carregarConfig(); }
/* ---- Campo de telefone ESTRUTURADO: país (default +55) + número mascarado -> canônico 55DDDNUMERO ---- */
const PHONE_PAISES = [
  { c:"55",  f:"🇧🇷", n:"Brasil" },
  { c:"1",   f:"🇺🇸", n:"EUA/Canadá" },
  { c:"351", f:"🇵🇹", n:"Portugal" },
  { c:"54",  f:"🇦🇷", n:"Argentina" },
  { c:"598", f:"🇺🇾", n:"Uruguai" },
  { c:"595", f:"🇵🇾", n:"Paraguai" },
];
function phoneSplit(canon){ // separa canônico salvo em {pais, local}
  canon = String(canon||"").replace(/\D/g,"");
  const cods = PHONE_PAISES.map(p=>p.c).sort((a,b)=>b.length-a.length);
  for (const c of cods){ if (canon.startsWith(c) && canon.length > c.length) return { pais:c, local:canon.slice(c.length) }; }
  return { pais:"55", local:canon.replace(/^55/,"") };
}
function fmtWhats(w){ // máscara BR (71) 99212-3439
  w = String(w||"").replace(/\D/g,""); if (w.startsWith("55")) w = w.slice(2);
  w = w.slice(0,11); if (!w) return "";
  if (w.length <= 2) return "(" + w;
  const ddd = w.slice(0,2), rest = w.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  return `(${ddd}) ${rest.slice(0, rest.length-4)}-${rest.slice(-4)}`;
}
function phoneMask(pais, digits){ // máscara por país (BR mascarado, demais em grupos simples)
  digits = String(digits||"").replace(/\D/g,"");
  if (pais === "55") return fmtWhats(digits);
  return digits.slice(0,15);
}
function phoneFieldHTML(idp, canonical){
  const { pais, local } = phoneSplit(canonical);
  const opts = PHONE_PAISES.map(p => `<option value="${p.c}" ${p.c===pais?"selected":""}>${p.f} +${p.c}</option>`).join("");
  return `<div class="phone-row">
      <select class="txt ph-pais" id="${idp}-pais" onchange="phoneOnInput('${idp}')">${opts}</select>
      <input class="txt ph-num" id="${idp}-num" inputmode="tel" placeholder="(71) 99212-3439" value="${esc(phoneMask(pais, local))}" oninput="phoneOnInput('${idp}')">
    </div><div class="ph-warn" id="${idp}-warn"></div>`;
}
function phoneLocal(idp){ // dígitos locais (sem país), tratando colagem de +55
  const pais = $(`${idp}-pais`).value;
  let d = String($(`${idp}-num`).value||"").replace(/\D/g,"");
  if (pais === "55") d = d.replace(/^55/,"").slice(0,11);
  return { pais, local:d };
}
function phoneOnInput(idp){ // máscara ao vivo + aviso amigável + sync opcional em CFGc (contatos)
  const { pais, local } = phoneLocal(idp);
  $(`${idp}-num`).value = phoneMask(pais, local);
  const w = $(`${idp}-warn`); if (w){ w.textContent = (pais==="55" && local.length===10) ? "Confere se não faltou o 9 na frente 🤔" : ""; }
  const m = /^ct(\d+)$/.exec(idp); if (m && typeof CFGc !== "undefined" && CFGc[+m[1]]) CFGc[+m[1]].whatsapp = local ? pais+local : "";
}
function phoneCanonical(idp){ const { pais, local } = phoneLocal(idp); return local ? pais+local : ""; }
function phoneValido(idp){ // avisos amigáveis, trava só o que é claramente inválido
  const { pais, local } = phoneLocal(idp);
  if (!local) return { ok:true, empty:true };
  if (pais === "55" && (local.length < 10 || local.length > 11)) return { ok:false, msg:"WhatsApp inválido — DDD (2) + número (8 ou 9 dígitos)." };
  if (pais !== "55" && local.length < 6) return { ok:false, msg:"Número muito curto." };
  return { ok:true, canonical: pais+local };
}
let CFGc = [], JOR3 = null;
async function carregarConfig(){
  $("cfg-loading").style.display = "block"; $("cfg-form").style.display = "none"; $("cfg-err").textContent = "";
  let d; try { d = await apiGet(EP.configLer); } catch(e){ return; }
  if (!d.ok){ toast("Não foi possível carregar."); return; }
  CFG = d.config || {};
  CFGc = (CFG.contatos && CFG.contatos.length) ? CFG.contatos.map(c => ({ ...c })) : [{ nome:"Dono", whatsapp:CFG.whatsapp_dono||"", recebe:true, fala:true, dono:true }];
  if (!CFGc.some(c => c.dono)) CFGc[0].dono = true;
  renderContatos();
  JOR3 = jornadaToUI(CFG.jornada_semanal); renderJornada();
  $("cfg-fora").checked = CFG.alerta_fora_raio !== false;
  $("cfg-atraso").checked = CFG.alerta_atraso !== false;
  $("cfg-extra-sw").checked = CFG.alerta_extra !== false;
  $("cfg-resumo-sw").checked = CFG.resumo_diario !== false;
  $("cfg-fecham").checked = CFG.fechamento_mensal !== false;
  $("cfg-resumo").value = CFG.horario_resumo_diario || "18:30";
  $("cfg-tol").value = CFG.tolerancia_minutos != null ? CFG.tolerancia_minutos : 10;
  $("cfg-extra").value = (CFG.limite_extra_semanal_minutos != null ? CFG.limite_extra_semanal_minutos : 600) / 60;
  $("cfg-loading").style.display = "none"; $("cfg-form").style.display = "block";
}
/* ---- Contatos ---- */
function renderContatos(){
  const box = $("cfg-contatos");
  box.innerHTML = CFGc.map((c,i) => `
    <div class="ct-card">
      <div class="ct-top">
        <input class="txt ct-nome" value="${esc(c.nome||"")}" placeholder="Nome" maxlength="40" oninput="CFGc[${i}].nome=this.value">
        ${c.dono ? '<span class="ct-dono">dono</span>' : `<button class="ct-rm" type="button" onclick="removeContato(${i})" aria-label="Remover">✕</button>`}
      </div>
      ${phoneFieldHTML('ct'+i, c.whatsapp)}
      <div class="ct-sw">
        <label class="cfg-switch mini"><span>📬 Recebe</span><input type="checkbox" ${c.recebe?"checked":""} onchange="CFGc[${i}].recebe=this.checked"><i></i></label>
        <label class="cfg-switch mini"><span>💬 Fala</span><input type="checkbox" ${c.fala?"checked":""} onchange="CFGc[${i}].fala=this.checked"><i></i></label>
      </div>
    </div>`).join("");
  $("cfg-add-contato").style.display = CFGc.length >= 3 ? "none" : "";
}
function addContato(){ if (CFGc.length >= 3) return; CFGc.push({ nome:"", whatsapp:"", recebe:true, fala:false }); renderContatos(); }
function removeContato(i){ if (CFGc[i] && CFGc[i].dono) return; CFGc.splice(i,1); renderContatos(); }
/* ---- Jornada (3 grupos: úteis, sáb, dom) ---- */
function jornadaToUI(j){
  const g = d => { const x = (j && (j[d] || j[String(d)])) || {}; return { trabalha: !!x.trabalha, entrada: x.entrada || "", carga_h: x.carga_min != null ? (x.carga_min/60) : 8 }; };
  return { uteis: g(1), sab: g(6), dom: g(0) };
}
function jornadaFromUI(){
  const mk = g => ({ trabalha: !!g.trabalha, entrada: g.trabalha ? (g.entrada || null) : null, carga_min: g.trabalha ? Math.round((isNaN(parseFloat(g.carga_h)) ? 8 : parseFloat(g.carga_h)) * 60) : 0 });
  const j = {}; for (let d=1; d<=5; d++) j[d] = mk(JOR3.uteis); j[6] = mk(JOR3.sab); j[0] = mk(JOR3.dom); return j;
}
function renderJornada(){
  const row = (key,label) => { const g = JOR3[key]; return `
    <div class="jor-row">
      <label class="cfg-switch mini jor-tr"><span>${label}</span><input type="checkbox" ${g.trabalha?"checked":""} onchange="JOR3.${key}.trabalha=this.checked;renderJornada()"><i></i></label>
      ${g.trabalha ? `<div class="jor-inputs">
        <div class="field"><label>Entrada</label><input class="txt tw2" type="time" value="${g.entrada||""}" onchange="JOR3.${key}.entrada=this.value"></div>
        <div class="field"><label>Carga (h)</label><input class="txt tw2" type="number" min="0" max="16" step="0.5" value="${g.carga_h}" onchange="JOR3.${key}.carga_h=this.value"></div>
      </div>` : `<span class="jor-fechado">fechado</span>`}
    </div>`; };
  $("cfg-jornada").innerHTML = row("uteis","Dias úteis (seg–sex)") + row("sab","Sábado") + row("dom","Domingo");
}
async function salvarConfig(){
  const err = $("cfg-err"); err.textContent = "";
  const contatos = [];
  for (let i = 0; i < CFGc.length; i++){
    const c = CFGc[i];
    const v = phoneValido('ct'+i);
    if (!v.ok){ err.textContent = `WhatsApp de "${(c.nome||'contato').trim()}": ${v.msg}`; return; }
    const wa = v.canonical || "";
    const nome = (c.nome||"").trim();
    if (nome || wa) contatos.push({ nome, whatsapp: wa, recebe: !!c.recebe, fala: !!c.fala, dono: !!c.dono });
  }
  const dono = contatos.find(c => c.dono);
  if (!dono || !dono.whatsapp){ err.textContent = "O contato do dono precisa de um WhatsApp."; return; }
  const tol = parseInt($("cfg-tol").value, 10);
  const extraH = parseFloat($("cfg-extra").value);
  const payload = {
    contatos, whatsapp_dono: dono.whatsapp,
    jornada_semanal: jornadaFromUI(),
    entrada_prevista: JOR3.uteis.trabalha ? (JOR3.uteis.entrada || "") : "",
    horario_resumo_diario: $("cfg-resumo").value || "18:30",
    limite_extra_semanal_minutos: Math.round((isNaN(extraH) ? 10 : extraH) * 60),
    tolerancia_minutos: (tol >= 0 && tol <= 180) ? tol : 10,
    alerta_fora_raio: $("cfg-fora").checked,
    alerta_atraso: $("cfg-atraso").checked,
    alerta_extra: $("cfg-extra-sw").checked,
    resumo_diario: $("cfg-resumo-sw").checked,
    fechamento_mensal: $("cfg-fecham").checked,
  };
  $("cfg-salvar").disabled = true;
  let d; try { d = await apiPost(EP.config, payload); } finally { $("cfg-salvar").disabled = false; }
  if (d && d.ok){ toast("Configurações salvas."); irHome(); }
  else err.textContent = "Não foi possível salvar.";
}

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
  if (scr === "config"){
    go("s-config");
    CFGc = [{nome:"Dono Teste A",whatsapp:"5571992123439",recebe:true,fala:true,dono:true},{nome:"Gerente Ana",whatsapp:"5571988887777",recebe:true,fala:false}];
    renderContatos();
    JOR3 = { uteis:{trabalha:true,entrada:"08:00",carga_h:8}, sab:{trabalha:true,entrada:"08:30",carga_h:4.5}, dom:{trabalha:false,entrada:"",carga_h:8} }; renderJornada();
    $("cfg-fora").checked = true; $("cfg-atraso").checked = true; $("cfg-extra-sw").checked = true; $("cfg-resumo-sw").checked = true; $("cfg-fecham").checked = true;
    $("cfg-resumo").value = "18:30"; $("cfg-tol").value = 10; $("cfg-extra").value = 10;
    $("cfg-loading").style.display = "none"; $("cfg-form").style.display = "block"; return;
  }
  if (scr === "relatorio"){
    RELMES = "2026-07"; $("rel-mes-lbl").textContent = mesLabel(RELMES); $("rel-loading").style.display = "none"; $("rel-next").disabled = true;
    renderRelatorio({ ok:true, mes:"2026-07", atraso_configurado:true,
      funcionarios:[
        { id:"1", nome:"amalia mutti leite de almeida", ativo:true, dias_trabalhados:7, trabalhado_min:3364, saldo_min:-33, faltas:12, dias_atraso:1, atraso_min:35, pendencias:0,
          dias:[{data:"2026-07-01",dow:2,status:"completo",entrada:"08:00",saida:"17:00",trabalhado_min:480,saldo_min:0,atraso_min:null},
                {data:"2026-07-06",dow:0+1,status:"completo",entrada:"08:35",saida:"17:00",trabalhado_min:445,saldo_min:-35,atraso_min:35},
                {data:"2026-07-07",dow:2,status:"falta",entrada:null,saida:null,trabalhado_min:null,saldo_min:-480,atraso_min:null}] },
        { id:"2", nome:"luiz antonio santos pereira", ativo:true, dias_trabalhados:15, trabalhado_min:7350, saldo_min:150, faltas:1, dias_atraso:2, atraso_min:41, pendencias:2, dias:[] },
        { id:"3", nome:"Teste Multi A", ativo:false, dias_trabalhados:3, trabalhado_min:1080, saldo_min:0, faltas:0, dias_atraso:0, atraso_min:0, pendencias:0, dias:[] },
      ],
      totais:{ trabalhado_min:11794, saldo_min:117, faltas:13, pendencias:2 } });
    go("s-relatorios");
    $("rel-fechamentos").innerHTML = `<h3 class="fech-titulo">📁 Fechamentos gerados</h3><p class="rel-nota" style="margin:2px 4px 12px">Baixe o PDF ou a planilha de qualquer mês pra reenviar pro contador.</p>
      <div class="fech-row"><div><div class="fech-mes">Junho 2026</div><div class="fech-sub">8 func. · 512h30 · saldo +14h20</div></div><div class="fech-acts"><a class="btn small ghost" href="#">📄 PDF</a><a class="btn small ghost" href="#">📊 CSV</a></div></div>
      <div class="fech-row"><div><div class="fech-mes">Maio 2026</div><div class="fech-sub">8 func. · 498h00 · saldo −2h10</div></div><div class="fech-acts"><a class="btn small ghost" href="#">📄 PDF</a><a class="btn small ghost" href="#">📊 CSV</a></div></div>`;
    return;
  }
  if (scr.indexOf("aprov") === 0){
    const F = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23cfd8dc'/%3E%3Ccircle cx='32' cy='25' r='12' fill='%2390a4ae'/%3E%3Crect x='13' y='41' width='38' height='26' rx='13' fill='%2390a4ae'/%3E%3C/svg%3E";
    APROVS = (scr === "aprov_vazio") ? [] : [
      { id:"1", funcionario:"Maria Silva", tipo:"entrada", hora:"28/07 08:12", motivo:"fora_raio", distancia_metros:340, foto_url:F },
      { id:"2", funcionario:"João Pereira", tipo:"saida", hora:"27/07 18:03", motivo:"sem_gps", distancia_metros:null, foto_url:F },
      { id:"3", funcionario:"Ana Souza", tipo:"pausa", hora:"27/07 12:30", motivo:"relogio", distancia_metros:null, foto_url:null },
    ];
    go("s-aprovacoes"); $("aprov-loading").style.display = "none"; renderAprovacoes(); setBadge(APROVS.length); return;
  }
  FUNCS = mock; go("s-funcionarios"); $("func-loading").style.display = "none"; renderFuncionarios();
  if (scr === "confirm") confirmar({ titulo:"Desativar funcionário", texto:"Desativar <b>Maria Silva</b>? Ela não conseguirá mais bater ponto.", ok:"Desativar", cor:"red" });
})();
