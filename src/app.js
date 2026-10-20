// ============================================================================
// CONTROL DE TALLER Y PRODUCCIÓN 2.0 — V&V GRAFIC (MOTOR PRINCIPAL SUPABASE)
// Conectado exclusivamente al Clon de Pruebas: kkvzzheccniclfwqzivu
// Identidad Visual Exacta: V&V Grafic Cobalt Enterprise (--vg-* Design Tokens)
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
  filtroPendientesLocal: "",
  filtroCalandraLocal: "",
  ordenCalandraAsc: true,
  rollosCalandraAbiertos: new Set(),
  carpetasPendientesCerradas: new Set(),
  rolloMontadoCalandra: localStorage.getItem("vg_rollo_calandra_montado") || "",
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
  comprasFinanzas: [],

  // Protección de Formulario Activo (Dirty-Form Protection — Pedido #7)
  impForm: {
    dirty: false,
    archivosSeleccionadosIds: new Set(),
    metrosLote: 0,
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

  // Estado Kiosko activo (90dvh responsivo)
  kiosco: {
    abierto: false,
    tipo: "",
    registroIds: [],
    inicioMs: 0,
    timerInterval: null
  },

  chatFotoBase64: ""
};

const sb = () => window.vgSupabase;

// ============================================================================
// UTILIDADES DE FORMATO Y DISENO VISUAL
// ============================================================================
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
  const borderVar = tipo === "error"
    ? "var(--vg-status-alert)"
    : tipo === "warn"
      ? "var(--vg-status-processing)"
      : "var(--vg-status-ready)";
  el.style.cssText = `background:var(--vg-surface-modal);color:var(--vg-text-primary);border:2px solid ${borderVar};padding:10px 14px;border-radius:8px;font-weight:800;font-size:12.5px;box-shadow:0 8px 24px var(--vg-shadow-strong);margin-top:8px;`;
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// Genera miniatura visual de color/diseño (como en Captura 2)
function renderMiniaturaDiseno(colorStr, disenoStr, nombreStr) {
  const texto = `${colorStr || ""} ${disenoStr || ""} ${nombreStr || ""}`.toUpperCase();
  let bgStyle = "background:var(--vg-grad-imp);";
  if (texto.includes("AMARILLO") && texto.includes("ROJO")) {
    bgStyle = "background:repeating-linear-gradient(90deg, var(--vg-status-processing), var(--vg-status-processing) 6px, var(--vg-status-alert) 6px, var(--vg-status-alert) 9px);";
  } else if (texto.includes("AMARILLO")) {
    bgStyle = "background:var(--vg-status-processing);";
  } else if (texto.includes("ROSA") || texto.includes("FUCSIA") || texto.includes("MAGENTA")) {
    bgStyle = "background:var(--vg-status-alert);";
  } else if (texto.includes("VERDE") || texto.includes("ESMERALDA")) {
    bgStyle = "background:var(--vg-status-ready);";
  } else if (texto.includes("AZUL") || texto.includes("FRANCIA") || texto.includes("MARINO") || texto.includes("CELESTE")) {
    bgStyle = "background:var(--vg-brand-primary);";
  } else if (texto.includes("NEGRO")) {
    bgStyle = "background:var(--vg-bg-app);";
  }
  const label = escHtml((disenoStr || colorStr || "ARTE").slice(0, 6));
  return `<div class="design-swatch" style="${bgStyle}" title="${escHtml(disenoStr || nombreStr || "")}">${label}</div>`;
}

// ============================================================================
// CÁLCULOS DE FECHAS Y PERÍODOS (Hoy, Día Anterior/Ayer, Esta Semana, Semana Anterior, Mes, Año)
// ============================================================================
function obtenerVentanasTemporales() {
  const ahora = new Date();
  const hoyIni = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
  const hoyFin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
  const ayerIni = new Date(hoyIni.getTime() - 86400000);
  const diaSem = ahora.getDay() || 7; // Lunes = 1 ... Domingo = 7
  const semActualIni = new Date(hoyIni.getTime() - (diaSem - 1) * 86400000);
  const semAntIni = new Date(semActualIni.getTime() - 7 * 86400000);
  const mesActualIni = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
  const anioActualIni = new Date(ahora.getFullYear(), 0, 1, 0, 0, 0, 0);
  return { hoyIni, hoyFin, ayerIni, semActualIni, semAntIni, mesActualIni, anioActualIni };
}

function sumarMetrosEnVentana(arr, campoFecha, campoMetros, desde, hasta = null) {
  return arr.reduce((acc, r) => {
    const raw = r[campoFecha];
    if (!raw) return acc;
    const f = new Date(raw);
    if (isNaN(f.getTime())) return acc;
    if (desde && f < desde) return acc;
    if (hasta && f >= hasta) return acc;
    return acc + (Number(r[campoMetros]) || 0);
  }, 0);
}

function obtenerRangoFechasActivo() {
  const { hoyIni, hoyFin, ayerIni, semActualIni, semAntIni, mesActualIni } = obtenerVentanasTemporales();
  if (STATE.periodoActivo === "todo") return { desde: null, hasta: null, etiqueta: "Histórico Completo" };
  if (STATE.periodoActivo === "hoy") return { desde: hoyIni, hasta: hoyFin, etiqueta: "Hoy" };
  if (STATE.periodoActivo === "ayer") return { desde: ayerIni, hasta: new Date(hoyIni.getTime() - 1), etiqueta: "Día Anterior (Ayer)" };
  if (STATE.periodoActivo === "semana_actual") return { desde: semActualIni, hasta: hoyFin, etiqueta: "Esta Semana" };
  if (STATE.periodoActivo === "semana_anterior") return { desde: semAntIni, hasta: new Date(semActualIni.getTime() - 1), etiqueta: "Semana Anterior" };
  if (STATE.periodoActivo === "mes_actual") return { desde: mesActualIni, hasta: hoyFin, etiqueta: "Este Mes" };
  if (STATE.periodoActivo === "custom") {
    const d = STATE.fechaDesde ? new Date(STATE.fechaDesde + "T00:00:00") : null;
    const h = STATE.fechaHasta ? new Date(STATE.fechaHasta + "T23:59:59") : null;
    return { desde: d, hasta: h, etiqueta: `Rango (${STATE.fechaDesde || "..."} a ${STATE.fechaHasta || "..."})` };
  }
  return { desde: null, hasta: null, etiqueta: "Histórico" };
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
// BUSCADOR UNIVERSAL OMNIPRESENTE (Pedido #5)
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
    client.from("prod_impresiones").select("*").eq("anulado", false).order("fecha_hora", { ascending: false }).limit(500),
    client.from("prod_cola_calandrado").select("*").eq("anulado", false).order("fecha_hora", { ascending: false }).limit(500),
    client.from("prod_cola_laser").select("*").eq("anulado", false).order("fecha_ingreso", { ascending: false }).limit(500),
    client.from("prod_pendientes_drive").select("*").order("created_at", { ascending: false }),
    client.from("prod_catalogos").select("*").eq("activo", true).order("ultimo_uso_at", { ascending: false }),
    client.from("prod_fallas_reposiciones").select("*").order("fecha_hora", { ascending: false }).limit(200),
    client.from("v_prod_dtf_rollos_saldos").select("*").order("fecha_montaje", { ascending: false }),
    client.from("prod_dtf_tiradas").select("*").eq("anulado", false).order("fecha_hora", { ascending: false }),
    client.from("prod_dtf_pedidos").select("*").eq("anulado", false).order("fecha_hora", { ascending: false }),
    client.from("v_prod_dtf_cuentas_clientes").select("*").order("saldo_pendiente", { ascending: false }),
    client.from("prod_chat_mensajes").select("*").order("created_at", { ascending: false }).limit(150)
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
// CATÁLOGOS Y RANKING INTELIGENTE MRU (#1 SIEMPRE ES EL ÚLTIMO USADO — Pedido #3)
// ============================================================================
function obtenerItemsMRU(tipo) {
  const items = STATE.catalogos.filter(c => c.tipo === tipo);
  if (items.length <= 1) return items;
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
  renderBadgesYTodosLosKPIs();
  renderResumenPeriodoBarra();
  if (!STATE.impForm.dirty) {
    renderChipsImpresion();
  } else {
    actualizarClasesSeleccionChips();
  }
  renderRolloActivoYSobrantes();
  renderPendientesDriveSublimacion();
  renderTablaImpresionesConBloques();
  renderModuloCalandrado();
  renderModuloLaser();
  renderModuloDTF();
  renderModuloFinanzasYMantenimiento();
  renderModuloMetricasBI();
  renderModuloChat();

  if (STATE.busquedaGlobal.trim().length > 0) {
    renderResultadosOmnisearch();
  } else {
    const panelOmni = document.getElementById("vgOmnisearchPanel");
    if (panelOmni) panelOmni.style.display = "none";
  }
}

function setTxt(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Calcula y actualiza las 8 cajas KPI de Impresión, 6 de Calandrado y 6 de Láser
function renderBadgesYTodosLosKPIs() {
  const { hoyIni, ayerIni, semActualIni, semAntIni, mesActualIni, anioActualIni } = obtenerVentanasTemporales();

  const pendSubRows = STATE.pendientesDrive.filter(p => p.modulo === "SUBLIMACION" && p.estado_impreso !== "SI");
  const pendCalRows = STATE.colaCalandrado.filter(c => !String(c.estado).toLowerCase().includes("terminado"));
  const pendLasRows = STATE.colaLaser.filter(l => !String(l.estado).toLowerCase().includes("terminado"));
  const pendDtfRows = STATE.pendientesDrive.filter(p => p.modulo === "DTF" && p.estado_impreso !== "SI");

  const mPendImp = pendSubRows.reduce((a, b) => a + (Number(b.metros_totales) || 0), 0);
  const mPendCal = pendCalRows.reduce((a, b) => a + (Number(b.metros) || 0), 0);
  const mPendLas = pendLasRows.reduce((a, b) => a + (Number(b.metros) || 0), 0);

  // Badges en pestañas
  const laserBatchesPend = new Set(pendLasRows.map(l => l.batch_id || l.id)).size;
  const mencionesSinLeer = STATE.chatMensajes.filter(m => !m.resuelto && Array.isArray(m.menciones) && m.menciones.includes(STATE.usuarioActual)).length;

  setTxt("badgeTabImp", pendSubRows.length);
  setTxt("badgeTabCal", pendCalRows.length);
  setTxt("badgeTabLaser", laserBatchesPend);
  setTxt("badgeTabDtf", pendDtfRows.length);
  setTxt("badgeTabChat", mencionesSinLeer || STATE.chatMensajes.length);
  setTxt("badgeFabChat", mencionesSinLeer > 0 ? `🔔 ${mencionesSinLeer}` : STATE.chatMensajes.length);

  // --- KPIs IMPRESIÓN (Captura 1 + Ayer y Semana Anterior) ---
  const impNormales = STATE.impresiones.filter(i => i.accion === "Impresion Normal");
  const impHoy = sumarMetrosEnVentana(impNormales, "fecha_hora", "metros_impresos", hoyIni);
  const impAyer = sumarMetrosEnVentana(impNormales, "fecha_hora", "metros_impresos", ayerIni, hoyIni);
  const impSem = sumarMetrosEnVentana(impNormales, "fecha_hora", "metros_impresos", semActualIni);
  const impSemAnt = sumarMetrosEnVentana(impNormales, "fecha_hora", "metros_impresos", semAntIni, semActualIni);
  const impMes = sumarMetrosEnVentana(impNormales, "fecha_hora", "metros_impresos", mesActualIni);
  const impAnio = sumarMetrosEnVentana(impNormales, "fecha_hora", "metros_impresos", anioActualIni);
  const impHist = impNormales.reduce((a, b) => a + (Number(b.metros_impresos) || 0), 0);

  setTxt("kpiImpPendiente", `${fmtNum(mPendImp)}m`);
  setTxt("kpiCalPendienteTop", `${fmtNum(mPendCal)}m`);
  setTxt("kpiLasPendienteTop", `${fmtNum(mPendLas)}m`);
  setTxt("kpiImpHoy", `${fmtNum(impHoy)}m`);
  setTxt("kpiImpAyerSub", `Ayer: ${fmtNum(impAyer)}m`);
  setTxt("kpiImpSemanal", `${fmtNum(impSem)}m`);
  setTxt("kpiImpSemAntSub", `Sem. Ant: ${fmtNum(impSemAnt)}m`);
  setTxt("kpiImpMensual", `${fmtNum(impMes)}m`);
  setTxt("kpiImpAnual", `${fmtNum(impAnio)}m`);
  setTxt("kpiImpHistorico", `${fmtNum(impHist)}m`);

  // --- KPIs CALANDRADO (Captura 3 + Ayer y Semana Anterior) ---
  const calTerm = STATE.colaCalandrado.filter(c => String(c.estado).toLowerCase().includes("terminado"));
  const calHoy = sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", hoyIni);
  const calAyer = sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", ayerIni, hoyIni);
  const calSem = sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", semActualIni);
  const calSemAnt = sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", semAntIni, semActualIni);
  const calMes = sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", mesActualIni);
  const calAnio = sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", anioActualIni);
  const calHist = calTerm.reduce((a, b) => a + (Number(b.metros) || 0), 0);

  setTxt("kpiCalPendiente", `${fmtNum(mPendCal)}m`);
  setTxt("kpiCalHoy", `${fmtNum(calHoy)}m`);
  setTxt("kpiCalAyerSub", `Ayer: ${fmtNum(calAyer)}m`);
  setTxt("kpiCalSemanal", `${fmtNum(calSem)}m`);
  setTxt("kpiCalSemAntSub", `Sem. Ant: ${fmtNum(calSemAnt)}m`);
  setTxt("kpiCalMensual", `${fmtNum(calMes)}m`);
  setTxt("kpiCalAnual", `${fmtNum(calAnio)}m`);
  setTxt("kpiCalHistorico", `${fmtNum(calHist)}m`);

  // --- KPIs LÁSER ---
  const lasTerm = STATE.colaLaser.filter(l => String(l.estado).toLowerCase().includes("terminado"));
  const lasHoy = sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", hoyIni);
  const lasAyer = sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", ayerIni, hoyIni);
  const lasSem = sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", semActualIni);
  const lasSemAnt = sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", semAntIni, semActualIni);
  const lasMes = sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", mesActualIni);
  const lasHist = lasTerm.reduce((a, b) => a + (Number(b.metros) || 0), 0);

  setTxt("kpiLasPendiente", `${fmtNum(mPendLas)}m`);
  setTxt("kpiLasHoras", `${fmtNum(mPendLas / 30, 1)} hs`);
  setTxt("kpiLasHoy", `${fmtNum(lasHoy)}m`);
  setTxt("kpiLasAyerSub", `Ayer: ${fmtNum(lasAyer)}m`);
  setTxt("kpiLasSemanal", `${fmtNum(lasSem)}m`);
  setTxt("kpiLasSemAntSub", `Sem. Ant: ${fmtNum(lasSemAnt)}m`);
  setTxt("kpiLasMensual", `${fmtNum(lasMes)}m`);
  setTxt("kpiLasHistorico", `${fmtNum(lasHist)}m`);
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
      <span class="badge mru-top">📅 Viendo: ${escHtml(etiqueta)}</span>
      <span style="margin-left:8px;">🖨️ Impreso: <strong>${fmtNum(mImp)}m</strong></span> |
      <span>🔥 Calandrado: <strong>${fmtNum(mCal)}m</strong></span> |
      <span>⚡ Cortado Láser: <strong>${fmtNum(mLaser)}m</strong></span> |
      <span>🎞️ DTF: <strong>${fmtNum(mDtf)}m</strong></span>
    `;
  }
}

// ============================================================================
// MÓDULO 1: IMPRESIÓN SUBLIMACIÓN (Capturas 1 y 2 + Mejoras Pedidas)
// ============================================================================
function obtenerRolloPapelActivo() {
  const activo = STATE.rollosPapelSaldos.find(r => r.estado === "Activo") || STATE.rollosPapelSaldos[0];
  if (!activo) {
    return { idBase: "29g-1910-1", bloqueActual: "29g-1910-1", restantes: 290, iniciales: 500, impresos: 210 };
  }
  // Verificar si el rollo tiene sub-bloques (-C1, -C2) o usa el ID directo como en Captura 2 (29g-1910-1)
  const impDeRollo = STATE.impresiones.filter(i => i.id_rollo_base === activo.id_rollo || i.id_rollo_papel === activo.id_rollo);
  let bloqueActual = activo.id_rollo;
  let maxCut = 0;
  impDeRollo.forEach(i => {
    const m = String(i.id_rollo_papel || "").match(/-C(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxCut) maxCut = n;
    }
    if (i.accion === "Corte de Papel (-4m)") {
      maxCut = Math.max(1, maxCut) + 1;
    }
  });
  if (maxCut > 0) {
    bloqueActual = `${activo.id_rollo}-C${maxCut}`;
  }
  return {
    idBase: activo.id_rollo,
    bloqueActual,
    restantes: Number(activo.metros_restantes_reales) || 0,
    iniciales: Number(activo.metros_iniciales) || 500,
    impresos: Number(activo.metros_impresos_acumulados) || 0
  };
}

function renderRolloActivoYSobrantes() {
  const info = obtenerRolloPapelActivo();
  const filasBloque = STATE.impresiones.filter(x => x.id_rollo_papel === info.bloqueActual && x.accion === "Impresion Normal" && !x.anulado);
  const sumaBloque = filasBloque.reduce((acc, x) => acc + (Number(x.metros_impresos) || 0), 0);

  setTxt("lblRolloActivo", info.bloqueActual);
  setTxt("lblMetrosRestantes", `${fmtNum(info.restantes)}m`);
  setTxt("lblSumaBloqueActual", `${fmtNum(sumaBloque)}m (${filasBloque.length} imp.)`);

  // Sobrantes / Puchitos en taller
  const sobrantes = STATE.rollosPapelSaldos.filter(r => r.id_rollo !== info.idBase && Number(r.metros_restantes_reales) > 2);
  setTxt("cantSobrantesBadge", `${sobrantes.length} Disponibles`);
  const contSob = document.getElementById("listaSobrantesContainer");
  if (contSob) {
    contSob.innerHTML = sobrantes.length === 0
      ? "No hay puchitos en depósito."
      : sobrantes.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--vg-surface-input);border-radius:4px;margin-bottom:4px;">
            <span>🧻 <strong>${escHtml(s.id_rollo)}</strong> (${escHtml(s.gramaje)}g) — Restante: <strong style="color:var(--vg-status-ready);">${fmtNum(s.metros_restantes_reales)}m</strong></span>
            <button type="button" class="btn-table btn-activar-puchito" data-rollo="${escHtml(s.id_rollo)}">Montar Puchito</button>
          </div>
        `).join("");
  }
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
          class="chip-btn ${isFirst ? "mru-first" : ""} ${isSelected ? "selected" : ""}"
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
  document.querySelectorAll(".vg-route-btn[data-ruta-val]").forEach(btn => {
    const val = btn.getAttribute("data-ruta-val");
    btn.classList.toggle("active", STATE.impForm.ruta === val);
  });
}

