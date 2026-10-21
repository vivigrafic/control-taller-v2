/**
 * Importador Directo de Google Sheet Real a Supabase Sandbox (kkvzzheccniclfwqzivu)
 * Lee en vivo: 1D7z5ugTzJZAaw3CAlMiciyswmQxubT9t6x_K_oLIJ_I
 */

const SHEET_ID = '1D7z5ugTzJZAaw3CAlMiciyswmQxubT9t6x_K_oLIJ_I';
const SUPABASE_URL = 'https://kkvzzheccniclfwqzivu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '' // clave secreta: va en el archivo .env (no se sube), nunca en el código;

function parseCSV(text) {
  let r = [], row = [''], q = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i], next = text[i + 1];
    if (c === '"') {
      if (q && next === '"') { row[row.length - 1] += '"'; i++; }
      else { q = !q; }
    } else if (c === ',' && !q) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !q) {
      if (c === '\r' && next === '\n') i++;
      r.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') r.push(row);
  return r;
}

async function fetchSheetCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer ${sheetName}`);
  const text = await res.text();
  return parseCSV(text);
}

function numVal(v) {
  if (!v) return 0;
  let n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  // Si no tenía punto de miles:
  if (isNaN(n)) n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function parseSpanishDate(str) {
  if (!str) return new Date().toISOString();
  // Formato común: "20/10/2026 16:25:22" o "20/10/2026"
  const m = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    const hour = parseInt(m[4] || '0', 10);
    const min = parseInt(m[5] || '0', 10);
    const sec = parseInt(m[6] || '0', 10);
    const d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function sbDelete(table) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?empresa_id=eq.vvgrafic-principal`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
}

async function sbInsertBatch(table, rows) {
  if (!rows || rows.length === 0) return;
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(chunk)
    });
    if (!res.ok) {
      console.error(`Error insertando en ${table}:`, await res.text());
    }
  }
}

