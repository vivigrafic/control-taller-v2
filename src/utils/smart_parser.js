// ============================================================================
// MOTOR DE AUTO-DETECCIÓN DE NOMBRES + LECTOR BINARIO DE DPI + COMPRESOR WEBP
// Control de Taller y Producción 2.0 — V&V Grafic
// ============================================================================

export function parsearNombreArchivoInteligente(nombreArchivo = "", nombreCarpeta = "", catalogos = {}) {
  const nombre = String(nombreArchivo || "").trim();
  const carpeta = String(nombreCarpeta || "").trim();
  const textoCompleto = `${nombre} ${carpeta}`;
  const textoUpper = textoCompleto.toUpperCase();

  const telas = (catalogos.telas || []).map(t => typeof t === "string" ? t : t.nombre).filter(Boolean);
  const perfiles = (catalogos.perfiles || []).map(p => typeof p === "string" ? p : p.nombre).filter(Boolean);
  const colores = (catalogos.colores || []).map(c => typeof c === "string" ? c : c.nombre).filter(Boolean);

  // 1. Extraer Medida Unitaria y Repeticiones
  let medida = 0;
  let repeticiones = 1;
  const parseNum = (v) => {
    const n = parseFloat(String(v).replace(",", "."));
    return isNaN(n) ? 0 : n;
  };

  const match3 = nombre.match(/(\d+[\.,]?\d*)\s*[xX]\s*(\d+[\.,]?\d*)\s*[xX]\s*(\d+)/i);
  if (match3) {
    const h = parseNum(match3[2]);
    medida = h > 10 ? h / 100.0 : h;
    repeticiones = parseInt(match3[3], 10) || 1;
  } else {
    const xMatch = nombre.match(/([\d,.]+)\s*(?:MTS?|MT|M)?\s*[xX]\s*(\d+)/i);
    if (xMatch) {
      const m = parseNum(xMatch[1]);
      medida = m > 50 ? m / 100.0 : m;
      repeticiones = parseInt(xMatch[2], 10) || 1;
    } else {
      const mtsMatch = nombre.match(/([\d,.]+)\s*(?:MTS?|MT|M\b)/i);
      if (mtsMatch) {
        const m = parseNum(mtsMatch[1]);
        medida = m > 80 ? m / 100.0 : m;
      }
    }
  }

  // 2. Detectar Perfil (primero contra catálogo en todo el nombre/carpeta, luego paréntesis)
  let perfilDetectado = "";
  const perfilesOrdenados = [...perfiles].sort((a, b) => b.length - a.length);
  for (const p of perfilesOrdenados) {
    if (textoUpper.includes(p.toUpperCase())) {
      perfilDetectado = p;
      break;
    }
  }
  if (!perfilDetectado) {
    const parentesis = nombre.match(/\(([^)]+)\)/g);
    if (parentesis) {
      for (let i = parentesis.length - 1; i >= 0; i--) {
        const contenido = parentesis[i].replace(/[()]/g, "").trim();
        if (
          contenido &&
          !/^\d{2}-\d{2}-\d{2}$/.test(contenido) &&
          !/^\d+[\.,]?\d*\s*[mM][tT]?$/i.test(contenido) &&
          !/^(repo|reposicion|reposición|muestra)$/i.test(contenido)
        ) {
          perfilDetectado = contenido;
          break;
        }
      }
    }
  }

  // 3. Detectar Tela Destino (en cualquier lugar del nombre o carpeta)
  let telaDetectada = "";
  const telasOrdenadas = [...telas].sort((a, b) => b.length - a.length);
  for (const t of telasOrdenadas) {
    if (textoUpper.includes(t.toUpperCase())) {
      telaDetectada = t;
      break;
    }
  }

  // 4. Detectar Nº de Rollo / Bobina de Tela (ej: "Rollo 42", "R-42", "R42", "Bobina 15", "#42")
  let rolloDetectado = "";
  const rolloMatch = textoCompleto.match(/(?:ROLLO|BOBINA|R-|\bR|#)\s*#?(\d{1,5})\b/i);
  if (rolloMatch) {
    rolloDetectado = rolloMatch[1];
  }

  // 5. Detectar Color de la Tela
  let colorDetectado = "";
  const coloresOrdenados = [...colores].sort((a, b) => b.length - a.length);
  for (const c of coloresOrdenados) {
    if (textoUpper.includes(c.toUpperCase())) {
      colorDetectado = c;
      break;
    }
  }

  // 6. Detectar Ruta de Producción si está explícita en el nombre
  let rutaDetectada = "";
  if (/\b(LASER|LÁSER|CORTE)\b/i.test(textoCompleto)) {
    rutaDetectada = "Calandrado + Corte Láser";
  } else if (/\b(SOLO\s*IMPRESI[OÓ]N|SOLO\s*PAPEL)\b/i.test(textoCompleto)) {
    rutaDetectada = "Solo Impresión";
  } else if (/\b(SOLO\s*CALANDRADO|CALANDRA)\b/i.test(textoCompleto)) {
    rutaDetectada = "Solo Calandrado";
  }

  // 7. Detectar si es Reposición o Muestra (para DTF a $0 o prioridad)
  let tipoCargo = "VENTA";
  if (/\(\s*REPO(?:SICION|SICIÓN)?\s*\)|\bREPO(?:SICION|SICIÓN)?\b/i.test(textoCompleto)) {
    tipoCargo = "REPOSICION";
  } else if (/\(\s*MUESTRA\s*\)|\bMUESTRA\b/i.test(textoCompleto)) {
    tipoCargo = "MUESTRA";
  }

  return {
    medidaUnitaria: Number(medida.toFixed(2)),
    repeticiones,
    metrosTotales: Number((medida * repeticiones).toFixed(2)),
    perfil: perfilDetectado,   // Vacío "" si no está en el archivo
    tela: telaDetectada,       // Vacío "" si no está en el archivo
    rollo: rolloDetectado,     // Vacío "" si no está en el archivo
    color: colorDetectado,     // Vacío "" si no está en el archivo
    ruta: rutaDetectada,       // Vacío "" si no está en el archivo
    tipoCargo
  };
}

// Consolida la detección cuando el operario tilda 1 o MÚLTIPLES archivos (Anidados)
// REGLA DE ORO: Si un dato no está en los nombres seleccionados, devuelve "" (en blanco).
export function consolidarAutodeteccionLote(archivosSeleccionados = [], catalogos = {}) {
  if (!archivosSeleccionados || archivosSeleccionados.length === 0) {
    return { perfil: "", tela: "", rollo: "", color: "", ruta: "", conflictos: [] };
  }
  const resultados = archivosSeleccionados.map(a =>
    parsearNombreArchivoInteligente(a.nombre_archivo || a.nombre || "", a.cliente || "", catalogos)
  );

  const unicoValor = (campo) => {
    const vals = Array.from(new Set(resultados.map(r => r[campo]).filter(Boolean)));
    return {
      valor: vals.length > 0 ? vals[0] : "",
      conflicto: vals.length > 1 ? vals : null
    };
  };

  const p = unicoValor("perfil");
  const t = unicoValor("tela");
  const r = unicoValor("rollo");
  const c = unicoValor("color");
  const ru = unicoValor("ruta");

  const conflictos = [];
  if (p.conflicto) conflictos.push(`Perfiles distintos en selección: ${p.conflicto.join(" vs ")}`);
  if (t.conflicto) conflictos.push(`Telas distintas en selección: ${t.conflicto.join(" vs ")}`);
  if (c.conflicto) conflictos.push(`Colores distintos en selección: ${c.conflicto.join(" vs ")}`);

  return {
    perfil: p.valor,
    tela: t.valor,
    rollo: r.valor,
    color: c.valor,
    ruta: ru.valor,
    conflictos
  };
}

// Escala Automática de Precios DTF por Tramo (Regla de Negocio V&V Grafic)
export function calcularPrecioMetroDTF(metrosFacturados, tipoCargo = "VENTA") {
  if (tipoCargo === "REPOSICION" || tipoCargo === "MUESTRA") return 0;
  const m = Number(metrosFacturados) || 0;
  if (m <= 0) return 9000;
  if (m < 10) return 9000;
  if (m < 50) return 8500;
  if (m < 100) return 8000;
  if (m < 500) return 7500;
  return 6500;
}

// Lector Binario Real de Dimensiones y DPI en Navegador (PNG / JPEG / TIFF)
export async function leerGeometriaRealArchivo(file) {
  try {
    const slice = file.slice(0, 65536);
    const buf = await slice.arrayBuffer();
    const view = new DataView(buf);
    const len = view.byteLength;

    let widthPx = 0;
    let heightPx = 0;
    let dpiY = 0;

    // 1. PNG (89 50 4E 47)
    if (len > 32 && view.getUint32(0) === 0x89504e47) {
      widthPx = view.getUint32(16);
      heightPx = view.getUint32(20);
      let offset = 8;
      while (offset + 12 <= len) {
        const chunkLen = view.getUint32(offset);
        const chunkType = view.getUint32(offset + 4);
        // pHYs = 0x70485973
        if (chunkType === 0x70485973 && offset + 21 <= len) {
          const ppuY = view.getUint32(offset + 12);
          const unit = view.getUint8(offset + 16);
          if (unit === 1 && ppuY > 0) {
            dpiY = Math.round(ppuY * 0.0254);
          }
          break;
        }
        offset += 12 + chunkLen;
      }
    }
    // 2. JPEG (FF D8)
    else if (len > 16 && view.getUint16(0) === 0xffd8) {
      let offset = 2;
      while (offset + 4 < len) {
        if (view.getUint8(offset) !== 0xff) { offset++; continue; }
        const marker = view.getUint8(offset + 1);
        const segLen = view.getUint16(offset + 2);
        // JFIF APP0
        if (marker === 0xe0 && offset + 16 < len) {
          const units = view.getUint8(offset + 11);
          const yDens = view.getUint16(offset + 14);
          if (units === 1) dpiY = yDens;
          else if (units === 2) dpiY = Math.round(yDens * 2.54);
        }
        // SOF0 / SOF1 / SOF2
        if ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && offset + 9 < len) {
          heightPx = view.getUint16(offset + 5);
          widthPx = view.getUint16(offset + 7);
          break;
        }
        offset += 2 + segLen;
      }
    }
    // 3. TIFF (II 0x4949 o MM 0x4d4d)
    else if (len > 16 && (view.getUint16(0) === 0x4949 || view.getUint16(0) === 0x4d4d)) {
      const little = view.getUint16(0) === 0x4949;
      const ifdOffset = view.getUint32(4, little);
      if (ifdOffset + 2 < len) {
        const numEntries = view.getUint16(ifdOffset, little);
        let resUnit = 2; // 2 = inch, 3 = cm
        let yResRaw = 0;
        for (let i = 0; i < numEntries; i++) {
          const entryPos = ifdOffset + 2 + i * 12;
          if (entryPos + 12 > len) break;
          const tag = view.getUint16(entryPos, little);
          const type = view.getUint16(entryPos + 2, little);
          const valOffset = view.getUint32(entryPos + 8, little);
          const shortVal = view.getUint16(entryPos + 8, little);
          if (tag === 256) widthPx = type === 3 ? shortVal : valOffset;
          if (tag === 257) heightPx = type === 3 ? shortVal : valOffset;
          if (tag === 283 && valOffset + 8 <= len) {
            const num = view.getUint32(valOffset, little);
            const den = view.getUint32(valOffset + 4, little);
            if (den > 0) yResRaw = num / den;
          }
          if (tag === 296) resUnit = shortVal;
        }
        if (yResRaw > 0) {
          dpiY = resUnit === 3 ? Math.round(yResRaw * 2.54) : Math.round(yResRaw);
        }
      }
    }

    if (!dpiY || dpiY < 30 || dpiY > 2400) dpiY = 150;
    const metrosReales = heightPx > 0 ? Number(((heightPx / dpiY) * 0.0254).toFixed(2)) : 0;
    const anchoCmReal = widthPx > 0 ? Number(((widthPx / dpiY) * 2.54).toFixed(1)) : 0;

    return {
      ok: heightPx > 0,
      widthPx,
      heightPx,
      dpiDetectado: dpiY,
      anchoCmReal,
      metrosDpiReal: metrosReales
    };
  } catch (e) {
    return { ok: false, widthPx: 0, heightPx: 0, dpiDetectado: 150, anchoCmReal: 0, metrosDpiReal: 0 };
  }
}

// Compresor de Fotos de Cámara de Celular a WebP liviano para el Chat Interno
export function comprimirFotoCamaraWebP(file, maxDim = 960, quality = 0.76) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/webp", quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
