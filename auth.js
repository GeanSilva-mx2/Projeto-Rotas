/* =============================================
   SISTEMA DE ROTAS — auth.js
   Autenticação completa com Supabase Auth
   ============================================= */

const SUPABASE_URL = 'https://yyjisxbiixtopuquroyx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gkZDSjfLpOv8PxGHJiq7pA_hYg2t7zE';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* E-mail do usuário em cadastro (para OTP) */
let _emailPendente = '';
let _nomePendente  = '';
let _timerReenvio  = null;

/* =============================================
   INICIALIZAÇÃO — verifica sessão ativa
   ============================================= */
(async () => {
  carregarTema();

  const { data: { session } } = await _sb.auth.getSession();

  if (session) {
    await verificarAcessoERedirencionar(session.user);
    await verificarAdmin();
  }
})();

/* =============================================
   TEMA
   ============================================= */
function carregarTema() {
  aplicarTema(localStorage.getItem('tema') || 'dark');
}

function toggleTheme() {
  const atual = document.documentElement.getAttribute('data-theme') || 'dark';
  const novo  = atual === 'dark' ? 'light' : 'dark';
  aplicarTema(novo);
  localStorage.setItem('tema', novo);
}

function aplicarTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  const label = document.getElementById('theme-label');
  const icon  = document.getElementById('theme-icon');
  if (t === 'dark') {
    label.textContent = 'Claro';
    icon.innerHTML = `<circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  } else {
    label.textContent = 'Escuro';
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  }
}

/* =============================================
   ABAS — LOGIN / CADASTRO
   ============================================= */
function mostrarAba(aba) {
  document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.login-panel').forEach(p => p.classList.remove('active'));
  limparMensagem('auth-msg');

  if (aba === 'login') {
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('panel-login').classList.add('active');
  } else if (aba === 'cadastro') {
    document.getElementById('tab-cadastro').classList.add('active');
    document.getElementById('panel-cadastro').classList.add('active');
  } else if (aba === 'esqueci') {
    document.getElementById('panel-esqueci').classList.add('active');
  }
}

function mostrarEsqueciSenha() {
  /* Preenche o email do login se já foi digitado */
  const email = document.getElementById('login-email').value;
  if (email) document.getElementById('esqueci-email').value = email;
  mostrarAba('esqueci');
}

/* =============================================
   MENSAGENS DE FEEDBACK
   ============================================= */
function mostrarMensagem(elId, tipo, texto) {
  const el      = document.getElementById(elId);
  const iconEl  = document.getElementById(elId + '-icon');
  const textEl  = document.getElementById(elId + '-text');
  if (!el) return;

  const icons = {
    error:   `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
    success: `<polyline points="20 6 9 17 4 12"/>`,
    info:    `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
    warning: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`
  };

  el.className     = `login-msg ${tipo} show`;
  textEl.innerHTML = texto;
  if (iconEl) iconEl.innerHTML = icons[tipo] || '';
}

function limparMensagem(elId) {
  const el = document.getElementById(elId);
  if (el) { el.className = 'login-msg'; el.querySelector('span').innerHTML = ''; }
}

