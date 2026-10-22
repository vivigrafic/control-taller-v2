// Agrega un botón con un ojo a cada campo de contraseña, para ver lo que se escribe.
// Copia de src/componentes/ver_clave.js del sistema. Uso: <script src="./src/ver_clave.js"></script> en cualquier página (usa los íconos de Font Awesome).
(function () {
    const estilo = document.createElement('style');
    estilo.textContent = `
        .vg-clave-caja { position: relative; display: block; }
        .vg-clave-caja input { padding-right: 44px !important; }
        .vg-clave-ojo {
            position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
            background: none; border: none; cursor: pointer; padding: 6px 8px; font-size: 15px; line-height: 1;
            color: var(--vg-text-secondary);
        }
        .vg-clave-ojo:hover, .vg-clave-ojo:focus-visible { color: var(--vg-text-primary); }
    `;
    document.head.appendChild(estilo);

    function preparar(input) {
        if (input.dataset.vgOjo) return;
        input.dataset.vgOjo = '1';
        const caja = document.createElement('span');
        caja.className = 'vg-clave-caja';
        input.parentNode.insertBefore(caja, input);
        caja.appendChild(input);

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'vg-clave-ojo';
        const pintar = () => {
            const visible = input.type === 'text';
            // El taller no carga la librería de íconos del sistema: el ojo va dibujado acá
            boton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>
                ${visible ? '<line x1="3" y1="3" x2="21" y2="21"></line>' : ''}</svg>`;
            boton.title = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
            boton.setAttribute('aria-label', boton.title);
        };
        boton.addEventListener('click', () => {
            input.type = input.type === 'password' ? 'text' : 'password';
            pintar();
            input.focus();
        });
        // Al enviar el formulario, la contraseña vuelve a quedar oculta
        if (input.form) input.form.addEventListener('submit', () => { input.type = 'password'; pintar(); });
        pintar();
        caja.appendChild(boton);
    }

    const prepararTodos = () => document.querySelectorAll('input[type="password"]').forEach(preparar);
    window.vgOjitoClaves = prepararTodos; // para los formularios que se arman después
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepararTodos);
    else prepararTodos();
})();
