// ficha_tela.js: la ficha de tela de un trabajo (05/11/2026). Es la misma en la tarjeta del Kanban y en el taller (Impresión,
// Calandrado y kiosko): qué tela lleva, de quién es, cuántos metros, cuánto queda y dónde está; con Ver detalle y Cambiar.
//   vgFichaTela.usar(clienteSupabase)                → la conexión de la pantalla (el taller)
//   vgFichaTela.html(ficha, { grande, compacta })    → el recuadro (ficha: fichas_tela_abiertas o trabajo_ficha_tela)
//   vgFichaTela.tarjetaTrabajo(ficha)                → el trabajo con su tela, en grande (telas requeridas)
//   vgFichaTela.escuchar(raiz, { alCambiar })        → activa los botones de los recuadros que estén dentro de raiz
//   vgFichaTela.abrir(trabajoId, { alCambiar })      → ventana con el detalle
//   vgFichaTela.asignar(trabajoId, { archivos, partidaActual, sinArchivos }) → ¿qué tela lleva cada archivo? 'elegida', null o 'sin_archivos'
//   vgFichaTela.elegir(trabajoId, { despues, partidaActual, titulo }) → por metros, para un trabajo sin archivos: 'elegida', 'despues' o null
//   vgFichaTela.guardarTrabajos([ids])               → ¿dónde se guarda lo que quedó? de los trabajos que terminaron
//   vgFichaTela.guardarTela(tela)                    → lo mismo con una tela suelta
// Las puertas de la base: trabajo_ficha_tela, tela_archivos_asignar, tela_ficha_cambiar, tela_reserva_elegir y calandrado_metros_guardar.
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
        .ft-ficha.ft-grande .ft-acc button { flex: 1 1 140px; min-height: 52px; padding: 12px 16px; font-size: 17px; }
        .ft-trabajo { margin: 0 0 14px; padding: 10px; border: 1px solid var(--vg-surface-border); border-radius: 12px; background: var(--vg-bg-app); }
        .ft-cab { font: 800 15px/1.3 var(--vg-font-sans); color: var(--vg-text-primary); margin-bottom: 8px; }
        .ft-cab small { display: block; font-weight: 400; color: var(--vg-text-secondary); }
        .ft-resumen { font: 700 16px var(--vg-font-sans); color: var(--vg-text-primary); margin: 0 0 12px; }
        .ft-archs { max-height: 34vh; overflow: auto; margin-bottom: 8px; }
        .ft-arch { display: flex; gap: 10px; align-items: center; margin: 0 0 6px; padding: 10px 12px; min-height: 44px; box-sizing: border-box; border: 1px solid var(--vg-surface-border); border-radius: 10px; color: var(--vg-text-primary); font: 14px/1.3 var(--vg-font-sans); cursor: pointer; }
        .ft-sel .ft-arch input { width: 22px; height: 22px; flex: none; margin: 0; padding: 0; }
        .ft-arch-n { min-width: 0; overflow-wrap: anywhere; }
        .ft-arch-n small { display: block; color: var(--vg-text-secondary); font-size: 12px; }
        .ft-marcados { margin: 0 0 8px; font: 700 14px var(--vg-font-sans); color: var(--vg-text-primary); }
        .ft-sel input { width: 100%; box-sizing: border-box; padding: 12px; border-radius: 10px; border: 1px solid var(--vg-surface-border); background: var(--vg-surface-base); color: var(--vg-text-primary); font: 16px var(--vg-font-sans); }
        .ft-lista { margin-top: 8px; max-height: 52vh; overflow: auto; }
        .ft-lista h4 { margin: 12px 0 6px; font: 700 12px var(--vg-font-sans); color: var(--vg-text-secondary); text-transform: uppercase; }
        .ft-op { display: block; width: 100%; margin: 0 0 8px; padding: 12px 14px; text-align: left; cursor: pointer; border-radius: 10px; border: 1px solid var(--vg-surface-border); background: var(--vg-surface-base); color: var(--vg-text-primary); font-family: var(--vg-font-sans); }
        .ft-op.ft-rec { border: 2px solid var(--vg-brand-primary); }
        .ft-op-t { display: block; font-weight: 800; font-size: 16px; }
        .ft-op-d { display: block; font-size: 13px; color: var(--vg-text-secondary); }
        .ft-lug { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; margin-top: 10px; }
        .ft-lug button { min-height: 60px; padding: 10px; border-radius: 10px; border: 1px solid var(--vg-surface-border); background: var(--vg-surface-base); color: var(--vg-text-primary); font: 700 15px var(--vg-font-sans); cursor: pointer; }
        .ft-roll { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .ft-roll label { display: inline-flex; gap: 6px; align-items: center; margin: 0; padding: 6px 10px; border: 1px solid var(--vg-surface-border); border-radius: 8px; color: var(--vg-text-primary); font: 14px var(--vg-font-sans); cursor: pointer; }
        .ft-otro { display: flex; gap: 8px; margin-top: 10px; }
        .ft-otro input { flex: 1; min-width: 0; box-sizing: border-box; padding: 12px; border-radius: 10px; border: 1px solid var(--vg-surface-border); background: var(--vg-surface-base); color: var(--vg-text-primary); font: 15px var(--vg-font-sans); }
        .ft-otro button { padding: 0 16px; border-radius: 10px; border: 1px solid var(--vg-brand-primary); background: var(--vg-brand-primary); color: var(--vg-text-primary); font: 700 14px var(--vg-font-sans); cursor: pointer; }
        .ft-kio { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .ft-kio .ft-nombre { font-size: 19px; }
        .ft-kio .ft-dato { font-size: 15px; }
        .ft-kio button { flex: none; min-height: 48px; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--vg-surface-border); background: transparent; color: var(--vg-text-primary); font: 700 14px var(--vg-font-sans); cursor: pointer; width: auto; margin: 0; }
        .ft-despues { display: block; width: 100%; margin-top: 8px; padding: 12px; border-radius: 10px; border: 1px dashed var(--vg-surface-border); background: transparent; color: var(--vg-text-primary); font: 600 15px var(--vg-font-sans); cursor: pointer; }
        .ft-det h4 { margin: 14px 0 6px; font-size: 13px; color: var(--vg-text-secondary); text-transform: uppercase; letter-spacing: .03em; }
        .ft-det .ft-fila { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; padding: 7px 0; border-bottom: 1px dashed var(--vg-surface-border); font-size: 13px; }
        .ft-det small { color: var(--vg-text-secondary); display: block; }
        .vgd-caja label { text-transform: none; }
        .vgd-caja * { scrollbar-color: var(--vg-surface-border) transparent; }`;
        document.head.appendChild(s);
    }

    // "40 m · 12 m usados"
    function cantidades(t) {
        const p = [];
        if (Number(t.apartado) > 0) p.push(`${num(t.apartado)} m`);
        if (Number(t.kilos_apartados) > 0) p.push(`${num(t.kilos_apartados)} kg`);
        if (Number(t.usado) > 0) p.push(`${num(t.usado)} m usados`);
        if (Number(t.kilos_usados) > 0) p.push(`${num(t.kilos_usados)} kg usados`);
        return p;
    }
    const textoRollos = (t) => {
        const rollos = (t.rollos || []).filter(n => n != null);
        return rollos.length ? `rollo${rollos.length > 1 ? 's' : ''} ${rollos.slice().sort((a, b) => a - b).join(', ')}` : '';
    };
    // Lo que se ve siempre: metros, lugar y rollos
    function datosTela(t) {
        return [...cantidades(t), t.lugar || 'sin lugar', textoRollos(t)].filter(Boolean).join(' · ');
    }
    // Lo mismo más lo que le queda a la tela, para "Ver más"
    function datosTelaMas(t) {
        const queda = t.queda_metros != null ? `le quedan ${num(t.queda_metros)} m` : (t.queda_kilos != null ? `le quedan ${num(t.queda_kilos)} kg` : '');
        return [datosTela(t), queda].filter(Boolean).join(' · ');
    }

    // El trabajo con su tela, para la lista de telas requeridas
    function tarjetaTrabajo(ficha) {
        const cuerpo = html(ficha, { grande: true });
        if (!cuerpo) return '';
        return `<div class="ft-trabajo"><div class="ft-cab">${esc(ficha.cliente || '')}${ficha.para_quien ? ` · para ${esc(ficha.para_quien)}` : ''}<small>${esc(ficha.tarjeta || '')} · ${esc(ficha.titulo || '')}</small></div>${cuerpo}</div>`;
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
        if (op.kiosko) {
            return telas.map(t => `<div class="ft-ficha ft-kio"><div><div class="ft-nombre">🧵 ${esc(nombreTela(t))}</div><div class="ft-dato">${esc(datosTela(t))}</div></div>
                <button type="button" data-ficha-cambiar="${id}" data-partida="${esc(t.partida_id)}">Cambiar</button></div>`).join('')
                + (Number(ficha.falta) > 0.5 ? `<div class="ft-ficha ft-sin"><div class="ft-falta">⚠️ Faltan ${num(ficha.falta)} m</div>
                    <div class="ft-acc"><button type="button" class="ft-fuerte" data-ficha-elegir="${id}">🧵 Elegir tela</button></div></div>` : '');
        }
        return telas.map(t => `<div class="${clase}">
            <div class="ft-nombre">${pie}🧵 ${esc(nombreTela(t))}</div>
            <div class="ft-dato">${esc(datosTela(t))}</div>
            ${t.sin_rinde ? '<div class="ft-dato">Sin rinde: al terminar se ponen los kilos</div>' : ''}
            <div class="ft-acc"><button type="button" data-ficha-cambiar="${id}" data-partida="${esc(t.partida_id)}">Cambiar tela</button>
                <button type="button" data-ficha-ver="${id}">Ver más</button></div>
        </div>`).join('') + (Number(ficha.falta) > 0.5 ? `<div class="${clase} ft-sin"><div class="ft-falta">⚠️ Faltan ${num(ficha.falta)} m de tela</div>
            <div class="ft-acc"><button type="button" class="ft-fuerte" data-ficha-elegir="${id}">🧵 Elegir tela</button></div></div>` : '');
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

    // El buscador de telas: lo recomendado primero; un toque en una tela la elige
    function tarjetaOpcion(o, i, pide) {
        const dueno = o.dueno === 'taller' ? 'Del taller' : (o.para_quien ? 'De ' + o.para_quien : 'Del cliente');
        return `<button type="button" class="ft-op${o.recomendada ? ' ft-rec' : ''}" data-op="${i}">
            <span class="ft-op-t">${o.recomendada ? '⭐ ' : ''}${esc(nombreTela(o))}</span>
            <span class="ft-op-d">${esc(dueno)} · ${esc(o.codigo)}</span>
            <span class="ft-op-d">${esc(detalleOpcion(o, pide))}</span></button>`;
    }

    async function elegirDeLista(f, opciones, op) {
        const grupos = [['⭐ Para este trabajo', x => x.dueno === 'cliente' && !x.otro], ['Del taller', x => x.dueno === 'taller'], ['De otros subclientes', x => x.otro]];
        return window.vgDialogo.ventana({ titulo: op.titulo || '🧵 ¿Qué tela va?', texto: `${f.tarjeta} · ${f.cliente || ''}${f.para_quien ? ' · para ' + f.para_quien : ''} · ${f.titulo || ''}${Number(f.pide) > 0 ? `. Pide ${num(f.pide)} m.` : ''}`, aceptar: 'Elegir la primera', ancho: '640px' }, (zona) => {
            zona.innerHTML = `<div class="ft-sel"><input type="search" data-b placeholder="🔎 Buscar tela, color, código o lugar…" autocomplete="off"><div data-l class="ft-lista"></div>
                ${op.despues ? '<button type="button" class="ft-despues" data-despues="1">⏳ La elijo después</button>' : ''}</div>`;
            let resultado;
            const aceptar = () => zona.closest('.vgd-caja').querySelector('.si').click();
            const pintar = (q) => {
                const t = q.trim().toLowerCase();
                const pasa = (o) => !t || `${nombreTela(o)} ${o.codigo} ${o.lugar || ''} ${o.para_quien || ''}`.toLowerCase().includes(t);
                const html = grupos.map(([titulo, cond]) => {
                    const items = opciones.map((o, i) => [o, i]).filter(([o]) => cond(o) && pasa(o));
                    return items.length ? `<h4>${esc(titulo)}</h4>${items.map(([o, i]) => tarjetaOpcion(o, i, f.pide)).join('')}` : '';
                }).join('');
                zona.querySelector('[data-l]').innerHTML = html || '<div class="ft-dato">No encontré esa tela. Si llegó recién, cargala con 📥 Recibir telas.</div>';
            };
            pintar('');
            zona.querySelector('[data-b]').addEventListener('input', (e) => pintar(e.target.value));
            zona.addEventListener('click', (e) => {
                const b = e.target.closest('[data-op]');
                if (b) { resultado = opciones[Number(b.dataset.op)]; aceptar(); return; }
                if (e.target.closest('[data-despues]')) { resultado = 'despues'; aceptar(); }
            });
            return () => {
                if (resultado) return resultado;
                const primera = opciones.find(o => o.recomendada) || opciones.find(o => !o.otro);
                if (!primera) { avisar('Elegí una tela.', 'error'); return undefined; }
                return primera;
            };
        });
    }

    // Elegir o cambiar la tela
    async function elegir(trabajoId, op = {}) {
        ponerEstilos();
        const f = await traer(trabajoId);
        if (!f) return null;
        const opciones = agrupar((f.opciones || []).filter(o => o.partida_id !== op.partidaActual || o.rollo_id), f.pide);
        if (!opciones.length && !op.despues) { avisar('No hay telas con saldo. Cargala con 📥 Recibir telas.', 'error'); return null; }
        const o = await elegirDeLista(f, opciones, op);
        if (o === null || o === undefined) return null;
        if (o === 'despues') return 'despues';
        if (o.otro && !(await window.vgDialogo.confirmar({ titulo: `Esta tela es de ${o.para_quien}`, texto: `${nombreTela(o)} está guardada para ${o.para_quien}${f.para_quien ? ` y este trabajo es para ${f.para_quien}` : ''}. ¿La usás igual?`, aceptar: 'Sí, usarla' }))) return null;
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

    // ¿Qué tela lleva cada archivo? Se tildan los archivos y se toca la tela: los metros salen de los archivos.
    // Quedan tildados los que faltan, así un trabajo en dos telas son dos toques.
    //   op: { archivos: [ids], partidaActual, sinArchivos: true → devuelve 'sin_archivos' en vez de pedir la tela por metros }
    async function asignar(trabajoId, op = {}) {
        ponerEstilos();
        let f = await traer(trabajoId);
        if (!f) return null;
        const conTela = () => (f.archivos || []).filter(a => a.lleva_tela);
        if (!conTela().length) return op.sinArchivos ? 'sin_archivos' : elegir(trabajoId, op);
        const telaDe = (a) => a.partida_id || f.por_defecto || null;
        const marcados = new Set();
        if ((op.archivos || []).length) op.archivos.forEach(id => marcados.add(id));
        else if (op.partidaActual) conTela().filter(a => telaDe(a) === op.partidaActual).forEach(a => marcados.add(a.id));
        if (!marcados.size) conTela().filter(a => !telaDe(a)).forEach(a => marcados.add(a.id));
        if (!marcados.size) conTela().forEach(a => marcados.add(a.id));
        let hubo = false;
        let ocupado = false;
        await window.vgDialogo.ventana({ titulo: '🧵 ¿Qué tela lleva cada archivo?', texto: `${f.tarjeta} · ${f.cliente || ''}${f.para_quien ? ' · para ' + f.para_quien : ''} · ${f.titulo || ''}`, aceptar: 'Listo', sinCancelar: true, ancho: '640px' }, (zona) => {
            zona.innerHTML = `<div class="ft-sel"><div data-a class="ft-archs"></div><div data-t class="ft-marcados"></div>
                <input type="search" data-b data-sin-enter="1" placeholder="🔎 Buscar tela, color, código o lugar…" autocomplete="off"><div data-l class="ft-lista"></div></div>`;
            const metrosMarcados = () => conTela().filter(a => marcados.has(a.id)).reduce((s, a) => s + (Number(a.metros) || 0), 0);
            let opciones = [];
            const pintarOpciones = () => {
                const pide = metrosMarcados();
                const margen = Number(f.margen) || 1;
                const lista = (f.opciones || []).map(o => ({ ...o, alcanza: o.libre != null && Number(o.libre) >= pide * margen }));
                opciones = agrupar(lista, pide);
                const t = zona.querySelector('[data-b]').value.trim().toLowerCase();
                const pasa = (o) => !t || `${nombreTela(o)} ${o.codigo} ${o.lugar || ''} ${o.para_quien || ''}`.toLowerCase().includes(t);
                const grupos = [['⭐ Del cliente', x => x.dueno === 'cliente' && !x.otro], ['Del taller', x => x.dueno === 'taller'], ['De otros subclientes', x => x.otro]];
                zona.querySelector('[data-l]').innerHTML = grupos.map(([titulo, cond]) => {
                    const items = opciones.map((o, i) => [o, i]).filter(([o]) => cond(o) && pasa(o));
                    return items.length ? `<h4>${esc(titulo)}</h4>${items.map(([o, i]) => tarjetaOpcion(o, i, pide)).join('')}` : '';
                }).join('') || '<div class="ft-dato">No encontré esa tela. Si llegó recién, cargala con 📥 Recibir telas.</div>';
            };
            // Después de elegir una parte, lo que falta se muestra como pendiente aunque el trabajo ya tenga una sola tela
            const etiqueta = (a) => (a.partida_id || !hubo ? (a.tela ? '🧵 ' + esc(a.tela) : '⚠️ sin tela') : '⚠️ falta elegir');
            const pintarArchivos = () => {
                const archivos = conTela();
                zona.querySelector('[data-a]').innerHTML = archivos.map(a => `<label class="ft-arch">
                    <input type="checkbox" data-arch="${esc(a.id)}" ${marcados.has(a.id) ? 'checked' : ''}>
                    <span class="ft-arch-n">${esc(a.nombre)}<small>${num(a.metros)} m · ${etiqueta(a)}${a.calandrado ? ' · ✓ calandrado' : ''}</small></span></label>`).join('');
                const n = archivos.filter(a => marcados.has(a.id)).length;
                zona.querySelector('[data-t]').textContent = n ? `Tocá la tela para ${n === 1 ? 'el archivo marcado' : `los ${n} archivos marcados`} (${num(metrosMarcados())} m)` : 'Marcá al menos un archivo';
            };
            pintarArchivos();
            pintarOpciones();
            zona.querySelector('[data-b]').addEventListener('input', pintarOpciones);
            zona.addEventListener('change', (e) => {
                const c = e.target.closest('[data-arch]');
                if (!c) return;
                if (c.checked) marcados.add(c.dataset.arch); else marcados.delete(c.dataset.arch);
                pintarArchivos();
                pintarOpciones();
            });
            zona.addEventListener('click', async (e) => {
                const b = e.target.closest('[data-op]');
                if (!b || ocupado) return;
                const o = opciones[Number(b.dataset.op)];
                if (!marcados.size) { avisar('Marcá al menos un archivo.', 'error'); return; }
                if (o.otro && !(await window.vgDialogo.confirmar({ titulo: `Esta tela es de ${o.para_quien}`, texto: `${nombreTela(o)} está guardada para ${o.para_quien}${f.para_quien ? ` y este trabajo es para ${f.para_quien}` : ''}. ¿La usás igual?`, aceptar: 'Sí, usarla' }))) return;
                ocupado = true;
                const res = await db().rpc('tela_archivos_asignar', { p: { trabajo_id: trabajoId, archivos: [...marcados], partida_id: o.partida_id, rollo_id: o.rollo_id || null } });
                ocupado = false;
                if (res.error) { avisar(errorTexto(res.error), 'error'); return; }
                hubo = true;
                const aviso = res.data && res.data.aviso;
                avisar(aviso || `Listo: ${nombreTela(o)}`, aviso ? 'error' : undefined);
                const n = await traer(trabajoId);
                if (n) f = n;
                const faltan = conTela().filter(a => !a.partida_id);
                if (!faltan.length) { zona.closest('.vgd-caja').querySelector('.si').click(); return; }
                marcados.clear();
                faltan.forEach(a => marcados.add(a.id));
                pintarArchivos();
                pintarOpciones();
            });
            return () => true;
        });
        return hubo ? 'elegida' : null;
    }

    // Para quién es el trabajo (clientes que revenden)
    async function cambiarParaQuien(f, alListo) {
        let valor = f.para_quien || '';
        const ok = await window.vgDialogo.ventana({ titulo: '👤 ¿Para quién es este trabajo?', texto: `${f.cliente || ''} · ${f.titulo || ''}`, aceptar: 'Guardar', ancho: '480px' }, (zona) => {
            zona.innerHTML = `<div class="ft-sel"><input type="text" data-n list="ft-dl-sub" autocomplete="off" placeholder="Nombre del subcliente" value="${esc(valor)}">
                <datalist id="ft-dl-sub">${(f.subclientes || []).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
                <button type="button" class="ft-despues" data-mismo="1">Es de ${esc(f.cliente || 'el cliente')} mismo</button></div>`;
            const inp = zona.querySelector('[data-n]');
            zona.querySelector('[data-mismo]').addEventListener('click', () => { inp.value = ''; zona.closest('.vgd-caja').querySelector('.si').click(); });
            return () => { valor = inp.value; return true; };
        });
        if (!ok) return;
        const { error } = await db().rpc('trabajo_para_quien_guardar', { p: { trabajo_id: f.trabajo_id, para_quien: valor } });
        if (error) { avisar(errorTexto(error), 'error'); return; }
        avisar('Guardado');
        await alListo();
    }

    // ¿Dónde se guarda lo que quedó? Un toque en el lugar. "La guardo después" la deja en la Bandeja.
    async function guardarUna(item, lugares) {
        const de = item.dueno === 'taller' ? 'del taller' : `de ${item.para_quien || item.cliente || 'el cliente'}`;
        let rollos = (item.rollos || []).slice();
        for (;;) {
            const queda = rollos.length ? rollos.reduce((a, r) => a + (Number(r.libre) || 0), 0) : null;
            const cuanto = queda != null ? `quedan ${num(queda)} m` : (item.queda_metros != null ? `quedan ${num(item.queda_metros)} m` : `quedan ${num(item.queda_kilos)} kg`);
            let accion = null;
            const r = await window.vgDialogo.ventana({ titulo: '📍 ¿Dónde guardás lo que quedó?', texto: `${nombreTela(item)} · ${de} · ${cuanto}`, aceptar: 'La guardo después', sinCancelar: true, ancho: '640px' }, (zona) => {
                zona.innerHTML = `<div class="ft-sel">
                    ${rollos.length > 1 ? `<div class="ft-roll">${rollos.map(x => `<label><input type="checkbox" data-rollo="${esc(x.id)}" checked> Rollo ${esc(x.numero)} · ${num(x.libre)} m</label>`).join('')}</div>` : ''}
                    <div class="ft-lug">${lugares.map(l => `<button type="button" data-lugar="${esc(l)}">${esc(l)}</button>`).join('')}</div>
                    <div class="ft-otro"><input type="text" data-otro placeholder="Otro lugar" autocomplete="off"><button type="button" data-otro-ok="1">Guardar</button></div>
                    ${item.lugar ? `<button type="button" class="ft-despues" data-igual="1">Sigue en ${esc(item.lugar)}</button>` : ''}
                    <button type="button" class="ft-despues" data-nada="1">No quedó nada</button></div>`;
                const aceptar = () => zona.closest('.vgd-caja').querySelector('.si').click();
                zona.addEventListener('click', (e) => {
                    const l = e.target.closest('[data-lugar]');
                    if (l) { accion = { accion: 'lugar', lugar: l.dataset.lugar }; aceptar(); return; }
                    if (e.target.closest('[data-igual]')) { accion = { accion: 'igual' }; aceptar(); return; }
                    if (e.target.closest('[data-nada]')) { accion = { accion: 'nada' }; aceptar(); return; }
                    if (e.target.closest('[data-otro-ok]')) {
                        const v = zona.querySelector('[data-otro]').value.trim();
                        if (!v) { avisar('Escribí el lugar.', 'error'); return; }
                        accion = { accion: 'lugar', lugar: v };
                        aceptar();
                    }
                });
                return () => {
                    const marcados = [...zona.querySelectorAll('[data-rollo]:checked')].map(c => c.dataset.rollo);
                    return { ...(accion || { accion: 'despues' }), marcados };
                };
            });
            const pedido = r || { accion: 'despues', marcados: [] };
            const usados = rollos.length === 1 ? [rollos[0].id] : (pedido.marcados || []);
            if (rollos.length > 1 && pedido.accion !== 'despues' && !usados.length) { avisar('Marcá al menos un rollo.', 'error'); continue; }
            const { error } = await db().rpc('tela_guardar_resto', { p: { partida_id: item.partida_id, trabajo_id: item.trabajo_id || null, accion: pedido.accion, lugar: pedido.lugar || null, rollos: rollos.length ? usados : null } });
            if (error) { avisar(errorTexto(error), 'error'); return; }
            if (pedido.accion === 'lugar') avisar(`Guardada en ${pedido.lugar}`);
            const quedan = pedido.accion === 'despues' ? [] : rollos.filter(x => !usados.includes(x.id));
            if (!quedan.length) return;
            rollos = quedan;
        }
    }

    // Los trabajos que recién terminaron: pregunta por cada tela a la que le quedó algo
    async function guardarTrabajos(ids) {
        ponerEstilos();
        const { data, error } = await db().rpc('telas_para_guardar', { p: { trabajos: ids } });
        if (error) { console.warn('Telas para guardar:', errorTexto(error)); return; }
        for (const t of (data && data.telas) || []) await guardarUna(t, data.lugares || []);
    }

    // Una tela suelta (Ver detalle, o las que quedaron para después)
    async function guardarTela(item) {
        ponerEstilos();
        const { data, error } = await db().rpc('telas_para_guardar', { p: { trabajos: [] } });
        if (error) { avisar(errorTexto(error), 'error'); return; }
        await guardarUna(item, (data && data.lugares) || []);
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
            ${f.revende ? `<div class="ft-fila"><span>Para quién: <b>${esc(f.para_quien || f.cliente || '')}</b></span><span class="ft-acc" style="margin:0;"><button type="button" data-d="para">Cambiar</button></span></div>` : ''}
            <h4>Tela</h4>
            ${telas.map((t, i) => `<div class="ft-fila"><span><b>${esc(nombreTela(t))}</b> · ${t.dueno === 'taller' ? 'del taller' : (t.para_quien ? 'de ' + esc(t.para_quien) : 'del cliente')} · ${esc(t.codigo)}<small>${esc(datosTelaMas(t))}</small></span>
                <span class="ft-acc" style="margin:0;"><button type="button" data-d="guardar" data-i="${i}">📍 Guardar</button>
                ${window.vgTelaVida ? `<button type="button" data-d="vida" data-i="${i}">Historia</button>` : ''}</span></div>`).join('') || '<div class="ft-fila">Este trabajo no tiene tela.</div>'}
            <div class="ft-acc"><button type="button" class="ft-fuerte" data-d="asignar">🧵 ${telas.length ? 'Cambiar tela' : 'Elegir tela'}</button></div>
            ${archivos.length ? `<h4>Archivos</h4>${archivos.map((a, i) => `<div class="ft-fila"><span>${esc(a.nombre)}<small>${num(a.metros)} m · ${estado(a)}${a.tela ? ' · ' + esc(a.tela) : ''}${rollosDe(a) ? ' · ' + esc(rollosDe(a)) : ''}</small></span>
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
                if (b.dataset.d === 'para') await cambiarParaQuien(f, recargar);
                if (b.dataset.d === 'asignar') { if (await asignar(trabajoId) === 'elegida') await recargar(); }
                if (b.dataset.d === 'real') await metrosReales(f.archivos[i], recargar);
                if (b.dataset.d === 'vida') window.vgTelaVida.abrir(f.telas[i].partida_id);
                if (b.dataset.d === 'guardar') { await guardarTela(f.telas[i]); await recargar(); }
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
            if (cam && await asignar(cam.dataset.fichaCambiar, { partidaActual: cam.dataset.partida }) === 'elegida' && op.alCambiar) await op.alCambiar();
            if (ele && await asignar(ele.dataset.fichaElegir) === 'elegida' && op.alCambiar) await op.alCambiar();
        });
    }

    window.vgFichaTela = { usar: (c) => { sb = c; }, html, tarjetaTrabajo, escuchar, abrir, asignar, elegir, guardarTrabajos, guardarTela };
})();