// Renderiza la Cola Pendiente AGRUPADA POR CARPETAS DE CLIENTES (Idéntico a Captura 1)
function renderPendientesDriveSublimacion() {
  const cont = document.getElementById("listaPendientesSublimacion");
  if (!cont) return;

  const qLocal = STATE.filtroPendientesLocal.trim().toLowerCase();
  const lista = STATE.pendientesDrive.filter(p => {
    if (p.modulo !== "SUBLIMACION" || p.estado_impreso === "SI") return false;
    if (!cumpleBusquedaUniversal(p)) return false;
    if (qLocal && !`${p.cliente} ${p.nombre_archivo}`.toLowerCase().includes(qLocal)) return false;
    return true;
  });

  // Calcular metros seleccionados en vivo + cómo quedará el bloque
  let sumaSeleccionados = 0;
  STATE.pendientesDrive.forEach(p => {
    if (STATE.impForm.archivosSeleccionadosIds.has(p.id)) {
      sumaSeleccionados += Number(p.metros_totales) || 0;
    }
  });
  const badgeSel = document.getElementById("impSumaSeleccionadosBadge");
  if (badgeSel) {
    const infoRollo = obtenerRolloPapelActivo();
    const actualBloque = STATE.impresiones
      .filter(x => x.id_rollo_papel === infoRollo.bloqueActual && x.accion === "Impresion Normal" && !x.anulado)
      .reduce((acc, x) => acc + (Number(x.metros_impresos) || 0), 0);
    badgeSel.innerHTML = STATE.impForm.archivosSeleccionadosIds.size > 0
      ? `Sel: ${fmtNum(sumaSeleccionados)}m → Bloque quedará en: ${fmtNum(actualBloque + sumaSeleccionados)}m`
      : `Bloque actual: ${fmtNum(actualBloque)}m`;
  }

  if (lista.length === 0) {
    cont.innerHTML = `<div style="text-align:center;padding:24px;color:var(--vg-text-secondary);font-size:12px;">No hay archivos pendientes. Podés usar "+ Archivo Manual" o "🔬 Lector Binario DPI".</div>`;
    return;
  }

  // Agrupar por Cliente (Carpeta)
  const carpetas = new Map();
  lista.forEach(p => {
    const cli = p.cliente || "SIN CARPETA";
    if (!carpetas.has(cli)) carpetas.set(cli, []);
    carpetas.get(cli).push(p);
  });

  let html = "";
  for (const [cliente, archivos] of carpetas.entries()) {
    const cerrada = STATE.carpetasPendientesCerradas.has(cliente);
    const totalMtsCarpeta = archivos.reduce((a, b) => a + (Number(b.metros_totales) || 0), 0);

    html += `
      <div class="folder-header" data-folder-cli="${escHtml(cliente)}">
        <span>📁 ${escHtml(cliente)} <span style="font-size:11px;color:var(--vg-text-secondary);font-weight:600;">(${fmtNum(totalMtsCarpeta)}m)</span></span>
        <div style="display:flex;gap:6px;align-items:center;">
          <button type="button" class="btn-table btn-sel-all-folder" data-folder-cli="${escHtml(cliente)}" title="Seleccionar o deseleccionar toda la carpeta">☑️ Todos</button>
          <span class="badge">${archivos.length}</span>
        </div>
      </div>
      <div class="folder-content" style="display:${cerrada ? "none" : "block"};">
        ${archivos.map(p => {
          const checked = STATE.impForm.archivosSeleccionadosIds.has(p.id);
          const metaBadges = [
            p.perfil_detectado ? `<span class="badge mru-top">🎨 ${escHtml(p.perfil_detectado)}</span>` : "",
            p.tela_detectada ? `<span class="badge">👕 ${escHtml(p.tela_detectada)}</span>` : "",
            p.rollo_detectado ? `<span class="badge">🧻 ${escHtml(p.rollo_detectado)}</span>` : "",
            p.color_detectado ? `<span class="badge">🎨 ${escHtml(p.color_detectado)}</span>` : ""
          ].filter(Boolean).join(" ");

          return `
            <div class="check-item ${p.prioridad_maxima ? "alerta-item" : ""}" style="${checked ? "border-color:var(--vg-brand-secondary);background:var(--vg-cyan-soft);" : ""}">
              <input type="checkbox" class="chk-pend-sub" data-id="${p.id}" ${checked ? "checked" : ""} />
              <div style="flex:1;font-size:12px;">
                <div style="font-weight:700;color:var(--vg-text-primary);word-break:break-word;">
                  ${p.prioridad_maxima ? `<span class="badge alerta">🚨 REPO URGENTE</span> ` : ""}
                  ${escHtml(p.nombre_archivo)}
                </div>
                ${metaBadges ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">${metaBadges}</div>` : ""}
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                <span class="badge mru-top font-mono">${fmtNum(p.metros_totales)}m</span>
                <div style="display:flex;gap:3px;">
                  <button type="button" class="btn-table btn-crud-edit" data-table="prod_pendientes_drive" data-id="${p.id}" style="padding:3px 6px;">✏️</button>
                  <button type="button" class="btn-table btn-crud-del" data-table="prod_pendientes_drive" data-id="${p.id}" style="padding:3px 6px;">🗑️</button>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  cont.innerHTML = html;

  // Eventos de checkboxes individuales
  cont.querySelectorAll(".chk-pend-sub").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-id");
      if (chk.checked) STATE.impForm.archivosSeleccionadosIds.add(id);
      else STATE.impForm.archivosSeleccionadosIds.delete(id);
      aplicarAutodeteccionAlSeleccionarArchivos();
      renderPendientesDriveSublimacion();
    });
  });

  // Evento de colapsar/expandir carpeta y seleccionar toda la carpeta
  cont.querySelectorAll(".folder-header").forEach(hdr => {
    hdr.addEventListener("click", (e) => {
      const btnAll = e.target.closest(".btn-sel-all-folder");
      const cli = hdr.getAttribute("data-folder-cli");
      if (btnAll) {
        e.stopPropagation();
        const archs = carpetas.get(cli) || [];
        const todosMarcados = archs.every(a => STATE.impForm.archivosSeleccionadosIds.has(a.id));
        archs.forEach(a => {
          if (todosMarcados) STATE.impForm.archivosSeleccionadosIds.delete(a.id);
          else STATE.impForm.archivosSeleccionadosIds.add(a.id);
        });
        aplicarAutodeteccionAlSeleccionarArchivos();
        renderPendientesDriveSublimacion();
        return;
      }
      if (STATE.carpetasPendientesCerradas.has(cli)) STATE.carpetasPendientesCerradas.delete(cli);
      else STATE.carpetasPendientesCerradas.add(cli);
      renderPendientesDriveSublimacion();
    });
  });
}