function setBtnLoading(btnId, loading, textoOriginal) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Aguardando...`;
  } else {
    btn.innerHTML = textoOriginal;
  }
}

/* =============================================
   VALIDAÇÕES
   ============================================= */
function verificarForcaSenha() {
  const senha = document.getElementById('cad-senha').value;
  const bar   = document.getElementById('strength-bar');
  const label = document.getElementById('strength-label');

  let forca = 0;
  if (senha.length >= 6)  forca++;
  if (senha.length >= 10) forca++;
  if (/[A-Z]/.test(senha))forca++;
  if (/[0-9]/.test(senha))forca++;
  if (/[^A-Za-z0-9]/.test(senha)) forca++;

  const config = [
    { pct:'0%',   cor:'transparent', txt:'' },
    { pct:'25%',  cor:'#ef4444',     txt:'Muito fraca' },
    { pct:'50%',  cor:'#f59e0b',     txt:'Fraca' },
    { pct:'75%',  cor:'#3b82f6',     txt:'Boa' },
    { pct:'90%',  cor:'#22c55e',     txt:'Forte' },
    { pct:'100%', cor:'#16a34a',     txt:'Muito forte' },
  ];
  const c = config[forca] || config[0];
  bar.style.width      = c.pct;
  bar.style.background = c.cor;
  label.textContent    = c.txt;
  label.style.color    = c.cor;
}

function verificarConfirmacao() {
  const senha    = document.getElementById('cad-senha').value;
  const confirma = document.getElementById('cad-confirma');
  if (confirma.value && confirma.value !== senha) {
    confirma.classList.add('error');
    confirma.classList.remove('success');
  } else if (confirma.value) {
    confirma.classList.remove('error');
    confirma.classList.add('success');
  }
}

/* =============================================
   CADASTRO
   ============================================= */
async function fazerCadastro() {
  const nome     = document.getElementById('cad-nome').value.trim();
  const email    = document.getElementById('cad-email').value.trim();
  const senha    = document.getElementById('cad-senha').value;
  const confirma = document.getElementById('cad-confirma').value;

  limparMensagem('auth-msg');

  if (!nome)  { mostrarMensagem('auth-msg','error','Informe seu nome completo.'); return; }
  if (!email) { mostrarMensagem('auth-msg','error','Informe seu e-mail.'); return; }
  if (!senha) { mostrarMensagem('auth-msg','error','Informe uma senha.'); return; }
  if (senha.length < 6) { mostrarMensagem('auth-msg','error','A senha deve ter pelo menos 6 caracteres.'); return; }
  if (senha !== confirma) { mostrarMensagem('auth-msg','error','As senhas não conferem.'); return; }

  setBtnLoading('btn-cadastro', true);

  try {
    /* Cadastra no Supabase Auth */
    const { data, error } = await _sb.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome },
        emailRedirectTo: window.location.origin + '/login.html'
      }
    });

    if (error) throw error;

    /* Salva perfil pendente de aprovação */
    if (data.user) {
      await _sb.from('profiles').upsert({
        id:       data.user.id,
        nome,
        email,
        aprovado: false
      });
    }

    _emailPendente = email;
    _nomePendente  = nome;

    mostrarTelaOTP(email);

  } catch(e) {
    const msgs = {
      'User already registered': 'Este e-mail já está cadastrado. Faça login.',
      'Invalid email':           'E-mail inválido.',
      'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
    };
    mostrarMensagem('auth-msg', 'error', msgs[e.message] || e.message);
  } finally {
    setBtnLoading('btn-cadastro', false,
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <line x1="20" y1="8" x2="20" y2="14"/>
        <line x1="23" y1="11" x2="17" y2="11"/>
      </svg> Criar conta`);
  }
}

/* =============================================
   LOGIN
   ============================================= */
