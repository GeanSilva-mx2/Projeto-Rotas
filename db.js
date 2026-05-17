/* =============================================
   SISTEMA DE ROTAS — db.js
   Banco de dados: Supabase (PostgreSQL na nuvem)
   Dados sincronizados entre todos os dispositivos
   ============================================= */

const SUPABASE_URL = 'https://yyjisxbiixtopuquroyx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gkZDSjfLpOv8PxGHJiq7pA_hYg2t7zE';

/* Instância global do cliente Supabase */
let _sb = null;

/* =============================================
   INICIALIZAÇÃO — substitui openDB()
   ============================================= */
function openDB() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof supabase === 'undefined') {
        reject(new Error('Supabase SDK não carregado.'));
        return;
      }
      _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.info('[DB] Supabase conectado ✅');
      resolve(_sb);
    } catch(e) {
      reject(e);
    }
  });
}

/* =============================================
   UTILITÁRIO — trata erros do Supabase
   ============================================= */
function _check(error, contexto) {
  if (error) {
    console.error(`[DB] Erro em ${contexto}:`, error.message);
    throw new Error(error.message);
  }
}

/* =============================================
   FUNCIONÁRIOS
   ============================================= */

/** Retorna todos os funcionários ordenados por nome */
async function dbGetAll() {
  const { data, error } = await _sb
    .from('funcionarios')
    .select('*')
    .order('nome', { ascending: true });
  _check(error, 'dbGetAll');
  return data || [];
}

/** Busca funcionário pelo ID */
async function dbGetById(id) {
  const { data, error } = await _sb
    .from('funcionarios')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code === 'PGRST116') return undefined; /* não encontrado */
  _check(error, 'dbGetById');
  return data;
}

/** Busca funcionário pela matrícula */
async function dbGetByMatricula(matricula) {
  const { data, error } = await _sb
    .from('funcionarios')
    .select('*')
    .eq('matricula', matricula)
    .maybeSingle();
  _check(error, 'dbGetByMatricula');
  return data;
}

/** Busca funcionário pelo UID do crachá NFC */
async function dbGetByUID(uid) {
  const norm = uid.toUpperCase().replace(/[-\s]/g, ':');
  const { data, error } = await _sb
    .from('funcionarios')
    .select('*');
  _check(error, 'dbGetByUID');
  return (data || []).find(f =>
    f.uid && f.uid.toUpperCase().replace(/[-\s]/g, ':') === norm
  );
}

/**
 * Insere ou atualiza um funcionário.
 * Se data.id existir → UPDATE; caso contrário → INSERT.
 */
async function dbSave(dados) {
  const { id, ...campos } = dados;

  /* Garante que os campos booleanos existam */
  campos.ativo    = campos.ativo    !== false;
  campos.motorista= campos.motorista === true;
  campos.uid      = (campos.uid || '').toUpperCase();

  if (id) {
    /* UPDATE */
    const { error } = await _sb
      .from('funcionarios')
      .update(campos)
      .eq('id', id);
    _check(error, 'dbSave (update)');
    return id;
  } else {
    /* INSERT — verifica matrícula duplicada */
    const existe = await dbGetByMatricula(campos.matricula);
    if (existe) throw new Error('Matrícula já cadastrada: ' + campos.matricula);

    const { data, error } = await _sb
      .from('funcionarios')
      .insert(campos)
      .select()
      .single();
    _check(error, 'dbSave (insert)');
    return data.id;
  }
}

/** Remove um funcionário pelo ID */
async function dbDelete(id) {
  const { error } = await _sb
    .from('funcionarios')
    .delete()
    .eq('id', id);
  _check(error, 'dbDelete');
}

/* =============================================
   ROTAS ATIVAS
   ============================================= */

/** Salva (insere ou atualiza) uma rota ativa */
async function rotaSave(dados) {
  const { id, ...campos } = dados;

  /* Mapeia campos para snake_case do banco */
  const row = {
    nome:       campos.nome       || '',
    matricula:  campos.matricula  || '',
    uid:        campos.uid        || '',
    placa:      campos.placa      || '',
    rota:       campos.rota       || '',
    turno:      campos.turno      || '',
    hora:       campos.hora       || '',
    data:       campos.data       || '',
    inicio_iso: campos.inicioISO  || new Date().toISOString(),
  };

  if (id) {
    const { error } = await _sb
      .from('rotas_ativas')
      .update(row)
      .eq('id', id);
    _check(error, 'rotaSave (update)');
    return id;
  } else {
    const { data, error } = await _sb
      .from('rotas_ativas')
      .insert(row)
      .select()
      .single();
    _check(error, 'rotaSave (insert)');
    return data.id;
  }
}

/** Retorna todas as rotas ativas */
async function rotaGetAll() {
  const { data, error } = await _sb
    .from('rotas_ativas')
    .select('*');
  _check(error, 'rotaGetAll');
  /* Normaliza inicio_iso → inicioISO para compatibilidade com app.js */
  return (data || []).map(r => ({ ...r, inicioISO: r.inicio_iso }));
}

/** Remove uma rota ativa pelo ID */
async function rotaDelete(id) {
  const { error } = await _sb
    .from('rotas_ativas')
    .delete()
    .eq('id', id);
  _check(error, 'rotaDelete');
}

