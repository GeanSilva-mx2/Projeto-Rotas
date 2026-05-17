/* =============================================
   SISTEMA DE TRANSPORTE ESCOLAR — db.js v5
   Turnos: 1º Turno | Turno Normal | 2º Turno | 3º Turno
   ============================================= */

const DB_NAME    = 'TransporteEscolarDB';
const DB_VERSION = 5;
const STORE_FUNC = 'funcionarios';
const STORE_ROTA = 'rotas_ativas';
const STORE_HIST = 'historico_rotas';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d   = e.target.result;
      const old = e.oldVersion;

      if (old < 1) {
        const s = d.createObjectStore(STORE_FUNC, { keyPath:'id', autoIncrement:true });
        s.createIndex('matricula','matricula',{ unique:true });
        s.createIndex('uid','uid',{ unique:false });
      } else if (old < 2) {
        const s = e.target.transaction.objectStore(STORE_FUNC);
        if (!s.indexNames.contains('uid')) s.createIndex('uid','uid',{ unique:false });
      }

      if (old < 3 && !d.objectStoreNames.contains(STORE_ROTA)) {
        const r = d.createObjectStore(STORE_ROTA, { keyPath:'id', autoIncrement:true });
        r.createIndex('placa','placa',{ unique:false });
      }

      if (old < 4 && !d.objectStoreNames.contains(STORE_HIST)) {
        const h = d.createObjectStore(STORE_HIST, { keyPath:'id', autoIncrement:true });
        h.createIndex('data','data',{ unique:false });
        h.createIndex('motorista','motorista',{ unique:false });
        h.createIndex('turno','turno',{ unique:false });
        h.createIndex('tipoTurno','tipoTurno',{ unique:false });
      }

      /* v5: sem mudança estrutural, só seed atualizado */
    };

    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ---- FUNCIONÁRIOS ---- */
function dbGetAll() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FUNC,'readonly').objectStore(STORE_FUNC).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}
function dbGetById(id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FUNC,'readonly').objectStore(STORE_FUNC).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}
function dbGetByMatricula(mat) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FUNC,'readonly').objectStore(STORE_FUNC).index('matricula').get(mat);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}
function dbGetByUID(uid) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FUNC,'readonly').objectStore(STORE_FUNC).getAll();
    req.onsuccess = () => {
      const n = uid.toUpperCase().replace(/[-\s]/g,':');
      resolve(req.result.find(f => f.uid && f.uid.toUpperCase().replace(/[-\s]/g,':') === n));
    };
    req.onerror = (e) => reject(e.target.error);
  });
}
function dbSave(data) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FUNC,'readwrite').objectStore(STORE_FUNC).put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}
function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FUNC,'readwrite').objectStore(STORE_FUNC).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ---- ROTAS ATIVAS ---- */
function rotaSave(data) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_ROTA,'readwrite').objectStore(STORE_ROTA).put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}
function rotaGetAll() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_ROTA,'readonly').objectStore(STORE_ROTA).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}
function rotaDelete(id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_ROTA,'readwrite').objectStore(STORE_ROTA).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ---- HISTÓRICO ---- */
function histSave(data) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_HIST,'readwrite').objectStore(STORE_HIST).put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}
function histGetAll() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_HIST,'readonly').objectStore(STORE_HIST).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}
function histDelete(id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_HIST,'readwrite').objectStore(STORE_HIST).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}
function histClear() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_HIST,'readwrite').objectStore(STORE_HIST).clear();
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ---- SEED ---- */
async function seedIfEmpty() {
  const todos = await dbGetAll();
  if (todos.length > 0) return;

  const funcionarios = [
    { matricula:'0001', nome:'Ana Paula Souza',    turno:'1º Turno',    endereco:'R. Lino Manoel dos Santos, 149, Santa Vitória, Santa Cruz do Sul, RS', uid:'', ativo:true,  motorista:true  },
    { matricula:'0002', nome:'Carlos Eduardo Lima', turno:'Turno Normal',endereco:'Av. Brasil, 310, Jardim América, Santa Cruz do Sul, RS',              uid:'', ativo:true,  motorista:true  },
    { matricula:'0003', nome:'Fernanda Costa',      turno:'2º Turno',    endereco:'Rua XV de Novembro, 88, Centro, Santa Cruz do Sul, RS',               uid:'', ativo:false, motorista:true  },
    { matricula:'0004', nome:'Roberto Alves',       turno:'3º Turno',    endereco:'Rua Sete de Setembro, 15, Centro, Santa Cruz do Sul, RS',             uid:'', ativo:true,  motorista:true  },
    { matricula:'0005', nome:'Juliana Martins',     turno:'1º Turno',    endereco:'Rua Júlio de Castilhos, 200, Centro, Santa Cruz do Sul, RS',          uid:'', ativo:true,  motorista:false },
  ];
  for (const f of funcionarios) await dbSave(f);

  const hoje  = new Date().toISOString().slice(0,10);
  const ontem = new Date(Date.now()-86400000).toISOString().slice(0,10);
  const hist = [
    { motorista:'Ana Paula Souza',    matricula:'0001', placa:'RST-4521', numeroRota:'01', tipoTurno:'1º Turno',    inicio:'06:45', fim:'08:10', data:hoje,  duracaoMin:85, leituras:12 },
    { motorista:'Carlos Eduardo Lima', matricula:'0002', placa:'IQS-9834', numeroRota:'03', tipoTurno:'Turno Normal',inicio:'07:00', fim:'08:30', data:hoje,  duracaoMin:90, leituras:18 },
    { motorista:'Ana Paula Souza',    matricula:'0001', placa:'RST-4521', numeroRota:'02', tipoTurno:'2º Turno',    inicio:'12:30', fim:'14:00', data:ontem, duracaoMin:90, leituras:15 },
    { motorista:'Roberto Alves',      matricula:'0004', placa:'MNO-2211', numeroRota:'05', tipoTurno:'3º Turno',    inicio:'18:00', fim:'19:30', data:ontem, duracaoMin:90, leituras:11 },
  ];
  for (const h of hist) await histSave(h);

  console.info('[DB] Banco v5 populado.');
}
