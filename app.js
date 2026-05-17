/* =============================================
   SISTEMA DE TRANSPORTE ESCOLAR — app.js v5
   Correções:
   - Bloqueia motorista de escanear seu próprio crachá na rota
   - Mapa RH centralizado em Santa Cruz do Sul
   - Turnos: 1º Turno | Turno Normal | 2º Turno | 3º Turno
   - Tipo de rota removido → apenas turno
   - Responsivo mobile
   ============================================= */

/* ---- Estado ---- */
let nfcReader       = null;
let nfcIDReader     = null;
let nfcCapturing    = false;
let mapMotorista    = null;
let markerMotorista = null;
let mapRH           = null;
let marcadoresRH    = [];
let sessaoAtiva     = null;
let leituraCount    = 0;
let motoristaFluxo  = null;
let rotaSelecionada = null;
let turnoSelecionado= '1º Turno';

/* Santa Cruz do Sul, RS */
const SCS_LAT  = -29.7176;
const SCS_LNG  = -52.4341;
const SCS_ZOOM = 13;

const ROTAS_DISPONIVEIS = [
  { num:'01', desc:'Centro → Escola Municipal João XXIII' },
  { num:'02', desc:'Bairro Norte → EMEF Dom Bosco' },
  { num:'03', desc:'Bairro Sul → Escola Estadual' },
  { num:'04', desc:'Bairro Leste → EMEI Girassol' },
  { num:'05', desc:'Interior → Escola Rural São Luís' },
  { num:'06', desc:'Bairro Oeste → Colégio Estadual' },
  { num:'07', desc:'Linha Colonial → Escola Municipal' },
  { num:'08', desc:'Vila Nova → EMEF Santos Dumont' },
];

/* Mapa de turnos para classe de badge */
function turnoClass(t) {
  if (!t) return '';
  const m = { '1º Turno':'1turno','Turno Normal':'turnonormal','2º Turno':'2turno','3º Turno':'3turno' };
  return m[t] || '1turno';
}

/* =============================================
   INIT
   ============================================= */
(async () => {
  await openDB();
  await seedIfEmpty();
  await renderTable();
  await inicializarMapaRH();
  await populaFiltroMotoristas();
  checkNFCSupportID();
  iniciarRelogio();
  carregarTema();
  document.getElementById('hist-data').value = new Date().toISOString().slice(0,10);
  await renderHistorico();
})();

/* =============================================
   RELÓGIO
   ============================================= */
function iniciarRelogio() {
  const el = document.getElementById('footer-clock');
  const t  = () => { el.textContent = new Date().toLocaleString('pt-BR'); };
  t(); setInterval(t, 1000);
}

/* =============================================
   TEMA
   ============================================= */
function carregarTema() { aplicarTema(localStorage.getItem('tema') || 'dark'); }
function toggleTheme() {
  const n = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
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
  setTimeout(() => {
    if (mapMotorista) mapMotorista.invalidateSize();
    if (mapRH)        mapRH.invalidateSize();
  }, 350);
}

/* =============================================
   NAV
   ============================================= */
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  btn.classList.add('active');
  if (id === 'rh')        { renderTable(); setTimeout(() => mapRH && mapRH.invalidateSize(), 300); }
  if (id === 'motorista') { setTimeout(() => mapMotorista && mapMotorista.invalidateSize(), 300); }
  if (id === 'historico') { populaFiltroMotoristas(); renderHistorico(); }
}

/* =============================================
   TOAST
   ============================================= */
