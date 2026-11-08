// Varias máquinas (09/11/2026): en qué plotter, impresora DTF, calandra o láser se trabaja en esta PC.
// Las máquinas se cargan en el sistema (Configuración del taller → Máquinas). Si hay UNA sola de un tipo, no se pregunta
// nada y no se anota (es esa). Si hay varias, se pregunta una vez en esta PC y queda recordada; abajo a la izquierda
// aparece "Máquinas de esta PC" para cambiarla.
//   await VG_MAQUINAS.cargar(cliente)
//   const id = await VG_MAQUINAS.pedir('plotter_sublimacion')   → id de la máquina (o null si hay una sola)
(function () {
    const NOMBRES = { plotter_sublimacion: 'plotter de sublimación', impresora_dtf: 'impresora DTF', calandra: 'calandra', laser: 'láser' };
    let lista = [];
    const guardada = (tipo) => { try { return localStorage.getItem('vg_maquina_' + tipo); } catch (e) { return null; } };
    const guardar = (tipo, id) => { try { localStorage.setItem('vg_maquina_' + tipo, id); } catch (e) { /* sin almacenamiento */ } };
    const deTipo = (tipo) => lista.filter(m => m.tipo === tipo && m.activo);
    const varias = (tipo) => deTipo(tipo).length > 1;

    async function elegir(tipo) {
        const ms = deTipo(tipo);
        const actual = guardada(tipo);
        const id = await window.vgDialogo.elegir({
            titulo: `¿En qué ${NOMBRES[tipo] || 'máquina'} trabajás en esta PC?`,
            texto: 'Queda recordado en esta PC. Lo cambiás cuando quieras con "Máquinas de esta PC", abajo a la izquierda.',
            opciones: ms.map(m => ({ valor: m.id, titulo: m.nombre, detalle: [m.marca_modelo, m.ancho_cm ? m.ancho_cm + ' cm' : ''].filter(Boolean).join(' · ') })),
            elegida: ms.some(m => m.id === actual) ? actual : ms[0].id, aceptar: 'Esta'
        });
        if (id) guardar(tipo, id);
        pintarBoton();
        return id;
    }

    function pintarBoton() {
        let b = document.getElementById('vg-maquinas-pc');
        const tipos = Object.keys(NOMBRES).filter(varias);
        if (!tipos.length) { if (b) b.remove(); return; }
        if (!b) {
            b = document.createElement('button');
            b.id = 'vg-maquinas-pc';
            b.type = 'button';
            b.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9000;padding:6px 10px;border-radius:8px;border:1px solid var(--vg-surface-border);'
                + 'background:var(--vg-surface-base);color:var(--vg-text-primary);font:600 12px var(--vg-font-sans, sans-serif);cursor:pointer';
            b.addEventListener('click', async () => {
                const tipo = tipos.length === 1 ? tipos[0] : await window.vgDialogo.elegir({ titulo: 'Máquinas de esta PC', aceptar: 'Cambiar',
                    opciones: tipos.map(t => ({ valor: t, titulo: NOMBRES[t], detalle: (lista.find(m => m.id === guardada(t)) || {}).nombre || 'sin elegir' })) });
                if (tipo) await elegir(tipo);
            });
            document.body.appendChild(b);
        }
        b.textContent = '🖨️ ' + tipos.map(t => (lista.find(m => m.id === guardada(t)) || {}).nombre || ('¿' + NOMBRES[t] + '?')).join(' · ');
    }

    window.VG_MAQUINAS = {
        async cargar(cliente) {
            try {
                const { data, error } = await cliente.rpc('maquinas_lista', { p_tipo: null, p_todas: false });
                lista = error ? [] : (data || []);
            } catch (e) { lista = []; }   // base sin máquinas todavía: todo como antes
            pintarBoton();
        },
        varias,
        // La máquina para este paso: null si hay una sola (no se anota); si hay varias, la de esta PC (o se pregunta)
        async pedir(tipo) {
            if (!varias(tipo)) return null;
            const id = guardada(tipo);
            if (id && deTipo(tipo).some(m => m.id === id)) return id;
            return elegir(tipo);
        }
    };
})();