async function run() {
  console.log('=== LEYENDO GOOGLE SHEET EN VIVO ===');

  // 1. CONTROL_PAPEL_IMPRESION
  console.log('1. Leyendo CONTROL_PAPEL_IMPRESION...');
  const impCSV = await fetchSheetCSV('CONTROL_PAPEL_IMPRESION');
  console.log(`Filas recibidas: ${impCSV.length - 1}`);

  const rollosMap = {};
  const impRows = [];

  // Saltear encabezado (fila 0) y leer de arriba hacia abajo (las filas superiores son las más recientes)
  for (let i = 1; i < impCSV.length; i++) {
    const r = impCSV[i];
    if (!r[0] && !r[1]) continue;
    const fIso = parseSpanishDate(r[0]);
    const rolloId = (r[1] || 'Sin Rollo').trim();
    const baseId = rolloId.split('-C')[0];
    const mImp = numVal(r[8]);
    const mDesp = numVal(r[9]);
    const mRest = numVal(r[10]);

    if (!rollosMap[baseId]) {
      rollosMap[baseId] = {
        id_rollo: baseId,
        empresa_id: 'vvgrafic-principal',
        gramaje: baseId.split('g')[0] || '29',
        metros_iniciales: Math.max(100, mRest + mImp + mDesp),
        estado: i === 1 ? 'Activo' : 'Histórico',
        fecha_montaje: fIso
      };
    } else {
      rollosMap[baseId].metros_iniciales = Math.max(rollosMap[baseId].metros_iniciales, mRest + mImp + mDesp);
    }

    const batchKey = `BATCH-${baseId}-${new Date(fIso).getTime() || i}`;
    impRows.push({
      empresa_id: 'vvgrafic-principal',
      batch_id: batchKey,
      fecha_hora: fIso,
      id_rollo_papel: rolloId,
      id_rollo_base: baseId,
      cliente_archivo: (r[2] || '').trim(),
      diseno: (r[3] || '').trim(),
      tela_destino: (r[4] || '').trim(),
      num_rollo_tela: (r[5] || '').trim(),
      color_tela: (r[6] || '').trim(),
      accion: (r[7] || 'Impresion Normal').trim(),
      metros_impresos: mImp,
      metros_desperdicio: mDesp,
      metros_restantes_snapshot: mRest,
      perfil: (r[11] || '').trim(),
      ruta: (r[12] || 'Solo Calandrado').trim(),
      observaciones: (r[13] || '').trim(),
      file_id: (r[14] || '').trim()
    });
  }

  console.log(`Rollos calculados: ${Object.keys(rollosMap).length}`);
  console.log(`Impresiones preparadas: ${impRows.length}`);

  // 2. COLA_CALANDRADO
  console.log('2. Leyendo COLA_CALANDRADO...');
  const calCSV = await fetchSheetCSV('COLA_CALANDRADO');
  console.log(`Filas recibidas: ${calCSV.length - 1}`);

  const calRows = [];
  // El grupo de cada archivo es el de su impresión (no la hora: al terminar un rollo todas las filas quedan con la misma)
  const lotePorArchivo = {};
  impRows.forEach(x => String(x.file_id || '').split(',').map(t => t.trim()).filter(Boolean).forEach(id => { lotePorArchivo[id] = x.batch_id; }));
  for (let i = 1; i < calCSV.length; i++) {
    const r = calCSV[i];
    if (!r[0] && !r[1]) continue;
    const fIso = parseSpanishDate(r[0]);
    const rolloId = (r[1] || '').trim();
    const est = (r[11] || 'Pendiente').trim();
    const fileIdCal = (r[12] || '').trim();
    const batchKey = lotePorArchivo[fileIdCal] || `CAL-${rolloId}-${new Date(fIso).getTime() || 0}-${i}`;

    calRows.push({
      empresa_id: 'vvgrafic-principal',
      batch_id: batchKey,
      fecha_hora: fIso,
      fecha_terminado: est.toLowerCase().includes('terminado') ? fIso : null,
      id_rollo_papel: rolloId,
      cliente_archivo: (r[2] || '').trim(),
      diseno: (r[3] || '').trim(),
      tela_destino: (r[4] || '').trim(),
      num_rollo_tela: (r[5] || '').trim(),
      color_tela: (r[6] || '').trim(),
      metros: numVal(r[7]),
      perfil: (r[8] || '').trim(),
      ruta: (r[9] || 'Solo Calandrado').trim(),
      observaciones: (r[10] || '').trim(),
      estado: est,
      file_id: (r[12] || '').trim(),
      velocidad: numVal(r[13]) || 50,
      temperatura: numVal(r[14]) || 205,
      minutos_trabajados: numVal(r[15]) || 0
    });
  }
  console.log(`Calandrado preparado: ${calRows.length}`);

  // 3. COLA_LASER
  console.log('3. Leyendo COLA_LASER...');
  let laserRows = [];
  try {
    const lasCSV = await fetchSheetCSV('COLA_LASER');
    for (let i = 1; i < lasCSV.length; i++) {
      const r = lasCSV[i];
      if (!r[0] && !r[1]) continue;
      const fIso = parseSpanishDate(r[0]);
      const rolloId = (r[1] || '').trim();
      const est = (r[9] || 'Pendiente').trim();
      const batchKey = `LASER-BATCH-${rolloId}-${(r[3] || '').trim()}-${i}`;
      laserRows.push({
        empresa_id: 'vvgrafic-principal',
        batch_id: batchKey,
        fecha_ingreso: fIso,
        fecha_terminado: est.toLowerCase().includes('terminado') ? fIso : null,
        id_rollo_papel: rolloId,
        cliente_archivo: (r[2] || '').trim(),
        tela_rollo_color: (r[3] || '').trim(),
        metros: numVal(r[4]),
        ruta: (r[5] || 'Calandrado + Corte Láser').trim(),
        velocidad: numVal(r[6]) || 300,
        poder: numVal(r[7]) || 90,
        minutos_trabajados: numVal(r[8]) || 0,
        estado: est,
        observaciones: (r[10] || '').trim(),
        file_id: (r[11] || '').trim(),
        mts_hr: numVal(r[12]) || 0
      });
    }
    console.log(`Láser preparado: ${laserRows.length}`);
  } catch(e) {
    console.warn('Láser opcional omitido:', e.message);
  }

  // 4. INSERTAR EN SUPABASE SANDBOX
  console.log('=== ACTUALIZANDO SUPABASE SANDBOX ===');
  
  console.log('Borrando impresiones y calandrado anteriores...');
  await sbDelete('prod_impresiones');
  await sbDelete('prod_cola_calandrado');
  if (laserRows.length > 0) await sbDelete('prod_cola_laser');

  console.log('Guardando rollos...');
  // Upsert rollos
  for (const rollo of Object.values(rollosMap)) {
    await fetch(`${SUPABASE_URL}/rest/v1/prod_rollos_papel`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rollo)
    });
  }

  console.log(`Insertando ${impRows.length} impresiones...`);
  await sbInsertBatch('prod_impresiones', impRows);

  console.log(`Insertando ${calRows.length} filas de calandrado...`);
  await sbInsertBatch('prod_cola_calandrado', calRows);

  if (laserRows.length > 0) {
    console.log(`Insertando ${laserRows.length} filas de láser...`);
    await sbInsertBatch('prod_cola_laser', laserRows);
  }

  console.log('✅ ¡Importación en vivo de Google Sheet a Supabase completada con éxito!');
}

run().catch(console.error);
