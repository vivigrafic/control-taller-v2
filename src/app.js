// ============================================================================
// CONTROL DE TALLER Y PRODUCCIÓN 2.0 — V&V GRAFIC (MOTOR PRINCIPAL SUPABASE)
// Conectado exclusivamente al Clon de Pruebas: kkvzzheccniclfwqzivu
// ============================================================================

import {
  parsearNombreArchivoInteligente,
  consolidarAutodeteccionLote,
  calcularPrecioMetroDTF,
  leerGeometriaRealArchivo,
  comprimirFotoCamaraWebP
} from "./utils/smart_parser.js";

const STATE = {
  tabActiva: "impresion",
  periodoActivo: "todo", // todo, hoy, ayer, semana_actual, semana_anterior, mes_actual, custom
  fechaDesde: "",
  fechaHasta: "",
  busquedaGlobal: "",
  usuarioActual: localStorage.getItem("vg_operador_actual") || "Roberto",
  areaActual: localStorage.getItem("vg_area_actual") || "General",
  canalChatActivo: "Todos",

  // Datos en vivo desde Supabase (kkvzzheccniclfwqzivu)
  rollosPapelSaldos: [],
  bloquesImpresion: [],
  impresiones: [],
  colaCalandrado: [],
  colaLaser: [],
  pendientesDrive: [],
  catalogos: [],
  fallasReposiciones: [],
  dtfRollosSaldos: [],
  dtfTiradas: [],
  dtfPedidos: [],
  dtfCuentasClientes: [],
  chatMensajes: [],

  // Protección de Formulario Activo (Dirty-Form Protection — Pedido #7)
  impForm: {
    dirty: false,
    archivosSeleccionadosIds: new Set(),
    perfil: "",
    tela: "",
    rolloTela: "",
    color: "",
    ruta: "Solo Calandrado",
    diseno: "",
    observaciones: "",
    fechaManual: "",
    autoDetectInfo: ""
  },

  // Estado Kiosco activo
  kiosco: {
    abierto: false,
    tipo: "", // "CALANDRA", "LASER"
    batchId: "",
    registroIds: [],
    titulo: "",
    subtitulo: "",
    metros: 0,
    velocidad: 50,
    temperatura: 205,
    poder: 90,
    inicioMs: 0,
    pausado: false,
    acumuladoSeg: 0,
    timerInterval: null
  },

  // Foto pendiente en chat
  chatFotoBase64: ""
};

const sb = () => window.vgSupabase;

// Utilidades de formato
function fmtNum(n, dec = 2) {
  const v = Number(n) || 0;
  return v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  return "$" + v.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDateHora(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(msg, tipo = "info") {
  const cont = document.getElementById("vgToastContainer");
  if (!cont) return;
  const el = document.createElement("div");
  const bg = tipo === "error" ? "#ef4444" : tipo === "warn" ? "#f59e0b" : "#10b981";
  el.style.cssText = `background:${bg};color:#fff;padding:10px 16px;border-radius:10px;font-weight:800;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,0.25);margin-top:8px;transition:all 0.2s;`;
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ============================================================================
// FILTRO TEMPORAL UNIVERSAL (Hoy, Ayer, Esta Semana, Semana Anterior, Mes, Rango)
// ============================================================================
function obtenerRangoFechasActivo() {
  const ahora = new Date();
  const hoyInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
  const hoyFin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);

  if (STATE.periodoActivo === "todo") return { desde: null, hasta: null, etiqueta: "Histórico Completo" };
  if (STATE.periodoActivo === "hoy") return { desde: hoyInicio, hasta: hoyFin, etiqueta: "Hoy" };
  if (STATE.periodoActivo === "ayer") {
    const ayerIni = new Date(hoyInicio.getTime() - 86400000);
    const ayerFin = new Date(hoyFin.getTime() - 86400000);
    return { desde: ayerIni, hasta: ayerFin, etiqueta: "Ayer" };
  }
  const diaSem = ahora.getDay() || 7; // Lunes = 1 ... Domingo = 7
  const lunesActual = new Date(hoyInicio.getTime() - (diaSem - 1) * 86400000);
  if (STATE.periodoActivo === "semana_actual") {
    return { desde: lunesActual, hasta: hoyFin, etiqueta: "Esta Semana" };
  }
  if (STATE.periodoActivo === "semana_anterior") {
    const lunesAnt = new Date(lunesActual.getTime() - 7 * 86400000);
    const domAnt = new Date(lunesActual.getTime() - 1);
    return { desde: lunesAnt, hasta: domAnt, etiqueta: "Semana Anterior" };
  }
  if (STATE.periodoActivo === "mes_actual") {
    const mesIni = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
    return { desde: mesIni, hasta: hoyFin, etiqueta: "Este Mes" };
  }
  if (STATE.periodoActivo === "custom") {
    const d = STATE.fechaDesde ? new Date(STATE.fechaDesde + "T00:00:00") : null;
    const h = STATE.fechaHasta ? new Date(STATE.fechaHasta + "T23:59:59") : null;
    return { desde: d, hasta: h, etiqueta: "Rango Personalizado" };
  }
  return { desde: null, hasta: null, etiqueta: "Todos" };
}

function cumpleFiltroFecha(isoStr) {
  const { desde, hasta } = obtenerRangoFechasActivo();
  if (!desde && !hasta) return true;
  if (!isoStr) return false;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return false;
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}

// ============================================================================
// BUSCADOR UNIVERSAL OMNIPRESENTE (Cualquier palabra, cliente, perfil, tela, metros, nota)
// ============================================================================
function cumpleBusquedaUniversal(obj) {
  const q = STATE.busquedaGlobal.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const textoFila = Object.values(obj || {})
    .map(v => (typeof v === "object" ? JSON.stringify(v) : String(v ?? "")))
    .join(" ")
    .toLowerCase();
  return tokens.every(t => textoFila.includes(t));
}

// ============================================================================
// CARGA DE DATOS EN VIVO Y REALTIME DESDE EL CLON SUPABASE (kkvzzheccniclfwqzivu)
// ============================================================================
export async function cargarDatosTodo() {
  const client = sb();
  if (!client) return;

  const [
    resRollosSaldos,
    resBloques,
    resImp,
    resCal,
    resLaser,
    resPend,
    resCat,
    resFallas,
    resDtfRollos,
    resDtfTiradas,
    resDtfPedidos,
    resDtfCuentas,
    resChat
  ] = await Promise.all([
    client.from("v_prod_rollos_papel_saldos").select("*").order("fecha_montaje", { ascending: false }),
    client.from("v_prod_bloques_impresion").select("*"),
    client.from("prod_impresiones").select("*").eq("anulado", false).order("fecha_hora", { ascending: false }).limit(400),
    client.from("prod_cola_calandrado").select("*").eq("anulado", false).order("fecha_hora", { ascending: false }).limit(400),
    client.from("prod_cola_laser").select("*").eq("anulado", false).order("fecha_ingreso", { ascending: false }).limit(400),
    client.from("prod_pendientes_drive").select("*").order("created_at", { ascending: false }),
    client.from("prod_catalogos").select("*").eq("activo", true).order("ultimo_uso_at", { ascending: false }),
    client.from("prod_fallas_reposiciones").select("*").order("fecha_hora", { ascending: false }).limit(150),
    client.from("v_prod_dtf_rollos_saldos").select("*").order("fecha_montaje", { ascending: false }),
    client.from("prod_dtf_tiradas").select("*").eq("anulado", false).order("fecha_hora", { ascending: false }),
    client.from("prod_dtf_pedidos").select("*").eq("anulado", false).order("fecha_hora", { ascending: false }),
    client.from("v_prod_dtf_cuentas_clientes").select("*").order("saldo_pendiente", { ascending: false }),
    client.from("prod_chat_mensajes").select("*").order("created_at", { ascending: false }).limit(120)
  ]);

  STATE.rollosPapelSaldos = resRollosSaldos.data || [];
  STATE.bloquesImpresion = resBloques.data || [];
  STATE.impresiones = resImp.data || [];
  STATE.colaCalandrado = resCal.data || [];
  STATE.colaLaser = resLaser.data || [];
  STATE.pendientesDrive = resPend.data || [];
  STATE.catalogos = resCat.data || [];
  STATE.fallasReposiciones = resFallas.data || [];
  STATE.dtfRollosSaldos = resDtfRollos.data || [];
  STATE.dtfTiradas = resDtfTiradas.data || [];
  STATE.dtfPedidos = resDtfPedidos.data || [];
  STATE.dtfCuentasClientes = resDtfCuentas.data || [];
  STATE.chatMensajes = resChat.data || [];

  renderTodoRespetandoFormulario();
}

function suscribirRealtime() {
  const client = sb();
  if (!client) return;
  client
    .channel("taller-v2-realtime")
    .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
      if (payload.table === "prod_chat_mensajes" && payload.eventType === "INSERT") {
        const msg = payload.new;
        if (msg && Array.isArray(msg.menciones) && msg.menciones.includes(STATE.usuarioActual)) {
          toast(`🔔 @${STATE.usuarioActual}: ${msg.autor_nombre} te mencionó en el Chat (${msg.canal_area})`, "warn");
        }
      }
      cargarDatosTodo();
    })
    .subscribe();
}

// ============================================================================
// CATÁLOGOS Y RANKING INTELIGENTE MRU (#1 SIEMPRE ES EL ÚLTIMO USADO)
// ============================================================================
function obtenerItemsMRU(tipo) {
  const items = STATE.catalogos.filter(c => c.tipo === tipo);
  if (items.length <= 1) return items;
  // Ordenamos por ultimo_uso_at DESC para identificar el #1 absoluto (último usado)
  const porUltimoUso = [...items].sort((a, b) => new Date(b.ultimo_uso_at) - new Date(a.ultimo_uso_at));
  const primeroMRU = porUltimoUso[0];
  const resto = porUltimoUso.slice(1).sort((a, b) => (b.contador_uso_reciente || 0) - (a.contador_uso_reciente || 0));
  return [primeroMRU, ...resto];
}

async function registrarUsoMRU(tipo, nombre) {
  if (!nombre) return;
  const limpio = String(nombre).trim();
  if (!limpio) return;
  const existente = STATE.catalogos.find(c => c.tipo === tipo && c.nombre.toLowerCase() === limpio.toLowerCase());
  const nuevoContador = ((existente?.contador_uso_reciente || 0) % 25) + 1;
  await sb().from("prod_catalogos").upsert({
    empresa_id: "vvgrafic-principal",
    tipo,
    nombre: existente ? existente.nombre : limpio,
    ultimo_uso_at: new Date().toISOString(),
    contador_uso_reciente: nuevoContador,
    activo: true
  }, { onConflict: "empresa_id,tipo,nombre" });
}

// ============================================================================
// RENDERIZADO GENERAL (Con Protección Dirty-Form para no borrar lo que escribe el operador)
// ============================================================================
function renderTodoRespetandoFormulario() {
  renderBadgesNavegacion();
  renderResumenPeriodoBarra();
  if (!STATE.impForm.dirty) {
    renderChipsImpresion();
  } else {
    actualizarClasesSeleccionChips();
  }
  renderPendientesDriveSublimacion();
  renderRolloActivoImpresion();
  renderTablaImpresionesConBloques();
  renderModuloCalandrado();
  renderModuloLaser();
  renderModuloDTF();
  renderModuloChat();
  renderModuloMetricas();
  if (STATE.busquedaGlobal.trim().length > 0) {
    renderResultadosOmnisearch();
  } else {
    const panelOmni = document.getElementById("vgOmnisearchPanel");
    if (panelOmni) panelOmni.style.display = "none";
  }
}

function renderBadgesNavegacion() {
  const pendSub = STATE.pendientesDrive.filter(p => p.modulo === "SUBLIMACION" && p.estado_impreso !== "SI").length;
  const pendCal = STATE.colaCalandrado.filter(c => !String(c.estado).toLowerCase().includes("terminado")).length;
  // En láser contamos lotes anidados únicos pendientes
  const laserPendRows = STATE.colaLaser.filter(l => !String(l.estado).toLowerCase().includes("terminado"));
  const laserBatchesPend = new Set(laserPendRows.map(l => l.batch_id || l.id)).size;
  const pendDtf = STATE.pendientesDrive.filter(p => p.modulo === "DTF" && p.estado_impreso !== "SI").length;
  const mencionesSinLeer = STATE.chatMensajes.filter(m => !m.resuelto && Array.isArray(m.menciones) && m.menciones.includes(STATE.usuarioActual)).length;

  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt("badgeTabImp", pendSub);
  setTxt("badgeTabCal", pendCal);
  setTxt("badgeTabLaser", laserBatchesPend);
  setTxt("badgeTabDtf", pendDtf);
  setTxt("badgeTabChat", mencionesSinLeer || STATE.chatMensajes.length);
  setTxt("badgeFabChat", mencionesSinLeer > 0 ? `🔔 ${mencionesSinLeer}` : STATE.chatMensajes.length);
}

function renderResumenPeriodoBarra() {
  const { etiqueta } = obtenerRangoFechasActivo();
  const mImp = STATE.impresiones
    .filter(i => i.accion === "Impresion Normal" && cumpleFiltroFecha(i.fecha_hora) && cumpleBusquedaUniversal(i))
    .reduce((acc, r) => acc + (Number(r.metros_impresos) || 0), 0);

  const mCal = STATE.colaCalandrado
    .filter(c => String(c.estado).toLowerCase().includes("terminado") && cumpleFiltroFecha(c.fecha_terminado || c.fecha_hora) && cumpleBusquedaUniversal(c))
    .reduce((acc, r) => acc + (Number(r.metros) || 0), 0);

  const mLaser = STATE.colaLaser
    .filter(l => String(l.estado).toLowerCase().includes("terminado") && cumpleFiltroFecha(l.fecha_terminado || l.fecha_ingreso) && cumpleBusquedaUniversal(l))
    .reduce((acc, r) => acc + (Number(r.metros) || 0), 0);

  const mDtf = STATE.dtfPedidos
    .filter(d => cumpleFiltroFecha(d.fecha_hora) && cumpleBusquedaUniversal(d))
    .reduce((acc, r) => acc + (Number(r.metros_archivo) || 0), 0);

  const el = document.getElementById("vgPeriodSummaryMetrics");
  if (el) {
    el.innerHTML = `
      <span class="vg-badge vg-badge-imp">📅 ${escHtml(etiqueta)}</span>
      <span class="vg-badge vg-badge-imp">🖨️ Imp: ${fmtNum(mImp)} m</span>
      <span class="vg-badge vg-badge-cal">🔥 Calandra: ${fmtNum(mCal)} m</span>
      <span class="vg-badge vg-badge-laser">⚡ Láser: ${fmtNum(mLaser)} m</span>
      <span class="vg-badge vg-badge-ok">🎞️ DTF: ${fmtNum(mDtf)} m</span>
    `;
  }
}

