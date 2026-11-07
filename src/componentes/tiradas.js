// tiradas.js: armar los archivos de impresión de un trabajo (05/11/2026; ampliado el 07/11 con lo del "generador de impresiones"
// de la PC). Uno o varios diseños de la subcarpeta del trabajo, los rollos de la tela y el máximo del ripeador: el sistema reparte
// los rollos entre los diseños, arma una tirada por grupo (sin mezclar colores ni pasar el máximo), revisa cada diseño (ancho
// contra el papel y la tela, resolución y, en la PC, la transparencia de los bordes) y el ayudante de Google copia cada diseño a
// la fila con el nombre de siempre, enlazado a la tarjeta. Cada archivo queda con su tela y sus rollos: de ahí salen el
// descuento al calandrar, las etiquetas por rollo y la lista para separar. Casos: un diseño en muchos rollos (Jimmy), varios
// diseños de a N rollos (Paula Mendieta), muestras de cada diseño y reimprimir una tirada sola.
//   vgTiradas.usar(clienteSupabase, { terminal })  → la conexión y la dirección del ayudante (sin ayudante, versión de prueba)
//   vgTiradas.abrir({ trabajo })                   → trabajo: { id, tarjeta, cliente, titulo, lleva_corte, carpeta } o nada (lo elige)
//   vgTiradas.repartir(rollos, maximo)             → [{ rollos: [...], metros }]: un rollo no se parte entre dos tiradas
//   vgTiradas.armar(rollos, maximo)                → igual, pero cada rollo trae su diseño y su color, que no se mezclan
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
    const PAPEL = 160;
    // El último perfil que se usó en esta PC (para no escribirlo cada vez)
    const recordado = (k) => { try { return localStorage.getItem('vg_tiradas_' + k) || ''; } catch (e) { return ''; } };
    const recordar = (k, v) => { try { localStorage.setItem('vg_tiradas_' + k, v || ''); } catch (e) { /* sin almacenamiento */ } };

    function ponerEstilos() {
        if (document.getElementById('tr-estilos')) return;
        const s = document.createElement('style');
        s.id = 'tr-estilos';
        s.textContent = `
        .tr-v { color: var(--vg-text-primary); font: 13px/1.4 var(--vg-font-sans); }
        .tr-v label { display: block; font-size: 12px; color: var(--vg-text-secondary); margin: 8px 0 3px; }
        .tr-v input[type=text], .tr-v input[type=number], .tr-v textarea, .tr-v select { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
            border: 1px solid var(--vg-surface-border); background: var(--vg-bg-app); color: var(--vg-text-primary); font: inherit; }
        .tr-g { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0 10px; }
        .tr-tit { font-weight: 700; margin: 14px 0 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
        .tr-tit small { font-weight: 400; color: var(--vg-text-secondary); }
        .tr-lista { margin-top: 6px; border: 1px solid var(--vg-surface-border); border-radius: 10px; overflow: hidden; }
        .tr-t { display: flex; justify-content: space-between; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--vg-surface-border); align-items: center; }
        .tr-t:last-child { border-bottom: 0; }
        .tr-t.tr-mal { color: var(--vg-status-alert); }
        .tr-nombre { font-family: var(--vg-font-mono); font-size: 11px; overflow-wrap: anywhere; }
        .tr-res { margin-top: 8px; font-weight: 700; }
        .tr-op { display: block; width: 100%; text-align: left; padding: 9px 10px; margin: 0 0 6px; border: 1px solid var(--vg-surface-border); border-radius: 8px;
            background: transparent; color: var(--vg-text-primary); font: inherit; cursor: pointer; }
        .tr-op small { display: block; color: var(--vg-text-secondary); }
        .tr-d { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; padding: 8px 10px; border-bottom: 1px solid var(--vg-surface-border); align-items: start; }
        .tr-d:last-child { border-bottom: 0; }
        .tr-d input[type=text] { padding: 5px 8px; }
        .tr-d small { display: block; color: var(--vg-text-secondary); overflow-wrap: anywhere; }
        .tr-chip { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; border: 1px solid currentColor; margin-left: 4px; }
        .tr-ok { color: var(--vg-status-ready); } .tr-aviso { color: var(--vg-status-warning, var(--vg-brand-secondary)); } .tr-err { color: var(--vg-status-alert); }
        .tr-r { display: grid; grid-template-columns: auto 1fr minmax(110px, 40%); gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--vg-surface-border); align-items: center; }
        .tr-r:last-child { border-bottom: 0; }
        .tr-r select { padding: 5px 6px; }
        .tr-btn { border: 1px solid var(--vg-surface-border); background: transparent; color: var(--vg-text-primary); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12px; cursor: pointer; min-height: 34px; }
        .tr-btn.fuerte { background: var(--vg-brand-primary); border-color: var(--vg-brand-primary); }
        .tr-fila { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }`;
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
    // Igual, pero un grupo nuevo cada vez que cambia el diseño, el color o la tela (no se mezclan en una tirada)
    function armar(rollos, maximo) {
        const tiradas = [];
        let actual = null;
        (rollos || []).forEach(r => {
            const m = Number(r.metros) || 0;
            const clave = `${r.diseno}|${r.partida_id || ''}|${(r.color || '').toUpperCase()}`;
            if (!actual || actual.clave !== clave || actual.metros + m > maximo) {
                actual = { clave, diseno: r.diseno, partida_id: r.partida_id || null, color: r.color || '', rollos: [], metros: 0 };
                tiradas.push(actual);
            }
            actual.rollos.push(r);
            actual.metros = Math.round((actual.metros + m) * 100) / 100;
        });
        return tiradas;
    }
    const textoRollos = (t) => {
        // Siempre con guion y en orden ("ROLLOS 11-12", "ROLLOS 3-4-7"): la terminal del taller no entiende la coma
        const n = [...new Set(t.rollos.map(r => r.numero))].sort((a, b) => Number(a) - Number(b));
        if (n.length === 1) return `ROLLO ${n[0]}`;
        const seguidos = n.every((x, i) => i === 0 || Number(x) === Number(n[i - 1]) + 1);
        return seguidos ? `ROLLOS ${n[0]}-${n[n.length - 1]}` : `ROLLOS ${n.join('-')}`;
    };
    // "DISEÑO FLORES.jpg" → "DISEÑO FLORES"
    const nombreDiseno = (archivo) => String(archivo || '').replace(/\.[A-Za-z0-9]{2,4}$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40);

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

    // Los diseños de la subcarpeta del trabajo (con sus medidas). Sin ayudante (versión de prueba) se usan 5 de ejemplo.
    async function leerDisenos(t) {
        if (!terminal) {
            return [1, 2, 3, 4, 5].map(i => ({ file_id: 'prueba-' + i, nombre: `DISEÑO ${i}.jpg`, mime: 'image/jpeg', ancho_px: 17480, alto_px: 7087, dpi: 300, prueba: true }));
        }
        if (!t.carpeta) { avisar('Este trabajo no tiene subcarpeta en el Drive: creala o enlazala desde la tarjeta y poné ahí los diseños.', 'error'); return null; }
        const { data, error } = await db().rpc('carpeta_pedir', { p: { tipo: 'listar', trabajo_id: t.id } });
        if (error) { avisar(errorTexto(error), 'error'); return null; }
        const hecho = await esperar(data.pedido, 'Leyendo los diseños de la carpeta del trabajo…');
        if (!hecho) return null;
        const archivos = ((hecho.resultado && hecho.resultado.archivos) || []).filter(a => /^image\//.test(a.mime || ''));
        if (!archivos.length) { avisar('La subcarpeta del trabajo no tiene imágenes.', 'error'); return null; }
        return archivos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }));
    }

    async function abrir(op = {}) {
        ponerEstilos();
        const t = op.trabajo || await elegirTarjeta();
        if (!t) return;
        const [res, resv] = await Promise.all([
            db().rpc('tiradas_rollos', { p_trabajo: t.id }),
            db().from('v3_telas_reservas').select('id, partida_id, rollos, estado').eq('trabajo_id', t.id).neq('estado', 'anulada')
        ]);
        if (res.error) { avisar(errorTexto(res.error), 'error'); return; }
        const datos = res.data || {};
        const disenos = await leerDisenos(t);
        if (!disenos) return;
        const partidas = datos.partidas || [];
        const ajustes = datos.ajustes || { tirada_max: 126 };
        // Los rollos que ya tiene apartados este trabajo vienen marcados
        const apartados = new Set((resv.data || []).flatMap(r => (Array.isArray(r.rollos) ? r.rollos : []).map(x => x.id)));
        const reservaDe = {};
        (resv.data || []).forEach(r => (Array.isArray(r.rollos) ? r.rollos : []).forEach(x => { reservaDe[x.id] = r.id; }));
        const anchos = {};
        if (partidas.length) {
            const { data: ps } = await db().from('v_telas_saldos').select('id, ancho_cm').in('id', partidas.map(p => p.partida_id));
            (ps || []).forEach(p => { anchos[p.id] = Number(p.ancho_cm) || null; });
        }
        const todos = partidas.flatMap(p => (p.rollos || []).map(r => ({ rollo_id: r.rollo_id, numero: r.numero, metros: Number(r.metros) || 0,
            partida_id: p.partida_id, codigo: p.codigo, tela: p.tela, color: p.color || '', lugar: p.lugar })));
        const hayApartados = todos.some(r => apartados.has(r.rollo_id));
        const estado = {
            disenos: disenos.map((d, i) => ({ ...d, usar: !/muestra/i.test(d.nombre) || disenos.length === 1, titulo: nombreDiseno(d.nombre) || `DISEÑO ${i + 1}`, local: null })),
            rollos: todos.map(r => ({ ...r, usar: hayApartados ? apartados.has(r.rollo_id) : (partidas.length === 1), diseno: 0 })),
            plan: [],
            nombres: {}   // los nombres que se cambiaron a mano
        };
        let pedido = null;
        const ok = await window.vgDialogo.ventana({ titulo: `🧩 Armar archivos de impresión · ${t.tarjeta}`, aceptar: 'Crear archivos', ancho: '780px' }, (zona) => {
            zona.innerHTML = `<div class="tr-v">
                <div>${esc(t.cliente || '')} · ${esc(t.titulo || '')}</div>
                <div class="tr-tit"><span>1. Diseños <small>(de la subcarpeta del trabajo)</small></span>
                    <span class="tr-fila"><input type="file" data-c="local" multiple accept="image/*,.tif,.tiff" hidden><button type="button" class="tr-btn" data-c="revisar">🔍 Revisar en esta PC</button></span></div>
                <div class="tr-lista" data-c="disenos"></div>
                <div class="tr-tit"><span>2. Rollos</span><span class="tr-fila"><label style="margin:0;">Rollos por diseño</label><input type="number" data-c="por" min="1" style="width:70px;"><button type="button" class="tr-btn" data-c="repartir">Repartir en orden</button></span></div>
                <div class="tr-lista" data-c="rollos"></div>
                <div data-c="pegar"><label>No hay rollos anotados: poné los metros de cada rollo, separados por espacios</label><textarea rows="2" data-c="metros" placeholder="61 52 64 60 60 49 71 50"></textarea>
                    ${partidas.length ? `<label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" data-c="guardar" checked> Anotar estos rollos en la tela ${esc(partidas[0].codigo)}</label>` : ''}</div>
                <div class="tr-tit"><span>3. Datos del nombre</span></div>
                <div class="tr-g">
                    <div><label>Máximo por tirada (m)</label><input type="number" data-c="max" value="${esc(ajustes.tirada_max)}"></div>
                    <div><label>Artículo</label><input type="text" data-c="articulo" value="${esc(((datos.telas || [])[0] || {}).tela || (partidas[0] || {}).tela || '')}"></div>
                    <div><label>Perfil</label><input type="text" data-c="perfil" placeholder="V-V 3P" value="${esc(recordado('perfil'))}"></div>
                    <div><label>Ruta</label><select data-c="ruta"><option>Solo Calandrado</option><option ${t.lleva_corte ? 'selected' : ''}>Calandrado + Corte Láser</option></select></div>
                    <div><label>Muestra de cada diseño (m)</label><input type="number" data-c="muestra" min="0" step="0.1" value="0" title="0 = sin muestra"></div>
                </div>
                <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" data-c="condis"> Poner el nombre del diseño en el archivo</label>
                <div class="tr-tit"><span>4. Lo que se va a crear <small>(tocá un nombre para cambiarlo)</small></span><button type="button" class="tr-btn" data-c="renombrar" hidden>↺ Volver a los nombres automáticos</button></div>
                <div class="tr-lista" data-c="plan"></div><div class="tr-res" data-c="res"></div>
            </div>`;
            const q = (c) => zona.querySelector(`[data-c="${c}"]`);
            const usados = () => estado.disenos.map((d, i) => ({ ...d, i })).filter(d => d.usar);
            const maximo = () => Number(q('max').value) || 126;
            const continuo = () => !/corte/i.test(q('ruta').value);
            const anchoTela = () => { const r = estado.rollos.find(x => x.usar); return r ? anchos[r.partida_id] : null; };

            const juicio = (d) => {
                const info = d.local || { ancho_px: d.ancho_px, alto_px: d.alto_px, dpi: d.dpi, formato: (String(d.nombre).split('.').pop() || '').toUpperCase() };
                return window.vgRevisarImagen ? window.vgRevisarImagen.juzgar(info, { papel: PAPEL, tela: anchoTela(), continuo: continuo() }) : { estado: 'ok', errores: [], avisos: [] };
            };
            const pintarDisenos = () => {
                q('disenos').innerHTML = estado.disenos.map((d, i) => {
                    const j = juicio(d);
                    const medida = j.ancho_cm ? `${num(j.ancho_cm)} × ${num(j.alto_cm)} cm · ${num(d.local ? d.local.dpi : d.dpi)} ppp` : 'sin medidas';
                    const chip = j.estado === 'mal' ? '<span class="tr-chip tr-err">no va</span>' : j.estado === 'aviso' ? '<span class="tr-chip tr-aviso">ojo</span>' : '<span class="tr-chip tr-ok">ok</span>';
                    return `<div class="tr-d"><input type="checkbox" data-usar="${i}" ${d.usar ? 'checked' : ''}>
                        <div><input type="text" data-titulo="${i}" value="${esc(d.titulo)}" ${d.usar ? '' : 'disabled'}>
                            <small>${esc(d.nombre)} · ${medida}${chip}${d.local ? ' · revisado en esta PC' : ''}</small>
                            ${j.errores.concat(j.avisos).map(x => `<small class="${j.errores.includes(x) ? 'tr-err' : 'tr-aviso'}">• ${esc(x)}</small>`).join('')}</div></div>`;
                }).join('');
            };
            const pintarRollos = () => {
                const us = usados();
                if (!estado.rollos.length) { q('rollos').style.display = 'none'; q('pegar').style.display = ''; return; }
                q('pegar').style.display = 'none';
                let anterior = null;
                // Con rollos apartados se muestran esos (y los marcados); los demás, con un toque
                const visible = (r) => estado.verTodos || !hayApartados || apartados.has(r.rollo_id) || r.usar;
                const ocultos = estado.rollos.filter(r => !visible(r)).length;
                q('rollos').innerHTML = estado.rollos.map((r, i) => {
                    if (!visible(r)) return '';
                    const cab =anterior !== r.partida_id ? `<div class="tr-t" style="background: var(--vg-bg-app);"><b>${esc([r.codigo, r.tela, r.color].filter(Boolean).join(' · '))}</b><small>${r.lugar ? '📍 ' + esc(r.lugar) : ''}</small></div>` : '';
                    anterior = r.partida_id;
                    return cab + `<div class="tr-r"><input type="checkbox" data-rollo="${i}" ${r.usar ? 'checked' : ''}>
                        <span>Rollo ${esc(r.numero)} · ${num(r.metros)} m${apartados.has(r.rollo_id) ? ' <small>(apartado)</small>' : ''}</span>
                        <select data-dis="${i}" ${r.usar && us.length > 1 ? '' : 'disabled'}>${us.map(d => `<option value="${d.i}" ${r.diseno === d.i ? 'selected' : ''}>${esc(d.titulo)}</option>`).join('')}</select></div>`;
                }).join('') + (ocultos ? `<div class="tr-t"><button type="button" class="tr-btn" data-c="vertodos">Ver los otros ${ocultos} rollos de la tela</button></div>` : '');
                const b = q('vertodos');
                if (b) b.onclick = () => { estado.verTodos = true; pintarRollos(); };
            };
            // Reparte los rollos marcados entre los diseños, en orden: N rollos para cada uno
            const repartirEnOrden = () => {
                const us = usados();
                const marcados = estado.rollos.filter(r => r.usar);
                if (!us.length || !marcados.length) return;
                const por = Math.max(1, Number(q('por').value) || Math.ceil(marcados.length / us.length));
                marcados.forEach((r, k) => { r.diseno = us[Math.min(us.length - 1, Math.floor(k / por))].i; });
            };
            const rollosPegados = () => (String(q('metros').value).match(/\d+(?:[.,]\d+)?/g) || []).map((x, i) => ({ numero: i + 1, metros: Number(x.replace(',', '.')),
                partida_id: (partidas[0] || {}).partida_id || null, color: (partidas[0] || {}).color || '' })).filter(r => r.metros > 0);
            const limpio = (t) => String(t || '').toUpperCase().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
            const cifra = (n) => String(Math.round(Number(n) * 100) / 100);
            const nombreArchivo = (x, d) => {
                const cliente = limpio(String(t.cliente || '').replace(/\s*\(.*$/, ''));
                const partes = [q('articulo').value, x.color, q('condis').checked ? d.titulo : ''].map(limpio).filter(Boolean).map(p => `(${p})`).join('');
                const perfil = limpio(q('perfil').value);
                return `${cliente} ${partes} ${String(x.numero).padStart(2, '0')} (${limpio(x.rollosTexto)}) ${cifra(x.largo)} X ${x.reps} (${cifra(x.largo * x.reps)} MTS)${perfil ? `(${perfil})` : ''}`.replace(/\s+/g, ' ').trim();
            };
            const pintarPlan = () => {
                const us = usados();
                const max = maximo();
                let lista = estado.rollos.length ? estado.rollos.filter(r => r.usar) : rollosPegados();
                if (!estado.rollos.length) {
                    // Pegados: se reparten en orden igual que los anotados
                    const por = Math.max(1, Number(q('por').value) || Math.ceil(lista.length / Math.max(us.length, 1)));
                    lista = lista.map((r, k) => ({ ...r, diseno: us.length ? us[Math.min(us.length - 1, Math.floor(k / por))].i : 0 }));
                }
                const valido = new Set(us.map(d => d.i));
                lista = lista.map(r => ({ ...r, diseno: valido.has(r.diseno) ? r.diseno : (us[0] || {}).i }));
                const plan = us.length ? armar(lista, max) : [];
                // Muestras: un pedazo de cada diseño, antes que todo
                const m = Number(q('muestra').value) || 0;
                const muestras = m > 0 ? us.map(d => ({ muestra: true, diseno: d.i, metros: m, rollos: [], color: (lista[0] || {}).color || '', partida_id: (lista[0] || {}).partida_id || null })) : [];
                estado.plan = muestras.concat(plan);
                let n = 0, nm = 0;
                estado.plan.forEach(x => {
                    const d = estado.disenos[x.diseno] || {};
                    x.numero = x.muestra ? 'M' + (++nm) : String(++n);
                    x.largo = x.muestra ? x.metros : 1;
                    x.reps = x.muestra ? 1 : Math.ceil(x.metros);
                    x.rollosTexto = x.muestra ? 'MUESTRA' : textoRollos(x);
                    x.clave = `${x.numero}|${x.diseno}|${x.rollosTexto}`;
                    x.auto = nombreArchivo(x, d);
                    x.nombre = estado.nombres[x.clave] || x.auto;
                });
                q('plan').innerHTML = estado.plan.map((x, i) => {
                    const d = estado.disenos[x.diseno] || {};
                    const pasa = !x.muestra && x.metros > max;
                    return `<div class="tr-t ${pasa ? 'tr-mal' : ''}" style="display:block;"><div class="tr-fila" style="justify-content:space-between;"><span><b>${x.muestra ? 'Muestra' : 'Tirada'} ${esc(x.numero)}</b> · ${esc(d.titulo || '')}${x.muestra ? '' : ' · ' + esc(x.rollosTexto)}</span>
                        <b>${num(x.metros)} m${pasa ? ' · un rollo solo pasa el máximo' : ''}</b></div>
                        <input type="text" class="tr-nombre" data-nombre="${i}" value="${esc(x.nombre)}" style="margin-top:5px; ${estado.nombres[x.clave] ? 'border-color: var(--vg-brand-primary);' : ''}"></div>`;
                }).join('') || '<div class="tr-t">Marcá al menos un diseño y sus rollos.</div>';
                q('renombrar').hidden = !Object.keys(estado.nombres).length;
                const total = estado.plan.reduce((a, x) => a + x.metros, 0);
                const malos = us.filter(d => juicio(d).estado === 'mal').length;
                q('res').innerHTML = estado.plan.length ? `${estado.plan.length} archivo${estado.plan.length === 1 ? '' : 's'} · ${num(total)} m${malos ? ` · <span class="tr-err">${malos} diseño${malos === 1 ? '' : 's'} con problemas</span>` : ''}` : '';
            };
            const todo = () => { pintarDisenos(); pintarRollos(); pintarPlan(); };
            if (!estado.rollos.some(r => r.usar)) estado.rollos.forEach(r => { r.usar = true; });
            q('por').value = Math.max(1, Math.ceil(Math.max(estado.rollos.filter(r => r.usar).length, 1) / Math.max(usados().length, 1)));
            repartirEnOrden();
            todo();

            zona.addEventListener('change', (e) => {
                const el = e.target;
                if (el.dataset.usar !== undefined) { estado.disenos[el.dataset.usar].usar = el.checked; q('por').value = Math.max(1, Math.ceil(estado.rollos.filter(r => r.usar).length / Math.max(usados().length, 1))); repartirEnOrden(); todo(); }
                else if (el.dataset.rollo !== undefined) { estado.rollos[el.dataset.rollo].usar = el.checked; repartirEnOrden(); todo(); }
                else if (el.dataset.dis !== undefined) { estado.rollos[el.dataset.dis].diseno = Number(el.value); pintarPlan(); }
                else if (el === q('ruta')) { pintarDisenos(); pintarPlan(); }
                else if (el === q('condis')) pintarPlan();
                else if (el === q('local')) revisarLocal(el.files);
            });
            zona.addEventListener('input', (e) => {
                const el = e.target;
                if (el.dataset.nombre !== undefined) {
                    const x = estado.plan[el.dataset.nombre];
                    const v = el.value.toUpperCase();
                    if (v.trim() && v.trim() !== x.auto) estado.nombres[x.clave] = v; else delete estado.nombres[x.clave];
                    x.nombre = estado.nombres[x.clave] || x.auto;
                    el.style.borderColor = estado.nombres[x.clave] ? 'var(--vg-brand-primary)' : '';
                    q('renombrar').hidden = !Object.keys(estado.nombres).length;
                    return;
                }
                if (el.dataset.titulo !== undefined) { estado.disenos[el.dataset.titulo].titulo = el.value.toUpperCase(); pintarPlan(); pintarRollosSinFoco(); }
                else if (el === q('max') || el === q('muestra') || el === q('metros') || el === q('articulo') || el === q('perfil')) pintarPlan();
            });
            const pintarRollosSinFoco = () => { zona.querySelectorAll('[data-dis] option').forEach(o => { const d = estado.disenos[o.value]; if (d) o.textContent = d.titulo; }); };
            q('renombrar').onclick = () => { estado.nombres = {}; pintarPlan(); };
            q('repartir').onclick = () => { repartirEnOrden(); pintarRollos(); pintarPlan(); };
            q('revisar').onclick = () => q('local').click();
            // La revisión completa, con los archivos de esta PC (la carpeta del Drive sincronizada): se buscan por el nombre
            async function revisarLocal(files) {
                if (!files || !files.length || !window.vgRevisarImagen) return;
                const boton = q('revisar');
                boton.disabled = true;
                const sinPar = [];
                try {
                    for (const f of files) {
                        const d = estado.disenos.find(x => String(x.nombre).toLowerCase() === String(f.name).toLowerCase());
                        if (!d) { sinPar.push(f.name); continue; }
                        boton.textContent = `Revisando ${f.name}…`;
                        try { d.local = await window.vgRevisarImagen.revisar(f); } catch (e) { d.local = { sin_medidas: true, formato: '?' }; }
                    }
                } finally { boton.disabled = false; boton.textContent = '🔍 Revisar en esta PC'; }
                todo();
                if (sinPar.length) avisar(`No están en la carpeta del trabajo: ${sinPar.join(', ')}. Elegí los mismos archivos que subiste.`, 'error');
            }
            return () => {
                if (!estado.plan.length) { avisar('Marcá al menos un diseño y sus rollos.', 'error'); return undefined; }
                const repetido = estado.plan.find((x, i) => estado.plan.findIndex(y => y.nombre.trim() === x.nombre.trim()) !== i);
                if (repetido) { avisar('Hay dos archivos con el mismo nombre: ' + repetido.nombre, 'error'); return undefined; }
                if (estado.plan.some(x => !x.nombre.trim())) { avisar('Hay un archivo sin nombre.', 'error'); return undefined; }
                return { max: maximo(), ruta: q('ruta').value, articulo: q('articulo').value, perfil: q('perfil').value,
                         anotar: !estado.rollos.length && !!(q('guardar') && q('guardar').checked), pegados: estado.rollos.length ? [] : rollosPegados() };
            };
        });
        if (!ok) return;
        pedido = ok;
        recordar('perfil', pedido.perfil);

        // Diseños con problemas: se avisa antes de crear
        const malos = estado.disenos.filter((d, i) => estado.plan.some(x => x.diseno === i)).filter(d => {
            const info = d.local || { ancho_px: d.ancho_px, alto_px: d.alto_px, dpi: d.dpi };
            return window.vgRevisarImagen && window.vgRevisarImagen.juzgar(info, { papel: PAPEL, continuo: !/corte/i.test(pedido.ruta) }).estado === 'mal';
        });
        if (malos.length && !(await window.vgDialogo.confirmar({ titulo: 'Hay diseños con problemas', peligro: true, aceptar: 'Crear igual',
            texto: `${malos.map(d => d.titulo).join(', ')}: revisalos antes de imprimir. ¿Creo los archivos igual?` }))) return;

        // El máximo, si lo cambiaron (necesita el permiso de configuración; si no, vale solo para esta vez)
        if (Number(pedido.max) !== Number(ajustes.tirada_max)) await db().rpc('taller_ajustes_guardar', { p: { tirada_max_m: pedido.max } });
        if (pedido.anotar && partidas[0]) {
            const { error } = await db().rpc('actualizar_partida', { p: { partida_id: partidas[0].partida_id, detalle_rollos: pedido.pegados.map(r => ({ metros: r.metros })), motivo: 'Rollos anotados al armar las tiradas' } });
            if (error) avisar('Los rollos no se anotaron: ' + errorTexto(error), 'error');
        }
        const archivos = estado.plan.map(x => {
            const d = estado.disenos[x.diseno];
            const ext = (String(d.nombre).match(/\.[A-Za-z0-9]{2,4}$/) || ['.jpg'])[0];
            return { file_id: d.file_id, nombre: 'base' + ext, modulo: 'SUBLIMACION', ruta: pedido.ruta, largo: x.largo, reps: x.reps,
                nombre_final: x.nombre.trim(),
                tirada: { numero: x.numero, rollos: x.rollosTexto, articulo: pedido.articulo, color: x.color || '', diseno: d.titulo, perfil: pedido.perfil },
                _x: x };
        });
        const nombres = archivos.map(a => a.nombre_final);
        if (!terminal || estado.disenos.some(d => d.prueba)) {
            await window.vgDialogo.ventana({ titulo: 'Versión de prueba: estos archivos se crearían', aceptar: 'Listo', ancho: '760px' }, (zona) => {
                zona.innerHTML = `<div class="tr-v">En esta prueba no hay Drive: en el sistema de verdad el ayudante copia cada diseño con estos nombres, y cada archivo queda con su tela y sus rollos.
                    <div class="tr-lista">${nombres.map(n => `<div class="tr-t tr-nombre">${esc(n)}</div>`).join('')}</div>
                    <div class="tr-fila" style="margin-top:10px;"><button type="button" class="tr-btn" data-hoja>📄 Hoja para el taller</button></div></div>`;
                zona.querySelector('[data-hoja]').onclick = () => hoja(t, archivos, nombres, reservaDe);
                return () => true;
            });
            return;
        }
        const r = await db().rpc('carpeta_pedir', { p: { tipo: 'imprimir', trabajo_id: t.id, archivos: archivos.map(({ _x, ...a }) => a) } });
        if (r.error) { avisar(errorTexto(r.error), 'error'); return; }
        const hecho = await esperar(r.data.pedido, `Creando ${archivos.length} archivo(s) en la fila…`);
        if (!hecho) return;
        const problemas = await enlazar(t, archivos, (hecho.resultado && hecho.resultado.copias) || []);
        await window.vgDialogo.ventana({ titulo: `✅ ${archivos.length} archivo(s) en la fila`, aceptar: 'Listo', ancho: '560px' }, (zona) => {
            zona.innerHTML = `<div class="tr-v">Quedaron enlazados a ${esc(t.tarjeta)}, cada uno con su tela y sus rollos.${problemas ? `<div class="tr-err" style="margin-top:6px;">${esc(problemas)}</div>` : ''}
                <div class="tr-fila" style="margin-top:12px;"><button type="button" class="tr-btn fuerte" data-hoja>📄 Hoja para el taller</button>${window.vgEtiquetas ? '<button type="button" class="tr-btn" data-etiq>🏷️ Etiquetas de los rollos</button>' : ''}</div></div>`;
            zona.querySelector('[data-hoja]').onclick = () => hoja(t, archivos, nombres, reservaDe);
            const e = zona.querySelector('[data-etiq]');
            if (e) e.onclick = () => window.vgEtiquetas.elegir({ trabajo_id: t.id });
            return () => true;
        });
        if (op.alTerminar) await op.alTerminar();
    }

    // Cada archivo nuevo de la fila queda con su tela y con los metros de cada rollo (de ahí salen el descuento al calandrar,
    // las etiquetas y la lista para separar). Devuelve un texto si algo no se pudo.
    async function enlazar(t, archivos, copias) {
        if (!copias.length) return 'El Drive no devolvió los archivos: asigná la tela desde la tarjeta.';
        const ids = copias.map(c => c.file_id);
        const { data: filas } = await db().from('prod_pendientes_drive').select('id, file_id').in('file_id', ids);
        const porFile = {};
        (filas || []).forEach(f => { porFile[f.file_id] = f.id; });
        const fallas = [];
        for (let i = 0; i < archivos.length; i++) {
            const x = archivos[i]._x, c = copias[i], fila = c && porFile[c.file_id];
            if (!fila || !x.partida_id) continue;
            const a = await db().rpc('tela_archivos_asignar', { p: { trabajo_id: t.id, partida_id: x.partida_id, archivos: [fila] } });
            if (a.error) { fallas.push(errorTexto(a.error)); continue; }
            const piezas = x.rollos.filter(r => r.rollo_id).map(r => ({ rollo_id: r.rollo_id, metros: r.metros }));
            if (piezas.length) {
                const g = await db().rpc('trabajo_rollos_guardar', { p: { trabajo_id: t.id, archivo_id: fila, piezas } });
                if (g.error) fallas.push(errorTexto(g.error));
            }
        }
        return fallas.length ? 'Algunos archivos quedaron sin tela o sin rollos: ' + [...new Set(fallas)].join(' · ') : '';
    }

    // La hoja para el operario: cada tirada con su diseño, sus rollos (y dónde están) y el nombre del archivo; el QR abre la
    // lista para separar los rollos en el celular.
    async function cargarScript(src, listo) {
        if (listo()) return;
        await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
    }
    async function qr(texto) {
        await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', () => !!window.QRCode);
        const caja = document.createElement('div');
        new window.QRCode(caja, { text: texto, width: 256, height: 256, correctLevel: window.QRCode.CorrectLevel.M });
        await dormir(50);
        const c = caja.querySelector('canvas');
        return c ? c.toDataURL('image/png') : null;
    }
    async function hoja(t, archivos, nombres, reservaDe) {
        try {
            await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => !!(window.jspdf && window.jspdf.jsPDF));
            const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
            const reservas = [...new Set(archivos.flatMap(a => a._x.rollos.map(r => reservaDe[r.rollo_id]).filter(Boolean)))];
            let y = 16;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
            doc.text(`${t.tarjeta} · ${t.cliente || ''}`, 12, y);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
            doc.text(`${t.titulo || ''} · ${new Date().toLocaleDateString('es-AR')} · ${archivos.length} archivo(s) · ${num(archivos.reduce((s, a) => s + a._x.metros, 0))} m`, 12, y + 6);
            if (reservas.length) {
                const img = await qr(`${location.origin}/separar.html?r=${encodeURIComponent(reservas[0])}`);
                if (img) { doc.addImage(img, 'PNG', 172, 6, 26, 26); doc.setFontSize(7); doc.text('Separar los rollos', 185, 35, { align: 'center' }); }
            }
            y = 40;
            archivos.forEach((a, i) => {
                const x = a._x;
                const alto = 8 + Math.max(1, Math.ceil(x.rollos.length / 4)) * 5 + 5;
                if (y + alto > 285) { doc.addPage(); y = 16; }
                doc.setDrawColor(150); doc.roundedRect(10, y - 5, 190, alto, 2, 2);
                doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
                doc.text(`${x.muestra ? 'Muestra' : 'Tirada'} ${a.tirada.numero} · ${a.tirada.diseno}`, 13, y + 1);
                doc.text(`${num(x.metros)} m`, 197, y + 1, { align: 'right' });
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                let yy = y + 7;
                if (x.rollos.length) {
                    x.rollos.forEach((r, k) => {
                        const col = k % 4;
                        if (k && col === 0) yy += 5;
                        // Un cuadradito para tildar a mano (el carácter ☐ no existe en la letra del PDF)
                        doc.rect(13 + col * 47, yy - 2.7, 2.8, 2.8);
                        doc.text(`Rollo ${r.numero} · ${num(r.metros)} m${r.lugar ? ' · ' + r.lugar : ''}`, 17 + col * 47, yy);
                    });
                } else doc.text('Muestra: un pedazo para aprobar', 13, yy);
                doc.setFontSize(7); doc.setTextColor(90);
                doc.text(doc.splitTextToSize(nombres[i], 184), 13, yy + 5);
                doc.setTextColor(0);
                y += alto + 4;
            });
            doc.save(`TIRADAS ${t.tarjeta} ${t.cliente || ''}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
        } catch (e) { avisar('No se pudo armar la hoja: ' + errorTexto(e), 'error'); }
    }

    window.vgTiradas = { usar: (c, o = {}) => { sb = c; terminal = o.terminal === undefined ? terminal : o.terminal; }, abrir, repartir, armar };
})();
