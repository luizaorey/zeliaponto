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
  const logged = (id === "s-home" || id === "s-funcionarios");
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
  FUNCS = mock; go("s-funcionarios"); $("func-loading").style.display = "none"; renderFuncionarios();
  if (scr === "confirm") confirmar({ titulo:"Desativar funcionário", texto:"Desativar <b>Maria Silva</b>? Ela não conseguirá mais bater ponto.", ok:"Desativar", cor:"red" });
})();
