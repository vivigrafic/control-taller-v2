/**
 * Sincronizador de Archivos Reales de Google Drive a Supabase (Clon de Pruebas)
 * Lee directamente las carpetas locales de Google Drive del Taller:
 * - Sublimación: G:\Mi unidad\VIVI GRAFIC\fila_impresión\sublimacion
 * - DTF: G:\Mi unidad\VIVI GRAFIC\fila_impresión\dtf
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://kkvzzheccniclfwqzivu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '' // clave secreta: va en el archivo .env (no se sube), nunca en el código;

const DIR_SUBLIMACION = 'G:/Mi unidad/VIVI GRAFIC/fila_impresión/sublimacion';
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
        if (/v-v|polyjet|calidad|rapido|dtf/i.test(clean)) {
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
  if (rMatch) rolloDet = rMatch[1].trim();

  let rutaDet = 'Solo Calandrado';
  if (/LASER|LÁSER|CORTE/i.test(fullText)) rutaDet = 'Calandrado + Corte Láser';
  else if (/SOLO\s*IMP|PAPEL/i.test(fullText)) rutaDet = 'Solo Impresión';

  let repoMuestra = '';
  if (/REPO/i.test(fullText)) repoMuestra = 'REPOSICION';
  else if (/MUESTRA/i.test(fullText)) repoMuestra = 'MUESTRA';

  return {
    medida: Number(medida.toFixed(2)),
    reps: reps,
    total: totalCalculado,
    tela: telaDet,
    perfil: perfilDet,
    color: colorDet,
    rollo: rolloDet,
    ruta: rutaDet,
    repoMuestra: repoMuestra
  };
}

function extractCliente(fileName, folderName) {
  // Primero si folderName no es raiz ni generico
  if (folderName && !/^00|fila_impresi|dtf|sublimacion|raiz/i.test(folderName)) {
    let cleanFolder = folderName.split(/[\\\/]/)[0];
    let clientPart = cleanFolder.split(/[\(\-\[]/)[0].trim();
    if (clientPart && clientPart.length > 1 && !/listos|vmg|00/i.test(clientPart)) {
      return clientPart;
    }
  }
  // Del nombre de archivo
  let parts = fileName.split(/[\(\-\[]/);
  if (parts && parts[0].trim()) {
    let cand = parts[0].trim();
    if (cand.length > 1 && !/repo|muestra|dtf/i.test(cand)) {
      return cand;
    }
  }
  return 'SIN CLIENTE';
}

function scanPendingFiles(dir, modulo, baseDir = dir) {
  let list = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item.startsWith('00') || item.toLowerCase() === 'desktop.ini') continue;
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!item.toUpperCase().includes('IMPRESOS')) {
          list = list.concat(scanPendingFiles(fullPath, modulo, baseDir));
        }
      } else {
        const ext = path.extname(item).toLowerCase();
        if (['.jpg', '.jpeg', '.tif', '.tiff', '.png', '.pdf'].includes(ext)) {
          const relFolder = path.relative(baseDir, path.dirname(fullPath));
          list.push({
            modulo,
            fileName: item,
            relFolder: relFolder || 'RAIZ',
            fullPath
          });
        }
      }
    }
  } catch(e) {
    console.error('Error al escanear:', dir, e.message);
  }
  return list;
}

async function run() {
  console.log('--- Obteniendo catálogos de Supabase ---');
  const catRes = await fetch(SUPABASE_URL + '/rest/v1/prod_catalogos?select=tipo,nombre', {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  const cats = await catRes.json();
  const telasList = cats.filter(c => c.tipo === 'TELA').map(c => c.nombre);
  const perfilesList = cats.filter(c => c.tipo === 'PERFIL').map(c => c.nombre);
  const coloresList = cats.filter(c => c.tipo === 'COLOR').map(c => c.nombre);

  console.log('--- Escaneando carpetas de Drive ---');
  const filesSub = scanPendingFiles(DIR_SUBLIMACION, 'SUBLIMACION');
  const filesDtf = scanPendingFiles(DIR_DTF, 'DTF');
  const allFiles = filesSub.concat(filesDtf);
  console.log(`Encontrados: ${filesSub.length} Sublimación, ${filesDtf.length} DTF. Total: ${allFiles.length}`);

  const rows = allFiles.map((f, idx) => {
    const parsed = parseSmartFilename(f.fileName, f.relFolder, telasList, perfilesList, coloresList);
    const cliente = extractCliente(f.fileName, f.relFolder);
    return {
      empresa_id: 'vvgrafic-principal',
      modulo: f.modulo,
      cliente: cliente,
      nombre_archivo: f.fileName,
      medida_unitaria: parsed.medida,
      repeticiones: parsed.reps,
      metros_totales: parsed.total,
      perfil_detectado: parsed.perfil || (f.modulo === 'DTF' ? 'DTF 6 Pasadas' : 'V-V 3P RÁPIDO'),
      tela_detectada: parsed.tela || '',
      rollo_detectado: parsed.rollo || '',
      color_detectado: parsed.color || '',
      ruta_detectada: parsed.ruta,
      es_repo_muestra: parsed.repoMuestra || null,
      estado_impreso: 'NO',
      prioridad_maxima: false
    };
  });

  console.log('--- Limpiando archivos de muestra anteriores en Supabase ---');
  await fetch(SUPABASE_URL + '/rest/v1/prod_pendientes_drive?empresa_id=eq.vvgrafic-principal', {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });

  console.log(`--- Insertando ${rows.length} archivos reales en Supabase ---`);
  // Insertar en lotes de 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const postRes = await fetch(SUPABASE_URL + '/rest/v1/prod_pendientes_drive', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(chunk)
    });
    if (!postRes.ok) {
      console.error('Error insertando lote:', await postRes.text());
    } else {
      console.log(`Lote ${i / 50 + 1} insertado OK (${chunk.length} filas).`);
    }
  }

  console.log('✅ ¡Sincronización de Archivos Reales completada exitosamente!');
}

run().catch(console.error);
