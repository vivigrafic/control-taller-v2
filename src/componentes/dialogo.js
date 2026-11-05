// Ventanas del sistema: reemplazan a confirm(), prompt() y alert() con el estilo de la marca (tokens --vg-*).
// Todas devuelven una promesa:
//   vgDialogo.elegir({ titulo, texto, opciones: [{ valor, titulo, detalle, icono }], elegida, aceptar, cancelar }) → valor o null
//   vgDialogo.casillas({ titulo, texto, opciones: [{ valor, titulo, detalle, marcada }], aceptar }) → [valores] o null
//   vgDialogo.confirmar({ titulo, texto, aceptar, cancelar, peligro }) → true / false   (o un texto: primer párrafo = título)
//   vgDialogo.escribir('¿Por qué se anula?', valor, { obligatorio }) → texto o null   (en lugar de prompt)
//   vgDialogo.pedir({ titulo, texto, campos: [{ nombre, etiqueta, valor, tipo, ayuda, opciones }], aceptar }) → { nombre: valor } o null
//   vgDialogo.avisar(texto, 'ok' | 'error') → cartel que se va solo
//   vgDialogo.ventana({ titulo, texto, aceptar, ancho }, (zona) => leer) → ventana libre: armar(zona) pinta adentro y devuelve
//       una función que lee la respuesta (undefined = falta algo, la ventana sigue abierta)
// La opción recomendada va primero y ya elegida: alcanza con "Aceptar" (o Enter). Escape cancela.
(function () {
    if (window.vgDialogo) return;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const css = `
    .vgd-fondo { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 16px;
        background: color-mix(in srgb, var(--vg-bg-app) 70%, transparent); backdrop-filter: blur(4px); animation: vgd-entra .12s ease-out; }
    .vgd-caja { width: 100%; max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; border-radius: 16px;
        background: linear-gradient(var(--vg-surface-panel, var(--vg-bg-app)), var(--vg-surface-panel, var(--vg-bg-app))), var(--vg-bg-app);
        border: 1px solid var(--vg-surface-border); color: var(--vg-text-primary);
        font-family: var(--vg-font-sans); box-shadow: 0 24px 60px color-mix(in srgb, var(--vg-bg-app) 80%, transparent); }
    .vgd-caja, .vgd-caja * { box-sizing: border-box; }
    .vgd-cab { padding: 20px 22px 6px; }
    .vgd-cab h3 { margin: 0; font-size: 18px; font-weight: 800; }
    .vgd-cab p { margin: 8px 0 0; color: var(--vg-text-secondary); font-size: 14px; line-height: 1.45; white-space: pre-line; max-height: 50vh; overflow-y: auto; }
    .vgd-cuerpo { padding: 12px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .vgd-op { display: flex; align-items: flex-start; gap: 12px; width: 100%; text-align: left; padding: 12px 14px; border-radius: 12px; cursor: pointer;
        border: 1px solid var(--vg-surface-border); background: var(--vg-surface-base); color: var(--vg-text-primary); font: inherit; }
    .vgd-op:hover { border-color: var(--vg-brand-primary); }
    .vgd-op.elegida { border-color: var(--vg-brand-primary); background: var(--vg-brand-glow); }
    .vgd-op input { margin-top: 3px; accent-color: var(--vg-brand-primary); width: 18px; height: 18px; flex-shrink: 0; }
    .vgd-op .vgd-ico { font-size: 20px; line-height: 1; margin-top: 1px; }
    .vgd-op b { display: block; font-size: 15px; }
    .vgd-op small { display: block; margin-top: 3px; color: var(--vg-text-secondary); font-size: 13px; }
    .vgd-tarjetas { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .vgd-tarjetas .vgd-op { flex-direction: column; align-items: center; text-align: center; padding: 18px 12px; }
    .vgd-tarjetas .vgd-op input { display: none; }
    .vgd-tarjetas .vgd-op .vgd-ico { font-size: 30px; }
    .vgd-campo { display: flex; flex-direction: column; gap: 6px; }
    .vgd-campo label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--vg-text-secondary); }
    .vgd-campo input, .vgd-campo select, .vgd-campo textarea { padding: 11px 12px; border-radius: 10px; border: 1px solid var(--vg-surface-border);
        background: var(--vg-surface-base); color: var(--vg-text-primary); font: 15px var(--vg-font-sans); }
    .vgd-campo input:focus, .vgd-campo select:focus, .vgd-campo textarea:focus { outline: none; border-color: var(--vg-brand-primary); }
    .vgd-campo small { color: var(--vg-text-secondary); font-size: 12px; }
    .vgd-pie { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px 20px; flex-wrap: wrap; }
    .vgd-btn { padding: 11px 20px; border-radius: 10px; font: 700 14px var(--vg-font-sans); cursor: pointer;
        border: 1px solid var(--vg-surface-border); background: transparent; color: var(--vg-text-primary); }
    .vgd-btn.si { background: var(--vg-brand-primary); border-color: var(--vg-brand-primary); color: var(--vg-text-primary); }
    .vgd-btn.peligro { background: var(--vg-status-alert); border-color: var(--vg-status-alert); }
    .vgd-btn:disabled { opacity: .5; cursor: default; }
    .vgd-aviso { position: fixed; top: 16px; right: 16px; z-index: 2147483001; max-width: 380px; padding: 12px 16px; border-radius: 12px;
        background: var(--vg-surface-panel, var(--vg-bg-app)); border: 1px solid var(--vg-status-ready); color: var(--vg-text-primary);
        font: 600 14px var(--vg-font-sans); box-shadow: 0 10px 30px color-mix(in srgb, var(--vg-bg-app) 70%, transparent); animation: vgd-entra .15s ease-out; }
    .vgd-aviso.error { border-color: var(--vg-status-alert); }
    @keyframes vgd-entra { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @media (max-width: 600px) {
        .vgd-fondo { align-items: flex-end; padding: 0; }
        .vgd-caja { max-width: none; border-radius: 16px 16px 0 0; max-height: 92vh; }
        .vgd-pie .vgd-btn { flex: 1; }
    }`;

    function ponerEstilos() {
        if (document.getElementById('vgd-estilos')) return;
        const s = document.createElement('style');
        s.id = 'vgd-estilos';
        s.textContent = css;
        document.head.appendChild(s);
    }

    // Arma la ventana; cuerpo(caja) devuelve una función que lee la respuesta (o undefined si falta algo)
    function abrir({ titulo, texto, aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false, sinCancelar = false, ancho = null }, cuerpo) {
        ponerEstilos();
        return new Promise((resolver) => {
            const fondo = document.createElement('div');
            fondo.className = 'vgd-fondo';
            fondo.innerHTML = `<div class="vgd-caja" role="dialog" aria-modal="true">
                <div class="vgd-cab"><h3>${esc(titulo || '')}</h3>${texto ? `<p>${esc(texto)}</p>` : ''}</div>
                <div class="vgd-cuerpo"></div>
                <div class="vgd-pie">
                    ${sinCancelar ? '' : `<button type="button" class="vgd-btn no">${esc(cancelar)}</button>`}
                    <button type="button" class="vgd-btn si ${peligro ? 'peligro' : ''}">${esc(aceptar)}</button>
                </div></div>`;
            const zona = fondo.querySelector('.vgd-cuerpo');
            if (ancho) fondo.querySelector('.vgd-caja').style.maxWidth = ancho;
            const leer = cuerpo ? cuerpo(zona) : () => true;
            if (!zona.children.length) zona.remove();
            const cerrar = (valor) => { document.removeEventListener('keydown', teclas, true); fondo.remove(); resolver(valor); };
            const ok = () => { const v = leer(); if (v !== undefined) cerrar(v); };
            const teclas = (e) => {
                const abiertas = document.querySelectorAll('.vgd-fondo');
                if (abiertas[abiertas.length - 1] !== fondo) return;   // con dos ventanas abiertas, las teclas son de la de arriba
                if (e.key === 'Escape') { e.preventDefault(); cerrar(null); }
                if (e.key === 'Enter' && e.target && e.target.closest && e.target.closest('[data-sin-enter]')) { e.preventDefault(); return; }   // un buscador adentro de la ventana
                if (e.key === 'Enter' && !(e.target && e.target.tagName === 'TEXTAREA')) { e.preventDefault(); ok(); }
            };
            fondo.querySelector('.si').onclick = ok;
            const no = fondo.querySelector('.no');
            if (no) no.onclick = () => cerrar(null);
            fondo.addEventListener('mousedown', (e) => { if (e.target === fondo && !sinCancelar) cerrar(null); });
            document.addEventListener('keydown', teclas, true);
            document.body.appendChild(fondo);
            const foco = fondo.querySelector('.vgd-cuerpo input:not([type=radio]):not([type=checkbox]), .vgd-cuerpo select, .vgd-cuerpo textarea') || fondo.querySelector('.si');
            setTimeout(() => foco && foco.focus(), 30);
        });
    }

    function opcionesHtml(opciones, tipo, nombre) {
        return opciones.map((o, i) => `<label class="vgd-op" data-i="${i}">
            <input type="${tipo}" name="${nombre}" value="${i}" ${o.marcada ? 'checked' : ''}>
            ${o.icono ? `<span class="vgd-ico">${esc(o.icono)}</span>` : ''}
            <span><b>${esc(o.titulo)}</b>${o.detalle ? `<small>${esc(o.detalle)}</small>` : ''}</span></label>`).join('');
    }

    function marcarElegidas(zona) {
        zona.querySelectorAll('.vgd-op').forEach(l => l.classList.toggle('elegida', l.querySelector('input').checked));
    }

    // Un texto largo de las preguntas viejas: el primer párrafo es el título y el resto la explicación
    const PELIGRO = /anul|elimin|borr|papelera/i;
    function partir(texto) {
        const t = String(texto ?? '').trim();
        const i = t.indexOf('\n\n');
        return i < 0 ? { titulo: t } : { titulo: t.slice(0, i).trim(), texto: t.slice(i + 2).trim() };
    }

    window.vgDialogo = {
        elegir(cfg) {
            const ops = (cfg.opciones || []).map((o, i) => ({ ...o, marcada: cfg.elegida !== undefined ? o.valor === cfg.elegida : i === 0 }));
            return abrir(cfg, (zona) => {
                const tarjetas = cfg.tarjetas ?? (ops.length <= 3 && ops.every(o => o.icono));
                zona.innerHTML = `<div class="${tarjetas ? 'vgd-tarjetas' : ''}" style="display:${tarjetas ? 'grid' : 'flex'};flex-direction:column;gap:8px;">${opcionesHtml(ops, 'radio', 'vgd-op')}</div>`;
                marcarElegidas(zona);
                zona.addEventListener('change', () => marcarElegidas(zona));
                // En tarjetas, tocar una ya la elige y acepta
                if (tarjetas) zona.querySelectorAll('.vgd-op').forEach(l => l.addEventListener('dblclick', () => zona.closest('.vgd-caja').querySelector('.si').click()));
                return () => {
                    const r = zona.querySelector('input:checked');
                    return r ? ops[Number(r.value)].valor : undefined;
                };
            });
        },
        casillas(cfg) {
            const ops = cfg.opciones || [];
            return abrir(cfg, (zona) => {
                zona.innerHTML = opcionesHtml(ops, 'checkbox', 'vgd-cas');
                marcarElegidas(zona);
                zona.addEventListener('change', () => marcarElegidas(zona));
                return () => [...zona.querySelectorAll('input:checked')].map(c => ops[Number(c.value)].valor);
            });
        },
        confirmar(cfg) {
            if (typeof cfg === 'string') cfg = { ...partir(cfg), peligro: PELIGRO.test(cfg) };
            return abrir({ aceptar: 'Sí', ...cfg }).then(v => v === true);
        },
        // En lugar de prompt(): la pregunta como texto (el primer párrafo es el título; si el último termina en ":", es
        // la etiqueta del campo). Devuelve lo escrito o null si cancela.
        escribir(pregunta, valor = '', { obligatorio = false, aceptar, tipo = 'text' } = {}) {
            const p = partir(pregunta);
            let etiqueta = '';
            const parrafos = String(p.texto || '').split('\n\n');
            if (/:\s*$/.test(parrafos[parrafos.length - 1] || '')) { etiqueta = parrafos.pop().replace(/:\s*$/, ''); p.texto = parrafos.join('\n\n'); }
            const anula = PELIGRO.test(pregunta);
            return window.vgDialogo.pedir({ ...p, peligro: anula, aceptar: aceptar || (anula ? 'Anular' : 'Aceptar'),
                campos: [{ nombre: 'v', etiqueta: etiqueta || (/motivo|por qué/i.test(pregunta) ? 'Motivo' : 'Respuesta'), valor, tipo, obligatorio }] })
                .then(r => (r ? r.v : null));
        },
        pedir(cfg) {
            const campos = cfg.campos || [];
            return abrir(cfg, (zona) => {
                zona.innerHTML = campos.map((c, i) => {
                    const id = `vgd-c${i}`;
                    let control;
                    if (c.opciones) control = `<select id="${id}">${c.opciones.map(o => `<option value="${esc(o.valor)}" ${String(o.valor) === String(c.valor ?? '') ? 'selected' : ''}>${esc(o.titulo)}</option>`).join('')}</select>`;
                    else if (c.tipo === 'textarea') control = `<textarea id="${id}" rows="3">${esc(c.valor ?? '')}</textarea>`;
                    else control = `<input id="${id}" type="${c.tipo || 'text'}" value="${esc(c.valor ?? '')}" ${c.placeholder ? `placeholder="${esc(c.placeholder)}"` : ''} ${c.lista ? `list="${esc(c.lista)}" autocomplete="off"` : ''}>`;
                    return `<div class="vgd-campo"><label for="${id}">${esc(c.etiqueta)}</label>${control}${c.ayuda ? `<small>${esc(c.ayuda)}</small>` : ''}</div>`;
                }).join('');
                return () => {
                    const r = {};
                    for (let i = 0; i < campos.length; i++) {
                        const el = zona.querySelector(`#vgd-c${i}`);
                        const v = el.value.trim();
                        if (campos[i].obligatorio && !v) { el.focus(); return undefined; }
                        r[campos[i].nombre] = v;
                    }
                    return r;
                };
            });
        },
        ventana(cfg, armar) { return abrir(cfg, armar); },
        avisar(texto, tipo = 'ok') {
            ponerEstilos();
            const d = document.createElement('div');
            d.className = 'vgd-aviso' + (tipo === 'error' ? ' error' : '');
            d.textContent = texto;
            document.body.appendChild(d);
            setTimeout(() => d.remove(), tipo === 'error' ? 6000 : 3500);
        }
    };
})();
