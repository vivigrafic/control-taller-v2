// ============================================================================
// CONTROL DE TALLER Y PRODUCCIÓN 2.0 — V&V GRAFIC (MOTOR PRINCIPAL SUPABASE)
// Conectado exclusivamente al Clon de Pruebas: kkvzzheccniclfwqzivu
// Estilo Visual 100% Idéntico a la App en Uso (Estilos.html + Index.html + JS_*.html)
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
  periodoActivo: "todo",
  fechaDesde: "",
  fechaHasta: "",
  busquedaGlobal: "",
  filtroPendientesLocal: "",
  filtroHistorialImpLocal: "",
  filtroCalandraLocal: "",
  ordenCalandraAsc: true,
  rollosCalandraAbiertos: new Set(),
  rollosHistCalCerrados: new Set(),
  carpetasPendientesAbiertas: new Set(),
  rolloMontadoCalandra: localStorage.getItem("vg_rollo_calandra_montado") || "",
  usuarioActual: localStorage.getItem("vg_operador_actual") || "Roberto",
  areaActual: localStorage.getItem("vg_area_actual") || "General",
  canalChatActivo: "Todos",

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

  // Protección Dirty-Form (Pedido #7)
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

  kiosco: {
    abierto: false,
    modo: "rollo", // "individual" (modalEnfoqueCalandra) o "rollo" (modalKioscoOperativo)
    corriendoEnFondo: false,
    pausado: false,
    acumuladoMs: 0,
    ultimoInicioMs: 0,
    rolloId: "",
    trabajos: [],
    indiceActual: 0,
    completadosIds: new Set(),
    descartadosIds: new Set(),
    registroIds: [],
    inicioMs: 0,
    timerInterval: null
  },

  chatFotoBase64: ""
};

const sb = () => window.vgSupabase;

function fmtNum(n, dec = 2) {
  const v = Number(n) || 0;
  return v.toFixed(dec);
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  return "$" + v.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDateHora(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}<br>${hh}:${mi}`;
}
function fmtDateHoraLineal(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
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
  const borderVar = tipo === "error" ? "var(--danger)" : tipo === "warn" ? "var(--accent-orange)" : "var(--accent)";
  el.style.cssText = `background:#111;color:#fff;border:2px solid ${borderVar};padding:10px 14px;border-radius:6px;font-weight:bold;font-size:12px;box-shadow:0 6px 20px rgba(0,0,0,0.6);margin-top:8px;`;
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Extrae el ID real de Google Drive exactamente como JS_Impresion.html (línea 231) y JS_Calandrado.html (línea 68)
function extraerThumbIdDrive(fileIdStr) {
  if (!fileIdStr || String(fileIdStr).trim() === "null" || String(fileIdStr).trim() === "undefined") return null;
  const s = String(fileIdStr).trim();
  if (s.startsWith("SUB-PEND-") || s.startsWith("DTF-") || s.startsWith("LOCAL-") || s.startsWith("REPO-")) return null;
  const matches = s.match(/[a-zA-Z0-9_-]{25,45}/g);
  return matches && matches.length > 0 ? matches[0] : null;
}

// Renderiza la miniatura real de Google Drive (60x60px) + texto del Diseño tal cual la App en Uso
function renderMiniaturaDiseno60(fileIdStr, disenoStr, nombreStr = "") {
  const thumbId = extraerThumbIdDrive(fileIdStr);
  const textoDiseno = escHtml(disenoStr || "");
  if (thumbId) {
    return `<img src="https://drive.google.com/thumbnail?id=${escHtml(thumbId)}&sz=w100-h100" onerror="this.style.display='none'" style="width:60px; height:60px; margin:0 auto 4px auto; object-fit:cover; border-radius:4px; cursor:pointer; display:block;" onclick="event.stopPropagation(); window.open('https://drive.google.com/file/d/${escHtml(thumbId)}/view', '_blank')" title="${escHtml(nombreStr || disenoStr || "Ver archivo en Drive")}" />${textoDiseno}`;
  }
  return textoDiseno || `<span style="color:#666; font-size:10px;">-</span>`;
}

// ============================================================================
// CÁLCULOS DE FECHAS Y PERÍODOS
// ============================================================================
function obtenerVentanasTemporales() {
  const ahora = new Date();
  const hoyIni = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
  const hoyFin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
  const ayerIni = new Date(hoyIni.getTime() - 86400000);
  const diaSem = ahora.getDay() || 7;
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
  if (STATE.periodoActivo === "todo") return { desde: null, hasta: null, etiqueta: "Histórico" };
  if (STATE.periodoActivo === "hoy") return { desde: hoyIni, hasta: hoyFin, etiqueta: "Hoy" };
  if (STATE.periodoActivo === "ayer") return { desde: ayerIni, hasta: new Date(hoyIni.getTime() - 1), etiqueta: "Día Anterior (Ayer)" };
  if (STATE.periodoActivo === "semana_actual") return { desde: semActualIni, hasta: hoyFin, etiqueta: "Esta Semana" };
  if (STATE.periodoActivo === "semana_anterior") return { desde: semAntIni, hasta: new Date(semActualIni.getTime() - 1), etiqueta: "Semana Anterior" };
  if (STATE.periodoActivo === "mes_actual") return { desde: mesActualIni, hasta: hoyFin, etiqueta: "Este Mes" };
  if (STATE.periodoActivo === "custom") {
    const d = STATE.fechaDesde ? new Date(STATE.fechaDesde + "T00:00:00") : null;
    const h = STATE.fechaHasta ? new Date(STATE.fechaHasta + "T23:59:59") : null;
    return { desde: d, hasta: h, etiqueta: `${STATE.fechaDesde || "..."} a ${STATE.fechaHasta || "..."}` };
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
// CARGA DE DATOS EN VIVO DESDE SUPABASE (kkvzzheccniclfwqzivu)
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
          toast(`🔔 @${STATE.usuarioActual}: ${msg.autor_nombre} te mencionó en el Chat`, "warn");
        }
      }
      cargarDatosTodo();
    })
    .subscribe();
}

// ============================================================================
// RANKING INTELIGENTE MRU (#1 SIEMPRE ES EL ÚLTIMO USADO — Pedido #3)
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
// RENDERIZADO GENERAL
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

function renderBadgesYTodosLosKPIs() {
  const { hoyIni, ayerIni, semActualIni, semAntIni, mesActualIni, anioActualIni } = obtenerVentanasTemporales();

  const pendSubRows = STATE.pendientesDrive.filter(p => p.modulo === "SUBLIMACION" && p.estado_impreso !== "SI");
  const pendCalRows = STATE.colaCalandrado.filter(c => !String(c.estado).toLowerCase().includes("terminado"));
  const pendLasRows = STATE.colaLaser.filter(l => !String(l.estado).toLowerCase().includes("terminado"));

  const mPendImp = pendSubRows.reduce((a, b) => a + (Number(b.metros_totales) || 0), 0);
  const mPendCal = pendCalRows.reduce((a, b) => a + (Number(b.metros) || 0), 0);
  const mPendLas = pendLasRows.reduce((a, b) => a + (Number(b.metros) || 0), 0);

  const mencionesSinLeer = STATE.chatMensajes.filter(m => !m.resuelto && Array.isArray(m.menciones) && m.menciones.includes(STATE.usuarioActual)).length;
  setTxt("badgeTabChat", mencionesSinLeer || STATE.chatMensajes.length);

  // KPIs Impresión
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

  // KPIs Calandrado
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

  // KPIs Láser
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

  const el = document.getElementById("vgPeriodSummaryMetrics");
  if (el) {
    if (STATE.periodoActivo === "todo" && !STATE.busquedaGlobal) {
      el.textContent = "(Selecciona fechas para ver metros producidos)";
    } else {
      el.textContent = `Rendimiento (${etiqueta}): 🖨️ ${fmtNum(mImp)}m Impresos | ♨️ ${fmtNum(mCal)}m Calandrados | ⚡ ${fmtNum(mLaser)}m Cortados`;
    }
  }
}

// ============================================================================
// MÓDULO 1: IMPRESIÓN (Idéntico a JS_Impresion.html)
// ============================================================================
function obtenerRolloPapelActivo() {
  const activo = STATE.rollosPapelSaldos.find(r => r.estado === "Activo") || STATE.rollosPapelSaldos[0];
  if (!activo) {
    return { idBase: "29g-1910-1", bloqueActual: "29g-1910-1", restantes: 290, iniciales: 500, impresos: 210 };
  }
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
  setTxt("lblSumaBloqueActual", `${fmtNum(sumaBloque)}m`);

  const sobrantes = STATE.rollosPapelSaldos.filter(r => r.id_rollo !== info.idBase && Number(r.metros_restantes_reales) > 2);
  setTxt("cantSobrantesBadge", `${sobrantes.length} Disponibles`);
  const contSob = document.getElementById("listaSobrantesContainer");
  if (contSob) {
    contSob.innerHTML = sobrantes.length === 0
      ? "<div style='font-size:11px; color:#888; text-align:center; padding:10px;'>No hay retazos en depósito.</div>"
      : sobrantes.map(s => {
          const esPremium = Number(s.metros_restantes_reales) >= 15;
          return `
            <div class="sobrante-card ${esPremium ? "premium" : ""}">
              <div>
                <strong style="color:var(--accent);">${escHtml(s.id_rollo)}</strong> (${escHtml(s.gramaje)}g)
                ${esPremium ? `<span class="badge activo" style="margin-left:5px;">⭐ >=15m Útil</span>` : ""}
                <div style="font-size:11px; color:#aaa;">Disponible: <strong style="color:#fff; font-size:13px;">${fmtNum(s.metros_restantes_reales)}m</strong></div>
              </div>
              <button type="button" class="btn-activar-puchito" data-rollo="${escHtml(s.id_rollo)}" style="background:var(--accent); border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer; color:#000;">🔄 Re-montar</button>
            </div>
          `;
        }).join("");
  }
}

function renderChipsImpresion() {
  const telas = obtenerItemsMRU("TELA").slice(0, 6);
  const perfiles = obtenerItemsMRU("PERFIL").slice(0, 5);
  const colores = obtenerItemsMRU("COLOR").slice(0, 6);

  // Poblar datalists igual que en JS_Global.html
  const dlTelas = document.getElementById("listTelas");
  if (dlTelas) dlTelas.innerHTML = telas.map(t => `<option value="${escHtml(t.nombre)}">`).join("");
  const dlPerfiles = document.getElementById("listPerfiles");
  if (dlPerfiles) dlPerfiles.innerHTML = perfiles.map(p => `<option value="${escHtml(p.nombre)}">`).join("");
  const dlColores = document.getElementById("listColores");
  if (dlColores) dlColores.innerHTML = colores.map(c => `<option value="${escHtml(c.nombre)}">`).join("");

  const renderGrupo = (containerId, items, campoForm) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = items.map((item, idx) => {
      const isSelected = STATE.impForm[campoForm] === item.nombre;
      const isFirst = idx === 0;
      return `
        <span class="badge ${isFirst ? "activo" : ""}"
          data-chip-field="${campoForm}"
          data-chip-val="${escHtml(item.nombre)}"
          style="cursor:pointer; ${isSelected ? "outline:2px solid var(--accent-blue);" : ""}"
          title="${isFirst ? "⚡ Último usado (#1)" : "Clic para elegir"}">
          ${isFirst ? "⚡ " : ""}${escHtml(item.nombre)}
        </span>
      `;
    }).join("");

    el.querySelectorAll("[data-chip-field]").forEach(btn => {
      btn.addEventListener("click", () => {
        const field = btn.getAttribute("data-chip-field");
        const val = btn.getAttribute("data-chip-val");
        STATE.impForm.dirty = true;
        STATE.impForm[field] = val;
        const inputEl = document.getElementById(`impInput_${field}`);
        if (inputEl) {
          inputEl.value = val;
          inputEl.style.border = "2px solid var(--accent-blue)";
        }
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
    document.querySelectorAll(`[data-chip-field="${campo}"]`).forEach(btn => {
      const val = btn.getAttribute("data-chip-val");
      btn.style.outline = STATE.impForm[campo] === val ? "2px solid var(--accent-blue)" : "none";
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

// Renderiza Cola Pendiente con el HTML exacto de JS_Impresion.html (líneas 34-52)
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
    badgeSel.textContent = STATE.impForm.archivosSeleccionadosIds.size > 0
      ? `Seleccionados: ${fmtNum(sumaSeleccionados)}m | Bloque quedará en: ${fmtNum(actualBloque + sumaSeleccionados)}m`
      : "";
  }

  if (lista.length === 0) {
    cont.innerHTML = "<div style='padding:15px; text-align:center; color:#888;'>No hay archivos pendientes. Usa el botón Sincronizar o + Archivo Manual.</div>";
    return;
  }

  const carpetas = new Map();
  lista.forEach(p => {
    const cli = p.cliente || "SIN CLIENTE";
    if (!carpetas.has(cli)) carpetas.set(cli, []);
    carpetas.get(cli).push(p);
  });

  let html = "";
  for (const [cliente, archivos] of carpetas.entries()) {
    const abierta = STATE.carpetasPendientesAbiertas.has(cliente);
    const totalMtsCarpeta = archivos.reduce((a, b) => a + (Number(b.metros_totales) || 0), 0);
    const todosMarcados = archivos.every(a => STATE.impForm.archivosSeleccionadosIds.has(a.id));

    html += `
      <div class="folder-header" data-folder-cli="${escHtml(cliente)}" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
        <span>
          <input type="checkbox" class="chk-folder-all" data-folder-cli="${escHtml(cliente)}" ${todosMarcados ? "checked" : ""} style="margin-right:10px; width:16px; height:16px; cursor:pointer;" title="Seleccionar todo" />
          📁 <strong>${escHtml(cliente)}</strong> (${archivos.length})
        </span>
        <span style="cursor:pointer; font-weight:bold; color:var(--accent);">${fmtNum(totalMtsCarpeta)}m ${abierta ? "▼" : "►"}</span>
      </div>
      <div class="folder-content" style="display:${abierta ? "block" : "none"};">
        ${archivos.map(p => {
          const checked = STATE.impForm.archivosSeleccionadosIds.has(p.id);
          return `
            <label class="file-item" style="${checked ? "border-color:var(--accent-blue);" : ""}">
              <input type="checkbox" class="chk-pend-sub" data-id="${p.id}" ${checked ? "checked" : ""} />
              <div class="file-info">
                <span class="fname">${p.prioridad_maxima ? "🚨 " : ""}${escHtml(p.nombre_archivo)}</span>
              </div>
              <div class="fmeters">${fmtNum(p.metros_totales)}m</div>
            </label>
          `;
        }).join("")}
      </div>
    `;
  }

  cont.innerHTML = html;

  cont.querySelectorAll(".chk-pend-sub").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-id");
      if (chk.checked) STATE.impForm.archivosSeleccionadosIds.add(id);
      else STATE.impForm.archivosSeleccionadosIds.delete(id);
      aplicarAutodeteccionAlSeleccionarArchivos();
      renderPendientesDriveSublimacion();
    });
  });

  cont.querySelectorAll(".folder-header").forEach(hdr => {
    hdr.addEventListener("click", (e) => {
      const chkAll = e.target.closest(".chk-folder-all");
      const cli = hdr.getAttribute("data-folder-cli");
      if (chkAll) {
        e.stopPropagation();
        const archs = carpetas.get(cli) || [];
        archs.forEach(a => {
          if (chkAll.checked) STATE.impForm.archivosSeleccionadosIds.add(a.id);
          else STATE.impForm.archivosSeleccionadosIds.delete(a.id);
        });
        aplicarAutodeteccionAlSeleccionarArchivos();
        renderPendientesDriveSublimacion();
        return;
      }
      if (STATE.carpetasPendientesAbiertas.has(cli)) STATE.carpetasPendientesAbiertas.delete(cli);
      else STATE.carpetasPendientesAbiertas.add(cli);
      renderPendientesDriveSublimacion();
    });
  });
}

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
    ? seleccionados[0].nombre_archivo
    : `LOTE ANIDADO (${seleccionados.length} ARCHIVOS)`;

  const detectadosList = [];
  if (auto.perfil) detectadosList.push(`Perfil: ${auto.perfil}`);
  if (auto.tela) detectadosList.push(`Tela: ${auto.tela}`);
  if (auto.rollo) detectadosList.push(`Rollo: ${auto.rollo}`);
  if (auto.color) detectadosList.push(`Color: ${auto.color}`);

  STATE.impForm.autoDetectInfo = detectadosList.length > 0
    ? `✨ Detectado del nombre: ${detectadosList.join(" | ")}`
    : "";

  sincronizarInputsImpresionConState();
}

