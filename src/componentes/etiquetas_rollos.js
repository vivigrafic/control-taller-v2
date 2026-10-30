// etiquetas_rollos.js: las etiquetas de los rollos de tela (E2a, 30/10/2026). Una por rollo y por calandrado: cliente,
// tarjeta, tela, color, partida, rollo, metros reales (y teóricos) y los archivos. Los datos los arma la base
// (etiquetas_rollos) y se anota cuáles se imprimieron (etiquetas_impresas). El diseño (medidas, una por hoja o varias en
// A4, letra, qué datos lleva y un texto fijo) lo cambia el dueño cuando quiere: etiqueta_config / etiqueta_config_guardar.
// La usan la tarjeta del Kanban, Contactos, Telas y el taller (al terminar de calandrar).
//   vgEtiquetas.usar(clienteSupabase)                           → la conexión de la pantalla (el taller)
//   vgEtiquetas.elegir({ trabajo_id | cliente_id | partida_id })  → ventana para elegir cuáles y las imprime
//   vgEtiquetas.imprimir(etiquetas)                             → imprime esas y las anota como impresas
//   vgEtiquetas.disenar()                                       → ventana para cambiar el diseño, con vista previa
// Para que salgan solas sin preguntar, Chrome se abre con --kiosk-printing en la PC del calandrado.
(function () {
    if (window.vgEtiquetas) return;
    let sb = null;
    let config = null;
    const db = () => sb || window.vgSupabase || window.conexionDB || (sb = window.supabase.createClient(window.VG_CONEXION.url, window.VG_CONEXION.key));
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
    const fecha = (f) => f ? new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
    const avisar = (t, tipo) => (window.vgDialogo ? window.vgDialogo.avisar(t, tipo) : (window.toastTaller ? window.toastTaller(t, tipo) : alert(t)));
    const POR_DEFECTO = { ancho_mm: 100, alto_mm: 70, margen_mm: 3.5, hoja: 'una', letra: 100, texto_extra: '',
        campos: { empresa: true, fecha: true, cliente: true, trabajo: true, tela: true, color: true, partida: true, rollo: true, metros: true, teoricos: true, kilos: false, archivos: true } };
    const CAMPOS = [['empresa', 'Nombre del taller'], ['fecha', 'Fecha'], ['cliente', 'Cliente'], ['trabajo', 'Tarjeta y título'], ['tela', 'Tela'],
        ['color', 'Color'], ['partida', 'Partida (código de la tela)'], ['rollo', 'Número de rollo'], ['metros', 'Metros (reales, o teóricos si no se calandró)'],
        ['teoricos', 'Teóricos al lado de los reales'], ['kilos', 'Kilos del rollo'], ['archivos', 'Nombres de los archivos']];
    const EJEMPLO = { empresa: 'V&V Grafic', fecha: new Date().toISOString(), cliente: 'GLADYS SHERAZADE', tarjeta: 'T0003', titulo: '6 ROLLOS MICROFIBRA',
        tela: 'MICROFIBRA LYCRA 70', color: 'BLANCO', partida: 'P-00001', rollo: 2, kilos: 22.4, teoricos: 45.36, reales: 44.86,
        archivos: ['gladys (26-10-26) 01 (ROLLOS 1-2) 1 X 90 (V-V 3P).jpg'] };

    async function traerConfig() {
        if (config) return config;
        try { const { data } = await db().rpc('etiqueta_config'); config = data || POR_DEFECTO; } catch (e) { config = POR_DEFECTO; }
        return config;
    }

    // El CSS de la etiqueta según el diseño (en mm; solo negro: es para la impresora de etiquetas)
    function cssEtiqueta(c, raiz) {
        const f = (pt) => `${Math.round(pt * (Number(c.letra) || 100)) / 100}pt`;
        return `${raiz} .et { width: ${c.ancho_mm}mm; height: ${c.alto_mm}mm; padding: ${c.margen_mm}mm; display: flex; flex-direction: column; gap: 1mm;
                overflow: hidden; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
            ${raiz} .et * { box-sizing: border-box; }
            ${raiz} .cab { display: flex; justify-content: space-between; gap: 2mm; font-size: ${f(9)}; border-bottom: 0.4mm solid; padding-bottom: 0.8mm; }
            ${raiz} .cli { font-size: ${f(15)}; font-weight: 800; line-height: 1.05; text-transform: uppercase; }
            ${raiz} .trab { font-size: ${f(9)}; }
            ${raiz} .tela { font-size: ${f(11)}; font-weight: 700; }
            ${raiz} .tela small { font-weight: 400; font-size: ${f(8)}; }
            ${raiz} .fila { display: flex; gap: 2.5mm; align-items: stretch; margin-top: auto; }
            ${raiz} .rollo { border: 0.6mm solid; border-radius: 2mm; padding: 0.8mm 2.5mm; text-align: center; font-size: ${f(8)}; display: flex; flex-direction: column; justify-content: center; }
            ${raiz} .rollo b { font-size: ${f(22)}; line-height: 1; }
            ${raiz} .metros { flex: 1; border: 0.6mm solid; border-radius: 2mm; text-align: center; display: flex; flex-direction: column; justify-content: center; }
            ${raiz} .metros b { font-size: ${f(24)}; line-height: 1.05; }
            ${raiz} .metros small { font-size: ${f(7.5)}; }
            ${raiz} .arch, ${raiz} .extra { font-size: ${f(6.5)}; line-height: 1.15; overflow: hidden; }
            ${raiz} .extra { font-weight: 700; }`;
    }

    function htmlEtiqueta(e, c) {
        const k = Object.assign({}, POR_DEFECTO.campos, c.campos || {});
        const hayReales = e.reales != null;
        const metros = hayReales ? num(e.reales) : num(e.teoricos);
        const nota = !k.teoricos ? '' : hayReales ? (Math.abs(Number(e.reales) - Number(e.teoricos)) > 0.009 ? `teórico ${num(e.teoricos)} m` : '') : 'teórico (sin calandrar)';
        const cab = [k.empresa ? `<b>${esc(e.empresa || '')}</b>` : '', k.fecha ? `<span>${esc(fecha(e.fecha))}</span>` : ''].filter(Boolean).join('');
        const tela = [k.tela ? esc(e.tela || '') : '', k.color && e.color ? esc(e.color) : ''].filter(Boolean).join(' · ');
        const bajo = [k.rollo ? `<div class="rollo">ROLLO<b>${esc(e.rollo)}</b></div>` : '',
            k.metros ? `<div class="metros"><b>${metros} m</b>${nota ? `<small>${esc(nota)}</small>` : ''}${k.kilos && e.kilos != null ? `<small>${num(e.kilos)} kg</small>` : ''}</div>`
                : (k.kilos && e.kilos != null ? `<div class="metros"><b>${num(e.kilos)} kg</b></div>` : '')].join('');
        return `<section class="et">
            ${cab ? `<div class="cab">${cab}</div>` : ''}
            ${k.cliente ? `<div class="cli">${esc(e.cliente || '')}</div>` : ''}
            ${k.trabajo ? `<div class="trab">${esc(e.tarjeta || '')} · ${esc(e.titulo || '')}</div>` : ''}
            ${tela || k.partida ? `<div class="tela">${tela}${k.partida ? ` <small>${esc(e.partida || '')}</small>` : ''}</div>` : ''}
            ${bajo ? `<div class="fila">${bajo}</div>` : ''}
            ${k.archivos && (e.archivos || []).length ? `<div class="arch">${esc(e.archivos.join(' · '))}</div>` : ''}
            ${c.texto_extra ? `<div class="extra">${esc(c.texto_extra)}</div>` : ''}
        </section>`;
    }

    // Imprime en una ventana aparte: una por hoja del tamaño de la etiqueta, o varias por hoja A4
    async function imprimir(etiquetas) {
        const lista = (etiquetas || []).filter(Boolean);
        if (!lista.length) { avisar('No hay etiquetas para imprimir.', 'error'); return false; }
        const c = await traerConfig();
        const win = window.open('', '_blank', 'width=520,height=420');
        if (!win) { avisar('Habilitá las ventanas emergentes del navegador para imprimir las etiquetas.', 'error'); return false; }
        const a4 = c.hoja === 'a4';
        win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas de rollos</title><style>
            @page { size: ${a4 ? 'A4' : `${c.ancho_mm}mm ${c.alto_mm}mm`}; margin: ${a4 ? '8mm' : '0'}; }
            body { margin: 0; }
            ${a4 ? '.hoja { display: flex; flex-wrap: wrap; gap: 2mm; } .et { border: 0.2mm dashed; page-break-inside: avoid; }'
                 : '.et { page-break-after: always; } .et:last-child { page-break-after: auto; }'}
            ${cssEtiqueta(c, '')}
        </style></head><body><div class="hoja">${lista.map(e => htmlEtiqueta(e, c)).join('')}</div></body></html>`);
        win.document.close();
        await new Promise(r => setTimeout(r, 350));
        win.focus();
        win.print();
        setTimeout(() => { try { win.close(); } catch (e) { /* nada */ } }, 800);
        const piezas = lista.flatMap(e => e.piezas || []);
        if (piezas.length) await db().rpc('etiquetas_impresas', { p: { piezas } });
        return true;
    }

    // Elegir cuáles imprimir (vienen marcadas las que nunca se imprimieron)
    async function elegir(filtro) {
        const { data, error } = await db().rpc('etiquetas_rollos', { p: Object.assign({ todas: true }, filtro) });
        if (error) { avisar(error.message, 'error'); return false; }
        const lista = data || [];
        if (!lista.length) { avisar('Todavía no hay rollos asignados: asignalos en la tarjeta (pestaña Telas) o al calandrar.', 'error'); return false; }
        if (!window.vgDialogo) return imprimir(lista);
        const algunaSinImprimir = lista.some(e => !Number(e.impresa));
        const opciones = lista.map((e, i) => ({ valor: i, marcada: algunaSinImprimir ? !Number(e.impresa) : true,
            titulo: `${e.tarjeta} · Rollo ${e.rollo} · ${e.tela || ''}${e.color ? ' ' + e.color : ''}`,
            detalle: `${e.cliente || ''} · ${e.reales != null ? num(e.reales) + ' m reales' : num(e.teoricos) + ' m teóricos (sin calandrar)'}`
                + `${Number(e.impresa) ? ` · ya impresa ${e.impresa} vez/veces` : ''}` }));
        opciones.push({ valor: 'disenar', titulo: '⚙️ Cambiar el diseño de la etiqueta antes de imprimir', detalle: 'Medidas, hoja, letra y qué datos lleva' });
        const marcadas = await vgDialogo.casillas({ titulo: '🏷️ Etiquetas de los rollos', aceptar: 'Imprimir',
            texto: 'Una por rollo. Vienen marcadas las que todavía no se imprimieron.', opciones });
        if (!marcadas) return false;
        if (marcadas.includes('disenar') && !(await disenar())) return false;
        const elegidas = marcadas.filter(x => x !== 'disenar');
        if (!elegidas.length) return false;
        return imprimir(elegidas.map(i => lista[i]));
    }

    // Cambiar el diseño, con la etiqueta de ejemplo a la vista
    async function disenar() {
        if (!window.vgDialogo) return false;
        const c = JSON.parse(JSON.stringify(await traerConfig()));
        c.campos = Object.assign({}, POR_DEFECTO.campos, c.campos || {});
        const r = await vgDialogo.ventana({ titulo: '⚙️ Diseño de la etiqueta', aceptar: 'Guardar el diseño', ancho: '760px',
            texto: 'Lo que cambies vale para todas las etiquetas de rollos (sistema y taller).' }, (zona) => {
            zona.innerHTML = `<style>${cssEtiqueta(c, '#vge-previa')}
                .vge { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
                @media (max-width: 640px) { .vge { grid-template-columns: 1fr; } }
                .vge label { display: block; font-size: 12px; color: var(--vg-text-secondary); margin: 6px 0 2px; }
                .vge input[type=number], .vge input[type=text], .vge select { width: 100%; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--vg-surface-border); background: var(--vg-bg-app); color: var(--vg-text-primary); }
                .vge .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                .vge .cas { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--vg-text-primary); margin: 3px 0; }
                #vge-previa { background: var(--vg-text-primary); color: var(--vg-bg-app); display: inline-block; border-radius: 4px; max-width: 100%; overflow: auto; }
            </style>
            <div class="vge"><div>
                <div class="dos"><div><label>Ancho (mm)</label><input type="number" data-k="ancho_mm" min="20" max="300" value="${esc(c.ancho_mm)}"></div>
                    <div><label>Alto (mm)</label><input type="number" data-k="alto_mm" min="15" max="300" value="${esc(c.alto_mm)}"></div></div>
                <div class="dos"><div><label>Margen (mm)</label><input type="number" data-k="margen_mm" min="0" max="20" step="0.5" value="${esc(c.margen_mm)}"></div>
                    <div><label>Letra (%)</label><input type="number" data-k="letra" min="50" max="200" step="5" value="${esc(c.letra)}"></div></div>
                <label>Cómo se imprimen</label><select data-k="hoja"><option value="una" ${c.hoja !== 'a4' ? 'selected' : ''}>Una por hoja (impresora de etiquetas)</option>
                    <option value="a4" ${c.hoja === 'a4' ? 'selected' : ''}>Varias en una hoja A4 (impresora común)</option></select>
                <label>Texto fijo abajo (opcional)</label><input type="text" data-k="texto_extra" maxlength="200" value="${esc(c.texto_extra || '')}" placeholder="Ej.: Lavar con agua fría">
                <label>Qué datos lleva</label>
                ${CAMPOS.map(([k, t]) => `<div class="cas"><input type="checkbox" data-campo="${k}" id="vge-${k}" ${c.campos[k] ? 'checked' : ''}><label for="vge-${k}" style="margin:0;color:inherit;font-size:13px">${esc(t)}</label></div>`).join('')}
            </div><div><label>Así queda (tamaño real)</label><div id="vge-previa"></div></div></div>`;
            const previa = zona.querySelector('#vge-previa');
            const estilo = zona.querySelector('style');
            const leer = () => {
                zona.querySelectorAll('[data-k]').forEach(i => { c[i.dataset.k] = i.type === 'number' ? Number(i.value) : i.value; });
                zona.querySelectorAll('[data-campo]').forEach(i => { c.campos[i.dataset.campo] = i.checked; });
            };
            const pintar = () => {
                leer();
                estilo.textContent = estilo.textContent.replace(/^[\s\S]*?(\n\s*\.vge \{)/, cssEtiqueta(c, '#vge-previa') + '$1');
                previa.innerHTML = htmlEtiqueta(Object.assign({}, EJEMPLO), c);
            };
            zona.addEventListener('input', pintar);
            zona.addEventListener('change', pintar);
            pintar();
            return () => {
                leer();
                if (!(c.ancho_mm >= 20 && c.ancho_mm <= 300) || !(c.alto_mm >= 15 && c.alto_mm <= 300)) { avisar('El ancho va de 20 a 300 mm y el alto de 15 a 300 mm.', 'error'); return undefined; }
                return c;
            };
        });
        if (!r) return false;
        const { data, error } = await db().rpc('etiqueta_config_guardar', { p: r });
        if (error) { avisar(error.message, 'error'); return false; }
        config = data;
        avisar('Diseño de la etiqueta guardado.', 'ok');
        return true;
    }

    window.vgEtiquetas = { elegir, imprimir, disenar, usar: (cliente) => { sb = cliente; config = null; } };
})();
