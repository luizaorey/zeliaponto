/* ===================================================================
   Zélia Ponto — PWA. Fuso America/Bahia explícito. Backend: n8n (zelia-*).
   empresa_id vem sempre da sessão (Redis) — o app só manda o token.
   =================================================================== */
const WEBHOOK_BASE = "https://giantfalcon-n8n.cloudfy.live/webhook";
const EP = {
  login:       WEBHOOK_BASE + "/zelia-login",
  trocarSenha: WEBHOOK_BASE + "/zelia-trocar-senha",
  registrar:   WEBHOOK_BASE + "/zelia-registrar",
  status:      WEBHOOK_BASE + "/zelia-status",
  faceTemplate:WEBHOOK_BASE + "/zelia-face-template",
  historico:   WEBHOOK_BASE + "/zelia-historico",
};
const BAHIA_OFFSET = "-03:00", FOTO_MAX_LADO = 1280, FOTO_QUALIDADE = 0.7, SYNC_INTERVAL_MS = 60000;
const LABELS = { entrada:"Entrada", saida:"Saída", pausa:"Almoço", retorno:"Retorno" };
const CONF   = { entrada:"Entrada registrada", saida:"Saída registrada", pausa:"Almoço registrado", retorno:"Retorno registrado" };
const SEQ    = { "":"entrada", entrada:"pausa", pausa:"retorno", retorno:"saida", saida:"entrada" };

const LS_TOKEN="zelia_token", LS_NOME="zelia_nome", LS_EMPRESA="zelia_empresa", LS_CPF="zelia_cpf", LS_DEVICE="zelia_device";
function togglePw(btn){
  const inp=btn.parentNode.querySelector("input");
  const show=inp.type==="password";
  inp.type=show?"text":"password";
  btn.querySelector(".eye-on").style.display=show?"none":"";
  btn.querySelector(".eye-off").style.display=show?"":"none";
  btn.setAttribute("aria-label",show?"Ocultar senha":"Mostrar senha");
}
let stream=null, tipoPendente=null, enviando=false, mesAtual=null;
let PERMITE_SEM_LOC=(()=>{try{return localStorage.getItem("zelia_semloc")==="1";}catch(e){return false;}})(); // regra do DONO (offline usa a última conhecida)
let BIO_ATIVA=false, ROSTO_OK=false, FACE_TEMPLATE=null, HUMAN_INST=null, recog=false, FACE_THRESH=0.50;

/* ---- home (trilha + botão adaptativo + GPS) ---- */
const ORDER = ["entrada","pausa","retorno","saida"];
const BTN_LABEL = { entrada:"Bater entrada", pausa:"Sair pro almoço", retorno:"Voltar do almoço", saida:"Bater saída" };
const TRILHA_ICON = { entrada:"→", pausa:"🍽️", retorno:"↩", saida:"🏁" };
let BATIDAS_HOJE = { entrada:null, pausa:null, retorno:null, saida:null };
let PROX_TIPO = "entrada", SEL_TIPO = "entrada", DIA_COMPLETO = false;
let PERFIL = { cargo:null, local:null, empresa:null };  // best-effort (se o status trouxer)
let GPS_STATUS = "buscando";        // buscando | ok | falha
let GPS_CACHE = null;               // {latitude,longitude,accuracy,ts,fetchedAt} — reusa no capturar se fresco
const GPS_MAX_AGE_MS = 30000;       // uma posição com <30s é considerada fresca o bastante pra bater