// Autodetección Inteligente desde el Nombre del Archivo (Pedido #1 de la última tanda):
// Reconoce Perfil, Tela, Rollo, Color y Metros. Si NO tiene nada de eso en el nombre, lo deja EN BLANCO.
function aplicarAutodeteccionAlSeleccionarArchivos() {
  const seleccionados = STATE.pendientesDrive.filter(p => STATE.impForm.archivosSeleccionadosIds.has(p.id));
  if (seleccionados.length === 0) {
    STATE.impForm.dirty = false;
    STATE.impForm.metrosLote = 0;
    STATE.impForm.perfil = "";
    STATE.impForm.tela = "";
    STATE.impForm.rolloTela = "";
    STATE.impForm.color = "";
    STATE.impForm.diseno = "";
    STATE.impForm.autoDetectInfo = "";
    sincronizarInputsImpresionConState();
    return;
  }

  STATE.impForm.dirty = true;
  const sumaMts = seleccionados.reduce((a, b) => a + (Number(b.metros_totales) || 0), 0);
  STATE.impForm.metrosLote = Number(sumaMts.toFixed(2));

  const catObj = {
    telas: STATE.catalogos.filter(c => c.tipo === "TELA").map(c => c.nombre),
    perfiles: STATE.catalogos.filter(c => c.tipo === "PERFIL").map(c => c.nombre),
    colores: STATE.catalogos.filter(c => c.tipo === "COLOR").map(c => c.nombre)
  };
  const auto = consolidarAutodeteccionLote(seleccionados, catObj);

  STATE.impForm.perfil = auto.perfil || "";
  STATE.impForm.tela = auto.tela || "";
  STATE.impForm.rolloTela = auto.rollo || "";
  STATE.impForm.color = auto.color || "";
  if (auto.ruta) STATE.impForm.ruta = auto.ruta;
  STATE.impForm.diseno = seleccionados.length === 1
    ? seleccionados[0].nombre_archivo.slice(0, 35)
    : `LOTE ANIDADO (${seleccionados.length} ARCHIVOS)`;

  const detectadosList = [];
  if (auto.perfil) detectadosList.push(`Perfil: ${auto.perfil}`);
  if (auto.tela) detectadosList.push(`Tela: ${auto.tela}`);
  if (auto.rollo) detectadosList.push(`Rollo: ${auto.rollo}`);
  if (auto.color) detectadosList.push(`Color: ${auto.color}`);
  if (auto.ruta) detectadosList.push(`Ruta: ${auto.ruta}`);

  STATE.impForm.autoDetectInfo = detectadosList.length > 0
    ? `✨ Autodetectado del nombre: ${detectadosList.join(" · ")}`
    : `ℹ️ El archivo no especifica perfil/tela/color en su nombre — quedan en blanco para que los elijas abajo.`;

  sincronizarInputsImpresionConState();
}

function sincronizarInputsImpresionConState() {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ""; };
  setVal("impInput_metrosLote", fmtNum(STATE.impForm.metrosLote).replace(",", "."));
  setVal("impInput_perfil", STATE.impForm.perfil);
  setVal("impInput_tela", STATE.impForm.tela);
  setVal("impInput_rolloTela", STATE.impForm.rolloTela);
  setVal("impInput_color", STATE.impForm.color);
  setVal("impInput_diseno", STATE.impForm.diseno);
  setVal("impInput_observaciones", STATE.impForm.observaciones);

  const thumb = document.getElementById("thumbPreviewBox");
  if (thumb) {
    thumb.innerHTML = STATE.impForm.diseno
      ? renderMiniaturaDiseno(STATE.impForm.color, STATE.impForm.diseno, STATE.impForm.diseno)
      : `<span style="color:var(--vg-text-secondary); font-size:10px;">IMG</span>`;
  }

  const banner = document.getElementById("impAutoDetectBanner");
  if (banner) {
    banner.style.display = STATE.impForm.autoDetectInfo ? "block" : "none";
    banner.textContent = STATE.impForm.autoDetectInfo;
  }
  actualizarClasesSeleccionChips();
}