// ============================================================================
// MÓDULO 1: IMPRESIÓN SUBLIMACIÓN (Auto-Parser, MRU #1, Ruta en Botones, Bloques con Suma en Vivo)
// ============================================================================
function obtenerRolloPapelActivo() {
  const activo = STATE.rollosPapelSaldos.find(r => r.estado === "Activo") || STATE.rollosPapelSaldos[0];
  if (!activo) {
    return { idBase: "70g-1610-1", bloqueActual: "70g-1610-1-C1", restantes: 200, iniciales: 200, impresos: 0 };
  }
  // Buscar cuál es el bloque (-C1, -C2) más reciente de este rollo base
  const impDeRollo = STATE.impresiones.filter(i => i.id_rollo_base === activo.id_rollo);
  let maxCut = 1;
  impDeRollo.forEach(i => {
    const m = String(i.id_rollo_papel || "").match(/-C(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxCut) maxCut = n;
    }
    if (i.accion === "Corte de Papel (-4m)" && m) {
      const n = parseInt(m[1], 10);
      if (n >= maxCut) maxCut = n + 1;
    }
  });
  const bloqueActual = `${activo.id_rollo}-C${maxCut}`;
  return {
    idBase: activo.id_rollo,
    bloqueActual,
    restantes: Number(activo.metros_restantes_reales) || 0,
    iniciales: Number(activo.metros_iniciales) || 200,
    impresos: Number(activo.metros_impresos_acumulados) || 0,
    merma: Number(activo.metros_desperdicio_acumulados) || 0
  };
}

function renderRolloActivoImpresion() {
  const info = obtenerRolloPapelActivo();
  const bloqueInfo = STATE.bloquesImpresion.find(b => b.bloque_id === info.bloqueActual);
  const metrosEnEsteBloque = Number(bloqueInfo?.metros_impresos_bloque) || 0;

  const box = document.getElementById("vgRolloActivoHeader");
  if (!box) return;
  box.innerHTML = `
    <div class="vg-kpi-grid">
      <div class="vg-kpi-box" style="border-left-color: var(--vg-primary);">
        <div class="vg-kpi-label">🧻 Rollo Base Activo</div>
        <div class="vg-kpi-value">${escHtml(info.idBase)}</div>
        <div class="vg-kpi-sub">Inicial: ${fmtNum(info.iniciales)} m | Impreso: ${fmtNum(info.impresos)} m</div>
      </div>
      <div class="vg-kpi-box" style="border-left-color: var(--vg-success);">
        <div class="vg-kpi-label">📏 Metros Restantes Reales</div>
        <div class="vg-kpi-value" style="color:var(--vg-success);">${fmtNum(info.restantes)} m</div>
        <div class="vg-kpi-sub">Recalculado automático por Vista SQL</div>
      </div>
      <div class="vg-kpi-box" style="border-left-color: var(--vg-purple);">
        <div class="vg-kpi-label">📦 Bloque en Formación Actual</div>
        <div class="vg-kpi-value">${escHtml(info.bloqueActual)}</div>
        <div class="vg-kpi-sub">Suma actual del bloque: <strong>${fmtNum(metrosEnEsteBloque)} m</strong></div>
      </div>
    </div>
  `;
}

function renderChipsImpresion() {
  const telas = obtenerItemsMRU("TELA").slice(0, 7);
  const perfiles = obtenerItemsMRU("PERFIL").slice(0, 6);
  const colores = obtenerItemsMRU("COLOR").slice(0, 6);

  const renderGrupo = (containerId, items, campoForm) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = items.map((item, idx) => {
      const isSelected = STATE.impForm[campoForm] === item.nombre;
      const isFirst = idx === 0;
      return `
        <button type="button"
          class="vg-chip ${isFirst ? "mru-first" : ""} ${isSelected ? "selected" : ""}"
          data-chip-field="${campoForm}"
          data-chip-val="${escHtml(item.nombre)}"
          title="${isFirst ? "⚡ Último usado (#1 MRU)" : `Usos recientes: ${item.contador_uso_reciente || 1}`}">
          ${isFirst ? "⚡ " : ""}${escHtml(item.nombre)}
        </button>
      `;
    }).join("");

    el.querySelectorAll("button[data-chip-field]").forEach(btn => {
      btn.addEventListener("click", () => {
        const field = btn.getAttribute("data-chip-field");
        const val = btn.getAttribute("data-chip-val");
        STATE.impForm.dirty = true;
        STATE.impForm[field] = val;
        const inputEl = document.getElementById(`impInput_${field}`);
        if (inputEl) inputEl.value = val;
        actualizarClasesSeleccionChips();
      });
    });
  };

  renderGrupo("chipsTelaContainer", telas, "tela");
  renderGrupo("chipsPerfilContainer", perfiles, "perfil");
  renderGrupo("chipsColorContainer", colores, "color");
  actualizarBotonesRutaUI();
}

function actualizarClasesSeleccionChips() {
  ["tela", "perfil", "color"].forEach(campo => {
    document.querySelectorAll(`button[data-chip-field="${campo}"]`).forEach(btn => {
      const val = btn.getAttribute("data-chip-val");
      btn.classList.toggle("selected", STATE.impForm[campo] === val);
    });
  });
  actualizarBotonesRutaUI();
}

function actualizarBotonesRutaUI() {
  document.querySelectorAll("button[data-ruta-val]").forEach(btn => {
    const val = btn.getAttribute("data-ruta-val");
    btn.classList.remove("active-cal", "active-laser", "active-imp");
    if (STATE.impForm.ruta === val) {
      if (val === "Solo Calandrado") btn.classList.add("active-cal");
      else if (val === "Calandrado + Corte Láser") btn.classList.add("active-laser");
      else btn.classList.add("active-imp");
    }
  });
}

function renderPendientesDriveSublimacion() {
  const tbody = document.getElementById("tbodyPendientesSublimacion");
  if (!tbody) return;
  const lista = STATE.pendientesDrive
    .filter(p => p.modulo === "SUBLIMACION" && p.estado_impreso !== "SI" && cumpleBusquedaUniversal(p));

  let sumaSeleccionados = 0;
  STATE.pendientesDrive.forEach(p => {
    if (STATE.impForm.archivosSeleccionadosIds.has(p.id)) {
      sumaSeleccionados += Number(p.metros_totales) || 0;
    }
  });
  const badgeSel = document.getElementById("impSumaSeleccionadosBadge");
  if (badgeSel) {
    const infoRollo = obtenerRolloPapelActivo();
    const bloqueInfo = STATE.bloquesImpresion.find(b => b.bloque_id === infoRollo.bloqueActual);
    const actualBloque = Number(bloqueInfo?.metros_impresos_bloque) || 0;
    badgeSel.innerHTML = `
      Seleccionados: <strong>${STATE.impForm.archivosSeleccionadosIds.size} archivo(s) (${fmtNum(sumaSeleccionados)} m)</strong>
      | Bloque ${escHtml(infoRollo.bloqueActual)} quedará en: <strong>${fmtNum(actualBloque + sumaSeleccionados)} m</strong>
    `;
  }

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--vg-text-muted);">No hay archivos pendientes que coincidan con el filtro. Podés sincronizar Drive o agregar uno manual.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => {
    const checked = STATE.impForm.archivosSeleccionadosIds.has(p.id);
    const chipsDetectados = [
      p.perfil_detectado ? `<span class="vg-badge vg-badge-imp">🎨 ${escHtml(p.perfil_detectado)}</span>` : "",
      p.tela_detectada ? `<span class="vg-badge vg-badge-cal">👕 ${escHtml(p.tela_detectada)}</span>` : "",
      p.rollo_detectado ? `<span class="vg-badge vg-badge-ok">🧻 R#${escHtml(p.rollo_detectado)}</span>` : "",
      p.color_detectado ? `<span class="vg-badge vg-badge-ok">🎨 ${escHtml(p.color_detectado)}</span>` : "",
      p.ruta_detectada ? `<span class="vg-badge vg-badge-laser">🛤️ ${escHtml(p.ruta_detectada)}</span>` : ""
    ].filter(Boolean).join(" ");

    return `
      <tr class="${checked ? "selected-row" : ""}">
        <td>
          <input type="checkbox" class="chk-pend-sub" data-id="${p.id}" style="width:20px;height:20px;cursor:pointer;" ${checked ? "checked" : ""}/>
        </td>
        <td><strong>${escHtml(p.cliente)}</strong></td>
        <td>
          <div style="font-weight:700;">${escHtml(p.nombre_archivo)}</div>
          <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
            ${chipsDetectados || `<span style="font-size:11px;color:var(--vg-text-muted);">Sin metadatos en nombre (se cargan manual)</span>`}
          </div>
        </td>
        <td style="font-family:var(--vg-font-mono);font-weight:800;">
          ${fmtNum(p.metros_totales)} m
          ${p.discrepancia_medida ? `<div class="vg-badge vg-badge-danger" title="Medida real por DPI: ${fmtNum(p.metros_dpi_real)}m">⚠️ DPI: ${fmtNum(p.metros_dpi_real)}m</div>` : ""}
        </td>
        <td>${p.prioridad_maxima ? `<span class="vg-badge vg-badge-danger">🚨 REPOSICIÓN URGENTE</span>` : `<span class="vg-badge vg-badge-ok">Normal</span>`}</td>
        <td>
          <button class="vg-btn vg-btn-outline vg-btn-sm btn-crud-edit" data-table="prod_pendientes_drive" data-id="${p.id}">✏️</button>
          <button class="vg-btn vg-btn-danger vg-btn-sm btn-crud-del" data-table="prod_pendientes_drive" data-id="${p.id}">🗑️</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".chk-pend-sub").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-id");
      if (chk.checked) STATE.impForm.archivosSeleccionadosIds.add(id);
      else STATE.impForm.archivosSeleccionadosIds.delete(id);
      aplicarAutodeteccionAlSeleccionarArchivos();
      renderPendientesDriveSublimacion();
    });
  });
}

// Aplica la Regla de Oro del Pedido #1 (Última tanda):
// Reconoce Perfil, Tela, Rollo, Color y Ruta del nombre de los archivos seleccionados.
// Si NO tiene nada de eso en el nombre, lo deja EN BLANCO para carga manual.
function aplicarAutodeteccionAlSeleccionarArchivos() {
  const seleccionados = STATE.pendientesDrive.filter(p => STATE.impForm.archivosSeleccionadosIds.has(p.id));
  if (seleccionados.length === 0) {
    STATE.impForm.dirty = false;
    STATE.impForm.perfil = "";
    STATE.impForm.tela = "";
    STATE.impForm.rolloTela = "";
    STATE.impForm.color = "";
    STATE.impForm.autoDetectInfo = "";
    sincronizarInputsImpresionConState();
    return;
  }

  STATE.impForm.dirty = true;
  const catObj = {
    telas: STATE.catalogos.filter(c => c.tipo === "TELA").map(c => c.nombre),
    perfiles: STATE.catalogos.filter(c => c.tipo === "PERFIL").map(c => c.nombre),
    colores: STATE.catalogos.filter(c => c.tipo === "COLOR").map(c => c.nombre)
  };
  const auto = consolidarAutodeteccionLote(seleccionados, catObj);

  // Asignamos exactamente lo que encontró en el nombre de archivo; si no está, queda "" (en blanco)
  STATE.impForm.perfil = auto.perfil || "";
  STATE.impForm.tela = auto.tela || "";
  STATE.impForm.rolloTela = auto.rollo || "";
  STATE.impForm.color = auto.color || "";
  if (auto.ruta) STATE.impForm.ruta = auto.ruta;

  const detectadosList = [];
  if (auto.perfil) detectadosList.push(`Perfil: ${auto.perfil}`);
  if (auto.tela) detectadosList.push(`Tela: ${auto.tela}`);
  if (auto.rollo) detectadosList.push(`Rollo: #${auto.rollo}`);
  if (auto.color) detectadosList.push(`Color: ${auto.color}`);
  if (auto.ruta) detectadosList.push(`Ruta: ${auto.ruta}`);

  STATE.impForm.autoDetectInfo = detectadosList.length > 0
    ? `✨ Autodetectado del nombre: ${detectadosList.join(" · ")}`
    : `ℹ️ El archivo no especifica perfil/tela/color en su nombre — seleccionálos manualmente abajo.`;
  if (auto.conflictos.length > 0) {
    STATE.impForm.autoDetectInfo += ` | ⚠️ Atención: ${auto.conflictos.join(", ")}`;
  }

  sincronizarInputsImpresionConState();
}

function sincronizarInputsImpresionConState() {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ""; };
  setVal("impInput_perfil", STATE.impForm.perfil);
  setVal("impInput_tela", STATE.impForm.tela);
  setVal("impInput_rolloTela", STATE.impForm.rolloTela);
  setVal("impInput_color", STATE.impForm.color);
  setVal("impInput_diseno", STATE.impForm.diseno);
  setVal("impInput_observaciones", STATE.impForm.observaciones);
  const banner = document.getElementById("impAutoDetectBanner");
  if (banner) {
    banner.style.display = STATE.impForm.autoDetectInfo ? "block" : "none";
    banner.textContent = STATE.impForm.autoDetectInfo;
  }
  actualizarClasesSeleccionChips();
}