function toast(msg, tipo = 'success') {
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  el.className = `toast ${tipo}`;
  const icons = {
    success:`<polyline points="20 6 9 17 4 12"/>`,
    error:  `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
    info:   `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
    warning:`<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`
  };
  document.getElementById('toast-icon').innerHTML = icons[tipo] || icons.success;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

/* =============================================
   PAINEL RH — TABELA
   ============================================= */
async function renderTable() {
  const todos  = await dbGetAll();
  const busca  = (document.getElementById('search-input').value || '').toLowerCase();
  const turno  = document.getElementById('filter-turno').value;
  const status = document.getElementById('filter-status').value;
  const tipo   = document.getElementById('filter-tipo').value;

  const f = todos.filter(x => {
    const q = !busca || x.nome.toLowerCase().includes(busca) ||
              x.matricula.toLowerCase().includes(busca) || (x.uid||'').toLowerCase().includes(busca);
    const t = !turno  || x.turno === turno;
    const s = !status || (status === 'ativo' ? x.ativo !== false : x.ativo === false);
    const p = !tipo   || (tipo === 'motorista' ? x.motorista === true : x.motorista !== true);
    return q && t && s && p;
  });

  document.getElementById('stat-total').textContent      = todos.length;
  document.getElementById('stat-ativos').textContent     = todos.filter(x => x.ativo !== false).length;
  document.getElementById('stat-inativos').textContent   = todos.filter(x => x.ativo === false).length;
  document.getElementById('stat-motoristas').textContent = todos.filter(x => x.motorista === true).length;
  document.getElementById('stat-t1').textContent         = todos.filter(x => x.turno === '1º Turno').length;
  document.getElementById('stat-tn').textContent         = todos.filter(x => x.turno === 'Turno Normal').length;
  document.getElementById('stat-t2').textContent         = todos.filter(x => x.turno === '2º Turno').length;
  document.getElementById('stat-t3').textContent         = todos.filter(x => x.turno === '3º Turno').length;

  const tbody = document.getElementById('table-body');
  if (!f.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      </svg><div>Nenhum funcionário encontrado</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = f.map(x => `
    <tr>
      <td><code class="matricula-code">${x.matricula}</code></td>
      <td style="font-weight:600">${x.nome}</td>
      <td>${x.motorista ? `<span class="badge badge-motorista">🚌 Motorista</span>` : `<span class="badge badge-funcionario">👤 Func.</span>`}</td>
      <td><span class="badge badge-${turnoClass(x.turno)}">${x.turno}</span></td>
      <td><span class="badge ${x.ativo!==false?'badge-ativo':'badge-inativo'}">${x.ativo!==false?'● Ativo':'○ Inativo'}</span></td>
      <td>${x.uid ? `<code style="font-size:10px;color:var(--accent);background:var(--bg3);padding:2px 5px;border-radius:4px;border:1px solid var(--border)">${x.uid}</code>` : `<span style="color:var(--text3);font-size:11px">—</span>`}</td>
      <td style="color:var(--text2);font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x.endereco}">${x.endereco}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-edit btn-sm" onclick="abrirEdicao(${x.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>Editar</button>
          <button class="btn btn-danger btn-sm" onclick="confirmarExclusao(${x.id},'${x.nome.replace(/'/g,"\\'")}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            </svg>Excluir</button>
        </div>
      </td>
    </tr>`).join('');
}

/* =============================================
   MODAL RH
   ============================================= */
function openModal() {
  document.getElementById('modal-title').textContent = 'Novo Funcionário';
  ['edit-id','f-matricula','f-nome','f-endereco','f-uid'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-turno').value = '';
  document.getElementById('f-ativo').checked = true;
  document.getElementById('f-motorista').checked = false;
  document.getElementById('f-matricula').disabled = false;
  /* Garante campos habilitados */
  document.getElementById('f-turno').disabled    = false;
  document.getElementById('f-endereco').disabled = false;
  document.getElementById('group-turno').classList.remove('disabled-field');
  document.getElementById('group-endereco').classList.remove('disabled-field');
  const aviso = document.getElementById('aviso-motorista');
  if (aviso) aviso.style.display = 'none';
  atualizarLabelAtivo(); atualizarLabelMotorista();
  document.getElementById('modal').classList.add('open');
}
function closeModal() { nfcCapturing = false; resetUidBtn(); document.getElementById('modal').classList.remove('open'); }
function atualizarLabelAtivo() {
  document.getElementById('label-ativo').textContent =
    document.getElementById('f-ativo').checked ? 'Funcionário Ativo' : 'Funcionário Inativo';
}
function atualizarLabelMotorista() {
  const isMotorista = document.getElementById('f-motorista').checked;

  /* Label do toggle */
  document.getElementById('label-motorista').textContent =
    isMotorista ? 'Motorista (aparece no mapa)' : 'Funcionário (não motorista)';

  /* Desabilita / habilita turno */
  const turnoEl   = document.getElementById('f-turno');
  const endEl     = document.getElementById('f-endereco');
  const groupT    = document.getElementById('group-turno');
  const groupE    = document.getElementById('group-endereco');
  const aviso     = document.getElementById('aviso-motorista');

  if (isMotorista) {
    turnoEl.disabled = true;
    endEl.disabled   = true;
    turnoEl.value    = '';
    groupT.classList.add('disabled-field');
    groupE.classList.add('disabled-field');
    if (aviso) aviso.style.display = 'block';
  } else {
    turnoEl.disabled = false;
    endEl.disabled   = false;
    groupT.classList.remove('disabled-field');
    groupE.classList.remove('disabled-field');
    if (aviso) aviso.style.display = 'none';
  }
}
async function abrirEdicao(id) {
  const x = await dbGetById(id); if (!x) return;
  document.getElementById('modal-title').textContent = 'Editar Funcionário';
  document.getElementById('edit-id').value    = x.id;
  document.getElementById('f-matricula').value= x.matricula;
  document.getElementById('f-nome').value     = x.nome;
  document.getElementById('f-turno').value    = x.turno || '';
  document.getElementById('f-endereco').value = x.endereco || '';
  document.getElementById('f-uid').value      = x.uid || '';
  document.getElementById('f-ativo').checked     = x.ativo !== false;
  document.getElementById('f-motorista').checked = x.motorista === true;
  document.getElementById('f-matricula').disabled = true;
  atualizarLabelAtivo();
  atualizarLabelMotorista(); /* aplica disabled se for motorista */
  document.getElementById('modal').classList.add('open');
}
async function salvarFuncionario() {
  const id       = document.getElementById('edit-id').value;
  const mat      = document.getElementById('f-matricula').value.trim();
  const nome     = document.getElementById('f-nome').value.trim();
  const turno    = document.getElementById('f-turno').value;
  const end      = document.getElementById('f-endereco').value.trim();
  const uid      = document.getElementById('f-uid').value.trim().toUpperCase();
  const ativo    = document.getElementById('f-ativo').checked;
  const motorista= document.getElementById('f-motorista').checked;

  /* Motorista não precisa de turno nem endereço */
  if (!mat || !nome) { toast('Preencha matrícula e nome.','error'); return; }
  if (!motorista && !turno) { toast('Selecione o turno do funcionário.','error'); return; }

  try {
    const d = {
      matricula: mat, nome,
      turno:    motorista ? '' : turno,
      endereco: motorista ? '' : end,
      uid, ativo, motorista
    };
    if (id) d.id = Number(id) || id;
    await dbSave(d);
    toast(id ? 'Atualizado com sucesso!' : 'Cadastrado com sucesso!');
    closeModal(); await renderTable(); await atualizarMapaRH(); await populaFiltroMotoristas();
  } catch(e) { toast('Matrícula já cadastrada ou erro ao salvar.','error'); }
}
async function confirmarExclusao(id, nome) {
  if (!confirm(`Excluir "${nome}"?`)) return;
  await dbDelete(id); toast('Removido.');
  await renderTable(); await atualizarMapaRH(); await populaFiltroMotoristas();
}

/* UID NFC no modal */
function resetUidBtn() {
  const b = document.getElementById('btn-capture-uid'); if (!b) return;
  b.style.background = '';
  b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M20 7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2"/>
    <path d="M4 7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2"/>
    <path d="M12 8v8"/><path d="M8 10v4"/><path d="M16 10v4"/></svg>Ler NFC`;
}
async function capturarUID() {
  if (!('NDEFReader' in window)) { toast('NFC não disponível. Cole manualmente.','info'); return; }
  nfcCapturing = true;
  const b = document.getElementById('btn-capture-uid');
  b.style.background = 'var(--amber)';
  b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Aguardando...`;
  try {
    const r = new NDEFReader(); await r.scan();
    r.onreading = (ev) => {
      if (!nfcCapturing) return;
      const uid = (ev.serialNumber||'').toUpperCase();
      document.getElementById('f-uid').value = uid;
      nfcCapturing = false;
      b.style.background = 'var(--green)';
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${uid}`;
      toast(`UID: ${uid}`);
      setTimeout(resetUidBtn, 3000);
    };
    r.onreadingerror = () => { nfcCapturing = false; resetUidBtn(); toast('Erro ao ler','error'); };
  } catch(e) { nfcCapturing = false; resetUidBtn(); toast('NFC negado: '+e.message,'error'); }
}

/* =============================================
   FLUXO MOTORISTA — ETAPA 1
   ============================================= */
function checkNFCSupportID() {
  const el = document.getElementById('id-nfc-support'); if (!el) return;
  if ('NDEFReader' in window) {
    el.textContent = '✓ NFC disponível'; el.style.color = 'var(--green)';
  } else {
    el.textContent = '✗ NFC indisponível — use a matrícula'; el.style.color = 'var(--red)';
    const b = document.getElementById('btn-id-nfc');
    if (b) { b.disabled = true; b.style.opacity = '.5'; }
  }
}

async function startIDNFC() {
  if (!('NDEFReader' in window)) { toast('NFC não suportado.','error'); return; }
  const icon = document.getElementById('id-nfc-icon');
  const hint = document.getElementById('id-nfc-hint');
  icon.className = 'nfc-icon reading';
  hint.textContent = 'Aguardando... Aproxime seu crachá';
  document.getElementById('btn-id-nfc').disabled = true;

  try {
    nfcIDReader = new NDEFReader(); await nfcIDReader.scan();
    nfcIDReader.onreading = async (ev) => {
      const uid = (ev.serialNumber||'').toUpperCase();
      icon.className = 'nfc-icon';
      document.getElementById('btn-id-nfc').disabled = false;
      const f = uid ? await dbGetByUID(uid) : null;
      if (f) {
        if (!f.motorista) { toast(`${f.nome} não é motorista.`,'warning'); hint.textContent='Aproxime seu crachá'; return; }
        if (f.ativo === false) { toast(`${f.nome} está inativo.`,'error'); hint.textContent='Aproxime seu crachá'; return; }
        concluirIdentificacao(f);
      } else {
        toast(`UID ${uid} não vinculado. Use a matrícula.`,'warning');
        hint.textContent = 'Não encontrado. Use a matrícula.';
      }
    };
    nfcIDReader.onreadingerror = () => {
      icon.className = 'nfc-icon'; document.getElementById('btn-id-nfc').disabled = false;
    };
  } catch(e) {
    icon.className = 'nfc-icon'; toast('Permissão NFC negada.','error');
    document.getElementById('btn-id-nfc').disabled = false;
  }
}

async function identificarMotorista() {
  const val = document.getElementById('id-matricula').value.trim();
  if (!val) { toast('Informe a matrícula','error'); return; }
  let f = await dbGetByMatricula(val);
  if (!f && (val.includes(':') || /^[0-9A-Fa-f]{4,}$/.test(val.replace(/:/g,'')))) {
    f = await dbGetByUID(val.toUpperCase());
  }
  if (!f) { toast('Não encontrado: ' + val,'error'); return; }
  if (!f.motorista) { toast(`${f.nome} não é motorista.`,'warning'); return; }
  if (f.ativo === false) { toast(`${f.nome} está inativo.`,'error'); return; }
  concluirIdentificacao(f);
}

function concluirIdentificacao(f) {
  motoristaFluxo = f;
  document.getElementById('id-matricula').value = '';
  const ini = f.nome.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  document.getElementById('mot-avatar').textContent = ini;
  document.getElementById('mot-nome').textContent   = f.nome;
  document.getElementById('mot-meta').textContent   = `Mat. ${f.matricula} · ${f.turno}`;

  /* Monta rotas */
  document.getElementById('rota-select-group').innerHTML =
    ROTAS_DISPONIVEIS.map(r => `
      <div class="rota-option" onclick="selecionarRota(this,'${r.num}')">
        <div class="rota-option-num">${r.num}</div>
        <div class="rota-option-info">
          <div class="rota-option-label">Rota ${r.num}</div>
          <div class="rota-option-meta">${r.desc}</div>
        </div>
        <div class="rota-option-check"></div>
      </div>`).join('');

  rotaSelecionada  = null;
  turnoSelecionado = f.turno || '1º Turno';

  /* Sincroniza pill de turno */
  document.querySelectorAll('#turno-pills .filter-pill').forEach(p => {
    p.classList.toggle('active', p.textContent.trim().replace(/^[^\s]+\s/,'') === turnoSelecionado ||
      p.textContent.includes(turnoSelecionado));
  });
  document.getElementById('cr-turno').value = turnoSelecionado;

  irParaEtapa('step-criar');
  toast(`Olá, ${f.nome.split(' ')[0]}! Selecione a rota.`);
}

function voltarIdentificacao() {
  motoristaFluxo = null; rotaSelecionada = null;
  document.getElementById('id-matricula').value = '';
  const icon = document.getElementById('id-nfc-icon');
  if (icon) icon.className = 'nfc-icon';
  const hint = document.getElementById('id-nfc-hint');
  if (hint) hint.textContent = 'Aproxime seu crachá para identificação automática';
  irParaEtapa('step-identificar');
}

/* =============================================
   FLUXO — ETAPA 2
   ============================================= */
function selecionarRota(el, num) {
  document.querySelectorAll('.rota-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  rotaSelecionada = num;
}

function selecionarTurno(el, turno) {
  document.querySelectorAll('#turno-pills .filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  turnoSelecionado = turno;
  document.getElementById('cr-turno').value = turno;
}

function irParaPrevia() {
  if (!rotaSelecionada) { toast('Selecione o número da rota.','error'); return; }
  const placa = document.getElementById('cr-placa').value.trim().toUpperCase();
  if (!placa) { toast('Informe a placa do veículo.','error'); return; }
  const rotaInfo = ROTAS_DISPONIVEIS.find(r => r.num === rotaSelecionada);
  document.getElementById('preview-grid').innerHTML = `
    <div class="preview-item">
      <div class="preview-item-label">👤 Motorista</div>
      <div class="preview-item-value">${motoristaFluxo.nome.split(' ').slice(0,2).join(' ')}</div>
    </div>
    <div class="preview-item">
      <div class="preview-item-label">🪪 Matrícula</div>
      <div class="preview-item-value" style="font-family:'Courier New',monospace;color:var(--accent)">${motoristaFluxo.matricula}</div>
    </div>
    <div class="preview-item">
      <div class="preview-item-label">🚗 Placa</div>
      <div class="preview-item-value" style="font-family:'Courier New',monospace;color:var(--accent)">${placa}</div>
    </div>
    <div class="preview-item">
      <div class="preview-item-label">🛣️ Rota</div>
      <div class="preview-item-value">Rota ${rotaSelecionada}</div>
    </div>
    <div class="preview-item" style="grid-column:1/-1">
      <div class="preview-item-label">🕐 Turno</div>
      <div class="preview-item-value">${turnoSelecionado}</div>
    </div>
    ${rotaInfo ? `<div class="preview-item" style="grid-column:1/-1">
      <div class="preview-item-label">📍 Trajeto</div>
      <div class="preview-item-value" style="font-size:13px;font-weight:500">${rotaInfo.desc}</div>
    </div>` : ''}`;
  irParaEtapa('step-confirmar');
}

function voltarCriarRota() { irParaEtapa('step-criar'); }

/* =============================================
   FLUXO — ETAPA 3: INICIAR
   ============================================= */
async function iniciarRota() {
  const placa = document.getElementById('cr-placa').value.trim().toUpperCase();
  const hora  = new Date().toLocaleTimeString('pt-BR',{ hour:'2-digit', minute:'2-digit' });
  const data  = new Date().toISOString().slice(0,10);

  sessaoAtiva = {
    nome:      motoristaFluxo.nome,
    matricula: motoristaFluxo.matricula,
    uid:       motoristaFluxo.uid || '',
    placa,
    rota:      rotaSelecionada,
    turno:     turnoSelecionado,
    hora,
    data,
    inicioISO: new Date().toISOString(),
  };
  leituraCount = 0;

  const id = await rotaSave({ ...sessaoAtiva });
  sessaoAtiva.id = id;

  document.getElementById('sess-nome').textContent  = motoristaFluxo.nome;
  document.getElementById('sess-placa').textContent = placa;
  document.getElementById('sess-rota').textContent  = 'Rota ' + rotaSelecionada;
  document.getElementById('sess-turno').textContent = turnoSelecionado;
  document.getElementById('sess-hora').textContent  = hora;
  document.getElementById('sessao-subtitle').textContent =
    `${motoristaFluxo.nome} · Placa ${placa} · Rota ${rotaSelecionada} · ${turnoSelecionado}`;

  atualizarContadorLeituras();
  checkNFCSupportPainel();
  irParaEtapa('step-painel');
  toast(`Rota ${rotaSelecionada} iniciada!`);
  await atualizarMapaRH();
}

async function encerrarRota() {
  if (!confirm('Encerrar a rota? Os dados serão salvos no Histórico.')) return;
  const fim    = new Date().toLocaleTimeString('pt-BR',{ hour:'2-digit', minute:'2-digit' });
  const durMin = Math.round((Date.now() - new Date(sessaoAtiva.inicioISO).getTime()) / 60000);

  await histSave({
    motorista:  sessaoAtiva.nome,
    matricula:  sessaoAtiva.matricula,
    placa:      sessaoAtiva.placa,
    numeroRota: sessaoAtiva.rota,
    tipoTurno:  sessaoAtiva.turno,
    turno:      sessaoAtiva.turno,
    inicio:     sessaoAtiva.hora,
    fim,
    data:       sessaoAtiva.data,
    duracaoMin: durMin,
    leituras:   leituraCount,
  });

  if (sessaoAtiva.id) await rotaDelete(sessaoAtiva.id);
  sessaoAtiva = null; leituraCount = 0;

  document.getElementById('employee-card').classList.remove('visible');
  document.getElementById('uid-display').classList.remove('visible');
  document.getElementById('map').style.display = 'none';
  document.getElementById('map-placeholder').style.display = 'flex';
  setNFCState('idle','Aguardando crachá','Ative e aproxime o crachá');
  limparLog();
  motoristaFluxo = null; rotaSelecionada = null;
  irParaEtapa('step-identificar');
  toast('Rota encerrada e salva!');
  await atualizarMapaRH();
}

function irParaEtapa(id) {
  ['step-identificar','step-criar','step-confirmar','step-painel'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = (s === id) ? 'block' : 'none';
  });
}

/* =============================================
   NFC — PAINEL DA ROTA
   ============================================= */
function checkNFCSupportPainel() {
  const b = document.getElementById('nfc-support-badge'); if (!b) return;
  if ('NDEFReader' in window) {
    b.textContent = '✓ NFC OK'; b.style.color = 'var(--green)';
  } else {
    b.textContent = '✗ NFC indisponível'; b.style.color = 'var(--red)';
    const btn = document.getElementById('btn-start-nfc');
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  }
}

async function startNFC() {
  if (!('NDEFReader' in window)) { toast('NFC não suportado.','error'); return; }
  setNFCState('reading','Aguardando...','Aproxime o crachá do aluno agora');
  document.getElementById('btn-start-nfc').disabled = true;
  try {
    nfcReader = new NDEFReader(); await nfcReader.scan();
    nfcReader.onreadingerror = () => {
      setNFCState('error','Erro','Tente novamente');
      toast('Erro ao ler','error');
      document.getElementById('btn-start-nfc').disabled = false;
    };
    nfcReader.onreading = (ev) => {
      const uid = (ev.serialNumber||'').toUpperCase();
      document.getElementById('uid-display').textContent = 'UID: ' + (uid||'(vazio)');
      document.getElementById('uid-display').classList.add('visible');
      if (uid) identificarPorUID(uid);
      else {
        for (const rec of ev.message.records) {
          if (rec.recordType === 'text') {
            identificarPorMatricula(new TextDecoder(rec.encoding||'utf-8').decode(rec.data).trim());
            return;
          }
        }
        setNFCState('error','Sem dados','Crachá não reconhecido');
      }
    };
  } catch(e) {
    setNFCState('error','Permissão negada',e.message);
    toast('Permissão NFC negada','error');
    document.getElementById('btn-start-nfc').disabled = false;
  }
}

function setNFCState(estado, label, hint) {
  const icon = document.getElementById('nfc-icon'); if (!icon) return;
  icon.className = estado !== 'idle' ? `nfc-icon ${estado}` : 'nfc-icon';
  document.getElementById('nfc-label').textContent = label;
  document.getElementById('nfc-hint').textContent  = hint;
}

async function buscarManual() {
  const val = document.getElementById('manual-matricula').value.trim();
  if (!val) { toast('Informe matrícula ou UID','error'); return; }
  document.getElementById('manual-matricula').value = '';
  if (val.includes(':') || /^[0-9A-Fa-f]{4,}$/.test(val.replace(/:/g,'')))
    await identificarPorUID(val.toUpperCase());
  else
    await identificarPorMatricula(val);
}

/* ---- BLOQUEIO: motorista não pode escanear o próprio crachá ---- */
async function identificarPorUID(uid) {
  /* Verifica se é o próprio motorista */
  if (sessaoAtiva && sessaoAtiva.uid && uid === sessaoAtiva.uid.toUpperCase()) {
    setNFCState('error','Identificação inválida','O motorista não pode identificar seu próprio crachá durante a rota.');
    toast('Você não pode identificar seu próprio crachá!','warning');
    adicionarLog(uid, '[Motorista - bloqueado]', null);
    return;
  }
  const f = await dbGetByUID(uid);
  if (f) {
    /* Também bloqueia se a matrícula for igual */
    if (sessaoAtiva && f.matricula === sessaoAtiva.matricula) {
      setNFCState('error','Identificação inválida','O motorista não pode identificar seu próprio crachá.');
      toast('Você não pode identificar seu próprio crachá!','warning');
      return;
    }
    exibirFuncionario(f, uid); adicionarLog(uid, f.nome, f.ativo);
    await carregarMapaMotorista(f.endereco, f.nome);
  } else {
    setNFCState('error','UID não cadastrado',`UID: ${uid} — vincule no RH.`);
    toast(`UID ${uid} não vinculado`,'error');
    adicionarLog(uid, null, null);
  }
}

async function identificarPorMatricula(mat) {
  /* Verifica se é o próprio motorista */
  if (sessaoAtiva && mat === sessaoAtiva.matricula) {
    setNFCState('error','Identificação inválida','O motorista não pode identificar sua própria matrícula durante a rota.');
    toast('Você não pode identificar sua própria matrícula!','warning');
    return;
  }
  const f = await dbGetByMatricula(mat);
  if (f) {
    exibirFuncionario(f, f.uid||'—'); adicionarLog(mat, f.nome, f.ativo);
    await carregarMapaMotorista(f.endereco, f.nome);
  } else {
    setNFCState('error','Não encontrado',`"${mat}" não cadastrado`);
    toast('Não encontrado: '+mat,'error');
    adicionarLog(mat, null, null);
  }
}

function exibirFuncionario(f, uid) {
  const inativo = f.ativo === false;
  setNFCState(inativo?'error':'success', inativo?'⚠ Inativo':'✓ Identificado', f.nome);
  document.getElementById('employee-card').classList.add('visible');
  document.getElementById('emp-avatar').textContent    = f.nome.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  document.getElementById('emp-name').textContent      = f.nome;
  document.getElementById('emp-matricula').textContent = 'Mat. '+f.matricula;
  document.getElementById('emp-endereco').textContent  = f.endereco;
  const sb = document.getElementById('emp-status-badge');
  sb.textContent = f.ativo!==false?'● Ativo':'○ Inativo';
  sb.className   = `badge ${f.ativo!==false?'badge-ativo':'badge-inativo'}`;
  const tb = document.getElementById('emp-turno-badge');
  tb.textContent = f.turno; tb.className = `badge badge-${turnoClass(f.turno)}`;
  const pb = document.getElementById('emp-tipo-badge');
  pb.textContent = f.motorista?'🚌 Motorista':'👤 Funcionário';
  pb.className   = `badge ${f.motorista?'badge-motorista':'badge-funcionario'}`;
  if (inativo) toast(`⚠ ${f.nome} está INATIVO!`,'error');
  leituraCount++;
  atualizarContadorLeituras();
}

function atualizarContadorLeituras() {
  const el = document.getElementById('leituras-count');
  if (el) el.textContent = leituraCount;
}

/* =============================================
   MAPA MOTORISTA
   ============================================= */
async function carregarMapaMotorista(endereco, nome) {
  const ph = document.getElementById('map-placeholder');
  const dv = document.getElementById('map');
  ph.style.display = 'flex';
  ph.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
    style="width:32px;height:32px;animation:spin 1s linear infinite">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    <span style="font-size:12px">Localizando...</span>`;
  dv.style.display = 'none';
  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endereco)}&format=json&limit=1`,{headers:{'Accept-Language':'pt-BR'}});
    const data = await resp.json();
    if (!data||!data.length) {
      ph.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px;opacity:.3"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span style="font-size:12px">Endereço não encontrado</span>`;
      return;
    }
    const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
    ph.style.display = 'none'; dv.style.display = 'block';
    if (!mapMotorista) {
      mapMotorista = L.map('map').setView([lat,lon],15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(mapMotorista);
    } else { mapMotorista.setView([lat,lon],15); }
    if (markerMotorista) markerMotorista.remove();
    markerMotorista = L.marker([lat,lon]).addTo(mapMotorista)
      .bindPopup(`<b>${nome}</b><br><small>${endereco}</small>`).openPopup();
    setTimeout(() => mapMotorista.invalidateSize(), 300);
  } catch(e) {
    ph.innerHTML = `<span style="font-size:12px;color:var(--red)">Erro: ${e.message}</span>`;
  }
}

/* =============================================
   MAPA RH — centrado em Santa Cruz do Sul
   ============================================= */
async function inicializarMapaRH() {
  mapRH = L.map('map-rh', {
    minZoom: 12,   /* não deixa afastar mais que a cidade */
    maxZoom: 16,   /* não deixa aproximar demais           */
  }).setView([SCS_LAT, SCS_LNG], SCS_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
  }).addTo(mapRH);
  await atualizarMapaRH();
}

async function atualizarMapaRH() {
  if (!mapRH) return;
  marcadoresRH.forEach(m => m.remove()); marcadoresRH = [];
  const todos      = await dbGetAll();
  const motoristas = todos.filter(f => f.motorista === true);
  const rotas      = await rotaGetAll();
  const bar        = document.getElementById('mapa-status-bar');

  /* Só mostra motoristas que têm rota ativa */
  const emRota = motoristas.filter(f =>
    rotas.some(r => r.matricula === f.matricula)
  );

  bar.innerHTML = `<span>Motoristas: <strong>${motoristas.length}</strong></span>
    <span style="color:var(--border)">·</span>
    <span style="color:var(--green)">Ativos: <strong>${motoristas.filter(f=>f.ativo!==false).length}</strong></span>
    <span style="color:var(--border)">·</span>
    <span style="color:var(--cyan)">Em rota agora: <strong>${rotas.length}</strong></span>
    <span style="margin-left:auto;font-size:11px;color:var(--text3)">Geocodificando rotas ativas...</span>`;

  if (!emRota.length) {
    bar.innerHTML = `<span>Motoristas: <strong>${motoristas.length}</strong></span>
      <span style="color:var(--border)">·</span>
      <span style="color:var(--cyan)">Em rota agora: <strong>0</strong></span>
      <span style="margin-left:auto;font-size:11px;color:var(--text3)">Nenhuma rota em andamento</span>`;
    mapRH.setView([SCS_LAT, SCS_LNG], SCS_ZOOM);
    return;
  }

  const bounds = []; let ok = 0;

  for (const f of emRota) {
    if (!f.endereco) continue;
    try {
      await new Promise(r => setTimeout(r, 350));
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(f.endereco)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      );
      const data = await resp.json();
      if (!data || !data.length) continue;

      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      const rotaAtiva = rotas.find(r => r.matricula === f.matricula);

      /* Ícone de ônibus SVG inline */
      const icone = L.divIcon({
        className: '',
        html: `<div style="
          position:relative;
          width:46px;height:46px;
          border-radius:50%;
          background:#22d3ee;
          border:3px solid #fff;
          box-shadow:0 3px 12px rgba(0,0,0,.45);
          display:flex;align-items:center;justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"
               width="22" height="22">
            <rect x="1" y="3" width="15" height="13" rx="2"/>
            <path d="M16 8h4l3 5v3h-7V8z"/>
            <circle cx="5.5" cy="18.5" r="2.5"/>
            <circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
          <div style="
            position:absolute;top:-4px;right:-4px;
            width:14px;height:14px;border-radius:50%;
            background:#22c55e;border:2px solid #fff;
            animation:blink 1.5s infinite">
          </div>
        </div>`,
        iconSize:   [46, 46],
        iconAnchor: [23, 23],
        popupAnchor:[0, -28]
      });

      const popup = `<div style="font-family:'Segoe UI',sans-serif;min-width:200px">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px">🚌 ${f.nome}</div>
        <div style="font-size:12px;color:#666;margin-bottom:2px">Mat: <b>${f.matricula}</b> · ${f.turno}</div>
        ${rotaAtiva ? `
        <div style="font-size:12px;color:#666;margin-bottom:2px">Placa: <b>${rotaAtiva.placa}</b></div>
        <div style="font-size:12px;color:#666;margin-bottom:4px">Rota: <b>${rotaAtiva.rota}</b> · ${rotaAtiva.turno}</div>
        <div style="font-size:11px;color:#888">Início: ${rotaAtiva.hora || '—'}</div>
        ` : ''}
        <div style="margin-top:6px">
          <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(34,211,238,.15);color:#0891b2">● Em rota</span>
        </div>
      </div>`;

      const m = L.marker([lat, lon], { icon: icone }).addTo(mapRH).bindPopup(popup);
      marcadoresRH.push(m);
      bounds.push([lat, lon]);
      ok++;
    } catch(e) { console.warn('[MapRH]', e); }
  }

  bar.innerHTML = `<span>Motoristas: <strong>${motoristas.length}</strong></span>
    <span style="color:var(--border)">·</span>
    <span style="color:var(--cyan)">Em rota agora: <strong>${rotas.length}</strong></span>
    <span style="margin-left:auto;font-size:11px;color:var(--text3)">${ok} localizado(s) · Clique no marcador para detalhes</span>`;

  if (bounds.length > 1) mapRH.fitBounds(bounds, { padding:[60,60], maxZoom:15 });
  else if (bounds.length === 1) mapRH.setView(bounds[0], 15);
  else mapRH.setView([SCS_LAT, SCS_LNG], SCS_ZOOM);
}

