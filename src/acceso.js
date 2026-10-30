// ============================================================================
// ACCESO AL CONTROL DE TALLER
// El equipo (la PC o la tablet del taller, o un celular) entra UNA sola vez con un usuario del sistema que tenga el
// permiso "taller" (por ejemplo el usuario "taller", rol Producción). La sesión queda guardada en ese equipo.
// Después, cada persona elige su nombre arriba y lo que hace queda con su nombre:
// - sin PIN (como viene): el nombre elegido viaja en la cabecera x-operario;
// - con PIN (se prende desde el botón "PIN" de abajo, con el permiso de configuración): la lista trae a las personas
//   de Empleados, cada una pone su PIN y la base le da una sesión de 12 horas (cabecera x-operario-token).
// Sin usuario no se puede leer ni tocar nada: lo exige la base (permisos de las tablas prod_*).
// Se carga después de supabase-js y de src/config/conexion.js, y antes de src/app.js.
// ============================================================================
(function () {
  const sb = window.vgSupabase;
  if (!sb) { console.warn("acceso.js: falta la conexión (src/config/conexion.js)"); return; }

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CLAVE_SESION = "vg_taller_sesion_operario";

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
    .vg-acceso input.pin { font-size: 28px; letter-spacing: 0.4em; text-align: center; }
    .vg-acceso button { width: 100%; margin-top: 18px; padding: 14px; border-radius: 10px; border: none; font-size: 16px; font-weight: 700;
      cursor: pointer; background: var(--vg-brand-primary); color: var(--vg-text-primary); }
    .vg-acceso button.secundario { margin-top: 10px; background: transparent; border: 1px solid var(--vg-surface-border); color: var(--vg-text-secondary); }
    .vg-acceso .mensaje { color: var(--vg-status-alert); font-size: 14px; margin-top: 12px; }
    .vg-acceso button.vg-clave-ojo { width: auto; margin: 0; padding: 6px 8px; border: none; background: none; color: var(--vg-text-secondary);
      font-weight: 400; display: flex; align-items: center; }
    .vg-acceso button.vg-clave-ojo:hover { color: var(--vg-text-primary); }
    .vg-acceso button.vg-olvide { width: auto; display: block; margin: 14px auto 0; padding: 4px; border: none; background: none;
      color: var(--vg-brand-secondary); font-weight: 400; font-size: 14px; text-decoration: underline; }
    .vg-equipo { position: fixed; right: 10px; bottom: 8px; z-index: 50; font: 12px var(--vg-font-sans); color: var(--vg-text-secondary);
      background: var(--vg-bg-app); border: 1px solid var(--vg-surface-border); border-radius: 999px; padding: 4px 10px; opacity: 0.85; }
    .vg-equipo a { color: var(--vg-brand-secondary); cursor: pointer; text-decoration: none; margin-left: 8px; }
  `;
  document.head.appendChild(estilo);

  const alListo = (fn) => { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); };

  function capa(html) {
    const d = document.createElement("div");
    d.className = "vg-acceso";
    d.innerHTML = html;
    alListo(() => document.body.appendChild(d));
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
        <button type="button" class="vg-olvide" id="vgOlvide">¿Te olvidaste la contraseña?</button>
      </form>`);
    if (window.vgOjitoClaves) window.vgOjitoClaves();
    d.querySelector("#vgOlvide").addEventListener("click", () => {
      const u = d.querySelector("#vgUsuario").value.trim();
      const erp = (window.VG_CONEXION && window.VG_CONEXION.erpUrl) || "https://erpvivigrafic.netlify.app";
      window.open(erp + "/login.html?olvide=1" + (u ? "&usuario=" + encodeURIComponent(u) : ""), "_blank", "noopener");
    });
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

  // Las ventanas y carteles del taller (los pone app.js); si todavía no cargó, los del navegador
  const preguntar = (titulo, texto, aceptar) => window.confirmarTaller ? window.confirmarTaller(titulo, texto, aceptar) : Promise.resolve(confirm(titulo + "\n\n" + texto));
  const avisar = (texto) => (window.toastTaller ? window.toastTaller(texto, "error") : alert(texto));

  async function salir() {
    if (!await preguntar("¿Cerrar la sesión de este equipo?", "Para volver a usar el taller va a hacer falta el usuario y la contraseña.", "Cerrar la sesión")) return;
    const s = leerSesion();
    if (s) { try { await sb.rpc("taller_operario_salir", { p_token: s.token }); } catch (e) { /* nada */ } }
    localStorage.removeItem(CLAVE_SESION);
    await sb.auth.signOut().catch(() => null);
    window.location.reload();
  }

  async function generarClave() {
    const { data, error } = await sb.rpc("taller_clave_ayudante");
    if (error) { avisar(error.message); return; }
    if (window.pedirTaller) await window.pedirTaller("🔑 Clave del ayudante de Drive", "Clave (se ve una sola vez)", data.clave,
      { texto: "Copiala y pegala en la terminal de Google → Propiedades del script → CLAVE_TALLER.", aceptar: "Listo, la copié" });
    else prompt("Clave del ayudante de Drive (se ve una sola vez). Copiala y pegala en la terminal de Google → Propiedades del script → CLAVE_TALLER:", data.clave);
  }

  async function cambiarPin() {
    const prender = !ACCESO.pin;
    const texto = prender
      ? "¿Prender el PIN del taller?\n\nCada persona va a elegir su nombre (las de Empleados) y poner su PIN, el mismo de la app de empleados. Quien no tenga PIN lo crea con el QR."
      : "¿Apagar el PIN del taller?\n\nSe vuelve a elegir el nombre de la lista, sin PIN.";
    const [titulo, ...resto] = texto.split("\n\n");
    if (!await preguntar(titulo, resto.join("\n\n"), prender ? "Prender el PIN" : "Apagar el PIN")) return;
    const { error } = await sb.rpc("taller_ajustes_guardar", { p: { pin: prender } });
    if (error) { avisar(error.message); return; }
    localStorage.removeItem(CLAVE_SESION);
    window.location.reload();
  }

  function pintarEquipo(perfil) {
    alListo(() => {
      const b = document.createElement("div");
      const config = perfil.total || (perfil.permisos || []).includes("configuracion");
      b.className = "vg-equipo";
      b.innerHTML = `Equipo: ${esc(perfil.usuario || perfil.nombre)}`
        + (config ? `<a data-x="pin" title="Prender o apagar el PIN de las personas del taller">PIN: ${ACCESO.pin ? "sí" : "no"}</a>` : "")
        + (config ? `<a data-x="clave" title="Clave del ayudante de Google (Drive)">🔑</a>` : "")
        + `<a data-x="salir">Salir</a>`;
      b.addEventListener("click", (e) => {
        const x = e.target.closest("[data-x]");
        if (!x) return;
        if (x.dataset.x === "salir") salir();
        else if (x.dataset.x === "pin") cambiarPin();
        else generarClave();
      });
      document.body.appendChild(b);
    });
  }

  // Quién hace cada cosa: el nombre elegido en la app viaja en cada pedido a la base
  function operario(nombre) {
    // Las cabeceras no admiten tildes: "Impresión" viaja como "Impresion"
    const limpio = String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "").slice(0, 80);
    try { sb.rest.headers["x-operario"] = limpio; } catch (e) { /* nada */ }
  }

  // ===== PIN optativo =====
  function leerSesion() {
    try {
      const s = JSON.parse(localStorage.getItem(CLAVE_SESION) || "null");
      return s && s.token && new Date(s.vence) > new Date() ? s : null;
    } catch (e) { return null; }
  }

  function ponerToken(token) {
    try {
      if (token) sb.rest.headers["x-operario-token"] = token;
      else delete sb.rest.headers["x-operario-token"];
    } catch (e) { /* nada */ }
  }

  function prepararPin(personas) {
    alListo(() => {
      const sel = document.getElementById("vgSelectOperadorActual");
      if (!sel) return;
      sel.innerHTML = `<option value="">👤 Elegí tu nombre</option>`
        + personas.map(p => `<option value="${esc(p.nombre)}" data-id="${esc(p.id)}">👤 ${esc(p.nombre)}${p.tiene_pin ? "" : " (sin PIN)"}</option>`).join("");
    });
    const s = leerSesion();
    if (s) { ponerToken(s.token); operario(s.nombre); }
  }

  function pedirPin(nombre) {
    return new Promise((resolve) => {
      const d = capa(`<form autocomplete="off">
          <h2>${esc(nombre)}</h2>
          <p>Poné tu PIN (el mismo de la app de empleados).</p>
          <input class="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" required>
          <button type="submit">Entrar</button>
          <button type="button" class="secundario" data-x="cancelar">Cancelar</button>
        </form>`);
      const inp = d.querySelector("input");
      setTimeout(() => inp.focus(), 50);
      d.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); d.remove(); resolve(inp.value); });
      d.querySelector("[data-x='cancelar']").addEventListener("click", () => { d.remove(); resolve(null); });
    });
  }

  // Lo llama la app al cambiar el nombre de arriba. Devuelve el nombre, o null si no se pudo (y la app deja el anterior).
  async function elegirOperario(sel) {
    const valor = sel.value;
    if (!ACCESO.pin) { operario(valor); return valor; }
    const opt = sel.selectedOptions && sel.selectedOptions[0];
    const id = opt && opt.dataset.id;
    if (!id) return null;
    const pin = await pedirPin(valor);
    if (pin === null) return null;
    const { data, error } = await sb.rpc("taller_operario_entrar", { p_persona: id, p_pin: pin });
    if (error || !data || !data.ok) { avisar((data && data.error) || (error && error.message) || "No se pudo entrar."); return null; }
    const anterior = leerSesion();
    if (anterior) { try { await sb.rpc("taller_operario_salir", { p_token: anterior.token }); } catch (e) { /* nada */ } }
    localStorage.setItem(CLAVE_SESION, JSON.stringify({ token: data.token, nombre: data.nombre, vence: data.vence_at }));
    ponerToken(data.token);
    operario(data.nombre);
    return data.nombre;
  }

  const ACCESO = {
    pin: false,
    operario,
    salir,
    elegirOperario,
    nombreOperario: () => (leerSesion() || {}).nombre || ""
  };

  ACCESO.listo = (async () => {
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) { await mostrarEntrada(); return new Promise(() => {}); }
    const { data: perfil } = await sb.rpc("mi_perfil");
    if (!perfil || !perfil.activo) { await mostrarEntrada("Ese usuario está desactivado."); return new Promise(() => {}); }
    if (!(perfil.total || (perfil.permisos || []).includes("taller"))) { mostrarSinPermiso(perfil); return new Promise(() => {}); }
    let cfg = null;
    try { cfg = (await sb.rpc("taller_operarios")).data; } catch (e) { /* sin PIN */ }
    ACCESO.pin = !!(cfg && cfg.pin);
    if (ACCESO.pin) prepararPin(cfg.personas || []);
    else operario(localStorage.getItem("vg_operador_actual") || "");
    pintarEquipo(perfil);
    return perfil;
  })();

  window.VG_ACCESO = ACCESO;
})();