function sincronizarInputsImpresionConState() {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ""; };
  setVal("impInput_metrosLote", fmtNum(STATE.impForm.metrosLote));
  setVal("impInput_perfil", STATE.impForm.perfil);
  setVal("impInput_tela", STATE.impForm.tela);
  setVal("impInput_rolloTela", STATE.impForm.rolloTela);
  setVal("impInput_color", STATE.impForm.color);
  setVal("impInput_diseno", STATE.impForm.diseno);
  setVal("impInput_observaciones", STATE.impForm.observaciones);

  const thumb = document.getElementById("thumbPreviewBox");
  if (thumb) {
    const seleccionados = STATE.pendientesDrive.filter(p => STATE.impForm.archivosSeleccionadosIds.has(p.id));
    const fId = seleccionados.length > 0 ? seleccionados[0].file_id : "";
    const tId = extraerThumbIdDrive(fId);
    if (tId) {
      thumb.innerHTML = `<img src="https://drive.google.com/thumbnail?id=${escHtml(tId)}&sz=w100-h100" style="width:100%; height:100%; object-fit:cover; cursor:pointer;" onclick="window.open('https://drive.google.com/file/d/${escHtml(tId)}/view', '_blank')" onerror="this.outerHTML='<span style=\\'color:#666; font-size:10px;\\'>IMG</span>'" />`;
    } else {
      thumb.innerHTML = `<span style="color:#666; font-size:10px;">IMG</span>`;
    }
  }

  const banner = document.getElementById("impAutoDetectBanner");
  if (banner) {
    banner.style.display = STATE.impForm.autoDetectInfo ? "block" : "none";
    banner.textContent = STATE.impForm.autoDetectInfo;
  }
  actualizarClasesSeleccionChips();
}

function formatearAnidadosHTML(clienteArchivoTexto) {
  if (!clienteArchivoTexto) return "";
  const partes = String(clienteArchivoTexto).split(" | ");
  if (partes.length === 1) return escHtml(partes[0]);
  return `<div style="max-height:80px; overflow-y:auto; font-size:11px; padding:2px;">${partes.map((p, i) => (i === 0 ? escHtml(p) : `• ${escHtml(p)}`)).join("<br>")}</div>`;
}

// Renderiza Historial Impresión idéntico a JS_Impresion.html líneas 206-244 (Captura 2)
function renderTablaImpresionesConBloques() {
  const tbody = document.getElementById("tbodyHistorialImpresion");
  if (!tbody) return;

  const qHist = STATE.filtroHistorialImpLocal.trim().toLowerCase();
  const filtradas = STATE.impresiones.filter(i => {
    if (!cumpleFiltroFecha(i.fecha_hora) || !cumpleBusquedaUniversal(i)) return false;
    if (qHist && !`${i.id_rollo_papel} ${i.cliente_archivo} ${i.tela_destino} ${i.perfil}`.toLowerCase().includes(qHist)) return false;
    return true;
  });

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:#888;">No hay registros de impresión.</td></tr>`;
    return;
  }

  // Agrupar por bloque de rollo
  const bloquesMap = new Map();
  filtradas.forEach(row => {
    const bloqueId = row.id_rollo_papel || row.id_rollo_base || "Desconocido";
    if (!bloquesMap.has(bloqueId)) bloquesMap.set(bloqueId, []);
    bloquesMap.get(bloqueId).push(row);
  });

  let html = "";
  for (const [bloqueId, filas] of bloquesMap.entries()) {
    const filasDelBloque = STATE.impresiones.filter(x => x.id_rollo_papel === bloqueId && !x.anulado);
    const sumaImpresosBloque = filasDelBloque
      .filter(x => x.accion === "Impresion Normal")
      .reduce((acc, x) => acc + (Number(x.metros_impresos) || 0), 0);

    html += `
      <tr class="row-corte" style="background:#5e35b1 !important; color:#fff !important;">
        <td colspan="11">🔄 --- ROLLO NUEVO: ${escHtml(bloqueId)} | METROS SUMADOS DEL BLOQUE: ${fmtNum(sumaImpresosBloque)}m ---</td>
      </tr>
    `;

    // Dentro de cada bloque: orden cronológico ascendente (el primero impreso arriba, el último impreso abajo)
    const filasOrdenadas = [...filas].sort((a, b) => {
      const da = new Date(a.fecha_hora).getTime() || 0;
      const db = new Date(b.fecha_hora).getTime() || 0;
      return da - db;
    });

    filasOrdenadas.forEach(row => {
      if (row.accion && row.accion.includes("Corte de Papel")) {
        html += `<tr class="row-corte" style="background:var(--accent-magenta) !important; color:#fff !important;"><td colspan="11">✂️ --- CORTE DE PAPEL (-${fmtNum(row.metros_desperdicio)}m) ---</td></tr>`;
        return;
      }
      if (row.accion && row.accion.includes("Avance")) {
        html += `<tr class="row-corte" style="background:#e65100 !important;"><td colspan="11">📏 --- PURGA/AVANCE (${fmtNum(row.metros_desperdicio)}m) --- ${escHtml(row.observaciones || "")}</td></tr>`;
        return;
      }
      if (row.accion && row.accion.includes("Calibración")) {
        html += `<tr class="row-corte" style="background:#b71c1c !important;"><td colspan="11">⚙️ --- CALIBRACIÓN (${fmtNum(row.metros_desperdicio)}m) --- ${escHtml(row.observaciones || "")}</td></tr>`;
        return;
      }

      const m = fmtNum(row.metros_impresos || row.metros_desperdicio || 0);
      const actionBtn = `
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px; max-width:90px;">
          <button type="button" class="btn-imp-falla" data-id="${row.id}" style="background:transparent; border:1px solid var(--danger); border-radius:4px; cursor:pointer; color:var(--danger); padding:3px;" title="Reportar Falla">⚠️</button>
          <button type="button" class="btn-imp-deshacer" data-id="${row.id}" style="background:transparent; border:1px solid #aaa; color:#aaa; border-radius:4px; cursor:pointer; padding:3px;" title="Revertir">🔙</button>
          <button type="button" class="btn-nota-rapida" data-table="prod_impresiones" data-id="${row.id}" data-batch="${escHtml(row.batch_id)}" style="background:transparent; border:1px solid var(--accent-orange); color:var(--accent-orange); border-radius:4px; cursor:pointer; padding:3px;" title="Añadir/Editar Nota">📝</button>
          <button type="button" class="btn-imp-etiqueta" data-rollo="${escHtml(bloqueId)}" data-metros="${m}" style="background:var(--accent-blue); border:1px solid var(--accent-blue); border-radius:4px; cursor:pointer; color:#fff; padding:3px;" title="Etiqueta Lote">🖨️</button>
          <button type="button" class="btn-crud-edit" data-table="prod_impresiones" data-id="${row.id}" style="background:transparent; border:1px solid var(--accent-blue); color:var(--accent-blue); border-radius:4px; cursor:pointer; padding:3px;" title="Editar">✏️</button>
          <button type="button" class="btn-crud-del" data-table="prod_impresiones" data-id="${row.id}" style="background:transparent; border:1px solid var(--danger); color:var(--danger); border-radius:4px; cursor:pointer; padding:3px;" title="Eliminar">🗑️</button>
        </div>
      `;

      html += `
        <tr>
          <td>${actionBtn}</td>
          <td>${fmtDateHora(row.fecha_hora)}</td>
          <td>${formatearAnidadosHTML(row.cliente_archivo)}</td>
          <td style="text-align:center;">${renderMiniaturaDiseno60(row.file_id, row.diseno, row.cliente_archivo)}</td>
          <td>${escHtml(row.tela_destino || "")}</td>
          <td>${escHtml(row.num_rollo_tela || "")}</td>
          <td>${escHtml(row.color_tela || "")}</td>
          <td style="color:var(--accent); font-weight:bold;">${m}m</td>
          <td>${escHtml(row.perfil || "")}</td>
          <td><span class="badge">${escHtml(row.ruta || "Solo Calandrado")}</span></td>
          <td>${row.observaciones ? `<span style="color:var(--accent-orange); font-weight:bold;">📝 ${escHtml(row.observaciones)}</span>` : "-"}</td>
        </tr>
      `;
    });
  }

  tbody.innerHTML = html;
}