/* ---------- helpers ---------- */
function go(id){ document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active")); document.getElementById(id).classList.add("active"); }
let toastTimer; function toast(m){ const t=document.getElementById("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),3200); }
function primeiroNome(n){ return (n||"").trim().split(/\s+/)[0]||n||""; }
function getToken(){ return localStorage.getItem(LS_TOKEN)||""; }
function getDeviceId(){ let id=localStorage.getItem(LS_DEVICE); if(!id){ id=uuid(); localStorage.setItem(LS_DEVICE,id);} return id; }
function uuid(){ if(crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)); }
function isoBahia(d){ const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bahia",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(d).reduce((o,x)=>(o[x.type]=x.value,o),{}); const hh=p.hour==="24"?"00":p.hour; return `${p.year}-${p.month}-${p.day}T${hh}:${p.minute}:${p.second}${BAHIA_OFFSET}`; }
function horaBahia(d){ return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Bahia",hour:"2-digit",minute:"2-digit"}).format(d); }
function diaBahia(d){ return isoBahia(d).slice(0,10); }
function mesBahia(d){ return isoBahia(d).slice(0,7); }
function tickClock(){ const el=document.getElementById('clock-now'); if(el) el.textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia',hour:'2-digit',minute:'2-digit'}).format(new Date());
  const home=document.getElementById('s-home'); if(home&&home.classList.contains('active')) renderWorked(); }
function fmtHM(min){ min=Math.abs(Math.round(min||0)); const h=Math.floor(min/60), m=min%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
function fmtHoras(min){ min=Math.max(0,Math.round(min||0)); return Math.floor(min/60)+'h'+String(min%60).padStart(2,'0'); }
function dataExtenso(d){ const s=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia',weekday:'long',day:'numeric',month:'long'}).format(d).replace('-feira',''); return s.charAt(0).toUpperCase()+s.slice(1); }
function iniciais(n){ const p=(n||'').trim().split(/\s+/).filter(Boolean); if(!p.length) return '•'; return (p[0][0]+(p.length>1?p[p.length-1][0]:'')).toUpperCase(); }
function pintarAvatars(){ const ini=iniciais(localStorage.getItem(LS_NOME)); document.querySelectorAll('.av').forEach(a=>{ a.textContent=ini; }); }
function minHora(hhmm){ const [h,m]=(hhmm||'0:0').split(':').map(Number); return (h||0)*60+(m||0); }
function workedAoVivo(b){ const agora=minHora(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia',hour:'2-digit',minute:'2-digit'}).format(new Date())); let w=0;
  if(b.entrada){ const fim=b.pausa?minHora(b.pausa):(b.saida?minHora(b.saida):agora); w+=Math.max(0,fim-minHora(b.entrada)); }
  if(b.retorno){ const fim=b.saida?minHora(b.saida):agora; w+=Math.max(0,fim-minHora(b.retorno)); }
  return w; }
function soDigitos(v){ return (v||'').replace(/\D/g,''); }

/* ---------- IndexedDB fila offline (guarda payload SEM token) ---------- */
const DB_NAME="zelia_db",DB_VER=1,STORE="fila";
function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,DB_VER); r.onupgradeneeded=()=>{const db=r.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:"local_id"});}; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function filaAdd(i){ const db=await idb(); return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put(i); tx.oncomplete=res; tx.onerror=()=>rej(tx.error);}); }
async function filaAll(){ const db=await idb(); return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readonly"); const rq=tx.objectStore(STORE).getAll(); rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error);}); }
async function filaDel(id){ const db=await idb(); return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete=res; tx.onerror=()=>rej(tx.error);}); }
async function filaCount(){ return (await filaAll()).length; }

/* =================== LOGIN =================== */
async function fazerLogin(empresa_id){
  const cpf=soDigitos(document.getElementById("in-cpf").value);
  const senha=document.getElementById("in-senha").value;
  const err=document.getElementById("login-err"); err.textContent="";
  if(cpf.length!==11){ err.textContent="Digite um CPF válido (11 números)."; return; }
  if(!senha){ err.textContent="Digite sua senha."; return; }
  go("s-loading");
  try{
    const r=await fetch(EP.login,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cpf,senha,empresa_id})});
    const d=await r.json();
    if(d.escolher_empresa){ localStorage.setItem(LS_CPF,cpf); renderEmpresas(d.empresas); go("s-empresa"); return; }
    if(!d.ok){ go("s-login"); document.getElementById("login-err").textContent=d.mensagem||"CPF ou senha incorretos"; return; }
    localStorage.setItem(LS_TOKEN,d.token); localStorage.setItem(LS_NOME,d.nome||""); localStorage.setItem(LS_CPF,cpf);
    if(d.senha_provisoria){ go("s-trocar"); return; }
    irHome();
  }catch(e){ go("s-login"); document.getElementById("login-err").textContent="Sem conexão. Tente de novo."; }
}
function renderEmpresas(empresas){
  const box=document.getElementById("lista-empresas"); box.innerHTML="";
  (empresas||[]).forEach(e=>{ const b=document.createElement("button"); b.className="item"; b.textContent=e.nome;
    b.onclick=()=>fazerLogin(e.id); box.appendChild(b); });
}
async function fazerTrocaSenha(){
  const nova=(document.getElementById("in-nova").value||"").trim();
  const cpf=soDigitos(localStorage.getItem(LS_CPF)||"");
  const err=document.getElementById("trocar-err"); err.textContent="";
  if(nova.length<6){ err.textContent="Mínimo de 6 caracteres."; return; }
  if(nova==="123"){ err.textContent='Não pode ser "123".'; return; }
  if(soDigitos(nova)===cpf){ err.textContent="Não pode ser seu CPF."; return; }
  go("s-loading");
  try{
    const r=await fetch(EP.trocarSenha,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:getToken(),nova_senha:nova})});
    const d=await r.json();
    if(d.ok){ irHome(); } else { go("s-trocar"); document.getElementById("trocar-err").textContent="Não foi possível trocar. "+(d.motivo||""); }
  }catch(e){ go("s-trocar"); document.getElementById("trocar-err").textContent="Sem conexão."; }
}
function sair(){ localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_NOME); go("s-login"); }

/* =================== HOME =================== */
async function irHome(){ go("s-home"); await refreshHome(); sincronizarFila(); }
async function refreshHome(){
  const nome=primeiroNome(localStorage.getItem(LS_NOME));
  document.getElementById("greet-nome").textContent="Oi, "+(nome||"você")+" 👋";
  document.getElementById("greet-data").textContent=dataExtenso(new Date());
  pintarAvatars();
  tickClock(); atualizarRede(); await atualizarPendentes();
  await carregarEstadoHome();     // flags do dono + batidas de hoje + trilha/status/botão
  iniciarGPSHome();               // dispara a busca de GPS e trava o botão até confirmar
}
function atualizarRede(){ const on=navigator.onLine; const d=document.getElementById("net-dot"), t=document.getElementById("net-txt");
  if(d) d.className="dot "+(on?"on":"off"); if(t) t.textContent=on?"":"⚠️ Sem conexão"; }