/* =============================================
   HISTÓRICO
   ============================================= */
async function populaFiltroMotoristas() {
  const todos = await dbGetAll();
  const mots  = todos.filter(f => f.motorista === true);
  const sel   = document.getElementById('hist-motorista');
  const atual = sel.value;
  sel.innerHTML = `<option value="">Todos</option>` +
    mots.map(f=>`<option value="${f.nome}" ${atual===f.nome?'selected':''}>${f.nome}</option>`).join('');
}

async function renderHistorico() {
  const hist    = await histGetAll();
  const fData   = document.getElementById('hist-data').value;
  const fTurno  = document.getElementById('hist-turno').value;
  const fMot    = document.getElementById('hist-motorista').value;
  const fRota   = (document.getElementById('hist-rota').value || '').trim();

  const fil = hist.filter(h => {
    const d = !fData  || h.data      === fData;
    const t = !fTurno || (h.tipoTurno || h.turno) === fTurno;
    const m = !fMot   || h.motorista  === fMot;
    const r = !fRota  || (h.numeroRota||'').includes(fRota);
    return d && t && m && r;
  }).sort((a,b) => (b.data+b.inicio).localeCompare(a.data+a.inicio));

  document.getElementById('hstat-total').textContent   = fil.length;
  document.getElementById('hstat-t1').textContent      = fil.filter(h=>(h.tipoTurno||h.turno)==='1º Turno').length;
  document.getElementById('hstat-tn').textContent      = fil.filter(h=>(h.tipoTurno||h.turno)==='Turno Normal').length;
  document.getElementById('hstat-t2').textContent      = fil.filter(h=>(h.tipoTurno||h.turno)==='2º Turno').length;
  document.getElementById('hstat-t3').textContent      = fil.filter(h=>(h.tipoTurno||h.turno)==='3º Turno').length;
  document.getElementById('hstat-leituras').textContent= fil.reduce((s,h)=>s+(h.leituras||0),0);
  const med = fil.length ? Math.round(fil.reduce((s,h)=>s+(h.duracaoMin||0),0)/fil.length) : 0;
  document.getElementById('hstat-duracao').textContent = med+'min';

  const tbody = document.getElementById('hist-body');
  if (!fil.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="hist-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg><div>Nenhuma rota encontrada para estes filtros</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = fil.map(h => {
    const dt = h.data ? h.data.split('-').reverse().join('/') : '—';
    const turno = h.tipoTurno || h.turno || '—';
    return `<tr>
      <td style="white-space:nowrap;font-weight:600">${dt}</td>
      <td>
        <div style="font-weight:600;font-size:13px">${h.motorista||'—'}</div>
        <div style="font-size:10px;color:var(--text3)">Mat. ${h.matricula||'—'}</div>
      </td>
      <td><code style="font-size:11px;color:var(--accent);background:var(--bg3);padding:2px 5px;border-radius:4px;border:1px solid var(--border)">${h.placa||'—'}</code></td>
      <td style="font-weight:700;color:var(--cyan);white-space:nowrap">Rota ${h.numeroRota||'—'}</td>
      <td><span class="badge badge-${turnoClass(turno)}">${turno}</span></td>
      <td style="font-family:'Courier New',monospace;font-size:11px">${h.inicio||'—'}</td>
      <td style="font-family:'Courier New',monospace;font-size:11px">${h.fim||'—'}</td>
      <td><span class="duracao-pill">⏱ ${h.duracaoMin||0}min</span></td>
      <td style="text-align:center;font-weight:700;color:var(--cyan)">${h.leituras||0}</td>
      <td>
        <button class="btn btn-sm" style="background:rgba(239,68,68,.12);color:#ef4444;gap:5px"
          onclick="exportarPDF('${h.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          PDF
        </button>
      </td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="excluirHist('${h.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          </svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function limparFiltrosHist() {
  document.getElementById('hist-data').value      = new Date().toISOString().slice(0,10);
  document.getElementById('hist-turno').value     = '';
  document.getElementById('hist-motorista').value = '';
  document.getElementById('hist-rota').value      = '';
  renderHistorico();
}
async function excluirHist(id) {
  if (!confirm('Excluir este registro?')) return;
  await histDelete(String(id)); toast('Removido.','info'); renderHistorico();
}
async function confirmarLimparHistorico() {
  if (!confirm('Limpar TODO o histórico?')) return;
  await histClear(); toast('Histórico limpo.','info'); renderHistorico();
}

/* =============================================
   EXPORTAR RELATÓRIO PDF DE UMA ROTA
   ============================================= */
async function exportarPDF(id) {
  const hist = await histGetAll();
  const h    = hist.find(x => String(x.id) === String(id));
  if (!h) { toast('Registro não encontrado.', 'error'); return; }

  if (!window.jspdf) { toast('jsPDF não carregado. Verifique a conexão.', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });

  const PW   = 210;
  const ML   = 14;
  const MR   = 14;
  const CW   = PW - ML - MR;
  const AZUL  = [37, 99, 235];
  const CINZA = [71, 85, 105];
  const PRETO = [15, 23, 42];
  const VERDE = [22, 163, 74];
  const LINHA = [226, 232, 240];

  let y = 0;

  /* ---- Cabeçalho azul ---- */
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, PW, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('Sistema de Rotas Empresariais', ML, 14);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Relatório Detalhado de Rota', ML, 22);
  doc.setFontSize(8.5);
  doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, ML, 30);
  doc.text('Desenvolvido por Gean Diehl da Silva', PW - MR, 30, { align: 'right' });

  y = 50;

  /* ---- Título da rota ---- */
  doc.setTextColor(...PRETO);
  doc.setFontSize(15); doc.setFont('helvetica', 'bold');
  const dataFmt = h.data ? h.data.split('-').reverse().join('/') : '—';
  doc.text(`Rota ${h.numeroRota || '—'} — ${dataFmt}`, ML, y);
  y += 8;
  doc.setDrawColor(...LINHA); doc.setLineWidth(0.4);
  doc.line(ML, y, PW - MR, y);
  y += 8;

  /* ---- Helper: caixa de info ---- */
  const colW = CW / 2 - 3;
  function infoBox(x, yPos, label, value, corVal) {
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(x, yPos, colW, 15, 2, 2, 'F');
    doc.setTextColor(...CINZA);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(label.toUpperCase(), x + 4, yPos + 5.5);
    doc.setTextColor(...(corVal || PRETO));
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    const txt = doc.splitTextToSize(String(value || '—'), colW - 8);
    doc.text(txt[0], x + 4, yPos + 12);
  }

  const c1 = ML;
  const c2 = ML + colW + 6;
  const rh = 19;

  infoBox(c1, y, 'Motorista',         h.motorista || '—');
  infoBox(c2, y, 'Matrícula',         h.matricula || '—', AZUL);
  y += rh;
  infoBox(c1, y, 'Placa do Veículo',  h.placa || '—', AZUL);
  infoBox(c2, y, 'Número da Rota',    `Rota ${h.numeroRota || '—'}`, VERDE);
  y += rh;
  infoBox(c1, y, 'Turno',             h.tipoTurno || h.turno || '—');
  infoBox(c2, y, 'Data da Rota',      dataFmt);
  y += rh;
  infoBox(c1, y, 'Horário de Início', h.inicio || '—', VERDE);
  infoBox(c2, y, 'Horário de Fim',    h.fim    || '—', [180, 30, 30]);
  y += rh;
  infoBox(c1, y, 'Duração Total',     `${h.duracaoMin || 0} minutos`);
  infoBox(c2, y, 'Identificações',    `${h.leituras || 0} crachás lidos`);
  y += rh + 4;

  /* ---- Seção: Funcionários ---- */
  doc.setDrawColor(...LINHA); doc.line(ML, y, PW - MR, y); y += 8;
  doc.setTextColor(...PRETO);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Funcionários Identificados na Rota', ML, y); y += 6;

  const passageiros = (h.passageiros && h.passageiros.length > 0) ? h.passageiros : null;

  if (passageiros) {
    doc.autoTable({
      startY: y,
      head:   [['#','Matrícula','Nome','Turno','Horário']],
      body:   passageiros.map((p, i) => [i + 1, p.matricula||'—', p.nome||'—', p.turno||'—', p.hora||'—']),
      styles:          { fontSize:9, cellPadding:3 },
      headStyles:      { fillColor:AZUL, textColor:255, fontStyle:'bold' },
      alternateRowStyles:{ fillColor:[248,250,252] },
      columnStyles:    { 0:{ halign:'center', cellWidth:10 } },
      margin:          { left:ML, right:MR },
      theme:           'grid'
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(ML, y, CW, 24, 3, 3, 'F');
    doc.setDrawColor(...LINHA);
    doc.roundedRect(ML, y, CW, 24, 3, 3, 'S');
    doc.setTextColor(...CINZA);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Total de ${h.leituras || 0} crachá(s) identificado(s) durante a rota.`, ML + 5, y + 9);
    doc.setFontSize(8);
    doc.text('Os nomes individuais são registrados quando o sistema está com Firebase ativo e', ML + 5, y + 15);
    doc.text('a lista de passageiros é salva durante a rota em tempo real.', ML + 5, y + 20);
    y += 32;
  }

  /* ---- Observações ---- */
  doc.setDrawColor(...LINHA); doc.line(ML, y, PW - MR, y); y += 8;
  doc.setTextColor(...PRETO);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Observações', ML, y); y += 5;
  doc.setFillColor(250, 250, 252);
  doc.roundedRect(ML, y, CW, 24, 3, 3, 'F');
  doc.setDrawColor(...LINHA);
  doc.roundedRect(ML, y, CW, 24, 3, 3, 'S');
  y += 32;

  /* ---- Assinaturas ---- */
  if (y < 240) {
    doc.setDrawColor(...CINZA);
    doc.setLineWidth(0.3);
    doc.line(ML, y, ML + 75, y);
    doc.setTextColor(...CINZA);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Assinatura do Motorista', ML, y + 5);
    doc.text(h.motorista || '—', ML, y + 11);

    doc.line(PW - MR - 75, y, PW - MR, y);
    doc.text('Responsável / Supervisor', PW - MR - 75, y + 5);
  }

  /* ---- Rodapé em todas as páginas ---- */
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFillColor(...AZUL);
    doc.rect(0, 285, PW, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('Sistema de Rotas Empresariais — Gean Diehl da Silva', ML, 292);
    doc.text(`Pág. ${i} / ${total}`, PW - MR, 292, { align: 'right' });
  }

  const nomeArq = `relatorio-rota-${h.numeroRota || 'xx'}-${(h.data || '').replace(/-/g,'')}.pdf`;
  doc.save(nomeArq);
  toast(`PDF gerado: ${nomeArq}`, 'success');
}