async function fazerLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;

  limparMensagem('auth-msg');

  if (!email || !senha) {
    mostrarMensagem('auth-msg', 'error', 'Preencha e-mail e senha.');
    return;
  }

  setBtnLoading('btn-login', true);

  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password: senha });

    if (error) throw error;

    await verificarAcessoERedirencionar(data.user);

  } catch(e) {
    const msgs = {
      'Invalid login credentials':    'E-mail ou senha incorretos.',
      'Email not confirmed':          'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.',
      'Too many requests':            'Muitas tentativas. Aguarde alguns minutos.',
    };
    mostrarMensagem('auth-msg', 'error', msgs[e.message] || e.message);
  } finally {
    setBtnLoading('btn-login', false,
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
        <polyline points="10 17 15 12 10 7"/>
        <line x1="15" y1="12" x2="3" y2="12"/>
      </svg> Entrar no sistema`);
  }
}

/* =============================================
   VERIFICAR ACESSO E REDIRECIONAR
   ============================================= */
async function verificarAcessoERedirencionar(user) {
  /* Busca perfil do usuário */
  const { data: perfil } = await _sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil) {
    /* Perfil não encontrado — cria e mostra pendente */
    await _sb.from('profiles').insert({
      id:       user.id,
      nome:     user.user_metadata?.nome || user.email,
      email:    user.email,
      aprovado: false
    });
    mostrarTelaPendente(user.email, user.user_metadata?.nome || '');
    return;
  }

  if (perfil.aprovado) {
    /* ✅ Aprovado — redireciona para o sistema */
    window.location.href = 'index.html';
  } else {
    /* ⏳ Aguardando aprovação */
    mostrarTelaPendente(perfil.email, perfil.nome);
  }
}

/* =============================================
   OTP — CONFIRMAÇÃO DE E-MAIL
   ============================================= */
function mostrarTelaOTP(email) {
  document.getElementById('screen-auth').style.display = 'none';
  document.getElementById('screen-otp').style.display  = 'block';
  document.getElementById('otp-email-display').textContent = email;
  limparMensagem('otp-msg');
  /* Foca no primeiro campo */
  setTimeout(() => document.getElementById('otp-0').focus(), 100);
  iniciarTimerReenvio();
}

function otpInput(index) {
  const input = document.getElementById(`otp-${index}`);
  const val   = input.value.replace(/\D/g, ''); /* só números */
  input.value = val;

  if (val) {
    input.classList.add('filled');
    /* Avança para próximo campo */
    if (index < 5) document.getElementById(`otp-${index + 1}`).focus();
    else verificarOTP(); /* último dígito: verifica automaticamente */
  } else {
    input.classList.remove('filled');
  }
}

function otpKeydown(event, index) {
  if (event.key === 'Backspace' && !event.target.value && index > 0) {
    document.getElementById(`otp-${index - 1}`).focus();
  }
}

function getOTPCode() {
  return [0,1,2,3,4,5].map(i => document.getElementById(`otp-${i}`).value).join('');
}

async function verificarOTP() {
  const codigo = getOTPCode();
  if (codigo.length < 6) {
    mostrarMensagem('otp-msg', 'warning', 'Digite todos os 6 dígitos do código.');
    return;
  }

  setBtnLoading('btn-verificar', true);
  limparMensagem('otp-msg');

  try {
    const { data, error } = await _sb.auth.verifyOtp({
      email: _emailPendente,
      token: codigo,
      type:  'signup'
    });

    if (error) throw error;

    /* E-mail confirmado → mostra tela de aprovação pendente */
    document.getElementById('screen-otp').style.display     = 'none';
    mostrarTelaPendente(_emailPendente, _nomePendente);

  } catch(e) {
    const msgs = {
      'Token has expired or is invalid': 'Código inválido ou expirado. Solicite um novo.',
      'OTP expired':                     'Código expirado. Clique em "Reenviar código".',
    };
    mostrarMensagem('otp-msg', 'error', msgs[e.message] || 'Código inválido. Tente novamente.');
    /* Limpa campos */
    [0,1,2,3,4,5].forEach(i => {
      const el = document.getElementById(`otp-${i}`);
      el.value = ''; el.classList.remove('filled');
    });
    document.getElementById('otp-0').focus();
  } finally {
    setBtnLoading('btn-verificar', false,
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px">
        <polyline points="20 6 9 17 4 12"/>
      </svg> Verificar código`);
  }
}

async function reenviarOTP() {
  if (_timerReenvio) return; /* ainda no cooldown */

  try {
    const { error } = await _sb.auth.resend({
      type:  'signup',
      email: _emailPendente
    });
    if (error) throw error;
    mostrarMensagem('otp-msg', 'success', 'Novo código enviado para ' + _emailPendente);
    iniciarTimerReenvio();
  } catch(e) {
    mostrarMensagem('otp-msg', 'error', 'Erro ao reenviar: ' + e.message);
  }
}