async function atualizarPendentes(){
  const n=await filaCount(); const h=document.getElementById("pend-hint");
  if(!h) return;
  if(n>0){ h.style.display="block"; h.textContent="📴 "+n+" registro(s) aguardando envio — enviaremos quando houver conexão."; } else h.style.display="none";
}
/* lê flags do dono (status) + monta as batidas de hoje (histórico + fila offline) */
async function carregarEstadoHome(){
  if(navigator.onLine && getToken()){
    try{ const r=await fetch(EP.status+"?token="+encodeURIComponent(getToken()));
      if(r.status===401){ sair(); return; }
      if(r.ok){ const d=await r.json()||{};
        PERMITE_SEM_LOC = d.permitir_sem_localizacao !== false; try{localStorage.setItem("zelia_semloc", PERMITE_SEM_LOC?"1":"0");}catch(e){}
        BIO_ATIVA = d.biometria_ativa===true; ROSTO_OK = d.rosto_cadastrado===true;
        PERFIL.cargo = d.cargo || d.funcao || PERFIL.cargo;          // best-effort (se o backend mandar)
        PERFIL.local = d.nome_local || d.local_nome || PERFIL.local;
        PERFIL.empresa = d.empresa_nome || d.empresa || PERFIL.empresa;
        const cta=document.getElementById("face-cta"); if(cta) cta.style.display = (BIO_ATIVA && !ROSTO_OK) ? "block" : "none";
      } }catch(e){}
  }
  BATIDAS_HOJE = await baterTimesHoje();
  DIA_COMPLETO = ORDER.every(t=>BATIDAS_HOJE[t]);
  const ultimo = [...ORDER].reverse().find(t=>BATIDAS_HOJE[t]) || null;
  PROX_TIPO = DIA_COMPLETO ? "entrada" : (SEQ[ultimo]||"entrada");
  SEL_TIPO = PROX_TIPO;                 // sugestão padrão; o funcionário pode trocar tocando na trilha
  renderTrilha(); renderStatusPill(ultimo); renderWorked();
}
/* funcionário toca numa etapa da trilha pra escolher qual batida está fazendo */
function selecionarTipo(t){
  if(BATIDAS_HOJE[t]){ toast(LABELS[t]+" já foi registrado hoje."); return; }  // slot já batido: não re-bate
  SEL_TIPO=t; renderTrilha(); atualizarBotao();
}
/* horários das batidas de hoje: histórico do mês (online) + fila offline */
async function baterTimesHoje(){
  const hoje=diaBahia(new Date());
  const b={entrada:null,pausa:null,retorno:null,saida:null};
  if(navigator.onLine && getToken()){
    try{ const r=await fetch(EP.historico+"?token="+encodeURIComponent(getToken())+"&mes="+mesBahia(new Date()));
      if(r.status===401){ sair(); return b; }
      if(r.ok){ const d=await r.json(); const dia=(d.dias||[]).find(x=>x.data===hoje);
        if(dia){ (dia.registros||[]).forEach(rr=>{ if(b[rr.tipo]==null && rr.hora) b[rr.tipo]=rr.hora; }); } } }catch(e){}
  }
  const q=(await filaAll()).filter(x=>diaBahia(new Date(x.registrado_em))===hoje);
  q.forEach(x=>{ if(b[x.tipo]==null) b[x.tipo]=horaBahia(new Date(x.registrado_em)); });
  return b;
}
function renderTrilha(){
  // índice da batida mais avançada já feita — slots vazios ANTES dele = "faltou"
  let lastDone=-1; ORDER.forEach((t,i)=>{ if(BATIDAS_HOJE[t]) lastDone=i; });
  const selIdx = ORDER.indexOf(SEL_TIPO);
  const reached = DIA_COMPLETO ? 3 : Math.max(lastDone, selIdx, 0);
  const fill=document.getElementById("track-fill"); if(fill) fill.style.width=(reached*25)+"%";
  ORDER.forEach((t,i)=>{
    const stop=document.getElementById("stop-"+t); if(!stop) return;
    const c=stop.querySelector(".c"), tm=stop.querySelector(".tm");
    const done=!!BATIDAS_HOJE[t];
    const sel = !done && !DIA_COMPLETO && t===SEL_TIPO;   // a da vez (selecionada)
    const miss = !done && i<lastDone;                      // pulou: vira pendência
    stop.className="stop"+(done?" done":sel?" now sel":miss?" miss":"");
    if(done){ c.textContent="✓"; tm.className="tm"; tm.textContent=BATIDAS_HOJE[t]; }
    else if(sel){ c.textContent=TRILHA_ICON[t]; tm.className="tm"; tm.textContent="agora"; }
    else if(miss){ c.textContent="!"; tm.className="tm miss"; tm.textContent="faltou"; }
    else { c.textContent=TRILHA_ICON[t]; tm.className="tm e"; tm.textContent="--:--"; }
  });
}
function renderStatusPill(ultimo){
  const el=document.getElementById("clock-status"); if(!el) return;
  const h=t=>BATIDAS_HOJE[t]||"";
  // pendências = slots pulados (vazios ANTES da batida mais avançada) → visibilidade
  let lastDone=-1; ORDER.forEach((t,i)=>{ if(BATIDAS_HOJE[t]) lastDone=i; });
  let miss=0; ORDER.forEach((t,i)=>{ if(!BATIDAS_HOJE[t] && i<lastDone) miss++; });
  const pend = miss>0 ? ` · ${miss} pendência${miss>1?'s':''}` : "";
  const cls = miss>0 ? "wait" : "go";   // pendência pinta de âmbar (atenção)
  if(BATIDAS_HOJE.saida){ el.className="status "+cls;
    el.textContent = miss>0 ? ("🏁 Saída às "+h("saida")+pend) : ("🏁 Dia encerrado às "+h("saida")); return; }
  if(!ultimo){ el.className="status wait"; el.textContent="⏰ Hora de bater a entrada"; return; }
  if(ultimo==="entrada"){ el.className="status "+cls; el.textContent="✅ Entrada às "+h("entrada")+" — bom trabalho"+pend; return; }
  if(ultimo==="pausa"){ el.className="status "+cls; el.textContent="🍽️ Você saiu pro almoço às "+h("pausa")+pend; return; }
  if(ultimo==="retorno"){ el.className="status "+cls; el.textContent="💪 De volta desde "+h("retorno")+pend; return; }
  el.className="status wait"; el.textContent="⏰ Hora de bater o ponto"+pend;
}
function renderWorked(){ const el=document.getElementById("worked"); if(el) el.textContent=fmtHoras(workedAoVivo(BATIDAS_HOJE))+" trabalhadas"; }
/* GPS: busca ao abrir a home; botão TRAVA até confirmar */
function iniciarGPSHome(){ GPS_STATUS="buscando"; atualizarBotao();
  if(!navigator.geolocation){ GPS_STATUS="falha"; atualizarBotao(); return; }
  navigator.geolocation.getCurrentPosition(
    p=>{ GPS_CACHE={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,ts:p.timestamp,fetchedAt:Date.now()}; GPS_STATUS="ok"; atualizarBotao(); },
    ()=>{ GPS_STATUS="falha"; atualizarBotao(); },
    {enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
function atualizarBotao(){
  const btn=document.getElementById("big-btn"), core=document.getElementById("big-core"),
        cam=document.getElementById("big-cam"), lb=document.getElementById("big-lb"), loc=document.getElementById("loc-txt");
  if(!btn) return;
  if(GPS_STATUS==="buscando"){ btn.classList.add("off"); btn.dataset.ready="0"; core.className="core locked";
    cam.textContent="📍"; lb.textContent="Localizando…"; loc.innerHTML="Buscando sua localização…"; return; }
  if(GPS_STATUS==="falha" && !PERMITE_SEM_LOC){ btn.classList.add("off"); btn.dataset.ready="retry"; core.className="core locked";
    cam.textContent="📍"; lb.textContent="Ativar GPS"; loc.innerHTML='<span class="warn">Ative a localização e toque pra tentar de novo</span>'; return; }
  // GPS ok, ou falhou mas o dono permite bater sem localização
  btn.classList.remove("off"); btn.dataset.ready="1"; core.className="core";
  cam.textContent="📸"; lb.textContent=BTN_LABEL[SEL_TIPO]||"Bater ponto";
  if(GPS_STATUS==="ok") loc.innerHTML='📍 <span class="ok">GPS confirmado ✓</span>';
  else loc.innerHTML='<span class="warn">📍 Sem GPS — você ainda pode bater</span>';
}
function tocarPonto(){
  const btn=document.getElementById("big-btn"); const st=btn&&btn.dataset.ready;
  if(st==="retry"){ iniciarGPSHome(); return; }   // tentar localizar de novo
  if(st!=="1") return;                             // travado: ignora o toque
  iniciarRegistro(SEL_TIPO);                       // bate o tipo SELECIONADO (sugestão ou escolha na trilha)
}
function irRegistros(){ mesAtual=mesBahia(new Date()); pintarAvatars(); carregarRegistros(); go("s-registros"); }
function irInicio(){ voltarHome(); }
function irMais(){ pintarAvatars(); go("s-mais"); renderMais(); }
function emBreve(nome){ toast(nome+" chega em breve 🙂"); }
async function verOffline(){ const n=await filaCount();
  if(n>0){ toast(n+" ponto(s) aguardando — tentando enviar agora…"); sincronizarFila(); }
  else toast("Tudo sincronizado ✅ Nenhum ponto pendente."); }
/* batidas de hoje a partir de uma lista de registros (reuso em Registros e Mais) */
function diaBatidas(regs){ const b={entrada:null,pausa:null,retorno:null,saida:null};
  (regs||[]).forEach(r=>{ if(b[r.tipo]==null && r.hora) b[r.tipo]=r.hora; }); return b; }
/* pendências de um dia = slots vazios ANTES da batida mais avançada (mesmo conceito da trilha da home) */
function pendDia(b){ let last=-1; ORDER.forEach((t,i)=>{ if(b[t]) last=i; }); let m=0; ORDER.forEach((t,i)=>{ if(!b[t] && i<last) m++; }); return m; }
async function renderMais(){
  document.getElementById("mais-ini").textContent=iniciais(localStorage.getItem(LS_NOME));
  document.getElementById("mais-nome").textContent=localStorage.getItem(LS_NOME)||"Funcionário";
  const sub=[PERFIL.local,PERFIL.cargo].filter(Boolean).join(" · ") || PERFIL.empresa || "";
  const es=document.getElementById("mais-sub"); if(es){ es.textContent=sub; es.style.display=sub?"":"none"; }
  // selo de pendências do mês em "Solicitações"
  let pend=0;
  try{ if(navigator.onLine && getToken()){ const r=await fetch(EP.historico+"?token="+encodeURIComponent(getToken())+"&mes="+mesBahia(new Date()));
    if(r.ok){ const d=await r.json(); (d.dias||[]).forEach(x=>{ pend+=pendDia(diaBatidas(x.registros)); }); } } }catch(e){}
  const ps=document.getElementById("mais-solic-pend"); if(ps){ if(pend>0){ ps.style.display=""; ps.textContent=pend+" pend."; } else ps.style.display="none"; }
  // badge de pontos offline
  const n=await filaCount(); const off=document.getElementById("mais-off-badge");
  if(off){ if(n>0){ off.style.display=""; off.textContent=String(n); } else off.style.display="none"; }
}

/* =================== CÂMERA + REGISTRO =================== */
async function iniciarRegistro(tipo){
  if(BIO_ATIVA && ROSTO_OK){ return iniciarRegistroFacial(tipo); }   // olha e bate (reconhecimento)
  tipoPendente=tipo; document.getElementById("cam-titulo").textContent="Registrar "+LABELS[tipo]; go("s-camera");
  try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:1280}},audio:false});
    const v=document.getElementById("cam-video"); v.srcObject=stream; v.style.display="block"; document.getElementById("cam-capturar").style.display="block";
  }catch(e){ document.getElementById("cam-video").style.display="none"; document.getElementById("cam-capturar").style.display="none"; document.getElementById("cam-fallback").click(); }
}
function pararCamera(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
function cancelarCamera(){ pararCamera(); tipoPendente=null; voltarHome(); }
function pegarGPS(){
  // reaproveita a posição que a home já confirmou, se for recente (<30s) — senão busca de novo
  if(GPS_CACHE && (Date.now()-GPS_CACHE.fetchedAt)<GPS_MAX_AGE_MS) return Promise.resolve(GPS_CACHE);
  return new Promise(res=>{ if(!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p=>{ GPS_CACHE={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,ts:p.timestamp,fetchedAt:Date.now()}; res(GPS_CACHE); },
      ()=>res(null),{enableHighAccuracy:true,timeout:15000,maximumAge:0}); }); }
function comprimir(el){ const w0=el.videoWidth||el.naturalWidth,h0=el.videoHeight||el.naturalHeight; const s=Math.min(1,FOTO_MAX_LADO/Math.max(w0,h0)); const w=Math.round(w0*s),h=Math.round(h0*s); const c=document.getElementById("work-canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(el,0,0,w,h); return c.toDataURL("image/jpeg",FOTO_QUALIDADE).split(",")[1]; }
async function capturar(){ if(enviando) return; const v=document.getElementById("cam-video"); if(!v.videoWidth){ toast("Aguarde a câmera abrir…"); return; }
  const agora=new Date(); const foto=comprimir(v); const gps=await pegarGPS();
  if(!gps && !PERMITE_SEM_LOC){ bloqueioSemGps(); return; }   // dono EXIGE localização e o GPS não veio → não bate (funcionário não escolhe)
  pararCamera(); await enviarRegistro({tipo:tipoPendente,agora,foto,gps}); }
// dono EXIGE localização e o GPS não veio: avisa e deixa tentar de novo (sem botão de escape)
function bloqueioSemGps(){ toast("Ative a localização do celular pra bater o ponto"); const h=document.getElementById("cam-hint"); if(h) h.textContent="📍 Ative a localização do celular pra registrar o ponto e toque de novo."; }
async function capturarInput(ev){ const file=ev.target.files&&ev.target.files[0]; if(!file){ voltarHome(); return; }
  const agora=new Date(); const img=new Image(); const gps=await pegarGPS();
  if(!gps && !PERMITE_SEM_LOC){ bloqueioSemGps(); voltarHome(); return; }
  img.onload=async()=>{ const foto=comprimir(img); await enviarRegistro({tipo:tipoPendente,agora,foto,gps}); URL.revokeObjectURL(img.src); }; img.src=URL.createObjectURL(file); }

/* ---------- FACIAL: olha e bate (reconhecimento no device) ---------- */
function loadHuman(){
  return new Promise(function(res,rej){
    if(HUMAN_INST) return res(HUMAN_INST);
    function make(){
      try{
        HUMAN_INST=new Human.Human({ modelBasePath:"https://cdn.jsdelivr.net/npm/@vladmandic/human@3/models/", backend:"humangl", cacheModels:true, warmup:"none",
          face:{enabled:true, detector:{maxDetected:1,rotation:false}, mesh:{enabled:false}, iris:{enabled:false}, description:{enabled:true}, antispoof:{enabled:true}, liveness:{enabled:true}, emotion:{enabled:false}},
          body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false},filter:{enabled:false} });
        HUMAN_INST.load().then(function(){return HUMAN_INST.warmup();}).then(function(){res(HUMAN_INST);}).catch(rej);
      }catch(e){ rej(e); }
    }
    if(typeof Human!=="undefined") return make();
    var s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/@vladmandic/human@3/dist/human.js";
    s.onload=make; s.onerror=function(){rej(new Error("human CDN"));}; document.head.appendChild(s);
  });
}
function l2v(v){ var s=0,i; for(i=0;i<v.length;i++) s+=v[i]*v[i]; s=Math.sqrt(s)||1; var o=new Array(v.length); for(i=0;i<v.length;i++) o[i]=v[i]/s; return o; }
function cosSim(a,b){ var s=0,i,n=Math.min(a.length,b.length); for(i=0;i<n;i++) s+=a[i]*b[i]; return s; } // já L2-normalizados
async function fetchTemplate(){
  if(FACE_TEMPLATE) return FACE_TEMPLATE;
  var r=await fetch(EP.faceTemplate,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:getToken()})});
  var d=await r.json();
  if(!d.ok || !d.template) throw new Error("sem template");
  var arr=(typeof d.template==="string")?JSON.parse(d.template):d.template;
  FACE_TEMPLATE=l2v(arr.map(Number));
  return FACE_TEMPLATE;
}
async function iniciarRegistroFacial(tipo){
  tipoPendente=tipo; recog=false;
  document.getElementById("cam-titulo").textContent=LABELS[tipo]+" — olhe pra câmera";
  document.getElementById("cam-hint").textContent="Reconhecendo seu rosto…";
  document.getElementById("cam-capturar").style.display="none";
  var fb=document.getElementById("cam-selfie-fb"); if(fb) fb.style.display="none";
  go("s-camera");
  try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480}},audio:false});
    var v=document.getElementById("cam-video"); v.srcObject=stream; v.style.display="block";
  }catch(e){ document.getElementById("cam-hint").textContent="Não consegui abrir a câmera."; mostrarSelfieFallback(); return; }
  try{ await loadHuman(); await fetchTemplate(); }
  catch(e){ document.getElementById("cam-hint").textContent="Reconhecimento indisponível agora."; mostrarSelfieFallback(); return; }
  reconhecerLoop();
}
function mostrarSelfieFallback(){ var fb=document.getElementById("cam-selfie-fb"); if(fb) fb.style.display="block"; }
async function reconhecerLoop(){
  var t0=Date.now(), okFrames=0;
  async function step(){
    if(recog || !stream) return;
    var v=document.getElementById("cam-video");
    if(!v.videoWidth){ requestAnimationFrame(step); return; }
    try{
      var r=await HUMAN_INST.detect(v);
      var f=r.face && r.face[0], hint=document.getElementById("cam-hint");
      if(f && f.embedding && f.embedding.length){
        var live=(typeof f.live==="number"?f.live:1), real=(typeof f.real==="number"?f.real:1);
        var sim=cosSim(l2v(Array.from(f.embedding)), FACE_TEMPLATE);
        var vivo = live>0.6 && real>0.5;
        if(sim>=FACE_THRESH && vivo){ okFrames++; hint.textContent="Reconhecendo… "+(sim*100).toFixed(0)+"%"; if(okFrames>=2){ recog=true; return baterReconhecido(v); } }
        else if(sim>=FACE_THRESH && !vivo){ okFrames=0; hint.textContent="Rosto não parece vivo (foto?)"; }
        else { okFrames=0; hint.textContent="Reconhecendo… "+(sim*100).toFixed(0)+"%"; }
      } else { okFrames=0; document.getElementById("cam-hint").textContent="Enquadre o rosto no centro…"; }
    }catch(e){}
    if(Date.now()-t0>8000 && !recog) mostrarSelfieFallback();
    requestAnimationFrame(step);
  }
  step();
}
async function baterReconhecido(v){
  try{ if(navigator.vibrate) navigator.vibrate(80); }catch(e){}
  document.getElementById("cam-hint").textContent="✅ Reconhecido! Batendo ponto…";
  // LGPD: batida por rosto NÃO sobe imagem — o reconhecimento (on-device) já provou quem é.
  var agora=new Date(); var gps=await pegarGPS();
  if(!gps && !PERMITE_SEM_LOC){ pararCamera(); bloqueioSemGps(); voltarHome(); return; }   // dono EXIGE localização
  pararCamera();
  await enviarRegistro({tipo:tipoPendente, agora:agora, foto:null, gps:gps, metodo:'facial'});
}
function baterComSelfie(){
  recog=true; // encerra o loop de reconhecimento
  document.getElementById("cam-titulo").textContent="Registrar "+LABELS[tipoPendente];
  document.getElementById("cam-hint").textContent="Enquadre o rosto e toque em registrar.";
  document.getElementById("cam-capturar").style.display="block";
  var fb=document.getElementById("cam-selfie-fb"); if(fb) fb.style.display="none";
}