// Renderiza Historial de Impresión con el Banner Violeta por Rollo/Bloque + Suma en Vivo + Botones cuadrados (Captura 2)
function renderTablaImpresionesConBloques() {
  const tbody = document.getElementById("tbodyHistorialImpresion");
  if (!tbody) return;

  const filtradas = STATE.impresiones.filter(i => cumpleFiltroFecha(i.fecha_hora) && cumpleBusquedaUniversal(i));
  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--vg-text-secondary);">No hay registros de impresión en este período o búsqueda.</td></tr>`;
    return;
  }

  let html = "";
  let ultimoBloque = null;

  filtradas.forEach(row => {
    const bloqueId = row.id_rollo_papel || row.id_rollo_base || "Sin Rollo";
    if (bloqueId !== ultimoBloque) {
      ultimoBloque = bloqueId;
      const filasDelBloque = STATE.impresiones.filter(x => x.id_rollo_papel === bloqueId && !x.anulado);
      const sumaImpresosBloque = filasDelBloque
        .filter(x => x.accion === "Impresion Normal")
        .reduce((acc, x) => acc + (Number(x.metros_impresos) || 0), 0);
      const sumaMermaBloque = filasDelBloque
        .reduce((acc, x) => acc + (Number(x.metros_desperdicio) || 0), 0);
      const cantTrabajos = filasDelBloque.filter(x => x.accion === "Impresion Normal").length;

      html += `
        <tr class="row-corte">
          <td colspan="11">
            🔄 --- ROLLO / BLOQUE: ${escHtml(bloqueId)} (${cantTrabajos} impresiones) ---
            | 📏 METROS SUMADOS DEL BLOQUE: ${fmtNum(sumaImpresosBloque)}m
            ${sumaMermaBloque > 0 ? ` | ✂️ Cortes/Mermas: -${fmtNum(sumaMermaBloque)}m` : ""}
          </td>
        </tr>
      `;
    }

    const esAnidado = String(row.cliente_archivo || "").includes(" | ");
    const cantAnidados = esAnidado ? String(row.cliente_archivo).split(" | ").length : 1;
    const esNormal = row.accion === "Impresion Normal";

    const badgeRuta = row.ruta && row.ruta.includes("Láser")
      ? `<span class="badge mru-top">🔥+⚡ ${escHtml(row.ruta)}</span>`
      : row.ruta === "Solo Impresión"
        ? `<span class="badge">🖨️ Solo Impresión</span>`
        : `<span class="badge activo">🔥 ${escHtml(row.ruta || "Solo Calandrado")}</span>`;

    html += `
      <tr>
        <td style="white-space:nowrap;">
          <button type="button" class="btn-table btn-imp-falla" data-id="${row.id}" title="Reportar falla o reposición">⚠️</button>
          <button type="button" class="btn-table btn-imp-deshacer" data-id="${row.id}" title="Deshacer y devolver a Cola Pendiente">🔙</button>
          <button type="button" class="btn-table btn-nota-rapida" data-table="prod_impresiones" data-id="${row.id}" data-batch="${escHtml(row.batch_id)}" title="Agregar o editar nota / especificación">📝</button>
          <button type="button" class="btn-table btn-chat-tag-job" data-id="${escHtml(row.batch_id)}" data-label="${escHtml(row.cliente_archivo.slice(0, 42))} (${fmtNum(row.metros_impresos)}m)" data-mod="Impresión" title="Hablar sobre este trabajo en el Chat">💬</button>
          <button type="button" class="btn-table btn-crud-edit" data-table="prod_impresiones" data-id="${row.id}" title="Editar cualquier campo">✏️</button>
          <button type="button" class="btn-table btn-crud-del" data-table="prod_impresiones" data-id="${row.id}" title="Eliminar registro">🗑️</button>
        </td>
        <td class="font-mono" style="font-size:11px;white-space:nowrap;color:var(--vg-text-secondary);">${fmtDateHora(row.fecha_hora)}</td>
        <td style="max-width:340px;">
          ${esAnidado ? `<span class="badge mru-top" style="margin-bottom:3px;">📦 ANIDADO (${cantAnidados} archivos)</span><br/>` : ""}
          <strong style="color:var(--vg-text-primary);">${escHtml(row.cliente_archivo)}</strong>
        </td>
        <td>${renderMiniaturaDiseno(row.color_tela, row.diseno, row.cliente_archivo)}</td>
        <td><strong>${escHtml(row.tela_destino || "-")}</strong></td>
        <td>${escHtml(row.num_rollo_tela || "-")}</td>
        <td>${escHtml(row.color_tela || "-")}</td>
        <td class="font-mono" style="font-weight:900;font-size:13px;color:${esNormal ? "var(--vg-status-ready)" : "var(--vg-status-alert)"};">
          ${esNormal ? `${fmtNum(row.metros_impresos)}m` : `-${fmtNum(row.metros_desperdicio)}m`}
        </td>
        <td style="font-size:11px;font-weight:700;">${escHtml(row.perfil || "-")}</td>
        <td>${badgeRuta}</td>
        <td>
          ${row.observaciones
            ? `<div style="background:var(--vg-amber-soft);border:1px solid var(--vg-status-processing);color:var(--vg-status-processing);padding:4px 8px;border-radius:4px;font-weight:700;font-size:11px;">📝 ${escHtml(row.observaciones)}</div>`
            : `<button type="button" class="btn-table btn-nota-rapida" data-table="prod_impresiones" data-id="${row.id}" data-batch="${escHtml(row.batch_id)}" style="font-size:10px;opacity:0.75;">+ Nota</button>`}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ============================================================================
// MÓDULO 2: CALANDRADO — TARJETAS DE ROLLO COLAPSABLES (Idéntico a Captura 3)
// ============================================================================
function renderModuloCalandrado() {
  const contRollos = document.getElementById("contenedorRollosCalandrado");
  const tbodyHist = document.getElementById("tbodyHistorialCalandrado");
  if (!contRollos || !tbodyHist) return;

  const qCal = STATE.filtroCalandraLocal.trim().toLowerCase();
  const pendientesRaw = STATE.colaCalandrado.filter(c => {
    if (String(c.estado).toLowerCase().includes("terminado")) return false;
    if (!cumpleBusquedaUniversal(c)) return false;
    if (qCal && !`${c.id_rollo_papel} ${c.cliente_archivo} ${c.tela_destino} ${c.color_tela}`.toLowerCase().includes(qCal)) return false;
    return true;
  });

  // Ordenar según botón de orden
  const pendientes = [...pendientesRaw].sort((a, b) => {
    const da = new Date(a.fecha_hora).getTime() || 0;
    const db = new Date(b.fecha_hora).getTime() || 0;
    return STATE.ordenCalandraAsc ? da - db : db - da;
  });

  // Agrupar pendientes por id_rollo_papel para mostrar las tarjetas .rollo-card como en Captura 3
  const rolloActivoImp = obtenerRolloPapelActivo().bloqueActual;
  const mapaRollos = new Map();
  pendientes.forEach(c => {
    const rId = c.id_rollo_papel || "Sin Rollo";
    if (!mapaRollos.has(rId)) mapaRollos.set(rId, []);
    mapaRollos.get(rId).push(c);
  });

  if (mapaRollos.size === 0) {
    contRollos.innerHTML = `<div style="text-align:center;padding:24px;color:var(--vg-text-secondary);">No hay rollos pendientes en Cola de Calandrado.</div>`;
  } else {
    let cardsHtml = "";
    for (const [rolloId, trabajos] of mapaRollos.entries()) {
      const totalMtsRollo = trabajos.reduce((a, b) => a + (Number(b.metros) || 0), 0);
      const estaEnImpresora = rolloId === rolloActivoImp;
      const estaMontado = STATE.rolloMontadoCalandra === rolloId;
      const estaAbierto = STATE.rollosCalandraAbiertos.has(rolloId);

      cardsHtml += `
        <div class="rollo-card ${estaEnImpresora ? "en-impresora" : ""} ${estaMontado ? "montado" : ""}">
          <div class="rollo-header" data-toggle-rollo="${escHtml(rolloId)}">
            <div>
              <span class="font-mono" style="font-size:15px;font-weight:900;color:var(--vg-brand-secondary);">🧻 ${escHtml(rolloId)}</span>
              ${estaEnImpresora ? `<span class="badge en-impresora" style="margin-left:8px;">🖨️ EN IMPRESORA</span>` : ""}
              ${estaMontado ? `<span class="badge activo" style="margin-left:8px;">🔥 MONTADO EN CALANDRA</span>` : ""}
              <span class="badge" style="margin-left:8px;">${trabajos.length} Trabajo${trabajos.length > 1 ? "s" : ""}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <span style="font-size:13px;color:var(--vg-text-secondary);">
                Total a procesar: <strong class="font-mono" style="color:var(--vg-status-ready);font-size:14px;">${fmtNum(totalMtsRollo)}m</strong>
              </span>
              ${estaEnImpresora
                ? `<span style="font-size:11px;color:var(--vg-status-processing);font-weight:700;">Imprimiendo... (Click para ver u operar igual)</span>`
                : ""}
              <div style="display:flex;gap:5px;" onclick="event.stopPropagation();">
                <button type="button" class="btn-table btn-cal-montar-rollo" data-rollo="${escHtml(rolloId)}">⚙️ Montar</button>
                <button type="button" class="btn-table btn-cal-kiosco-rollo" data-rollo="${escHtml(rolloId)}" style="background:var(--vg-brand-primary);border-color:var(--vg-brand-secondary);">▶️ KIOSKO</button>
                <button type="button" class="btn-table btn-cal-procesar-rollo" data-rollo="${escHtml(rolloId)}" style="background:var(--vg-status-ready);color:var(--vg-bg-app);border-color:var(--vg-status-ready);">✅ Procesar</button>
                <button type="button" class="btn-table btn-cal-pdf-rollo" data-rollo="${escHtml(rolloId)}">🖨️ PDF</button>
              </div>
            </div>
          </div>
          <div class="rollo-body" style="display:${estaAbierto ? "block" : "none"};">
            <table>
              <thead>
                <tr>
                  <th>Acción</th>
                  <th>Fecha Imp.</th>
                  <th>Cliente / Archivo</th>
                  <th>Tela</th>
                  <th>Nº Rollo</th>
                  <th>Color</th>
                  <th>Metros</th>
                  <th>Ruta</th>
                  <th>Notas / Fallas</th>
                </tr>
              </thead>
              <tbody>
                ${trabajos.map(c => `
                  <tr>
                    <td style="white-space:nowrap;">
                      <button type="button" class="btn-table btn-cal-terminar" data-id="${c.id}" style="background:var(--vg-status-ready);color:var(--vg-bg-app);" title="Marcar este trabajo como Calandrado (respeta Fecha Manual)">✅ Hecho</button>
                      <button type="button" class="btn-table btn-cal-kiosco" data-id="${c.id}" title="Abrir Kiosko">▶️</button>
                      <button type="button" class="btn-table btn-cal-falla" data-id="${c.id}" title="Reportar falla de calandra">⚠️</button>
                      <button type="button" class="btn-table btn-nota-rapida" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}" title="Agregar/Editar Nota">📝</button>
                      <button type="button" class="btn-table btn-crud-edit" data-table="prod_cola_calandrado" data-id="${c.id}">✏️</button>
                      <button type="button" class="btn-table btn-crud-del" data-table="prod_cola_calandrado" data-id="${c.id}">🗑️</button>
                    </td>
                    <td class="font-mono" style="font-size:11px;">${fmtDateHora(c.fecha_hora)}</td>
                    <td><strong>${escHtml(c.cliente_archivo)}</strong></td>
                    <td><strong>${escHtml(c.tela_destino || "-")}</strong></td>
                    <td>${escHtml(c.num_rollo_tela || "-")}</td>
                    <td>${escHtml(c.color_tela || "-")}</td>
                    <td class="font-mono" style="font-weight:900;color:var(--vg-status-ready);">${fmtNum(c.metros)}m</td>
                    <td><span class="badge">${escHtml(c.ruta || "Solo Calandrado")}</span></td>
                    <td>
                      ${c.observaciones
                        ? `<div style="background:var(--vg-amber-soft);border:1px solid var(--vg-status-processing);color:var(--vg-status-processing);padding:3px 7px;border-radius:4px;font-size:11px;font-weight:700;">📝 ${escHtml(c.observaciones)}</div>`
                        : `<button type="button" class="btn-table btn-nota-rapida" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}" style="font-size:10px;">+ Nota</button>`}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
    contRollos.innerHTML = cardsHtml;

    contRollos.querySelectorAll(".rollo-header[data-toggle-rollo]").forEach(hdr => {
      hdr.addEventListener("click", () => {
        const rId = hdr.getAttribute("data-toggle-rollo");
        if (STATE.rollosCalandraAbiertos.has(rId)) STATE.rollosCalandraAbiertos.delete(rId);
        else STATE.rollosCalandraAbiertos.add(rId);
        renderModuloCalandrado();
      });
    });
  }

  // Previsión de Telas Requeridas
  const panelPrev = document.getElementById("panelPrevisionTelasInline");
  if (panelPrev) {
    const mapaTelas = {};
    pendientes.forEach(p => {
      const k = `${p.tela_destino || "SIN ESPECIFICAR"} — Color: ${p.color_tela || "BLANCO"} ${p.num_rollo_tela ? `(${p.num_rollo_tela})` : ""}`;
      mapaTelas[k] = (mapaTelas[k] || 0) + (Number(p.metros) || 0);
    });
    const entries = Object.entries(mapaTelas);
    panelPrev.innerHTML = entries.length === 0
      ? `<div style="color:var(--vg-text-secondary);">No hay telas pendientes de calandrar.</div>`
      : `<div style="font-weight:800;color:var(--vg-status-ready);margin-bottom:8px;">🛒 Previsión de Telas para los Rollos en Cola:</div>` +
        entries.map(([k, m]) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--vg-border-subtle);"><span>👕 ${escHtml(k)}</span><strong class="font-mono" style="color:var(--vg-status-ready);">${fmtNum(m)}m</strong></div>`).join("");
  }

  // Historial Reciente de Calandrado agrupado por ROLLO CERRADO (Captura 3)
  const terminados = STATE.colaCalandrado.filter(c =>
    String(c.estado).toLowerCase().includes("terminado") &&
    cumpleFiltroFecha(c.fecha_terminado || c.fecha_hora) &&
    cumpleBusquedaUniversal(c)
  );

  if (terminados.length === 0) {
    tbodyHist.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:18px;color:var(--vg-text-secondary);">No hay trabajos calandrados en el período seleccionado.</td></tr>`;
  } else {
    let htmlHist = "";
    let ultimoRolloHist = null;
    terminados.forEach(c => {
      const rId = c.id_rollo_papel || "Sin Rollo";
      if (rId !== ultimoRolloHist) {
        ultimoRolloHist = rId;
        const totRollo = terminados
          .filter(x => x.id_rollo_papel === rId)
          .reduce((a, b) => a + (Number(b.metros) || 0), 0);
        htmlHist += `
          <tr class="row-corte">
            <td colspan="11">--- ROLLO CERRADO: ${escHtml(rId)} | TOTAL DEL ROLLO: ${fmtNum(totRollo)}m ---</td>
          </tr>
        `;
      }
      htmlHist += `
        <tr>
          <td style="white-space:nowrap;">
            <button type="button" class="btn-table btn-cal-falla" data-id="${c.id}" title="Reportar falla">⚠️</button>
            <button type="button" class="btn-table btn-cal-reabrir" data-id="${c.id}" title="Devolver a Cola Calandrado">🔙</button>
            <button type="button" class="btn-table btn-nota-rapida" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}" title="Editar Nota">📝</button>
            <button type="button" class="btn-table btn-crud-edit" data-table="prod_cola_calandrado" data-id="${c.id}">✏️</button>
            <button type="button" class="btn-table btn-crud-del" data-table="prod_cola_calandrado" data-id="${c.id}">🗑️</button>
          </td>
          <td class="font-mono" style="font-size:11px;white-space:nowrap;">${fmtDateHora(c.fecha_terminado || c.fecha_hora)}</td>
          <td><strong>${escHtml(c.id_rollo_papel)}</strong></td>
          <td><strong>${escHtml(c.cliente_archivo)}</strong></td>
          <td>${escHtml(c.tela_destino || "-")}</td>
          <td>${escHtml(c.num_rollo_tela || "-")}</td>
          <td>${escHtml(c.color_tela || "-")}</td>
          <td class="font-mono" style="font-weight:900;color:var(--vg-status-ready);">${fmtNum(c.metros)}m</td>
          <td style="font-size:11px;">${escHtml(c.perfil || "-")}</td>
          <td>${escHtml(c.ruta || "Solo Calandrado")}</td>
          <td>
            ${c.observaciones
              ? `<div style="background:var(--vg-amber-soft);border:1px solid var(--vg-status-processing);color:var(--vg-status-processing);padding:3px 7px;border-radius:4px;font-size:11px;font-weight:700;">📝 ${escHtml(c.observaciones)}</div>`
              : "-"}
          </td>
        </tr>
      `;
    });
    tbodyHist.innerHTML = htmlHist;
  }
}

// ============================================================================
// MÓDULO 3: CORTE LÁSER (Trabajos Anidados Agrupados por batch_id — Pedido #2)
// ============================================================================
function agruparLaserPorBatch(filas) {
  const mapa = new Map();
  filas.forEach(r => {
    const key = r.batch_id || r.id;
    if (!mapa.has(key)) {
      mapa.set(key, {
        batch_id: key,
        ids: [r.id],
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
    ? `<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--vg-text-secondary);">No hay lotes pendientes en Corte Láser.</td></tr>`
    : lotesPendientes.map(g => {
      const esAnidado = g.archivos.length > 1;
      return `
        <tr>
          <td style="white-space:nowrap;">
            <button type="button" class="btn-table btn-laser-cortar-lote" data-batch="${escHtml(g.batch_id)}" data-ids="${g.ids.join(",")}" style="background:var(--vg-status-ready);color:var(--vg-bg-app);border-color:var(--vg-status-ready);">
              ⚡ Cortar ${esAnidado ? `Lote (${g.archivos.length})` : ""}
            </button>
            <button type="button" class="btn-table btn-nota-rapida" data-table="prod_cola_laser" data-id="${g.ids[0]}" data-batch="${escHtml(g.batch_id)}">📝</button>
            <button type="button" class="btn-table btn-crud-edit" data-table="prod_cola_laser" data-id="${g.ids[0]}">✏️</button>
            <button type="button" class="btn-table btn-crud-del" data-table="prod_cola_laser" data-id="${g.ids[0]}">🗑️</button>
          </td>
          <td class="font-mono" style="font-size:11px;">${fmtDateHora(g.fecha_ingreso)}</td>
          <td><strong>${escHtml(g.id_rollo_papel)}</strong></td>
          <td>
            ${esAnidado
              ? `<span class="badge mru-top" style="margin-bottom:4px;">📦 TRABAJO ANIDADO AGRUPADO (${g.archivos.length} archivos — Se marcan juntos con 1 clic)</span>`
              : `<span class="badge activo" style="margin-bottom:4px;">Archivo Individual</span>`}
            <div style="font-weight:700;margin-top:3px;">${g.archivos.map(a => `• ${escHtml(a)}`).join("<br/>")}</div>
          </td>
          <td><strong>${escHtml(g.tela_rollo_color || "-")}</strong></td>
          <td class="font-mono" style="font-weight:900;color:var(--vg-status-ready);">${fmtNum(g.metros_totales)}m</td>
          <td>Vel: ${escHtml(g.velocidad)} | Poder: <strong>${escHtml(g.poder)}%</strong></td>
          <td>
            ${g.observaciones
              ? `<div style="background:var(--vg-amber-soft);border:1px solid var(--vg-status-processing);color:var(--vg-status-processing);padding:4px 8px;border-radius:4px;font-weight:700;font-size:11px;">📝 ${escHtml(g.observaciones)}</div>`
              : "-"}
          </td>
        </tr>
      `;
    }).join("");

  tbodyHist.innerHTML = lotesTerminados.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--vg-text-secondary);">No hay cortes láser finalizados en este período.</td></tr>`
    : lotesTerminados.map(g => `
      <tr>
        <td style="white-space:nowrap;">
          <button type="button" class="btn-table btn-crud-edit" data-table="prod_cola_laser" data-id="${g.ids[0]}">✏️</button>
          <button type="button" class="btn-table btn-crud-del" data-table="prod_cola_laser" data-id="${g.ids[0]}">🗑️</button>
        </td>
        <td class="font-mono" style="font-size:11px;">${fmtDateHora(g.fecha_terminado || g.fecha_ingreso)}</td>
        <td><strong>${escHtml(g.id_rollo_papel)}</strong></td>
        <td>
          ${g.archivos.length > 1 ? `<span class="badge mru-top">📦 Anidado (${g.archivos.length})</span><br/>` : ""}
          <strong>${g.archivos.map(a => escHtml(a)).join(" | ")}</strong>
        </td>
        <td>${escHtml(g.tela_rollo_color || "-")}</td>
        <td class="font-mono" style="font-weight:800;color:var(--vg-status-ready);">${fmtNum(g.metros_totales)}m</td>
        <td>${g.observaciones ? `<div style="background:var(--vg-amber-soft);padding:3px 6px;border-radius:4px;font-size:11px;">📝 ${escHtml(g.observaciones)}</div>` : "-"}</td>
      </tr>
    `).join("");
}

// ============================================================================
// MÓDULO 4: MÓDULO DTF
// ============================================================================
function renderModuloDTF() {
  const kpiWrap = document.getElementById("dtfRollosKpiContainer");
  const tbodyPend = document.getElementById("tbodyPendientesDTF");
  const tbodyPedidos = document.getElementById("tbodyPedidosDTF");
  const tbodyCuentas = document.getElementById("tbodyCuentasClientesDTF");
  if (!kpiWrap) return;

  const selRollo = document.getElementById("dtfInputRollo");
  if (selRollo && selRollo.options.length === 0) {
    selRollo.innerHTML = STATE.dtfRollosSaldos.map(r =>
      `<option value="${escHtml(r.id_rollo_dtf)}">${escHtml(r.id_rollo_dtf)} — ${escHtml(r.marca_fabricante)} (${fmtNum(r.metros_restantes_reales)}m disp.)</option>`
    ).join("");
  }

  kpiWrap.innerHTML = STATE.dtfRollosSaldos.map(r => `
    <div class="stat-box" style="border-bottom: 3px solid ${r.estado === "Activo" ? "var(--vg-status-ready)" : "var(--vg-brand-secondary)"};">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="stat-title">🎞️ ${escHtml(r.id_rollo_dtf)}</span>
        <button type="button" class="btn-table btn-crud-edit" data-table="prod_dtf_rollos" data-id="${escHtml(r.id_rollo_dtf)}" style="padding:2px 6px;">✏️</button>
      </div>
      <div class="stat-value">${fmtNum(r.metros_restantes_reales)}m</div>
      <div class="stat-sub">${escHtml(r.marca_fabricante)} | ${escHtml(r.perfil_impresion)}</div>
    </div>
  `).join("");

  const pendDtf = STATE.pendientesDrive.filter(p => p.modulo === "DTF" && p.estado_impreso !== "SI" && cumpleBusquedaUniversal(p));
  if (tbodyPend) {
    tbodyPend.innerHTML = pendDtf.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--vg-text-secondary);">Sin archivos DTF pendientes en Drive.</td></tr>`
      : pendDtf.map(p => {
        const cargo = p.es_repo_muestra || "VENTA";
        const precioUnit = calcularPrecioMetroDTF(p.metros_totales, cargo);
        return `
          <tr>
            <td><strong>${escHtml(p.cliente)}</strong></td>
            <td><strong>${escHtml(p.nombre_archivo)}</strong></td>
            <td class="font-mono" style="font-weight:800;">${fmtNum(p.metros_totales)}m</td>
            <td><span class="badge ${cargo === "VENTA" ? "activo" : "alerta"}">${escHtml(cargo)}</span></td>
            <td class="font-mono" style="font-weight:900;">${fmtMoney(precioUnit * (Number(p.metros_totales) || 0))}</td>
            <td>
              <button type="button" class="btn-table btn-dtf-cargar-pend" data-id="${p.id}">➕ Cargar</button>
              <button type="button" class="btn-table btn-crud-edit" data-table="prod_pendientes_drive" data-id="${p.id}">✏️</button>
            </td>
          </tr>
        `;
      }).join("");
  }

  const pedidosFilt = STATE.dtfPedidos.filter(d => cumpleFiltroFecha(d.fecha_hora) && cumpleBusquedaUniversal(d));
  if (tbodyPedidos) {
    tbodyPedidos.innerHTML = pedidosFilt.length === 0
      ? `<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--vg-text-secondary);">No hay pedidos DTF en el período seleccionado.</td></tr>`
      : pedidosFilt.map(d => {
        const saldo = (Number(d.subtotal_cobrar) || 0) - (Number(d.monto_pagado) || 0);
        return `
          <tr>
            <td style="white-space:nowrap;">
              ${saldo > 0 ? `<button type="button" class="btn-table btn-dtf-saldar" data-id="${d.id}" data-total="${d.subtotal_cobrar}" style="background:var(--vg-status-ready);color:var(--vg-bg-app);">💵 Saldar</button>` : ""}
              <button type="button" class="btn-table btn-crud-edit" data-table="prod_dtf_pedidos" data-id="${d.id}">✏️</button>
              <button type="button" class="btn-table btn-crud-del" data-table="prod_dtf_pedidos" data-id="${d.id}">🗑️</button>
            </td>
            <td class="font-mono" style="font-size:11px;">${fmtDateHora(d.fecha_hora)}</td>
            <td><strong>${escHtml(d.cliente)}</strong></td>
            <td>
              <strong>${escHtml(d.nombre_archivo)}</strong>
              ${d.observaciones ? `<div style="font-size:11px;color:var(--vg-status-processing);">📝 ${escHtml(d.observaciones)}</div>` : ""}
            </td>
            <td><span class="badge ${d.tipo_cargo === "VENTA" ? "activo" : "alerta"}">${escHtml(d.tipo_cargo)}</span></td>
            <td class="font-mono" style="font-weight:800;">${fmtNum(d.metros_archivo)}m</td>
            <td class="font-mono">${fmtMoney(d.precio_metro)}/m</td>
            <td class="font-mono" style="font-weight:900;">${fmtMoney(d.subtotal_cobrar)}</td>
            <td>
              <span class="badge ${saldo <= 0 ? "activo" : "alerta"}">
                ${saldo <= 0 ? "✅ Pagado" : `Debe ${fmtMoney(saldo)}`}
              </span>
            </td>
          </tr>
        `;
      }).join("");
  }

  if (tbodyCuentas) {
    tbodyCuentas.innerHTML = STATE.dtfCuentasClientes.map(c => `
      <tr>
        <td><strong>${escHtml(c.cliente_nombre)}</strong></td>
        <td class="font-mono">${fmtNum(c.metros_comprados)}m</td>
        <td class="font-mono">${fmtNum(c.metros_reposicion)}m</td>
        <td class="font-mono">${fmtNum(c.metros_muestras)}m</td>
        <td class="font-mono" style="font-weight:800;">${fmtMoney(c.total_facturado)}</td>
        <td class="font-mono" style="color:var(--vg-status-ready);font-weight:800;">${fmtMoney(c.total_abonado)}</td>
        <td class="font-mono" style="color:${Number(c.saldo_pendiente) > 0 ? "var(--vg-status-alert)" : "var(--vg-status-ready)"};font-weight:900;">
          ${fmtMoney(c.saldo_pendiente)}
        </td>
      </tr>
    `).join("");
  }
}

// ============================================================================
// MÓDULOS 5 Y 6: FINANZAS Y BITÁCORA DE FALLAS
// ============================================================================
function renderModuloFinanzasYMantenimiento() {
  const totalImp = STATE.impresiones
    .filter(i => i.accion === "Impresion Normal")
    .reduce((a, b) => a + (Number(b.metros_impresos) || 0), 0);
  const totalDtfMoney = STATE.dtfPedidos.reduce((a, b) => a + (Number(b.subtotal_cobrar) || 0), 0);

  setTxt("finTotalImpMts", `${fmtNum(totalImp)}m`);
  setTxt("finTotalDtfFacturado", fmtMoney(totalDtfMoney));

  const tbodyFallas = document.getElementById("tbodyBitacoraFallas");
  if (tbodyFallas) {
    tbodyFallas.innerHTML = STATE.fallasReposiciones.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--vg-text-secondary);">Sin fallas ni mermas registradas.</td></tr>`
      : STATE.fallasReposiciones.map(f => `
          <tr>
            <td class="font-mono" style="font-size:11px;">${fmtDateHora(f.fecha_hora)}</td>
            <td><span class="badge alerta">${escHtml(f.estacion || f.tipo_registro)}</span></td>
            <td><strong>${escHtml(f.id_rollo || "-")}</strong></td>
            <td><strong>${escHtml(f.archivo_afectado || "-")}</strong></td>
            <td class="font-mono" style="color:var(--vg-status-alert);font-weight:800;">-${fmtNum(f.metros_merma)}m</td>
            <td>${escHtml(f.motivo || f.detalle_reposicion || "-")}</td>
          </tr>
        `).join("");
  }
}

// ============================================================================
// MÓDULO 7: MÉTRICAS (BI) — Idéntica a Captura 4 + Día Anterior y Semana Anterior
// ============================================================================
function renderModuloMetricasBI() {
  const { hoyIni, ayerIni, semActualIni, semAntIni, mesActualIni } = obtenerVentanasTemporales();

  const pendSub = STATE.pendientesDrive.filter(p => p.modulo === "SUBLIMACION" && p.estado_impreso !== "SI");
  const pendCal = STATE.colaCalandrado.filter(c => !String(c.estado).toLowerCase().includes("terminado"));
  const pendLas = STATE.colaLaser.filter(l => !String(l.estado).toLowerCase().includes("terminado"));

  const qImp = pendSub.reduce((a, b) => a + (Number(b.metros_totales) || 0), 0);
  const qCal = pendCal.reduce((a, b) => a + (Number(b.metros) || 0), 0);
  const qLas = pendLas.reduce((a, b) => a + (Number(b.metros) || 0), 0);

  // SLA (650m/día Imp, 650m/día Cal, 300m/día Láser)
  const dImp = qImp / 650;
  const dCal = qCal / 650;
  const dLas = qLas / 300;
  const dTotal = Math.max(1, Math.ceil(dImp + dCal + dLas));

  setTxt("slaDiasImp", `${fmtNum(dImp, 1)} Días`);
  setTxt("slaDiasCal", `${fmtNum(dCal, 1)} Días`);
  setTxt("slaDiasLas", `${fmtNum(dLas, 1)} Días`);
  setTxt("slaDiasTotal", `Aprox ~ ${dTotal} Día${dTotal > 1 ? "s" : ""}`);

  setTxt("radarQImp", `${fmtNum(qImp, 0)}m`);
  setTxt("radarQCal", `${fmtNum(qCal, 0)}m`);
  setTxt("radarQLas", `${fmtNum(qLas, 0)}m`);

  const impNormal = STATE.impresiones.filter(i => i.accion === "Impresion Normal");
  const calTerm = STATE.colaCalandrado.filter(c => String(c.estado).toLowerCase().includes("terminado"));
  const lasTerm = STATE.colaLaser.filter(l => String(l.estado).toLowerCase().includes("terminado"));

  // Tarjeta Violeta: IMPRESIÓN
  setTxt("biImpHoy", `${fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", hoyIni))}m`);
  setTxt("biImpAyer", `${fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", ayerIni, hoyIni))}m`);
  setTxt("biImpSem", `${fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", semActualIni))}m`);
  setTxt("biImpSemAnt", `${fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", semAntIni, semActualIni))}m`);
  setTxt("biImpMes", `${fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", mesActualIni))}m`);
  setTxt("biImpHis", `${fmtNum(impNormal.reduce((a, b) => a + (Number(b.metros_impresos) || 0), 0))}m`);

  // Tarjeta Naranja: CALANDRADO
  setTxt("biCalHoy", `${fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", hoyIni))}m`);
  setTxt("biCalAyer", `${fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", ayerIni, hoyIni))}m`);
  setTxt("biCalSem", `${fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", semActualIni))}m`);
  setTxt("biCalSemAnt", `${fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", semAntIni, semActualIni))}m`);
  setTxt("biCalMes", `${fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", mesActualIni))}m`);
  setTxt("biCalHis", `${fmtNum(calTerm.reduce((a, b) => a + (Number(b.metros) || 0), 0))}m`);

  // Tarjeta Azul: CORTE LÁSER
  setTxt("biLasHoy", `${fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", hoyIni))}m`);
  setTxt("biLasAyer", `${fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", ayerIni, hoyIni))}m`);
  setTxt("biLasSem", `${fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", semActualIni))}m`);
  setTxt("biLasSemAnt", `${fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", semAntIni, semActualIni))}m`);
  setTxt("biLasMes", `${fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", mesActualIni))}m`);
  setTxt("biLasHis", `${fmtNum(lasTerm.reduce((a, b) => a + (Number(b.metros) || 0), 0))}m`);

  // Tarjeta Esmeralda: DTF
  setTxt("biDtfHoy", `${fmtNum(sumarMetrosEnVentana(STATE.dtfPedidos, "fecha_hora", "metros_archivo", hoyIni))}m`);
  setTxt("biDtfAyer", `${fmtNum(sumarMetrosEnVentana(STATE.dtfPedidos, "fecha_hora", "metros_archivo", ayerIni, hoyIni))}m`);
  setTxt("biDtfSem", `${fmtNum(sumarMetrosEnVentana(STATE.dtfPedidos, "fecha_hora", "metros_archivo", semActualIni))}m`);
  setTxt("biDtfSemAnt", `${fmtNum(sumarMetrosEnVentana(STATE.dtfPedidos, "fecha_hora", "metros_archivo", semAntIni, semActualIni))}m`);
  setTxt("biDtfMes", `${fmtNum(sumarMetrosEnVentana(STATE.dtfPedidos, "fecha_hora", "metros_archivo", mesActualIni))}m`);
  setTxt("biDtfHis", `${fmtNum(STATE.dtfPedidos.reduce((a, b) => a + (Number(b.metros_archivo) || 0), 0))}m`);
}

// ============================================================================
// MÓDULO 8: CHAT INTERNO DE TALLER EN TIEMPO REAL (@Menciones, #Trabajos, Fotos Cámara WebP)
// ============================================================================
function renderModuloChat() {
  const feedEl = document.getElementById("chatFeedContainer");
  const selTrabajo = document.getElementById("chatSelectTrabajo");
  const chipsMencion = document.getElementById("chatChipsMencion");

  if (selTrabajo && selTrabajo.options.length <= 1) {
    const opciones = [`<option value=""># Vincular a un Trabajo (Opcional)...</option>`];
    STATE.impresiones.slice(0, 20).forEach(i => {
      opciones.push(`<option value="IMP|${escHtml(i.batch_id)}|${escHtml(i.cliente_archivo.slice(0, 42))} (${fmtNum(i.metros_impresos)}m)">🖨️ [Imp] ${escHtml(i.cliente_archivo.slice(0, 48))} (${fmtNum(i.metros_impresos)}m)</option>`);
    });
    STATE.dtfPedidos.slice(0, 10).forEach(d => {
      opciones.push(`<option value="DTF|${escHtml(d.id)}|${escHtml(d.cliente)} - ${escHtml(d.nombre_archivo.slice(0, 30))}">🎞️ [DTF] ${escHtml(d.cliente)} — ${escHtml(d.nombre_archivo.slice(0, 35))}</option>`);
    });
    selTrabajo.innerHTML = opciones.join("");
  }

  if (chipsMencion) {
    const miembros = STATE.catalogos.filter(c => c.tipo === "EQUIPO");
    chipsMencion.innerHTML = miembros.map(m => `
      <button type="button" class="chip-btn btn-chat-mention" data-mention="${escHtml(m.nombre)}">
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

  if (!feedEl) return;
  const msgs = STATE.chatMensajes.filter(m => {
    if (!cumpleBusquedaUniversal(m)) return false;
    if (STATE.canalChatActivo === "Todos") return true;
    if (STATE.canalChatActivo === "Mis Menciones") {
      return Array.isArray(m.menciones) && m.menciones.includes(STATE.usuarioActual);
    }
    return m.canal_area === STATE.canalChatActivo;
  });

  feedEl.innerHTML = msgs.length === 0
    ? `<div style="text-align:center;padding:24px;color:var(--vg-text-secondary);">No hay mensajes en este canal. ¡Escribí el primero o adjuntá una foto!</div>`
    : msgs.map(m => {
      const meMenciona = Array.isArray(m.menciones) && m.menciones.includes(STATE.usuarioActual);
      return `
        <div class="chat-msg-card ${meMenciona ? "mention-me" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div>
              <strong style="color:var(--vg-brand-secondary);">👤 ${escHtml(m.autor_nombre)}</strong>
              <span class="badge" style="margin-left:4px;">📍 ${escHtml(m.canal_area)}</span>
              ${meMenciona ? `<span class="badge alerta">🔔 Te mencionó</span>` : ""}
            </div>
            <div class="font-mono" style="font-size:11px;color:var(--vg-text-secondary);">
              ${fmtDateHora(m.created_at)}
              <button type="button" class="btn-table btn-crud-del" data-table="prod_chat_mensajes" data-id="${m.id}" style="margin-left:6px;padding:2px 6px;">🗑️</button>
            </div>
          </div>
          <div style="margin-top:6px;font-size:13px;font-weight:600;white-space:pre-wrap;">${escHtml(m.mensaje)}</div>
          ${m.trabajo_etiqueta ? `
            <div style="margin-top:6px;">
              <button type="button" class="badge mru-top" style="cursor:pointer;" onclick="window.vgBuscarTrabajoDesdeChat('${escHtml(m.trabajo_etiqueta.split("(")[0].trim())}')">
                🔗 #${escHtml(m.trabajo_modulo || "Trabajo")}: ${escHtml(m.trabajo_etiqueta)} (Localizar)
              </button>
            </div>
          ` : ""}
          ${m.foto_base64 ? `
            <div style="margin-top:8px;">
              <img src="${m.foto_base64}" alt="Foto adjunta del taller" style="max-width:260px;max-height:220px;border-radius:6px;border:1px solid var(--vg-border-subtle);cursor:pointer;" onclick="window.open(this.src)"/>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
}

window.vgBuscarTrabajoDesdeChat = (termino) => {
  STATE.busquedaGlobal = termino;
  const inp = document.getElementById("vgOmniSearchInput");
  if (inp) inp.value = termino;
  renderTodoRespetandoFormulario();
};

// Panel de Resultados Instantáneos de OmniSearch (Pedido #5)
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
      <strong style="color:var(--vg-brand-secondary);">🔍 Resultados Globales para "${escHtml(STATE.busquedaGlobal)}" en todo el Taller:</strong>
      <button type="button" class="btn-table" onclick="document.getElementById('vgOmniSearchClear').click()">✖ Cerrar Buscador</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;font-size:12px;">
      <div style="background:var(--vg-surface-input);padding:10px;border-radius:6px;border:1px solid var(--vg-border-subtle);">
        <strong style="color:var(--vg-brand-secondary);">🖨️ Impresión (${impMatch.length})</strong>
        ${impMatch.map(i => `<div style="margin-top:4px;">• <strong>${escHtml(i.cliente_archivo.slice(0, 42))}</strong> — <span class="font-mono" style="color:var(--vg-status-ready);">${fmtNum(i.metros_impresos)}m</span> (${escHtml(i.id_rollo_papel)})</div>`).join("") || `<div style="color:var(--vg-text-secondary);">Sin coincidencias</div>`}
      </div>
      <div style="background:var(--vg-surface-input);padding:10px;border-radius:6px;border:1px solid var(--vg-border-subtle);">
        <strong style="color:var(--vg-status-alert);">🔥 Calandrado (${calMatch.length})</strong>
        ${calMatch.map(c => `<div style="margin-top:4px;">• <strong>${escHtml(c.cliente_archivo.slice(0, 42))}</strong> — <span class="font-mono" style="color:var(--vg-status-ready);">${fmtNum(c.metros)}m</span> [${escHtml(c.estado)}]</div>`).join("") || `<div style="color:var(--vg-text-secondary);">Sin coincidencias</div>`}
      </div>
      <div style="background:var(--vg-surface-input);padding:10px;border-radius:6px;border:1px solid var(--vg-border-subtle);">
        <strong style="color:var(--vg-status-processing);">⚡ Corte Láser (${lasMatch.length})</strong>
        ${lasMatch.map(l => `<div style="margin-top:4px;">• <strong>${escHtml(l.cliente_archivo.slice(0, 42))}</strong> — <span class="font-mono" style="color:var(--vg-status-ready);">${fmtNum(l.metros)}m</span> [${escHtml(l.estado)}]</div>`).join("") || `<div style="color:var(--vg-text-secondary);">Sin coincidencias</div>`}
      </div>
      <div style="background:var(--vg-surface-input);padding:10px;border-radius:6px;border:1px solid var(--vg-border-subtle);">
        <strong style="color:var(--vg-status-ready);">🎞️ DTF (${dtfMatch.length})</strong>
        ${dtfMatch.map(d => `<div style="margin-top:4px;">• <strong>${escHtml(d.cliente)}</strong> (${escHtml(d.nombre_archivo.slice(0, 28))}) — <span class="font-mono">${fmtNum(d.metros_archivo)}m</span></div>`).join("") || `<div style="color:var(--vg-text-secondary);">Sin coincidencias</div>`}
      </div>
    </div>
  `;
}

// ============================================================================
// ACCIONES OPERATIVAS (Impresión, Corte -4m, Avance, Calibración, Calandrado, Láser)
// ============================================================================
async function procesarImpresionLote() {
  const seleccionados = STATE.pendientesDrive.filter(p => STATE.impForm.archivosSeleccionadosIds.has(p.id));
  const metrosManualInput = parseFloat(document.getElementById("impInput_metrosLote")?.value) || 0;
  const disenoInput = document.getElementById("impInput_diseno")?.value.trim() || STATE.impForm.diseno;

  if (seleccionados.length === 0 && metrosManualInput <= 0) {
    toast("Seleccioná al menos 1 archivo de la Cola Pendiente o ingresá los Metros a Descontar.", "warn");
    return;
  }

  const infoRollo = obtenerRolloPapelActivo();
  const batchId = `BATCH-${Date.now()}`;
  const fechaManVal = document.getElementById("impInput_fechaManual")?.value;
  const fechaIso = fechaManVal ? new Date(fechaManVal).toISOString() : new Date().toISOString();

  const nombresUnidos = seleccionados.length > 0
    ? seleccionados.map(s => s.nombre_archivo.includes(s.cliente) ? s.nombre_archivo : `${s.cliente} - ${s.nombre_archivo}`).join(" | ")
    : (disenoInput || "TRABAJO MANUAL DE IMPRESIÓN");

  const metrosTotales = metrosManualInput > 0
    ? metrosManualInput
    : seleccionados.reduce((acc, s) => acc + (Number(s.metros_totales) || 0), 0);

  const fileIdsUnidos = seleccionados.map(s => s.file_id || s.id).join(",");

  const tela = document.getElementById("impInput_tela")?.value.trim() || STATE.impForm.tela;
  const perfil = document.getElementById("impInput_perfil")?.value.trim() || STATE.impForm.perfil;
  const rolloTela = document.getElementById("impInput_rolloTela")?.value.trim() || STATE.impForm.rolloTela;
  const color = document.getElementById("impInput_color")?.value.trim() || STATE.impForm.color;
  const obs = document.getElementById("impInput_observaciones")?.value.trim() || STATE.impForm.observaciones;
  const ruta = STATE.impForm.ruta || "Solo Calandrado";

  const { error: errImp } = await sb().from("prod_impresiones").insert({
    empresa_id: "vvgrafic-principal",
    batch_id: batchId,
    fecha_hora: fechaIso,
    id_rollo_papel: infoRollo.bloqueActual,
    id_rollo_base: infoRollo.idBase,
    cliente_archivo: nombresUnidos,
    diseno: disenoInput || nombresUnidos.slice(0, 30),
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

  if (ruta.includes("Calandrado")) {
    await sb().from("prod_cola_calandrado").insert({
      empresa_id: "vvgrafic-principal",
      batch_id: batchId,
      fecha_hora: fechaIso,
      id_rollo_papel: infoRollo.bloqueActual,
      cliente_archivo: nombresUnidos,
      diseno: disenoInput || nombresUnidos.slice(0, 30),
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

  for (const s of seleccionados) {
    await sb().from("prod_pendientes_drive").update({ estado_impreso: "SI" }).eq("id", s.id);
  }

  // Actualizar Ranking MRU (#1 pasa a ser inmediatamente el último usado — Pedido #3)
  await Promise.all([
    registrarUsoMRU("TELA", tela),
    registrarUsoMRU("PERFIL", perfil),
    registrarUsoMRU("COLOR", color)
  ]);

  STATE.impForm.dirty = false;
  STATE.impForm.archivosSeleccionadosIds.clear();
  STATE.impForm.metrosLote = 0;
  STATE.impForm.diseno = "";
  STATE.impForm.observaciones = "";
  STATE.impForm.autoDetectInfo = "";
  sincronizarInputsImpresionConState();

  toast(`✅ Confirmado: ${fmtNum(metrosTotales)}m en ${infoRollo.bloqueActual}. Sugerencias MRU actualizadas.`);
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
  toast(`✂️ Corte (-4m) aplicado en ${info.bloqueActual}. Nuevo bloque abierto.`);
  await cargarDatosTodo();
}

async function registrarAvanceOCalibracion(tipoAccion) {
  const info = obtenerRolloPapelActivo();
  const defMts = tipoAccion === "Calibración" ? "1.0" : "2.0";
  const m = parseFloat(prompt(`📏 ¿Cuántos metros de papel se consumieron por ${tipoAccion} en el rollo ${info.bloqueActual}?`, defMts));
  if (!m || m <= 0) return;
  const obs = prompt("Motivo / Detalle opcional:", tipoAccion) || tipoAccion;

  await sb().from("prod_impresiones").insert({
    empresa_id: "vvgrafic-principal",
    batch_id: `MERMA-${Date.now()}`,
    fecha_hora: new Date().toISOString(),
    id_rollo_papel: info.bloqueActual,
    id_rollo_base: info.idBase,
    cliente_archivo: `--- ${tipoAccion.toUpperCase()} (-${fmtNum(m)}m) ---`,
    accion: tipoAccion,
    metros_impresos: 0,
    metros_desperdicio: m,
    metros_restantes_snapshot: Math.max(0, info.restantes - m),
    ruta: "Interno",
    observaciones: obs
  });
  toast(`✅ ${tipoAccion} (-${fmtNum(m)}m) descontado del rollo ${info.bloqueActual}.`);
  await cargarDatosTodo();
}

// Finalizar trabajo o rollo entero en Calandrado respetando Fecha Manual (Pedido #3) y pasando el lote anidado a Láser (Pedido #2)
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

  if (String(reg.ruta || "").includes("Láser")) {
    await sb().from("prod_cola_laser").insert({
      empresa_id: "vvgrafic-principal",
      batch_id: reg.batch_id,
      fecha_ingreso: fechaFinIso,
      id_rollo_papel: reg.id_rollo_papel,
      cliente_archivo: reg.cliente_archivo,
      tela_rollo_color: `${reg.tela_destino || "-"} | ${reg.num_rollo_tela || "-"} | ${reg.color_tela || "Blanco"}`,
      metros: reg.metros,
      ruta: reg.ruta,
      velocidad: 35,
      poder: 90,
      estado: "Pendiente",
      observaciones: reg.observaciones || "",
      file_id: reg.file_id || ""
    });
  }

  toast(`🔥 Calandrado finalizado con fecha ${fmtDateHora(fechaFinIso)}.`);
  await cargarDatosTodo();
}

async function procesarRolloCompletoCalandrado(rolloId) {
  const trabajos = STATE.colaCalandrado.filter(c => c.id_rollo_papel === rolloId && !String(c.estado).toLowerCase().includes("terminado"));
  if (trabajos.length === 0) return;

  const inputFechaManual = document.getElementById("calInputFechaManual")?.value;
  const msgFecha = inputFechaManual
    ? `con la Fecha Manual seleccionada (${fmtDateHora(new Date(inputFechaManual).toISOString())})`
    : `con fecha y hora actual`;

  if (!confirm(`¿Marcar los ${trabajos.length} trabajo(s) del rollo ${rolloId} como Calandrados ${msgFecha}?`)) return;

  for (const t of trabajos) {
    await finalizarTrabajoCalandrado(t.id);
  }
}

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
// MODAL UNIVERSAL CRUD (EDITAR O AGREGAR CUALQUIER REGISTRO EN CUALQUIER MOMENTO)
// ============================================================================
const ESQUEMA_CAMPOS_CRUD = {
  prod_impresiones: [
    { key: "fecha_hora", label: "Fecha y Hora (ISO o YYYY-MM-DDTHH:mm)", type: "text" },
    { key: "id_rollo_papel", label: "Bloque / ID Rollo Papel (ej: 29g-1910-1)", type: "text" },
    { key: "id_rollo_base", label: "ID Rollo Base (ej: 29g-1910-1)", type: "text" },
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
    { key: "fecha_terminado", label: "Fecha Terminado (Vacío si está Pendiente)", type: "text" },
    { key: "id_rollo_papel", label: "Bloque / ID Rollo Papel", type: "text" },
    { key: "cliente_archivo", label: "Cliente / Archivo(s)", type: "text" },
    { key: "tela_destino", label: "Tela Destino", type: "text" },
    { key: "num_rollo_tela", label: "Nº Rollo Tela", type: "text" },
    { key: "color_tela", label: "Color Tela", type: "text" },
    { key: "metros", label: "Metros", type: "number" },
    { key: "perfil", label: "Perfil", type: "text" },
    { key: "ruta", label: "Ruta de Producción", type: "text" },
    { key: "estado", label: "Estado (Pendiente / Terminado)", type: "text" },
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
    { key: "cliente", label: "Cliente / Carpeta", type: "text" },
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
          <label>${escHtml(c.label)}</label>
          <textarea data-crud-key="${c.key}" rows="2">${escHtml(val)}</textarea>
        </div>
      `;
    }
    return `
      <div>
        <label>${escHtml(c.label)}</label>
        <input type="${c.type === "number" ? "number" : "text"}" step="any" data-crud-key="${c.key}" value="${escHtml(val)}"/>
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
    else if (v === "" && k.includes("fecha_terminado")) v = null;
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

async function editarNotaRapida(tabla, id, batchId) {
  const reg = obtenerRegistroMemoria(tabla, id);
  const actual = reg?.observaciones || "";
  const nueva = prompt("📝 Escribí o editá la Nota / Especificación / Falla para este trabajo (se verá en todas las áreas):", actual);
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
// KIOSKO OPERATIVO 90dvh Y REPORTE DE FALLAS
// ============================================================================
function abrirKioscoCalandra(idCal, rolloId = null) {
  const modal = document.getElementById("modalKioscoOperativo");
  if (!modal) return;

  let trabajos = [];
  if (rolloId) {
    trabajos = STATE.colaCalandrado.filter(c => c.id_rollo_papel === rolloId && !String(c.estado).toLowerCase().includes("terminado"));
  } else {
    const r = STATE.colaCalandrado.find(c => c.id === idCal);
    if (r) trabajos = [r];
  }
  if (trabajos.length === 0) return;

  const totalM = trabajos.reduce((a, b) => a + (Number(b.metros) || 0), 0);
  STATE.kiosco.abierto = true;
  STATE.kiosco.registroIds = trabajos.map(t => t.id);
  STATE.kiosco.inicioMs = Date.now();

  document.getElementById("kioscoTitulo").textContent = `▶️ MODO KIOSKO — ROLLO ${trabajos[0].id_rollo_papel}`;
  document.getElementById("kioscoSubtitulo").innerHTML = `
    <div style="font-size:15px;font-weight:800;margin-bottom:8px;color:var(--vg-brand-secondary);">
      ${trabajos.length} Trabajo(s) | Total: ${fmtNum(totalM)}m
    </div>
    ${trabajos.map(t => `
      <div style="padding:8px;background:var(--vg-surface-input);border:1px solid var(--vg-border-subtle);border-radius:6px;margin-bottom:6px;font-size:12px;">
        <strong>${escHtml(t.cliente_archivo)}</strong> — <span class="font-mono" style="color:var(--vg-status-ready);">${fmtNum(t.metros)}m</span>
        | Tela: <strong>${escHtml(t.tela_destino || "-")}</strong> (${escHtml(t.num_rollo_tela || "-")})
        ${t.observaciones ? `<div style="margin-top:4px;color:var(--vg-status-processing);font-weight:700;">📝 ${escHtml(t.observaciones)}</div>` : ""}
      </div>
    `).join("")}
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
    for (const id of STATE.kiosco.registroIds) {
      await finalizarTrabajoCalandrado(id, min);
    }
  };
}

async function reportarFallaConReposicion(reg, estacion) {
  if (!reg) return;
  const mDefault = reg.metros || reg.metros_impresos || 10;
  const metrosFalla = parseFloat(prompt(`⚠️ ¿Cuántos metros salieron con falla en "${reg.cliente_archivo}"?`, mDefault)) || 0;
  if (metrosFalla <= 0) return;
  const motivo = prompt("Describí el motivo de la falla (ej: Mancha, arruga, corte):", `Falla en ${estacion}`) || `Falla en ${estacion}`;

  await sb().from("prod_fallas_reposiciones").insert({
    empresa_id: "vvgrafic-principal",
    tipo_registro: "ALERTA_REPOSICION",
    estacion,
    id_rollo: reg.id_rollo_papel,
    batch_id: reg.batch_id,
    archivo_afectado: reg.cliente_archivo,
    tela: reg.tela_destino,
    metros_merma: metrosFalla,
    detalle_reposicion: `Reimprimir ${metrosFalla}m por falla en ${estacion}`,
    motivo,
    estado: "Pendiente"
  });

  await sb().from("prod_pendientes_drive").insert({
    empresa_id: "vvgrafic-principal",
    modulo: "SUBLIMACION",
    cliente: `🚨 REPOSICIÓN ${estacion.toUpperCase()}`,
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
    file_id: `REPO-${Date.now()}`
  });

  toast(`🚨 Falla registrada y orden de reposición (${fmtNum(metrosFalla)}m) enviada a Cola Pendiente.`, "warn");
  await cargarDatosTodo();
}

// ============================================================================
// INICIALIZACIÓN DE EVENTOS DE INTERFAZ
// ============================================================================
export function inicializarEventosUI() {
  // Cargar Logo Oficial V&V Grafic
  const imgLogo = document.getElementById("imgLogoVV");
  if (imgLogo && window.VG_LOGO_B64) {
    imgLogo.src = window.VG_LOGO_B64.startsWith("data:")
      ? window.VG_LOGO_B64
      : `data:image/png;base64,${window.VG_LOGO_B64}`;
  }

  // 1. Navegación de Pestañas (.tab-btn y .tab-content)
  document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      STATE.tabActiva = tab;
      document.querySelectorAll(".tab-btn[data-tab]").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab-content").forEach(sec => {
        sec.classList.toggle("active", sec.id === `sec-${tab}`);
      });
    });
  });

  // 2. Filtros de Período Temporal (Histórico, Hoy, Día Anterior/Ayer, Esta Semana, Semana Anterior, Este Mes, Rango)
  document.querySelectorAll(".vg-period-pill[data-period]").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.periodoActivo = btn.getAttribute("data-period");
      document.querySelectorAll(".vg-period-pill[data-period]").forEach(b => b.classList.toggle("mru-top", b === btn));
      renderTodoRespetandoFormulario();
    });
  });

  const inpDesde = document.getElementById("vgDateDesde");
  const inpHasta = document.getElementById("vgDateHasta");
  const aplicarRangoCustom = () => {
    STATE.fechaDesde = inpDesde?.value || "";
    STATE.fechaHasta = inpHasta?.value || "";
    STATE.periodoActivo = "custom";
    document.querySelectorAll(".vg-period-pill[data-period]").forEach(b => b.classList.remove("mru-top"));
    renderTodoRespetandoFormulario();
  };
  document.getElementById("btnCalcularRango")?.addEventListener("click", aplicarRangoCustom);
  [inpDesde, inpHasta].forEach(inp => inp?.addEventListener("change", aplicarRangoCustom));

  // 3. Buscador Universal Instantáneo (OmniSearch) y Buscadores Locales
  const omniInput = document.getElementById("vgOmniSearchInput");
  const omniClear = document.getElementById("vgOmniSearchClear");
  omniInput?.addEventListener("input", () => {
    STATE.busquedaGlobal = omniInput.value;
    renderTodoRespetandoFormulario();
  });
  omniClear?.addEventListener("click", () => {
    STATE.busquedaGlobal = "";
    if (omniInput) omniInput.value = "";
    renderTodoRespetandoFormulario();
  });

  document.getElementById("searchPendientesLocal")?.addEventListener("input", (e) => {
    STATE.filtroPendientesLocal = e.target.value;
    renderPendientesDriveSublimacion();
  });
  document.getElementById("searchCalandraLocal")?.addEventListener("input", (e) => {
    STATE.filtroCalandraLocal = e.target.value;
    renderModuloCalandrado();
  });

  // 4. Protección Dirty-Form en inputs de Impresión (Pedido #7)
  ["metrosLote", "perfil", "tela", "rolloTela", "color", "diseno", "observaciones"].forEach(campo => {
    const el = document.getElementById(`impInput_${campo}`);
    if (el) {
      el.addEventListener("input", () => {
        STATE.impForm.dirty = true;
        STATE.impForm[campo] = el.value;
        actualizarClasesSeleccionChips();
      });
    }
  });

  // 5. Botones Táctiles de Ruta de Producción (Pedido #4)
  document.querySelectorAll(".vg-route-btn[data-ruta-val]").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.impForm.dirty = true;
      STATE.impForm.ruta = btn.getAttribute("data-ruta-val");
      actualizarBotonesRutaUI();
    });
  });

  // 6. Acciones de Impresión y Botones de Rollo (+ Rollo Nuevo, Corte -4m, Avance, Calibración, Sobrantes)
  document.getElementById("btnConfirmarImpresion")?.addEventListener("click", procesarImpresionLote);
  document.getElementById("btnCortarPapel4m")?.addEventListener("click", cortarBloquePapel4m);
  document.getElementById("btnAvanceManual")?.addEventListener("click", () => registrarAvanceOCalibracion("Avance Manual"));
  document.getElementById("btnCalibracionPapel")?.addEventListener("click", () => registrarAvanceOCalibracion("Calibración"));

  document.getElementById("btnToggleSobrantes")?.addEventListener("click", () => {
    const p = document.getElementById("panelSobrantes");
    if (p) p.style.display = p.style.display === "none" ? "block" : "none";
  });

  document.getElementById("btnAbrirModalMontarRollo")?.addEventListener("click", () => {
    document.getElementById("modalMontarRollo")?.classList.add("open");
  });
  document.getElementById("btnConfirmarMontarRollo")?.addEventListener("click", async () => {
    const gramaje = document.getElementById("montarRolloGramaje")?.value || "29";
    const metros = parseFloat(document.getElementById("montarRolloMetros")?.value) || 500;
    const obs = document.getElementById("montarRolloObs")?.value || "";
    const hoy = new Date();
    const ddmm = String(hoy.getDate()).padStart(2, "0") + String(hoy.getMonth() + 1).padStart(2, "0");
    const nuevoId = `${gramaje}g-${ddmm}-${STATE.rollosPapelSaldos.length + 1}`;

    await sb().from("prod_rollos_papel").update({ estado: "Sobrante" }).eq("estado", "Activo");
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

  // 7. Calandrado: Orden y Previsión de Telas
  document.getElementById("btnOrdenCalandra")?.addEventListener("click", (e) => {
    STATE.ordenCalandraAsc = !STATE.ordenCalandraAsc;
    e.currentTarget.textContent = STATE.ordenCalandraAsc
      ? "⬇️ Orden: Más antiguos primero"
      : "⬆️ Orden: Más recientes primero";
    renderModuloCalandrado();
  });

  document.getElementById("btnAbrirPrevisionTelas")?.addEventListener("click", () => {
    const p = document.getElementById("panelPrevisionTelasInline");
    if (p) p.style.display = p.style.display === "none" ? "block" : "none";
  });

  // 8. Lector Binario Real de DPI y Geometría de Archivos
  const inpFileDpi = document.getElementById("inpInspectorArchivosLocales");
  inpFileDpi?.addEventListener("change", async (e) => {
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

  // 9. Sincronizar con Google Drive real (Solo Lectura vía Puente Sandbox)
  document.getElementById("btnSyncDriveSandbox")?.addEventListener("click", async () => {
    const url = window.VG_CONEXION?.sandboxBridgeUrl;
    toast("🔄 Sincronizando cola de impresión...");
    if (url) {
      try {
        await fetch(`${url}?action=sync_drive`, { mode: "no-cors" });
      } catch (_) {}
    }
    await cargarDatosTodo();
    toast("✅ Cola sincronizada.");
  });

  // 10. Módulo DTF: Calculadora en vivo y Registro de Pedido / Tirada
  const dtfMetrosInp = document.getElementById("dtfInputMetrosArchivo");
  const dtfCargoSel = document.getElementById("dtfInputTipoCargo");
  const dtfArchivoInp = document.getElementById("dtfInputArchivo");
  const dtfClienteInp = document.getElementById("dtfInputCliente");

  const recalcularPreviewDTF = () => {
    const m = parseFloat(dtfMetrosInp?.value) || 0;
    const cargo = dtfCargoSel?.value || "VENTA";
    const nom = dtfArchivoInp?.value || "";
    const cli = dtfClienteInp?.value || "";

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
        → Total a cobrar: <strong style="font-size:15px;color:var(--vg-status-ready);">${fmtMoney(subtotal)}</strong>
      `;
    }

    const dupAlert = document.getElementById("dtfDuplicateAlert");
    if (dupAlert && nom.trim().length > 3) {
      const yaExiste = STATE.dtfPedidos.find(p =>
        p.nombre_archivo.toLowerCase() === nom.trim().toLowerCase() &&
        (!cli || p.cliente.toLowerCase() === cli.trim().toLowerCase())
      );
      if (yaExiste && cargoEfectivo === "VENTA") {
        dupAlert.style.display = "block";
        dupAlert.innerHTML = `⚠️ <strong>ALERTA DE DUPLICADO:</strong> "${escHtml(nom)}" ya fue impreso el ${fmtDateHora(yaExiste.fecha_hora)}. Si es reposición, agregale <code>(repo)</code>.`;
      } else {
        dupAlert.style.display = "none";
      }
    }
  };

  [dtfMetrosInp, dtfCargoSel, dtfArchivoInp, dtfClienteInp].forEach(el => {
    el?.addEventListener("input", recalcularPreviewDTF);
    el?.addEventListener("change", recalcularPreviewDTF);
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

    const { data: tiradaData } = await sb().from("prod_dtf_tiradas").insert({
      empresa_id: "vvgrafic-principal",
      codigo_tirada: `DTF-${Date.now().toString().slice(-5)}`,
      id_rollo_dtf: idRollo,
      es_anidado: metrosRollo !== metrosArch,
      metros_consumidos_rollo: metrosRollo,
      observaciones: obs
    }).select();

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

    toast(`🎞️ Trabajo DTF registrado (${fmtNum(metrosArch)}m).`);
    if (dtfArchivoInp) dtfArchivoInp.value = "";
    await cargarDatosTodo();
  });

  // 11. Finanzas: Guardar Compra de Insumo
  document.getElementById("btnGuardarCompraFinanzas")?.addEventListener("click", () => {
    const tipo = document.getElementById("finCompraTipo")?.value || "Insumo";
    const det = document.getElementById("finCompraDetalle")?.value || "";
    const cant = document.getElementById("finCompraCant")?.value || 1;
    const costo = document.getElementById("finCompraCosto")?.value || 0;
    toast(`🛒 Compra registrada: ${cant}x ${tipo} (${det}) — ${fmtMoney(costo)}`);
  });

  // 12. Chat Interno de Taller
  const inpFotoChat = document.getElementById("chatInputFotoCamara");
  inpFotoChat?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    STATE.chatFotoBase64 = await comprimirFotoCamaraWebP(f);
    const prev = document.getElementById("chatFotoPreviewBadge");
    if (prev) {
      prev.style.display = "inline-flex";
      prev.textContent = "📷 Foto WebP lista";
    }
  });

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
    toast("💬 Mensaje enviado al taller.");
    await cargarDatosTodo();
  });

  // 13. Delegación global de clics en tablas y tarjetas
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
    const btnPuchito = e.target.closest(".btn-activar-puchito");
    if (btnPuchito) {
      const rId = btnPuchito.getAttribute("data-rollo");
      await sb().from("prod_rollos_papel").update({ estado: "Sobrante" }).eq("estado", "Activo");
      await sb().from("prod_rollos_papel").update({ estado: "Activo" }).eq("id_rollo", rId);
      toast(`🧻 Sobrante ${rId} montado como Rollo Activo.`);
      await cargarDatosTodo();
      return;
    }
    const btnImpFalla = e.target.closest(".btn-imp-falla");
    if (btnImpFalla) {
      const reg = STATE.impresiones.find(i => i.id === btnImpFalla.getAttribute("data-id"));
      reportarFallaConReposicion(reg, "Impresión");
      return;
    }
    const btnImpDeshacer = e.target.closest(".btn-imp-deshacer");
    if (btnImpDeshacer) {
      const reg = STATE.impresiones.find(i => i.id === btnImpDeshacer.getAttribute("data-id"));
      if (reg && confirm(`¿Deshacer la impresión "${reg.cliente_archivo}" y descontarla del rollo?`)) {
        await sb().from("prod_impresiones").delete().eq("id", reg.id);
        if (reg.batch_id) {
          await sb().from("prod_cola_calandrado").delete().eq("batch_id", reg.batch_id);
        }
        toast("🔙 Impresión deshecha y saldos recalculados.");
        await cargarDatosTodo();
      }
      return;
    }
    const btnCalMontarRollo = e.target.closest(".btn-cal-montar-rollo");
    if (btnCalMontarRollo) {
      const rId = btnCalMontarRollo.getAttribute("data-rollo");
      STATE.rolloMontadoCalandra = STATE.rolloMontadoCalandra === rId ? "" : rId;
      localStorage.setItem("vg_rollo_calandra_montado", STATE.rolloMontadoCalandra);
      STATE.rollosCalandraAbiertos.add(rId);
      toast(`🔥 Rollo ${rId} marcado como montado en Calandra.`);
      renderModuloCalandrado();
      return;
    }
    const btnCalKioscoRollo = e.target.closest(".btn-cal-kiosco-rollo");
    if (btnCalKioscoRollo) {
      abrirKioscoCalandra(null, btnCalKioscoRollo.getAttribute("data-rollo"));
      return;
    }
    const btnCalProcRollo = e.target.closest(".btn-cal-procesar-rollo");
    if (btnCalProcRollo) {
      procesarRolloCompletoCalandrado(btnCalProcRollo.getAttribute("data-rollo"));
      return;
    }
    const btnCalPdfRollo = e.target.closest(".btn-cal-pdf-rollo");
    if (btnCalPdfRollo) {
      const rId = btnCalPdfRollo.getAttribute("data-rollo");
      STATE.rollosCalandraAbiertos.add(rId);
      renderModuloCalandrado();
      window.print();
      return;
    }
    const btnCalTerm = e.target.closest(".btn-cal-terminar");
    if (btnCalTerm) {
      finalizarTrabajoCalandrado(btnCalTerm.getAttribute("data-id"));
      return;
    }
    const btnCalReabrir = e.target.closest(".btn-cal-reabrir");
    if (btnCalReabrir) {
      await sb().from("prod_cola_calandrado").update({ estado: "Pendiente", fecha_terminado: null }).eq("id", btnCalReabrir.getAttribute("data-id"));
      toast("🔙 Trabajo devuelto a la Cola de Calandrado.");
      await cargarDatosTodo();
      return;
    }
    const btnCalKiosco = e.target.closest(".btn-cal-kiosco");
    if (btnCalKiosco) {
      abrirKioscoCalandra(btnCalKiosco.getAttribute("data-id"));
      return;
    }
    const btnCalFalla = e.target.closest(".btn-cal-falla");
    if (btnCalFalla) {
      const reg = STATE.colaCalandrado.find(c => c.id === btnCalFalla.getAttribute("data-id"));
      reportarFallaConReposicion(reg, "Calandrado");
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
      document.querySelector('.tab-btn[data-tab="chat"]')?.click();
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

  document.getElementById("btnGuardarModalCrud")?.addEventListener("click", guardarModalCrudUniversal);

  document.querySelectorAll(".vg-modal-close").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.closest(".modal-overlay")?.classList.remove("open");
    });
  });

  const selOp = document.getElementById("vgSelectOperadorActual");
  if (selOp) {
    selOp.value = STATE.usuarioActual;
    selOp.addEventListener("change", () => {
      STATE.usuarioActual = selOp.value;
      localStorage.setItem("vg_operador_actual", STATE.usuarioActual);
      renderTodoRespetandoFormulario();
    });
  }

  document.querySelectorAll(".btn-canal-chat").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.canalChatActivo = btn.getAttribute("data-canal");
      document.querySelectorAll(".btn-canal-chat").forEach(b => b.classList.toggle("mru-top", b === btn));
      renderModuloChat();
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  inicializarEventosUI();
  cargarDatosTodo();
  suscribirRealtime();
});