// Renderiza la tabla de registros de Impresión AGRUPADA POR BLOQUES con METROS SUMADOS EN VIVO
// + Columna de Ruta de Producción + Columna de Notas/Fallas + Botones CRUD Editar/Eliminar
function renderTablaImpresionesConBloques() {
  const tbody = document.getElementById("tbodyHistorialImpresion");
  if (!tbody) return;

  const filtradas = STATE.impresiones.filter(i => cumpleFiltroFecha(i.fecha_hora) && cumpleBusquedaUniversal(i));
  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--vg-text-muted);">No hay registros de impresión en este período o búsqueda.</td></tr>`;
    return;
  }

  // Agrupamos secuencialmente por id_rollo_papel (Bloque) para mostrar la cabecera con metros sumados
  let html = "";
  let ultimoBloque = null;

  filtradas.forEach(row => {
    const bloqueId = row.id_rollo_papel || row.id_rollo_base || "Sin Bloque";
    if (bloqueId !== ultimoBloque) {
      ultimoBloque = bloqueId;
      // Calculamos la suma total en vivo de este bloque
      const filasDelBloque = STATE.impresiones.filter(x => x.id_rollo_papel === bloqueId && !x.anulado);
      const sumaImpresosBloque = filasDelBloque
        .filter(x => x.accion === "Impresion Normal")
        .reduce((acc, x) => acc + (Number(x.metros_impresos) || 0), 0);
      const sumaMermaBloque = filasDelBloque
        .reduce((acc, x) => acc + (Number(x.metros_desperdicio) || 0), 0);
      const cantTrabajos = filasDelBloque.filter(x => x.accion === "Impresion Normal").length;

      html += `
        <tr class="vg-block-header-row">
          <td colspan="10">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div>
                📦 <strong>BLOQUE DE IMPRESIÓN: ${escHtml(bloqueId)}</strong>
                <span style="margin-left:8px;color:var(--vg-text-secondary);font-size:12px;">(${cantTrabajos} trabajo/s en este bloque)</span>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <span class="vg-block-sum-badge">📏 METROS SUMADOS DEL BLOQUE: ${fmtNum(sumaImpresosBloque)} m</span>
                ${sumaMermaBloque > 0 ? `<span class="vg-badge vg-badge-danger">Merma/Corte: ${fmtNum(sumaMermaBloque)} m</span>` : ""}
              </div>
            </div>
          </td>
        </tr>
      `;
    }

    const esAnidado = String(row.cliente_archivo || "").includes(" | ");
    const cantAnidados = esAnidado ? String(row.cliente_archivo).split(" | ").length : 1;
    const badgeRuta = row.ruta && row.ruta.includes("Láser")
      ? `<span class="vg-badge vg-badge-laser">🔥+⚡ ${escHtml(row.ruta)}</span>`
      : row.ruta === "Solo Impresión"
        ? `<span class="vg-badge vg-badge-imp">🖨️ Solo Impresión</span>`
        : `<span class="vg-badge vg-badge-cal">🔥 ${escHtml(row.ruta || "Solo Calandrado")}</span>`;

    html += `
      <tr>
        <td style="font-family:var(--vg-font-mono);font-size:11.5px;white-space:nowrap;">${fmtDateHora(row.fecha_hora)}</td>
        <td><strong>${escHtml(row.id_rollo_papel)}</strong></td>
        <td>
          ${esAnidado ? `<span class="vg-badge vg-badge-laser" style="margin-bottom:3px;">📦 LOTE ANIDADO (${cantAnidados} archivos)</span><br/>` : ""}
          <strong>${escHtml(row.cliente_archivo)}</strong>
          ${row.diseno ? `<div style="font-size:11px;color:var(--vg-text-muted);">Diseño: ${escHtml(row.diseno)}</div>` : ""}
        </td>
        <td>
          <strong>${escHtml(row.tela_destino || "-")}</strong>
          ${row.num_rollo_tela ? ` <span class="vg-badge vg-badge-ok">R#${escHtml(row.num_rollo_tela)}</span>` : ""}
          ${row.color_tela ? `<div style="font-size:11px;color:var(--vg-text-secondary);">Color: ${escHtml(row.color_tela)}</div>` : ""}
        </td>
        <td><span class="vg-badge vg-badge-imp">${escHtml(row.perfil || "-")}</span></td>
        <td>${badgeRuta}</td>
        <td style="font-family:var(--vg-font-mono);font-weight:900;font-size:13.5px;">
          ${row.accion === "Impresion Normal" ? `${fmtNum(row.metros_impresos)} m` : `<span style="color:var(--vg-danger);">-${fmtNum(row.metros_desperdicio)} m (${escHtml(row.accion)})</span>`}
        </td>
        <td>
          ${row.observaciones
            ? `<div style="background:var(--vg-warning-soft);padding:4px 8px;border-radius:6px;font-weight:700;font-size:11.5px;">📝 ${escHtml(row.observaciones)}</div>`
            : `<span style="color:var(--vg-text-muted);font-size:11px;">Sin notas</span>`}
        </td>
        <td style="white-space:nowrap;">
          <button class="vg-btn vg-btn-outline vg-btn-sm btn-nota-rapida" data-table="prod_impresiones" data-id="${row.id}" data-batch="${escHtml(row.batch_id)}" title="Agregar o editar nota">📝 Nota</button>
          <button class="vg-btn vg-btn-outline vg-btn-sm btn-chat-tag-job" data-id="${escHtml(row.batch_id)}" data-label="${escHtml(row.cliente_archivo.slice(0, 42))} (${fmtNum(row.metros_impresos)}m)" data-mod="Impresión" title="Hablar sobre este trabajo en el Chat">💬 #Chat</button>
          <button class="vg-btn vg-btn-outline vg-btn-sm btn-crud-edit" data-table="prod_impresiones" data-id="${row.id}" title="Editar cualquier dato">✏️</button>
          <button class="vg-btn vg-btn-danger vg-btn-sm btn-crud-del" data-table="prod_impresiones" data-id="${row.id}" title="Eliminar registro">🗑️</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ============================================================================
// MÓDULO 2: CALANDRADO (Fecha Manual Respetada, Kiosco 90dvh, Notas Visibles, Pronóstico de Tela, CRUD)
// ============================================================================
function renderModuloCalandrado() {
  const tbodyCola = document.getElementById("tbodyColaCalandrado");
  const tbodyHist = document.getElementById("tbodyHistorialCalandrado");
  if (!tbodyCola || !tbodyHist) return;

  const pendientes = STATE.colaCalandrado.filter(c => !String(c.estado).toLowerCase().includes("terminado") && cumpleBusquedaUniversal(c));
  const terminados = STATE.colaCalandrado.filter(c => String(c.estado).toLowerCase().includes("terminado") && cumpleFiltroFecha(c.fecha_terminado || c.fecha_hora) && cumpleBusquedaUniversal(c));

  // Resumen de Tela Requerida (Pronóstico por Tela/Color)
  const mapaTelas = {};
  pendientes.forEach(p => {
    const key = `${p.tela_destino || "Sin especificar"} (${p.color_tela || "Blanco"})`;
    mapaTelas[key] = (mapaTelas[key] || 0) + (Number(p.metros) || 0);
  });
  const pronosticoEl = document.getElementById("calPronosticoTelas");
  if (pronosticoEl) {
    const entries = Object.entries(mapaTelas);
    pronosticoEl.innerHTML = entries.length > 0
      ? entries.map(([k, m]) => `<span class="vg-badge vg-badge-cal">👕 ${escHtml(k)}: <strong>${fmtNum(m)} m</strong></span>`).join(" ")
      : `<span style="color:var(--vg-text-muted);font-size:12px;">No hay metros pendientes de calandrar.</span>`;
  }

  if (pendientes.length === 0) {
    tbodyCola.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--vg-text-muted);">No hay trabajos pendientes en Cola de Calandrado.</td></tr>`;
  } else {
    tbodyCola.innerHTML = pendientes.map(c => {
      const esAnidado = String(c.cliente_archivo || "").includes(" | ");
      const cantAnidados = esAnidado ? String(c.cliente_archivo).split(" | ").length : 1;
      return `
        <tr>
          <td style="font-family:var(--vg-font-mono);font-size:11.5px;">${fmtDateHora(c.fecha_hora)}</td>
          <td><strong>${escHtml(c.id_rollo_papel)}</strong></td>
          <td>
            ${c.prioritario ? `<span class="vg-badge vg-badge-danger">🚨 PRIORIDAD MÁXIMA</span> ` : ""}
            ${esAnidado ? `<span class="vg-badge vg-badge-laser">📦 ANIDADO (${cantAnidados})</span><br/>` : ""}
            <strong>${escHtml(c.cliente_archivo)}</strong>
          </td>
          <td>
            <strong>${escHtml(c.tela_destino || "-")}</strong>
            ${c.num_rollo_tela ? `<span class="vg-badge vg-badge-ok">R#${escHtml(c.num_rollo_tela)}</span>` : ""}
            <div style="font-size:11px;color:var(--vg-text-secondary);">${escHtml(c.color_tela || "")}</div>
          </td>
          <td style="font-family:var(--vg-font-mono);font-weight:900;">${fmtNum(c.metros)} m</td>
          <td>
            ${c.ruta && c.ruta.includes("Láser")
              ? `<span class="vg-badge vg-badge-laser">🔥+⚡ Pasa a Láser</span>`
              : `<span class="vg-badge vg-badge-cal">🔥 Solo Calandrado</span>`}
          </td>
          <td>
            ${c.observaciones
              ? `<div style="background:var(--vg-warning-soft);padding:4px 8px;border-radius:6px;font-weight:700;font-size:11.5px;">📝 ${escHtml(c.observaciones)}</div>`
              : `<span style="color:var(--vg-text-muted);font-size:11px;">Sin notas</span>`}
          </td>
          <td style="white-space:nowrap;">
            <button class="vg-btn vg-btn-success vg-btn-sm btn-cal-terminar" data-id="${c.id}" title="Marcar como Calandrado (respeta la fecha manual si elegiste una)">✅ Hecho</button>
            <button class="vg-btn vg-btn-primary vg-btn-sm btn-cal-kiosco" data-id="${c.id}" title="Abrir Modo Kiosco adaptativo">🖥️ Kiosco</button>
            <button class="vg-btn vg-btn-warning vg-btn-sm btn-cal-falla" data-id="${c.id}" title="Reportar falla de calandrado y enviar reposición urgente">⚠️ Falla</button>
            <button class="vg-btn vg-btn-outline vg-btn-sm btn-nota-rapida" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}">📝</button>
            <button class="vg-btn vg-btn-outline vg-btn-sm btn-crud-edit" data-table="prod_cola_calandrado" data-id="${c.id}">✏️</button>
            <button class="vg-btn vg-btn-danger vg-btn-sm btn-crud-del" data-table="prod_cola_calandrado" data-id="${c.id}">🗑️</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  tbodyHist.innerHTML = terminados.length === 0
    ? `<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--vg-text-muted);">No hay trabajos calandrados en el período seleccionado.</td></tr>`
    : terminados.map(c => `
      <tr>
        <td style="font-family:var(--vg-font-mono);font-size:11.5px;">
          <div>Fin: <strong>${fmtDateHora(c.fecha_terminado || c.fecha_hora)}</strong></div>
          <div style="font-size:10.5px;color:var(--vg-text-muted);">Imp: ${fmtDateHora(c.fecha_hora)}</div>
        </td>
        <td><strong>${escHtml(c.id_rollo_papel)}</strong></td>
        <td><strong>${escHtml(c.cliente_archivo)}</strong></td>
        <td>${escHtml(c.tela_destino || "-")} ${c.num_rollo_tela ? `(R#${escHtml(c.num_rollo_tela)})` : ""}</td>
        <td style="font-family:var(--vg-font-mono);font-weight:800;">${fmtNum(c.metros)} m</td>
        <td>${escHtml(c.temperatura || 205)}°C / ${escHtml(c.velocidad || 50)}</td>
        <td>${c.observaciones ? `<div style="background:var(--vg-warning-soft);padding:3px 6px;border-radius:6px;font-size:11px;">📝 ${escHtml(c.observaciones)}</div>` : "-"}</td>
        <td style="white-space:nowrap;">
          <button class="vg-btn vg-btn-outline vg-btn-sm btn-nota-rapida" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}">📝</button>
          <button class="vg-btn vg-btn-outline vg-btn-sm btn-crud-edit" data-table="prod_cola_calandrado" data-id="${c.id}">✏️</button>
          <button class="vg-btn vg-btn-danger vg-btn-sm btn-crud-del" data-table="prod_cola_calandrado" data-id="${c.id}">🗑️</button>
        </td>
      </tr>
    `).join("");
}

// ============================================================================
// MÓDULO 3: CORTE LÁSER (Trabajos Anidados Agrupados por batch_id para cortar de 1 solo clic)
// ============================================================================
function agruparLaserPorBatch(filas) {
  const mapa = new Map();
  filas.forEach(r => {
    const key = r.batch_id || r.id;
    if (!mapa.has(key)) {
      mapa.set(key, {
        batch_id: key,
        ids: [r.id],
        filasOriginales: [r],
        fecha_ingreso: r.fecha_ingreso,
        fecha_terminado: r.fecha_terminado,
        id_rollo_papel: r.id_rollo_papel,
        archivos: String(r.cliente_archivo || "").split(" | ").filter(Boolean),
        tela_rollo_color: r.tela_rollo_color,
        metros_totales: Number(r.metros) || 0,
        velocidad: r.velocidad || 35,
        poder: r.poder || 90,
        estado: r.estado,
        observaciones: r.observaciones || ""
      });
    } else {
      const g = mapa.get(key);
      g.ids.push(r.id);
      g.filasOriginales.push(r);
      const nuevosArch = String(r.cliente_archivo || "").split(" | ").filter(Boolean);
      nuevosArch.forEach(a => { if (!g.archivos.includes(a)) g.archivos.push(a); });
      g.metros_totales += Number(r.metros) || 0;
      if (r.observaciones && !g.observaciones.includes(r.observaciones)) {
        g.observaciones = g.observaciones ? `${g.observaciones} | ${r.observaciones}` : r.observaciones;
      }
    }
  });
  return Array.from(mapa.values());
}

function renderModuloLaser() {
  const tbodyCola = document.getElementById("tbodyColaLaser");
  const tbodyHist = document.getElementById("tbodyHistorialLaser");
  if (!tbodyCola || !tbodyHist) return;

  const pendRaw = STATE.colaLaser.filter(l => !String(l.estado).toLowerCase().includes("terminado") && cumpleBusquedaUniversal(l));
  const termRaw = STATE.colaLaser.filter(l => String(l.estado).toLowerCase().includes("terminado") && cumpleFiltroFecha(l.fecha_terminado || l.fecha_ingreso) && cumpleBusquedaUniversal(l));

  const lotesPendientes = agruparLaserPorBatch(pendRaw);
  const lotesTerminados = agruparLaserPorBatch(termRaw);

  tbodyCola.innerHTML = lotesPendientes.length === 0
    ? `<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--vg-text-muted);">No hay lotes pendientes en Corte Láser.</td></tr>`
    : lotesPendientes.map(g => {
      const esAnidado = g.archivos.length > 1;
      return `
        <tr>
          <td style="font-family:var(--vg-font-mono);font-size:11.5px;">${fmtDateHora(g.fecha_ingreso)}</td>
          <td><strong>${escHtml(g.id_rollo_papel)}</strong></td>
          <td>
            ${esAnidado
              ? `<span class="vg-badge vg-badge-laser" style="margin-bottom:4px;">📦 LOTE ANIDADO AGRUPADO (${g.archivos.length} archivos — Se marcan juntos con 1 clic)</span>`
              : `<span class="vg-badge vg-badge-ok" style="margin-bottom:4px;">Archivo Individual</span>`}
            <div style="font-weight:800;margin-top:2px;">${g.archivos.map(a => `• ${escHtml(a)}`).join("<br/>")}</div>
          </td>
          <td><strong>${escHtml(g.tela_rollo_color || "-")}</strong></td>
          <td style="font-family:var(--vg-font-mono);font-weight:900;font-size:14px;">${fmtNum(g.metros_totales)} m</td>
          <td>Vel: ${escHtml(g.velocidad)} | Poder: <strong>${escHtml(g.poder)}%</strong></td>
          <td>
            ${g.observaciones
              ? `<div style="background:var(--vg-warning-soft);padding:4px 8px;border-radius:6px;font-weight:700;font-size:11.5px;">📝 ${escHtml(g.observaciones)}</div>`
              : `<span style="color:var(--vg-text-muted);font-size:11px;">Sin notas</span>`}
          </td>
          <td style="white-space:nowrap;">
            <button class="vg-btn vg-btn-success vg-btn-sm btn-laser-cortar-lote" data-batch="${escHtml(g.batch_id)}" data-ids="${g.ids.join(",")}">
              ⚡ Cortar ${esAnidado ? "Lote Anidado" : "Trabajo"}
            </button>
            <button class="vg-btn vg-btn-outline vg-btn-sm btn-nota-rapida" data-table="prod_cola_laser" data-id="${g.ids[0]}" data-batch="${escHtml(g.batch_id)}">📝</button>
            <button class="vg-btn vg-btn-outline vg-btn-sm btn-crud-edit" data-table="prod_cola_laser" data-id="${g.ids[0]}">✏️</button>
            <button class="vg-btn vg-btn-danger vg-btn-sm btn-crud-del" data-table="prod_cola_laser" data-id="${g.ids[0]}">🗑️</button>
          </td>
        </tr>
      `;
    }).join("");

  tbodyHist.innerHTML = lotesTerminados.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--vg-text-muted);">No hay cortes láser finalizados en este período.</td></tr>`
    : lotesTerminados.map(g => `
      <tr>
        <td style="font-family:var(--vg-font-mono);font-size:11.5px;">${fmtDateHora(g.fecha_terminado || g.fecha_ingreso)}</td>
        <td><strong>${escHtml(g.id_rollo_papel)}</strong></td>
        <td>
          ${g.archivos.length > 1 ? `<span class="vg-badge vg-badge-laser">📦 Anidado (${g.archivos.length})</span><br/>` : ""}
          <strong>${g.archivos.map(a => escHtml(a)).join(" | ")}</strong>
        </td>
        <td>${escHtml(g.tela_rollo_color || "-")}</td>
        <td style="font-family:var(--vg-font-mono);font-weight:800;">${fmtNum(g.metros_totales)} m</td>
        <td>${g.observaciones ? `<div style="background:var(--vg-warning-soft);padding:3px 6px;border-radius:6px;font-size:11px;">📝 ${escHtml(g.observaciones)}</div>` : "-"}</td>
        <td style="white-space:nowrap;">
          <button class="vg-btn vg-btn-outline vg-btn-sm btn-crud-edit" data-table="prod_cola_laser" data-id="${g.ids[0]}">✏️</button>
          <button class="vg-btn vg-btn-danger vg-btn-sm btn-crud-del" data-table="prod_cola_laser" data-id="${g.ids[0]}">🗑️</button>
        </td>
      </tr>
    `).join("");
}

// ============================================================================
// MÓDULO 4: NUEVO MÓDULO DTF (Rollos 60cm x 100m, Escala Precios, Repo/Muestra $0, Cuentas Clientes)
// ============================================================================
function renderModuloDTF() {
  const kpiWrap = document.getElementById("dtfRollosKpiContainer");
  const tbodyPend = document.getElementById("tbodyPendientesDTF");
  const tbodyPedidos = document.getElementById("tbodyPedidosDTF");
  const tbodyCuentas = document.getElementById("tbodyCuentasClientesDTF");
  if (!kpiWrap) return;

  // Select de rollos en el formulario DTF
  const selRollo = document.getElementById("dtfInputRollo");
  if (selRollo && selRollo.options.length === 0) {
    selRollo.innerHTML = STATE.dtfRollosSaldos.map(r =>
      `<option value="${escHtml(r.id_rollo_dtf)}">${escHtml(r.id_rollo_dtf)} — ${escHtml(r.marca_fabricante)} (${fmtNum(r.metros_restantes_reales)}m disp.)</option>`
    ).join("");
  }

  kpiWrap.innerHTML = STATE.dtfRollosSaldos.map(r => `
    <div class="vg-kpi-box" style="border-left-color: ${r.estado === "Activo" ? "var(--vg-purple)" : "var(--vg-border-strong)"};">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="vg-kpi-label">🎞️ ${escHtml(r.id_rollo_dtf)} (${escHtml(r.estado)})</span>
        <button class="vg-btn vg-btn-outline vg-btn-sm btn-crud-edit" data-table="prod_dtf_rollos" data-id="${escHtml(r.id_rollo_dtf)}">✏️</button>
      </div>
      <div class="vg-kpi-value">${fmtNum(r.metros_restantes_reales)} m <span style="font-size:12px;color:var(--vg-text-muted);">/ ${fmtNum(r.metros_iniciales)}m</span></div>
      <div class="vg-kpi-sub">Marca: <strong>${escHtml(r.marca_fabricante)}</strong> | Perfil: <strong>${escHtml(r.perfil_impresion)}</strong></div>
    </div>
  `).join("");

  // Archivos DTF pendientes en Drive
  const pendDtf = STATE.pendientesDrive.filter(p => p.modulo === "DTF" && p.estado_impreso !== "SI" && cumpleBusquedaUniversal(p));
  if (tbodyPend) {
    tbodyPend.innerHTML = pendDtf.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--vg-text-muted);">Sin archivos DTF pendientes en Drive.</td></tr>`
      : pendDtf.map(p => {
        const cargo = p.es_repo_muestra || "VENTA";
        const precioUnit = calcularPrecioMetroDTF(p.metros_totales, cargo);
        return `
          <tr>
            <td><strong>${escHtml(p.cliente)}</strong></td>
            <td>
              <strong>${escHtml(p.nombre_archivo)}</strong>
              ${p.discrepancia_medida ? `<div class="vg-badge vg-badge-danger">⚠️ Discrepancia: Nombre dice ${fmtNum(p.metros_totales)}m vs DPI Real ${fmtNum(p.metros_dpi_real)}m</div>` : ""}
            </td>
            <td style="font-family:var(--vg-font-mono);font-weight:800;">${fmtNum(p.metros_totales)} m</td>
            <td>
              ${cargo === "REPOSICION"
                ? `<span class="vg-badge vg-badge-danger">🔄 REPOSICIÓN ($0)</span>`
                : cargo === "MUESTRA"
                  ? `<span class="vg-badge vg-badge-cal">🧪 MUESTRA ($0)</span>`
                  : `<span class="vg-badge vg-badge-ok">💲 VENTA (${fmtMoney(precioUnit)}/m)</span>`}
            </td>
            <td style="font-family:var(--vg-font-mono);font-weight:900;">${fmtMoney(precioUnit * (Number(p.metros_totales) || 0))}</td>
            <td>
              <button class="vg-btn vg-btn-primary vg-btn-sm btn-dtf-cargar-pend" data-id="${p.id}">➕ Cargar a Tirada</button>
              <button class="vg-btn vg-btn-outline vg-btn-sm btn-crud-edit" data-table="prod_pendientes_drive" data-id="${p.id}">✏️</button>
            </td>
          </tr>
        `;
      }).join("");
  }

  // Pedidos DTF y Cobranzas
  const pedidosFilt = STATE.dtfPedidos.filter(d => cumpleFiltroFecha(d.fecha_hora) && cumpleBusquedaUniversal(d));
  if (tbodyPedidos) {
    tbodyPedidos.innerHTML = pedidosFilt.length === 0
      ? `<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--vg-text-muted);">No hay pedidos DTF en el período seleccionado.</td></tr>`
      : pedidosFilt.map(d => {
        const saldo = (Number(d.subtotal_cobrar) || 0) - (Number(d.monto_pagado) || 0);
        return `
          <tr>
            <td style="font-family:var(--vg-font-mono);font-size:11.5px;">${fmtDateHora(d.fecha_hora)}</td>
            <td><strong>${escHtml(d.cliente)}</strong></td>
            <td>
              <strong>${escHtml(d.nombre_archivo)}</strong>
              ${d.observaciones ? `<div style="font-size:11px;color:var(--vg-text-secondary);">📝 ${escHtml(d.observaciones)}</div>` : ""}
            </td>
            <td>
              ${d.tipo_cargo === "REPOSICION"
                ? `<span class="vg-badge vg-badge-danger">REPOSICIÓN ($0)</span>`
                : d.tipo_cargo === "MUESTRA"
                  ? `<span class="vg-badge vg-badge-cal">MUESTRA ($0)</span>`
                  : `<span class="vg-badge vg-badge-ok">VENTA</span>`}
            </td>
            <td style="font-family:var(--vg-font-mono);font-weight:800;">${fmtNum(d.metros_archivo)} m</td>
            <td style="font-family:var(--vg-font-mono);">${fmtMoney(d.precio_metro)}/m</td>
            <td style="font-family:var(--vg-font-mono);font-weight:900;">${fmtMoney(d.subtotal_cobrar)}</td>
            <td>
              <span class="vg-badge ${saldo <= 0 ? "vg-badge-ok" : "vg-badge-danger"}">
                ${saldo <= 0 ? "✅ Pagado" : `Debe ${fmtMoney(saldo)}`}
              </span>
              <div style="font-size:10.5px;color:var(--vg-text-muted);">${escHtml(d.modalidad_pago)}</div>
            </td>
            <td style="white-space:nowrap;">
              ${saldo > 0 ? `<button class="vg-btn vg-btn-success vg-btn-sm btn-dtf-saldar" data-id="${d.id}" data-total="${d.subtotal_cobrar}">💵 Saldar</button>` : ""}
              <button class="vg-btn vg-btn-outline vg-btn-sm btn-crud-edit" data-table="prod_dtf_pedidos" data-id="${d.id}">✏️</button>
              <button class="vg-btn vg-btn-danger vg-btn-sm btn-crud-del" data-table="prod_dtf_pedidos" data-id="${d.id}">🗑️</button>
            </td>
          </tr>
        `;
      }).join("");
  }

  // Cuentas Corrientes de Clientes DTF
  if (tbodyCuentas) {
    tbodyCuentas.innerHTML = STATE.dtfCuentasClientes.map(c => `
      <tr>
        <td><strong>${escHtml(c.cliente_nombre)}</strong></td>
        <td style="font-family:var(--vg-font-mono);">${fmtNum(c.metros_comprados)} m</td>
        <td style="font-family:var(--vg-font-mono);">${fmtNum(c.metros_reposicion)} m</td>
        <td style="font-family:var(--vg-font-mono);">${fmtNum(c.metros_muestras)} m</td>
        <td style="font-family:var(--vg-font-mono);font-weight:800;">${fmtMoney(c.total_facturado)}</td>
        <td style="font-family:var(--vg-font-mono);color:var(--vg-success);font-weight:800;">${fmtMoney(c.total_abonado)}</td>
        <td style="font-family:var(--vg-font-mono);color:${Number(c.saldo_pendiente) > 0 ? "var(--vg-danger)" : "var(--vg-success)"};font-weight:900;">
          ${fmtMoney(c.saldo_pendiente)}
        </td>
      </tr>
    `).join("");
  }
}

// ============================================================================
// MÓDULO 5: CHAT INTERNO DE TALLER EN TIEMPO REAL (@Menciones, #Trabajos, Fotos Cámara WebP)
// ============================================================================
function renderModuloChat() {
  const feedEl = document.getElementById("chatFeedContainer");
  const modalFeedEl = document.getElementById("modalChatFeedContainer");
  const selTrabajo = document.getElementById("chatSelectTrabajo");
  const chipsMencion = document.getElementById("chatChipsMencion");

  // Poblar selector de trabajos activos para #arrobar
  if (selTrabajo && selTrabajo.options.length <= 1) {
    const opciones = [`<option value=""># Vincular a un Trabajo (Opcional)...</option>`];
    STATE.impresiones.slice(0, 15).forEach(i => {
      opciones.push(`<option value="IMP|${escHtml(i.batch_id)}|${escHtml(i.cliente_archivo.slice(0, 40))} (${fmtNum(i.metros_impresos)}m)">🖨️ [Imp] ${escHtml(i.cliente_archivo.slice(0, 45))} (${fmtNum(i.metros_impresos)}m)</option>`);
    });
    STATE.dtfPedidos.slice(0, 10).forEach(d => {
      opciones.push(`<option value="DTF|${escHtml(d.id)}|${escHtml(d.cliente)} - ${escHtml(d.nombre_archivo.slice(0, 30))}">🎞️ [DTF] ${escHtml(d.cliente)} — ${escHtml(d.nombre_archivo.slice(0, 35))}</option>`);
    });
    selTrabajo.innerHTML = opciones.join("");
  }

  // Poblar chips rápidos de @Miembros del equipo
  if (chipsMencion) {
    const miembros = STATE.catalogos.filter(c => c.tipo === "EQUIPO");
    chipsMencion.innerHTML = miembros.map(m => `
      <button type="button" class="vg-chip btn-chat-mention" data-mention="${escHtml(m.nombre)}">
        @${escHtml(m.nombre)}
      </button>
    `).join("");
    chipsMencion.querySelectorAll(".btn-chat-mention").forEach(btn => {
      btn.addEventListener("click", () => {
        const nom = btn.getAttribute("data-mention");
        const inp = document.getElementById("chatInputMensaje");
        if (inp) {
          inp.value = `${inp.value ? inp.value + " " : ""}@${nom} `;
          inp.focus();
        }
      });
    });
  }

  const msgs = STATE.chatMensajes.filter(m => {
    if (!cumpleBusquedaUniversal(m)) return false;
    if (STATE.canalChatActivo === "Todos") return true;
    if (STATE.canalChatActivo === "Mis Menciones") {
      return Array.isArray(m.menciones) && m.menciones.includes(STATE.usuarioActual);
    }
    return m.canal_area === STATE.canalChatActivo;
  });

  const html = msgs.length === 0
    ? `<div style="text-align:center;padding:24px;color:var(--vg-text-muted);">No hay mensajes en este canal. ¡Escribí el primero o adjuntá una foto!</div>`
    : msgs.map(m => {
      const meMenciona = Array.isArray(m.menciones) && m.menciones.includes(STATE.usuarioActual);
      return `
        <div class="vg-chat-msg ${meMenciona ? "mention-me" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div>
              <strong>👤 ${escHtml(m.autor_nombre)}</strong>
              <span class="vg-badge vg-badge-imp" style="margin-left:4px;">📍 ${escHtml(m.canal_area)}</span>
              ${meMenciona ? `<span class="vg-badge vg-badge-danger">🔔 Te mencionó</span>` : ""}
            </div>
            <div style="font-size:11px;color:var(--vg-text-muted);font-family:var(--vg-font-mono);">
              ${fmtDateHora(m.created_at)}
              <button class="vg-btn vg-btn-danger vg-btn-sm btn-crud-del" data-table="prod_chat_mensajes" data-id="${m.id}" style="margin-left:6px;padding:2px 6px;min-height:22px;">🗑️</button>
            </div>
          </div>
          <div style="margin-top:6px;font-size:13.5px;font-weight:600;white-space:pre-wrap;">${escHtml(m.mensaje)}</div>
          ${m.trabajo_etiqueta ? `
            <div class="vg-chat-job-card" onclick="window.vgBuscarTrabajoDesdeChat('${escHtml(m.trabajo_etiqueta.split("(")[0].trim())}')">
              🔗 #${escHtml(m.trabajo_modulo || "Trabajo")}: ${escHtml(m.trabajo_etiqueta)} (Ver en tabla)
            </div>
          ` : ""}
          ${m.foto_base64 ? `
            <div style="margin-top:8px;">
              <img src="${m.foto_base64}" alt="Foto adjunta del taller" style="max-width:260px;max-height:220px;border-radius:8px;border:1px solid var(--vg-border);cursor:pointer;" onclick="window.open(this.src)"/>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

  if (feedEl) feedEl.innerHTML = html;
  if (modalFeedEl) modalFeedEl.innerHTML = html;
}

window.vgBuscarTrabajoDesdeChat = (termino) => {
  STATE.busquedaGlobal = termino;
  const inp = document.getElementById("vgOmniSearchInput");
  if (inp) inp.value = termino;
  renderTodoRespetandoFormulario();
};

// ============================================================================
// MÓDULO 6: MÉTRICAS Y COMPARATIVAS POR PERÍODO (Hoy, Ayer, Semana Anterior, Rango)
// ============================================================================
function renderModuloMetricas() {
  const cont = document.getElementById("metricasComparativaContainer");
  if (!cont) return;

  const ahora = new Date();
  const hoyIni = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0);
  const ayerIni = new Date(hoyIni.getTime() - 86400000);
  const diaSem = ahora.getDay() || 7;
  const semActualIni = new Date(hoyIni.getTime() - (diaSem - 1) * 86400000);
  const semAntIni = new Date(semActualIni.getTime() - 7 * 86400000);

  const sumarRango = (arr, campoFecha, campoMetros, desde, hasta) =>
    arr.filter(r => {
      const f = new Date(r[campoFecha]);
      return !isNaN(f.getTime()) && f >= desde && (!hasta || f < hasta);
    }).reduce((a, b) => a + (Number(b[campoMetros]) || 0), 0);

  const impNormal = STATE.impresiones.filter(i => i.accion === "Impresion Normal");
  const calTerm = STATE.colaCalandrado.filter(c => String(c.estado).toLowerCase().includes("terminado"));
  const lasTerm = STATE.colaLaser.filter(l => String(l.estado).toLowerCase().includes("terminado"));

  const filas = [
    {
      estacion: "🖨️ Impresión Sublimación",
      hoy: sumarRango(impNormal, "fecha_hora", "metros_impresos", hoyIni, null),
      ayer: sumarRango(impNormal, "fecha_hora", "metros_impresos", ayerIni, hoyIni),
      semActual: sumarRango(impNormal, "fecha_hora", "metros_impresos", semActualIni, null),
      semAnt: sumarRango(impNormal, "fecha_hora", "metros_impresos", semAntIni, semActualIni)
    },
    {
      estacion: "🔥 Calandrado",
      hoy: sumarRango(calTerm, "fecha_terminado", "metros", hoyIni, null),
      ayer: sumarRango(calTerm, "fecha_terminado", "metros", ayerIni, hoyIni),
      semActual: sumarRango(calTerm, "fecha_terminado", "metros", semActualIni, null),
      semAnt: sumarRango(calTerm, "fecha_terminado", "metros", semAntIni, semActualIni)
    },
    {
      estacion: "⚡ Corte Láser",
      hoy: sumarRango(lasTerm, "fecha_terminado", "metros", hoyIni, null),
      ayer: sumarRango(lasTerm, "fecha_terminado", "metros", ayerIni, hoyIni),
      semActual: sumarRango(lasTerm, "fecha_terminado", "metros", semActualIni, null),
      semAnt: sumarRango(lasTerm, "fecha_terminado", "metros", semAntIni, semActualIni)
    },
    {
      estacion: "🎞️ DTF (Metros Impresos)",
      hoy: sumarRango(STATE.dtfPedidos, "fecha_hora", "metros_archivo", hoyIni, null),
      ayer: sumarRango(STATE.dtfPedidos, "fecha_hora", "metros_archivo", ayerIni, hoyIni),
      semActual: sumarRango(STATE.dtfPedidos, "fecha_hora", "metros_archivo", semActualIni, null),
      semAnt: sumarRango(STATE.dtfPedidos, "fecha_hora", "metros_archivo", semAntIni, semActualIni)
    }
  ];

  cont.innerHTML = filas.map(f => `
    <tr>
      <td><strong>${f.estacion}</strong></td>
      <td style="font-family:var(--vg-font-mono);font-weight:900;color:var(--vg-primary);">${fmtNum(f.hoy)} m</td>
      <td style="font-family:var(--vg-font-mono);font-weight:800;">${fmtNum(f.ayer)} m</td>
      <td style="font-family:var(--vg-font-mono);font-weight:900;color:var(--vg-success);">${fmtNum(f.semActual)} m</td>
      <td style="font-family:var(--vg-font-mono);font-weight:800;">${fmtNum(f.semAnt)} m</td>
    </tr>
  `).join("");
}

// Panel de Resultados Instantáneos de OmniSearch (Localizador Global en todas las áreas)
function renderResultadosOmnisearch() {
  const panel = document.getElementById("vgOmnisearchPanel");
  if (!panel) return;
  panel.style.display = "block";

  const impMatch = STATE.impresiones.filter(cumpleBusquedaUniversal).slice(0, 6);
  const calMatch = STATE.colaCalandrado.filter(cumpleBusquedaUniversal).slice(0, 6);
  const lasMatch = STATE.colaLaser.filter(cumpleBusquedaUniversal).slice(0, 6);
  const dtfMatch = STATE.dtfPedidos.filter(cumpleBusquedaUniversal).slice(0, 6);

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong>🔍 Resultados Globales para "${escHtml(STATE.busquedaGlobal)}" en todo el Taller:</strong>
      <button class="vg-btn vg-btn-outline vg-btn-sm" onclick="document.getElementById('vgOmniSearchClear').click()">✖ Cerrar Buscador</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;font-size:12px;">
      <div style="background:var(--vg-bg-elevated);padding:8px;border-radius:8px;border:1px solid var(--vg-border);">
        <strong>🖨️ Impresión (${impMatch.length})</strong>
        ${impMatch.map(i => `<div style="margin-top:4px;">• <strong>${escHtml(i.cliente_archivo.slice(0, 38))}</strong> — ${fmtNum(i.metros_impresos)}m (${escHtml(i.id_rollo_papel)})</div>`).join("") || `<div style="color:var(--vg-text-muted);">Sin coincidencias</div>`}
      </div>
      <div style="background:var(--vg-bg-elevated);padding:8px;border-radius:8px;border:1px solid var(--vg-border);">
        <strong>🔥 Calandrado (${calMatch.length})</strong>
        ${calMatch.map(c => `<div style="margin-top:4px;">• <strong>${escHtml(c.cliente_archivo.slice(0, 38))}</strong> — ${fmtNum(c.metros)}m [${escHtml(c.estado)}]</div>`).join("") || `<div style="color:var(--vg-text-muted);">Sin coincidencias</div>`}
      </div>
      <div style="background:var(--vg-bg-elevated);padding:8px;border-radius:8px;border:1px solid var(--vg-border);">
        <strong>⚡ Corte Láser (${lasMatch.length})</strong>
        ${lasMatch.map(l => `<div style="margin-top:4px;">• <strong>${escHtml(l.cliente_archivo.slice(0, 38))}</strong> — ${fmtNum(l.metros)}m [${escHtml(l.estado)}]</div>`).join("") || `<div style="color:var(--vg-text-muted);">Sin coincidencias</div>`}
      </div>
      <div style="background:var(--vg-bg-elevated);padding:8px;border-radius:8px;border:1px solid var(--vg-border);">
        <strong>🎞️ DTF (${dtfMatch.length})</strong>
        ${dtfMatch.map(d => `<div style="margin-top:4px;">• <strong>${escHtml(d.cliente)}</strong> (${escHtml(d.nombre_archivo.slice(0, 28))}) — ${fmtNum(d.metros_archivo)}m</div>`).join("") || `<div style="color:var(--vg-text-muted);">Sin coincidencias</div>`}
      </div>
    </div>
  `;
}

// ============================================================================
// ACCIONES OPERATIVAS Y MOTOR UNIVERSAL CRUD (Editar, Eliminar y Agregar en Todo el Sistema)
// ============================================================================
async function procesarImpresionLote() {
  const seleccionados = STATE.pendientesDrive.filter(p => STATE.impForm.archivosSeleccionadosIds.has(p.id));
  if (seleccionados.length === 0) {
    toast("Seleccioná al menos 1 archivo pendiente (o agregá uno manual) para procesar.", "warn");
    return;
  }

  const infoRollo = obtenerRolloPapelActivo();
  const batchId = `BATCH-${Date.now()}`;
  const fechaIso = STATE.impForm.fechaManual ? new Date(STATE.impForm.fechaManual).toISOString() : new Date().toISOString();

  const nombresUnidos = seleccionados.map(s => `${s.cliente} - ${s.nombre_archivo}`).join(" | ");
  const metrosTotales = seleccionados.reduce((acc, s) => acc + (Number(s.metros_totales) || 0), 0);
  const fileIdsUnidos = seleccionados.map(s => s.file_id || s.id).join(",");

  const tela = document.getElementById("impInput_tela")?.value.trim() || STATE.impForm.tela;
  const perfil = document.getElementById("impInput_perfil")?.value.trim() || STATE.impForm.perfil;
  const rolloTela = document.getElementById("impInput_rolloTela")?.value.trim() || STATE.impForm.rolloTela;
  const color = document.getElementById("impInput_color")?.value.trim() || STATE.impForm.color;
  const diseno = document.getElementById("impInput_diseno")?.value.trim() || STATE.impForm.diseno;
  const obs = document.getElementById("impInput_observaciones")?.value.trim() || STATE.impForm.observaciones;
  const ruta = STATE.impForm.ruta || "Solo Calandrado";

  // 1. Insertar en prod_impresiones (Agrupado bajo batch_id en el bloque actual)
  const { error: errImp } = await sb().from("prod_impresiones").insert({
    empresa_id: "vvgrafic-principal",
    batch_id: batchId,
    fecha_hora: fechaIso,
    id_rollo_papel: infoRollo.bloqueActual,
    id_rollo_base: infoRollo.idBase,
    cliente_archivo: nombresUnidos,
    diseno,
    tela_destino: tela,
    num_rollo_tela: rolloTela,
    color_tela: color,
    accion: "Impresion Normal",
    metros_impresos: metrosTotales,
    metros_desperdicio: 0,
    metros_restantes_snapshot: Math.max(0, infoRollo.restantes - metrosTotales),
    perfil,
    ruta,
    observaciones: obs,
    file_id: fileIdsUnidos
  });

  if (errImp) {
    toast("Error al registrar impresión: " + errImp.message, "error");
    return;
  }

  // 2. Si la ruta incluye Calandrado, enviarlo a prod_cola_calandrado conservando batch_id
  if (ruta.includes("Calandrado")) {
    await sb().from("prod_cola_calandrado").insert({
      empresa_id: "vvgrafic-principal",
      batch_id: batchId,
      fecha_hora: fechaIso,
      id_rollo_papel: infoRollo.bloqueActual,
      cliente_archivo: nombresUnidos,
      diseno,
      tela_destino: tela,
      num_rollo_tela: rolloTela,
      color_tela: color,
      metros: metrosTotales,
      perfil,
      ruta,
      observaciones: obs,
      estado: "Pendiente",
      file_id: fileIdsUnidos
    });
  }

  // 3. Marcar archivos como impresos en prod_pendientes_drive
  for (const s of seleccionados) {
    await sb().from("prod_pendientes_drive").update({ estado_impreso: "SI" }).eq("id", s.id);
  }

  // 4. Actualizar Ranking MRU (#1 pasa a ser inmediatamente el último usado)
  await Promise.all([
    registrarUsoMRU("TELA", tela),
    registrarUsoMRU("PERFIL", perfil),
    registrarUsoMRU("COLOR", color)
  ]);

  // 5. Limpiar formulario y quitar protección dirty
  STATE.impForm.dirty = false;
  STATE.impForm.archivosSeleccionadosIds.clear();
  STATE.impForm.diseno = "";
  STATE.impForm.observaciones = "";
  STATE.impForm.autoDetectInfo = "";
  sincronizarInputsImpresionConState();

  toast(`✅ Lote impreso (${fmtNum(metrosTotales)}m en ${infoRollo.bloqueActual}) y botones MRU actualizados.`);
  await cargarDatosTodo();
}

async function cortarBloquePapel4m() {
  const info = obtenerRolloPapelActivo();
  await sb().from("prod_impresiones").insert({
    empresa_id: "vvgrafic-principal",
    batch_id: `CORTE-${Date.now()}`,
    fecha_hora: new Date().toISOString(),
    id_rollo_papel: info.bloqueActual,
    id_rollo_base: info.idBase,
    cliente_archivo: `--- CORTE DE PAPEL (-4M) CIERRE DE ${info.bloqueActual} ---`,
    accion: "Corte de Papel (-4m)",
    metros_impresos: 0,
    metros_desperdicio: 4.0,
    metros_restantes_snapshot: Math.max(0, info.restantes - 4.0),
    ruta: "Interno",
    observaciones: "Corte de papel (-4m) y apertura de nuevo bloque"
  });
  toast(`✂️ Bloque ${info.bloqueActual} cerrado (-4m). Nuevo bloque habilitado.`);
  await cargarDatosTodo();
}

// Finalizar trabajo en Calandrado respetando Fecha Manual (Pedido #3) y pasando el lote anidado a Láser (Pedido #2)
async function finalizarTrabajoCalandrado(idCal, minutosExtra = 0) {
  const reg = STATE.colaCalandrado.find(c => c.id === idCal);
  if (!reg) return;

  const inputFechaManual = document.getElementById("calInputFechaManual")?.value;
  const fechaFinIso = inputFechaManual ? new Date(inputFechaManual).toISOString() : new Date().toISOString();

  await sb().from("prod_cola_calandrado").update({
    estado: "Terminado",
    fecha_terminado: fechaFinIso,
    minutos_trabajados: minutosExtra || reg.minutos_trabajados || Math.max(5, Math.round((Number(reg.metros) || 10) * 1.2))
  }).eq("id", idCal);

  // Si su ruta incluye Corte Láser, pasa a prod_cola_laser manteniendo su batch_id intacto
  if (String(reg.ruta || "").includes("Láser")) {
    await sb().from("prod_cola_laser").insert({
      empresa_id: "vvgrafic-principal",
      batch_id: reg.batch_id,
      fecha_ingreso: fechaFinIso,
      id_rollo_papel: reg.id_rollo_papel,
      cliente_archivo: reg.cliente_archivo,
      tela_rollo_color: `${reg.tela_destino || "-"} | Rollo #${reg.num_rollo_tela || "-"} | ${reg.color_tela || "Blanco"}`,
      metros: reg.metros,
      ruta: reg.ruta,
      velocidad: 35,
      poder: 90,
      estado: "Pendiente",
      observaciones: reg.observaciones || "",
      file_id: reg.file_id || ""
    });
  }

  toast(`🔥 Calandrado finalizado con fecha ${fmtDateHora(fechaFinIso)}${String(reg.ruta || "").includes("Láser") ? " y enviado agrupado a Corte Láser" : ""}.`);
  await cargarDatosTodo();
}

