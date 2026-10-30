// bandeja.js: la bandeja "📥 Para hacer" (fase D1, 30/10/2026). Junta en un solo lugar lo que hay que resolver, según los
// permisos de cada uno: tarjetas que no cuadran, archivos de la fila sin tarjeta o dudosos, telas por confirmar, cobros
// atrasados, gastos fijos por anotar, alertas del taller y borradores de Vivi. Lo calcula la base (bandeja_para_hacer):
// esta pantalla solo lo muestra y cada renglón tiene su botón (abrir la tarjeta, ir a la pantalla, contestar la duda de la
// fila con fila_resolver_duda o marcar la alerta con taller_alerta_hecha).
//   <script src="/src/componentes/bandeja.js"></script>   (después de supabase-js, conexion.js y dialogo.js)
//   Pone "📥 Para hacer" con su número en el menú (.sidebar-nav) o en un elemento con data-bandeja; si no hay, no pone nada.
//   vgBandeja.usar(clienteSupabase, { erp: 'https://…', quien: () => 'operario', avisar: (texto, tipo) => … })  → el taller (su
//       conexión, dónde está el ERP para los enlaces, que se abren en otra pestaña, quién marca las alertas y sus carteles)
//   vgBandeja.abrir() / vgBandeja.actualizar()
// En el Kanban también atiende ?trabajo=<id>[&pestana=telas] (abre la tarjeta) y ?abrir=fila (los archivos sin tarjeta).
(function () {
    if (window.vgBandeja) return;
    let sb = null;
    let erp = '';
    let quien = null;
    let avisoPropio = null;
    let ultimo = null;
    const db = () => sb || window.vgSupabase || (sb = window.supabase.createClient(window.VG_CONEXION.url, window.VG_CONEXION.key));
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const plata = (n) => window.vgPesos ? window.vgPesos(n) : '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
    const avisar = (texto, tipo) => avisoPropio ? avisoPropio(texto, tipo) : window.vgDialogo ? window.vgDialogo.avisar(texto, tipo) : null;
    const abiertos = new Set(['alertas', 'fila']);   // los grupos que arrancan abiertos (además del primero)

    const css = `
    .vgb-menu { position: relative; }
    .vgb-num { display: inline-block; min-width: 18px; padding: 1px 5px; margin-left: 4px; border-radius: 9px; font: 700 11px/16px var(--vg-font-sans, sans-serif);
        text-align: center; background: var(--vg-brand-primary); color: var(--vg-text-on-brand, var(--vg-text-primary)); }
    .vgb-num.urgente { background: var(--vg-status-alert); }
    .vgb-num[hidden] { display: none; }
    .vgb-fondo { position: fixed; inset: 0; z-index: 9500; background: color-mix(in srgb, var(--vg-bg-app) 55%, transparent); display: flex; justify-content: flex-end; }
    .vgb-panel { width: min(520px, 100%); height: 100%; box-sizing: border-box; overflow-y: auto; padding: 16px;
        background: linear-gradient(var(--vg-surface-base, var(--vg-bg-app)), var(--vg-surface-base, var(--vg-bg-app))), var(--vg-bg-app);
        border-left: 1px solid var(--vg-surface-border); color: var(--vg-text-primary); font: 14px/1.45 var(--vg-font-sans, sans-serif);
        display: flex; flex-direction: column; gap: 10px; }
    .vgb-panel * { box-sizing: border-box; }
    .vgb-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .vgb-cab h2 { margin: 0; font-size: 17px; }
    .vgb-cab-bot { display: flex; gap: 4px; }
    .vgb-x { border: none; background: transparent; color: var(--vg-text-secondary); font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 8px; }
    .vgb-x:hover { color: var(--vg-text-primary); background: var(--vg-bg-app); }
    .vgb-nota { color: var(--vg-text-secondary); font-size: 13px; margin: 2px 0; }
    .vgb-vacia { text-align: center; padding: 40px 10px; color: var(--vg-text-secondary); }
    .vgb-vacia b { display: block; font-size: 34px; margin-bottom: 6px; }
    .vgb-grupo { border: 1px solid var(--vg-surface-border); border-radius: 12px; background: var(--vg-bg-app); }
    .vgb-grupo > summary { cursor: pointer; list-style: none; padding: 10px 12px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .vgb-grupo > summary::-webkit-details-marker { display: none; }
    .vgb-grupo > summary .vgb-num { margin-left: auto; }
    .vgb-grupo > summary::after { content: '▸'; color: var(--vg-text-secondary); }
    .vgb-grupo[open] > summary::after { content: '▾'; }
    .vgb-ayuda { margin: -4px 12px 6px; color: var(--vg-text-secondary); font-size: 12.5px; }
    .vgb-item { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-top: 1px solid var(--vg-surface-border); }
    .vgb-item.alerta { box-shadow: inset 3px 0 0 var(--vg-status-alert); }
    .vgb-item-txt { flex: 1; min-width: 0; }
    .vgb-item-tit { font-weight: 600; overflow-wrap: anywhere; }
    .vgb-item-det { color: var(--vg-text-secondary); font-size: 12.5px; overflow-wrap: anywhere; }
    .vgb-monto { font-weight: 700; white-space: nowrap; }
    .vgb-bots { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; max-width: 46%; }
    .vgb-btn { border: 1px solid var(--vg-brand-primary); background: var(--vg-brand-primary); color: var(--vg-text-on-brand, var(--vg-text-primary));
        border-radius: 8px; padding: 6px 10px; font: 600 12.5px var(--vg-font-sans, sans-serif); cursor: pointer; text-align: center; text-decoration: none; }
    .vgb-btn.sec { background: transparent; color: var(--vg-text-primary); border-color: var(--vg-surface-border); }
    .vgb-btn:disabled { opacity: .5; cursor: default; }
    .vgb-mas { padding: 8px 12px 10px; border-top: 1px solid var(--vg-surface-border); font-size: 13px; }
    .vgb-mas a { color: var(--vg-brand-secondary, var(--vg-brand-primary)); }
    @media (max-width: 600px) { .vgb-item { flex-direction: column; } .vgb-bots { flex-direction: row; flex-wrap: wrap; max-width: none; } }
    /* Celular: el menú va abajo; el número arriba del ícono y el panel no queda tapado por el menú */
    @media (max-width: 1200px) { .vgb-menu .vgb-num { position: absolute; top: 4px; right: 14px; margin: 0; }
        .vgb-panel { padding-bottom: 96px; } }`;
    function estilos() {
        if (document.getElementById('vgb-estilos')) return;
        const s = document.createElement('style');
        s.id = 'vgb-estilos';
        s.textContent = css;
        document.head.appendChild(s);
    }

    async function traer() {
        const { data, error } = await db().rpc('bandeja_para_hacer');
        if (error) throw error;
        ultimo = data || { total: 0, alertas: 0, grupos: [] };
        pintarNumero();
        return ultimo;
    }

    function pintarNumero() {
        document.querySelectorAll('[data-vgb-num]').forEach(n => {
            const total = Number(ultimo?.total || 0);
            n.textContent = total > 99 ? '99+' : total;
            n.hidden = !total;
            n.classList.toggle('urgente', Number(ultimo?.alertas || 0) > 0);
            n.title = total ? `${total} cosa(s) para hacer${ultimo.alertas ? `, ${ultimo.alertas} urgente(s)` : ''}` : '';
        });
    }

    async function actualizar() {
        try { await traer(); } catch (e) { /* sin sesión o sin conexión: el número queda como estaba */ }
        const panel = document.querySelector('.vgb-fondo');
        if (panel) pintarPanel(panel);
    }

    // ---------- Las acciones de cada renglón ----------
    const urlErp = (u) => (erp ? erp.replace(/\/$/, '') : '') + u;
    const enElKanban = () => typeof window.abrirDetalleTrabajo === 'function';
    // Desde otro sitio (el taller) el ERP se abre en otra pestaña, para no perder la pantalla
    const navegar = (u) => { if (erp) { cerrar(); window.open(urlErp(u), '_blank', 'noopener'); } else location.href = urlErp(u); };

    async function abrirTarjeta(id, pestana) {
        if (!enElKanban()) { navegar(`/index.html?trabajo=${encodeURIComponent(id)}${pestana ? '&pestana=' + pestana : ''}`); return; }
        cerrar();
        await window.abrirDetalleTrabajo(id);
        if (pestana) document.getElementById('btn-tab-' + pestana)?.click();
    }

    function irA(url) {
        if (url === '/index.html?abrir=fila' && typeof window.abrirFilaSinTarjeta === 'function') { cerrar(); window.abrirFilaSinTarjeta(); return; }
        navegar(url);
    }

    async function resolverDuda(a, elegido, boton) {
        const fila = boton.closest('.vgb-item');
        fila.querySelectorAll('button').forEach(b => { b.disabled = true; });
        const { error } = await db().rpc('fila_resolver_duda', { p: { ids: a.ids, elegido, siempre: false } });
        if (error) { fila.querySelectorAll('button').forEach(b => { b.disabled = false; }); avisar(error.message, 'error'); return; }
        avisar(`Listo: son de ${elegido === 'carpeta' ? a.carpeta_nombre : a.archivo_nombre}. Queda recordado.`, 'ok');
        if (typeof window.contarFilaSinTarjeta === 'function') window.contarFilaSinTarjeta();
        actualizar();
    }

    async function alertaHecha(a, boton) {
        boton.disabled = true;
        const p = { alerta: a.alerta };
        const q = typeof quien === 'function' ? quien() : quien;
        if (q) p.quien = q;
        const { data, error } = await db().rpc('taller_alerta_hecha', { p });
        if (error) { boton.disabled = false; avisar(error.message, 'error'); return; }
        avisar(data?.ya_estaba ? `Ya la había hecho ${data.hecha_por}.` : 'Anotado: ✓ hecha.', 'ok');
        actualizar();
    }

    function botones(a) {
        if (!a) return '';
        if (a.tipo === 'duda') return `<button type="button" class="vgb-btn" data-el="carpeta">Son de ${esc(a.carpeta_nombre)} (la carpeta)</button>
            <button type="button" class="vgb-btn sec" data-el="archivo">Son de ${esc(a.archivo_nombre)}</button>`;
        return `<button type="button" class="vgb-btn" data-hacer="1">${esc(a.texto || 'Abrir')}</button>`;
    }

    // ---------- El panel ----------
    function pintarPanel(fondo) {
        const zona = fondo.querySelector('.vgb-lista');
        const datos = ultimo;
        if (!datos) return;
        const grupos = datos.grupos || [];
        fondo.querySelector('.vgb-sub').textContent = grupos.length
            ? `${datos.total} para resolver${datos.alertas ? ` · ${datos.alertas} urgente(s)` : ''}`
            : '';
        if (!grupos.length) {
            zona.innerHTML = '<div class="vgb-vacia"><b>✅</b>No hay nada pendiente. ¡Todo al día!</div>';
            return;
        }
        const abiertosAhora = new Set([...zona.querySelectorAll('.vgb-grupo')].filter(d => d.open).map(d => d.dataset.g));
        const primeraVez = !zona.querySelector('.vgb-grupo');
        zona.innerHTML = grupos.map((g, gi) => {
            const urg = (g.items || []).some(i => i.nivel === 'alerta');
            const abierto = primeraVez ? (gi === 0 || abiertos.has(g.clave)) : abiertosAhora.has(g.clave);
            const n = (g.items || []).length + Number(g.mas || 0);
            return `<details class="vgb-grupo" data-g="${esc(g.clave)}" ${abierto ? 'open' : ''}>
                <summary>${esc(g.icono)} ${esc(g.titulo)} <span class="vgb-num ${urg ? 'urgente' : ''}">${n}</span></summary>
                <div class="vgb-ayuda">${esc(g.ayuda || '')}</div>
                ${(g.items || []).map((it, ii) => `<div class="vgb-item ${it.nivel === 'alerta' ? 'alerta' : ''}" data-i="${gi}:${ii}">
                    <div class="vgb-item-txt">
                        <div class="vgb-item-tit">${esc(it.titulo)}</div>
                        ${it.detalle ? `<div class="vgb-item-det">${esc(it.detalle)}</div>` : ''}
                        ${it.monto != null ? `<div class="vgb-monto vg-precio">${esc(plata(it.monto))}</div>` : ''}
                    </div>
                    <div class="vgb-bots">${botones(it.accion)}</div>
                </div>`).join('')}
                ${Number(g.mas || 0) > 0 || g.ir ? `<div class="vgb-mas">${Number(g.mas || 0) > 0 ? `Y ${g.mas} más. ` : ''}${g.ir ? `<a href="#" data-ir="${gi}">${esc(g.ir.texto)}</a>` : ''}</div>` : ''}
            </details>`;
        }).join('');
    }

    function cerrar() {
        document.querySelector('.vgb-fondo')?.remove();
        document.removeEventListener('keydown', tecla);
    }
    function tecla(e) { if (e.key === 'Escape') cerrar(); }

    async function abrir() {
        estilos();
        cerrar();
        const fondo = document.createElement('div');
        fondo.className = 'vgb-fondo';
        fondo.innerHTML = `<div class="vgb-panel" role="dialog" aria-label="Para hacer">
                <div class="vgb-cab"><div><h2>📥 Para hacer</h2><div class="vgb-nota vgb-sub"></div></div>
                    <div class="vgb-cab-bot"><button type="button" class="vgb-x" data-x="act" title="Actualizar">⟳</button>
                    <button type="button" class="vgb-x" data-x="cerrar" title="Cerrar">✖</button></div></div>
                <div class="vgb-lista"><p class="vgb-nota">Buscando lo pendiente…</p></div>
            </div>`;
        document.body.appendChild(fondo);
        document.addEventListener('keydown', tecla);
        fondo.addEventListener('click', (e) => {
            if (e.target === fondo || e.target.closest('[data-x=cerrar]')) { cerrar(); return; }
            if (e.target.closest('[data-x=act]')) { fondo.querySelector('.vgb-sub').textContent = 'Actualizando…'; actualizar(); return; }
            const ir = e.target.closest('[data-ir]');
            if (ir) { e.preventDefault(); irA(ultimo.grupos[Number(ir.dataset.ir)].ir.url); return; }
            const b = e.target.closest('.vgb-item button');
            if (!b) return;
            const [gi, ii] = b.closest('.vgb-item').dataset.i.split(':').map(Number);
            const a = ultimo.grupos[gi].items[ii].accion || {};
            if (a.tipo === 'duda') resolverDuda(a, b.dataset.el, b);
            else if (a.tipo === 'alerta') alertaHecha(a, b);
            else if (a.tipo === 'tarjeta') abrirTarjeta(a.trabajo_id, a.pestana);
            else if (a.tipo === 'url') irA(a.url);
        });
        try {
            await traer();
            pintarPanel(fondo);
        } catch (e) {
            fondo.querySelector('.vgb-lista').innerHTML = `<p class="vgb-nota">No se pudo traer lo pendiente (${esc(e.message || e)}).</p>`;
        }
    }

    // ---------- El botón del menú ----------
    function poner() {
        if (window.self !== window.top) return;   // dentro de otra pantalla (embebida), no
        estilos();
        let lugar = document.querySelector('[data-bandeja]');
        if (!lugar) {
            const menu = document.querySelector('.sidebar-nav');
            if (!menu) return;
            lugar = document.createElement('a');
            lugar.href = 'javascript:void(0)';
            lugar.className = 'sidebar-item vgb-menu';
            lugar.title = 'Para hacer: todo lo que hay que resolver, en un solo lugar';
            lugar.innerHTML = '<span class="icon">📥</span><span class="text">Para hacer</span>';
            menu.insertBefore(lugar, menu.firstChild);
        }
        if (!lugar.querySelector('[data-vgb-num]')) {
            const n = document.createElement('span');
            n.className = 'vgb-num';
            n.dataset.vgbNum = '1';
            n.hidden = true;
            (lugar.querySelector('.text') || lugar).appendChild(n);
        }
        lugar.addEventListener('click', (e) => { e.preventDefault(); abrir(); });
        arrancar();
    }

    // El número se mantiene al día: cuando algo cambia en la base, al volver a la pestaña y cada 5 minutos
    let arrancado = false;
    function arrancar() {
        if (arrancado) return;
        arrancado = true;
        setTimeout(actualizar, 1500);   // después de que la pantalla inicia sesión
        setInterval(() => { if (!document.hidden) actualizar(); }, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) actualizar(); });
        if (typeof window.vgEscucharCambios === 'function') {
            window.vgEscucharCambios(['v3_trabajos', 'prod_pendientes_drive', 'v3_telas_reservas', 'v3_movimientos_caja',
                'v3_gastos_fijos_periodos', 'prod_alertas_hechas', 'v3_borradores'], actualizar, 4000);
        }
    }

    // ---------- En el Kanban: ?trabajo=<id> abre la tarjeta, ?abrir=fila los archivos sin tarjeta ----------
    function pedidoPorEnlace() {
        const params = new URLSearchParams(location.search);
        const trabajo = params.get('trabajo');
        const fila = params.get('abrir') === 'fila';
        if (!trabajo && !fila) return;
        let intentos = 0;
        const probar = () => {
            const listo = document.getElementById('erp-layout')?.style.display !== 'none' && enElKanban();
            if (!listo) { if (++intentos < 40) setTimeout(probar, 500); return; }
            history.replaceState(null, '', location.pathname);
            if (trabajo) abrirTarjeta(trabajo, params.get('pestana'));
            else if (typeof window.abrirFilaSinTarjeta === 'function') window.abrirFilaSinTarjeta();
        };
        setTimeout(probar, 800);
    }

    window.vgBandeja = {
        abrir, actualizar,
        usar: (cliente, opciones = {}) => {
            sb = cliente || sb; erp = opciones.erp || erp; quien = opciones.quien || quien; avisoPropio = opciones.avisar || avisoPropio; arrancar();
        }
    };
    const iniciar = () => { poner(); pedidoPorEnlace(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