function iniciarTimerReenvio() {
  let seg = 60;
  const timerEl   = document.getElementById('reenviar-timer');
  const btnEl     = document.getElementById('btn-reenviar');
  if (btnEl)    btnEl.style.pointerEvents = 'none';
  if (timerEl)  timerEl.textContent = ` (${seg}s)`;

  _timerReenvio = setInterval(() => {
    seg--;
    if (timerEl) timerEl.textContent = seg > 0 ? ` (${seg}s)` : '';
    if (seg <= 0) {
      clearInterval(_timerReenvio);
      _timerReenvio = null;
      if (btnEl)   btnEl.style.pointerEvents = '';
      if (timerEl) timerEl.textContent = '';
    }
  }, 1000);
}

/* =============================================
   TELA PENDENTE
   ============================================= */
function mostrarTelaPendente(email, nome) {
  document.getElementById('screen-auth').style.display    = 'none';
  document.getElementById('screen-otp').style.display     = 'none';
  document.getElementById('screen-pending').style.display = 'block';
  document.getElementById('pending-email').textContent    = email;
  document.getElementById('pending-nome').textContent     = nome || '—';
}

async function verificarAprovacao() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) {
    mostrarMensagem('auth-msg', 'info', 'Faça login para verificar.');
    document.getElementById('screen-pending').style.display = 'none';
    document.getElementById('screen-auth').style.display    = 'block';
    return;
  }

  const { data: perfil } = await _sb
    .from('profiles')
    .select('aprovado')
    .eq('id', session.user.id)
    .maybeSingle();

  if (perfil && perfil.aprovado) {
    window.location.href = 'index.html';
  } else {
    /* Mostra feedback visual temporário */
    const btn = document.querySelector('.pending-screen .login-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = '⏳ Ainda aguardando aprovação...';
    btn.style.color = 'var(--amber)';
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 3000);
  }
}

/* =============================================
   REDEFINIR SENHA
   ============================================= */
async function enviarResetSenha() {
  const email = document.getElementById('esqueci-email').value.trim();
  if (!email) { mostrarMensagem('auth-msg', 'error', 'Informe seu e-mail.'); return; }

  try {
    const { error } = await _sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login.html'
    });
    if (error) throw error;
    mostrarMensagem('auth-msg', 'success',
      `Link de redefinição enviado para <strong>${email}</strong>. Verifique sua caixa de entrada.`);
    mostrarAba('login');
  } catch(e) {
    mostrarMensagem('auth-msg', 'error', e.message);
  }
}

/* =============================================
   LOGOUT
   ============================================= */
async function fazerLogout() {
  await _sb.auth.signOut();
  document.getElementById('screen-pending').style.display = 'none';
  document.getElementById('screen-auth').style.display    = 'block';
  mostrarAba('login');
}

/* =============================================
   PAINEL ADMIN
   Acesso: e-mail cadastrado como admin no Supabase
   ============================================= */

/* E-mails com acesso de administrador */
const ADMIN_EMAILS = [
  'geandiehl7@gmail.com',
];

let _adminFiltro    = 'todos';
let _adminUsuarios  = [];

/* Verifica se o usuário logado é admin e mostra o botão */
async function verificarAdmin() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) return;
  if (ADMIN_EMAILS.includes(session.user.email)) {
    const btn = document.getElementById('btn-admin-acesso');
    if (btn) { btn.style.display = 'flex'; }
    document.getElementById('admin-user-email').textContent = session.user.email;
  }
}