// Cortar Lote Anidado en Corte Láser de 1 solo clic
async function cortarLoteLaser(idsCsv) {
  const ids = String(idsCsv || "").split(",").filter(Boolean);
  if (ids.length === 0) return;
  const inputFechaLaser = document.getElementById("laserInputFechaManual")?.value;
  const fechaFinIso = inputFechaLaser ? new Date(inputFechaLaser).toISOString() : new Date().toISOString();

  for (const id of ids) {
    await sb().from("prod_cola_laser").update({
      estado: "Terminado",
      fecha_terminado: fechaFinIso
    }).eq("id", id);
  }
  toast(`⚡ Lote cortado en Láser (${ids.length} registro/s marcados juntos).`);
  await cargarDatosTodo();
}

// ============================================================================
// MODAL UNIVERSAL CRUD (EDITAR O AGREGAR CUALQUIER REGISTRO EN CUALQUIER TABLA)
// ============================================================================
const ESQUEMA_CAMPOS_CRUD = {
  prod_impresiones: [
    { key: "fecha_hora", label: "Fecha y Hora (ISO o YYYY-MM-DDTHH:mm)", type: "text" },
    { key: "id_rollo_papel", label: "Bloque / ID Rollo Papel (ej: 70g-1610-1-C1)", type: "text" },
    { key: "id_rollo_base", label: "ID Rollo Base (ej: 70g-1610-1)", type: "text" },
    { key: "cliente_archivo", label: "Cliente / Archivo(s)", type: "text" },
    { key: "diseno", label: "Diseño", type: "text" },
    { key: "tela_destino", label: "Tela Destino", type: "text" },
    { key: "num_rollo_tela", label: "Nº Rollo de Tela", type: "text" },
    { key: "color_tela", label: "Color de Tela", type: "text" },
    { key: "perfil", label: "Perfil de Impresión", type: "text" },
    { key: "ruta", label: "Ruta de Producción", type: "text" },
    { key: "metros_impresos", label: "Metros Impresos", type: "number" },
    { key: "metros_desperdicio", label: "Metros Merma / Desperdicio", type: "number" },
    { key: "observaciones", label: "Notas / Fallas / Especificaciones", type: "textarea" }
  ],
  prod_cola_calandrado: [
    { key: "fecha_hora", label: "Fecha Ingreso", type: "text" },
    { key: "fecha_terminado", label: "Fecha Terminado (Dejar vacío si Pendiente)", type: "text" },
    { key: "id_rollo_papel", label: "Bloque / ID Rollo Papel", type: "text" },
    { key: "cliente_archivo", label: "Cliente / Archivo(s)", type: "text" },
    { key: "tela_destino", label: "Tela Destino", type: "text" },
    { key: "num_rollo_tela", label: "Nº Rollo Tela", type: "text" },
    { key: "color_tela", label: "Color Tela", type: "text" },
    { key: "metros", label: "Metros", type: "number" },
    { key: "ruta", label: "Ruta de Producción", type: "text" },
    { key: "estado", label: "Estado (Pendiente / Terminado)", type: "text" },
    { key: "temperatura", label: "Temperatura (°C)", type: "number" },
    { key: "velocidad", label: "Velocidad", type: "number" },
    { key: "observaciones", label: "Notas / Especificaciones", type: "textarea" }
  ],
  prod_cola_laser: [
    { key: "fecha_ingreso", label: "Fecha Ingreso", type: "text" },
    { key: "fecha_terminado", label: "Fecha Terminado", type: "text" },
    { key: "batch_id", label: "ID de Lote Anidado (batch_id)", type: "text" },
    { key: "id_rollo_papel", label: "ID Rollo / Bloque", type: "text" },
    { key: "cliente_archivo", label: "Cliente / Archivo(s) (separar anidados con ' | ')", type: "textarea" },
    { key: "tela_rollo_color", label: "Tela / Rollo / Color", type: "text" },
    { key: "metros", label: "Metros", type: "number" },
    { key: "velocidad", label: "Velocidad Láser", type: "number" },
    { key: "poder", label: "Poder Láser (%)", type: "number" },
    { key: "estado", label: "Estado (Pendiente / Terminado)", type: "text" },
    { key: "observaciones", label: "Notas / Especificaciones", type: "textarea" }
  ],
  prod_pendientes_drive: [
    { key: "modulo", label: "Módulo (SUBLIMACION o DTF)", type: "text" },
    { key: "cliente", label: "Cliente", type: "text" },
    { key: "nombre_archivo", label: "Nombre del Archivo", type: "text" },
    { key: "metros_totales", label: "Metros Totales", type: "number" },
    { key: "perfil_detectado", label: "Perfil", type: "text" },
    { key: "tela_detectada", label: "Tela", type: "text" },
    { key: "rollo_detectado", label: "Nº Rollo", type: "text" },
    { key: "color_detectado", label: "Color", type: "text" },
    { key: "ruta_detectada", label: "Ruta", type: "text" },
    { key: "estado_impreso", label: "Estado Impreso (NO / SI)", type: "text" }
  ],
  prod_dtf_pedidos: [
    { key: "fecha_hora", label: "Fecha y Hora", type: "text" },
    { key: "cliente", label: "Cliente", type: "text" },
    { key: "nombre_archivo", label: "Nombre de Archivo", type: "text" },
    { key: "tipo_cargo", label: "Tipo Cargo (VENTA / REPOSICION / MUESTRA)", type: "text" },
    { key: "metros_archivo", label: "Metros del Archivo", type: "number" },
    { key: "precio_metro", label: "Precio por Metro ($)", type: "number" },
    { key: "subtotal_cobrar", label: "Subtotal a Cobrar ($)", type: "number" },
    { key: "monto_pagado", label: "Monto Abonado ($)", type: "number" },
    { key: "modalidad_pago", label: "Modalidad de Pago", type: "text" },
    { key: "estado_entrega", label: "Estado (Impreso / Entregado)", type: "text" },
    { key: "observaciones", label: "Notas / Observaciones", type: "textarea" }
  ],
  prod_dtf_rollos: [
    { key: "id_rollo_dtf", label: "Código Rollo DTF (ej: DTF-60-003)", type: "text" },
    { key: "marca_fabricante", label: "Marca / Fabricante", type: "text" },
    { key: "perfil_impresion", label: "Perfil de Impresión DTF", type: "text" },
    { key: "metros_iniciales", label: "Metros Iniciales (ej: 100)", type: "number" },
    { key: "estado", label: "Estado (Activo / En Stock / Terminado)", type: "text" },
    { key: "observaciones", label: "Observaciones", type: "textarea" }
  ]
};