/* =============================================
   LOG NFC
   ============================================= */
function adicionarLog(ref, nome, ativo) {
  const lista = document.getElementById('log-list');
  if (lista.textContent.includes('Nenhuma')) lista.innerHTML = '';
  const agora = new Date().toLocaleTimeString('pt-BR');
  const cor   = nome ? (ativo===false?'var(--red)':'var(--green)') : 'var(--red)';
  const item  = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <span style="color:var(--text3);font-size:10px;white-space:nowrap">${agora}</span>
    <span style="font-weight:700;font-family:'Courier New',monospace;font-size:10px;flex-shrink:0">${ref}</span>
    ${nome
      ? `<span style="color:${cor};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${nome}${ativo===false?' (inativo)':''}</span>`
      : `<span style="color:var(--red);font-size:12px">Não encontrado</span>`}`;
  lista.prepend(item);
  while (lista.children.length > 50) lista.removeChild(lista.lastChild);
}

function limparLog() {
  document.getElementById('log-list').innerHTML =
    `<div style="font-size:12px;color:var(--text3);padding:5px 0">Nenhuma leitura ainda.</div>`;
  leituraCount = 0; atualizarContadorLeituras();
}

/* =============================================
   MODAL FILTROS RELATÓRIO PDF FUNCIONÁRIOS
   ============================================= */
async function abrirModalRelatorio() {
  /* Reseta selects */
  document.getElementById('rel-turno').value  = '';
  document.getElementById('rel-status').value = '';
  document.getElementById('rel-tipo').value   = '';
  document.getElementById('rel-ordem').value  = 'nome';

  document.getElementById('modal-relatorio').classList.add('open');
  await atualizarPreviewRelatorio();

  /* Atualiza prévia ao mudar qualquer filtro */
  ['rel-turno','rel-status','rel-tipo','rel-ordem'].forEach(id => {
    document.getElementById(id).onchange = atualizarPreviewRelatorio;
  });
}

function fecharModalRelatorio() {
  document.getElementById('modal-relatorio').classList.remove('open');
}

async function atualizarPreviewRelatorio() {
  const todos   = await dbGetAll();
  const filtrado = aplicarFiltrosRelatorio(todos);
  const turno   = document.getElementById('rel-turno').value;
  const status  = document.getElementById('rel-status').value;
  const tipo    = document.getElementById('rel-tipo').value;

  const linhas = [
    `📋 <strong>${filtrado.length}</strong> de ${todos.length} funcionário(s) serão incluídos`,
    turno  ? `🕐 Turno: <strong>${turno}</strong>`                                        : '🕐 Turno: <strong>Todos</strong>',
    status ? `👤 Status: <strong>${status === 'ativo' ? 'Apenas Ativos' : 'Apenas Inativos'}</strong>` : '👤 Status: <strong>Ativos e Inativos</strong>',
    tipo   ? `🚌 Cargo: <strong>${tipo === 'motorista' ? 'Apenas Motoristas' : 'Apenas Funcionários'}</strong>` : '🚌 Cargo: <strong>Motoristas e Funcionários</strong>',
  ];

  document.getElementById('rel-preview').innerHTML = linhas.join('<br>');
}

function aplicarFiltrosRelatorio(todos) {
  const turno  = document.getElementById('rel-turno').value;
  const status = document.getElementById('rel-status').value;
  const tipo   = document.getElementById('rel-tipo').value;
  const ordem  = document.getElementById('rel-ordem').value;

  let lista = todos.filter(f => {
    const t = !turno  || f.turno === turno;
    const s = !status || (status === 'ativo' ? f.ativo !== false : f.ativo === false);
    const p = !tipo   || (tipo === 'motorista' ? f.motorista === true : f.motorista !== true);
    return t && s && p;
  });

  /* Ordenação */
  lista = lista.sort((a, b) => {
    if (ordem === 'matricula') return (a.matricula||'').localeCompare(b.matricula||'');
    if (ordem === 'turno')     return (a.turno||'').localeCompare(b.turno||'');
    if (ordem === 'tipo')      return (b.motorista ? 1 : 0) - (a.motorista ? 1 : 0);
    return (a.nome||'').localeCompare(b.nome||''); /* padrão: nome */
  });

  return lista;
}

async function confirmarRelatorio() {
  const todos    = await dbGetAll();
  const filtrado = aplicarFiltrosRelatorio(todos);
  if (!filtrado.length) {
    toast('Nenhum funcionário corresponde aos filtros selecionados.', 'warning');
    return;
  }
  fecharModalRelatorio();
  await exportarPDFFuncionarios(filtrado);
}

/* =============================================
   RELATÓRIO PDF — TODOS OS FUNCIONÁRIOS
   ============================================= */
async function exportarPDFFuncionarios(lista) {
  /* Se chamado sem argumento (compatibilidade), usa todos sem filtro */
  if (!lista) {
    const todos = await dbGetAll();
    lista = todos;
  }
  if (!lista.length) { toast('Nenhum funcionário para exportar.', 'info'); return; }
  if (!window.jspdf)  { toast('jsPDF não carregado.', 'error'); return; }

  const { jsPDF }  = window.jspdf;
  const doc        = new jsPDF({ unit:'mm', format:'a4', orientation:'landscape' });

  const PW    = 297;  /* A4 landscape */
  const ML    = 12;
  const MR    = 12;
  const AZUL  = [37, 99, 235];
  const CINZA = [71, 85, 105];
  const PRETO = [15, 23, 42];
  const LINHA = [226, 232, 240];
  const VERDE = [22, 163, 74];
  const VERM  = [220, 38, 38];
  const CYAN  = [8, 145, 178];

  /* ---- Cabeçalho ---- */
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, PW, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('Sistema de Rotas Empresariais', ML, 13);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text('Relatório Geral de Funcionários', ML, 21);
  doc.setFontSize(8.5);
  doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, ML, 29);
  doc.text('Desenvolvido por Gean Diehl da Silva', PW - MR, 29, { align: 'right' });

  /* ---- Resumo por tipo ---- */
  const motoristas  = lista.filter(f => f.motorista === true);
  const funcs       = lista.filter(f => f.motorista !== true);
  const ativos      = lista.filter(f => f.ativo !== false);
  const inativos    = lista.filter(f => f.ativo === false);

  let y = 44;

  /* Subtítulo com filtros aplicados */
  const turnoFiltro  = document.getElementById('rel-turno')  ? document.getElementById('rel-turno').value  : '';
  const statusFiltro = document.getElementById('rel-status') ? document.getElementById('rel-status').value : '';
  const tipoFiltro   = document.getElementById('rel-tipo')   ? document.getElementById('rel-tipo').value   : '';

  const filtrosTexto = [
    turnoFiltro  ? turnoFiltro : null,
    statusFiltro ? (statusFiltro === 'ativo' ? 'Ativos' : 'Inativos') : null,
    tipoFiltro   ? (tipoFiltro === 'motorista' ? 'Motoristas' : 'Funcionários') : null,
  ].filter(Boolean);

  if (filtrosTexto.length > 0) {
    doc.setFillColor(240, 245, 255);
    doc.roundedRect(ML, y - 8, PW - ML - MR, 9, 2, 2, 'F');
    doc.setTextColor(...AZUL);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Filtros aplicados: ${filtrosTexto.join(' · ')}`, ML + 3, y - 2);
    y += 4;
  }

  /* Cards de resumo */
  const cards = [
    { label:'No relatório', valor: lista.length,       cor: AZUL  },
    { label:'Ativos',       valor: ativos.length,      cor: VERDE },
    { label:'Inativos',     valor: inativos.length,    cor: VERM  },
    { label:'Motoristas',   valor: motoristas.length,  cor: CYAN  },
    { label:'Funcionários', valor: funcs.length,        cor: CINZA },
  ];

  const cw = 48;
  cards.forEach((c, i) => {
    const cx = ML + i * (cw + 4);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(cx, y, cw, 16, 2, 2, 'F');
    doc.setTextColor(...CINZA);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(c.label.toUpperCase(), cx + 4, y + 6);
    doc.setTextColor(...c.cor);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(String(c.valor), cx + 4, y + 13);
  });

  y += 24;

  /* ---- Conta viagens por funcionário cruzando com histórico ---- */
  const historico = await histGetAll();

  /*
   * Cada rota no histórico tem h.leituras (contagem total) mas não
   * tem a lista nominal. Usamos a matrícula do campo h.matricula
   * (motorista) para contar quantas rotas o MOTORISTA fez, e para
   * funcionários não-motoristas somamos as leituras de passageiros
   * salvas em h.passageiros (quando disponível via Firebase).
   * Se h.passageiros não existir, mostramos o total de viagens como
   * motorista (rotas operadas).
   */
  function contarViagens(funcionario) {
    if (funcionario.motorista) {
      /* Motorista: quantas rotas ele operou */
      return historico.filter(h => h.matricula === funcionario.matricula).length;
    } else {
      /* Funcionário: quantas vezes apareceu em passageiros */
      let total = 0;
      for (const h of historico) {
        if (Array.isArray(h.passageiros)) {
          total += h.passageiros.filter(p => p.matricula === funcionario.matricula).length;
        }
      }
      return total;
    }
  }

  /* ---- Tabela principal ---- */
  doc.setTextColor(...PRETO);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Lista de Funcionários', ML, y);
  y += 4;

  /* Lista já foi ordenada em aplicarFiltrosRelatorio — usa diretamente */
  const ordenados = lista;

  doc.autoTable({
    startY: y,
    head: [[
      'Matrícula', 'Nome', 'Cargo', 'Turno', 'Status', 'Viagens', 'UID Crachá', 'Endereço'
    ]],
    body: ordenados.map(f => {
      const viagens = contarViagens(f);
      return [
        f.matricula || '—',
        f.nome      || '—',
        f.motorista ? 'Motorista' : 'Funcionário',
        f.turno     || '—',
        f.ativo !== false ? 'Ativo' : 'Inativo',
        viagens > 0 ? String(viagens) : '0',
        f.uid       || '—',
        f.endereco  || '—'
      ];
    }),
    styles:      { fontSize:8.5, cellPadding:3, overflow:'ellipsize' },
    headStyles:  { fillColor:AZUL, textColor:255, fontStyle:'bold', fontSize:8 },
    alternateRowStyles: { fillColor:[248, 250, 252] },
    columnStyles: {
      0: { cellWidth:20 },
      1: { cellWidth:40 },
      2: { cellWidth:24, fontStyle:'bold' },
      3: { cellWidth:22 },
      4: { cellWidth:16 },
      5: { cellWidth:20, halign:'center', fontStyle:'bold' },
      6: { cellWidth:26 },
      7: { cellWidth:'auto' }
    },
    didParseCell(data) {
      if (data.section === 'body') {
        const row = ordenados[data.row.index];
        if (data.column.index === 2) {
          data.cell.styles.textColor = row && row.motorista ? CYAN : CINZA;
        }
        if (data.column.index === 4) {
          data.cell.styles.textColor = (row && row.ativo !== false) ? VERDE : VERM;
        }
        if (data.column.index === 5) {
          const v = parseInt(data.cell.text[0]) || 0;
          data.cell.styles.textColor = v > 0 ? VERDE : CINZA;
        }
      }
    },
    margin: { left:ML, right:MR },
    theme:  'grid'
  });

  y = doc.lastAutoTable.finalY + 10;

  /* ---- Seção motoristas detalhada (só aparece se há motoristas no filtro) ---- */
  if (motoristas.length > 0 && y < 170) {
    doc.setDrawColor(...LINHA); doc.setLineWidth(0.3);
    doc.line(ML, y, PW - MR, y); y += 7;
    doc.setTextColor(...PRETO);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`Motoristas (${motoristas.length})`, ML, y); y += 4;

    doc.autoTable({
      startY: y,
      head:   [['Matrícula','Nome','UID Crachá','Status']],
      body:   motoristas.map(f => [
        f.matricula || '—',
        f.nome      || '—',
        f.uid       || '— não vinculado',
        f.ativo !== false ? 'Ativo' : 'Inativo'
      ]),
      styles:      { fontSize:9, cellPadding:3 },
      headStyles:  { fillColor:CYAN, textColor:255, fontStyle:'bold' },
      alternateRowStyles: { fillColor:[248,252,254] },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 3) {
          const row = motoristas[data.row.index];
          data.cell.styles.textColor = (row && row.ativo !== false) ? VERDE : VERM;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left:ML, right:MR },
      theme:  'grid'
    });
  }

  /* ---- Rodapé em todas as páginas ---- */
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFillColor(...AZUL);
    doc.rect(0, 198, PW, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('Sistema de Rotas Empresariais — Gean Diehl da Silva', ML, 205);
    doc.text(`Pág. ${i} / ${total}`, PW - MR, 205, { align:'right' });
  }

  const data = new Date().toISOString().slice(0,10).replace(/-/g,'');
  doc.save(`relatorio-funcionarios-${data}.pdf`);
  toast('Relatório de funcionários exportado!', 'success');
}
