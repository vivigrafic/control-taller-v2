// ============================================================================
// ACCESO AL CONTROL DE TALLER
// El equipo (la PC o la tablet del taller, o un celular) entra UNA sola vez con un usuario del sistema que tenga el
// permiso "taller" (por ejemplo el usuario "taller", rol Producción). La sesión queda guardada en ese equipo.
// Después, cada persona elige su nombre arriba (sin PIN) y lo que hace queda con su nombre (cabecera x-operario).
// Sin usuario no se puede leer ni tocar nada: lo exige la base (permisos de las tablas prod_*).
// Se carga después de supabase-js y de src/config/conexion.js, y antes de src/app.js.
// ============================================================================
(function () {
  const sb = window.vgSupabase;
  if (!sb) { console.warn("acceso.js: falta la conexión (src/config/conexion.js)"); return; }

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const estilo = document.createElement("style");
  estilo.textContent = `
    .vg-acceso { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 16px;
      background: var(--vg-bg-app); color: var(--vg-text-primary); font-family: var(--vg-font-sans); box-sizing: border-box; }
    .vg-acceso form, .vg-acceso .caja { width: 100%; max-width: 380px; border: 1px solid var(--vg-surface-border); border-radius: 16px; padding: 24px;
      background: var(--vg-surface-base); box-sizing: border-box; }
    .vg-acceso h2 { margin: 0 0 6px; font-size: 20px; }
    .vg-acceso p { color: var(--vg-text-secondary); font-size: 14px; line-height: 1.45; margin: 0 0 14px; }
    .vg-acceso label { display: block; font-size: 13px; color: var(--vg-text-secondary); margin: 12px 0 6px; }
    .vg-acceso input { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 10px; font-size: 16px;
      border: 1px solid var(--vg-surface-border); background: var(--vg-bg-app); color: var(--vg-text-primary); }
    .vg-acceso button { width: 100%; margin-top: 18px; padding: 14px; border-radius: 10px; border: none; font-size: 16px; font-weight: 700;
      cursor: pointer; background: var(--vg-brand-primary); color: var(--vg-text-primary); }
    .vg-acceso .mensaje { color: var(--vg-status-alert); font-size: 14px; margin-top: 12px; }
    .vg-equipo { position: fixed; right: 10px; bottom: 8px; z-index: 50; font: 12px var(--vg-font-sans); color: var(--vg-text-secondary);
      background: var(--vg-bg-app); border: 1px solid var(--vg-surface-border); border-radius: 999px; padding: 4px 10px; opacity: 0.85; }
    .vg-equipo a { color: var(--vg-brand-secondary); cursor: pointer; text-decoration: none; margin-left: 8px; }
  `;
  document.head.appendChild(estilo);

  function capa(html) {
    const d = document.createElement("div");
    d.className = "vg-acceso";
    d.innerHTML = html;
    const poner = () => document.body.appendChild(d);
    if (document.body) poner(); else document.addEventListener("DOMContentLoaded", poner);
    return d;
  }

  async function mostrarEntrada(motivo) {
    let est = null;
    try { est = (await sb.rpc("estado_usuarios")).data; } catch (e) { /* sin conexión: se usa el dominio de siempre */ }
    const dominio = (est && est.dominio) || "usuarios.invalid";
    const d = capa(`<form autocomplete="on">
        <h2>Control de taller</h2>
        <p>Este equipo tiene que entrar una sola vez con un usuario del sistema (por ejemplo, el del taller). Después queda abierto.</p>
        <label for="vgUsuario">Usuario</label><input id="vgUsuario" autocomplete="username" autocapitalize="none" spellcheck="false" required>
        <label for="vgClave">Contraseña</label><input id="vgClave" type="password" autocomplete="current-password" required>
        <div class="mensaje" id="vgMsg">${esc(motivo || "")}</div>
        <button type="submit">Entrar</button>
      </form>`);
    d.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = d.querySelector("#vgUsuario").value.trim().toLowerCase();
      const { error } = await sb.auth.signInWithPassword({ email: u.includes("@") ? u : `${u}@${dominio}`, password: d.querySelector("#vgClave").value });
      if (error) { d.querySelector("#vgMsg").textContent = "Usuario o contraseña incorrectos."; return; }
      window.location.reload();
    });
  }

  function mostrarSinPermiso(perfil) {
    const d = capa(`<div class="caja"><h2>Este usuario no tiene el taller</h2>
      <p>${esc(perfil ? perfil.nombre : "El usuario")} no tiene el permiso "Usar el Taller". Pedíselo al dueño en Usuarios y permisos, o entrá con otro usuario.</p>
      <button type="button">Entrar con otro usuario</button></div>`);
    d.querySelector("button").addEventListener("click", salir);
  }

  async function salir() {
    if (!confirm("¿Cerrar la sesión de este equipo? Para volver a usar el taller va a hacer falta el usuario y la contraseña.")) return;
    await sb.auth.signOut().catch(() => null);
    window.location.reload();
  }

  async function generarClave() {
    const { data, error } = await sb.rpc("taller_clave_ayudante");
    if (error) { alert(error.message); return; }
    prompt("Clave del ayudante de Drive (se ve una sola vez). Copiala y pegala en la terminal de Google → Propiedades del script → CLAVE_TALLER:", data.clave);
  }

  function pintarEquipo(perfil) {
    const ok = () => {
      const b = document.createElement("div");
      b.className = "vg-equipo";
      b.innerHTML = `Equipo: ${esc(perfil.usuario || perfil.nombre)}`
        + (perfil.total || (perfil.permisos || []).includes("configuracion") ? `<a data-x="clave" title="Clave del ayudante de Google (Drive)">🔑</a>` : "")
        + `<a data-x="salir">Salir</a>`;
      b.addEventListener("click", (e) => {
        const x = e.target.closest("[data-x]");
        if (!x) return;
        if (x.dataset.x === "salir") salir(); else generarClave();
      });
      document.body.appendChild(b);
    };
    if (document.body) ok(); else document.addEventListener("DOMContentLoaded", ok);
  }

  // Quién hace cada cosa: el nombre elegido en la app viaja en cada pedido a la base
  function operario(nombre) {
    // Las cabeceras no admiten tildes: "Impresión" viaja como "Impresion"
    const limpio = String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "").slice(0, 80);
    try { sb.rest.headers["x-operario"] = limpio; } catch (e) { /* nada */ }
  }

  const listo = (async () => {
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) { await mostrarEntrada(); return new Promise(() => {}); }
    const { data: perfil } = await sb.rpc("mi_perfil");
    if (!perfil || !perfil.activo) { await mostrarEntrada("Ese usuario está desactivado."); return new Promise(() => {}); }
    if (!(perfil.total || (perfil.permisos || []).includes("taller"))) { mostrarSinPermiso(perfil); return new Promise(() => {}); }
    pintarEquipo(perfil);
    operario(localStorage.getItem("vg_operador_actual") || "");
    return perfil;
  })();

  window.VG_ACCESO = { listo, operario, salir };
})();