function obtenerRegistroMemoria(tabla, id) {
  const map = {
    prod_impresiones: STATE.impresiones,
    prod_cola_calandrado: STATE.colaCalandrado,
    prod_cola_laser: STATE.colaLaser,
    prod_pendientes_drive: STATE.pendientesDrive,
    prod_dtf_pedidos: STATE.dtfPedidos,
    prod_dtf_rollos: STATE.dtfRollosSaldos
  };
  const arr = map[tabla] || [];
  return arr.find(r => String(r.id || r.id_rollo_dtf || r.id_rollo) === String(id));
}

function abrirModalCrudUniversal(tabla, id = null, valoresIniciales = {}) {
  const modal = document.getElementById("modalCrudUniversal");
  const body = document.getElementById("modalCrudBody");
  const title = document.getElementById("modalCrudTitle");
  if (!modal || !body) return;

  const campos = ESQUEMA_CAMPOS_CRUD[tabla] || [];
  const reg = id ? obtenerRegistroMemoria(tabla, id) : valoresIniciales;
  title.textContent = id ? `✏️ Editar Registro (${tabla})` : `➕ Agregar Registro Manual (${tabla})`;

  body.innerHTML = campos.map(c => {
    const val = reg && reg[c.key] !== undefined && reg[c.key] !== null ? reg[c.key] : "";
    if (c.type === "textarea") {
      return `
        <div>
          <label class="vg-label">${escHtml(c.label)}</label>
          <textarea class="vg-textarea" data-crud-key="${c.key}" rows="2">${escHtml(val)}</textarea>
        </div>
      `;
    }
    return `
      <div>
        <label class="vg-label">${escHtml(c.label)}</label>
        <input type="${c.type === "number" ? "number" : "text"}" step="any" class="vg-input" data-crud-key="${c.key}" value="${escHtml(val)}"/>
      </div>
    `;
  }).join("");

  modal.setAttribute("data-crud-table", tabla);
  modal.setAttribute("data-crud-id", id || "");
  modal.classList.add("open");
}