function montarPayload({tipo,agora,foto,gps,metodo}){
  return { tipo, registrado_em:isoBahia(agora), gps_timestamp:gps?isoBahia(new Date(gps.ts)):null,
    latitude:gps?gps.latitude:null, longitude:gps?gps.longitude:null, accuracy_metros:gps?gps.accuracy:null,
    foto_base64:foto, metodo:metodo||'selfie', device_id:getDeviceId(), local_id:uuid() }; // local_id = chave local da fila (não vai pro banco)
}
async function enviarRegistro(dados){
  enviando=true; go("s-enviando"); document.getElementById("enviando-msg").textContent="Registrando "+LABELS[dados.tipo].toLowerCase()+"…";
  const payload=montarPayload(dados);
  if(!navigator.onLine){ await guardarOffline(payload); enviando=false; return; }
  try{
    const r=await fetch(EP.registrar,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload, token:getToken()})});
    const d=await r.json().catch(()=>({}));
    enviando=false;
    if(r.status===401){ toast("Sessão expirada — entre de novo."); sair(); return; }
    if(d.ok){ mostrarResultado("ok", payload.tipo, d); return; }
    // recusa do servidor (travar / sequência / tipo): mostra mensagem, NÃO enfileira
    mostrarResultado("recusa", payload.tipo, d);
  }catch(e){ await guardarOffline(payload); enviando=false; } // só falha de rede vai pra fila
}
async function guardarOffline(p){ await filaAdd({...p, origem:"offline"}); mostrarResultado("offline", p.tipo, null); registrarSync(); }
function mostrarResultado(estado, tipo, resp){
  pintarAvatars();
  const self=document.getElementById("res-self"), ck=document.getElementById("res-ck"), ph=document.getElementById("res-ph"),
        tit=document.getElementById("res-titulo"), time=document.getElementById("res-time"),
        tags=document.getElementById("res-tags"), msg=document.getElementById("res-msg"), cta=document.getElementById("res-cta");
  const hora=horaBahia(new Date()); const nome=primeiroNome(localStorage.getItem(LS_NOME))||"";
  const tagsHtml=arr=>arr.map(x=>`<span class="tag ${x.startsWith('⚠')?'warn':''}">${x}</span>`).join("");
  if(estado==="ok"){
    self.className="succ-self ok"; ck.textContent="✓"; ph.textContent="🧑";
    tit.textContent=(CONF[tipo]||"Ponto registrado")+"!";
    time.style.display=""; time.textContent=hora;
    const t=[];
    if(resp&&resp.metodo==='facial') t.push('📸 Rosto reconhecido');   // só quando o facial está ligado
    if(resp&&resp.dentro_raio===true) t.push('📍 GPS confirmado');
    else if(resp&&resp.sem_localizacao===true) t.push('📍 Sem GPS');
    else if(resp&&resp.dentro_raio===false) t.push('⚠️ Fora da área');
    tags.innerHTML=tagsHtml(t);
    let m=`Bom trabalho, ${nome}! 💚<br>Seu registro foi salvo com segurança.`;
    if(resp&&resp.dentro_raio===false) m=`Registro salvo, ${nome}.<br>⚠️ Fora da área cadastrada — sujeito a revisão do seu gestor.`;
    if(resp&&resp.duplicado) m="Esse ponto já estava registrado.";
    msg.innerHTML=m;
    cta.textContent="Ver meus registros"; cta.onclick=irRegistros;
  } else if(estado==="recusa"){
    self.className="succ-self err"; ck.textContent="✕"; ph.textContent="😕";
    tit.textContent="Não registrado";
    time.style.display="none"; tags.innerHTML="";
    msg.innerHTML=(resp&&resp.mensagem)||"Não foi possível registrar.";
    cta.textContent="Voltar"; cta.onclick=voltarHome;
  } else { // offline
    self.className="succ-self off"; ck.textContent="📴"; ph.textContent="🧑";
    tit.textContent=(CONF[tipo]||"Registro")+" salvo";
    time.style.display=""; time.textContent=hora;
    tags.innerHTML=tagsHtml(['📴 Aguardando internet']);
    msg.innerHTML=`Tudo certo, ${nome}.<br>Sem internet agora — enviamos sozinho quando a conexão voltar.`;
    cta.textContent="Ver meus registros"; cta.onclick=irRegistros;
  }
  go("s-resultado");
}
async function voltarHome(){ tipoPendente=null; go("s-home"); await refreshHome(); }

