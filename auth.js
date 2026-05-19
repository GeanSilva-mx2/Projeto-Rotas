/* =============================================
   SISTEMA DE ROTAS — auth.js
   Login por Magic Link (e-mail) via Supabase
   ============================================= */

const SUPABASE_URL = 'https://yyjisxbiixtopuquroyx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gkZDSjfLpOv8PxGHJiq7pA_hYg2t7zE';
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* E-mails com acesso de administrador */
const ADMIN_EMAILS = ['geandiehl7@gmail.com'];

let _adminFiltro   = 'todos';
let _adminUsuarios = [];

/* =============================================
   INIT
   ============================================= */
(async () => {
  carregarTema();

  /* Verifica se voltou de um magic link */
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    await _sb.auth.getSession(); /* Supabase processa o token automaticamente */
    window.location.hash = '';
  }

  const { data: { session } } = await _sb.auth.getSession();
  if (session) {
    await verificarAcessoERedirencionar(session.user);
    verificarBotaoAdmin(session.user.email);
  }

  /* Escuta mudanças de sessão (retorno do magic link) */
  _sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await verificarAcessoERedirencionar(session.user);
      verificarBotaoAdmin(session.user.email);
    }
    if (event === 'SIGNED_OUT') {
      mostrarTela('screen-auth');
      esconderBotaoAdmin();
    }
  });
})();

/* =============================================
   TEMA
   ============================================= */
function carregarTema() { aplicarTema(localStorage.getItem('tema') || 'dark'); }
function toggleTheme() {
  const n = (document.documentElement.getAttribute('data-theme')||'dark') === 'dark' ? 'light' : 'dark';
  aplicarTema(n); localStorage.setItem('tema', n);
}
function aplicarTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  const l = document.getElementById('theme-label');
  const i = document.getElementById('theme-icon');
  if (t === 'dark') {
    l.textContent = 'Claro';
    i.innerHTML = `<circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  } else {
    l.textContent = 'Escuro';
    i.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  }
}

/* =============================================
   TELAS
   ============================================= */
function mostrarTela(id) {
  ['screen-auth','screen-sent','screen-pending'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? 'block' : 'none';
  });
}

function trocarAba(aba) {
  /* Reseta todas as abas e painéis */
  document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.login-panel').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  limparMsg('msg-auth');

  /* Ativa a aba e painel selecionados */
  const tab   = document.getElementById(`tab-${aba}`);
  const panel = document.getElementById(`panel-${aba}`);
  if (tab)   tab.classList.add('active');
  if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
}

function voltarAuth() {
  mostrarTela('screen-auth');
  trocarAba('entrar');
}

/* =============================================
   MENSAGENS
   ============================================= */
function mostrarMsg(elId, tipo, html) {
  const el     = document.getElementById(elId);
  const iconEl = document.getElementById(elId + '-icon');
  const txtEl  = document.getElementById(elId + '-text');
  if (!el) return;
  const icons = {
    error:   `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
    success: `<polyline points="20 6 9 17 4 12"/>`,
    info:    `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
    warning: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`
  };
  el.className = `lf-msg ${tipo} show`;
  txtEl.innerHTML = html;
  if (iconEl) iconEl.innerHTML = icons[tipo] || '';
}

function limparMsg(elId) {
  const el = document.getElementById(elId);
  if (el) {
    el.className = 'lf-msg';
    const t = el.querySelector('span'); if (t) t.innerHTML = '';
  }
}

function setBtnLoad(id, loading, textoOrig) {
  const btn = document.getElementById(id); if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Enviando...`;
  } else {
    btn.innerHTML = textoOrig;
  }
}

/* =============================================
   MAGIC LINK — ENTRAR
   ============================================= */
async function enviarMagicLink() {
  const email = document.getElementById('entrar-email').value.trim();
  limparMsg('msg-auth');
  if (!email) { mostrarMsg('msg-auth','error','Informe seu e-mail.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    mostrarMsg('msg-auth','error','E-mail inválido.'); return;
  }

  setBtnLoad('btn-magic', true);

  try {
    const { error } = await _sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href.split('?')[0].split('#')[0]
      }
    });
    if (error) throw error;

    /* Mostra tela de link enviado */
    document.getElementById('screen-auth').style.display = 'none';
    document.getElementById('screen-sent').style.display = 'block';
    document.getElementById('sent-title').textContent    = 'Link enviado!';
    document.getElementById('sent-sub').textContent      = 'Verifique seu e-mail e clique no link para entrar.';
    document.getElementById('sent-email').textContent    = email;

  } catch(e) {
    const msgs = {
      'Email rate limit exceeded': 'Muitos envios. Aguarde alguns minutos.',
      'Invalid email':             'E-mail inválido.',
    };
    mostrarMsg('msg-auth', 'error', msgs[e.message] || e.message);
  } finally {
    setBtnLoad('btn-magic', false,
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
        <polyline points="22 2 15 22 11 13 2 9 22 2"/>
      </svg> Enviar link de acesso`);
  }
}