async function guardarModalCrudUniversal() {
  const modal = document.getElementById("modalCrudUniversal");
  const body = document.getElementById("modalCrudBody");
  if (!modal || !body) return;

  const tabla = modal.getAttribute("data-crud-table");
  const id = modal.getAttribute("data-crud-id");
  const payload = {};

  body.querySelectorAll("[data-crud-key]").forEach(inp => {
    const k = inp.getAttribute("data-crud-key");
    let v = inp.value;
    if (inp.type === "number") v = parseFloat(v) || 0;
    else if (v === "" && (k.includes("fecha_terminado"))) v = null;
    payload[k] = v;
  });

  const pkCol = tabla === "prod_dtf_rollos" ? "id_rollo_dtf" : tabla === "prod_rollos_papel" ? "id_rollo" : "id";

  if (id) {
    const { error } = await sb().from(tabla).update(payload).eq(pkCol, id);
    if (error) { toast("Error al actualizar: " + error.message, "error"); return; }
    toast("✅ Registro actualizado y saldos recalculados.");
  } else {
    payload.empresa_id = "vvgrafic-principal";
    if (tabla === "prod_impresiones" || tabla === "prod_cola_calandrado" || tabla === "prod_cola_laser") {
      if (!payload.batch_id) payload.batch_id = `MANUAL-${Date.now()}`;
    }
    const { error } = await sb().from(tabla).insert(payload);
    if (error) { toast("Error al crear: " + error.message, "error"); return; }
    toast("✅ Registro agregado manualmente.");
  }

  modal.classList.remove("open");
  await cargarDatosTodo();
}

