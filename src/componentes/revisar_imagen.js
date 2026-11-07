// revisar_imagen.js: revisa un diseño en la PC que se está usando, sin subirlo a ningún lado y sin límite de tamaño
// (07/11/2026, lo que hacía el "generador de impresiones" de la PC). Lee la cabecera del archivo (medidas, resolución, modo
// de color) y, en los PNG con transparencia, recorre la imagen fila por fila (sin cargarla entera en memoria) para ver si
// los bordes tienen transparencia: arriba o abajo deja una línea blanca entre una repetición y la siguiente.
//   vgRevisarImagen.revisar(file)                       → { ancho_px, alto_px, dpi, formato, modo, alfa, bordes: {arriba, abajo, izq, der} }
//   vgRevisarImagen.juzgar(info, { papel, tela, estampa, continuo }) → { estado: 'ok'|'aviso'|'mal', errores: [], avisos: [], ancho_cm, alto_cm }
//     continuo: false para piezas que van a corte láser (ahí la transparencia es normal)
(function () {
    if (window.vgRevisarImagen) return;
    const leer = (file, desde, hasta) => file.slice(desde, hasta).arrayBuffer().then(b => new DataView(b));
    const texto = (v, i, n) => { let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(v.getUint8(i + k)); return s; };

    // ---------- PNG ----------
    async function png(file) {
        const info = { formato: 'PNG' };
        const cab = await leer(file, 0, Math.min(file.size, 1 << 20));
        if (texto(cab, 1, 3) !== 'PNG') throw new Error('No es un PNG válido.');
        let pos = 8;
        const idat = [];
        let paleta = null;
        // Recorre los bloques: los de datos (IDAT) solo se anotan; se leen después, de a poco
        while (pos + 8 <= file.size) {
            const v = await leer(file, pos, Math.min(file.size, pos + 8 + 64));
            const largo = v.getUint32(0);
            const tipo = texto(v, 4, 4);
            if (tipo === 'IHDR') {
                info.ancho_px = v.getUint32(8); info.alto_px = v.getUint32(12);
                info.bits = v.getUint8(16); info.tipo_color = v.getUint8(17); info.entrelazado = v.getUint8(20) === 1;
            } else if (tipo === 'pHYs' && v.getUint8(16) === 1) {
                info.dpi = Math.round(((v.getUint32(8) + v.getUint32(12)) / 2) * 0.0254 * 10) / 10;
            } else if (tipo === 'tRNS') {
                paleta = await leer(file, pos + 8, pos + 8 + largo);
            } else if (tipo === 'IDAT') {
                idat.push([pos + 8, pos + 8 + largo]);
            } else if (tipo === 'IEND') break;
            pos += 12 + largo;
        }
        const t = info.tipo_color;
        info.modo = { 0: 'Grises', 2: 'RGB', 3: 'Paleta', 4: 'Grises + transparencia', 6: 'RGB + transparencia' }[t] || 'Desconocido';
        info.alfa = t === 4 || t === 6 || (t === 3 && !!paleta) || ((t === 0 || t === 2) && !!paleta);
        if (!info.alfa) return info;
        if (info.entrelazado || !window.DecompressionStream) { info.bordes = null; info.sin_revisar_bordes = true; return info; }
        info.bordes = await bordesPng(file, info, idat, paleta);
        return info;
    }

    // Descomprime los datos de a pedazos y mira la transparencia de la primera y la última fila y de los costados de cada fila
    async function bordesPng(file, info, idat, paleta) {
        const t = info.tipo_color, bits = info.bits;
        const canales = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[t];
        const bpp = Math.max(1, Math.ceil((canales * bits) / 8));
        const fila = Math.ceil((info.ancho_px * canales * bits) / 8);
        const anterior = new Uint8Array(fila), actual = new Uint8Array(fila);
        const b = { arriba: false, abajo: false, izq: false, der: false };
        let ultimaTransparente = false;
        // ¿Ese píxel es transparente?
        const transparente = (r, x) => {
            if (t === 6) return (bits === 8 ? r[x * 4 + 3] : r[x * 8 + 6]) < 255;
            if (t === 4) return (bits === 8 ? r[x * 2 + 1] : r[x * 4 + 2]) < 255;
            if (t === 3) {
                const i = bits === 8 ? r[x] : (r[(x * bits) >> 3] >> (8 - bits - ((x * bits) & 7))) & ((1 << bits) - 1);
                return paleta && i < paleta.byteLength && paleta.getUint8(i) < 255;
            }
            return false;   // grises o RGB con un color transparente: muy raro en diseños, no se revisa
        };
        // Una fila cuenta como transparente si lo es más del 1% (una esquina sola, por un costado transparente, no deja línea)
        const filaTransparente = (r) => { let n = 0; const tope = Math.max(2, info.ancho_px / 100); for (let x = 0; x < info.ancho_px; x++) if (transparente(r, x) && ++n > tope) return true; return false; };
        const flujo = new ReadableStream({
            async start(c) {
                for (const [d, h] of idat) {
                    for (let i = d; i < h; i += 4 << 20) c.enqueue(new Uint8Array(await file.slice(i, Math.min(h, i + (4 << 20))).arrayBuffer()));
                }
                c.close();
            }
        }).pipeThrough(new DecompressionStream('deflate'));
        const lector = flujo.getReader();
        let y = 0, filtro = -1, k = 0;
        for (;;) {
            const { value, done } = await lector.read();
            if (done) break;
            for (let i = 0; i < value.length; i++) {
                if (filtro < 0) { filtro = value[i]; k = 0; continue; }
                const crudo = value[i];
                const a = k >= bpp ? actual[k - bpp] : 0, u = anterior[k], c = k >= bpp ? anterior[k - bpp] : 0;
                let v;
                if (filtro === 0) v = crudo;
                else if (filtro === 1) v = crudo + a;
                else if (filtro === 2) v = crudo + u;
                else if (filtro === 3) v = crudo + ((a + u) >> 1);
                else { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v = crudo + (pa <= pb && pa <= pc ? a : pb <= pc ? u : c); }
                actual[k++] = v & 255;
                if (k === fila) {
                    if (y === 0) b.arriba = filaTransparente(actual);
                    ultimaTransparente = y === info.alto_px - 1 ? filaTransparente(actual) : false;
                    if (!b.izq && transparente(actual, 0)) b.izq = true;
                    if (!b.der && transparente(actual, info.ancho_px - 1)) b.der = true;
                    anterior.set(actual);
                    y++; filtro = -1; k = 0;
                }
            }
        }
        b.abajo = ultimaTransparente;
        return b;
    }

    // ---------- JPG ----------
    async function jpg(file) {
        const info = { formato: 'JPG', alfa: false };
        const v = await leer(file, 0, Math.min(file.size, 2 << 20));
        let i = 2;
        while (i + 4 < v.byteLength) {
            if (v.getUint8(i) !== 0xFF) { i++; continue; }
            const m = v.getUint8(i + 1), largo = v.getUint16(i + 2);
            if (m === 0xE0 && texto(v, i + 4, 4) === 'JFIF') {
                const u = v.getUint8(i + 11), dx = v.getUint16(i + 12);
                if (u === 1 && dx > 1) info.dpi = dx; else if (u === 2 && dx > 1) info.dpi = Math.round(dx * 2.54 * 10) / 10;
            } else if (m === 0xE1 && texto(v, i + 4, 4) === 'Exif' && !info.dpi) {
                const d = exifDpi(v, i + 10);
                if (d) info.dpi = d;
            } else if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) {
                info.alto_px = v.getUint16(i + 5); info.ancho_px = v.getUint16(i + 7);
                const comp = v.getUint8(i + 9);
                info.modo = comp === 4 ? 'CMYK' : comp === 1 ? 'Grises' : 'RGB';
                break;
            }
            i += 2 + largo;
        }
        return info;
    }
    function exifDpi(v, base) {
        try {
            const le = texto(v, base, 2) === 'II';
            const u16 = (o) => v.getUint16(base + o, le), u32 = (o) => v.getUint32(base + o, le);
            const ifd = u32(4), n = u16(ifd);
            let x = null, unidad = 2;
            for (let k = 0; k < n; k++) {
                const e = ifd + 2 + k * 12, tag = u16(e);
                if (tag === 0x011A) { const o = u32(e + 8); x = u32(o) / (u32(o + 4) || 1); }
                if (tag === 0x0128) unidad = u16(e + 8);
            }
            if (!x) return null;
            return Math.round((unidad === 3 ? x * 2.54 : x) * 10) / 10;
        } catch (e) { return null; }
    }

    // ---------- TIFF (cabecera) ----------
    async function tif(file) {
        const info = { formato: 'TIFF' };
        const c = await leer(file, 0, 8);
        const le = texto(c, 0, 2) === 'II';
        // El índice de la imagen puede estar al final del archivo: se lee desde ahí
        const desde = c.getUint32(4, le);
        const v0 = await leer(file, desde, Math.min(file.size, desde + 65536));
        const u16 = (o) => v0.getUint16(o - desde, le), u32 = (o) => v0.getUint32(o - desde, le);
        const v = { byteLength: desde + v0.byteLength };
        const ifd = desde, n = u16(ifd);
        let x = null, unidad = 2, muestras = 3, extra = false, foto = 2;
        for (let k = 0; k < n; k++) {
            const e = ifd + 2 + k * 12, tag = u16(e), tipo = u16(e + 2);
            const val = tipo === 3 ? u16(e + 8) : u32(e + 8);
            if (tag === 256) info.ancho_px = val;
            if (tag === 257) info.alto_px = val;
            if (tag === 277) muestras = val;
            if (tag === 262) foto = val;
            if (tag === 338) extra = true;
            if (tag === 296) unidad = val;
            if (tag === 282) { const o = u32(e + 8); if (o >= desde && o + 8 <= v.byteLength) x = u32(o) / (u32(o + 4) || 1); else { const w = await leer(file, o, o + 8); x = w.getUint32(0, le) / (w.getUint32(4, le) || 1); } }
        }
        if (x) info.dpi = Math.round((unidad === 3 ? x * 2.54 : x) * 10) / 10;
        info.modo = foto === 5 ? 'CMYK' : foto === 1 || foto === 0 ? 'Grises' : 'RGB';
        info.alfa = extra || (foto === 2 && muestras > 3);
        if (info.alfa) info.sin_revisar_bordes = true;
        return info;
    }

    async function revisar(file) {
        const n = String(file.name || '').toLowerCase();
        const cab = await leer(file, 0, 4);
        let info;
        // Se mira lo que el archivo es por dentro (a veces la extensión miente)
        if (cab.getUint32(0) === 0x89504E47) info = await png(file);
        else if (cab.getUint16(0) === 0xFFD8) info = await jpg(file);
        else if (/^(II|MM)$/.test(texto(cab, 0, 2))) info = await tif(file);
        else info = { formato: (n.split('.').pop() || '').toUpperCase(), sin_medidas: true };
        const ext = { JPEG: 'JPG', TIF: 'TIFF' }[(n.split('.').pop() || '').toUpperCase()] || (n.split('.').pop() || '').toUpperCase();
        if (!info.sin_medidas && ext && ext !== info.formato) info.extension_distinta = ext;
        info.nombre = file.name;
        info.tamano_mb = Math.round(file.size / 1048576 * 10) / 10;
        return info;
    }

    // Lo mismo que el generador de la PC: ancho contra el papel y la tela, resolución y bordes
    function juzgar(info, c = {}) {
        const papel = Number(c.papel) || 160, tela = Number(c.tela) || null, estampa = Number(c.estampa) || null;
        const errores = [], avisos = [];
        const dpi = Number(info.dpi) || null;
        const ancho_cm = info.ancho_px && dpi ? Math.round(info.ancho_px / dpi * 2.54 * 10) / 10 : null;
        const alto_cm = info.alto_px && dpi ? Math.round(info.alto_px / dpi * 2.54 * 10) / 10 : null;
        if (info.sin_medidas) avisos.push('No pude leer las medidas de este formato.');
        if (!dpi && !info.sin_medidas) avisos.push('No tiene la resolución guardada: no se puede saber cuánto mide.');
        if (ancho_cm && ancho_cm > papel + 0.5) errores.push(`Mide ${ancho_cm} cm de ancho y el papel tiene ${papel} cm.`);
        else if (ancho_cm && tela && ancho_cm > tela + 0.5) avisos.push(`Mide ${ancho_cm} cm de ancho y la tela tiene ${tela} cm.`);
        if (ancho_cm && estampa && Math.abs(ancho_cm - estampa) > 1.5) avisos.push(`Mide ${ancho_cm} cm de ancho y se esperaba ${estampa} cm.`);
        // En un estampado corrido la transparencia arriba o abajo deja una línea blanca; en piezas para cortar es normal
        const continuo = c.continuo !== false;
        if (info.bordes && (info.bordes.arriba || info.bordes.abajo)) {
            if (continuo) errores.push('Tiene transparencia arriba o abajo: deja una línea blanca entre repeticiones.');
            else avisos.push('Tiene transparencia en los bordes (normal si son piezas para cortar).');
        } else if (info.bordes && (info.bordes.izq || info.bordes.der) && continuo) avisos.push('Tiene transparencia en los costados.');
        if (info.sin_revisar_bordes) avisos.push('Tiene transparencia y no pude revisar los bordes: miralos antes de imprimir.');
        if (info.extension_distinta) avisos.push(`Dice .${info.extension_distinta.toLowerCase()} pero por dentro es ${info.formato}: algunos programas no lo abren.`);
        if (info.modo && !/RGB|CMYK/.test(info.modo)) avisos.push(`Está en ${info.modo}: conviene RGB o CMYK.`);
        return { estado: errores.length ? 'mal' : avisos.length ? 'aviso' : 'ok', errores, avisos, ancho_cm, alto_cm };
    }

    window.vgRevisarImagen = { revisar, juzgar };
})();