/* =================== SYNC (injeta token atual) =================== */
let sincronizando=false;
async function sincronizarFila(){ if(sincronizando||!navigator.onLine||!getToken()) return; sincronizando=true;
  try{ const itens=(await filaAll()).sort((a,b)=>a.registrado_em<b.registrado_em?-1:1);
    for(const it of itens){
      const {local_id, origem, ...campos}=it;
      try{ const r=await fetch(EP.registrar,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...campos, origem:"offline", token:getToken()})});
        if(r.status===401){ toast("Sessão expirada — entre de novo para enviar os registros salvos."); break; } // fila segura os registros
        const d=await r.json().catch(()=>({}));
        if(d.ok){ await filaDel(local_id); } else { break; } // recusa do servidor: para e tenta na próxima
      }catch(e){ break; } // sem rede
    }
  } finally { sincronizando=false; await atualizarPendentes(); }
}
function registrarSync(){ if("serviceWorker" in navigator && "SyncManager" in window) navigator.serviceWorker.ready.then(reg=>reg.sync.register("zelia-sync").catch(()=>{})).catch(()=>{}); }

/* =================== MEUS REGISTROS =================== */
function mudarMes(delta){
  const [y,m]=mesAtual.split("-").map(Number); const d=new Date(Date.UTC(y,m-1+delta,1));
  const novo=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  if(novo>mesBahia(new Date())) return; // não navega pro futuro
  mesAtual=novo; carregarRegistros();
}
async function carregarRegistros(){
  const [y,m]=mesAtual.split("-").map(Number);
  const ml=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(new Date(y,m-1,1));
  document.getElementById("mes-label").textContent=ml.charAt(0).toUpperCase()+ml.slice(1);
  document.getElementById("dias-lista").innerHTML='<p class="hint" style="text-align:center;padding:20px">Carregando…</p>';
  try{
    const r=await fetch(EP.historico+"?token="+encodeURIComponent(getToken())+"&mes="+mesAtual);
    if(r.status===401){ sair(); return; }
    const d=await r.json();
    renderRegistros(d);
  }catch(e){ document.getElementById("dias-lista").innerHTML='<p class="hint" style="text-align:center;padding:20px">Sem conexão.</p>'; }
}
let ultimoHistorico=null, ordemReg="recentes";
function toggleOrdem(){ ordemReg=(ordemReg==="recentes")?"antigos":"recentes";
  const l=document.getElementById("ordem-label"); if(l) l.textContent=(ordemReg==="recentes")?"Recentes":"Antigos";
  if(ultimoHistorico) renderRegistros(ultimoHistorico); }