/* =============================================
   CADASTRO (solicitar acesso)
   ============================================= */
async function fazerCadastro() {
  const nome  = document.getElementById('cad-nome').value.trim();
  const email = document.getElementById('cad-email').value.trim();
  limparMsg('msg-auth');

  if (!nome)  { mostrarMsg('msg-auth','error','Informe seu nome completo.'); return; }
  if (!email) { mostrarMsg('msg-auth','error','Informe seu e-mail.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    mostrarMsg('msg-auth','error','E-mail inválido.'); return;
  }

  setBtnLoad('btn-cadastro', true);

  try {
    /* Envia magic link que também cria a conta se não existir */
    const { error } = await _sb.auth.signInWithOtp({
      email,
      options: {
        data: { nome },
        emailRedirectTo: window.location.href.split('?')[0].split('#')[0]
      }
    });
    if (error) throw error;

    /* Salva perfil como pendente */
    const { data: { session } } = await _sb.auth.getSession();
    if (session) {
      await _sb.from('profiles').upsert({
        id: session.user.id, nome, email, aprovado: false, rejeitado: false
      });
    } else {
      /* Usuário ainda não tem sessão — salva após login */
      localStorage.setItem('pendente_nome',  nome);
      localStorage.setItem('pendente_email', email);
    }

    /* Mostra tela enviado */
    document.getElementById('screen-auth').style.display = 'none';
    document.getElementById('screen-sent').style.display = 'block';
    document.getElementById('sent-title').textContent    = 'Solicitação enviada!';
    document.getElementById('sent-sub').textContent      = 'Clique no link do e-mail para confirmar sua conta. Após isso, aguarde a aprovação do administrador.';
    document.getElementById('sent-email').textContent    = email;

  } catch(e) {
    const msgs = {
      'Email rate limit exceeded': 'Muitos envios. Aguarde alguns minutos.',
    };
    mostrarMsg('msg-auth', 'error', msgs[e.message] || e.message);
  } finally {
    setBtnLoad('btn-cadastro', false,
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <line x1="20" y1="8" x2="20" y2="14"/>
        <line x1="23" y1="11" x2="17" y2="11"/>
      </svg> Solicitar acesso`);
  }
}

/* =============================================
   VERIFICAR ACESSO E REDIRECIONAR
   ============================================= */
async function verificarAcessoERedirencionar(user) {
  /* Verifica se há nome pendente para salvar */
  const nomePend  = localStorage.getItem('pendente_nome');
  const emailPend = localStorage.getItem('pendente_email');
  if (nomePend && emailPend === user.email) {
    await _sb.from('profiles').upsert({
      id: user.id, nome: nomePend, email: user.email,
      aprovado: false, rejeitado: false
    });
    localStorage.removeItem('pendente_nome');
    localStorage.removeItem('pendente_email');
  }

  /* Busca perfil */
  let { data: perfil } = await _sb
    .from('profiles').select('*').eq('id', user.id).maybeSingle();

  if (!perfil) {
    /* Cria perfil se não existir (admin ou primeiro login via magic link) */
    const nome = user.user_metadata?.nome || user.email.split('@')[0];
    await _sb.from('profiles').insert({
      id: user.id, nome, email: user.email,
      aprovado: ADMIN_EMAILS.includes(user.email), /* admin já aprovado */
      rejeitado: false
    });
    const { data } = await _sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    perfil = data;
  }

  /* Admin: aprova automaticamente */
  if (ADMIN_EMAILS.includes(user.email) && perfil && !perfil.aprovado) {
    await _sb.from('profiles').update({ aprovado: true, rejeitado: false }).eq('id', user.id);
    perfil.aprovado = true;
  }

  if (perfil && perfil.rejeitado) {
    await _sb.auth.signOut();
    mostrarMsg('msg-auth', 'error', '❌ Seu acesso foi rejeitado pelo administrador. Entre em contato.');
    mostrarTela('screen-auth');
    return;
  }

  if (perfil && perfil.aprovado) {
    window.location.href = 'index.html';
  } else {
    /* Mostra tela pendente */
    document.getElementById('screen-auth').style.display    = 'none';
    document.getElementById('screen-sent').style.display    = 'none';
    document.getElementById('screen-pending').style.display = 'block';
    document.getElementById('pending-email').textContent = user.email;
    document.getElementById('pending-nome').textContent  = perfil?.nome || '—';
  }
}

async function verificarAprovacao() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { voltarAuth(); return; }
  const { data: perfil } = await _sb.from('profiles').select('aprovado,rejeitado').eq('id', session.user.id).maybeSingle();
  if (perfil?.aprovado) {
    window.location.href = 'index.html';
  } else if (perfil?.rejeitado) {
    await _sb.auth.signOut();
    mostrarMsg('msg-auth','error','❌ Acesso rejeitado. Entre em contato com o administrador.');
    mostrarTela('screen-auth');
  } else {
    /* Feedback visual sem redirect */
    const btn = document.querySelector('#screen-pending .lf-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = '⏳ Ainda aguardando aprovação...';
    btn.style.opacity = '.7';
    setTimeout(() => { btn.innerHTML = orig; btn.style.opacity = '1'; }, 3000);
  }
}

async function fazerLogout() {
  await _sb.auth.signOut();
  mostrarTela('screen-auth');
  trocarAba('entrar');
  esconderBotaoAdmin();
}

/* =============================================
   BOTÃO ADMIN
   ============================================= */
function verificarBotaoAdmin(email) {
  if (ADMIN_EMAILS.includes(email)) {
    const btn = document.getElementById('btn-admin-float');
    if (btn) btn.style.display = 'flex';
    const el = document.getElementById('admin-logado-email');
    if (el) el.textContent = email;
  }
}
function esconderBotaoAdmin() {
  const btn = document.getElementById('btn-admin-float');
  if (btn) btn.style.display = 'none';
}

/* =============================================
   PAINEL ADMIN
   ============================================= */
async function abrirAdmin() {
  document.getElementById('admin-pw-overlay').classList.add('open');
  document.getElementById('admin-pw-input').value = '';
  limparMsg('msg-admin-pw');
  setTimeout(() => document.getElementById('admin-pw-input').focus(), 100);
}

function fecharAdminPw() {
  document.getElementById('admin-pw-overlay').classList.remove('open');
}

async function confirmarAdminPw() {
  const senha = document.getElementById('admin-pw-input').value;
  if (!senha) { mostrarMsg('msg-admin-pw','error','Informe sua senha.'); return; }

  const btn = document.getElementById('btn-admin-pw-ok');
  btn.disabled = true;
  btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { fecharAdminPw(); return; }

  const { error } = await _sb.auth.signInWithPassword({
    email: session.user.email, password: senha
  });

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Entrar`;

  if (error) {
    mostrarMsg('msg-admin-pw','error','Senha incorreta.');
    document.getElementById('admin-pw-input').value = '';
    document.getElementById('admin-pw-input').focus();
    return;
  }

  fecharAdminPw();
  document.getElementById('admin-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
  await carregarAdmin();
}

function fecharAdmin() {
  document.getElementById('admin-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

async function carregarAdmin() {
  document.getElementById('admin-lista').innerHTML =
    `<div style="text-align:center;padding:44px;color:var(--text3)">
      <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        style="width:28px;height:28px;display:block;margin:0 auto 10px">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Carregando...
    </div>`;

  const { data, error } = await _sb
    .from('profiles').select('*').order('criado_em', { ascending: false });

  if (error) {
    document.getElementById('admin-lista').innerHTML =
      `<div style="color:var(--red);text-align:center;padding:20px">Erro: ${error.message}</div>`;
    return;
  }

  _adminUsuarios = data || [];
  atualizarStatsAdmin();
  renderizarAdmin();
}

function atualizarStatsAdmin() {
  document.getElementById('as-total').textContent     = _adminUsuarios.length;
  document.getElementById('as-aprovados').textContent = _adminUsuarios.filter(u => u.aprovado && !u.rejeitado).length;
  document.getElementById('as-pendentes').textContent = _adminUsuarios.filter(u => !u.aprovado && !u.rejeitado).length;
  document.getElementById('as-rejeitados').textContent= _adminUsuarios.filter(u => u.rejeitado).length;
}

function filtrarAdmin(f, btn) {
  _adminFiltro = f;
  document.querySelectorAll('.admin-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderizarAdmin();
}

function renderizarAdmin() {
  const lista = document.getElementById('admin-lista');

  let users = _adminUsuarios;
  if (_adminFiltro === 'pendente')  users = users.filter(u => !u.aprovado && !u.rejeitado);
  if (_adminFiltro === 'aprovado')  users = users.filter(u =>  u.aprovado && !u.rejeitado);
  if (_adminFiltro === 'rejeitado') users = users.filter(u =>  u.rejeitado);

  if (!users.length) {
    lista.innerHTML = `<div style="text-align:center;padding:44px;color:var(--text3)">
      Nenhum usuário nesta categoria
    </div>`;
    return;
  }

  const cores = ['#4f8ef7','#7c3aed','#22c55e','#f59e0b','#ef4444','#22d3ee'];

  lista.innerHTML = users.map(u => {
    const isPend = !u.aprovado && !u.rejeitado;
    const isAprov =  u.aprovado && !u.rejeitado;
    const isRej  =  u.rejeitado;
    const sc     = isAprov ? 'sb-aprovado' : isRej ? 'sb-rejeitado' : 'sb-pendente';
    const st     = isAprov ? '✅ Aprovado'  : isRej ? '❌ Rejeitado'  : '⏳ Pendente';
    const cor    = cores[(u.nome||'A').charCodeAt(0) % cores.length];
    const ini    = (u.nome||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
    const dt     = u.criado_em ? new Date(u.criado_em).toLocaleString('pt-BR') : '—';
    const idStr  = u.id.replace(/'/g,"\\'");

    return `<div class="admin-user-card" id="card-${u.id}">
      <div class="admin-avatar" style="background:${cor}">${ini}</div>
      <div class="admin-user-info">
        <div class="admin-user-nome">${u.nome||'—'}</div>
        <div class="admin-user-email">${u.email||'—'}</div>
        <div class="admin-user-data">📅 ${dt}</div>
      </div>
      <span class="status-badge ${sc}">${st}</span>
      <div class="admin-actions">
        ${isPend || isRej ? `<button class="adm-btn adm-btn-aprovar" onclick="aprovarUser('${idStr}','${(u.nome||'').replace(/'/g,"\\'")}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px"><polyline points="20 6 9 17 4 12"/></svg>
          Aprovar</button>` : ''}
        ${isPend || isAprov ? `<button class="adm-btn adm-btn-rejeitar" onclick="rejeitarUser('${idStr}','${(u.nome||'').replace(/'/g,"\\'")}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Rejeitar</button>` : ''}
        <button class="adm-btn adm-btn-excluir" onclick="excluirUser('${idStr}','${(u.nome||'').replace(/'/g,"\\'")}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          </svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function aprovarUser(id, nome) {
  if (!confirm(`Aprovar acesso de "${nome}"?`)) return;
  const { error } = await _sb.from('profiles').update({ aprovado:true, rejeitado:false }).eq('id',id);
  if (error) { alert('Erro: '+error.message); return; }
  const u = _adminUsuarios.find(x=>x.id===id);
  if (u) { u.aprovado=true; u.rejeitado=false; }
  atualizarStatsAdmin(); renderizarAdmin();
  toastAdmin(`✅ ${nome} aprovado!`,'green');
}

async function rejeitarUser(id, nome) {
  if (!confirm(`Rejeitar acesso de "${nome}"?`)) return;
  const { error } = await _sb.from('profiles').update({ aprovado:false, rejeitado:true }).eq('id',id);
  if (error) { alert('Erro: '+error.message); return; }
  const u = _adminUsuarios.find(x=>x.id===id);
  if (u) { u.aprovado=false; u.rejeitado=true; }
  atualizarStatsAdmin(); renderizarAdmin();
  toastAdmin(`❌ ${nome} rejeitado.`,'red');
}

async function excluirUser(id, nome) {
  if (!confirm(`Excluir permanentemente "${nome}"?`)) return;
  const { error } = await _sb.from('profiles').delete().eq('id',id);
  if (error) { alert('Erro: '+error.message); return; }
  _adminUsuarios = _adminUsuarios.filter(x=>x.id!==id);
  atualizarStatsAdmin(); renderizarAdmin();
  toastAdmin(`🗑️ ${nome} excluído.`,'gray');
}

function toastAdmin(msg, cor) {
  const c = { green:{bg:'rgba(34,197,94,.12)',b:'rgba(34,197,94,.3)',t:'#16a34a'}, red:{bg:'rgba(239,68,68,.12)',b:'rgba(239,68,68,.3)',t:'#dc2626'}, gray:{bg:'rgba(100,116,139,.1)',b:'var(--border)',t:'var(--text2)'} }[cor] || {};
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:22px;right:22px;background:${c.bg};border:1px solid ${c.b};color:${c.t};padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;z-index:2000;box-shadow:0 8px 24px rgba(0,0,0,.25);transform:translateY(60px);opacity:0;transition:all .3s;font-family:var(--font)`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>{ el.style.transform='translateY(0)'; el.style.opacity='1'; },10);
  setTimeout(()=>{ el.style.transform='translateY(60px)'; el.style.opacity='0'; setTimeout(()=>el.remove(),300); },3500);
}
