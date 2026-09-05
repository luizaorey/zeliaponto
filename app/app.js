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
let stream=null, tipoPendente=null, enviando=false, mesAtual=null, PERMITE_SEM_LOC=false;
let BIO_ATIVA=false, ROSTO_OK=false, FACE_TEMPLATE=null, HUMAN_INST=null, recog=false, FACE_THRESH=0.50;

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
function tickClock(){ const el=document.getElementById('clock-now'); if(el) el.textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia',hour:'2-digit',minute:'2-digit'}).format(new Date()); }
function fmtHM(min){ min=Math.abs(Math.round(min||0)); const h=Math.floor(min/60), m=min%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
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
  document.getElementById("ola").textContent="Olá, "+primeiroNome(localStorage.getItem(LS_NOME))+"!";
  document.getElementById("sub-empresa").textContent="Bem-vindo ao seu ponto";
  tickClock(); atualizarRede(); await atualizarPendentes(); await bloquearTipoRepetido();
}
function atualizarRede(){ const on=navigator.onLine; document.getElementById("net-dot").className="dot "+(on?"on":"off"); document.getElementById("net-txt").textContent=on?"Conectado":"Sem conexão"; }
async function atualizarPendentes(){
  const n=await filaCount(); const h=document.getElementById("pend-hint");
  if(n>0){ h.style.display="block"; h.textContent="📴 "+n+" registro(s) aguardando envio — enviaremos quando houver conexão."; } else h.style.display="none";
}
async function bloquearTipoRepetido(){
  document.querySelectorAll(".btn-ponto").forEach(b=>b.disabled=false);
  let ultimoTipo=null, quando=null;
  if(navigator.onLine && getToken()){
    try{ const r=await fetch(EP.status+"?token="+encodeURIComponent(getToken()));
      if(r.status===401){ sair(); return; }
      if(r.ok){ const d=await r.json(); if(d){ if(d.ultimo){ ultimoTipo=d.ultimo.tipo; quando=d.ultimo.registrado_em; } PERMITE_SEM_LOC = d.permitir_sem_localizacao !== false;
        BIO_ATIVA = d.biometria_ativa===true; ROSTO_OK = d.rosto_cadastrado===true;
        const cta=document.getElementById("face-cta"); if(cta) cta.style.display = (BIO_ATIVA && !ROSTO_OK) ? "block" : "none"; } } }catch(e){}
  }
  const hoje=diaBahia(new Date());
  const locais=(await filaAll()).filter(x=>diaBahia(new Date(x.registrado_em))===hoje).sort((a,b)=>a.registrado_em<b.registrado_em?-1:1);
  if(locais.length){ ultimoTipo=locais[locais.length-1].tipo; quando=locais[locais.length-1].registrado_em; }
  const box=document.getElementById("ultimo-box"), sub=document.getElementById("clock-sub");
  if(ultimoTipo){
    const btn=document.querySelector(`.btn-ponto[data-tipo="${ultimoTipo}"]`); if(btn) btn.disabled=true;
    const prox=SEQ[ultimoTipo]||"entrada";
    box.style.display="block"; box.innerHTML=`Último: <b>${LABELS[ultimoTipo]}</b>${quando?(" às "+horaBahia(new Date(quando))):""}. Próximo: <b>${LABELS[prox]}</b>.`;
    if(sub) sub.textContent=`Próximo: ${LABELS[prox]}`;
  } else { box.style.display="none"; if(sub) sub.textContent="Toque num botão para bater o ponto"; }
}
function irRegistros(){ mesAtual=mesBahia(new Date()); carregarRegistros(); go("s-registros"); }

/* =================== CÂMERA + REGISTRO =================== */
async function iniciarRegistro(tipo){
  if(BIO_ATIVA && ROSTO_OK){ return iniciarRegistroFacial(tipo); }   // olha e bate (reconhecimento)
  tipoPendente=tipo; document.getElementById("cam-titulo").textContent="Registrar "+LABELS[tipo]; go("s-camera");
  try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:1280}},audio:false});
    const v=document.getElementById("cam-video"); v.srcObject=stream; v.style.display="block"; document.getElementById("cam-capturar").style.display="block";
    const sl=document.getElementById("cam-semloc"); if(sl) sl.style.display = PERMITE_SEM_LOC ? "block" : "none";
  }catch(e){ document.getElementById("cam-video").style.display="none"; document.getElementById("cam-capturar").style.display="none"; const sl=document.getElementById("cam-semloc"); if(sl) sl.style.display="none"; document.getElementById("cam-fallback").click(); }
}
function pararCamera(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
function cancelarCamera(){ pararCamera(); tipoPendente=null; voltarHome(); }
function pegarGPS(){ return new Promise(res=>{ if(!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition(p=>res({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,ts:p.timestamp}),()=>res(null),{enableHighAccuracy:true,timeout:15000,maximumAge:0}); }); }
function comprimir(el){ const w0=el.videoWidth||el.naturalWidth,h0=el.videoHeight||el.naturalHeight; const s=Math.min(1,FOTO_MAX_LADO/Math.max(w0,h0)); const w=Math.round(w0*s),h=Math.round(h0*s); const c=document.getElementById("work-canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(el,0,0,w,h); return c.toDataURL("image/jpeg",FOTO_QUALIDADE).split(",")[1]; }
async function capturar(){ if(enviando) return; const v=document.getElementById("cam-video"); if(!v.videoWidth){ toast("Aguarde a câmera abrir…"); return; }
  const agora=new Date(); const foto=comprimir(v); const gps=await pegarGPS(); pararCamera(); await enviarRegistro({tipo:tipoPendente,agora,foto,gps}); }
// bate ponto SEM localização (pula o GPS) — só quando a empresa permite (dono liga no painel)
async function capturarSemLoc(){ if(enviando) return; const v=document.getElementById("cam-video"); if(!v.videoWidth){ toast("Aguarde a câmera abrir…"); return; }
  const agora=new Date(); const foto=comprimir(v); pararCamera(); await enviarRegistro({tipo:tipoPendente,agora,foto,gps:null}); }
async function capturarInput(ev){ const file=ev.target.files&&ev.target.files[0]; if(!file){ voltarHome(); return; }
  const agora=new Date(); const img=new Image(); const gpsP=pegarGPS();
  img.onload=async()=>{ const foto=comprimir(img); const gps=await gpsP; await enviarRegistro({tipo:tipoPendente,agora,foto,gps}); URL.revokeObjectURL(img.src); }; img.src=URL.createObjectURL(file); }

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
  var slb=document.getElementById("cam-semloc"); if(slb) slb.style.display="none";
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
  var agora=new Date(); var foto=comprimir(v); var gps=await pegarGPS(); pararCamera();
  await enviarRegistro({tipo:tipoPendente, agora:agora, foto:foto, gps:gps});
}
function baterComSelfie(){
  recog=true; // encerra o loop de reconhecimento
  document.getElementById("cam-titulo").textContent="Registrar "+LABELS[tipoPendente];
  document.getElementById("cam-hint").textContent="Enquadre o rosto e toque em registrar.";
  document.getElementById("cam-capturar").style.display="block";
  var fb=document.getElementById("cam-selfie-fb"); if(fb) fb.style.display="none";
}

function montarPayload({tipo,agora,foto,gps}){
  return { tipo, registrado_em:isoBahia(agora), gps_timestamp:gps?isoBahia(new Date(gps.ts)):null,
    latitude:gps?gps.latitude:null, longitude:gps?gps.longitude:null, accuracy_metros:gps?gps.accuracy:null,
    foto_base64:foto, device_id:getDeviceId(), local_id:uuid() }; // local_id = chave local da fila (não vai pro banco)
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
  const ic=document.getElementById("res-ic"), tit=document.getElementById("res-titulo"), msg=document.getElementById("res-msg"); const hora=horaBahia(new Date());
  if(estado==="ok"){ ic.className="result-ic ric-ok"; ic.textContent=resp&&resp.duplicado?"✅":"✅"; tit.textContent=CONF[tipo];
    let m="às "+hora; if(resp&&resp.nome_local) m+=" — "+resp.nome_local;
    if(resp&&resp.dentro_raio===false) m+="\n⚠️ Fora da área cadastrada — sujeito a revisão.";
    if(resp&&resp.duplicado) m="já estava registrado.";
    msg.textContent=m;
  } else if(estado==="recusa"){ ic.className="result-ic ric-err"; ic.textContent="🚫"; tit.textContent="Não registrado";
    msg.textContent=(resp&&resp.mensagem)||"Não foi possível registrar.";
  } else { ic.className="result-ic ric-off"; ic.textContent="📴"; tit.textContent="Registro salvo";
    msg.textContent="Sem conexão — o registro foi salvo e será enviado automaticamente quando a internet voltar."; }
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
function renderRegistros(d){
  const dias=d.dias||[];
  let extras=0, faltantes=0;
  dias.forEach(x=>{ if(typeof x.saldo_min==="number"){ if(x.saldo_min>0) extras+=x.saldo_min; else faltantes+=x.saldo_min; } });
  document.getElementById("st-trab").textContent=fmtHM((d.resumo_mes||{}).trabalhado_min||0);
  document.getElementById("st-falt").textContent="-"+fmtHM(faltantes);
  document.getElementById("st-extra").textContent="+"+fmtHM(extras);
  const bd={completo:["Completo","bd-done"], em_andamento:["Em andamento","bd-work"], incompleto:["Incompleto","bd-work"], falta:["Falta","bd-miss"], fim_de_semana:["—","bd-work"]};
  const box=document.getElementById("dias-lista");
  if(!dias.length){ box.innerHTML='<p class="hint" style="text-align:center;padding:20px">Sem registros neste mês.</p>'; return; }
  box.innerHTML="";
  dias.forEach(x=>{
    const [Y,M,D]=x.data.split("-"); const badge=bd[x.status]||["—","bd-work"];
    const byTipo={}; (x.registros||[]).forEach(r=>{ if(!byTipo[r.tipo]) byTipo[r.tipo]=r; });
    const linha=(t)=>{ const r=byTipo[t]; const v=r?r.hora:"—"; const cls=r?(r.pendente?"v warn":"v"):"v dash";
      return `<div class="pu"><span class="t">${LABELS[t]}</span><span class="${cls}">${v}${r&&r.pendente?" ⚠️":""}</span></div>`; };
    let saldoHtml=""; if(typeof x.saldo_min==="number"){ const neg=x.saldo_min<0;
      saldoHtml=`<div class="saldo ${neg?'neg':'pos'}">${neg?'Faltantes':'Extras'}: ${neg?'-':'+'}${fmtHM(x.saldo_min)}</div>`; }
    const trab=(typeof x.trabalhado_min==="number")?fmtHM(x.trabalhado_min):"--:--";
    const el=document.createElement("div"); el.className="day";
    el.innerHTML=`<div class="r1"><span class="date">${D}/${M}</span><span class="bd ${badge[1]}">${badge[0]}</span></div>
      <div class="pu" style="margin-top:10px"><span class="t" style="font-weight:700;color:var(--ink)">Horas trabalhadas</span><span class="v">${trab}</span></div>
      <div class="punches">${linha('entrada')}${linha('pausa')}${linha('retorno')}${linha('saida')}</div>${saldoHtml}`;
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
