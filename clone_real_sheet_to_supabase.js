/**
 * Clonador 100% Fiel (Solo Lectura) desde la Hoja de Cálculo Real de Producción
 * (1D7z5ugTzJZAaw3CAlMiciyswmQxubT9t6x_K_oLIJ_I) + Carpeta DTF Drive
 * hacia el Clon de Pruebas de Supabase (kkvzzheccniclfwqzivu).
 *
 * Respeta exactamente la lógica de agrupación de lotes anidados de Código.js.
 */

const fs = require('fs');
const path = require('path');

const SHEET_ID = '1D7z5ugTzJZAaw3CAlMiciyswmQxubT9t6x_K_oLIJ_I';
const SUPABASE_URL = 'https://kkvzzheccniclfwqzivu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrdnp6aGVjY25pY2xmd3F6aXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM5Mzc3NiwiZXhwIjoyMTAxOTY5Nzc2fQ.c0BOc9aO3drO5Ta8gNdURJFM5eByD2G_hu3WfOQWCZE';
const DIR_DTF = 'G:/Mi unidad/VIVI GRAFIC/fila_impresión/dtf';

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else { cur += ch; }
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

function strVal(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function numVal(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function parseDateAR(raw) {
  const s = strVal(raw);
  if (!s) return null;
  // Formato DD/MM/YYYY HH:mm:ss o DD/MM/YYYY HH:mm
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    let yyyy = String(m[3]);
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    const hh = String(m[4] || '00').padStart(2, '0');
    const mi = String(m[5] || '00').padStart(2, '0');
    const ss = String(m[6] || '00').padStart(2, '0');
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`);
    if (!isNaN(d.getTime())) return d;
  }
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

async function fetchSheetCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error leyendo hoja ${sheetName}: ${res.status}`);
  const txt = await res.text();
  return parseCSV(txt);
}

async function sbDeleteAll(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?empresa_id=eq.vvgrafic-principal`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) console.error(`Error DELETE ${table}:`, await res.text());
}

async function sbInsertBatch(table, rows, onConflict = '') {
  if (!rows || rows.length === 0) return;
  const chunkSize = 150;
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (onConflict) url += `?on_conflict=${onConflict}`;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: onConflict ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal'
      },
      body: JSON.stringify(chunk)
    });
    if (!res.ok) {
      console.error(`Error POST ${table} (chunk ${i}):`, await res.text());
    }
  }
}

function scanLocalDTF(dir, rootDir, depth = 0) {
  let results = [];
  if (depth > 2 || !fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const up = item.toUpperCase();
    if (item.startsWith('00') || up.includes('IMPRESO') || item.toLowerCase() === 'desktop.ini') continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(scanLocalDTF(full, rootDir, depth + 1));
    } else {
      const ext = path.extname(item).toLowerCase();
      if (!['.jpg', '.jpeg', '.tif', '.tiff', '.png', '.pdf'].includes(ext)) continue;
      const relFolder = path.relative(rootDir, dir);
      let cliente = (!relFolder || relFolder === '.') ? 'SIN CLIENTE' : path.basename(dir);
      if (cliente === 'SIN CLIENTE') {
        const parts = item.split(/[-–(]/);
        if (parts && parts[0].trim()) cliente = parts[0].trim();
      }
      let medida = 1.0, reps = 1;
      const xm = item.match(/([\d,.]+)\s*(?:MTS?|MT|M)?\s*[xX]\s*(\d+)/i);
      if (xm) {
        const m = numVal(xm[1]);
        medida = m > 50 ? m / 100.0 : m;
        reps = parseInt(xm[2], 10) || 1;
      } else {
        const mm = item.match(/([\d,.]+)\s*(?:MTS?|MT|M\b)/i);
        if (mm) medida = numVal(mm[1]);
      }
      const total = Number((medida * reps).toFixed(2)) || 1.0;
      const uniqueHash = Buffer.from(full).toString('hex').slice(-28);
      results.push({
        empresa_id: 'vvgrafic-principal',
        modulo: 'DTF',
        cliente,
        nombre_archivo: item,
        medida_unitaria: Number(medida.toFixed(2)),
        repeticiones: reps,
        metros_totales: total,
        metros_dpi_real: total,
        dpi_detectado: 300,
        perfil_detectado: 'DTF 6 Pasadas',
        tela_detectada: 'FILM DTF',
        rollo_detectado: '',
        color_detectado: '',
        ruta_detectada: 'Solo Impresión',
        prioridad_maxima: false,
        estado_impreso: 'NO',
        file_id: `DTF-${results.length}-${uniqueHash}`,
        url: ''
      });
    }
  }
  return results;
}

async function main() {
  console.log('1. Descargando hojas reales desde Google Sheets (Solo Lectura)...');
  const [
    rawTelas,
    rawPerfiles,
    rawPrendas,
    rawImp,
    rawCal,
    rawLaser,
    rawPend,
    rawSobrantes,
    rawFallas,
    rawAlertas
  ] = await Promise.all([
    fetchSheetCSV('BASE_TELAS'),
    fetchSheetCSV('BASE_PERFILES'),
    fetchSheetCSV('BASE_PRENDAS'),
    fetchSheetCSV('CONTROL_PAPEL_IMPRESION'),
    fetchSheetCSV('COLA_CALANDRADO'),
    fetchSheetCSV('COLA_LASER'),
    fetchSheetCSV('PENDIENTES_DRIVE'),
    fetchSheetCSV('INVENTARIO_SOBRANTES'),
    fetchSheetCSV('BITACORA_FALLAS'),
    fetchSheetCSV('ALERTAS_REPOSICION')
  ]);

  // 2. Catálogos Reales (Telas, Perfiles, Prendas, Colores)
  const catalogosMap = new Map();
  const addCat = (tipo, nombre, v1 = '', v2 = '', idx = 0) => {
    const clean = strVal(nombre);
    if (!clean) return;
    const key = `${tipo}:${clean.toUpperCase()}`;
    if (!catalogosMap.has(key)) {
      catalogosMap.set(key, {
        empresa_id: 'vvgrafic-principal',
        tipo,
        nombre: clean,
        valor_1: strVal(v1),
        valor_2: strVal(v2),
        activo: true,
        ultimo_uso_at: new Date(Date.now() - idx * 60000).toISOString(),
        contador_uso_reciente: Math.max(1, 50 - idx)
      });
    }
  };

  rawTelas.slice(1).forEach((r, idx) => addCat('TELA', r[0], r[3] || '205', r[4] || '50', idx));
  rawPerfiles.slice(1).forEach((r, idx) => addCat('PERFIL', r[0], '', '', idx));
  rawPrendas.slice(1).forEach((r, idx) => {
    const receta = JSON.stringify({
      frente: numVal(r[1]), espalda: numVal(r[2]), manga: numVal(r[3]),
      cuello: numVal(r[4]), bolsillo: numVal(r[5]), capucha: numVal(r[6]),
      puno: numVal(r[7]), cintura: numVal(r[8])
    });
    addCat('PRENDA', r[0], receta, '', idx);
  });
  ['BLANCO', 'NEGRO', 'MARINO', 'CHOCO', 'AMARILLO', 'ROSA', 'CRUDO', 'GRIS MELANGE', 'CELESTE', 'VERDE'].forEach((c, idx) => addCat('COLOR', c, '', '', idx));
  ['Roberto', 'Mauricio', 'Operador Impresión', 'Operador Calandra', 'Operador Láser'].forEach((op, idx) => addCat('EQUIPO', op, 'General', '', idx));

  await sbInsertBatch('prod_catalogos', Array.from(catalogosMap.values()), 'empresa_id,tipo,nombre');
  console.log(`✅ Catálogos reales sincronizados (${catalogosMap.size} ítems).`);

  // 3. Procesar CONTROL_PAPEL_IMPRESION exactamente como Código.js (líneas 263-309)
  // En la hoja, la fila 2 es la más reciente y la última fila es la más antigua.
  // Recorremos de más antigua a más reciente (.reverse()) para agrupar lotes anidados idénticos.
  const impDataRows = rawImp.slice(1).filter(r => strVal(r[0]) !== '');
  const mappedImp = impDataRows.map((r, i) => ({ r, idx: i })).reverse();

  const historicoImp = [];
  const rollosMap = new Map();
  let ultimoRolloActivo = '29g-1910-1';

  mappedImp.forEach((item, seqIdx) => {
    const r = item.r;
    const dObj = parseDateAR(r[0]);
    if (!dObj) return;
    // Sumamos seqIdx milisegundos para preservar el orden exacto de impresión dentro del bloque
    const tsRaw = dObj.getTime();
    const rolloId = strVal(r[1]) || 'Sin ID';
    const baseId = rolloId.split('-C')[0];
    const clienteArchivo = strVal(r[2]);
    const diseno = strVal(r[3]);
    const tela = strVal(r[4]);
    const numRollo = strVal(r[5]);
    const color = strVal(r[6]);
    const act = strVal(r[7]) || 'Impresion Normal';
    const mImp = numVal(r[8]);
    const mDesp = numVal(r[9]);
    const mRest = numVal(r[10]);
    const perfil = strVal(r[11]);
    const ruta = strVal(r[12]) || 'Solo Calandrado';
    const obs = strVal(r[13]);
    const fileId = strVal(r[14]);

    ultimoRolloActivo = rolloId;

    if (!rollosMap.has(baseId)) {
      rollosMap.set(baseId, {
        id_rollo: baseId,
        empresa_id: 'vvgrafic-principal',
        gramaje: baseId.split('g')[0] || '29',
        metros_iniciales: Math.max(100, mRest + mImp + mDesp),
        estado: 'Terminado',
        fecha_montaje: dObj.toISOString(),
        observaciones: ''
      });
    } else {
      const rm = rollosMap.get(baseId);
      rm.metros_iniciales = Math.max(rm.metros_iniciales, mRest + mImp + mDesp);
    }

    // Agrupación de archivos anidados del mismo lote (idéntico a Código.js línea 279)
    if (act.toLowerCase().includes('impresion normal') && historicoImp.length > 0) {
      const last = historicoImp[historicoImp.length - 1];
      if (
        last._tsRaw === tsRaw &&
        last.id_rollo_papel === rolloId &&
        last.accion === act &&
        last.diseno === diseno &&
        last.tela_destino === tela &&
        last.num_rollo_tela === numRollo &&
        last.color_tela === color &&
        !last.cliente_archivo.split(' | ').includes(clienteArchivo)
      ) {
        last.cliente_archivo += ' | ' + clienteArchivo;
        last.metros_impresos = Number((last.metros_impresos + mImp).toFixed(2));
        last.metros_restantes_snapshot = mRest;
        if (fileId) {
          last.file_id = last.file_id ? `${last.file_id},${fileId}` : fileId;
        }
        return;
      }
    }

    const isoOrdered = new Date(tsRaw + (seqIdx % 900)).toISOString();
    const batchId = `IMP-${rolloId}-${tsRaw}-${seqIdx}`;

    historicoImp.push({
      _tsRaw: tsRaw,
      empresa_id: 'vvgrafic-principal',
      batch_id: batchId,
      fecha_hora: isoOrdered,
      id_rollo_papel: rolloId,
      id_rollo_base: baseId,
      cliente_archivo: clienteArchivo || `--- ${act.toUpperCase()} ---`,
      diseno: diseno,
      tela_destino: tela,
      num_rollo_tela: numRollo,
      color_tela: color,
      accion: act,
      metros_impresos: mImp,
      metros_desperdicio: mDesp,
      metros_restantes_snapshot: mRest,
      perfil: perfil,
      ruta: ruta,
      observaciones: obs,
      file_id: fileId
    });
  });

  // Marcar el rollo activo actual y los sobrantes de INVENTARIO_SOBRANTES
  const baseActivo = ultimoRolloActivo.split('-C')[0];
  if (rollosMap.has(baseActivo)) {
    rollosMap.get(baseActivo).estado = 'Activo';
  }

  rawSobrantes.slice(1).forEach(r => {
    const idBob = strVal(r[1]);
    const estSob = strVal(r[4]).toLowerCase();
    if (!idBob) return;
    if (estSob.includes('depósito') || estSob.includes('deposito')) {
      const baseSob = idBob.split('-C')[0];
      const mRestSob = numVal(r[3]);
      const dSob = parseDateAR(r[0]) || new Date();
      rollosMap.set(idBob, {
        id_rollo: idBob,
        empresa_id: 'vvgrafic-principal',
        gramaje: strVal(r[2]) || idBob.split('g')[0] || '29',
        metros_iniciales: mRestSob > 0 ? mRestSob : 25,
        estado: 'Sobrante',
        fecha_montaje: dSob.toISOString(),
        observaciones: strVal(r[5]) || 'En Depósito'
      });
    }
  });

  await sbDeleteAll('prod_impresiones');
  await sbDeleteAll('prod_rollos_papel');
  await sbInsertBatch('prod_rollos_papel', Array.from(rollosMap.values()), 'id_rollo');

  const impRowsClean = historicoImp.map(({ _tsRaw, ...rest }) => rest);
  await sbInsertBatch('prod_impresiones', impRowsClean);
  console.log(`✅ CONTROL_PAPEL_IMPRESION clonado: ${impRowsClean.length} registros agrupados y ${rollosMap.size} rollos.`);

  // 4. Procesar COLA_CALANDRADO exactamente como Código.js (líneas 315-356)
  const calDataRows = rawCal.slice(1).filter(r => strVal(r[0]) !== '' && strVal(r[0]).toLowerCase() !== 'fecha/hora');
  const mappedCal = calDataRows.map((r, i) => ({ r, idx: i })).reverse();

  const allCalandra = [];
  mappedCal.forEach((item, seqIdx) => {
    const r = item.r;
    const dObj = parseDateAR(r[0]);
    if (!dObj) return;
    const tsRaw = dObj.getTime();
    const rolloFila = strVal(r[1]) || 'Sin Rollo';
    const clienteArchivo = strVal(r[2]);
    const diseno = strVal(r[3]);
    const tela = strVal(r[4]);
    const numRollo = strVal(r[5]);
    const color = strVal(r[6]);
    const m = numVal(r[7]);
    const perfil = strVal(r[8]);
    const ruta = strVal(r[9]) || 'Solo Calandrado';
    const obs = strVal(r[10]);
    let est = strVal(r[11]);
    if (est === '') est = 'Pendiente';
    const fileId = strVal(r[12]);
    const vel = numVal(r[13]) || 50;
    const temp = numVal(r[14]) || 205;
    const mins = numVal(r[15]) || 0;

    const isInfo = est.toLowerCase().includes('info') || clienteArchivo.includes('AJUSTE');

    if (allCalandra.length > 0 && !isInfo) {
      const last = allCalandra[allCalandra.length - 1];
      if (
        last._tsRaw === tsRaw &&
        last.id_rollo_papel === rolloFila &&
        last.estado === est &&
        last.diseno === diseno &&
        last.tela_destino === tela &&
        last.num_rollo_tela === numRollo &&
        last.color_tela === color &&
        !last.cliente_archivo.split(' | ').includes(clienteArchivo)
      ) {
        last.cliente_archivo += ' | ' + clienteArchivo;
        last.metros = Number((last.metros + m).toFixed(2));
        if (fileId) {
          last.file_id = last.file_id ? `${last.file_id},${fileId}` : fileId;
        }
        return;
      }
    }

    const isoOrdered = new Date(tsRaw + (seqIdx % 900)).toISOString();
    const esTerm = est.toLowerCase().includes('terminado') || est.toLowerCase().includes('procesado');

    allCalandra.push({
      _tsRaw: tsRaw,
      empresa_id: 'vvgrafic-principal',
      batch_id: `CAL-${rolloFila}-${tsRaw}-${seqIdx}`,
      fecha_hora: isoOrdered,
      fecha_terminado: esTerm ? isoOrdered : null,
      id_rollo_papel: rolloFila,
      cliente_archivo: clienteArchivo,
      diseno: diseno,
      tela_destino: tela,
      num_rollo_tela: numRollo,
      color_tela: color,
      metros: m,
      perfil: perfil,
      ruta: ruta,
      observaciones: obs,
      estado: esTerm ? 'Terminado' : est,
      file_id: fileId,
      velocidad: vel,
      temperatura: temp,
      minutos_trabajados: mins
    });
  });

  await sbDeleteAll('prod_cola_calandrado');
  const calRowsClean = allCalandra.map(({ _tsRaw, ...rest }) => rest);
  await sbInsertBatch('prod_cola_calandrado', calRowsClean);
  console.log(`✅ COLA_CALANDRADO clonada: ${calRowsClean.length} registros reales (Pendientes + Historial Terminados).`);

  // 5. Procesar COLA_LASER exactamente como Código.js (líneas 359-399)
  const laserDataRows = rawLaser.slice(1).filter(r => strVal(r[0]) !== '');
  const laserRows = [];
  laserDataRows.forEach((r, idx) => {
    const dObj = parseDateAR(r[0]);
    if (!dObj) return;
    const tsRaw = dObj.getTime();
    const rolloId = strVal(r[1]) || 'Sin Rollo';
    const cliArch = strVal(r[2]);
    const telaRollo = strVal(r[3]);
    const m = numVal(r[4]);
    const ruta = strVal(r[5]) || 'Calandrado + Corte Láser';
    const vel = numVal(r[6]) || 35;
    const pod = numVal(r[7]) || 90;
    const mins = numVal(r[8]) || 0;
    const estRaw = strVal(r[9]) || 'Pendiente';
    const esTerm = estRaw.toLowerCase().includes('terminado');
    const obs = strVal(r[10]);
    const fileId = strVal(r[11]);

    laserRows.push({
      empresa_id: 'vvgrafic-principal',
      batch_id: `LAS-${rolloId}-${tsRaw}-${estRaw}`,
      fecha_ingreso: dObj.toISOString(),
      fecha_terminado: esTerm ? dObj.toISOString() : null,
      id_rollo_papel: rolloId,
      cliente_archivo: cliArch,
      tela_rollo_color: telaRollo,
      metros: m,
      ruta: ruta,
      velocidad: vel,
      poder: pod,
      minutos_trabajados: mins,
      estado: esTerm ? 'Terminado' : 'Pendiente',
      observaciones: obs,
      file_id: fileId
    });
  });

  await sbDeleteAll('prod_cola_laser');
  await sbInsertBatch('prod_cola_laser', laserRows);
  console.log(`✅ COLA_LASER clonada: ${laserRows.length} registros reales.`);

  // 6. Procesar PENDIENTES_DRIVE (Sublimación real desde la hoja + DTF real desde Drive)
  const pendMap = new Map();
  rawPend.slice(1).forEach((r, idx) => {
    const archivoStr = strVal(r[1]);
    if (!archivoStr) return;
    let est = strVal(r[6]).toUpperCase();
    if (est.includes('SI') || est.includes('IMPRESO')) est = 'SI';
    else if (est.includes('IMPRIMIENDO')) est = 'Imprimiendo';
    else est = 'NO';

    const medida = numVal(r[2]);
    const reps = parseInt(r[3], 10) || 1;
    const calcMts = numVal(r[4]) || Number((medida * reps).toFixed(2)) || 0;
    const fileId = strVal(r[7]) || `SUB-PEND-${idx}`;

    pendMap.set(fileId, {
      empresa_id: 'vvgrafic-principal',
      modulo: 'SUBLIMACION',
      cliente: strVal(r[0]) || 'SIN CLIENTE',
      nombre_archivo: archivoStr,
      medida_unitaria: medida,
      repeticiones: reps,
      metros_totales: calcMts,
      metros_dpi_real: calcMts,
      dpi_detectado: 150,
      perfil_detectado: strVal(r[5]),
      tela_detectada: '',
      rollo_detectado: '',
      color_detectado: '',
      ruta_detectada: 'Solo Calandrado',
      prioridad_maxima: false,
      estado_impreso: est === 'SI' ? 'SI' : 'NO',
      file_id: fileId,
      url: strVal(r[8])
    });
  });

  const dtfPend = scanLocalDTF(DIR_DTF, DIR_DTF);
  dtfPend.forEach(d => pendMap.set(d.file_id, d));
  const allPend = Array.from(pendMap.values());
  await sbDeleteAll('prod_pendientes_drive');
  await sbInsertBatch('prod_pendientes_drive', allPend, 'file_id');
  console.log(`✅ PENDIENTES_DRIVE sincronizados: ${pendMap.size - dtfPend.length} de Sublimación (hoja real) + ${dtfPend.length} de DTF.`);

  // 7. Procesar BITACORA_FALLAS y ALERTAS_REPOSICION
  const fallasRows = [];
  rawFallas.slice(1).forEach(r => {
    const dObj = parseDateAR(r[0]);
    if (!dObj) return;
    fallasRows.push({
      empresa_id: 'vvgrafic-principal',
      fecha_hora: dObj.toISOString(),
      tipo_registro: 'BITACORA_FALLA',
      estacion: strVal(r[4]).toUpperCase().includes('CALANDRA') ? 'Calandrado' : 'Impresión',
      id_rollo: strVal(r[1]),
      archivo_afectado: strVal(r[2]),
      metros_merma: numVal(r[3]),
      detalle_reposicion: '',
      motivo: strVal(r[4]),
      estado: 'Registrada'
    });
  });
  rawAlertas.slice(1).forEach(r => {
    const dObj = parseDateAR(r[0]);
    if (!dObj) return;
    fallasRows.push({
      empresa_id: 'vvgrafic-principal',
      fecha_hora: dObj.toISOString(),
      tipo_registro: 'ALERTA_REPOSICION',
      estacion: 'Taller',
      id_rollo: '',
      archivo_afectado: strVal(r[1]),
      metros_merma: 0,
      detalle_reposicion: strVal(r[2]),
      motivo: strVal(r[3]),
      estado: strVal(r[4]) || 'Pendiente'
    });
  });
  await sbDeleteAll('prod_fallas_reposiciones');
  await sbInsertBatch('prod_fallas_reposiciones', fallasRows);
  console.log(`✅ BITACORA_FALLAS y ALERTAS_REPOSICION sincronizadas (${fallasRows.length} registros).`);
}

main().catch(console.error);