async function abrirAdmin() {
  /* Pede senha admin antes de mostrar */
  const senha = prompt('🔐 Senha de administrador:');
  if (!senha) return;

  /* Verifica a senha fazendo login */
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) return;

  const { error } = await _sb.auth.signInWithPassword({
    email:    session.user.email,
    password: senha
  });

  if (error) {
    alert('❌ Senha incorreta.');
    return;
  }

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
    `<div style="text-align:center;padding:40px;color:var(--text3)">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            style="width:28px;height:28px;animation:spin 1s linear infinite;display:block;margin:0 auto 10px">
         <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
       </svg>
       Carregando usuários...
     </div>`;

  const { data, error } = await _sb
    .from('profiles')
    .select('*')
    .order('criado_em', { ascending: false });

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
  const total      = _adminUsuarios.length;
  const aprovados  = _adminUsuarios.filter(u => u.aprovado === true && !u.rejeitado).length;
  const pendentes  = _adminUsuarios.filter(u => !u.aprovado && !u.rejeitado).length;
  const rejeitados = _adminUsuarios.filter(u => u.rejeitado === true).length;

  document.getElementById('admin-stat-total').textContent     = total;
  document.getElementById('admin-stat-aprovados').textContent = aprovados;
  document.getElementById('admin-stat-pendentes').textContent = pendentes;
  document.getElementById('admin-stat-rejeitados').textContent= rejeitados;
}

function filtrarAdmin(filtro, btn) {
  _adminFiltro = filtro;
  document.querySelectorAll('.admin-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderizarAdmin();
}

function renderizarAdmin() {
  const lista = document.getElementById('admin-lista');

  let usuarios = _adminUsuarios;
  if (_adminFiltro === 'pendente')  usuarios = usuarios.filter(u => !u.aprovado && !u.rejeitado);
  if (_adminFiltro === 'aprovado')  usuarios = usuarios.filter(u => u.aprovado && !u.rejeitado);
  if (_adminFiltro === 'rejeitado') usuarios = usuarios.filter(u => u.rejeitado === true);

  if (!usuarios.length) {
    lista.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text3)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
           style="width:38px;height:38px;opacity:.3;display:block;margin:0 auto 10px">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      </svg>
      Nenhum usuário nesta categoria
    </div>`;
    return;
  }

  lista.innerHTML = usuarios.map(u => {
    const isPendente  = !u.aprovado && !u.rejeitado;
    const isAprovado  =  u.aprovado && !u.rejeitado;
    const isRejeitado =  u.rejeitado === true;

    const statusClass = isAprovado ? 'status-aprovado' : isRejeitado ? 'status-rejeitado' : 'status-pendente';
    const statusTxt   = isAprovado ? '✅ Aprovado'     : isRejeitado ? '❌ Rejeitado'      : '⏳ Pendente';

    /* Cor do avatar baseada no nome */
    const cores = ['#4f8ef7','#7c3aed','#22c55e','#f59e0b','#ef4444','#22d3ee'];
    const cor   = cores[(u.nome||'A').charCodeAt(0) % cores.length];
    const ini   = (u.nome||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();

    const dataCad = u.criado_em
      ? new Date(u.criado_em).toLocaleString('pt-BR')
      : '—';

    return `<div class="admin-user-card" id="card-${u.id}">
      <div class="admin-avatar" style="background:${cor}">${ini}</div>
      <div class="admin-user-info">
        <div class="admin-user-nome">${u.nome || '—'}</div>
        <div class="admin-user-email">${u.email || '—'}</div>
        <div class="admin-user-data">📅 Cadastro: ${dataCad}</div>
      </div>
      <span class="admin-status-badge ${statusClass}">${statusTxt}</span>
      <div class="admin-actions">
        ${isPendente || isRejeitado ? `
          <button onclick="aprovarUsuario('${u.id}','${(u.nome||'').replace(/'/g,"\\'")}','${u.email}')"
            style="background:rgba(34,197,94,.12);color:var(--green);border:1px solid rgba(34,197,94,.25);
              border-radius:8px;padding:7px 14px;cursor:pointer;font-size:12px;font-weight:700;
              font-family:var(--font);display:flex;align-items:center;gap:5px;transition:all .2s"
            onmouseover="this.style.background='rgba(34,197,94,.22)'"
            onmouseout="this.style.background='rgba(34,197,94,.12)'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Aprovar
          </button>` : ''}
        ${isPendente || isAprovado ? `
          <button onclick="rejeitarUsuario('${u.id}','${(u.nome||'').replace(/'/g,"\\'")}','${u.email}')"
            style="background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.25);
              border-radius:8px;padding:7px 14px;cursor:pointer;font-size:12px;font-weight:700;
              font-family:var(--font);display:flex;align-items:center;gap:5px;transition:all .2s"
            onmouseover="this.style.background='rgba(239,68,68,.22)'"
            onmouseout="this.style.background='rgba(239,68,68,.12)'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Rejeitar
          </button>` : ''}
        <button onclick="excluirUsuario('${u.id}','${(u.nome||'').replace(/'/g,"\\'")}','${u.email}')"
          style="background:rgba(100,116,139,.1);color:var(--text3);border:1px solid var(--border);
            border-radius:8px;padding:7px 10px;cursor:pointer;font-size:12px;
            font-family:var(--font);display:flex;align-items:center;gap:4px;transition:all .2s"
          title="Excluir usuário"
          onmouseover="this.style.background='rgba(239,68,68,.12)';this.style.color='var(--red)'"
          onmouseout="this.style.background='rgba(100,116,139,.1)';this.style.color='var(--text3)'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          </svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function aprovarUsuario(id, nome, email) {
  if (!confirm(`Aprovar acesso de "${nome}" (${email})?`)) return;

  const { error } = await _sb
    .from('profiles')
    .update({ aprovado: true, rejeitado: false })
    .eq('id', id);

  if (error) { alert('Erro: ' + error.message); return; }

  /* Atualiza lista local */
  const u = _adminUsuarios.find(x => x.id === id);
  if (u) { u.aprovado = true; u.rejeitado = false; }

  atualizarStatsAdmin();
  renderizarAdmin();
  mostrarToastAdmin(`✅ ${nome} aprovado com sucesso!`, 'green');
}