// ============================================================================
// MÓDULO 2: CALANDRADO — Idéntico a JS_Calandrado.html (Captura 3)
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

  const pendientes = [...pendientesRaw].sort((a, b) => {
    const da = new Date(a.fecha_hora).getTime() || 0;
    const db = new Date(b.fecha_hora).getTime() || 0;
    return STATE.ordenCalandraAsc ? da - db : db - da;
  });

  const rolloActivoImp = obtenerRolloPapelActivo().bloqueActual;
  const mapaRollos = new Map();
  pendientes.forEach(c => {
    const rId = c.id_rollo_papel || "Sin Rollo";
    if (!mapaRollos.has(rId)) mapaRollos.set(rId, []);
    mapaRollos.get(rId).push(c);
  });

  if (mapaRollos.size === 0) {
    contRollos.innerHTML = "<div style='padding:15px; text-align:center; color:#888;'>No hay rollos pendientes.</div>";
  } else {
    let html = "";
    for (const [lote, items] of mapaRollos.entries()) {
      const totalMts = items.reduce((a, b) => a + (Number(b.metros) || 0), 0);
      const isActivo = STATE.rolloMontadoCalandra === lote;
      const isImprimiendo = lote === rolloActivoImp;
      const isAbierto = STATE.rollosCalandraAbiertos.has(lote) || isActivo;

      let badgeHTML = isActivo ? '<span class="badge activo" style="margin-left:5px;">🔥 MÁQUINA</span>' : '';
      if (isImprimiendo && !isActivo) badgeHTML += '<span class="badge" style="background:#ff9800; color:#fff; margin-left:5px;">🖨️ EN IMPRESORA</span>';
      const countBadge = `<span class="badge" style="background:#444; color:#fff; margin-left:5px;">${items.length} Trabajos</span>`;

      const headerStyle = isActivo
        ? 'class="rollo-header activo"'
        : isImprimiendo
          ? 'class="rollo-header" style="border:2px dashed #ff9800; background:rgba(255,152,0,0.1);"'
          : 'class="rollo-header"';

      let btnAccion = "";
      if (isActivo) {
        btnAccion = `<button type="button" class="btn-cal-montar-rollo" data-rollo="${escHtml(lote)}" style="background:var(--danger); border:none; padding:6px 12px; border-radius:4px; color:#fff; font-weight:bold; cursor:pointer;">⏸️ Desmontar</button>`;
        btnAccion += `<button type="button" class="btn-cal-kiosco-rollo" data-rollo="${escHtml(lote)}" style="background:#2196F3; border:none; padding:6px 12px; border-radius:4px; color:#fff; font-weight:bold; cursor:pointer; margin-left:5px;" title="Modo Kiosko / Reproductor de todo el Rollo">▶️ KIOSKO</button>`;
      } else if (isImprimiendo) {
        btnAccion = `<button type="button" disabled style="background:#444; border:none; padding:6px 12px; border-radius:4px; color:#888; font-weight:bold; cursor:not-allowed;">🖨️ Aún Imprimiendo</button>`;
        btnAccion += `<button type="button" class="btn-cal-kiosco-rollo" data-rollo="${escHtml(lote)}" style="background:#2196F3; border:none; padding:6px 12px; border-radius:4px; color:#fff; font-weight:bold; cursor:pointer; margin-left:5px;" title="Modo Kiosko / Reproductor de todo el Rollo">▶️ KIOSKO</button>`;
      } else {
        btnAccion = `<button type="button" class="btn-cal-montar-rollo" data-rollo="${escHtml(lote)}" style="background:var(--accent); border:none; padding:6px 12px; border-radius:4px; color:#000; font-weight:bold; cursor:pointer;">⚙️ Montar</button>`;
        btnAccion += `<button type="button" class="btn-cal-kiosco-rollo" data-rollo="${escHtml(lote)}" style="background:#2196F3; border:none; padding:6px 12px; border-radius:4px; color:#fff; font-weight:bold; cursor:pointer; margin-left:5px;" title="Modo Kiosko / Reproductor de todo el Rollo">▶️ KIOSKO</button>`;
      }
      const procesarBtn = `<button type="button" class="btn-cal-procesar-rollo" data-rollo="${escHtml(lote)}" style="background:var(--accent); border:none; padding:6px 12px; border-radius:4px; color:#000; font-weight:bold; cursor:pointer; margin-left:5px;">✅ Procesar</button>`;
      const pdfBtn = `<button type="button" class="btn-cal-pdf-rollo" data-rollo="${escHtml(lote)}" style="background:var(--accent-blue); border:none; padding:6px 12px; border-radius:4px; color:#fff; font-weight:bold; cursor:pointer; margin-left:5px;">🖨️ PDF</button>`;

      html += `
        <div class="rollo-card">
          <div ${headerStyle} data-toggle-rollo="${escHtml(lote)}" style="cursor:pointer;">
            <div style="flex:1;">
              <div style="font-size:14px; font-weight:bold; color:var(--accent); margin-bottom:4px;">${escHtml(lote)}${badgeHTML}${countBadge}</div>
              <div style="font-size:11px; color:#ccc;">Total a procesar: <strong style="color:#fff; font-size:13px;">${fmtNum(totalMts)}m</strong></div>
            </div>
            <div style="display:flex; flex-wrap:wrap; justify-content:flex-end; gap:5px;">
              ${btnAccion}${procesarBtn}${pdfBtn}
            </div>
          </div>
          <div id="body_rollo_${escHtml(lote)}" class="rollo-body ${isAbierto ? "open" : ""}">
            <table class="tabla-tarjetas" style="width:100%; min-width:500px;">
              <thead>
                <tr>
                  <th style="width:1%; white-space:nowrap;">Acción</th>
                  <th>Fecha</th>
                  <th>Cliente/Archivo</th>
                  <th>Diseño</th>
                  <th>Tela</th>
                  <th>Nº Rollo</th>
                  <th>Color</th>
                  <th>Metros</th>
                  <th>Perfil</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(c => `
                  <tr>
                    <td data-label="Acción" style="width:1%; white-space:nowrap;">
                      <div class="cal-actions-grid">
                        <button type="button" class="btn-secondary btn-cal-terminar" data-id="${c.id}" style="width:auto; padding:5px 8px; border-color:var(--accent); color:var(--accent); cursor:pointer;">✅ Hecho</button>
                        <button type="button" class="btn-secondary btn-cal-kiosco" data-id="${c.id}" style="width:auto; padding:5px 8px; cursor:pointer;" title="Modo Enfoque Individual (Este trabajo)">▶️</button>
                        <button type="button" class="btn-secondary btn-cal-falla" data-id="${c.id}" style="width:auto; padding:5px 8px; border-color:var(--danger); color:var(--danger); cursor:pointer;" title="Reportar Falla">⚠️</button>
                        <button type="button" class="btn-secondary btn-nota-rapida" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}" style="width:auto; padding:5px 8px; cursor:pointer;" title="Nota">📝</button>
                        <button type="button" class="btn-secondary btn-crud-edit" data-table="prod_cola_calandrado" data-id="${c.id}" style="width:auto; padding:5px 8px; cursor:pointer;" title="Editar">✏️</button>
                        <button type="button" class="btn-secondary btn-crud-del" data-table="prod_cola_calandrado" data-id="${c.id}" style="width:auto; padding:5px 8px; cursor:pointer;" title="Eliminar">🗑️</button>
                      </div>
                    </td>
                    <td data-label="Fecha">${fmtDateHora(c.fecha_hora)}</td>
                    <td data-label="Cliente/Archivo">${formatearAnidadosHTML(c.cliente_archivo)}</td>
                    <td data-label="Diseño" style="text-align:center;">${renderMiniaturaDiseno60(c.file_id, c.diseno, c.cliente_archivo)}</td>
                    <td data-label="Tela">${escHtml(c.tela_destino || "")}</td>
                    <td data-label="Nº Rollo">${escHtml(c.num_rollo_tela || "")}</td>
                    <td data-label="Color">${escHtml(c.color_tela || "")}</td>
                    <td data-label="Metros" style="color:var(--danger); font-weight:bold;">${fmtNum(c.metros)}m</td>
                    <td data-label="Perfil">${escHtml(c.perfil || "")}</td>
                    <td data-label="Notas">${c.observaciones ? `<span style="color:var(--accent-orange); font-weight:bold;">📝 ${escHtml(c.observaciones)}</span>` : "-"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
    contRollos.innerHTML = html;

    // Listeners directos inmediatos e inmunes a bubbling
    contRollos.querySelectorAll(".btn-cal-montar-rollo").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rId = btn.getAttribute("data-rollo");
        STATE.rolloMontadoCalandra = STATE.rolloMontadoCalandra === rId ? "" : rId;
        localStorage.setItem("vg_rollo_calandra_montado", STATE.rolloMontadoCalandra);
        STATE.rollosCalandraAbiertos.add(rId);
        renderModuloCalandrado();
      });
    });

    contRollos.querySelectorAll(".btn-cal-procesar-rollo").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rId = btn.getAttribute("data-rollo");
        procesarRolloCompletoCalandrado(rId);
      });
    });

    contRollos.querySelectorAll(".btn-cal-pdf-rollo").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rId = btn.getAttribute("data-rollo");
        emitirPDFCalandrado(rId);
      });
    });

    contRollos.querySelectorAll(".btn-cal-kiosco-rollo").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rId = btn.getAttribute("data-rollo");
        abrirKioscoCalandra(null, rId);
      });
    });

    contRollos.querySelectorAll(".btn-cal-terminar").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        finalizarTrabajoCalandrado(btn.getAttribute("data-id"));
      });
    });

    contRollos.querySelectorAll(".btn-cal-kiosco").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirKioscoCalandra(btn.getAttribute("data-id"));
      });
    });

    contRollos.querySelectorAll(".btn-cal-falla").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const reg = STATE.colaCalandrado.find(c => c.id === btn.getAttribute("data-id"));
        reportarFallaConReposicion(reg, "Calandrado");
      });
    });

    contRollos.querySelectorAll(".rollo-header[data-toggle-rollo]").forEach(hdr => {
      hdr.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const rId = hdr.getAttribute("data-toggle-rollo");
        const bodyEl = document.getElementById(`body_rollo_${rId}`);
        if (bodyEl) {
          bodyEl.classList.toggle("open");
          if (bodyEl.classList.contains("open")) STATE.rollosCalandraAbiertos.add(rId);
          else STATE.rollosCalandraAbiertos.delete(rId);
        }
      });
    });
  }

  // Previsión de Telas Requeridas
  const panelPrev = document.getElementById("panelPrevisionTelasInline");
  if (panelPrev) {
    const mapaTelas = {};
    pendientes.forEach(p => {
      const k = `${p.tela_destino || "SIN ESPECIFICAR"} (${p.color_tela || "BLANCO"})`;
      mapaTelas[k] = (mapaTelas[k] || 0) + (Number(p.metros) || 0);
    });
    const entries = Object.entries(mapaTelas);
    panelPrev.innerHTML = entries.length === 0
      ? `<div style="color:#888;">Sin telas requeridas.</div>`
      : entries.map(([k, m]) => `
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #222; color:#ccc;">
            <span>👕 <strong>${escHtml(k)}</strong></span>
            <strong style="color:#4CAF50;">${fmtNum(m)}m</strong>
          </div>
        `).join("");
  }

  // Historial Reciente de Calandrado agrupado por rollo (y colapsable al hacer clic)
  const terminados = STATE.colaCalandrado.filter(c =>
    String(c.estado).toLowerCase().includes("terminado") &&
    cumpleFiltroFecha(c.fecha_terminado || c.fecha_hora) &&
    cumpleBusquedaUniversal(c)
  );

  if (terminados.length === 0) {
    tbodyHist.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:18px;color:#888;">No hay trabajos calandrados en el período seleccionado.</td></tr>`;
  } else {
    // Agrupar por id_rollo_papel manteniendo el orden de aparición
    const gruposHist = new Map();
    terminados.forEach(c => {
      const rId = c.id_rollo_papel || "Sin Rollo";
      if (!gruposHist.has(rId)) gruposHist.set(rId, []);
      gruposHist.get(rId).push(c);
    });

    let htmlHist = "";
    for (const [rId, listaRollo] of gruposHist.entries()) {
      const totRollo = listaRollo.reduce((a, b) => a + (Number(b.metros) || 0), 0);
      const estaCerrado = STATE.rollosHistCalCerrados.has(rId);
      const icono = estaCerrado ? "▶" : "▼";

      htmlHist += `
        <tr class="tr-toggle-hist-cal" data-rollo-hist="${escHtml(rId)}" style="cursor:pointer; background:#111;">
          <td colspan="11" style="border-top:1px solid #00E676; border-bottom:1px solid #00E676; color:#00E676; text-align:center; font-weight:bold; padding:8px;">
            ${icono} ROLLO CERRADO: ${escHtml(rId)} (${listaRollo.length} trab.) | TOTAL DEL ROLLO: ${fmtNum(totRollo)}m <span style="font-size:10px; color:#888; margin-left:6px;">(clic para mostrar/ocultar)</span>
          </td>
        </tr>
      `;

      if (!estaCerrado) {
        listaRollo.forEach(c => {
          htmlHist += `
            <tr>
              <td data-label="Acción" style="width:1%; white-space:nowrap;">
                <div class="cal-actions-grid">
                  <button type="button" class="btn-cal-reabrir" data-id="${c.id}" style="background:transparent; border:1px solid #aaa; color:#aaa; border-radius:4px; cursor:pointer; padding:4px 6px;" title="Deshacer">🔙</button>
                  <button type="button" class="btn-nota-rapida" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}" style="background:transparent; border:1px solid var(--accent-orange); color:var(--accent-orange); border-radius:4px; cursor:pointer; padding:4px 6px;" title="Nota">📝</button>
                  <button type="button" class="btn-imp-etiqueta" data-rollo="${escHtml(rId)}" data-metros="${fmtNum(c.metros)}" style="background:var(--accent-blue); border:1px solid var(--accent-blue); color:#fff; border-radius:4px; cursor:pointer; padding:4px 6px;" title="Etiqueta">🖨️</button>
                  <button type="button" class="btn-crud-edit" data-table="prod_cola_calandrado" data-id="${c.id}" style="background:transparent; border:1px solid var(--accent-blue); color:var(--accent-blue); border-radius:4px; cursor:pointer; padding:4px 6px;" title="Editar">✏️</button>
                  <button type="button" class="btn-crud-del" data-table="prod_cola_calandrado" data-id="${c.id}" style="background:transparent; border:1px solid var(--danger); color:var(--danger); border-radius:4px; cursor:pointer; padding:4px 6px;" title="Eliminar">🗑️</button>
                </div>
              </td>
              <td data-label="Fecha">${fmtDateHora(c.fecha_terminado || c.fecha_hora)}</td>
              <td data-label="Cliente/Archivo">${formatearAnidadosHTML(c.cliente_archivo)}</td>
              <td data-label="Diseño" style="text-align:center;">${renderMiniaturaDiseno60(c.file_id, c.diseno, c.cliente_archivo)}</td>
              <td data-label="Tela">${escHtml(c.tela_destino || "")}</td>
              <td data-label="Nº Rollo">${escHtml(c.num_rollo_tela || "")}</td>
              <td data-label="Color">${escHtml(c.color_tela || "")}</td>
              <td data-label="Metros" style="color:var(--accent); font-weight:bold;">${fmtNum(c.metros)}m</td>
              <td data-label="Perfil">${escHtml(c.perfil || "")}</td>
              <td data-label="Ruta">${escHtml(c.ruta || "Solo Calandrado")}</td>
              <td data-label="Notas">${c.observaciones ? `<span style="color:var(--accent-orange); font-weight:bold;">📝 ${escHtml(c.observaciones)}</span>` : "-"}</td>
            </tr>
          `;
        });
      }
    }
    tbodyHist.innerHTML = htmlHist;

    tbodyHist.querySelectorAll(".tr-toggle-hist-cal").forEach(tr => {
      tr.addEventListener("click", () => {
        const rId = tr.getAttribute("data-rollo-hist");
        if (STATE.rollosHistCalCerrados.has(rId)) STATE.rollosHistCalCerrados.delete(rId);
        else STATE.rollosHistCalCerrados.add(rId);
        renderModuloCalandrado();
      });
    });
  }
}

