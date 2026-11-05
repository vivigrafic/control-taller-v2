// ficha_tela.js: la ficha de tela de un trabajo (05/11/2026). Es la misma en la tarjeta del Kanban y en el taller (Impresión,
// Calandrado y kiosko): qué tela lleva, de quién es, cuántos metros, cuánto queda y dónde está; con Ver detalle y Cambiar.
//   vgFichaTela.usar(clienteSupabase)                → la conexión de la pantalla (el taller)
//   vgFichaTela.html(ficha, { grande, compacta })    → el recuadro (ficha: fichas_tela_abiertas o trabajo_ficha_tela)
//   vgFichaTela.escuchar(raiz, { alCambiar })        → activa los botones de los recuadros que estén dentro de raiz
//   vgFichaTela.abrir(trabajoId, { alCambiar })      → ventana con el detalle
//   vgFichaTela.elegir(trabajoId, { despues, partidaActual, titulo }) → 'elegida', 'despues' o null (canceló)
// Las puertas de la base: trabajo_ficha_tela, tela_ficha_cambiar, tela_reserva_elegir y calandrado_metros_guardar.
(function () {
    if (window.vgFichaTela) return;
    let sb = null;
    const db = () => sb || window.vgSupabase || window.conexionDB || window.supabaseClient;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
    const errorTexto = (e) => String((e && e.message) || e || '').replace(/^.*?ERROR:\s*/, '');
    const avisar = (t, tipo) => window.vgDialogo.avisar(t, tipo);
    const nombreTela = (t) => [t.tela, t.color].filter(Boolean).join(' ');

    function ponerEstilos() {
        if (document.getElementById('ft-estilos')) return;
        const s = document.createElement('style');
        s.id = 'ft-estilos';
        s.textContent = `
        .ft-ficha { display: block; margin-top: 6px; padding: 8px 10px; border: 1px solid var(--vg-surface-border); border-left: 4px solid var(--vg-brand-primary);
            border-radius: 8px; background: var(--vg-surface-base); color: var(--vg-text-primary); font: 13px/1.35 var(--vg-font-sans); text-align: left; }
        .ft-ficha.ft-sin { border-left-color: var(--vg-status-alert); }
        .ft-ficha.ft-grande { padding: 12px 14px; font-size: 16px; margin: 0 0 10px; }
        .ft-ficha.ft-grande .ft-nombre { font-size: 20px; }
        .ft-nombre { font-weight: 800; }
        .ft-tag { color: var(--vg-text-secondary); font-weight: 400; }
        .ft-dato { color: var(--vg-text-secondary); margin-top: 2px; }
        .ft-falta { color: var(--vg-status-alert); font-weight: 700; margin-top: 2px; }
        .ft-acc { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        .ft-acc button, .ft-det button { padding: 5px 10px; border-radius: 8px; border: 1px solid var(--vg-surface-border); background: transparent;
            color: var(--vg-text-primary); font: 600 12px var(--vg-font-sans); cursor: pointer; width: auto; margin: 0; }
        .ft-acc button.ft-fuerte, .ft-det button.ft-fuerte { background: var(--vg-brand-primary); border-color: var(--vg-brand-primary); }
        .ft-ficha.ft-grande .ft-acc button { padding: 9px 14px; font-size: 14px; }
        .ft-det h4 { margin: 14px 0 6px; font-size: 13px; color: var(--vg-text-secondary); text-transform: uppercase; letter-spacing: .03em; }
        .ft-det .ft-fila { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; padding: 7px 0; border-bottom: 1px dashed var(--vg-surface-border); font-size: 13px; }
        .ft-det small { color: var(--vg-text-secondary); display: block; }
        .vgd-caja label { text-transform: none; }
        .vgd-caja * { scrollbar-color: var(--vg-surface-border) transparent; }`;
        document.head.appendChild(s);
    }

    // "40 m para este trabajo · 12 m usados"
    function cantidades(t) {
        const p = [];
        if (Number(t.apartado) > 0) p.push(`${num(t.apartado)} m para este trabajo`);
        if (Number(t.kilos_apartados) > 0) p.push(`${num(t.kilos_apartados)} kg para este trabajo`);
        if (Number(t.usado) > 0) p.push(`${num(t.usado)} m usados`);
        if (Number(t.kilos_usados) > 0) p.push(`${num(t.kilos_usados)} kg usados`);
        return p;
    }
    function datosTela(t) {
        const queda = t.queda_metros != null ? `quedan ${num(t.queda_metros)} m` : (t.queda_kilos != null ? `quedan ${num(t.queda_kilos)} kg` : '');
        const rollos = (t.rollos || []).filter(n => n != null);
        return [...cantidades(t), queda, t.lugar || 'sin lugar cargado',
            rollos.length ? `rollo${rollos.length > 1 ? 's' : ''} ${rollos.slice().sort((a, b) => a - b).join(', ')}` : ''].filter(Boolean).join(' · ');
    }

    function html(ficha, op = {}) {
        ponerEstilos();
        if (!ficha) return '';
        const id = esc(ficha.trabajo_id);
        const clase = `ft-ficha${op.grande ? ' ft-grande' : ''}`;
        const telas = ficha.telas || [];
        const pie = op.tarjeta && ficha.tarjeta ? `<span class="ft-tag">${esc(ficha.tarjeta)} · </span>` : '';
        if (!telas.length) {
            if (!(Number(ficha.necesita) > 0.5)) return '';
            return `<div class="${clase} ft-sin"><div class="ft-nombre">${pie}⚠️ Sin tela</div><div class="ft-dato">Pide ${num(ficha.necesita)} m</div>
                <div class="ft-acc"><button type="button" class="ft-fuerte" data-ficha-elegir="${id}">🧵 Elegir tela</button></div></div>`;
        }
        return telas.map(t => `<div class="${clase}">
            <div class="ft-nombre">${pie}🧵 ${esc(nombreTela(t))} <span class="ft-tag">· ${t.dueno === 'taller' ? 'del taller' : 'del cliente'} · ${esc(t.codigo)}</span></div>
            <div class="ft-dato">${esc(datosTela(t))}</div>
            ${t.sin_rinde ? '<div class="ft-dato">Sin rinde: al terminar se ponen los kilos</div>' : ''}
            <div class="ft-acc"><button type="button" data-ficha-ver="${id}">Ver detalle</button>
                <button type="button" data-ficha-cambiar="${id}" data-partida="${esc(t.partida_id)}">Cambiar</button></div>
        </div>`).join('') + (Number(ficha.falta) > 0.5 ? `<div class="${clase} ft-sin"><div class="ft-falta">⚠️ Faltan ${num(ficha.falta)} m de tela</div>
            <div class="ft-acc"><button type="button" class="ft-fuerte" data-ficha-elegir="${id}">🧵 Sumar otra tela</button></div></div>` : '');
    }

    async function traer(trabajoId) {
        const { data, error } = await db().rpc('trabajo_ficha_tela', { p_trabajo: trabajoId });
        if (error) { avisar(errorTexto(error), 'error'); return null; }
        return data;
    }

    function detalleOpcion(o, pide) {
        const donde = o.lugar || 'sin lugar cargado';
        const cuanto = o.sin_rinde ? `${num(o.queda_kilos)} kg (sin rinde)` : `${num(o.libre)} m libres`;
        const rollo = o.numero != null ? `Rollo ${o.numero} · ` : (o.varios ? `${o.varios} rollos · ` : '');
        const nota = o.sin_rinde ? '' : (o.alcanza ? ' · alcanza' : ` · no alcanza para ${num(pide)} m`);
        return `${rollo}${cuanto} · ${donde}${nota}`;
    }

    // Una opción por rollo si alguno alcanza solo. Si ninguno alcanza, la tela entera: el sistema reparte en varios rollos.
    function agrupar(opciones, pide) {
        const salida = [];
        const vistas = new Set();
        opciones.forEach(o => {
            if (!o.rollo_id) { salida.push(o); return; }
            const hermanos = opciones.filter(x => x.partida_id === o.partida_id);
            if (hermanos.some(x => x.alcanza)) { if (o.alcanza) salida.push(o); return; }
            if (vistas.has(o.partida_id)) return;
            vistas.add(o.partida_id);
            const total = hermanos.reduce((a, x) => a + (Number(x.libre) || 0), 0);
            salida.push({ ...o, rollo_id: null, numero: null, libre: total, alcanza: total >= Number(pide), varios: hermanos.length });
        });
        return salida.sort((a, b) => Number(b.dueno === 'cliente') - Number(a.dueno === 'cliente') || Number(!!b.recomendada) - Number(!!a.recomendada)
            || Number(!!b.alcanza) - Number(!!a.alcanza));
    }

    // Elegir o cambiar la tela. Lo recomendado viene primero y ya elegido: alcanza con Aceptar.
    async function elegir(trabajoId, op = {}) {
        const f = await traer(trabajoId);
        if (!f) return null;
        const opciones = agrupar((f.opciones || []).filter(o => o.partida_id !== op.partidaActual || o.rollo_id), f.pide);
        if (!opciones.length && !op.despues) { avisar('No hay telas con saldo. Cargala con 📥 Recibir telas.', 'error'); return null; }
        const lista = opciones.map((o, i) => ({ valor: String(i), icono: o.dueno === 'taller' ? '🏭' : '🧵',
            titulo: `${o.recomendada ? '⭐ ' : ''}${nombreTela(o)} · ${o.codigo}${o.dueno === 'taller' ? ' · del taller' : ''}`, detalle: detalleOpcion(o, f.pide) }));
        if (op.despues) lista.push({ valor: 'despues', icono: '⏳', titulo: 'La elijo después', detalle: 'Sigue igual y el trabajo queda en la Bandeja como "Trabajos sin tela"' });
        const texto = `${f.tarjeta} · ${f.cliente || ''} · ${f.titulo || ''}. ${Number(f.pide) > 0 ? `Pide ${num(f.pide)} m.` : ''}`;
        const r = await window.vgDialogo.elegir({ titulo: op.titulo || '🧵 ¿Qué tela va?', texto, opciones: lista, elegida: lista[0] ? lista[0].valor : undefined, aceptar: 'Elegir' });
        if (r === null || r === undefined) return null;
        if (r === 'despues') return 'despues';
        const o = opciones[Number(r)];
        const metros = Number(f.pide) > 0 ? Number(f.pide) : (Number(o.libre) || null);
        if (!(metros > 0)) { avisar('Este trabajo todavía no dice cuántos metros lleva: asignale la tela desde la tarjeta.', 'error'); return null; }
        const p = { trabajo_id: trabajoId, partida_id: o.partida_id };
        if (o.rollo_id) { p.rollos = [o.rollo_id]; p.metros_trabajo = metros; } else p.metros = metros;
        const res = op.partidaActual
            ? await db().rpc('tela_ficha_cambiar', { p: { ...p, partida_actual: op.partidaActual } })
            : await db().rpc('tela_reserva_elegir', { p });
        if (res.error) { avisar(errorTexto(res.error), 'error'); return null; }
        const aviso = res.data && res.data.aviso;
        avisar(aviso || `Listo: ${nombreTela(o)} para ${f.tarjeta}`, aviso ? 'error' : undefined);
        return 'elegida';
    }

    // Cuántos metros se apartan de esa tela
    async function cambiarMetros(f, t, alListo) {
        const r = await window.vgDialogo.pedir({ titulo: `Metros de ${nombreTela(t)}`, texto: 'Cuántos metros de esta tela van en el trabajo, sin contar lo ya usado.',
            campos: [{ nombre: 'm', etiqueta: 'Metros', valor: String(t.apartado || ''), tipo: 'number', obligatorio: true }], aceptar: 'Guardar' });
        if (!r) return;
        const m = Number(String(r.m).replace(',', '.'));
        if (!(m > 0)) { avisar('Poné los metros.', 'error'); return; }
        const { error } = await db().rpc('tela_ficha_cambiar', { p: { trabajo_id: f.trabajo_id, partida_actual: t.partida_id, partida_id: t.partida_id, metros: m, motivo: 'Se corrigieron los metros' } });
        if (error) { avisar(errorTexto(error), 'error'); return; }
        avisar('Metros guardados');
        await alListo();
    }

    // Los metros que salieron de verdad en un archivo ya calandrado: la tela se ajusta sola
    async function metrosReales(a, alListo) {
        const r = await window.vgDialogo.pedir({ titulo: 'Metros calandrados', texto: a.nombre,
            campos: [{ nombre: 'm', etiqueta: 'Metros que salieron de verdad', valor: String(a.metros || ''), tipo: 'number', obligatorio: true }], aceptar: 'Guardar' });
        if (!r) return;
        const m = Number(String(r.m).replace(',', '.'));
        if (!(m > 0)) { avisar('Poné los metros.', 'error'); return; }
        const { error } = await db().rpc('calandrado_metros_guardar', { p: { archivos: [{ id: a.id, reales: m }] } });
        if (error) { avisar(errorTexto(error), 'error'); return; }
        avisar('Metros guardados: la tela se ajustó');
        await alListo();
    }

    function pintarDetalle(zona, f) {
        const telas = f.telas || [];
        const archivos = f.archivos || [];
        const estado = (a) => a.calandrado ? '✓ calandrado' : (a.impreso ? 'impreso' : 'en la fila');
        const rollosDe = (a) => (a.rollos || []).length ? a.rollos.map(r => `rollo ${r.numero}: ${num(r.metros)} m`).join(' · ') : '';
        zona.innerHTML = `<div class="ft-det">
            <div>${esc(f.cliente || '')} · ${esc(f.titulo || '')}. Pide ${num(f.necesita)} m${Number(f.falta) > 0.5 ? ` y faltan ${num(f.falta)} m` : ''}.</div>
            <h4>Tela</h4>
            ${telas.map((t, i) => `<div class="ft-fila"><span><b>${esc(nombreTela(t))}</b> · ${t.dueno === 'taller' ? 'del taller' : 'del cliente'} · ${esc(t.codigo)}<small>${esc(datosTela(t))}</small></span>
                <span class="ft-acc" style="margin:0;"><button type="button" data-d="cambiar" data-i="${i}">Cambiar</button>
                ${Number(t.apartado) > 0 ? `<button type="button" data-d="metros" data-i="${i}">Metros</button>` : ''}
                ${window.vgTelaVida ? `<button type="button" data-d="vida" data-i="${i}">Historia</button>` : ''}</span></div>`).join('') || '<div class="ft-fila">Este trabajo no tiene tela.</div>'}
            <div class="ft-acc"><button type="button" class="ft-fuerte" data-d="sumar">🧵 ${telas.length ? 'Sumar otra tela' : 'Elegir tela'}</button></div>
            ${archivos.length ? `<h4>Archivos</h4>${archivos.map((a, i) => `<div class="ft-fila"><span>${esc(a.nombre)}<small>${num(a.metros)} m · ${estado(a)}${rollosDe(a) ? ' · ' + esc(rollosDe(a)) : ''}</small></span>
                ${a.calandrado ? `<span class="ft-acc" style="margin:0;"><button type="button" data-d="real" data-i="${i}">Corregir metros</button></span>` : ''}</div>`).join('')}` : ''}
        </div>`;
    }

    async function abrir(trabajoId, op = {}) {
        ponerEstilos();
        let f = await traer(trabajoId);
        if (!f) return;
        let hubo = false;
        await window.vgDialogo.ventana({ titulo: `🧵 Tela de ${f.tarjeta}`, aceptar: 'Listo', ancho: '640px' }, (zona) => {
            const recargar = async () => {
                hubo = true;
                const n = await traer(trabajoId);
                if (n) { f = n; pintarDetalle(zona, f); }
                if (op.alCambiar) await op.alCambiar();
            };
            pintarDetalle(zona, f);
            zona.addEventListener('click', async (e) => {
                const b = e.target.closest('[data-d]');
                if (!b) return;
                const i = Number(b.dataset.i);
                if (b.dataset.d === 'sumar') { if (await elegir(trabajoId) === 'elegida') await recargar(); }
                if (b.dataset.d === 'cambiar') { if (await elegir(trabajoId, { partidaActual: f.telas[i].partida_id, titulo: `Cambiar ${nombreTela(f.telas[i])}` }) === 'elegida') await recargar(); }
                if (b.dataset.d === 'metros') await cambiarMetros(f, f.telas[i], recargar);
                if (b.dataset.d === 'real') await metrosReales(f.archivos[i], recargar);
                if (b.dataset.d === 'vida') window.vgTelaVida.abrir(f.telas[i].partida_id);
            });
            return () => true;
        });
        return hubo;
    }

    // Los botones de los recuadros: una sola escucha por contenedor
    function escuchar(raiz, op = {}) {
        if (!raiz || raiz.dataset.fichaTela) return;
        raiz.dataset.fichaTela = '1';
        raiz.addEventListener('click', async (e) => {
            const ver = e.target.closest('[data-ficha-ver]');
            const cam = e.target.closest('[data-ficha-cambiar]');
            const ele = e.target.closest('[data-ficha-elegir]');
            if (!ver && !cam && !ele) return;
            e.preventDefault();
            e.stopPropagation();
            if (ver) await abrir(ver.dataset.fichaVer, op);
            if (cam && await elegir(cam.dataset.fichaCambiar, { partidaActual: cam.dataset.partida, titulo: 'Cambiar la tela' }) === 'elegida' && op.alCambiar) await op.alCambiar();
            if (ele && await elegir(ele.dataset.fichaElegir) === 'elegida' && op.alCambiar) await op.alCambiar();
        });
    }

    window.vgFichaTela = { usar: (c) => { sb = c; }, html, escuchar, abrir, elegir };
})();