function renderRegistros(d){
  ultimoHistorico=d;
  const dias=(d.dias||[]).slice();
  // indicadores do mês: banco de horas (saldo líquido), horas extras, pendências
  let extras=0, banco=0, pend=0;
  dias.forEach(x=>{ if(typeof x.saldo_min==="number"){ banco+=x.saldo_min; if(x.saldo_min>0) extras+=x.saldo_min; } pend+=pendDia(diaBatidas(x.registros)); });
  const sb=document.getElementById("st-banco"); if(sb) sb.textContent=(banco>=0?"+":"-")+fmtHoras(Math.abs(banco));
  const se=document.getElementById("st-extra2"); if(se) se.textContent="+"+fmtHoras(extras);
  const sp=document.getElementById("st-pend"); if(sp) sp.textContent=String(pend);
  const box=document.getElementById("dias-lista");
  // só dias com batida OU falta (esconde fim de semana / dias vazios)
  const vis=dias.filter(x=> (x.registros&&x.registros.length) || x.status==="falta");
  if(!vis.length){ box.innerHTML='<p class="hint" style="text-align:center;padding:24px">Sem registros neste mês.</p>'; return; }
  vis.sort((a,b)=> ordemReg==="recentes" ? (a.data<b.data?1:-1) : (a.data<b.data?-1:1));
  box.innerHTML="";
  vis.forEach(x=>{
    const [Y,M,D]=x.data.split("-");
    const b=diaBatidas(x.registros); const temAlgo=ORDER.some(t=>b[t]);
    if(!temAlgo && x.status==="falta"){
      const el=document.createElement("div"); el.className="daycard";
      el.innerHTML=`<div class="dh">🗓️ ${D}/${M}/${Y} <span class="falta">Falta</span></div><div class="nreg">Nenhuma batida registrada neste dia.</div>`;
      box.appendChild(el); return;
    }
    const pd=pendDia(b); const completo=ORDER.every(t=>b[t]);
    let badge=""; if(completo) badge='<span class="ok">✓ Dia completo</span>';
      else if(pd>0) badge=`<span class="warn">⚠ ${pd} pendência${pd>1?"s":""}</span>`;
    let last=-1; ORDER.forEach((t,i)=>{ if(b[t]) last=i; });
    const linhas=ORDER.map((t,i)=>{ const done=!!b[t]; const miss=!done && i<last;
      const val=done?b[t]:(miss?"faltou":"--:--");
      return `<div class="p ${miss?"miss":(!done?"fut":"")}"><span class="lb">${LABELS[t]}</span><span class="tm">${val}</span></div>`; }).join("");
    const el=document.createElement("div"); el.className="daycard";
    el.innerHTML=`<div class="dh">🗓️ ${D}/${M}/${Y} ${badge}</div><div class="tl">${linhas}</div>`;
    box.appendChild(el);
  });
}

