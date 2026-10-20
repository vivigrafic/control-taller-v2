/**
 * Sincronizador Completo de Archivos Pendientes + Historial Real de Impresos y Calandrados
 * Desde las carpetas reales de Google Drive del Taller a Supabase (Clon de Pruebas)
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://kkvzzheccniclfwqzivu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrdnp6aGVjY25pY2xmd3F6aXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM5Mzc3NiwiZXhwIjoyMTAxOTY5Nzc2fQ.c0BOc9aO3drO5Ta8gNdURJFM5eByD2G_hu3WfOQWCZE';

const DIR_SUBLIMACION = 'G:/Mi unidad/VIVI GRAFIC/fila_impresión/sublimacion';
const DIR_IMPRESOS = 'G:/Mi unidad/VIVI GRAFIC/fila_impresión/sublimacion/0001 IMPRESOS';
const DIR_DTF = 'G:/Mi unidad/VIVI GRAFIC/fila_impresión/dtf';

function numVal(v) {
  if (v === null || v === undefined || v === '') return 0;
  let n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function parseSmartFilename(nombre, folderName, telasList = [], perfilesList = [], coloresList = []) {
  const fullText = (nombre + ' ' + folderName).toUpperCase();
  let medida = 0, reps = 1;

  let m3 = nombre.match(/(\d+[\.,]?\d*)\s*[xX]\s*(\d+[\.,]?\d*)\s*[xX]\s*(\d+)/i);
  if (m3) {
    let h = numVal(m3[2]);
    medida = h > 10 ? h / 100.0 : h;
    reps = parseInt(m3[3], 10) || 1;
  } else {
    let xm = nombre.match(/([\d,.]+)\s*(?:MTS?|MT|M)?\s*[xX]\s*(\d+)/i);
    if (xm) {
      let m = numVal(xm[1]);
      medida = m > 50 ? m / 100.0 : m;
      reps = parseInt(xm[2], 10) || 1;
    } else {
      let mm = nombre.match(/([\d,.]+)\s*(?:MTS?|MT|M\b)/i);
      if (mm) medida = numVal(mm[1]);
    }
  }

  let mtsParen = nombre.match(/\(([\d,.]+)\s*MTS?\)/i);
  let totalCalculado = Number((medida * reps).toFixed(2));
  if (mtsParen) {
    let explicitTotal = numVal(mtsParen[1]);
    if (explicitTotal > 0) totalCalculado = explicitTotal;
  }
  if (totalCalculado <= 0) totalCalculado = 1.0;

  let telaDet = '';
  for (let t of telasList) {
    if (t && fullText.includes(t.toUpperCase())) { telaDet = t; break; }
  }

  let perfilDet = '';
  for (let p of perfilesList) {
    if (p && fullText.includes(p.toUpperCase())) { perfilDet = p; break; }
  }
  if (!perfilDet) {
    let par = nombre.match(/\(([^)]+)\)/g);
    if (par) {
      for (let pItem of par) {
        let clean = pItem.replace(/[()]/g, '').trim();
        if (/v-v|polyjet|calidad|rapido|dtf|perfil/i.test(clean)) {
          perfilDet = clean;
          break;
        }
      }
    }
  }

  let colorDet = '';
  for (let c of coloresList) {
    if (c && fullText.includes(c.toUpperCase())) { colorDet = c; break; }
  }

  let rolloDet = '';
  let rMatch = fullText.match(/(?:ROLLO|ROLLOS|BOBINA|R-|\bR)\s*#?(\d+[\d\s-]*)/i);
  if (rMatch) rolloDet = 'ROLLO ' + rMatch[1].trim();

  let rutaDet = 'Solo Calandrado';
  if (/LASER|LÁSER|CORTE/i.test(fullText)) rutaDet = 'Calandrado + Corte Láser';
  else if (/SOLO\s*IMP|PAPEL/i.test(fullText)) rutaDet = 'Solo Impresión';

  return {
    medida: Number(medida.toFixed(2)),
    reps: reps,
    total: totalCalculado,
    tela: telaDet,
    perfil: perfilDet,
    color: colorDet,
    rollo: rolloDet,
    ruta: rutaDet
  };
}

function scanPrintedHistory(dir, depth = 0) {
  let out = [];
  if (depth > 2) return out;
  try {
    const list = fs.readdirSync(dir);
    for (const item of list) {
      if (item.toLowerCase() === 'desktop.ini' || item.endsWith('.pdf')) continue;
      const full = path.join(dir, item);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        out = out.concat(scanPrintedHistory(full, depth + 1));
      } else {
        const ext = path.extname(item).toLowerCase();
        if (['.jpg', '.jpeg', '.tif', '.tiff', '.png'].includes(ext)) {
          out.push({ name: item, folder: path.basename(dir), mtime: st.mtime });
        }
      }
    }
  } catch (e) {}
  return out;
}

async function syncHistorial() {
  console.log('--- Cargando catálogos ---');
  const catRes = await fetch(SUPABASE_URL + '/rest/v1/prod_catalogos?select=tipo,nombre', {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  const cats = await catRes.json();
  const telasList = cats.filter(c => c.tipo === 'TELA').map(c => c.nombre);
  const perfilesList = cats.filter(c => c.tipo === 'PERFIL').map(c => c.nombre);
  const coloresList = cats.filter(c => c.tipo === 'COLOR').map(c => c.nombre);

  const printed = scanPrintedHistory(DIR_IMPRESOS)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 45);

  console.log(`Encontrados ${printed.length} archivos históricos recientes en 0001 IMPRESOS.`);

  // Asegurar rollos históricos en prod_rollos_papel
  const rollosHist = [
    { id_rollo: '29g-1910-1', empresa_id: 'vvgrafic-principal', gramaje: '29', metros_iniciales: 500, estado: 'Activo', fecha_montaje: '2026-10-19T10:00:00Z' },
    { id_rollo: '31g-1610-1', empresa_id: 'vvgrafic-principal', gramaje: '31', metros_iniciales: 500, estado: 'Sobrante', fecha_montaje: '2026-10-16T09:00:00Z' },
    { id_rollo: '29g-1510-1', empresa_id: 'vvgrafic-principal', gramaje: '29', metros_iniciales: 500, estado: 'Terminado', fecha_montaje: '2026-10-15T09:00:00Z' },
    { id_rollo: '31g-1310-1', empresa_id: 'vvgrafic-principal', gramaje: '31', metros_iniciales: 500, estado: 'Terminado', fecha_montaje: '2026-10-13T09:00:00Z' },
    { id_rollo: '29g-0910-1', empresa_id: 'vvgrafic-principal', gramaje: '29', metros_iniciales: 500, estado: 'Terminado', fecha_montaje: '2026-10-09T09:00:00Z' }
  ];

  await fetch(SUPABASE_URL + '/rest/v1/prod_rollos_papel?on_conflict=id_rollo', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rollosHist)
  });

  // Obtener qué ya está en prod_cola_calandrado como Pendiente/Imprimiendo para no borrarlo
  const curCalRes = await fetch(SUPABASE_URL + '/rest/v1/prod_cola_calandrado?select=*', {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  const curCal = await curCalRes.json();
  const existingNames = new Set(curCal.map(c => c.cliente_archivo));

  const newImpRows = [];
  const newCalTerminados = [];

  printed.forEach((f, idx) => {
    if (existingNames.has(f.name)) return;
    const p = parseSmartFilename(f.name, f.folder, telasList, perfilesList, coloresList);
    const dIso = f.mtime.toISOString();
    const day = f.mtime.getUTCDate();

    let rolloId = '29g-1510-1';
    if (day >= 16) rolloId = '31g-1610-1';
    else if (day >= 14) rolloId = '29g-1510-1';
    else if (day >= 11) rolloId = '31g-1310-1';
    else rolloId = '29g-0910-1';

    const batchId = `HIST-${rolloId}-${idx}`;
    const tela = p.tela || (idx % 3 === 0 ? 'POLISAP' : idx % 3 === 1 ? 'SET DE POLIÉSTER' : 'W18');
    const color = p.color || 'BLANCO';
    const perfil = p.perfil || 'POLYJET V-V 3P (CONTINUO) (BANDA COLOR)';

    newImpRows.push({
      empresa_id: 'vvgrafic-principal',
      batch_id: batchId,
      fecha_hora: dIso,
      id_rollo_papel: rolloId,
      id_rollo_base: rolloId,
      cliente_archivo: f.name,
      diseno: f.name.split('(')[0].trim(),
      tela_destino: tela,
      num_rollo_tela: p.rollo || `ROLLO ${idx + 1}`,
      color_tela: color,
      accion: 'Impresion Normal',
      metros_impresos: p.total,
      metros_desperdicio: 0,
      metros_restantes_snapshot: Math.max(20, 450 - idx * 8),
      perfil: perfil,
      ruta: p.ruta,
      observaciones: ''
    });

    newCalTerminados.push({
      empresa_id: 'vvgrafic-principal',
      batch_id: batchId,
      fecha_hora: dIso,
      fecha_terminado: new Date(f.mtime.getTime() + 3600000).toISOString(),
      id_rollo_papel: rolloId,
      cliente_archivo: f.name,
      diseno: f.name.split('(')[0].trim(),
      tela_destino: tela,
      num_rollo_tela: p.rollo || `ROLLO ${idx + 1}`,
      color_tela: color,
      metros: p.total,
      perfil: perfil,
      ruta: p.ruta,
      observaciones: '',
      estado: 'Terminado',
      velocidad: 50,
      temperatura: 205,
      minutos_trabajados: Math.max(3, Math.round(p.total * 1.1))
    });
  });

  // Limpiar solo los terminados previos para no duplicar si se corre de nuevo
  await fetch(SUPABASE_URL + '/rest/v1/prod_cola_calandrado?estado=eq.Terminado', {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });

  if (newImpRows.length > 0) {
    await fetch(SUPABASE_URL + '/rest/v1/prod_impresiones', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(newImpRows)
    });
    console.log(`✅ ${newImpRows.length} registros históricos agregados a prod_impresiones.`);
  }

  if (newCalTerminados.length > 0) {
    await fetch(SUPABASE_URL + '/rest/v1/prod_cola_calandrado', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(newCalTerminados)
    });
    console.log(`✅ ${newCalTerminados.length} trabajos calandrados terminados agregados a prod_cola_calandrado.`);
  }
}

syncHistorial().catch(console.error);
