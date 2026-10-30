// etiquetas_rollos.js: las etiquetas de los rollos de tela (E2a, 30/10/2026). Una por rollo y por calandrado, de 10 × 7 cm:
// cliente, tarjeta, tela, color, partida, rollo, metros reales (y teóricos) y los archivos. Los datos los arma la base
// (etiquetas_rollos) y se anota cuáles se imprimieron (etiquetas_impresas). La usan la tarjeta del Kanban, Contactos, Telas
// y el taller (al terminar de calandrar).
//   vgEtiquetas.usar(clienteSupabase)                        → la conexión de la pantalla (el taller)
//   vgEtiquetas.elegir({ trabajo_id | cliente_id | partida_id }) → ventana para elegir cuáles y las imprime
//   vgEtiquetas.imprimir(etiquetas)                          → imprime esas (una por hoja) y las anota como impresas
// Para que salgan solas sin preguntar, Chrome se abre con --kiosk-printing en la PC del calandrado.
(function () {
    if (window.vgEtiquetas) return;
    let sb = null;
    const db = () => sb || window.vgSupabase || window.conexionDB || (sb = window.supabase.createClient(window.VG_CONEXION.url, window.VG_CONEXION.key));
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
    const fecha = (f) => f ? new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
    const avisar = (t, tipo) => (window.vgDialogo ? window.vgDialogo.avisar(t, tipo) : (window.toastTaller ? window.toastTaller(t, tipo) : alert(t)));

    function htmlEtiqueta(e) {
        const metros = e.reales != null ? num(e.reales) : num(e.teoricos);
        const nota = e.reales != null ? (Math.abs(Number(e.reales) - Number(e.teoricos)) > 0.009 ? `teórico ${num(e.teoricos)} m` : '') : 'teórico (sin calandrar)';
        const archivos = (e.archivos || []).join(' · ');
        return `<section class="et">
            <div class="cab"><b>${esc(e.empresa || '')}</b><span>${esc(fecha(e.fecha))}</span></div>
            <div class="cli">${esc(e.cliente || '')}</div>
            <div class="trab">${esc(e.tarjeta || '')} · ${esc(e.titulo || '')}</div>
            <div class="tela">${esc(e.tela || '')}${e.color ? ' · ' + esc(e.color) : ''} <small>${esc(e.partida || '')}</small></div>
            <div class="fila"><div class="rollo">ROLLO<b>${esc(e.rollo)}</b></div><div class="metros"><b>${metros} m</b><small>${esc(nota)}</small></div></div>
            ${archivos ? `<div class="arch">${esc(archivos)}</div>` : ''}
        </section>`;
    }

    // Imprime en una ventana aparte, una etiqueta por hoja de 10 × 7 cm (solo negro: es para la impresora de etiquetas)
    async function imprimir(etiquetas) {
        const lista = (etiquetas || []).filter(Boolean);
        if (!lista.length) { avisar('No hay etiquetas para imprimir.', 'error'); return false; }
        const win = window.open('', '_blank', 'width=480,height=380');
        if (!win) { avisar('Habilitá las ventanas emergentes del navegador para imprimir las etiquetas.', 'error'); return false; }
        win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas de rollos</title><style>
            @page { size: 100mm 70mm; margin: 0; }
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
            .et { width: 100mm; height: 70mm; padding: 3.5mm 4mm; page-break-after: always; display: flex; flex-direction: column; gap: 1.2mm; overflow: hidden; }
            .et:last-child { page-break-after: auto; }
            .cab { display: flex; justify-content: space-between; font-size: 9pt; border-bottom: 0.4mm solid; padding-bottom: 1mm; }
            .cli { font-size: 15pt; font-weight: 800; line-height: 1.05; text-transform: uppercase; }
            .trab { font-size: 9pt; }
            .tela { font-size: 11pt; font-weight: 700; }
            .tela small { font-weight: 400; font-size: 8pt; }
            .fila { display: flex; gap: 3mm; align-items: stretch; margin-top: auto; }
            .rollo { border: 0.6mm solid; border-radius: 2mm; padding: 1mm 3mm; text-align: center; font-size: 8pt; display: flex; flex-direction: column; justify-content: center; }
            .rollo b { font-size: 22pt; line-height: 1; }
            .metros { flex: 1; border: 0.6mm solid; border-radius: 2mm; text-align: center; display: flex; flex-direction: column; justify-content: center; }
            .metros b { font-size: 24pt; line-height: 1.05; }
            .metros small { font-size: 7.5pt; }
            .arch { font-size: 6.5pt; line-height: 1.15; max-height: 7mm; overflow: hidden; }
        </style></head><body>${lista.map(htmlEtiqueta).join('')}</body></html>`);
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
        const marcadas = await vgDialogo.casillas({ titulo: '🏷️ Etiquetas de los rollos', aceptar: 'Imprimir',
            texto: 'Una por rollo. Vienen marcadas las que todavía no se imprimieron.',
            opciones: lista.map((e, i) => ({ valor: i, marcada: algunaSinImprimir ? !Number(e.impresa) : true,
                titulo: `${e.tarjeta} · Rollo ${e.rollo} · ${e.tela || ''}${e.color ? ' ' + e.color : ''}`,
                detalle: `${e.cliente || ''} · ${e.reales != null ? num(e.reales) + ' m reales' : num(e.teoricos) + ' m teóricos (sin calandrar)'}`
                    + `${Number(e.impresa) ? ` · ya impresa ${e.impresa} vez/veces` : ''}` })) });
        if (!marcadas || !marcadas.length) return false;
        return imprimir(marcadas.map(i => lista[i]));
    }

    window.vgEtiquetas = { elegir, imprimir, usar: (cliente) => { sb = cliente; } };
})();