async function eliminarRegistroCrudUniversal(tabla, id) {
  if (!confirm("¿Confirmás eliminar este registro? Los metros y saldos se recalcularán automáticamente.")) return;
  const pkCol = tabla === "prod_dtf_rollos" ? "id_rollo_dtf" : tabla === "prod_rollos_papel" ? "id_rollo" : "id";
  const { error } = await sb().from(tabla).delete().eq(pkCol, id);
  if (error) {
    toast("Error al eliminar: " + error.message, "error");
    return;
  }
  toast("🗑️ Registro eliminado y saldos actualizados.");
  await cargarDatosTodo();
}

// Sincronizar Nota Rápida en todas las estaciones que compartan el mismo batch_id
async function editarNotaRapida(tabla, id, batchId) {
  const reg = obtenerRegistroMemoria(tabla, id);
  const actual = reg?.observaciones || "";
  const nueva = prompt("📝 Escribí o editá la Nota / Especificación / Falla para este trabajo:", actual);
  if (nueva === null) return;

  await sb().from(tabla).update({ observaciones: nueva }).eq("id", id);
  if (batchId) {
    await Promise.all([
      sb().from("prod_impresiones").update({ observaciones: nueva }).eq("batch_id", batchId),
      sb().from("prod_cola_calandrado").update({ observaciones: nueva }).eq("batch_id", batchId),
      sb().from("prod_cola_laser").update({ observaciones: nueva }).eq("batch_id", batchId)
    ]);
  }
  toast("📝 Nota guardada y sincronizada en toda la ruta del trabajo.");
  await cargarDatosTodo();
}

// ============================================================================
// INICIALIZACIÓN DE EVENTOS DE INTERFAZ
// ============================================================================
export function inicializarEventosUI() {
  // 1. Navegación de Pestañas
  document.querySelectorAll(".vg-tab-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      STATE.tabActiva = tab;
      document.querySelectorAll(".vg-tab-btn[data-tab]").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".vg-module-section").forEach(sec => {
        sec.style.display = sec.id === `sec-${tab}` ? "block" : "none";
      });
    });
  });

  // 2. Filtros de Período Temporal (Hoy, Ayer, Esta Semana, Semana Anterior, Este Mes, Custom)
  document.querySelectorAll(".vg-period-pill[data-period]").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.periodoActivo = btn.getAttribute("data-period");
      document.querySelectorAll(".vg-period-pill[data-period]").forEach(b => b.classList.toggle("active", b === btn));
      renderTodoRespetandoFormulario();
    });
  });

  const inpDesde = document.getElementById("vgDateDesde");
  const inpHasta = document.getElementById("vgDateHasta");
  [inpDesde, inpHasta].forEach(inp => {
    if (!inp) return;
    inp.addEventListener("change", () => {
      STATE.fechaDesde = inpDesde.value;
      STATE.fechaHasta = inpHasta.value;
      STATE.periodoActivo = "custom";
      document.querySelectorAll(".vg-period-pill[data-period]").forEach(b => b.classList.remove("active"));
      renderTodoRespetandoFormulario();
    });
  });

  // 3. Buscador Universal Instantáneo (OmniSearch)
  const omniInput = document.getElementById("vgOmniSearchInput");
  const omniClear = document.getElementById("vgOmniSearchClear");
  if (omniInput) {
    omniInput.addEventListener("input", () => {
      STATE.busquedaGlobal = omniInput.value;
      renderTodoRespetandoFormulario();
    });
  }
  if (omniClear) {
    omniClear.addEventListener("click", () => {
      STATE.busquedaGlobal = "";
      if (omniInput) omniInput.value = "";
      renderTodoRespetandoFormulario();
    });
  }

  // 4. Protección Dirty-Form en inputs de Impresión
  ["perfil", "tela", "rolloTela", "color", "diseno", "observaciones"].forEach(campo => {
    const el = document.getElementById(`impInput_${campo}`);
    if (el) {
      el.addEventListener("input", () => {
        STATE.impForm.dirty = true;
        STATE.impForm[campo] = el.value;
        actualizarClasesSeleccionChips();
      });
    }
  });

  // 5. Botones Táctiles de Ruta de Producción
  document.querySelectorAll("button[data-ruta-val]").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.impForm.dirty = true;
      STATE.impForm.ruta = btn.getAttribute("data-ruta-val");
      actualizarBotonesRutaUI();
    });
  });

  // 6. Acciones de Impresión, Montar Rollo (Kiosco 90dvh) y Corte (-4m)
  document.getElementById("btnConfirmarImpresion")?.addEventListener("click", procesarImpresionLote);
  document.getElementById("btnCortarPapel4m")?.addEventListener("click", cortarBloquePapel4m);
  document.getElementById("btnAbrirModalMontarRollo")?.addEventListener("click", () => {
    document.getElementById("modalMontarRollo")?.classList.add("open");
  });
  document.getElementById("btnConfirmarMontarRollo")?.addEventListener("click", async () => {
    const gramaje = document.getElementById("montarRolloGramaje")?.value || "70";
    const metros = parseFloat(document.getElementById("montarRolloMetros")?.value) || 200;
    const obs = document.getElementById("montarRolloObs")?.value || "";
    const hoy = new Date();
    const ddmm = String(hoy.getDate()).padStart(2, "0") + String(hoy.getMonth() + 1).padStart(2, "0");
    const nuevoId = `${gramaje}g-${ddmm}-${STATE.rollosPapelSaldos.length + 1}`;

    await sb().from("prod_rollos_papel").update({ estado: "Terminado" }).eq("estado", "Activo");
    await sb().from("prod_rollos_papel").insert({
      id_rollo: nuevoId,
      empresa_id: "vvgrafic-principal",
      gramaje,
      metros_iniciales: metros,
      estado: "Activo",
      observaciones: obs
    });
    document.getElementById("modalMontarRollo")?.classList.remove("open");
    toast(`🧻 Nuevo rollo ${nuevoId} (${metros}m) montado y activo.`);
    await cargarDatosTodo();
  });

  // 7. Lector Binario Real de DPI y Geometría de Archivos (Sublimación / DTF)
  const inpFileDpi = document.getElementById("inpInspectorArchivosLocales");
  if (inpFileDpi) {
    inpFileDpi.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      const catObj = {
        telas: STATE.catalogos.filter(c => c.tipo === "TELA").map(c => c.nombre),
        perfiles: STATE.catalogos.filter(c => c.tipo === "PERFIL").map(c => c.nombre),
        colores: STATE.catalogos.filter(c => c.tipo === "COLOR").map(c => c.nombre)
      };
      for (const f of files) {
        const parsed = parsearNombreArchivoInteligente(f.name, "CARGA LOCAL", catObj);
        const geo = await leerGeometriaRealArchivo(f);
        const metrosFinal = parsed.metrosTotales > 0 ? parsed.metrosTotales : geo.metrosDpiReal || 1.0;
        const discrepancia = parsed.metrosTotales > 0 && geo.metrosDpiReal > 0 && Math.abs(parsed.metrosTotales - geo.metrosDpiReal) > 0.15;

        await sb().from("prod_pendientes_drive").upsert({
          empresa_id: "vvgrafic-principal",
          modulo: STATE.tabActiva === "dtf" ? "DTF" : "SUBLIMACION",
          cliente: f.name.split(/[-–(]/)[0]?.trim() || "CLIENTE LOCAL",
          nombre_archivo: f.name,
          medida_unitaria: metrosFinal,
          repeticiones: parsed.repeticiones || 1,
          metros_totales: metrosFinal,
          metros_dpi_real: geo.metrosDpiReal || metrosFinal,
          dpi_detectado: geo.dpiDetectado,
          discrepancia_medida: discrepancia,
          perfil_detectado: parsed.perfil,
          tela_detectada: parsed.tela,
          rollo_detectado: parsed.rollo,
          color_detectado: parsed.color,
          ruta_detectada: parsed.ruta,
          es_repo_muestra: parsed.tipoCargo === "VENTA" ? "" : parsed.tipoCargo,
          estado_impreso: "NO",
          file_id: `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        }, { onConflict: "file_id" });
      }
      toast(`🔬 ${files.length} archivo(s) analizados por nombre y cabecera binaria DPI.`);
      await cargarDatosTodo();
    });
  }

  // 8. Sincronizar con Google Drive real (Modo 100% Solo Lectura vía Puente Sandbox)
  document.getElementById("btnSyncDriveSandbox")?.addEventListener("click", async () => {
    const url = window.VG_CONEXION?.sandboxBridgeUrl;
    if (!url) return;
    toast("🔄 Escaneando Drive y Sheet real en modo solo lectura...");
    try {
      await fetch(`${url}?action=sync_drive`, { mode: "no-cors" });
      setTimeout(() => {
        cargarDatosTodo();
        toast("✅ Sincronización con Drive completada.");
      }, 2500);
    } catch (e) {
      toast("ℹ️ Datos del clon listos.", "info");
    }
  });

  // 9. Módulo DTF: Calculadora en vivo y Registro de Pedido / Tirada
  const dtfMetrosInp = document.getElementById("dtfInputMetrosArchivo");
  const dtfCargoSel = document.getElementById("dtfInputTipoCargo");
  const dtfArchivoInp = document.getElementById("dtfInputArchivo");
  const dtfClienteInp = document.getElementById("dtfInputCliente");

  const recalcularPreviewDTF = () => {
    const m = parseFloat(dtfMetrosInp?.value) || 0;
    const cargo = dtfCargoSel?.value || "VENTA";
    const nom = dtfArchivoInp?.value || "";
    const cli = dtfClienteInp?.value || "";

    // Autodetectar (repo) o (muestra) del nombre de archivo DTF
    let cargoEfectivo = cargo;
    if (/\(\s*repo(?:sicion|sición)?\s*\)|\brepo\b/i.test(nom)) {
      cargoEfectivo = "REPOSICION";
      if (dtfCargoSel) dtfCargoSel.value = "REPOSICION";
    } else if (/\(\s*muestra\s*\)|\bmuestra\b/i.test(nom)) {
      cargoEfectivo = "MUESTRA";
      if (dtfCargoSel) dtfCargoSel.value = "MUESTRA";
    }

    const precioMetro = calcularPrecioMetroDTF(m, cargoEfectivo);
    const subtotal = cargoEfectivo === "VENTA" ? m * precioMetro : 0;
    const previewEl = document.getElementById("dtfPrecioPreviewBox");
    if (previewEl) {
      previewEl.innerHTML = `
        Tarifa aplicada: <strong>${fmtMoney(precioMetro)}/m</strong> (${cargoEfectivo})
        → Total a cobrar: <strong style="font-size:15px;color:var(--vg-primary);">${fmtMoney(subtotal)}</strong>
      `;
    }

    // Alerta de Archivo Duplicado en DTF
    const dupAlert = document.getElementById("dtfDuplicateAlert");
    if (dupAlert && nom.trim().length > 3) {
      const yaExiste = STATE.dtfPedidos.find(p =>
        p.nombre_archivo.toLowerCase() === nom.trim().toLowerCase() &&
        (!cli || p.cliente.toLowerCase() === cli.trim().toLowerCase())
      );
      if (yaExiste && cargoEfectivo === "VENTA") {
        dupAlert.style.display = "block";
        dupAlert.innerHTML = `⚠️ <strong>ALERTA DE DUPLICADO:</strong> El archivo "${escHtml(nom)}" ya fue impreso el ${fmtDateHora(yaExiste.fecha_hora)}. Si es una reposición, agregale <code>(repo)</code> o cambiá el cargo a Reposición ($0).`;
      } else {
        dupAlert.style.display = "none";
      }
    }
  };

  [dtfMetrosInp, dtfCargoSel, dtfArchivoInp, dtfClienteInp].forEach(el => {
    if (el) el.addEventListener("input", recalcularPreviewDTF);
    if (el) el.addEventListener("change", recalcularPreviewDTF);
  });

  document.getElementById("btnRegistrarPedidoDTF")?.addEventListener("click", async () => {
    const cliente = dtfClienteInp?.value.trim() || "CLIENTE DTF";
    const archivo = dtfArchivoInp?.value.trim() || "Archivo DTF.png";
    const metrosArch = parseFloat(dtfMetrosInp?.value) || 1;
    const metrosRollo = parseFloat(document.getElementById("dtfInputMetrosRolloFisico")?.value) || metrosArch;
    const idRollo = document.getElementById("dtfInputRollo")?.value || "DTF-60-001";
    const cargo = dtfCargoSel?.value || "VENTA";
    const pagado = parseFloat(document.getElementById("dtfInputMontoPagado")?.value) || 0;
    const modalidad = document.getElementById("dtfInputModalidadPago")?.value || "Paga al retirar";
    const obs = document.getElementById("dtfInputObs")?.value.trim() || "";

    const precioM = calcularPrecioMetroDTF(metrosArch, cargo);
    const subtotal = cargo === "VENTA" ? metrosArch * precioM : 0;

    // 1. Registrar tirada física de rollo DTF
    const { data: tiradaData } = await sb().from("prod_dtf_tiradas").insert({
      empresa_id: "vvgrafic-principal",
      codigo_tirada: `DTF-${Date.now().toString().slice(-5)}`,
      id_rollo_dtf: idRollo,
      es_anidado: metrosRollo !== metrosArch,
      metros_consumidos_rollo: metrosRollo,
      observaciones: obs
    }).select();

    // 2. Registrar pedido en cuenta del cliente
    await sb().from("prod_dtf_pedidos").insert({
      empresa_id: "vvgrafic-principal",
      tirada_id: tiradaData?.[0]?.id || null,
      cliente,
      nombre_archivo: archivo,
      tipo_cargo: cargo,
      metros_archivo: metrosArch,
      metros_facturados: cargo === "VENTA" ? metrosArch : 0,
      precio_metro: precioM,
      subtotal_cobrar: subtotal,
      monto_pagado: pagado,
      modalidad_pago: modalidad,
      estado_entrega: "Impreso",
      observaciones: obs
    });

    toast(`🎞️ Trabajo DTF registrado (${fmtNum(metrosArch)}m cliente / ${fmtNum(metrosRollo)}m rollo).`);
    if (dtfArchivoInp) dtfArchivoInp.value = "";
    await cargarDatosTodo();
  });

  // 10. Chat Interno de Taller: Envío de Mensajes, @Menciones, #Trabajos y Cámara WebP
  const inpFotoChat = document.getElementById("chatInputFotoCamara");
  if (inpFotoChat) {
    inpFotoChat.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      STATE.chatFotoBase64 = await comprimirFotoCamaraWebP(f);
      const prev = document.getElementById("chatFotoPreviewBadge");
      if (prev) {
        prev.style.display = "inline-flex";
        prev.textContent = "📷 Foto WebP lista para enviar";
      }
    });
  }

  document.getElementById("btnEnviarMensajeChat")?.addEventListener("click", async () => {
    const inp = document.getElementById("chatInputMensaje");
    const texto = inp?.value.trim() || "";
    if (!texto && !STATE.chatFotoBase64) return;

    const canal = document.getElementById("chatSelectCanal")?.value || "General";
    const selTrab = document.getElementById("chatSelectTrabajo")?.value || "";
    let trabMod = "", trabId = "", trabEtiq = "";
    if (selTrab) {
      const parts = selTrab.split("|");
      trabMod = parts[0] || "";
      trabId = parts[1] || "";
      trabEtiq = parts[2] || "";
    }

    // Extraer @menciones del texto
    const miembros = STATE.catalogos.filter(c => c.tipo === "EQUIPO").map(c => c.nombre);
    const menciones = miembros.filter(m => texto.toLowerCase().includes(`@${m.toLowerCase()}`));

    await sb().from("prod_chat_mensajes").insert({
      empresa_id: "vvgrafic-principal",
      autor_nombre: STATE.usuarioActual,
      autor_area: STATE.areaActual,
      canal_area: canal,
      menciones,
      trabajo_id: trabId,
      trabajo_etiqueta: trabEtiq,
      trabajo_modulo: trabMod,
      mensaje: texto || "📷 Foto adjunta de taller",
      foto_base64: STATE.chatFotoBase64 || ""
    });

    // Si vinculó un #Trabajo, agregamos la nota al trabajo automáticamente
    if (trabId && trabMod === "IMP") {
      const impRow = STATE.impresiones.find(i => i.batch_id === trabId);
      const obsPrev = impRow?.observaciones ? impRow.observaciones + " | " : "";
      const nuevaObs = `${obsPrev}💬 [${STATE.usuarioActual}]: ${texto}`;
      await Promise.all([
        sb().from("prod_impresiones").update({ observaciones: nuevaObs }).eq("batch_id", trabId),
        sb().from("prod_cola_calandrado").update({ observaciones: nuevaObs }).eq("batch_id", trabId),
        sb().from("prod_cola_laser").update({ observaciones: nuevaObs }).eq("batch_id", trabId)
      ]);
    }

    if (inp) inp.value = "";
    STATE.chatFotoBase64 = "";
    const prev = document.getElementById("chatFotoPreviewBadge");
    if (prev) prev.style.display = "none";
    toast("💬 Mensaje enviado en tiempo real.");
    await cargarDatosTodo();
  });

  // 11. Delegación global de clics en tablas (CRUD, Notas, Kiosco, Láser, DTF)
  document.body.addEventListener("click", async (e) => {
    const btnEdit = e.target.closest(".btn-crud-edit");
    if (btnEdit) {
      abrirModalCrudUniversal(btnEdit.getAttribute("data-table"), btnEdit.getAttribute("data-id"));
      return;
    }
    const btnDel = e.target.closest(".btn-crud-del");
    if (btnDel) {
      eliminarRegistroCrudUniversal(btnDel.getAttribute("data-table"), btnDel.getAttribute("data-id"));
      return;
    }
    const btnAddManual = e.target.closest(".btn-crud-add");
    if (btnAddManual) {
      abrirModalCrudUniversal(btnAddManual.getAttribute("data-table"), null, {
        fecha_hora: new Date().toISOString(),
        fecha_ingreso: new Date().toISOString(),
        id_rollo_papel: obtenerRolloPapelActivo().bloqueActual,
        id_rollo_base: obtenerRolloPapelActivo().idBase,
        modulo: STATE.tabActiva === "dtf" ? "DTF" : "SUBLIMACION",
        estado: "Pendiente",
        estado_impreso: "NO"
      });
      return;
    }
    const btnNota = e.target.closest(".btn-nota-rapida");
    if (btnNota) {
      editarNotaRapida(btnNota.getAttribute("data-table"), btnNota.getAttribute("data-id"), btnNota.getAttribute("data-batch"));
      return;
    }
    const btnCalTerm = e.target.closest(".btn-cal-terminar");
    if (btnCalTerm) {
      finalizarTrabajoCalandrado(btnCalTerm.getAttribute("data-id"));
      return;
    }
    const btnCalKiosco = e.target.closest(".btn-cal-kiosco");
    if (btnCalKiosco) {
      abrirKioscoCalandra(btnCalKiosco.getAttribute("data-id"));
      return;
    }
    const btnCalFalla = e.target.closest(".btn-cal-falla");
    if (btnCalFalla) {
      reportarFallaCalandraConReposicion(btnCalFalla.getAttribute("data-id"));
      return;
    }
    const btnLasCorte = e.target.closest(".btn-laser-cortar-lote");
    if (btnLasCorte) {
      cortarLoteLaser(btnLasCorte.getAttribute("data-ids"));
      return;
    }
    const btnDtfSaldar = e.target.closest(".btn-dtf-saldar");
    if (btnDtfSaldar) {
      const id = btnDtfSaldar.getAttribute("data-id");
      const tot = parseFloat(btnDtfSaldar.getAttribute("data-total")) || 0;
      await sb().from("prod_dtf_pedidos").update({ monto_pagado: tot, estado_entrega: "Entregado" }).eq("id", id);
      toast("💵 Pago registrado y saldo actualizado.");
      await cargarDatosTodo();
      return;
    }
    const btnDtfPend = e.target.closest(".btn-dtf-cargar-pend");
    if (btnDtfPend) {
      const p = STATE.pendientesDrive.find(x => x.id === btnDtfPend.getAttribute("data-id"));
      if (p) {
        if (dtfClienteInp) dtfClienteInp.value = p.cliente;
        if (dtfArchivoInp) dtfArchivoInp.value = p.nombre_archivo;
        if (dtfMetrosInp) dtfMetrosInp.value = p.metros_totales;
        if (dtfCargoSel) dtfCargoSel.value = p.es_repo_muestra || "VENTA";
        recalcularPreviewDTF();
        toast("📋 Archivo cargado en el formulario DTF.");
      }
      return;
    }
    const btnChatTag = e.target.closest(".btn-chat-tag-job");
    if (btnChatTag) {
      const id = btnChatTag.getAttribute("data-id");
      const label = btnChatTag.getAttribute("data-label");
      // Cambiar a pestaña chat y preseleccionar este trabajo
      document.querySelector('.vg-tab-btn[data-tab="chat"]')?.click();
      const sel = document.getElementById("chatSelectTrabajo");
      if (sel) {
        const optVal = `IMP|${id}|${label}`;
        const opt = document.createElement("option");
        opt.value = optVal;
        opt.textContent = `🔗 #${label}`;
        sel.appendChild(opt);
        sel.value = optVal;
      }
      document.getElementById("chatInputMensaje")?.focus();
      return;
    }
  });

  // Botón guardar del Modal CRUD Universal
  document.getElementById("btnGuardarModalCrud")?.addEventListener("click", guardarModalCrudUniversal);

  // Cerrar cualquier modal con .vg-modal-close
  document.querySelectorAll(".vg-modal-close").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.closest(".vg-modal-backdrop")?.classList.remove("open");
    });
  });

  // Selector de Operador Actual (para @menciones)
  const selOp = document.getElementById("vgSelectOperadorActual");
  if (selOp) {
    selOp.value = STATE.usuarioActual;
    selOp.addEventListener("change", () => {
      STATE.usuarioActual = selOp.value;
      localStorage.setItem("vg_operador_actual", STATE.usuarioActual);
      renderTodoRespetandoFormulario();
    });
  }

  // Filtros de Canal en Chat
  document.querySelectorAll(".btn-canal-chat").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.canalChatActivo = btn.getAttribute("data-canal");
      document.querySelectorAll(".btn-canal-chat").forEach(b => b.classList.toggle("active", b === btn));
      renderModuloChat();
    });
  });

  // Modo Oscuro / Claro opcional
  document.getElementById("btnToggleDarkTheme")?.addEventListener("click", () => {
    document.body.classList.toggle("theme-dark");
  });
}