// ============================================================================
// MÓDULO 3: CORTE LÁSER (Con trabajos anidados agrupados — Pedido #2)
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
    ? `<tr><td colspan="8" style="text-align:center;padding:18px;color:#888;">Cola vacía</td></tr>`
    : lotesPendientes.map(g => {
      const esAnidado = g.archivos.length > 1;
      return `
        <tr>
          <td style="white-space:nowrap;">
            <button type="button" class="btn-main btn-laser-cortar-lote" data-batch="${escHtml(g.batch_id)}" data-ids="${g.ids.join(",")}" style="width:auto; padding:5px 10px; font-size:11px; margin:0;">
              Cortar ${esAnidado ? `Lote (${g.archivos.length})` : ""}
            </button>
            <button type="button" class="btn-nota-rapida" data-table="prod_cola_laser" data-id="${g.ids[0]}" data-batch="${escHtml(g.batch_id)}" style="background:transparent; border:1px solid var(--accent-orange); color:var(--accent-orange); border-radius:4px; cursor:pointer; padding:4px;">📝</button>
            <button type="button" class="btn-crud-edit" data-table="prod_cola_laser" data-id="${g.ids[0]}" style="background:transparent; border:1px solid var(--accent-blue); color:var(--accent-blue); border-radius:4px; cursor:pointer; padding:4px;">✏️</button>
            <button type="button" class="btn-crud-del" data-table="prod_cola_laser" data-id="${g.ids[0]}" style="background:transparent; border:1px solid var(--danger); color:var(--danger); border-radius:4px; cursor:pointer; padding:4px;">🗑️</button>
          </td>
          <td>${fmtDateHora(g.fecha_ingreso)}</td>
          <td><strong>${escHtml(g.id_rollo_papel)}</strong></td>
          <td>
            ${esAnidado ? `<span class="badge activo" style="margin-bottom:4px;">📦 ANIDADO (${g.archivos.length} archivos)</span><br>` : ""}
            ${g.archivos.map(a => `• ${escHtml(a)}`).join("<br>")}
          </td>
          <td>${escHtml(g.tela_rollo_color || "-")}</td>
          <td><strong style="color:var(--accent-blue);">${fmtNum(g.metros_totales)}m</strong></td>
          <td>Vel: ${escHtml(g.velocidad)} | ${escHtml(g.poder)}%</td>
          <td>${g.observaciones ? `<span style="color:var(--accent-orange); font-weight:bold;">📝 ${escHtml(g.observaciones)}</span>` : "-"}</td>
        </tr>
      `;
    }).join("");

  tbodyHist.innerHTML = lotesTerminados.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:18px;color:#888;">No hay cortes láser finalizados en este período.</td></tr>`
    : lotesTerminados.map(g => `
      <tr>
        <td style="white-space:nowrap;">
          <button type="button" class="btn-crud-edit" data-table="prod_cola_laser" data-id="${g.ids[0]}" style="background:transparent; border:1px solid var(--accent-blue); color:var(--accent-blue); border-radius:4px; cursor:pointer; padding:4px;">✏️</button>
          <button type="button" class="btn-crud-del" data-table="prod_cola_laser" data-id="${g.ids[0]}" style="background:transparent; border:1px solid var(--danger); color:var(--danger); border-radius:4px; cursor:pointer; padding:4px;">🗑️</button>
        </td>
        <td>${fmtDateHora(g.fecha_terminado || g.fecha_ingreso)}</td>
        <td><strong>${escHtml(g.id_rollo_papel)}</strong></td>
        <td>${g.archivos.map(a => escHtml(a)).join(" | ")}</td>
        <td>${escHtml(g.tela_rollo_color || "-")}</td>
        <td style="color:var(--accent); font-weight:bold;">${fmtNum(g.metros_totales)}m</td>
        <td>${g.observaciones ? `<span style="color:var(--accent-orange);">${escHtml(g.observaciones)}</span>` : "-"}</td>
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
    <div class="stat-box" style="border-bottom: 3px solid var(--accent);">
      <div class="stat-title">${escHtml(r.id_rollo_dtf)} (${escHtml(r.marca_fabricante)})</div>
      <div class="stat-value">${fmtNum(r.metros_restantes_reales)}m</div>
      <div style="font-size:10px; color:#888; margin-top:3px;">${escHtml(r.perfil_impresion)}</div>
    </div>
  `).join("");

  const pendDtf = STATE.pendientesDrive.filter(p => p.modulo === "DTF" && p.estado_impreso !== "SI" && cumpleBusquedaUniversal(p));
  if (tbodyPend) {
    tbodyPend.innerHTML = pendDtf.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:#888;">Sin archivos DTF pendientes.</td></tr>`
      : pendDtf.map(p => {
        const cargo = p.es_repo_muestra || "VENTA";
        const precioUnit = calcularPrecioMetroDTF(p.metros_totales, cargo);
        return `
          <tr>
            <td><strong>${escHtml(p.cliente)}</strong></td>
            <td>${escHtml(p.nombre_archivo)}</td>
            <td>${fmtNum(p.metros_totales)}m</td>
            <td><span class="badge ${cargo === "VENTA" ? "activo" : "danger"}">${escHtml(cargo)}</span></td>
            <td>${fmtMoney(precioUnit * (Number(p.metros_totales) || 0))}</td>
            <td><button type="button" class="btn-secondary btn-dtf-cargar-pend" data-id="${p.id}" style="width:auto;padding:4px 8px;">Cargar</button></td>
          </tr>
        `;
      }).join("");
  }

  const pedidosFilt = STATE.dtfPedidos.filter(d => cumpleFiltroFecha(d.fecha_hora) && cumpleBusquedaUniversal(d));
  if (tbodyPedidos) {
    tbodyPedidos.innerHTML = pedidosFilt.map(d => {
      const saldo = (Number(d.subtotal_cobrar) || 0) - (Number(d.monto_pagado) || 0);
      return `
        <tr>
          <td style="white-space:nowrap;">
            ${saldo > 0 ? `<button type="button" class="btn-secondary btn-dtf-saldar" data-id="${d.id}" data-total="${d.subtotal_cobrar}" style="width:auto;padding:3px 6px;border-color:var(--accent);color:var(--accent);">💵</button>` : ""}
            <button type="button" class="btn-crud-edit" data-table="prod_dtf_pedidos" data-id="${d.id}" style="background:transparent;border:1px solid var(--accent-blue);color:var(--accent-blue);border-radius:4px;padding:3px;">✏️</button>
            <button type="button" class="btn-crud-del" data-table="prod_dtf_pedidos" data-id="${d.id}" style="background:transparent;border:1px solid var(--danger);color:var(--danger);border-radius:4px;padding:3px;">🗑️</button>
          </td>
          <td>${fmtDateHora(d.fecha_hora)}</td>
          <td><strong>${escHtml(d.cliente)}</strong></td>
          <td>${escHtml(d.nombre_archivo)}</td>
          <td><span class="badge ${d.tipo_cargo === "VENTA" ? "activo" : "danger"}">${escHtml(d.tipo_cargo)}</span></td>
          <td style="color:var(--accent);font-weight:bold;">${fmtNum(d.metros_archivo)}m</td>
          <td>${fmtMoney(d.precio_metro)}</td>
          <td><strong>${fmtMoney(d.subtotal_cobrar)}</strong></td>
          <td><span class="badge ${saldo <= 0 ? "activo" : "danger"}">${saldo <= 0 ? "Pagado" : `Debe ${fmtMoney(saldo)}`}</span></td>
        </tr>
      `;
    }).join("");
  }

  if (tbodyCuentas) {
    tbodyCuentas.innerHTML = STATE.dtfCuentasClientes.map(c => `
      <tr>
        <td><strong>${escHtml(c.cliente_nombre)}</strong></td>
        <td>${fmtNum(c.metros_comprados)}m</td>
        <td>${fmtNum(c.metros_reposicion)}m</td>
        <td>${fmtNum(c.metros_muestras)}m</td>
        <td>${fmtMoney(c.total_facturado)}</td>
        <td style="color:#4CAF50;">${fmtMoney(c.total_abonado)}</td>
        <td style="color:${Number(c.saldo_pendiente) > 0 ? "var(--danger)" : "#4CAF50"};font-weight:bold;">${fmtMoney(c.saldo_pendiente)}</td>
      </tr>
    `).join("");
  }
}

// ============================================================================
// MÓDULOS 5 Y 6: FINANZAS Y BITÁCORA
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
      ? `<tr><td colspan="6" style="text-align:center;color:#888;">Sin registros técnicos.</td></tr>`
      : STATE.fallasReposiciones.map(f => `
          <tr>
            <td>${fmtDateHoraLineal(f.fecha_hora)}</td>
            <td>${escHtml(f.estacion || f.tipo_registro)}</td>
            <td>${escHtml(f.id_rollo || "-")}</td>
            <td>${escHtml(f.archivo_afectado || "-")}</td>
            <td style="color:var(--danger); font-weight:bold;">${fmtNum(f.metros_merma)}m</td>
            <td style="color:var(--accent-orange);">${escHtml(f.motivo || f.detalle_reposicion || "-")}</td>
          </tr>
        `).join("");
  }
}

