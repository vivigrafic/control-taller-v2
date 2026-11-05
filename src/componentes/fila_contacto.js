// fila_contacto.js: de quién es una carpeta de la fila de impresión que quedó sin tarjeta (05/11/2026). Se elige un contacto
// sugerido, se busca entre todos o se crea ahí mismo, y la base busca o crea su tarjeta. La misma pieza en el Kanban y en el taller.
//   vgFilaContacto.usar(clienteSupabase)                                     → la conexión de la pantalla
//   vgFilaContacto.armar(zona, { carpeta, modulo, clienteId, ids, alTerminar }) → pinta adentro de zona
//       ids: lista de archivos, o función que la devuelve. alTerminar(r): la respuesta de la base { ok, codigo, nueva, cliente, ... }
// Todo pasa por las puertas de siempre: fila_contactos, cliente_crear, fila_enlazar_contacto y fila_enlazar_manual.
(function () {
    if (window.vgFilaContacto) return;
    let sb = null;
    const db = () => sb || window.vgSupabase || window.conexionDB || window.supabaseClient;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const errorTexto = (e) => String((e && e.message) || e || '').replace(/^.*?ERROR:\s*/, '');
    const avisar = (t, tipo) => window.vgDialogo.avisar(t, tipo);
    const clave = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // El nombre de la carpeta sin extensión, fecha, metros ni paréntesis (lo mismo que hace la base con fila_nombre_limpio)
    const nombreLimpio = (t) => String(t || '').replace(/\.(jpe?g|png|tiff?|pdf|cdr|ai|psd|eps|svg)$/i, '').replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ')
        .replace(/\d{1,2}-\d{1,2}-\d{2,4}/g, ' ').replace(/[\d.,]+\s*(mts?|metros?|m)\b/gi, ' ').replace(/[\s\-_]+/g, ' ').trim();
    const esArchivoSuelto = (t) => /\.(jpe?g|png|tiff?|pdf|cdr|ai|psd|eps|svg)$/i.test(String(t || ''));
    const ESTADOS = { 'col-consultas': 'Consultas', 'col-diseno': 'En diseño', 'col-impresion': 'En impresión', 'col-calandrado': 'En calandrado',
        'col-laser': 'En corte', 'col-control': 'Control', 'col-listo': 'Listo', 'col-listo-dtf': 'Listo DTF' };

    function ponerEstilos() {
        if (document.getElementById('fc-estilos')) return;
        const s = document.createElement('style');
        s.id = 'fc-estilos';
        s.textContent = `
        .fc { display: flex; flex-direction: column; gap: 8px; color: var(--vg-text-primary); font: 14px/1.35 var(--vg-font-sans); }
        .fc.ocupado { opacity: .55; pointer-events: none; }
        .fc-titulo { margin: 0; font-weight: 700; font-size: 14px; }
        .fc-ayuda { margin: 0; color: var(--vg-text-secondary); font-size: 12px; }
        .fc-lista { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
        .fc-lista:empty { display: none; }
        .fc-op { display: block; width: 100%; box-sizing: border-box; min-height: 46px; text-align: left; padding: 8px 12px; border-radius: 10px; cursor: pointer;
            border: 1px solid var(--vg-surface-border); background: var(--vg-surface-base); color: var(--vg-text-primary); font: 14px var(--vg-font-sans); }
        .fc-op:hover { border-color: var(--vg-brand-primary); }
        .fc-op.principal { border-color: var(--vg-brand-primary); background: var(--vg-brand-primary); color: var(--vg-text-on-brand, var(--vg-text-primary)); font-weight: 700; }
        .fc-op small { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: var(--vg-text-secondary); }
        .fc-op.principal small { color: inherit; opacity: .85; }
        .fc input[type=search], .fc input[type=text] { width: 100%; box-sizing: border-box; min-height: 44px; margin: 0; padding: 8px 12px; border-radius: 10px;
            border: 1px solid var(--vg-surface-border); background: var(--vg-surface-panel, var(--vg-bg-app)); color: var(--vg-text-primary); font: 14px var(--vg-font-sans); }
        .fc-fila { display: flex; gap: 8px; flex-wrap: wrap; }
        .fc-btn { flex: 1 1 180px; min-height: 44px; padding: 8px 12px; border-radius: 10px; cursor: pointer; font: 700 13px var(--vg-font-sans);
            border: 1px solid var(--vg-brand-primary); background: var(--vg-brand-primary); color: var(--vg-text-on-brand, var(--vg-text-primary)); }
        .fc-btn.sec { background: transparent; color: var(--vg-text-primary); border-color: var(--vg-surface-border); }
        .fc-rec { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 12px; font-weight: 400; text-transform: none; letter-spacing: normal; color: var(--vg-text-secondary); cursor: pointer; }
        .fc-rec input { width: 16px; height: 16px; margin: 0; accent-color: var(--vg-brand-primary); }
        .fc label.fc-et { display: block; margin: 2px 0 -4px; font-size: 12px; color: var(--vg-text-secondary); }
        .fc-ok { color: var(--vg-status-ready); font-weight: 700; font-size: 13px; }`;
        document.head.appendChild(s);
    }

    const textoTarjetas = (n) => n === 0 ? 'sin tarjeta abierta: se crea una' : n === 1 ? '1 tarjeta abierta: va a esa' : `${n} tarjetas abiertas: elegís cuál`;
    function datoContacto(c) {
        return [c.numero ? '#' + String(c.numero).padStart(4, '0') : '', c.negocio || '', c.motivo || '', c.solo_proveedor ? 'hoy es proveedor' : '', textoTarjetas(Number(c.abiertas || 0))]
            .filter(Boolean).join(' · ');
    }

    function armar(zona, op) {
        ponerEstilos();
        const { carpeta, modulo, clienteId, alTerminar } = op;
        const limpio = nombreLimpio(carpeta);
        const ids = () => (typeof op.ids === 'function' ? op.ids() : op.ids) || [];
        const ofreceRecordar = limpio.length >= 3 && !esArchivoSuelto(carpeta) && !['sin cliente', 'varios'].includes(clave(limpio));
        let sugeridos = [];
        let encontrados = [];
        let elegido = null;   // el contacto mientras se elige su tarjeta
        let espera = null;
        let recordar = ofreceRecordar;

        const rpc = async (nombre, p) => {
            const { data, error } = await db().rpc(nombre, { p });
            if (error) throw error;
            return data;
        };
        const ocupado = (si) => zona.querySelector('.fc')?.classList.toggle('ocupado', si);
        const hayArchivos = () => { if (ids().length) return true; avisar('Marcá los archivos.', 'error'); return false; };
        const opcion = (c, lista, i, principal) => `<button type="button" class="fc-op ${principal ? 'principal' : ''}" data-a="contacto" data-lista="${lista}" data-i="${i}">
            ${lista === 'sug' ? '✓ Es ' : ''}${esc(c.nombre)}<small>${esc(datoContacto(c))}</small></button>`;

        function pintarLista() {
            const z = zona.querySelector('[data-z=lista]');
            const texto = zona.querySelector('[data-z=buscar]').value.trim();
            if (texto.length < 2) { z.innerHTML = ''; return; }
            z.innerHTML = encontrados.length ? encontrados.map((c, i) => opcion(c, 'res', i, false)).join('')
                : `<p class="fc-ayuda">No encontré a nadie con «${esc(texto)}». Si es nuevo, crealo acá abajo.</p>`;
        }

        function pintarPregunta(texto = '') {
            elegido = null;
            zona.innerHTML = `<div class="fc">
                <p class="fc-titulo">¿De quién es?</p>
                ${sugeridos.length ? `<div class="fc-lista">${sugeridos.map((c, i) => opcion(c, 'sug', i, i === 0)).join('')}</div>` : ''}
                <input type="search" data-z="buscar" data-sin-enter value="${esc(texto)}" placeholder="🔎 Buscar contacto: nombre, negocio o número" autocomplete="off">
                <div class="fc-lista" data-z="lista"></div>
                <div class="fc-fila">
                    <button type="button" class="fc-btn sec" data-a="nuevo">➕ Crear contacto${limpio ? ` «${esc(limpio.toUpperCase())}»` : ''}</button>
                    <button type="button" class="fc-btn sec" data-a="sin">🚫 No lleva tarjeta</button>
                </div>
                ${ofreceRecordar ? `<label class="fc-rec"><input type="checkbox" data-z="recordar" ${recordar ? 'checked' : ''}> Recordar «${esc(limpio.toUpperCase())}» para este contacto (la próxima vez se enlaza solo)</label>` : ''}
            </div>`;
            if (texto) buscar();
        }

        function pintarNuevo(nombre) {
            zona.innerHTML = `<div class="fc">
                <p class="fc-titulo">➕ Contacto nuevo</p>
                <label class="fc-et">Nombre</label><input type="text" data-n="nombre" data-sin-enter value="${esc(nombre)}" autocomplete="off">
                <label class="fc-et">WhatsApp (opcional)</label><input type="text" data-n="wa" data-sin-enter inputmode="tel" placeholder="11 2345 6789" autocomplete="off">
                <label class="fc-et">Negocio o marca (opcional)</label><input type="text" data-n="neg" data-sin-enter autocomplete="off">
                <div class="fc-fila"><button type="button" class="fc-btn sec" data-a="volver">← Volver</button>
                    <button type="button" class="fc-btn" data-a="crear">Crear y enlazar</button></div>
            </div>`;
            zona.querySelector('[data-n=nombre]').focus();
        }

        function pintarTarjetas(c, tarjetas) {
            elegido = c;
            zona.innerHTML = `<div class="fc">
                <p class="fc-titulo">¿A qué tarjeta de ${esc(c.nombre)}?</p>
                <div class="fc-lista">${tarjetas.map(t => `<button type="button" class="fc-op" data-a="tarjeta" data-t="${esc(t.id)}">🗂️ ${esc(t.codigo)} · ${esc(t.titulo || '')}
                    <small>${esc(ESTADOS[t.estado] || t.estado || '')}${t.tipo ? ` · ${esc(t.tipo)}` : ''}</small></button>`).join('')}</div>
                <div class="fc-fila"><button type="button" class="fc-btn sec" data-a="volver">← Volver</button>
                    <button type="button" class="fc-btn" data-a="tarjeta" data-t="nueva">➕ Tarjeta nueva</button></div>
            </div>`;
        }

        function pintarReposicion(c) {
            elegido = c;
            zona.innerHTML = `<div class="fc">
                <p class="fc-titulo">Es una reposición y ${esc(c.nombre)} no tiene tarjeta abierta</p>
                <div class="fc-fila"><button type="button" class="fc-btn" data-a="tarjeta" data-t="nueva">➕ Crear una tarjeta</button>
                    <button type="button" class="fc-btn sec" data-a="tarjeta" data-t="ninguna">Dejarla sin tarjeta</button></div>
                <div class="fc-fila"><button type="button" class="fc-btn sec" data-a="volver">← Volver</button></div>
            </div>`;
        }

        function terminar(r) {
            const partes = r.sin_tarjeta || !r.codigo ? [r.cliente ? `Queda a nombre de ${r.cliente}, sin tarjeta` : 'No lleva tarjeta']
                : [`Enlazado a ${r.codigo}${r.nueva ? ' (tarjeta nueva)' : ''}`, r.cliente || ''];
            if ((r.recordados || []).length) partes.push(`recordado: ${r.recordados.join(', ')}`);
            zona.innerHTML = `<span class="fc-ok">✓ ${esc(partes.filter(Boolean).join(' · '))}</span>`;
            if (alTerminar) alTerminar(r);
        }

        async function enlazar(c, tarjeta) {
            if (!hayArchivos()) return;
            ocupado(true);
            try {
                const r = await rpc('fila_enlazar_contacto', { ids: ids(), cliente_id: c.id, recordar, tarjeta: tarjeta || null });
                if (r.elegir) pintarTarjetas(c, r.elegir);
                else if (r.preguntar === 'reposicion') pintarReposicion(c);
                else terminar(r);
            } catch (e) {
                ocupado(false);
                avisar(errorTexto(e), 'error');
            }
        }

        async function buscar() {
            const inp = zona.querySelector('[data-z=buscar]');
            if (!inp) return;
            const texto = inp.value.trim();
            if (texto.length < 2) { encontrados = []; pintarLista(); return; }
            try {
                const r = await rpc('fila_contactos', { texto, modulo });
                if (zona.querySelector('[data-z=buscar]')?.value.trim() !== texto) return;   // ya escribió otra cosa
                encontrados = r || [];
                pintarLista();
            } catch (e) { avisar(errorTexto(e), 'error'); }
        }

        async function crear(forzar) {
            const nombre = zona.querySelector('[data-n=nombre]').value.trim();
            if (nombre.length < 2) { avisar('Escribí el nombre del contacto.', 'error'); return; }
            if (!hayArchivos()) return;
            const whatsapp = zona.querySelector('[data-n=wa]').value;
            const negocio = zona.querySelector('[data-n=neg]').value;
            ocupado(true);
            const { data, error } = await db().rpc('cliente_crear', { p: { nombre, whatsapp, negocio, origen: 'la fila de impresión', forzar: !!forzar } });
            ocupado(false);
            if (error && /YA_EXISTE/.test(error.message)) {
                const texto = errorTexto(error).replace(/^.*?YA_EXISTE:\s*/, '');
                const m = texto.match(/:\s*(.+)\s\(([^()]+)\)\.?$/);
                const v = await window.vgDialogo.elegir({ titulo: 'Ya hay un contacto así', texto, aceptar: 'Seguir', elegida: m ? 'mismo' : 'otro',
                    opciones: [...(m ? [{ valor: 'mismo', titulo: 'Es el mismo: usar ese', icono: '✓' }] : []), { valor: 'otro', titulo: 'Es otra persona: crearla igual', icono: '➕' }] });
                if (v === 'mismo') await enlazar({ id: m[2], nombre: m[1] });
                else if (v === 'otro') await crear(true);
                return;
            }
            if (error) { avisar(errorTexto(error), 'error'); return; }
            avisar(`✅ Contacto nuevo: ${data.nombre}. Ya está en Contactos.`);
            await enlazar({ id: data.id, nombre: data.nombre });
        }

        async function sinTarjeta() {
            if (!hayArchivos()) return;
            const si = await window.vgDialogo.confirmar({ titulo: '¿No lleva tarjeta?', texto: 'Se imprime igual y sale del aviso. Sirve para muestras y archivos propios.', aceptar: 'Sí, no lleva' });
            if (!si) return;
            ocupado(true);
            try { terminar(await rpc('fila_enlazar_manual', { ids: ids(), trabajo_id: null })); }
            catch (e) { ocupado(false); avisar(errorTexto(e), 'error'); }
        }

        zona.addEventListener('input', (e) => {
            if (e.target.dataset.z !== 'buscar') return;
            clearTimeout(espera);
            espera = setTimeout(buscar, 250);
        });
        zona.addEventListener('change', (e) => { if (e.target.dataset.z === 'recordar') recordar = e.target.checked; });
        zona.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-a]');
            if (!b) return;
            const a = b.dataset.a;
            if (a === 'contacto') {
                const c = (b.dataset.lista === 'sug' ? sugeridos : encontrados)[Number(b.dataset.i)];
                if (c.solo_proveedor) {
                    const si = await window.vgDialogo.confirmar({ titulo: `${c.nombre} está cargado como proveedor`, texto: 'Si seguís, también queda como cliente.', aceptar: 'Seguir' });
                    if (!si) return;
                }
                enlazar(c);
            }
            if (a === 'tarjeta') enlazar(elegido, b.dataset.t);
            if (a === 'nuevo') {
                const t = zona.querySelector('[data-z=buscar]')?.value.trim();
                pintarNuevo((t || limpio).toUpperCase());
            }
            if (a === 'sin') sinTarjeta();
            if (a === 'volver') pintarPregunta();
            if (a === 'crear') crear(false);
        });

        pintarPregunta();
        rpc('fila_contactos', { carpeta, modulo, cliente_id: clienteId || null })
            .then(r => { sugeridos = r || []; if (sugeridos.length && zona.querySelector('[data-z=buscar]') && !zona.querySelector('[data-z=buscar]').value) pintarPregunta(); })
            .catch(e => avisar(errorTexto(e), 'error'));
    }

    window.vgFilaContacto = { usar(cliente) { sb = cliente; }, armar };
})();
