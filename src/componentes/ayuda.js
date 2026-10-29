// ayuda.js: el botón ❓ Ayuda de cada pantalla. Muestra las secciones del manual de lo que está a la vista
// (manual_pantalla), un buscador (manual_buscar) y "Preguntale a Vivi". El manual está en la base (v3_manual): es lo mismo
// que sabe Vivi, y se actualiza con cada cambio del sistema (manual_guardar_ en una migración).
//   <script src="/src/componentes/ayuda.js" data-ayuda="compras"></script>   (después de supabase-js y conexion.js)
//   Una parte de la pantalla con su propia ayuda (la tarjeta del Kanban, una pestaña del taller): data-ayuda="tarjeta" en
//   su contenedor. Si está a la vista, manda esa.
//   vgAyuda.usar(clienteSupabase)  → usa la conexión de la pantalla (el taller)
//   vgAyuda.abrir('tarjeta')       → abre la ayuda de una pantalla
//   data-vivi="https://…/vivi.html" en el script si Vivi está en otro sitio (el taller)
(function () {
    if (window.vgAyuda) return;
    const script = document.currentScript;
    const pantallaBase = (script && script.dataset.ayuda) || 'inicio';
    const urlVivi = (script && script.dataset.vivi) || '/vivi.html';
    let sb = null;
    const db = () => sb || window.vgSupabase || (sb = window.supabase.createClient(window.VG_CONEXION.url, window.VG_CONEXION.key));
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const negrita = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

    // El texto del manual a HTML: renglones, listas con "• " o "1.", **negrita**
    function aHtml(texto) {
        let html = '', lista = null;
        for (const linea of String(texto || '').split('\n')) {
            const m = linea.match(/^\s*(•|\d+\.)\s+(.*)$/);
            if (m) {
                const tipo = m[1] === '•' ? 'ul' : 'ol';
                if (lista !== tipo) { if (lista) html += `</${lista}>`; html += `<${tipo}>`; lista = tipo; }
                html += `<li>${negrita(esc(m[2]))}</li>`;
            } else {
                if (lista) { html += `</${lista}>`; lista = null; }
                if (linea.trim()) html += `<p>${negrita(esc(linea))}</p>`;
            }
        }
        return lista ? html + `</${lista}>` : html;
    }

    // La pantalla que está a la vista: la última parte visible con data-ayuda (la tarjeta abierta, la pestaña del taller)
    function pantallaActual() {
        const partes = [...document.querySelectorAll('[data-ayuda]')].filter(el => el !== script && el.getClientRects().length > 0);
        return partes.length ? partes[partes.length - 1].dataset.ayuda : pantallaBase;
    }

    const css = `
    .vga-boton { position: fixed; left: 14px; bottom: 16px; z-index: 9000; width: 40px; height: 40px; border-radius: 50%;
        border: 1px solid var(--vg-surface-border); background: var(--vg-surface-base, var(--vg-bg-app)); color: var(--vg-text-primary);
        font: 700 18px var(--vg-font-sans, sans-serif); cursor: pointer; opacity: .75; box-shadow: 0 4px 14px color-mix(in srgb, var(--vg-bg-app) 60%, transparent); }
    .vga-boton:hover { opacity: 1; border-color: var(--vg-brand-primary); }
    @media (max-width: 1024px) { .vga-boton { bottom: 84px; width: 36px; height: 36px; font-size: 16px; } }
    .vga-fondo { position: fixed; inset: 0; z-index: 9500; background: color-mix(in srgb, var(--vg-bg-app) 55%, transparent); display: flex; justify-content: flex-end; }
    .vga-panel { width: min(460px, 100%); height: 100%; box-sizing: border-box; overflow-y: auto; padding: 16px;
        background: linear-gradient(var(--vg-surface-base, var(--vg-bg-app)), var(--vg-surface-base, var(--vg-bg-app))), var(--vg-bg-app);
        border-left: 1px solid var(--vg-surface-border); color: var(--vg-text-primary); font: 14px/1.45 var(--vg-font-sans, sans-serif);
        display: flex; flex-direction: column; gap: 10px; }
    .vga-panel * { box-sizing: border-box; }
    .vga-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .vga-cab h2 { margin: 0; font-size: 17px; }
    .vga-cerrar { border: none; background: transparent; color: var(--vg-text-secondary); font-size: 20px; cursor: pointer; padding: 4px 8px; }
    .vga-buscar { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--vg-surface-border);
        background: var(--vg-bg-app); color: var(--vg-text-primary); font: 15px var(--vg-font-sans, sans-serif); }
    .vga-lista { display: flex; flex-direction: column; gap: 8px; }
    .vga-lista details { border: 1px solid var(--vg-surface-border); border-radius: 10px; padding: 8px 12px; background: var(--vg-bg-app); }
    .vga-lista summary { cursor: pointer; font-weight: 700; list-style: none; }
    .vga-lista summary::-webkit-details-marker { display: none; }
    .vga-lista summary::before { content: '▸ '; color: var(--vg-brand-primary); }
    .vga-lista details[open] summary::before { content: '▾ '; }
    .vga-lista small { color: var(--vg-text-secondary); font-weight: 400; }
    .vga-texto p { margin: 6px 0; }
    .vga-texto ul, .vga-texto ol { margin: 6px 0; padding-left: 20px; }
    .vga-texto li { margin: 3px 0; }
    .vga-nota { color: var(--vg-text-secondary); font-size: 13px; margin: 4px 0; }
    .vga-vivi { display: block; text-align: center; padding: 11px; border-radius: 10px; text-decoration: none; font-weight: 700;
        background: var(--vg-brand-primary); color: var(--vg-text-on-brand, var(--vg-text-primary)); }`;
    function estilos() {
        if (document.getElementById('vga-estilos')) return;
        const s = document.createElement('style');
        s.id = 'vga-estilos';
        s.textContent = css;
        document.head.appendChild(s);
    }

    function pintarSecciones(zona, secciones, abiertaPrimera) {
        zona.innerHTML = secciones.length ? secciones.map((s, i) => `<details ${abiertaPrimera && i === 0 ? 'open' : ''}>
                <summary>${esc(s.titulo)} <small>· ${esc(s.modulo)}</small></summary>
                <div class="vga-texto">${aHtml(s.contenido)}</div></details>`).join('')
            : '<p class="vga-nota">No encontré nada con eso en el manual. Preguntale a Vivi.</p>';
    }

    async function abrir(pantalla) {
        estilos();
        document.querySelector('.vga-fondo')?.remove();
        const donde = pantalla || pantallaActual();
        const fondo = document.createElement('div');
        fondo.className = 'vga-fondo';
        fondo.innerHTML = `<div class="vga-panel" role="dialog" aria-label="Ayuda">
                <div class="vga-cab"><h2>❓ Ayuda</h2><button type="button" class="vga-cerrar" data-x="cerrar" title="Cerrar">✖</button></div>
                <input type="search" class="vga-buscar" placeholder="¿Qué querés hacer? Ej.: cargar una compra" />
                <div class="vga-lista"><p class="vga-nota">Cargando…</p></div>
                <a class="vga-vivi" target="_blank" rel="noopener">✨ Preguntale a Vivi</a>
            </div>`;
        document.body.appendChild(fondo);
        const lista = fondo.querySelector('.vga-lista');
        const buscar = fondo.querySelector('.vga-buscar');
        const vivi = fondo.querySelector('.vga-vivi');
        const linkVivi = () => { vivi.href = urlVivi + (buscar.value.trim() ? `?q=${encodeURIComponent(buscar.value.trim())}` : ''); };
        linkVivi();
        const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); };
        const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
        document.addEventListener('keydown', tecla);
        fondo.addEventListener('click', (e) => { if (e.target === fondo || e.target.closest('[data-x=cerrar]')) cerrar(); });

        let deLaPantalla = [];
        try {
            const { data, error } = await db().rpc('manual_pantalla', { p_pantallas: donde });
            if (error) throw error;
            deLaPantalla = data || [];
            pintarSecciones(lista, deLaPantalla, true);
            if (!deLaPantalla.length) lista.innerHTML = '<p class="vga-nota">Escribí arriba qué querés hacer, o preguntale a Vivi.</p>';
        } catch (e) {
            lista.innerHTML = `<p class="vga-nota">No se pudo cargar la ayuda (${esc(e.message || e)}).</p>`;
        }

        let espera = null, pedido = 0;
        buscar.addEventListener('input', () => {
            linkVivi();
            clearTimeout(espera);
            const texto = buscar.value.trim();
            if (!texto) { pintarSecciones(lista, deLaPantalla, true); return; }
            espera = setTimeout(async () => {
                const n = ++pedido;
                const { data, error } = await db().rpc('manual_buscar', { p_texto: texto, p_pantalla: donde, p_limite: 5 });
                if (n !== pedido) return;   // ya escribió otra cosa
                if (error) { lista.innerHTML = `<p class="vga-nota">${esc(error.message)}</p>`; return; }
                pintarSecciones(lista, data || [], true);
            }, 350);
        });
        setTimeout(() => buscar.focus(), 50);
    }

    function poner() {
        if (document.querySelector('.vga-boton') || window.self !== window.top) return;   // dentro de otra pantalla (embebida), no
        estilos();
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vga-boton';
        b.textContent = '?';
        b.title = 'Ayuda: cómo se usa esta pantalla';
        b.setAttribute('aria-label', 'Ayuda');
        b.addEventListener('click', () => abrir());
        document.body.appendChild(b);
    }

    window.vgAyuda = { abrir, usar: (cliente) => { sb = cliente; } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner);
    else poner();
})();