// ============================================================================
// MÓDULO 7: MÉTRICAS (BI) — Idéntico a JS_Dashboards.html (Captura 4)
// ============================================================================
function renderModuloMetricasBI() {
  const { hoyIni, ayerIni, semActualIni, semAntIni, mesActualIni } = obtenerVentanasTemporales();

  const pendSub = STATE.pendientesDrive.filter(p => p.modulo === "SUBLIMACION" && p.estado_impreso !== "SI");
  const pendCal = STATE.colaCalandrado.filter(c => !String(c.estado).toLowerCase().includes("terminado"));
  const pendLas = STATE.colaLaser.filter(l => !String(l.estado).toLowerCase().includes("terminado"));

  const qImp = pendSub.reduce((a, b) => a + (Number(b.metros_totales) || 0), 0);
  const qCal = pendCal.reduce((a, b) => a + (Number(b.metros) || 0), 0);
  const qLas = pendLas.reduce((a, b) => a + (Number(b.metros) || 0), 0);

  const dImp = Math.ceil(qImp / 650);
  const dCal = Math.ceil(qCal / 650);
  const dLas = Math.ceil(qLas / 300);
  const dTotal = Math.max(1, dImp + dCal + dLas);

  setTxt("slaDiasImp", `${dImp} ${dImp === 1 ? "Día" : "Días"}`);
  setTxt("slaDiasCal", `${dCal} ${dCal === 1 ? "Día" : "Días"}`);
  setTxt("slaDiasLas", `${dLas} ${dLas === 1 ? "Día" : "Días"}`);
  setTxt("slaDiasTotal", `Aprox ~ ${dTotal} ${dTotal === 1 ? "Día" : "Días"}`);

  setTxt("radarQImp", `${fmtNum(qImp, 0)}m`);
  setTxt("radarQCal", `${fmtNum(qCal, 0)}m`);
  setTxt("radarQLas", `${fmtNum(qLas, 0)}m`);

  const impNormal = STATE.impresiones.filter(i => i.accion === "Impresion Normal");
  const calTerm = STATE.colaCalandrado.filter(c => String(c.estado).toLowerCase().includes("terminado"));
  const lasTerm = STATE.colaLaser.filter(l => String(l.estado).toLowerCase().includes("terminado"));

  setTxt("biImpHoy", fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", hoyIni)));
  setTxt("biImpAyer", fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", ayerIni, hoyIni)));
  setTxt("biImpSem", fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", semActualIni)));
  setTxt("biImpSemAnt", fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", semAntIni, semActualIni)));
  setTxt("biImpMes", fmtNum(sumarMetrosEnVentana(impNormal, "fecha_hora", "metros_impresos", mesActualIni)));
  setTxt("biImpHis", fmtNum(impNormal.reduce((a, b) => a + (Number(b.metros_impresos) || 0), 0)));

  setTxt("biCalHoy", fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", hoyIni)));
  setTxt("biCalAyer", fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", ayerIni, hoyIni)));
  setTxt("biCalSem", fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", semActualIni)));
  setTxt("biCalSemAnt", fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", semAntIni, semActualIni)));
  setTxt("biCalMes", fmtNum(sumarMetrosEnVentana(calTerm, "fecha_terminado", "metros", mesActualIni)));
  setTxt("biCalHis", fmtNum(calTerm.reduce((a, b) => a + (Number(b.metros) || 0), 0)));

  setTxt("biLasHoy", fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", hoyIni)));
  setTxt("biLasAyer", fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", ayerIni, hoyIni)));
  setTxt("biLasSem", fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", semActualIni)));
  setTxt("biLasSemAnt", fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", semAntIni, semActualIni)));
  setTxt("biLasMes", fmtNum(sumarMetrosEnVentana(lasTerm, "fecha_terminado", "metros", mesActualIni)));
  setTxt("biLasHis", fmtNum(lasTerm.reduce((a, b) => a + (Number(b.metros) || 0), 0)));

  // Top Telas Histórico (Idéntico a JS_Dashboards.html líneas 54-80)
  const conteoTelas = {};
  impNormal.forEach(r => {
    const t = String(r.tela_destino || "").trim();
    if (t) conteoTelas[t] = (conteoTelas[t] || 0) + (Number(r.metros_impresos) || 0);
  });
  const arrTelas = Object.entries(conteoTelas).map(([tela, mts]) => ({ tela, mts })).sort((a, b) => b.mts - a.mts);
  const maxT = arrTelas[0]?.mts || 1;
  const elTopTelas = document.getElementById("dashTopTelas");
  if (elTopTelas) {
    elTopTelas.innerHTML = arrTelas.slice(0, 5).map((t, i) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px; color:#aaa;">
          <span>${i + 1}. ${escHtml(t.tela)}</span><span>${fmtNum(t.mts, 0)}m</span>
        </div>
        <div style="width:100%; background:#222; border-radius:4px; height:10px; overflow:hidden;">
          <div style="width:${(t.mts / maxT) * 100}%; background:var(--accent-blue); height:100%;"></div>
        </div>
      </div>
    `).join("");
  }

  // Top Clientes Histórico (Idéntico a JS_Dashboards.html líneas 120-149)
  const conteoCli = {};
  impNormal.forEach(r => {
    const cli = String(r.cliente_archivo || "").split(" - ")[0]?.trim() || "Cliente";
    conteoCli[cli] = (conteoCli[cli] || 0) + (Number(r.metros_impresos) || 0);
  });
  const arrCli = Object.entries(conteoCli).map(([cli, mts]) => ({ cli, mts })).sort((a, b) => b.mts - a.mts);
  const maxC = arrCli[0]?.mts || 1;
  const elTopCli = document.getElementById("dashTopClientes");
  if (elTopCli) {
    elTopCli.innerHTML = arrCli.slice(0, 5).map((c, i) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px; color:#aaa;">
          <span>${i + 1}. ${escHtml(c.cli)}</span><span>${fmtNum(c.mts, 0)}m</span>
        </div>
        <div style="width:100%; background:#222; border-radius:4px; height:10px; overflow:hidden;">
          <div style="width:${(c.mts / maxC) * 100}%; background:#ff9800; height:100%;"></div>
        </div>
      </div>
    `).join("");
  }
}

// ============================================================================
// MÓDULO 8: CHAT INTERNO DE TALLER
// ============================================================================
function renderModuloChat() {
  const feedEl = document.getElementById("chatFeedContainer");
  const selTrabajo = document.getElementById("chatSelectTrabajo");
  const chipsMencion = document.getElementById("chatChipsMencion");

  if (selTrabajo && selTrabajo.options.length <= 1) {
    const opciones = [`<option value=""># Vincular a un Trabajo (Opcional)...</option>`];
    STATE.impresiones.slice(0, 20).forEach(i => {
      opciones.push(`<option value="IMP|${escHtml(i.batch_id)}|${escHtml(i.cliente_archivo.slice(0, 42))} (${fmtNum(i.metros_impresos)}m)">🖨️ ${escHtml(i.cliente_archivo.slice(0, 48))} (${fmtNum(i.metros_impresos)}m)</option>`);
    });
    selTrabajo.innerHTML = opciones.join("");
  }

  if (chipsMencion) {
    const miembros = STATE.catalogos.filter(c => c.tipo === "EQUIPO");
    chipsMencion.innerHTML = miembros.map(m => `
      <span class="badge btn-chat-mention" data-mention="${escHtml(m.nombre)}" style="cursor:pointer;">@${escHtml(m.nombre)}</span>
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
    ? `<div style="text-align:center;padding:20px;color:#888;">No hay mensajes en este canal.</div>`
    : msgs.map(m => {
      const meMenciona = Array.isArray(m.menciones) && m.menciones.includes(STATE.usuarioActual);
      return `
        <div style="background:#141414; border:1px solid ${meMenciona ? "var(--danger)" : "#333"}; border-radius:6px; padding:10px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong style="color:var(--accent-blue);">👤 ${escHtml(m.autor_nombre)}</strong>
              <span class="badge" style="margin-left:5px;">${escHtml(m.canal_area)}</span>
            </div>
            <span style="font-size:11px; color:#888;">${fmtDateHoraLineal(m.created_at)}</span>
          </div>
          <div style="margin-top:6px; color:#ddd; font-size:13px;">${escHtml(m.mensaje)}</div>
          ${m.trabajo_etiqueta ? `<div style="margin-top:5px;"><span class="badge activo">🔗 #${escHtml(m.trabajo_etiqueta)}</span></div>` : ""}
          ${m.foto_base64 ? `<div style="margin-top:6px;"><img src="${m.foto_base64}" style="max-width:220px; border-radius:4px;" /></div>` : ""}
        </div>
      `;
    }).join("");
}

function renderResultadosOmnisearch() {
  const panel = document.getElementById("vgOmnisearchPanel");
  if (!panel) return;
  panel.style.display = "block";

  const impMatch = STATE.impresiones.filter(cumpleBusquedaUniversal).slice(0, 6);
  const calMatch = STATE.colaCalandrado.filter(cumpleBusquedaUniversal).slice(0, 6);
  const lasMatch = STATE.colaLaser.filter(cumpleBusquedaUniversal).slice(0, 6);

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong style="color:var(--accent-blue);">🔍 Resultados para "${escHtml(STATE.busquedaGlobal)}":</strong>
      <button type="button" class="btn-secondary" style="width:auto;padding:4px 10px;" onclick="document.getElementById('vgOmniSearchClear').click()">✖ Cerrar</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;font-size:12px;">
      <div style="background:#1a1a1a;padding:10px;border-radius:6px;border:1px solid #333;">
        <strong style="color:var(--accent);">🖨️ Impresión (${impMatch.length})</strong>
        ${impMatch.map(i => `<div style="margin-top:4px;">• ${escHtml(i.cliente_archivo.slice(0, 42))} — <strong>${fmtNum(i.metros_impresos)}m</strong></div>`).join("") || `<div style="color:#888;">Sin coincidencias</div>`}
      </div>
      <div style="background:#1a1a1a;padding:10px;border-radius:6px;border:1px solid #333;">
        <strong style="color:var(--accent-magenta);">🔥 Calandrado (${calMatch.length})</strong>
        ${calMatch.map(c => `<div style="margin-top:4px;">• ${escHtml(c.cliente_archivo.slice(0, 42))} — <strong>${fmtNum(c.metros)}m</strong> [${escHtml(c.estado)}]</div>`).join("") || `<div style="color:#888;">Sin coincidencias</div>`}
      </div>
      <div style="background:#1a1a1a;padding:10px;border-radius:6px;border:1px solid #333;">
        <strong style="color:var(--accent-orange);">⚡ Corte Láser (${lasMatch.length})</strong>
        ${lasMatch.map(l => `<div style="margin-top:4px;">• ${escHtml(l.cliente_archivo.slice(0, 42))} — <strong>${fmtNum(l.metros)}m</strong> [${escHtml(l.estado)}]</div>`).join("") || `<div style="color:#888;">Sin coincidencias</div>`}
      </div>
    </div>
  `;
}

// ============================================================================
// ACCIONES OPERATIVAS Y CRUD UNIVERSAL
// ============================================================================
async function procesarImpresionLote() {
  const seleccionados = STATE.pendientesDrive.filter(p => STATE.impForm.archivosSeleccionadosIds.has(p.id));
  const metrosManualInput = parseFloat(document.getElementById("impInput_metrosLote")?.value) || 0;
  const disenoInput = document.getElementById("impInput_diseno")?.value.trim() || STATE.impForm.diseno;

  if (seleccionados.length === 0 && metrosManualInput <= 0) {
    toast("Seleccione al menos un archivo o ingrese los Metros a Descontar.", "warn");
    return;
  }

  const infoRollo = obtenerRolloPapelActivo();
  const batchId = `BATCH-${Date.now()}`;
  const fechaManVal = document.getElementById("impInput_fechaManual")?.value;
  const fechaIso = fechaManVal ? new Date(fechaManVal).toISOString() : new Date().toISOString();

  const nombresUnidos = seleccionados.length > 0
    ? seleccionados.map(s => s.nombre_archivo).join(" | ")
    : (disenoInput || "TRABAJO MANUAL");

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
    toast("Error: " + errImp.message, "error");
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

  toast(`✅ Impresión confirmada (${fmtNum(metrosTotales)}m).`);
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
    cliente_archivo: `--- CORTE DE PAPEL (-4M) ---`,
    accion: "Corte de Papel (-4m)",
    metros_impresos: 0,
    metros_desperdicio: 4.0,
    metros_restantes_snapshot: Math.max(0, info.restantes - 4.0),
    ruta: "Interno",
    observaciones: "Corte de papel (-4m)"
  });
  toast(`✂️ Corte de Papel (-4m) aplicado.`);
  await cargarDatosTodo();
}

async function registrarAvanceOCalibracion(tipoAccion) {
  const info = obtenerRolloPapelActivo();
  const defMts = tipoAccion === "Calibración" ? "1.0" : "0.50";
  const m = parseFloat(prompt(`Cantidad de metros a descontar por ${tipoAccion}:`, defMts));
  if (!m || m <= 0) return;
  const obs = prompt("Motivo / Obs:", tipoAccion) || tipoAccion;

  await sb().from("prod_impresiones").insert({
    empresa_id: "vvgrafic-principal",
    batch_id: `MERMA-${Date.now()}`,
    fecha_hora: new Date().toISOString(),
    id_rollo_papel: info.bloqueActual,
    id_rollo_base: info.idBase,
    cliente_archivo: `--- ${tipoAccion.toUpperCase()} ---`,
    accion: tipoAccion,
    metros_impresos: 0,
    metros_desperdicio: m,
    metros_restantes_snapshot: Math.max(0, info.restantes - m),
    ruta: "Interno",
    observaciones: obs
  });
  toast(`✅ ${tipoAccion} (-${fmtNum(m)}m) registrado.`);
  await cargarDatosTodo();
}

async function finalizarTrabajoCalandrado(idCal, minutosExtra = 0, skipReload = false, velocidad = null, temperatura = null) {
  const reg = STATE.colaCalandrado.find(c => c.id === idCal);
  if (!reg) return;

  const inputFechaManual = document.getElementById("calInputFechaManual")?.value;
  const fechaFinIso = inputFechaManual ? new Date(inputFechaManual).toISOString() : new Date().toISOString();

  const updatePayload = {
    estado: "Terminado",
    fecha_terminado: fechaFinIso,
    minutos_trabajados: minutosExtra || reg.minutos_trabajados || Math.max(5, Math.round((Number(reg.metros) || 10) * 1.2))
  };
  if (velocidad !== null && !isNaN(velocidad)) updatePayload.velocidad = velocidad;
  if (temperatura !== null && !isNaN(temperatura)) updatePayload.temperatura = temperatura;

  await sb().from("prod_cola_calandrado").update(updatePayload).eq("id", idCal);

  const rLower = String(reg.ruta || "").toLowerCase();
  if (rLower.includes("laser") || rLower.includes("láser") || rLower.includes("corte")) {
    await sb().from("prod_cola_laser").insert({
      empresa_id: "vvgrafic-principal",
      batch_id: reg.batch_id || `BATCH-${Date.now()}`,
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

  if (!skipReload) {
    toast(`✅ Calandrado procesado (${fmtDateHoraLineal(fechaFinIso)}).`);
    await cargarDatosTodo();
  }
}

async function procesarRolloCompletoCalandrado(rolloId) {
  const trabajos = STATE.colaCalandrado.filter(c => c.id_rollo_papel === rolloId && !String(c.estado).toLowerCase().includes("terminado"));
  if (trabajos.length === 0) {
    toast(`No hay trabajos pendientes en el rollo ${rolloId}.`, "error");
    return;
  }

  const inputFechaManual = document.getElementById("calInputFechaManual")?.value;
  const msgFecha = inputFechaManual
    ? `con la fecha seleccionada (${fmtDateHoraLineal(new Date(inputFechaManual).toISOString())})`
    : `con fecha actual`;

  if (!confirm(`¿Procesar los ${trabajos.length} trabajos del rollo ${rolloId} ${msgFecha}?`)) return;

  toast(`Procesando ${trabajos.length} trabajos...`);
  for (const t of trabajos) {
    await finalizarTrabajoCalandrado(t.id, 0, true);
  }
  toast(`✅ Rollo ${rolloId} procesado completo.`);
  await cargarDatosTodo();
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
  toast(`⚡ Lote cortado en Láser.`);
  await cargarDatosTodo();
}

function imprimirEtiquetaRollo(loteId, metrosTotales) {
  const win = window.open("", "_blank", "width=400,height=300");
  if (!win) return alert("Habilita las ventanas emergentes.");
  win.document.write(`
    <html><head><title>Etiqueta ${escHtml(loteId)}</title>
    <style>@page { size: 100mm 70mm; margin: 0; } body { font-family: sans-serif; margin: 0; padding: 4mm; width: 100mm; height: 70mm; box-sizing: border-box; }</style>
    </head><body>
      <h2 style="margin:0 0 6px 0; border-bottom:2px solid #000;">V&V GRAFIC — ${escHtml(loteId)}</h2>
      <div style="font-size:28pt; font-weight:bold; text-align:center; border:3px solid #000; border-radius:4mm; margin:6px 0;">${escHtml(metrosTotales)} m</div>
    </body></html>
  `);
  setTimeout(() => win.print(), 400);
}

function renderCeldaDisenoPDF(c) {
  const textoFallback = escHtml(c.diseno || c.cliente_archivo || "-");
  const thumbId = extraerThumbIdDrive(c.file_id);
  if (thumbId) {
    return `<img src="https://drive.google.com/thumbnail?id=${escHtml(thumbId)}&sz=w120-h120" alt="${textoFallback}" style="max-height:24px; max-width:95px; object-fit:contain; display:block; margin:0 auto;" onerror="this.outerHTML='<span>${textoFallback}</span>'" />`;
  }
  const d = String(c.diseno || "").trim();
  if (d.startsWith("http://") || d.startsWith("https://") || d.startsWith("data:image/")) {
    return `<img src="${escHtml(d)}" alt="${textoFallback}" style="max-height:24px; max-width:95px; object-fit:contain; display:block; margin:0 auto;" onerror="this.outerHTML='<span>${textoFallback}</span>'" />`;
  }
  return `<span>${textoFallback}</span>`;
}

function emitirPDFCalandrado(rolloId) {
  let items = STATE.colaCalandrado.filter(c => c.id_rollo_papel === rolloId && !String(c.estado).toLowerCase().includes("terminado"));
  if (items.length === 0) {
    items = STATE.colaCalandrado.filter(c => c.id_rollo_papel === rolloId);
  }
  if (items.length === 0) {
    toast(`No hay trabajos registrados para el rollo ${rolloId}.`, "error");
    return;
  }
  const totalMts = items.reduce((a, b) => a + (Number(b.metros) || 0), 0);
  const win = window.open("", "_blank");
  if (!win) { alert("Habilitá las ventanas emergentes del navegador para imprimir la Hoja de Ruta."); return; }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Hoja de Ruta Calandrado - ${escHtml(rolloId)}</title>
      <style>
        @page { size: landscape; margin: 6mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 6px; font-size: 10px; color: #111; background: #fff; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #d81b60; padding-bottom: 5px; margin-bottom: 6px; }
        .title { font-size: 15px; font-weight: bold; color: #d81b60; text-transform: uppercase; }
        .subtitle { font-size: 11px; color: #444; margin-top: 2px; }
        .total-badge { font-size: 14px; font-weight: bold; color: #d81b60; background: #fce4ec; border: 1px solid #f48fb1; padding: 4px 12px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
        th { background: #e8e8e8; border: 1px solid #777; padding: 4px 5px; text-align: left; font-size: 9.5px; text-transform: uppercase; font-weight: bold; color: #111; }
        td { border: 1px solid #999; padding: 3px 5px; vertical-align: middle; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; }
        .job-group { break-inside: avoid; page-break-inside: avoid; }
        .row-top td { background: #f2f4f7; font-weight: bold; font-size: 10px; border-top: 1.5px solid #444; padding: 2.5px 5px; }
        .row-data td { background: #fff; padding: 3px 5px; border-bottom: 1.5px solid #444; }
        .mts-cell { font-weight: bold; font-size: 11px; text-align: right; color: #d81b60; white-space: nowrap; }
        .mts-reales-cell { background: #fff; }
        .footer { margin-top: 10px; display: flex; justify-content: space-between; align-items: flex-end; }
        .firmas { display: flex; gap: 28px; font-size: 10px; color: #555; margin-top: 14px; }
        .firma-box { border-top: 1px dashed #777; width: 135px; text-align: center; padding-top: 3px; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">V&V GRAFIC — Hoja de Ruta de Calandrado</div>
          <div class="subtitle">Bobina: <strong>${escHtml(rolloId)}</strong> | Fecha: <strong>${new Date().toLocaleDateString("es-AR")} ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</strong></div>
        </div>
        <div class="total-badge">Total a Calandrar: ${fmtNum(totalMts)} m</div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:9%;">DISEÑO</th>
            <th style="width:11%;">TELA</th>
            <th style="width:7%;">Nº ROLLO</th>
            <th style="width:8%;">COLOR</th>
            <th style="width:7%; text-align:right;">METROS</th>
            <th style="width:9%;">METROS REALES</th>
            <th style="width:15%;">PERFIL</th>
            <th style="width:12%;">RUTA PRODUCCIÓN</th>
            <th style="width:22%;">OBSERVACIONES</th>
          </tr>
        </thead>
        ${items.map(c => `
          <tbody class="job-group">
            <tr class="row-top">
              <td>${escHtml(c.id_rollo_papel || rolloId)}</td>
              <td colspan="8">${escHtml(c.cliente_archivo || "-")}</td>
            </tr>
            <tr class="row-data">
              <td>${renderCeldaDisenoPDF(c)}</td>
              <td><strong>${escHtml(c.tela_destino || "-")}</strong></td>
              <td>${escHtml(c.num_rollo_tela || "-")}</td>
              <td>${escHtml(c.color_tela || "-")}</td>
              <td class="mts-cell">${fmtNum(c.metros)} m</td>
              <td class="mts-reales-cell">&nbsp;</td>
              <td>${escHtml(c.perfil || "-")}</td>
              <td>${escHtml(c.ruta || "Solo Calandrado")}</td>
              <td>${escHtml(c.observaciones && c.observaciones !== "-" ? c.observaciones : "")}</td>
            </tr>
          </tbody>
        `).join("")}
      </table>
      <div class="footer">
        <div class="firmas">
          <div class="firma-box">Operador Calandra</div>
          <div class="firma-box">Control Calidad</div>
        </div>
        <div style="font-size:12px; font-weight:bold;">
          Total Trabajos: ${items.length} | Total Metros: <span style="color:#d81b60; font-size:14px;">${fmtNum(totalMts)} m</span>
        </div>
      </div>
    </body>
    </html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 350);
}

// ============================================================================
// MODAL UNIVERSAL CRUD
// ============================================================================
const ESQUEMA_CAMPOS_CRUD = {
  prod_impresiones: [
    { key: "fecha_hora", label: "Fecha y Hora", type: "text" },
    { key: "id_rollo_papel", label: "ID Rollo Papel", type: "text" },
    { key: "id_rollo_base", label: "ID Rollo Base", type: "text" },
    { key: "cliente_archivo", label: "Cliente / Archivo", type: "text" },
    { key: "diseno", label: "Diseño", type: "text" },
    { key: "tela_destino", label: "Tela Destino", type: "text" },
    { key: "num_rollo_tela", label: "Nº Rollo", type: "text" },
    { key: "color_tela", label: "Color", type: "text" },
    { key: "perfil", label: "Perfil", type: "text" },
    { key: "ruta", label: "Ruta de Producción", type: "text" },
    { key: "metros_impresos", label: "Metros Impresos", type: "number" },
    { key: "observaciones", label: "Notas / Fallas", type: "textarea" }
  ],
  prod_cola_calandrado: [
    { key: "fecha_hora", label: "Fecha Ingreso", type: "text" },
    { key: "fecha_terminado", label: "Fecha Terminado", type: "text" },
    { key: "id_rollo_papel", label: "ID Rollo Papel", type: "text" },
    { key: "cliente_archivo", label: "Cliente / Archivo", type: "text" },
    { key: "tela_destino", label: "Tela", type: "text" },
    { key: "num_rollo_tela", label: "Nº Rollo", type: "text" },
    { key: "color_tela", label: "Color", type: "text" },
    { key: "metros", label: "Metros", type: "number" },
    { key: "perfil", label: "Perfil", type: "text" },
    { key: "ruta", label: "Ruta", type: "text" },
    { key: "estado", label: "Estado (Pendiente / Terminado)", type: "text" },
    { key: "observaciones", label: "Notas", type: "textarea" }
  ],
  prod_cola_laser: [
    { key: "fecha_ingreso", label: "Fecha Ingreso", type: "text" },
    { key: "fecha_terminado", label: "Fecha Terminado", type: "text" },
    { key: "batch_id", label: "ID Lote Anidado (batch_id)", type: "text" },
    { key: "id_rollo_papel", label: "ID Rollo", type: "text" },
    { key: "cliente_archivo", label: "Archivos (separar anidados con ' | ')", type: "textarea" },
    { key: "tela_rollo_color", label: "Tela / Rollo / Color", type: "text" },
    { key: "metros", label: "Metros", type: "number" },
    { key: "velocidad", label: "Velocidad", type: "number" },
    { key: "poder", label: "Poder (%)", type: "number" },
    { key: "estado", label: "Estado (Pendiente / Terminado)", type: "text" },
    { key: "observaciones", label: "Notas", type: "textarea" }
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
    { key: "estado_impreso", label: "Estado Impreso (NO / SI)", type: "text" }
  ],
  prod_dtf_pedidos: [
    { key: "fecha_hora", label: "Fecha y Hora", type: "text" },
    { key: "cliente", label: "Cliente", type: "text" },
    { key: "nombre_archivo", label: "Archivo", type: "text" },
    { key: "tipo_cargo", label: "Tipo Cargo (VENTA / REPOSICION / MUESTRA)", type: "text" },
    { key: "metros_archivo", label: "Metros", type: "number" },
    { key: "precio_metro", label: "Precio / m ($)", type: "number" },
    { key: "subtotal_cobrar", label: "Total ($)", type: "number" },
    { key: "monto_pagado", label: "Abonado ($)", type: "number" },
    { key: "observaciones", label: "Notas", type: "textarea" }
  ],
  prod_dtf_rollos: [
    { key: "id_rollo_dtf", label: "Código Rollo DTF", type: "text" },
    { key: "marca_fabricante", label: "Marca", type: "text" },
    { key: "perfil_impresion", label: "Perfil", type: "text" },
    { key: "metros_iniciales", label: "Metros Iniciales", type: "number" },
    { key: "estado", label: "Estado", type: "text" }
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
  title.textContent = id ? `✏️ Editar Registro (${tabla})` : `➕ Agregar Registro (${tabla})`;

  body.innerHTML = campos.map(c => {
    const val = reg && reg[c.key] !== undefined && reg[c.key] !== null ? reg[c.key] : "";
    if (c.type === "textarea") {
      return `<div><label>${escHtml(c.label)}</label><textarea data-crud-key="${c.key}" rows="2">${escHtml(val)}</textarea></div>`;
    }
    return `<div><label>${escHtml(c.label)}</label><input type="${c.type === "number" ? "number" : "text"}" step="any" data-crud-key="${c.key}" value="${escHtml(val)}"/></div>`;
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
    if (error) { toast("Error: " + error.message, "error"); return; }
    toast("✅ Registro actualizado.");
  } else {
    payload.empresa_id = "vvgrafic-principal";
    if (tabla === "prod_impresiones" || tabla === "prod_cola_calandrado" || tabla === "prod_cola_laser") {
      if (!payload.batch_id) payload.batch_id = `MANUAL-${Date.now()}`;
    }
    const { error } = await sb().from(tabla).insert(payload);
    if (error) { toast("Error: " + error.message, "error"); return; }
    toast("✅ Registro agregado.");
  }

  modal.classList.remove("open");
  await cargarDatosTodo();
}

async function eliminarRegistroCrudUniversal(tabla, id) {
  if (!confirm("¿Confirmás eliminar este registro?")) return;
  const pkCol = tabla === "prod_dtf_rollos" ? "id_rollo_dtf" : tabla === "prod_rollos_papel" ? "id_rollo" : "id";
  const { error } = await sb().from(tabla).delete().eq(pkCol, id);
  if (error) { toast("Error: " + error.message, "error"); return; }
  toast("🗑️ Registro eliminado.");
  await cargarDatosTodo();
}

async function editarNotaRapida(tabla, id, batchId) {
  const reg = obtenerRegistroMemoria(tabla, id);
  const actual = reg?.observaciones || "";
  const nueva = prompt("Escribe la nota u observación (se verá en todas las áreas):", actual);
  if (nueva === null) return;

  await sb().from(tabla).update({ observaciones: nueva }).eq("id", id);
  if (batchId) {
    await Promise.all([
      sb().from("prod_impresiones").update({ observaciones: nueva }).eq("batch_id", batchId),
      sb().from("prod_cola_calandrado").update({ observaciones: nueva }).eq("batch_id", batchId),
      sb().from("prod_cola_laser").update({ observaciones: nueva }).eq("batch_id", batchId)
    ]);
  }
  toast("📝 Nota guardada.");
  await cargarDatosTodo();
}

function obtenerMsTranscurridosKiosco() {
  if (STATE.kiosco.pausado) return STATE.kiosco.acumuladoMs;
  return STATE.kiosco.acumuladoMs + Math.max(0, Date.now() - (STATE.kiosco.ultimoInicioMs || Date.now()));
}

function formatearRelojKiosco(ms) {
  const seg = Math.floor(ms / 1000);
  const hh = String(Math.floor(seg / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seg % 3600) / 60)).padStart(2, "0");
  const ss = String(seg % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function actualizarDisplayCronometroKiosco() {
  const txt = formatearRelojKiosco(obtenerMsTranscurridosKiosco());

  // Reloj en Modo Enfoque Individual
  const elEnf = document.getElementById("enfReloj");
  if (elEnf) {
    elEnf.textContent = txt;
    elEnf.style.color = STATE.kiosco.pausado ? "#ff9800" : "#00E676";
  }
  const btnEnfPausa = document.getElementById("btnEnfPausaReanudar");
  if (btnEnfPausa) {
    btnEnfPausa.innerHTML = STATE.kiosco.pausado ? "▶️ REANUDAR" : "⏸️ PAUSAR";
    btnEnfPausa.style.borderColor = STATE.kiosco.pausado ? "#00E676" : "#ff9800";
    btnEnfPausa.style.color = STATE.kiosco.pausado ? "#00E676" : "#ff9800";
  }

  // Reloj en Modo Kiosko General (Rollo Completo)
  const elModal = document.getElementById("kioscoCronometro");
  if (elModal) {
    elModal.textContent = txt;
    elModal.style.color = STATE.kiosco.pausado ? "#ff9800" : "#00E676";
  }
  const badgePausa = document.getElementById("kioscoEstadoPausaBadge");
  if (badgePausa) badgePausa.style.display = STATE.kiosco.pausado ? "inline-block" : "none";

  const btnPausaModal = document.getElementById("btnKioscoPausarReanudar");
  if (btnPausaModal) {
    btnPausaModal.innerHTML = STATE.kiosco.pausado ? "▶️ REANUDAR" : "⏸️ PAUSAR";
    btnPausaModal.style.borderColor = STATE.kiosco.pausado ? "#00E676" : "#ff9800";
    btnPausaModal.style.color = STATE.kiosco.pausado ? "#00E676" : "#ff9800";
  }

  // Banner flotante en 2º plano
  const elBg = document.getElementById("kioscoBgCronometro");
  if (elBg) {
    elBg.textContent = txt;
    elBg.style.color = STATE.kiosco.pausado ? "#ff9800" : "#00E676";
  }
  const btnPausaBg = document.getElementById("btnKioscoBgPausar");
  if (btnPausaBg) {
    btnPausaBg.innerHTML = STATE.kiosco.pausado ? "▶️ Reanudar" : "⏸️ Pausar";
  }

  const bannerBg = document.getElementById("kioscoBackgroundBanner");
  if (bannerBg) {
    bannerBg.style.display = STATE.kiosco.corriendoEnFondo ? "flex" : "none";
    const trabActual = STATE.kiosco.trabajos[STATE.kiosco.indiceActual];
    const lblRollo = document.getElementById("kioscoBgRollo");
    const lblTrab = document.getElementById("kioscoBgTrabajoActual");
    if (lblRollo) lblRollo.textContent = STATE.kiosco.modo === "INDIVIDUAL" ? `ENFOQUE (${STATE.kiosco.rolloId || "-"})` : (STATE.kiosco.rolloId || "Sin Rollo");
    if (lblTrab) lblTrab.textContent = trabActual ? `${trabActual.cliente_archivo} (${fmtNum(trabActual.metros)}m)` : "-";
  }
}

function alternarPausaKiosco() {
  if (!STATE.kiosco.abierto && !STATE.kiosco.corriendoEnFondo) return;
  if (STATE.kiosco.pausado) {
    STATE.kiosco.pausado = false;
    STATE.kiosco.ultimoInicioMs = Date.now();
    toast("▶️ Cronómetro reanudado.");
  } else {
    STATE.kiosco.acumuladoMs = obtenerMsTranscurridosKiosco();
    STATE.kiosco.pausado = true;
    toast("⏸️ Cronómetro en pausa (ajustes de máquina).");
  }
  actualizarDisplayCronometroKiosco();
}

function minimizarKioscoAFondo() {
  const modalK = document.getElementById("modalKioscoOperativo");
  const modalE = document.getElementById("modalEnfoqueCalandra");
  if (modalK) modalK.classList.remove("open");
  if (modalE) modalE.classList.remove("open");
  STATE.kiosco.abierto = false;
  STATE.kiosco.corriendoEnFondo = true;
  actualizarDisplayCronometroKiosco();
  toast("👁️ Cronómetro en 2º plano. El tiempo sigue corriendo arriba.");
}

function restaurarKioscoDesdeFondo() {
  STATE.kiosco.corriendoEnFondo = false;
  STATE.kiosco.abierto = true;
  if (STATE.kiosco.modo === "INDIVIDUAL") {
    const modalE = document.getElementById("modalEnfoqueCalandra");
    if (modalE) {
      renderContenidoModalEnfoqueIndividual();
      modalE.classList.add("open");
    }
  } else {
    const modalK = document.getElementById("modalKioscoOperativo");
    if (modalK) {
      renderContenidoModalKiosco();
      modalK.classList.add("open");
    }
  }
  actualizarDisplayCronometroKiosco();
}

function cerrarKioscoDefinitivo() {
  if (STATE.kiosco.timerInterval) clearInterval(STATE.kiosco.timerInterval);
  STATE.kiosco.abierto = false;
  STATE.kiosco.corriendoEnFondo = false;
  STATE.kiosco.pausado = false;
  STATE.kiosco.acumuladoMs = 0;
  const modalK = document.getElementById("modalKioscoOperativo");
  const modalE = document.getElementById("modalEnfoqueCalandra");
  if (modalK) modalK.classList.remove("open");
  if (modalE) modalE.classList.remove("open");
  const bannerBg = document.getElementById("kioscoBackgroundBanner");
  if (bannerBg) bannerBg.style.display = "none";
}

function buscarSiguienteIndicePendienteKiosco(desdeIdx) {
  const n = STATE.kiosco.trabajos.length;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (desdeIdx + offset) % n;
    const id = STATE.kiosco.trabajos[idx].id;
    if (!STATE.kiosco.completadosIds.has(id) && !STATE.kiosco.descartadosIds.has(id)) {
      return idx;
    }
  }
  return -1;
}

// ============================================================================
// 1. MODO ENFOQUE INDIVIDUAL (1 SOLO TRABAJO - #modalEnfoqueCalandra)
// ============================================================================
function renderContenidoModalEnfoqueIndividual() {
  const t = STATE.kiosco.trabajos[0];
  if (!t) return;

  const thumbId = extraerThumbIdDrive(t.file_id);
  const imgContainer = document.getElementById("enfoqueImgContainer");
  const imgEl = document.getElementById("enfoqueImg");
  if (thumbId && imgContainer && imgEl) {
    imgEl.src = `https://drive.google.com/thumbnail?id=${encodeURIComponent(thumbId)}&sz=w400-h400`;
    imgContainer.style.display = "block";
    imgEl.onerror = () => { imgContainer.style.display = "none"; };
  } else if (imgContainer) {
    imgContainer.style.display = "none";
  }

  document.getElementById("enfoqueTela").textContent = t.tela_destino || "-";
  document.getElementById("enfoqueMetros").textContent = `${fmtNum(t.metros)} m`;
  document.getElementById("enfoqueBobina").textContent = t.id_rollo_papel || "Sin Rollo";
  document.getElementById("enfoqueCliente").textContent = t.cliente_archivo || "-";
  document.getElementById("enfoqueNRollo").textContent = t.num_rollo_tela || "-";
  document.getElementById("enfoqueColor").textContent = t.color_tela || "-";

  const obsRow = document.getElementById("enfoqueObsRow");
  const obsEl = document.getElementById("enfoqueObs");
  if (t.observaciones && t.observaciones !== "-") {
    obsEl.textContent = t.observaciones;
    obsRow.style.display = "flex";
  } else {
    obsRow.style.display = "none";
  }

  const inpVel = document.getElementById("enfVel");
  const inpTemp = document.getElementById("enfTemp");
  if (inpVel && !inpVel.value) inpVel.value = t.velocidad || 50;
  if (inpTemp && !inpTemp.value) inpTemp.value = t.temperatura || 205;
}

// ============================================================================
// 2. MODO KIOSKO GENERAL DE ROLLO COMPLETO (#modalKioscoOperativo)
// ============================================================================
function renderContenidoModalKiosco() {
  const modal = document.getElementById("modalKioscoOperativo");
  if (!modal) return;

  const trabajos = STATE.kiosco.trabajos || [];
  if (trabajos.length === 0) return;

  const rolloNombre = STATE.kiosco.rolloId || trabajos[0].id_rollo_papel || "Sin Rollo";
  const trabActual = trabajos[STATE.kiosco.indiceActual] || trabajos[0];

  const velActual = document.getElementById("kioscoInputVelocidad")?.value || trabActual.velocidad || 50;
  const tempActual = document.getElementById("kioscoInputTemperatura")?.value || trabActual.temperatura || 205;

  const pendientesRestantes = trabajos.filter(t => !STATE.kiosco.completadosIds.has(t.id) && !STATE.kiosco.descartadosIds.has(t.id));
  const totalM = pendientesRestantes.reduce((a, b) => a + (Number(b.metros) || 0), 0);

  const thumbIdActual = extraerThumbIdDrive(trabActual.file_id);
  const imgPreviewHtml = thumbIdActual
    ? `<img src="https://drive.google.com/thumbnail?id=${escHtml(thumbIdActual)}&sz=w600-h600" style="width:100%; height:240px; object-fit:contain; background:#000; border:2px solid var(--accent-magenta); border-radius:8px; margin-bottom:10px;" onerror="this.style.display='none';" />`
    : `<div style="width:100%; height:140px; background:#000; border:2px dashed #444; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#888; font-weight:bold; margin-bottom:10px;">${escHtml(trabActual.diseno || "SIN VISTA PREVIA")}</div>`;

  document.getElementById("kioscoTitulo").textContent = `🔥 MODO KIOSKO ACTIVO (BOBINA: ${rolloNombre})`;
  const proximoTrab = trabajos[STATE.kiosco.indiceActual + 1];

  document.getElementById("kioscoSubtitulo").innerHTML = `
    <!-- Encabezado Kiosko General igual al original -->
    <div style="display:flex; justify-content:space-between; align-items:center; background:#151821; border:1px solid #2a324b; padding:8px 14px; border-radius:8px; margin-bottom:12px;">
      <div style="font-size:15px; font-weight:bold; color:#00E676;">
        TRABAJO ${STATE.kiosco.indiceActual + 1} DE ${trabajos.length}
      </div>
      <div style="text-align:right; font-size:13px; color:#aaa;">
        Restante del Rollo: <strong style="color:#4CAF50; font-size:16px;">${fmtNum(totalM)} m</strong>
      </div>
    </div>

    <!-- Reproductor Principal de 2 Columnas (igual a panelReproductorCalandra original) -->
    <div style="display:grid; grid-template-columns: 1fr 1.6fr; gap:16px; align-items:center; background:#141720; padding:14px; border-radius:8px; border:1px solid #2a324b; margin-bottom:14px;">
      <div style="text-align:center;">
        ${imgPreviewHtml}
        <div style="font-size:34px; font-weight:bold; color:var(--accent-magenta); line-height:1;">${fmtNum(trabActual.metros)} m</div>
        <div style="color:#aaa; font-size:11px; margin-top:2px;">METROS A CALANDRAR</div>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="background:#0f1117; padding:10px 12px; border-radius:8px; border-left:5px solid #2196F3;">
          <div style="color:#888; font-size:11px; font-weight:bold;">TELA A BUSCAR EN DEPÓSITO:</div>
          <div style="font-size:26px; font-weight:bold; color:#2196F3; text-transform:uppercase;">${escHtml(trabActual.tela_destino || "-")}</div>
        </div>

        <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:10px;">
          <div style="background:#0f1117; padding:10px; border-radius:8px; border:1px solid #333;">
            <div style="color:#888; font-size:11px;">CLIENTE / DISEÑO:</div>
            <div style="font-size:15px; font-weight:bold; color:#fff; word-break:break-word;">${escHtml(trabActual.cliente_archivo)}</div>
          </div>
          <div style="background:#0f1117; padding:10px; border-radius:8px; border:1px solid #333;">
            <div style="color:#888; font-size:11px;">Nº ROLLO / COLOR:</div>
            <div style="font-size:16px; font-weight:bold; color:#ff9800;">${escHtml(trabActual.num_rollo_tela || "-")} (${escHtml(trabActual.color_tela || "-")})</div>
          </div>
        </div>

        ${trabActual.observaciones && trabActual.observaciones !== "-" ? `
          <div style="background:rgba(255,152,0,0.12); padding:8px 12px; border-radius:6px; border:1px solid #ff9800; color:#ff9800; font-weight:bold; font-size:13px;">
            ⚠️ NOTA: ${escHtml(trabActual.observaciones)}
          </div>
        ` : ""}

        <div style="background:rgba(255, 152, 0, 0.08); padding:8px 12px; border-radius:6px; border:1px dashed #ff9800; font-size:12px;">
          <span style="color:#ff9800; font-weight:bold;">⏭️ PRÓXIMO EN LA BOBINA:</span>
          <span style="color:#ccc; margin-left:6px;">${proximoTrab ? `${escHtml(proximoTrab.tela_destino)} — ${fmtNum(proximoTrab.metros)}m (${escHtml(proximoTrab.cliente_archivo)})` : "🏁 Fin de la Bobina"}</span>
        </div>
      </div>
    </div>

    <!-- Parámetros operativos (Velocidad y Temperatura) -->
    <div style="background:#111; border:1px solid #333; padding:10px; border-radius:8px; margin-bottom:12px; display:flex; justify-content:space-around; align-items:center; flex-wrap:wrap; gap:10px;">
      <div style="text-align:center;">
        <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">⚙️ VELOCIDAD (m/min)</label>
        <input type="number" id="kioscoInputVelocidad" value="${velActual}" step="1" style="width:110px; font-size:20px; text-align:center; padding:6px; background:#1a1c23; color:#00E676; border:1px solid #4CAF50; border-radius:6px; font-weight:bold;" />
      </div>
      <div style="text-align:center;">
        <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">🔥 TEMPERATURA (°C)</label>
        <input type="number" id="kioscoInputTemperatura" value="${tempActual}" step="1" style="width:110px; font-size:20px; text-align:center; padding:6px; background:#1a1c23; color:#ff9800; border:1px solid #ff9800; border-radius:6px; font-weight:bold;" />
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" class="btn-kiosco-reportar-falla" data-id="${trabActual.id}" data-estacion="Calandrado" style="background:rgba(216,27,96,0.18); border:1px solid var(--accent-magenta); color:#ff4081; padding:10px 14px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">⚠️ FALLA CALANDRA</button>
        <button type="button" class="btn-kiosco-reportar-falla" data-id="${trabActual.id}" data-estacion="Impresión" style="background:rgba(255,152,0,0.18); border:1px solid var(--accent-orange); color:#ff9800; padding:10px 14px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">⚠️ FALLA IMPRESIÓN</button>
      </div>
    </div>

    <div style="color:#aaa; font-size:12px; font-weight:bold; margin-bottom:6px;">
      SECUENCIA DEL ROLLO (${pendientesRestantes.length} pendientes de ${trabajos.length}) — <span style="color:#00E676;">Tocá cualquier trabajo para saltar a él</span>:
    </div>
    ${trabajos.map((t, idx) => {
      const esActual = idx === STATE.kiosco.indiceActual;
      const esCompletado = STATE.kiosco.completadosIds.has(t.id);
      const esDescartado = STATE.kiosco.descartadosIds.has(t.id);

      let borderStyle = "1px solid #333";
      let bgStyle = "#1a1c23";
      let badgeEstado = `<span style="background:#333; color:#ccc; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:bold;">#${idx + 1} EN COLA</span>`;

      if (esCompletado) {
        borderStyle = "1px solid #2e7d32";
        bgStyle = "rgba(46, 125, 50, 0.12)";
        badgeEstado = `<span style="background:#2e7d32; color:#fff; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:bold;">✅ YA CALANDRADO</span>`;
      } else if (esDescartado) {
        borderStyle = "1px solid #b71c1c";
        bgStyle = "rgba(183, 28, 28, 0.12)";
        badgeEstado = `<span style="background:#b71c1c; color:#fff; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:bold;">✂️ PAPEL DESECHADO</span>`;
      } else if (esActual) {
        borderStyle = "2px solid #00E676";
        bgStyle = "rgba(0, 230, 118, 0.10)";
        badgeEstado = `<span style="background:#00E676; color:#000; padding:3px 10px; border-radius:4px; font-size:11px; font-weight:bold;">🔥 CALANDRANDO AHORA</span>`;
      }

      return `
        <div class="kiosco-item-card" data-kiosco-idx="${idx}" style="background:${bgStyle}; padding:8px 12px; border-radius:6px; border:${borderStyle}; margin-bottom:6px; font-size:12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            ${badgeEstado}
            <strong style="color:#fff; margin-left:6px;">${escHtml(t.cliente_archivo)}</strong>
            <span style="color:#2196F3; font-weight:bold; margin-left:6px;">[${escHtml(t.tela_destino || "-")}]</span>
          </div>
          <div style="font-size:14px; font-weight:bold; color:var(--accent); white-space:nowrap;">${fmtNum(t.metros)}m</div>
        </div>
      `;
    }).join("")}
  `;

  const btnSig = document.getElementById("btnKioscoSiguienteTrabajo");
  const btnDesc = document.getElementById("btnKioscoDescartarSiguiente");
  if (btnSig) btnSig.style.display = trabajos.length > 1 ? "block" : "none";
  if (btnDesc) btnDesc.style.display = "block";

  modal.querySelectorAll(".kiosco-item-card").forEach(card => {
    card.onclick = () => {
      const idx = parseInt(card.getAttribute("data-kiosco-idx"), 10);
      if (!isNaN(idx) && idx !== STATE.kiosco.indiceActual) {
        STATE.kiosco.indiceActual = idx;
        renderContenidoModalKiosco();
        actualizarDisplayCronometroKiosco();
      }
    };
  });

  modal.querySelectorAll(".btn-kiosco-reportar-falla").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const est = btn.getAttribute("data-estacion");
      const reg = STATE.colaCalandrado.find(c => c.id === id);
      if (reg) await reportarFallaConReposicion(reg, est);
    };
  });
}

function abrirKioscoCalandra(idCal, rolloId = null) {
  const esModoRolloGeneral = Boolean(rolloId);

  // Si ya estaba corriendo en segundo plano para el mismo rollo/trabajo, restauramos la ventana correspondiente
  if (STATE.kiosco.corriendoEnFondo) {
    if ((esModoRolloGeneral && STATE.kiosco.modo === "ROLLO" && STATE.kiosco.rolloId === rolloId) ||
        (!esModoRolloGeneral && STATE.kiosco.modo === "INDIVIDUAL" && STATE.kiosco.registroIds.includes(idCal))) {
      restaurarKioscoDesdeFondo();
      return;
    }
  }

  if (!esModoRolloGeneral) {
    // ========================================================================
    // MODO ENFOQUE INDIVIDUAL (1 SOLO TRABAJO - #modalEnfoqueCalandra)
    // ========================================================================
    const r = STATE.colaCalandrado.find(c => c.id === idCal);
    if (!r) return;
    const modalE = document.getElementById("modalEnfoqueCalandra");
    if (!modalE) return;

    STATE.kiosco.modo = "INDIVIDUAL";
    STATE.kiosco.abierto = true;
    STATE.kiosco.corriendoEnFondo = false;
    STATE.kiosco.pausado = false;
    STATE.kiosco.acumuladoMs = 0;
    STATE.kiosco.ultimoInicioMs = Date.now();
    STATE.kiosco.inicioMs = Date.now();
    STATE.kiosco.rolloId = r.id_rollo_papel || "Sin Rollo";
    STATE.kiosco.trabajos = [r];
    STATE.kiosco.indiceActual = 0;
    STATE.kiosco.registroIds = [r.id];
    STATE.kiosco.completadosIds = new Set();
    STATE.kiosco.descartadosIds = new Set();

    document.getElementById("enfVel").value = r.velocidad || 50;
    document.getElementById("enfTemp").value = r.temperatura || 205;

    renderContenidoModalEnfoqueIndividual();
    modalE.classList.add("open");
    actualizarDisplayCronometroKiosco();

    if (STATE.kiosco.timerInterval) clearInterval(STATE.kiosco.timerInterval);
    STATE.kiosco.timerInterval = setInterval(actualizarDisplayCronometroKiosco, 1000);

    document.getElementById("btnEnfPausaReanudar").onclick = alternarPausaKiosco;
    document.getElementById("btnEnfMinimizar").onclick = minimizarKioscoAFondo;
    document.getElementById("btnEnfCerrar").onclick = () => {
      if (confirm("¿Salir del Modo Enfoque y detener el cronómetro sin guardar?")) {
        cerrarKioscoDefinitivo();
      }
    };
    document.getElementById("btnEnfFallaCal").onclick = () => reportarFallaConReposicion(r, "Calandrado");
    document.getElementById("btnEnfFallaImp").onclick = () => reportarFallaConReposicion(r, "Impresión");
    document.getElementById("btnEnfTerminar").onclick = async () => {
      const min = Math.max(1, Math.round(obtenerMsTranscurridosKiosco() / 60000));
      const vel = parseFloat(document.getElementById("enfVel")?.value) || 50;
      const temp = parseFloat(document.getElementById("enfTemp")?.value) || 205;
      cerrarKioscoDefinitivo();
      await finalizarTrabajoCalandrado(r.id, min, true, vel, temp);
      toast(`✅ Trabajo finalizado (${min} min | Vel: ${vel} | Temp: ${temp}°C).`);
      await cargarDatosTodo();
    };
    return;
  }

  // ==========================================================================
  // MODO KIOSKO GENERAL DE ROLLO COMPLETO (#modalKioscoOperativo)
  // ==========================================================================
  const modal = document.getElementById("modalKioscoOperativo");
  if (!modal) return;

  const trabajos = STATE.colaCalandrado.filter(c => c.id_rollo_papel === rolloId && !String(c.estado).toLowerCase().includes("terminado"));
  if (trabajos.length === 0) return;

  STATE.kiosco.modo = "ROLLO";
  STATE.kiosco.abierto = true;
  STATE.kiosco.corriendoEnFondo = false;
  STATE.kiosco.pausado = false;
  STATE.kiosco.acumuladoMs = 0;
  STATE.kiosco.ultimoInicioMs = Date.now();
  STATE.kiosco.inicioMs = Date.now();
  STATE.kiosco.rolloId = rolloId || trabajos[0].id_rollo_papel || "Sin Rollo";
  STATE.kiosco.trabajos = trabajos;
  STATE.kiosco.indiceActual = 0;
  STATE.kiosco.registroIds = trabajos.map(t => t.id);
  STATE.kiosco.completadosIds = new Set();
  STATE.kiosco.descartadosIds = new Set();

  renderContenidoModalKiosco();
  modal.classList.add("open");
  actualizarDisplayCronometroKiosco();

  if (STATE.kiosco.timerInterval) clearInterval(STATE.kiosco.timerInterval);
  STATE.kiosco.timerInterval = setInterval(actualizarDisplayCronometroKiosco, 1000);

  document.getElementById("btnKioscoPausarReanudar").onclick = alternarPausaKiosco;
  document.getElementById("btnKioscoMinimizar").onclick = minimizarKioscoAFondo;
  document.getElementById("btnKioscoMinimizar2").onclick = minimizarKioscoAFondo;
  document.getElementById("btnKioscoCancelarDefinitivo").onclick = () => {
    if (confirm("¿Cerrar el Modo Kiosko y detener el cronómetro sin guardar?")) {
      cerrarKioscoDefinitivo();
    }
  };

  document.getElementById("btnKioscoSiguienteTrabajo").onclick = async () => {
    const trabActual = STATE.kiosco.trabajos[STATE.kiosco.indiceActual];
    if (!trabActual) return;

    const min = Math.max(1, Math.round(obtenerMsTranscurridosKiosco() / 60000));
    const vel = parseFloat(document.getElementById("kioscoInputVelocidad")?.value) || 50;
    const temp = parseFloat(document.getElementById("kioscoInputTemperatura")?.value) || 205;

    await finalizarTrabajoCalandrado(trabActual.id, min, true, vel, temp);
    STATE.kiosco.completadosIds.add(trabActual.id);

    const sigIdx = buscarSiguienteIndicePendienteKiosco(STATE.kiosco.indiceActual);
    if (sigIdx === -1) {
      cerrarKioscoDefinitivo();
      toast(`✅ ¡Todos los trabajos del rollo fueron calandrados!`);
      await cargarDatosTodo();
      return;
    }

    STATE.kiosco.indiceActual = sigIdx;
    STATE.kiosco.acumuladoMs = 0;
    STATE.kiosco.ultimoInicioMs = Date.now();
    STATE.kiosco.pausado = false;
    toast(`✅ "${trabActual.cliente_archivo}" guardado (${min} min). Pasando al siguiente trabajo.`);
    renderContenidoModalKiosco();
    actualizarDisplayCronometroKiosco();
    await cargarDatosTodo();
  };

  document.getElementById("btnKioscoDescartarSiguiente").onclick = async () => {
    const trabActual = STATE.kiosco.trabajos[STATE.kiosco.indiceActual];
    if (!trabActual) return;

    const motivo = prompt(`Vas a desechar el papel de "${trabActual.cliente_archivo}" (${fmtNum(trabActual.metros)}m).\nMotivo del descarte / falla:`, "Papel desechado en Calandra");
    if (motivo === null) return;

    await sb().from("prod_fallas_reposiciones").insert({
      empresa_id: "vvgrafic-principal",
      tipo_registro: "ALERTA_REPOSICION",
      estacion: "Calandrado",
      id_rollo: trabActual.id_rollo_papel,
      batch_id: trabActual.batch_id,
      archivo_afectado: trabActual.cliente_archivo,
      tela: trabActual.tela_destino,
      metros_merma: Number(trabActual.metros) || 0,
      detalle_reposicion: `Papel desechado (${fmtNum(trabActual.metros)}m)`,
      motivo: motivo || "Papel desechado en Calandra",
      estado: "Pendiente"
    });

    await sb().from("prod_cola_calandrado").update({
      estado: "Terminado",
      fecha_terminado: new Date().toISOString(),
      observaciones: `[PAPEL DESECHADO: ${motivo}] ${trabActual.observaciones || ""}`.trim()
    }).eq("id", trabActual.id);

    STATE.kiosco.descartadosIds.add(trabActual.id);

    const sigIdx = buscarSiguienteIndicePendienteKiosco(STATE.kiosco.indiceActual);
    if (sigIdx === -1) {
      cerrarKioscoDefinitivo();
      toast(`✂️ Papel desechado registrado. No quedan más trabajos en el rollo.`);
      await cargarDatosTodo();
      return;
    }

    STATE.kiosco.indiceActual = sigIdx;
    STATE.kiosco.acumuladoMs = 0;
    STATE.kiosco.ultimoInicioMs = Date.now();
    toast(`✂️ Papel desechado registrado. Avanzando al siguiente trabajo.`);
    renderContenidoModalKiosco();
    actualizarDisplayCronometroKiosco();
    await cargarDatosTodo();
  };

  document.getElementById("btnKioscoFinalizar").onclick = async () => {
    const min = Math.max(1, Math.round(obtenerMsTranscurridosKiosco() / 60000));
    const vel = parseFloat(document.getElementById("kioscoInputVelocidad")?.value) || 50;
    const temp = parseFloat(document.getElementById("kioscoInputTemperatura")?.value) || 205;

    const pendientesIds = STATE.kiosco.trabajos
      .map(t => t.id)
      .filter(id => !STATE.kiosco.completadosIds.has(id) && !STATE.kiosco.descartadosIds.has(id));

    cerrarKioscoDefinitivo();
    for (const id of pendientesIds) {
      await finalizarTrabajoCalandrado(id, min, true, vel, temp);
    }
    toast(`✅ Kiosko finalizado (${pendientesIds.length} trabajo(s) guardados con Vel: ${vel}m/min y Temp: ${temp}°C).`);
    await cargarDatosTodo();
  };
}

async function reportarFallaConReposicion(reg, estacion) {
  if (!reg) return;
  const mDefault = reg.metros || reg.metros_impresos || 10;
  const metrosFalla = parseFloat(prompt(`¿Cuántos metros salieron con falla en "${reg.cliente_archivo}"?`, mDefault)) || 0;
  if (metrosFalla <= 0) return;
  const motivo = prompt("Motivo de la falla:", `Falla en ${estacion}`) || `Falla en ${estacion}`;

  await sb().from("prod_fallas_reposiciones").insert({
    empresa_id: "vvgrafic-principal",
    tipo_registro: "ALERTA_REPOSICION",
    estacion,
    id_rollo: reg.id_rollo_papel,
    batch_id: reg.batch_id,
    archivo_afectado: reg.cliente_archivo,
    tela: reg.tela_destino,
    metros_merma: metrosFalla,
    detalle_reposicion: `Reimprimir ${metrosFalla}m`,
    motivo,
    estado: "Pendiente"
  });

  await sb().from("prod_pendientes_drive").insert({
    empresa_id: "vvgrafic-principal",
    modulo: "SUBLIMACION",
    cliente: `REPOSICIÓN ${estacion.toUpperCase()}`,
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

  toast(`⚠️ Falla registrada y reposición enviada a Cola Pendiente.`, "warn");
  await cargarDatosTodo();
}

// ============================================================================
// INICIALIZACIÓN DE EVENTOS
// ============================================================================
export function inicializarEventosUI() {
  const imgLogo = document.getElementById("imgLogoVV");
  if (imgLogo && window.VG_LOGO_B64) {
    imgLogo.src = window.VG_LOGO_B64.startsWith("data:")
      ? window.VG_LOGO_B64
      : `data:image/png;base64,${window.VG_LOGO_B64}`;
  }

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

  document.querySelectorAll(".vg-period-pill[data-period]").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.periodoActivo = btn.getAttribute("data-period");
      document.querySelectorAll(".vg-period-pill[data-period]").forEach(b => b.classList.toggle("activo", b === btn));
      renderTodoRespetandoFormulario();
    });
  });

  const inpDesde = document.getElementById("vgDateDesde");
  const inpHasta = document.getElementById("vgDateHasta");
  const aplicarRangoCustom = () => {
    STATE.fechaDesde = inpDesde?.value || "";
    STATE.fechaHasta = inpHasta?.value || "";
    STATE.periodoActivo = "custom";
    document.querySelectorAll(".vg-period-pill[data-period]").forEach(b => b.classList.remove("activo"));
    renderTodoRespetandoFormulario();
  };
  document.getElementById("btnCalcularRango")?.addEventListener("click", aplicarRangoCustom);

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
  document.getElementById("searchHistorialImpLocal")?.addEventListener("input", (e) => {
    STATE.filtroHistorialImpLocal = e.target.value;
    renderTablaImpresionesConBloques();
  });
  document.getElementById("searchCalandraLocal")?.addEventListener("input", (e) => {
    STATE.filtroCalandraLocal = e.target.value;
    renderModuloCalandrado();
  });

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

  document.querySelectorAll(".vg-route-btn[data-ruta-val]").forEach(btn => {
    btn.addEventListener("click", () => {
      STATE.impForm.dirty = true;
      STATE.impForm.ruta = btn.getAttribute("data-ruta-val");
      actualizarBotonesRutaUI();
    });
  });

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
    toast(`🧻 Rollo ${nuevoId} montado.`);
    await cargarDatosTodo();
  });

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

  document.getElementById("btnSyncDriveSandbox")?.addEventListener("click", async () => {
    const url = window.VG_CONEXION?.sandboxBridgeUrl;
    toast("Sincronizando...");
    if (url) {
      try { await fetch(`${url}?action=sync_drive`, { mode: "no-cors" }); } catch (_) {}
    }
    await cargarDatosTodo();
    toast("✅ Sincronizado.");
  });

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
        perfil_detectado: parsed.perfil,
        tela_detectada: parsed.tela,
        rollo_detectado: parsed.rollo,
        color_detectado: parsed.color,
        ruta_detectada: parsed.ruta,
        estado_impreso: "NO",
        file_id: `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      }, { onConflict: "file_id" });
    }
    toast(`🔬 ${files.length} archivo(s) cargados.`);
    await cargarDatosTodo();
  });

  document.getElementById("btnRegistrarPedidoDTF")?.addEventListener("click", async () => {
    const cliente = document.getElementById("dtfInputCliente")?.value.trim() || "CLIENTE DTF";
    const archivo = document.getElementById("dtfInputArchivo")?.value.trim() || "Archivo DTF.png";
    const metrosArch = parseFloat(document.getElementById("dtfInputMetrosArchivo")?.value) || 1;
    const metrosRollo = parseFloat(document.getElementById("dtfInputMetrosRolloFisico")?.value) || metrosArch;
    const idRollo = document.getElementById("dtfInputRollo")?.value || "DTF-60-001";
    const cargo = document.getElementById("dtfInputTipoCargo")?.value || "VENTA";
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

    toast(`✅ Trabajo DTF registrado.`);
    await cargarDatosTodo();
  });

  const inpFotoChat = document.getElementById("chatInputFotoCamara");
  inpFotoChat?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    STATE.chatFotoBase64 = await comprimirFotoCamaraWebP(f);
    const prev = document.getElementById("chatFotoPreviewBadge");
    if (prev) { prev.style.display = "inline-block"; prev.textContent = "📷 Foto lista"; }
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
      mensaje: texto || "📷 Foto adjunta",
      foto_base64: STATE.chatFotoBase64 || ""
    });

    if (inp) inp.value = "";
    STATE.chatFotoBase64 = "";
    const prev = document.getElementById("chatFotoPreviewBadge");
    if (prev) prev.style.display = "none";
    toast("💬 Mensaje enviado.");
    await cargarDatosTodo();
  });

  document.body.addEventListener("click", async (e) => {
    const btnEdit = e.target.closest(".btn-crud-edit");
    if (btnEdit) { abrirModalCrudUniversal(btnEdit.getAttribute("data-table"), btnEdit.getAttribute("data-id")); return; }

    const btnDel = e.target.closest(".btn-crud-del");
    if (btnDel) { eliminarRegistroCrudUniversal(btnDel.getAttribute("data-table"), btnDel.getAttribute("data-id")); return; }

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
    if (btnNota) { editarNotaRapida(btnNota.getAttribute("data-table"), btnNota.getAttribute("data-id"), btnNota.getAttribute("data-batch")); return; }

    const btnEtiqueta = e.target.closest(".btn-imp-etiqueta");
    if (btnEtiqueta) { imprimirEtiquetaRollo(btnEtiqueta.getAttribute("data-rollo"), btnEtiqueta.getAttribute("data-metros")); return; }

    const btnPuchito = e.target.closest(".btn-activar-puchito");
    if (btnPuchito) {
      const rId = btnPuchito.getAttribute("data-rollo");
      await sb().from("prod_rollos_papel").update({ estado: "Sobrante" }).eq("estado", "Activo");
      await sb().from("prod_rollos_papel").update({ estado: "Activo" }).eq("id_rollo", rId);
      toast(`🧻 Sobrante ${rId} re-montado.`);
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
      if (reg && confirm("¿Deshacer impresión?")) {
        await sb().from("prod_impresiones").delete().eq("id", reg.id);
        if (reg.batch_id) await sb().from("prod_cola_calandrado").delete().eq("batch_id", reg.batch_id);
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
      renderModuloCalandrado();
      return;
    }

    const btnCalKioscoRollo = e.target.closest(".btn-cal-kiosco-rollo");
    if (btnCalKioscoRollo) { abrirKioscoCalandra(null, btnCalKioscoRollo.getAttribute("data-rollo")); return; }

    const btnCalProcRollo = e.target.closest(".btn-cal-procesar-rollo");
    if (btnCalProcRollo) { procesarRolloCompletoCalandrado(btnCalProcRollo.getAttribute("data-rollo")); return; }

    const btnCalPdfRollo = e.target.closest(".btn-cal-pdf-rollo");
    if (btnCalPdfRollo) {
      const rId = btnCalPdfRollo.getAttribute("data-rollo");
      emitirPDFCalandrado(rId);
      return;
    }

    const btnCalTerm = e.target.closest(".btn-cal-terminar");
    if (btnCalTerm) { finalizarTrabajoCalandrado(btnCalTerm.getAttribute("data-id")); return; }

    const btnCalReabrir = e.target.closest(".btn-cal-reabrir");
    if (btnCalReabrir) {
      await sb().from("prod_cola_calandrado").update({ estado: "Pendiente", fecha_terminado: null }).eq("id", btnCalReabrir.getAttribute("data-id"));
      await cargarDatosTodo();
      return;
    }

    const btnCalKiosco = e.target.closest(".btn-cal-kiosco");
    if (btnCalKiosco) { abrirKioscoCalandra(btnCalKiosco.getAttribute("data-id")); return; }

    const btnCalFalla = e.target.closest(".btn-cal-falla");
    if (btnCalFalla) {
      const reg = STATE.colaCalandrado.find(c => c.id === btnCalFalla.getAttribute("data-id"));
      reportarFallaConReposicion(reg, "Calandrado");
      return;
    }

    const btnLasCorte = e.target.closest(".btn-laser-cortar-lote");
    if (btnLasCorte) { cortarLoteLaser(btnLasCorte.getAttribute("data-ids")); return; }

    const btnDtfSaldar = e.target.closest(".btn-dtf-saldar");
    if (btnDtfSaldar) {
      const id = btnDtfSaldar.getAttribute("data-id");
      const tot = parseFloat(btnDtfSaldar.getAttribute("data-total")) || 0;
      await sb().from("prod_dtf_pedidos").update({ monto_pagado: tot, estado_entrega: "Entregado" }).eq("id", id);
      await cargarDatosTodo();
      return;
    }

    const btnDtfPend = e.target.closest(".btn-dtf-cargar-pend");
    if (btnDtfPend) {
      const p = STATE.pendientesDrive.find(x => x.id === btnDtfPend.getAttribute("data-id"));
      if (p) {
        document.getElementById("dtfInputCliente").value = p.cliente;
        document.getElementById("dtfInputArchivo").value = p.nombre_archivo;
        document.getElementById("dtfInputMetrosArchivo").value = p.metros_totales;
      }
      return;
    }
  });

  document.getElementById("btnGuardarModalCrud")?.addEventListener("click", guardarModalCrudUniversal);
  document.getElementById("btnKioscoBgPausar")?.addEventListener("click", alternarPausaKiosco);
  document.getElementById("btnKioscoBgVolver")?.addEventListener("click", restaurarKioscoDesdeFondo);

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
      document.querySelectorAll(".btn-canal-chat").forEach(b => b.classList.toggle("activo", b === btn));
      renderModuloChat();
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  inicializarEventosUI();
  cargarDatosTodo();
  suscribirRealtime();
});
