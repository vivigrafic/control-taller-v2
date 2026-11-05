// tiradas.js: armar las tiradas de un trabajo grande (05/11/2026). Reemplaza al generador de archivos de la PC: un archivo base,
// los rollos de la tela y el máximo del ripeador; el ayudante de Google copia el archivo una vez por tirada a la fila, con el
// nombre de siempre y enlazado a la tarjeta. La misma ventana en el taller y en la tarjeta del Kanban.
//   vgTiradas.usar(clienteSupabase, { terminal })  → la conexión y la dirección del ayudante (sin ayudante, solo muestra los nombres)
//   vgTiradas.abrir({ trabajo })                   → trabajo: { id, tarjeta, cliente, titulo, lleva_corte } o nada (lo elige)
//   vgTiradas.repartir(rollos, maximo)             → [{ rollos: [...], metros }]: lo usan la ventana y las pruebas
(function () {
    if (window.vgTiradas) return;
    let sb = null;
    let terminal = null;
    const db = () => sb || window.vgSupabase || window.conexionDB || window.supabaseClient;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
    const errorTexto = (e) => String((e && e.message) || e || '').replace(/^.*?ERROR:\s*/, '');
    const avisar = (t, tipo) => window.vgDialogo.avisar(t, tipo);
    const dormir = (ms) => new Promise(r => setTimeout(r, ms));

    function ponerEstilos() {
        if (document.getElementById('tr-estilos')) return;
        const s = document.createElement('style');
        s.id = 'tr-estilos';
        s.textContent = `
        .tr-v { color: var(--vg-text-primary); font: 13px/1.4 var(--vg-font-sans); }
        .tr-v label { display: block; font-size: 12px; color: var(--vg-text-secondary); margin: 8px 0 3px; }
        .tr-v input[type=text], .tr-v input[type=number], .tr-v textarea, .tr-v select { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
            border: 1px solid var(--vg-surface-border); background: var(--vg-surface-base); color: var(--vg-text-primary); font: 14px var(--vg-font-sans); }
        .tr-g { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0 10px; }
        .tr-rollos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
        .tr-rollos label { display: inline-flex; gap: 6px; align-items: center; margin: 0; padding: 5px 8px; border: 1px solid var(--vg-surface-border); border-radius: 8px; color: var(--vg-text-primary); font-size: 13px; cursor: pointer; }
        .tr-lista { margin-top: 10px; border-top: 1px solid var(--vg-surface-border); }
        .tr-t { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px dashed var(--vg-surface-border); }
        .tr-t.tr-mal b { color: var(--vg-status-alert); }
        .tr-res { margin-top: 8px; font-weight: 700; }
        .tr-op { display: block; width: 100%; text-align: left; padding: 9px 10px; margin: 0 0 6px; border: 1px solid var(--vg-surface-border); border-radius: 8px; background: transparent; color: var(--vg-text-primary); cursor: pointer; font: 14px var(--vg-font-sans); }
        .tr-op small { display: block; color: var(--vg-text-secondary); }
        .tr-nombre { font-size: 11px; color: var(--vg-text-secondary); word-break: break-all; }`;
        document.head.appendChild(s);
    }

    // Los rollos en orden, de a tiradas que no pasen el máximo. Un rollo no se parte entre dos tiradas.
    function repartir(rollos, maximo) {
        const tiradas = [];
        let actual = null;
        (rollos || []).forEach(r => {
            const m = Number(r.metros) || 0;
            if (!actual || actual.metros + m > maximo) { actual = { rollos: [], metros: 0 }; tiradas.push(actual); }
            actual.rollos.push(r);
            actual.metros = Math.round((actual.metros + m) * 100) / 100;
        });
        return tiradas;
    }
    const textoRollos = (t) => {
        const n = t.rollos.map(r => r.numero);
        if (n.length === 1) return `ROLLO ${n[0]}`;
        return n[n.length - 1] - n[0] === n.length - 1 ? `ROLLOS ${n[0]}-${n[n.length - 1]}` : `ROLLOS ${n.join(', ')}`;
    };

    async function esperar(id, texto) {
        if (!terminal) return null;
        avisar(texto);
        fetch(`${terminal}?action=carpetas_procesar`).catch(() => null);
        const fin = Date.now() + 120000;
        while (Date.now() < fin) {
            await dormir(2000);
            const { data } = await db().from('v3_drive_pedidos').select('estado, error, resultado').eq('id', id).maybeSingle();
            if (data && data.estado === 'hecho') return data;
            if (data && data.estado === 'error') { avisar('El Drive respondió: ' + (data.error || 'error'), 'error'); return null; }
        }
        avisar('Quedó pedido: el ayudante de Google lo termina en un minuto.');
        return null;
    }

    // Elegir la tarjeta
    async function elegirTarjeta() {
        const { data, error } = await db().rpc('tiradas_trabajos', { p_texto: null });
        if (error) { avisar(errorTexto(error), 'error'); return null; }
        const lista = data || [];
        if (!lista.length) { avisar('No hay tarjetas abiertas.', 'error'); return null; }
        let elegida = null;
        const ok = await window.vgDialogo.ventana({ titulo: '🧩 ¿Para qué tarjeta?', aceptar: 'Seguir', ancho: '560px' }, (zona) => {
            zona.innerHTML = `<div class="tr-v"><input type="text" data-b placeholder="🔎 Buscar cliente o tarjeta…"><div data-l style="margin-top:8px; max-height:50vh; overflow:auto;"></div></div>`;
            const pintar = (q) => {
                const t = q.trim().toLowerCase();
                const v = lista.filter(x => !t || `${x.tarjeta} ${x.cliente} ${x.titulo}`.toLowerCase().includes(t)).slice(0, 40);
                zona.querySelector('[data-l]').innerHTML = v.map(x => `<button type="button" class="tr-op" data-id="${esc(x.id)}" ${elegida && elegida.id === x.id ? 'style="border-color:var(--vg-brand-primary);"' : ''}><b>${esc(x.tarjeta)}</b> ${esc(x.cliente || '')}<small>${esc(x.titulo || '')}</small></button>`).join('') || 'No encontré esa tarjeta.';
            };
            pintar('');
            zona.querySelector('[data-b]').addEventListener('input', (e) => pintar(e.target.value));
            zona.addEventListener('click', (e) => {
                const b = e.target.closest('[data-id]');
                if (!b) return;
                elegida = lista.find(x => x.id === b.dataset.id);
                pintar(zona.querySelector('[data-b]').value);
            });
            return () => { if (!elegida) { avisar('Tocá una tarjeta.', 'error'); return undefined; } return true; };
        });
        return ok ? elegida : null;
    }

    // Elegir el archivo base en la subcarpeta del trabajo. Sin ayudante (versión de prueba) se sigue con uno de ejemplo.
    async function elegirBase(t) {
        if (!terminal) return { file_id: 'prueba', nombre: 'DISENO.jpg', prueba: true };
        if (!t.carpeta) { avisar('Este trabajo no tiene subcarpeta en el Drive: creala desde la tarjeta y poné ahí el archivo base.', 'error'); return null; }
        const { data, error } = await db().rpc('carpeta_pedir', { p: { tipo: 'listar', trabajo_id: t.id } });
        if (error) { avisar(errorTexto(error), 'error'); return null; }
        const hecho = await esperar(data.pedido, 'Leyendo los archivos de la carpeta del trabajo…');
        if (!hecho) return null;
        const archivos = ((hecho.resultado && hecho.resultado.archivos) || []).filter(a => /^image\//.test(a.mime || ''));
        if (!archivos.length) { avisar('La subcarpeta del trabajo no tiene imágenes.', 'error'); return null; }
        if (archivos.length === 1) return archivos[0];
        const r = await window.vgDialogo.elegir({ titulo: '🧩 ¿Cuál es el archivo base?', opciones: archivos.map((a, i) => ({ valor: String(i), icono: '🖼️', titulo: a.nombre })), elegida: '0', aceptar: 'Seguir' });
        return r === null || r === undefined ? null : archivos[Number(r)];
    }

    async function abrir(op = {}) {
        ponerEstilos();
        const t = op.trabajo || await elegirTarjeta();
        if (!t) return;
        const res = await db().rpc('tiradas_rollos', { p_trabajo: t.id });
        if (res.error) { avisar(errorTexto(res.error), 'error'); return; }
        const datos = res.data || {};
        const base = await elegirBase(t);
        if (!base) return;
        const partidas = (datos.partidas || []);
        const ajustes = datos.ajustes || { tirada_max: 126 };
        const reservada = ((datos.telas || [])[0] || {}).partida_id;
        const inicial = partidas.find(p => p.partida_id === reservada) || partidas[0] || null;
        let plan = [];
        const pedido = await window.vgDialogo.ventana({ titulo: `🧩 Tiradas de ${t.tarjeta}`, aceptar: 'Crear archivos', ancho: '720px' }, (zona) => {
            zona.innerHTML = `<div class="tr-v">
                <div>${esc(t.cliente || '')} · ${esc(t.titulo || '')}. Base: <b>${esc(base.nombre)}</b></div>
                ${partidas.length ? `<label>Tela</label><select data-c="partida">${partidas.map(p => `<option value="${esc(p.partida_id)}" ${inicial && p.partida_id === inicial.partida_id ? 'selected' : ''}>${esc([p.codigo, p.tela, p.color].filter(Boolean).join(' · '))}</option>`).join('')}</select>` : ''}
                <div data-c="rollos"></div>
                <div data-c="pegar"><label>Metros de cada rollo, separados por espacios</label><textarea rows="2" data-c="metros" placeholder="61 52 64 60 60 49 71 50"></textarea>
                    <label style="display:flex; gap:6px; align-items:center;" data-c="guardar-caja"><input type="checkbox" data-c="guardar" checked> Anotar estos rollos en la tela</label></div>
                <div class="tr-g">
                    <div><label>Máximo por tirada (m)</label><input type="number" data-c="max" value="${esc(ajustes.tirada_max)}"></div>
                    <div><label>Artículo</label><input type="text" data-c="articulo" value="${esc(t.titulo || '')}"></div>
                    <div><label>Color</label><input type="text" data-c="color" value="${esc(((datos.telas || [])[0] || {}).color || '')}"></div>
                    <div><label>Diseño</label><input type="text" data-c="diseno" placeholder="DISEÑO 1"></div>
                    <div><label>Perfil</label><input type="text" data-c="perfil" placeholder="V-V 3P"></div>
                    <div><label>Ruta</label><select data-c="ruta"><option>Solo Calandrado</option><option ${t.lleva_corte ? 'selected' : ''}>Calandrado + Corte Láser</option></select></div>
                </div>
                <div class="tr-lista" data-c="plan"></div><div class="tr-res" data-c="res"></div>
            </div>`;
            const q = (c) => zona.querySelector(`[data-c="${c}"]`);
            const partidaSel = () => partidas.find(p => p.partida_id === (q('partida') ? q('partida').value : '')) || null;
            const rollosVista = () => {
                const p = partidaSel();
                const hay = p && (p.rollos || []).length;
                q('rollos').innerHTML = hay ? `<label>Rollos</label><div class="tr-rollos">${p.rollos.map(r => `<label><input type="checkbox" data-rollo="${esc(r.rollo_id)}" checked> Nº ${esc(r.numero)} · ${num(r.metros)} m</label>`).join('')}</div>` : '';
                q('pegar').style.display = hay ? 'none' : '';
                q('guardar-caja').style.display = p ? '' : 'none';
            };
            const leerRollos = () => {
                const p = partidaSel();
                if (p && (p.rollos || []).length) {
                    const marcados = [...zona.querySelectorAll('[data-rollo]:checked')].map(c => c.dataset.rollo);
                    return p.rollos.filter(r => marcados.includes(r.rollo_id)).map(r => ({ numero: r.numero, metros: Number(r.metros) }));
                }
                return (String(q('metros').value).match(/\d+(?:[.,]\d+)?/g) || []).map((x, i) => ({ numero: i + 1, metros: Number(x.replace(',', '.')) })).filter(r => r.metros > 0);
            };
            const pintar = () => {
                const max = Number(q('max').value) || 126;
                plan = repartir(leerRollos(), max);
                q('plan').innerHTML = plan.map((x, i) => `<div class="tr-t ${x.metros > max ? 'tr-mal' : ''}"><span>Tirada ${i + 1}: ${esc(textoRollos(x))}</span><b>${num(x.metros)} m${x.metros > max ? ' · este rollo solo pasa el máximo' : ''}</b></div>`).join('');
                const total = plan.reduce((a, x) => a + x.metros, 0);
                q('res').textContent = plan.length ? `${plan.length} archivo${plan.length === 1 ? '' : 's'} · ${num(total)} m` : 'Marcá o pegá los rollos.';
            };
            rollosVista();
            pintar();
            zona.addEventListener('input', pintar);
            zona.addEventListener('change', (e) => { if (e.target === q('partida')) rollosVista(); pintar(); });
            return () => {
                if (!plan.length) { avisar('Marcá o pegá los rollos.', 'error'); return undefined; }
                const p = partidaSel();
                return { plan, max: Number(q('max').value) || 126, ruta: q('ruta').value, articulo: q('articulo').value, color: q('color').value, diseno: q('diseno').value, perfil: q('perfil').value,
                         anotar: !!(p && !(p.rollos || []).length && q('guardar').checked), partida: p };
            };
        });
        if (!pedido) return;

        // El máximo, si lo cambiaron (necesita el permiso de configuración; si no, vale solo para esta vez)
        if (Number(pedido.max) !== Number(ajustes.tirada_max)) await db().rpc('taller_ajustes_guardar', { p: { tirada_max_m: pedido.max } });
        // Los rollos pegados quedan anotados en la tela
        if (pedido.anotar) {
            const detalle = pedido.plan.flatMap(x => x.rollos).map(r => ({ metros: r.metros }));
            const { error } = await db().rpc('actualizar_partida', { p: { partida_id: pedido.partida.partida_id, detalle_rollos: detalle, motivo: 'Rollos anotados al armar las tiradas' } });
            if (error) avisar('Los rollos no se anotaron: ' + errorTexto(error), 'error');
        }
        const ext = (String(base.nombre).match(/\.[A-Za-z0-9]{2,4}$/) || ['.jpg'])[0];
        const archivos = pedido.plan.map((x, i) => ({ file_id: base.file_id, nombre: 'base' + ext, modulo: 'SUBLIMACION', largo: 1, reps: Math.ceil(x.metros), ruta: pedido.ruta,
            tirada: { numero: i + 1, rollos: textoRollos(x), articulo: pedido.articulo, color: pedido.color, diseno: pedido.diseno, perfil: pedido.perfil } }));
        if (base.prueba) {
            const nombres = archivos.map(a => `${t.cliente || ''} (${pedido.articulo})(${pedido.color})(${pedido.diseno}) ${String(a.tirada.numero).padStart(2, '0')} (${a.tirada.rollos}) 1 X ${a.reps} (${a.reps} MTS)(${pedido.perfil})${ext}`);
            await window.vgDialogo.ventana({ titulo: 'Versión de prueba: estos archivos se crearían', aceptar: 'Listo', ancho: '720px' }, (zona) => {
                zona.innerHTML = `<div class="tr-v">En esta prueba no hay Drive: en el sistema de verdad el ayudante copia el archivo base con estos nombres.<div class="tr-lista">${nombres.map(n => `<div class="tr-t tr-nombre">${esc(n.toUpperCase())}</div>`).join('')}</div></div>`;
                return () => true;
            });
            return;
        }
        const r = await db().rpc('carpeta_pedir', { p: { tipo: 'imprimir', trabajo_id: t.id, archivos } });
        if (r.error) { avisar(errorTexto(r.error), 'error'); return; }
        const ok = await esperar(r.data.pedido, `Creando ${archivos.length} archivo(s) en la fila…`);
        if (ok) avisar(`Listo: ${archivos.length} archivo(s) en la fila, enlazados a ${t.tarjeta}.`);
        if (op.alTerminar) await op.alTerminar();
    }

    window.vgTiradas = { usar: (c, o = {}) => { sb = c; terminal = o.terminal === undefined ? terminal : o.terminal; }, abrir, repartir };
})();