/* =============================================
   HISTÓRICO DE ROTAS
   ============================================= */

/** Salva uma rota encerrada no histórico */
async function histSave(dados) {
  const { id, ...campos } = dados;

  const row = {
    motorista:   campos.motorista   || '',
    matricula:   campos.matricula   || '',
    placa:       campos.placa       || '',
    numero_rota: campos.numeroRota  || campos.numero_rota || '',
    tipo_turno:  campos.tipoTurno   || campos.tipo_turno  || '',
    turno:       campos.turno       || '',
    inicio:      campos.inicio      || '',
    fim:         campos.fim         || '',
    data:        campos.data        || '',
    duracao_min: campos.duracaoMin  || campos.duracao_min || 0,
    leituras:    campos.leituras    || 0,
  };

  if (id) {
    const { error } = await _sb
      .from('historico_rotas')
      .update(row)
      .eq('id', id);
    _check(error, 'histSave (update)');
    return id;
  } else {
    const { data, error } = await _sb
      .from('historico_rotas')
      .insert(row)
      .select()
      .single();
    _check(error, 'histSave (insert)');
    return data.id;
  }
}

/** Retorna todo o histórico ordenado por data/hora desc */
async function histGetAll() {
  const { data, error } = await _sb
    .from('historico_rotas')
    .select('*')
    .order('criado_em', { ascending: false });
  _check(error, 'histGetAll');

  /* Normaliza snake_case → camelCase para app.js */
  return (data || []).map(h => ({
    ...h,
    numeroRota: h.numero_rota,
    tipoTurno:  h.tipo_turno,
    duracaoMin: h.duracao_min,
  }));
}

/** Remove um registro do histórico */
async function histDelete(id) {
  const { error } = await _sb
    .from('historico_rotas')
    .delete()
    .eq('id', id);
  _check(error, 'histDelete');
}

/** Limpa todo o histórico */
async function histClear() {
  const { error } = await _sb
    .from('historico_rotas')
    .delete()
    .neq('id', 0); /* deleta todos os registros */
  _check(error, 'histClear');
}

/* =============================================
   SEED — popula dados de exemplo se banco vazio
   ============================================= */
async function seedIfEmpty() {
  const { count, error } = await _sb
    .from('funcionarios')
    .select('*', { count: 'exact', head: true });

  if (error || count > 0) return; /* já tem dados ou erro */

  const hoje  = new Date().toISOString().slice(0, 10);
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const funcionarios = [
    { matricula:'0001', nome:'Ana Paula Souza',     turno:'1º Turno',    endereco:'R. Lino Manoel dos Santos, 149, Santa Vitória, Santa Cruz do Sul, RS', uid:'', ativo:true,  motorista:true  },
    { matricula:'0002', nome:'Carlos Eduardo Lima',  turno:'Turno Normal',endereco:'Av. Brasil, 310, Jardim América, Santa Cruz do Sul, RS',              uid:'', ativo:true,  motorista:true  },
    { matricula:'0003', nome:'Fernanda Costa',       turno:'2º Turno',    endereco:'Rua XV de Novembro, 88, Centro, Santa Cruz do Sul, RS',               uid:'', ativo:false, motorista:true  },
    { matricula:'0004', nome:'Roberto Alves',        turno:'3º Turno',    endereco:'Rua Sete de Setembro, 15, Centro, Santa Cruz do Sul, RS',             uid:'', ativo:true,  motorista:true  },
    { matricula:'0005', nome:'Juliana Martins',      turno:'1º Turno',    endereco:'Rua Júlio de Castilhos, 200, Centro, Santa Cruz do Sul, RS',          uid:'', ativo:true,  motorista:false },
  ];

  const { error: errFunc } = await _sb.from('funcionarios').insert(funcionarios);
  if (errFunc) { console.warn('[DB] Seed funcionários:', errFunc.message); return; }

  const hist = [
    { motorista:'Ana Paula Souza',    matricula:'0001', placa:'RST-4521', numero_rota:'01', tipo_turno:'1º Turno',    turno:'1º Turno',    inicio:'06:45', fim:'08:10', data:hoje,  duracao_min:85, leituras:12 },
    { motorista:'Carlos Eduardo Lima', matricula:'0002', placa:'IQS-9834', numero_rota:'03', tipo_turno:'Turno Normal',turno:'Turno Normal', inicio:'07:00', fim:'08:30', data:hoje,  duracao_min:90, leituras:18 },
    { motorista:'Ana Paula Souza',    matricula:'0001', placa:'RST-4521', numero_rota:'02', tipo_turno:'2º Turno',    turno:'2º Turno',    inicio:'12:30', fim:'14:00', data:ontem, duracao_min:90, leituras:15 },
    { motorista:'Roberto Alves',      matricula:'0004', placa:'MNO-2211', numero_rota:'05', tipo_turno:'3º Turno',    turno:'3º Turno',    inicio:'18:00', fim:'19:30', data:ontem, duracao_min:90, leituras:11 },
  ];

  const { error: errHist } = await _sb.from('historico_rotas').insert(hist);
  if (errHist) console.warn('[DB] Seed histórico:', errHist.message);

  console.info('[DB] Dados de exemplo inseridos no Supabase ✅');
}