// Kiosco Responsivo 90dvh para Calandrado
function abrirKioscoCalandra(idCal) {
  const reg = STATE.colaCalandrado.find(c => c.id === idCal);
  if (!reg) return;
  const modal = document.getElementById("modalKioscoOperativo");
  if (!modal) return;

  STATE.kiosco.abierto = true;
  STATE.kiosco.registroIds = [idCal];
  STATE.kiosco.inicioMs = Date.now();

  document.getElementById("kioscoTitulo").textContent = `🔥 KIOSCO CALANDRADO — ${reg.id_rollo_papel}`;
  document.getElementById("kioscoSubtitulo").innerHTML = `
    <div style="font-size:16px;font-weight:900;margin-bottom:6px;">${escHtml(reg.cliente_archivo)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <span class="vg-badge vg-badge-cal">👕 Tela: ${escHtml(reg.tela_destino || "-")} (Rollo #${escHtml(reg.num_rollo_tela || "-")})</span>
      <span class="vg-badge vg-badge-ok">📏 Metros: ${fmtNum(reg.metros)} m</span>
      <span class="vg-badge vg-badge-laser">🛤️ Ruta: ${escHtml(reg.ruta)}</span>
    </div>
    ${reg.observaciones ? `<div style="margin-top:10px;padding:10px;background:var(--vg-warning-soft);border-radius:8px;font-weight:800;">📝 Nota: ${escHtml(reg.observaciones)}</div>` : ""}
  `;

  modal.classList.add("open");
  if (STATE.kiosco.timerInterval) clearInterval(STATE.kiosco.timerInterval);
  STATE.kiosco.timerInterval = setInterval(() => {
    const seg = Math.floor((Date.now() - STATE.kiosco.inicioMs) / 1000);
    const mm = String(Math.floor(seg / 60)).padStart(2, "0");
    const ss = String(seg % 60).padStart(2, "0");
    const el = document.getElementById("kioscoCronometro");
    if (el) el.textContent = `${mm}:${ss}`;
  }, 1000);

  document.getElementById("btnKioscoFinalizar").onclick = async () => {
    clearInterval(STATE.kiosco.timerInterval);
    const min = Math.max(1, Math.round((Date.now() - STATE.kiosco.inicioMs) / 60000));
    modal.classList.remove("open");
    await finalizarTrabajoCalandrado(idCal, min);
  };
}

// Reportar Falla en Calandra y Clonar Automáticamente a Impresión con Prioridad Máxima
async function reportarFallaCalandraConReposicion(idCal) {
  const reg = STATE.colaCalandrado.find(c => c.id === idCal);
  if (!reg) return;
  const metrosFalla = parseFloat(prompt(`⚠️ ¿Cuántos metros salieron con falla en "${reg.cliente_archivo}"?`, reg.metros)) || 0;
  if (metrosFalla <= 0) return;
  const motivo = prompt("Describí el motivo de la falla (ej: Mancha de rodillo, arruga de tela):", "Defecto en calandrado") || "Falla en calandra";

  await sb().from("prod_fallas_reposiciones").insert({
    empresa_id: "vvgrafic-principal",
    tipo_registro: "ALERTA_REPOSICION",
    estacion: "Calandrado",
    id_rollo: reg.id_rollo_papel,
    batch_id: reg.batch_id,
    archivo_afectado: reg.cliente_archivo,
    tela: reg.tela_destino,
    metros_merma: metrosFalla,
    detalle_reposicion: `Reimprimir ${metrosFalla}m por falla en calandra`,
    motivo,
    estado: "Pendiente"
  });

  // Clonar automáticamente a Pendientes de Impresión con Prioridad Máxima
  await sb().from("prod_pendientes_drive").insert({
    empresa_id: "vvgrafic-principal",
    modulo: "SUBLIMACION",
    cliente: "🚨 REPOSICIÓN CALANDRA",
    nombre_archivo: `[REPO URGENTE] ${reg.cliente_archivo}`,
    medida_unitaria: metrosFalla,
    repeticiones: 1,
    metros_totales: metrosFalla,
    perfil_detectado: reg.perfil,
    tela_detectada: reg.tela_destino,
    rollo_detectado: reg.num_rollo_tela,
    color_detectado: reg.color_tela,
    ruta_detectada: reg.ruta,
    prioridad_maxima: true,
    estado_impreso: "NO",
    file_id: `REPO-CAL-${Date.now()}`
  });

  toast(`🚨 Falla registrada y orden de reposición (${fmtNum(metrosFalla)}m) enviada a Impresión con Prioridad Máxima.`, "warn");
  await cargarDatosTodo();
}

// Arranque automático
window.addEventListener("DOMContentLoaded", () => {
  inicializarEventosUI();
  cargarDatosTodo();
  suscribirRealtime();
});