/* =================== BOOT =================== */
async function boot(){
  if("serviceWorker" in navigator){
    try{
      const reg=await navigator.serviceWorker.register("sw.js");
      reg.update().catch(()=>{});                                                             // checa update ao abrir
      document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") reg.update().catch(()=>{}); }); // e ao voltar pro 1º plano
      let recarregou=false;                                                                    // quando um SW novo assume, recarrega 1x sozinho
      navigator.serviceWorker.addEventListener("controllerchange", ()=>{ if(recarregou) return; recarregou=true; location.reload(); });
    }catch(e){}
    navigator.serviceWorker.addEventListener("message", e=>{ if(e.data&&e.data.type==="zelia-sync") sincronizarFila(); }); }
  window.addEventListener("online", ()=>{ atualizarRede(); sincronizarFila(); });
  window.addEventListener("offline", atualizarRede);
  setInterval(()=>{ if(navigator.onLine) sincronizarFila(); }, SYNC_INTERVAL_MS);
  setInterval(tickClock, 1000);
  document.getElementById("in-cpf").addEventListener("input", e=>{ e.target.value=soDigitos(e.target.value).slice(0,11); });
  if(getToken()){ irHome(); } else { go("s-login"); }
}
document.addEventListener("DOMContentLoaded", boot);