async function rejeitarUsuario(id, nome, email) {
  if (!confirm(`Rejeitar acesso de "${nome}" (${email})?\nO usuário não poderá entrar no sistema.`)) return;

  const { error } = await _sb
    .from('profiles')
    .update({ aprovado: false, rejeitado: true })
    .eq('id', id);

  if (error) { alert('Erro: ' + error.message); return; }

  const u = _adminUsuarios.find(x => x.id === id);
  if (u) { u.aprovado = false; u.rejeitado = true; }

  atualizarStatsAdmin();
  renderizarAdmin();
  mostrarToastAdmin(`❌ ${nome} rejeitado.`, 'red');
}

async function excluirUsuario(id, nome, email) {
  if (!confirm(`Excluir permanentemente "${nome}" (${email})?\nEsta ação não pode ser desfeita.`)) return;

  const { error } = await _sb.from('profiles').delete().eq('id', id);
  if (error) { alert('Erro ao excluir perfil: ' + error.message); return; }

  _adminUsuarios = _adminUsuarios.filter(x => x.id !== id);
  atualizarStatsAdmin();
  renderizarAdmin();
  mostrarToastAdmin(`🗑️ Usuário ${nome} excluído.`, 'gray');
}

function mostrarToastAdmin(msg, cor) {
  /* Toast simples dentro do painel admin */
  const cores = {
    green: { bg:'rgba(34,197,94,.12)',  border:'rgba(34,197,94,.3)',  color:'#16a34a' },
    red:   { bg:'rgba(239,68,68,.12)',  border:'rgba(239,68,68,.3)',  color:'#dc2626' },
    gray:  { bg:'rgba(100,116,139,.1)', border:'var(--border)',       color:'var(--text2)' },
  };
  const c = cores[cor] || cores.gray;
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;
    background:${c.bg};border:1px solid ${c.border};color:${c.color};
    padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;
    z-index:2000;box-shadow:0 8px 24px rgba(0,0,0,.25);
    transform:translateY(60px);opacity:0;transition:all .3s;
    font-family:var(--font);
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.transform = 'translateY(0)'; t.style.opacity = '1'; }, 10);
  setTimeout(() => {
    t.style.transform = 'translateY(60px)'; t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}
