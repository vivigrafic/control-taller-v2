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
  telasFicha: [],
  telasVariantes: [],
  telasParametros: [],
  historialAnchosTelas: [],
  filtroTelasLocal: "",

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

// Renderiza una caja de miniatura fija y robusta (nunca colapsa ni desordena la tabla/tarjeta)
function renderCajaMiniatura(thumbId, nombre, badgeTexto = "") {
  const nombreCorto = escHtml(nombre || "").replace(/\.(jpg|jpeg|png|tif|tiff|pdf)$/i, "");
  const driveUrl = thumbId ? `https://drive.google.com/file/d/${escHtml(thumbId)}/view` : null;
  const clickAttr = driveUrl ? `onclick="event.stopPropagation(); window.open('${driveUrl}', '_blank');"` : "";
  const cursorStyle = driveUrl ? "cursor:pointer;" : "";

  if (thumbId) {
    const thumbUrl = `https://drive.google.com/thumbnail?id=${escHtml(thumbId)}&sz=w140-h140`;
    const fallbackThumbUrl = `https://lh3.googleusercontent.com/d/${escHtml(thumbId)}=s140`;
    return `
      <div class="caja-miniatura-wrap" style="position:relative; width:64px; height:64px; margin:0 auto; background:#111; border:1px solid #334155; border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center; ${cursorStyle}" ${clickAttr} title="${escHtml(nombre || "Ver archivo en Drive")}">
        <img src="${thumbUrl}" alt="${nombreCorto}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="if(this.src!=='${fallbackThumbUrl}'){this.src='${fallbackThumbUrl}';}else{this.style.display='none'; this.nextElementSibling.style.display='flex';}" />
        <div class="miniatura-ph" style="display:none; width:100%; height:100%; position:absolute; top:0; left:0; flex-direction:column; align-items:center; justify-content:center; background:#1e293b; color:#94a3b8; font-size:9px; text-align:center; padding:2px;">
          <span style="font-size:16px;">🖼️</span>
          <span style="font-size:8.5px; line-height:1; margin-top:2px; max-width:58px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${nombreCorto || "Diseño"}</span>
        </div>
        ${badgeTexto ? `<span style="position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.85); color:#00E676; font-size:8px; font-weight:bold; padding:1px 4px; border-radius:3px;">${badgeTexto}</span>` : ""}
      </div>
    `;
  }

  return `
    <div class="caja-miniatura-wrap" style="width:64px; height:64px; margin:0 auto; background:#1e293b; border:1px dashed #475569; border-radius:6px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#64748b; font-size:9px; padding:2px; text-align:center;">
      <span style="font-size:16px;">🖼️</span>
      <span style="max-width:58px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px; font-size:8.5px;">${nombreCorto || "Sin Ref"}</span>
    </div>
  `;
}

// 1: En impresión muestra el 1er archivo del anidado (o el archivo único)
function renderMiniaturaImpresion(row) {
  const fileIds = (row.file_ids && row.file_ids.length > 0)
    ? row.file_ids
    : String(row.file_id || "").split(",").map(s => s.trim()).filter(Boolean);
  const firstId = fileIds.length > 0 ? extraerThumbIdDrive(fileIds[0]) : null;
  const nombre = (row.archivos && row.archivos.length > 0)
    ? row.archivos[0]
    : (row.cliente_archivo ? String(row.cliente_archivo).split(" | ")[0] : "");
  const total = (row.archivos && row.archivos.length > 0) ? row.archivos.length : fileIds.length;
  const esAnidado = row.es_anidado || total > 1;

  return renderCajaMiniatura(firstId, nombre, esAnidado ? `1 de ${total}` : "");
}

// 2: En calandrado muestra todos los archivos en carrusel deslizable con swipe / botones
function renderCarruselCalandrado(c) {
  const archivos = (c.archivos && c.archivos.length > 0)
    ? c.archivos
    : String(c.cliente_archivo || "").split(" | ").filter(Boolean);
  const fileIds = (c.file_ids && c.file_ids.length > 0)
    ? c.file_ids
    : String(c.file_id || "").split(",").map(s => s.trim()).filter(Boolean);
  const total = Math.max(archivos.length, fileIds.length);

  // Si tiene un solo archivo, renderiza miniatura única sin controles de carrusel
  if (total <= 1) {
    const fid = fileIds[0] || "";
    const thumbId = extraerThumbIdDrive(fid);
    return renderCajaMiniatura(thumbId, archivos[0] || c.cliente_archivo);
  }

  // Carrusel deslizable para lote anidado
  const carruselId = `carrusel_${String(c.batch_id || c.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const slidesHtml = [];

  for (let i = 0; i < total; i++) {
    const archNom = archivos[i] || `Archivo ${i + 1}`;
    const archNomCorto = escHtml(archNom).replace(/\.(jpg|jpeg|png|tif|tiff|pdf)$/i, "");
    const fid = fileIds[i] || fileIds[0] || "";
    const thumbId = extraerThumbIdDrive(fid);
    const driveUrl = thumbId ? `https://drive.google.com/file/d/${escHtml(thumbId)}/view` : null;
    const clickAttr = driveUrl ? `onclick="event.stopPropagation(); window.open('${driveUrl}', '_blank');"` : "";
    const thumbUrl = thumbId ? `https://drive.google.com/thumbnail?id=${escHtml(thumbId)}&sz=w160-h160` : "";
    const fallbackThumbUrl = thumbId ? `https://lh3.googleusercontent.com/d/${escHtml(thumbId)}=s160` : "";

    slidesHtml.push(`
      <div class="cal-carrusel-slide" style="flex:0 0 76px; width:76px; height:76px; scroll-snap-align:center; position:relative; display:flex; align-items:center; justify-content:center; background:#0f172a; cursor:pointer;" ${clickAttr} title="${escHtml(archNom)} (Tocar para ver en Drive)">
        ${thumbId ? `
          <img src="${thumbUrl}" alt="${archNomCorto}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="if(this.src!=='${fallbackThumbUrl}'){this.src='${fallbackThumbUrl}';}else{this.style.display='none'; this.nextElementSibling.style.display='flex';}" />
          <div class="miniatura-ph" style="display:none; width:100%; height:100%; position:absolute; top:0; left:0; flex-direction:column; align-items:center; justify-content:center; background:#1e293b; color:#94a3b8; font-size:9px; text-align:center; padding:2px;">
            <span style="font-size:15px;">🖼️</span>
            <span style="max-width:70px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${archNomCorto}</span>
          </div>
        ` : `
          <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#1e293b; color:#94a3b8; font-size:9px; text-align:center; padding:2px;">
            <span style="font-size:15px;">🖼️</span>
            <span style="max-width:70px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${archNomCorto}</span>
          </div>
        `}
        <span style="position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.88); color:#38BDF8; font-size:8px; font-weight:900; padding:1px 4px; border-radius:3px;">${i + 1}/${total}</span>
      </div>
    `);
  }

  return `
    <div class="cal-carrusel-container" style="display:inline-flex; align-items:center; gap:3px; max-width:125px; margin:0 auto; user-select:none;">
      <button type="button" class="btn-carrusel-nav" onclick="event.stopPropagation(); const trk=document.getElementById('${carruselId}'); if(trk){ trk.scrollBy({left:-76, behavior:'smooth'}); }" style="background:rgba(255,255,255,0.08); border:none; color:#38BDF8; width:20px; height:76px; border-radius:4px; font-size:14px; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; font-weight:bold;" title="Anterior">‹</button>
      
      <div id="${carruselId}" class="cal-carrusel-track" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none; width:76px; height:76px; border-radius:6px; border:1.5px solid #2563eb; background:#0f172a; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
        ${slidesHtml.join("")}
      </div>

      <button type="button" class="btn-carrusel-nav" onclick="event.stopPropagation(); const trk=document.getElementById('${carruselId}'); if(trk){ trk.scrollBy({left:76, behavior:'smooth'}); }" style="background:rgba(255,255,255,0.08); border:none; color:#38BDF8; width:20px; height:76px; border-radius:4px; font-size:14px; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; font-weight:bold;" title="Siguiente">›</button>
    </div>
  `;
}

function renderMiniaturaDiseno60(fileIdStr, disenoStr, nombreStr = "") {
  const thumbId = extraerThumbIdDrive(fileIdStr);
  return renderCajaMiniatura(thumbId, disenoStr || nombreStr);
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
    resChat,
    resTelasFicha,
    resTelasVariantes,
    resTelasParametros,
    resHistorialAnchos
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
    client.from("prod_chat_mensajes").select("*").order("created_at", { ascending: false }).limit(150),
    client.from("prod_telas_ficha").select("*").eq("activo", true).order("nombre_comercial", { ascending: true }),
    client.from("prod_telas_variantes").select("*").order("es_predeterminada", { ascending: false }),
    client.from("prod_telas_parametros").select("*"),
    client.from("prod_historial_anchos_tela").select("*").order("fecha", { ascending: false }).limit(200)
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
  STATE.telasFicha = resTelasFicha.data || [];
  STATE.telasVariantes = resTelasVariantes.data || [];
  STATE.telasParametros = resTelasParametros.data || [];
  STATE.historialAnchosTelas = resHistorialAnchos.data || [];

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
// PUENTE ASÍNCRONO SEGUNDO PLANO GOOGLE SHEET VIEJA (0ms impacto en velocidad)
// ============================================================================
export function notificarSincronizacionSheetViejaEnSegundoPlano(modulo, accion, payload = {}) {
  const bridgeUrl = window.VG_CONEXION?.sandboxBridgeUrl;
  if (!bridgeUrl) return;

  setTimeout(() => {
    try {
      const dataParam = encodeURIComponent(JSON.stringify({
        modulo,
        accion,
        fecha: new Date().toISOString(),
        ...payload
      }));
      fetch(`${bridgeUrl}?action=sync_sheet_evento&data=${dataParam}`, {
        mode: "no-cors",
        keepalive: true
      }).catch((err) => {
        console.warn("Aviso silencioso sync sheet:", err);
      });
    } catch (e) {
      console.warn("Aviso en background sync:", e);
    }
  }, 20);
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
  renderModuloTelas();
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

  // Poblar datalists combinando telas maestras relacionales + MRU
  const dlTelas = document.getElementById("listTelas");
  if (dlTelas) {
    const nombresTelas = Array.from(new Set([
      ...(STATE.telasFicha || []).map(t => t.nombre_comercial),
      ...telas.map(t => t.nombre)
    ]));
    dlTelas.innerHTML = nombresTelas.map(nom => `<option value="${escHtml(nom)}">`).join("");
  }
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

// Agrupa impresiones del mismo batch_id para que los anidados se vean consolidados
function agruparImpresionesPorBatch(filas) {
  const mapa = new Map();
  const resultado = [];

  filas.forEach(row => {
    const esEspecial = row.accion && (row.accion.includes("Corte") || row.accion.includes("Avance") || row.accion.includes("Calibración"));
    if (esEspecial || !row.batch_id) {
      resultado.push({ ...row, ids: [row.id], archivos: String(row.cliente_archivo || "").split(" | ").filter(Boolean), es_anidado: false });
      return;
    }

    const key = row.batch_id;
    if (!mapa.has(key)) {
      const item = {
        ...row,
        ids: [row.id],
        archivos: String(row.cliente_archivo || "").split(" | ").filter(Boolean),
        file_ids: String(row.file_id || "").split(",").filter(Boolean),
        metros_totales: Number(row.metros_impresos) || 0,
        metros_impresos: Number(row.metros_impresos) || 0,
        observaciones: row.observaciones || ""
      };
      mapa.set(key, item);
      resultado.push(item);
    } else {
      const g = mapa.get(key);
      g.ids.push(row.id);
      const nuevosArch = String(row.cliente_archivo || "").split(" | ").filter(Boolean);
      nuevosArch.forEach(a => { if (!g.archivos.includes(a)) g.archivos.push(a); });
      const nuevosFids = String(row.file_id || "").split(",").filter(Boolean);
      nuevosFids.forEach(fid => { if (!g.file_ids.includes(fid)) g.file_ids.push(fid); });
      g.metros_totales = Number((g.metros_totales + (Number(row.metros_impresos) || 0)).toFixed(2));
      g.metros_impresos = g.metros_totales;
      if (row.observaciones && !g.observaciones.includes(row.observaciones)) {
        g.observaciones = g.observaciones ? `${g.observaciones} | ${row.observaciones}` : row.observaciones;
      }
      if (!g.file_id && row.file_id) g.file_id = row.file_id;
      if (!g.diseno && row.diseno) g.diseno = row.diseno;
      if ((!g.tela_destino || g.tela_destino === "-") && row.tela_destino) g.tela_destino = row.tela_destino;
      if (!g.num_rollo_tela && row.num_rollo_tela) g.num_rollo_tela = row.num_rollo_tela;
      if (!g.color_tela && row.color_tela) g.color_tela = row.color_tela;
    }
  });

  resultado.forEach(item => {
    if (item.archivos && item.archivos.length > 0) {
      item.cliente_archivo = item.archivos.join(" | ");
      item.file_id = item.file_ids ? item.file_ids.join(",") : item.file_id;
      item.es_anidado = item.ids.length > 1 || item.archivos.length > 1;
    }
  });

  return resultado;
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

    const filasAgrupadas = agruparImpresionesPorBatch(filasOrdenadas);

    filasAgrupadas.forEach(row => {
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

      const m = fmtNum(row.metros_impresos || row.metros_totales || row.metros_desperdicio || 0);
      const idsCsv = row.ids ? row.ids.join(",") : row.id;
      const actionBtn = `
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px; max-width:90px;">
          <button type="button" class="btn-imp-falla" data-id="${row.id}" style="background:transparent; border:1px solid var(--danger); border-radius:4px; cursor:pointer; color:var(--danger); padding:3px;" title="Reportar Falla">⚠️</button>
          <button type="button" class="btn-imp-deshacer" data-id="${row.id}" data-ids="${idsCsv}" data-batch="${escHtml(row.batch_id)}" style="background:transparent; border:1px solid #aaa; color:#aaa; border-radius:4px; cursor:pointer; padding:3px;" title="Revertir">🔙</button>
          <button type="button" class="btn-nota-rapida" data-table="prod_impresiones" data-id="${row.id}" data-batch="${escHtml(row.batch_id)}" style="background:transparent; border:1px solid var(--accent-orange); color:var(--accent-orange); border-radius:4px; cursor:pointer; padding:3px;" title="Añadir/Editar Nota">📝</button>
          <button type="button" class="btn-imp-etiqueta" data-rollo="${escHtml(bloqueId)}" data-metros="${m}" style="background:var(--accent-blue); border:1px solid var(--accent-blue); border-radius:4px; cursor:pointer; color:#fff; padding:3px;" title="Etiqueta Lote">🖨️</button>
          <button type="button" class="btn-crud-edit" data-table="prod_impresiones" data-id="${row.id}" style="background:transparent; border:1px solid var(--accent-blue); color:var(--accent-blue); border-radius:4px; cursor:pointer; padding:3px;" title="Editar">✏️</button>
          <button type="button" class="btn-crud-del" data-table="prod_impresiones" data-id="${row.id}" data-batch="${escHtml(row.batch_id)}" data-ids="${idsCsv}" style="background:transparent; border:1px solid var(--danger); color:var(--danger); border-radius:4px; cursor:pointer; padding:3px;" title="Eliminar">🗑️</button>
        </div>
      `;

      html += `
        <tr>
          <td data-label="Acción">${actionBtn}</td>
          <td data-label="Fecha">${fmtDateHora(row.fecha_hora)}</td>
          <td data-label="Cliente/Archivo">
            ${row.es_anidado ? `<span class="badge activo" style="font-size:10px; margin-bottom:4px; display:inline-block;">📦 ANIDADO (${row.archivos.length} archivos)</span><br>` : ""}
            ${formatearAnidadosHTML(row.cliente_archivo)}
          </td>
          <td data-label="Diseño" style="text-align:center;">${renderMiniaturaImpresion(row)}</td>
          <td data-label="Tela">${escHtml(row.tela_destino || "")}</td>
          <td data-label="Nº Rollo">${escHtml(row.num_rollo_tela || "")}</td>
          <td data-label="Color">${escHtml(row.color_tela || "")}</td>
          <td data-label="Metros" style="color:var(--accent); font-weight:bold;">${m}m</td>
          <td data-label="Perfil">${escHtml(row.perfil || "")}</td>
          <td data-label="Ruta"><span class="badge">${escHtml(row.ruta || "Solo Calandrado")}</span></td>
          <td data-label="Notas">${row.observaciones ? `<span style="color:var(--accent-orange); font-weight:bold;">📝 ${escHtml(row.observaciones)}</span>` : "-"}</td>
        </tr>
      `;
    });
  }

  tbody.innerHTML = html;
}

// ============================================================================
// MÓDULO 2: CALANDRADO — Idéntico a JS_Calandrado.html (Captura 3)
// ============================================================================
function agruparCalandradoPorBatch(filas) {
  const mapa = new Map();
  filas.forEach(r => {
    const key = r.batch_id || r.id;
    if (!mapa.has(key)) {
      mapa.set(key, {
        ...r,
        ids: [r.id],
        archivos: String(r.cliente_archivo || "").split(" | ").filter(Boolean),
        file_ids: String(r.file_id || "").split(",").filter(Boolean),
        metros_totales: Number(r.metros) || 0,
        metros: Number(r.metros) || 0,
        observaciones: r.observaciones || ""
      });
    } else {
      const g = mapa.get(key);
      g.ids.push(r.id);
      const nuevosArch = String(r.cliente_archivo || "").split(" | ").filter(Boolean);
      nuevosArch.forEach(a => { if (!g.archivos.includes(a)) g.archivos.push(a); });
      const nuevosFileIds = String(r.file_id || "").split(",").filter(Boolean);
      nuevosFileIds.forEach(fid => { if (!g.file_ids.includes(fid)) g.file_ids.push(fid); });
      g.metros_totales = Number((g.metros_totales + (Number(r.metros) || 0)).toFixed(2));
      g.metros = g.metros_totales;
      if (r.observaciones && !g.observaciones.includes(r.observaciones)) {
        g.observaciones = g.observaciones ? `${g.observaciones} | ${r.observaciones}` : r.observaciones;
      }
      if (!g.file_id && r.file_id) g.file_id = r.file_id;
      if (!g.diseno && r.diseno) g.diseno = r.diseno;
      if ((!g.tela_destino || g.tela_destino === "-") && r.tela_destino) g.tela_destino = r.tela_destino;
      if (!g.num_rollo_tela && r.num_rollo_tela) g.num_rollo_tela = r.num_rollo_tela;
      if (!g.color_tela && r.color_tela) g.color_tela = r.color_tela;
    }
  });

  const res = [];
  for (const item of mapa.values()) {
    item.cliente_archivo = item.archivos.join(" | ");
    item.file_id = item.file_ids.join(",");
    item.es_anidado = item.ids.length > 1 || item.archivos.length > 1;
    res.push(item);
  }
  return res;
}

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

      const itemsAgrupados = agruparCalandradoPorBatch(items);

      let badgeHTML = isActivo ? '<span class="badge activo" style="margin-left:5px;">🔥 MÁQUINA</span>' : '';
      if (isImprimiendo && !isActivo) badgeHTML += '<span class="badge" style="background:#ff9800; color:#fff; margin-left:5px;">🖨️ EN IMPRESORA</span>';
      const countBadge = `<span class="badge" style="background:#444; color:#fff; margin-left:5px;">${itemsAgrupados.length} ${itemsAgrupados.length === 1 ? "Trabajo" : "Trabajos"}</span>`;

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
                ${itemsAgrupados.map(c => {
                  const idsCsv = c.ids ? c.ids.join(",") : c.id;
                  return `
                  <tr>
                    <td data-label="Acción" style="width:1%; white-space:nowrap;">
                      <div class="cal-actions-grid">
                        <button type="button" class="btn-secondary btn-cal-terminar" data-id="${c.id}" data-ids="${idsCsv}" style="width:auto; padding:5px 8px; border-color:var(--accent); color:var(--accent); cursor:pointer;">✅ Hecho</button>
                        <button type="button" class="btn-secondary btn-cal-kiosco" data-id="${c.id}" data-ids="${idsCsv}" data-batch="${escHtml(c.batch_id)}" style="width:auto; padding:5px 8px; cursor:pointer;" title="Modo Enfoque / Kiosko">▶️</button>
                        <button type="button" class="btn-secondary btn-cal-falla" data-id="${c.id}" style="width:auto; padding:5px 8px; border-color:var(--danger); color:var(--danger); cursor:pointer;" title="Reportar Falla">⚠️</button>
                        <button type="button" class="btn-secondary btn-nota-rapida" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}" style="width:auto; padding:5px 8px; cursor:pointer;" title="Nota">📝</button>
                        <button type="button" class="btn-secondary btn-crud-edit" data-table="prod_cola_calandrado" data-id="${c.id}" style="width:auto; padding:5px 8px; cursor:pointer;" title="Editar">✏️</button>
                        <button type="button" class="btn-secondary btn-crud-del" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}" data-ids="${idsCsv}" style="width:auto; padding:5px 8px; cursor:pointer;" title="Eliminar">🗑️</button>
                      </div>
                    </td>
                    <td data-label="Fecha">${fmtDateHora(c.fecha_hora)}</td>
                    <td data-label="Cliente/Archivo">
                      ${c.es_anidado ? `<span class="badge activo" style="font-size:10px; margin-bottom:4px; display:inline-block;">📦 ANIDADO (${c.archivos.length} archivos)</span><br>` : ""}
                      ${formatearAnidadosHTML(c.cliente_archivo)}
                    </td>
                    <td data-label="Diseño" style="text-align:center;">${renderCarruselCalandrado(c)}</td>
                    <td data-label="Tela">${escHtml(c.tela_destino || "")}</td>
                    <td data-label="Nº Rollo">${escHtml(c.num_rollo_tela || "")}</td>
                    <td data-label="Color">${escHtml(c.color_tela || "")}</td>
                    <td data-label="Metros" style="color:var(--danger); font-weight:bold;">${fmtNum(c.metros)}m</td>
                    <td data-label="Perfil">${escHtml(c.perfil || "")}</td>
                    <td data-label="Notas">${c.observaciones ? `<span style="color:var(--accent-orange); font-weight:bold;">📝 ${escHtml(c.observaciones)}</span>` : "-"}</td>
                  </tr>
                `;}).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
    contRollos.innerHTML = html;
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
      const listaAgrupada = agruparCalandradoPorBatch(listaRollo);
      const estaCerrado = STATE.rollosHistCalCerrados.has(rId);
      const icono = estaCerrado ? "▶" : "▼";

      htmlHist += `
        <tr class="tr-toggle-hist-cal" data-rollo-hist="${escHtml(rId)}" style="cursor:pointer; background:#111;">
          <td colspan="11" style="border-top:1px solid #00E676; border-bottom:1px solid #00E676; color:#00E676; text-align:center; font-weight:bold; padding:8px;">
            ${icono} ROLLO CERRADO: ${escHtml(rId)} (${listaAgrupada.length} trab.) | TOTAL DEL ROLLO: ${fmtNum(totRollo)}m <span style="font-size:10px; color:#888; margin-left:6px;">(clic para mostrar/ocultar)</span>
          </td>
        </tr>
      `;

      if (!estaCerrado) {
        listaAgrupada.forEach(c => {
          const idsCsv = c.ids ? c.ids.join(",") : c.id;
          htmlHist += `
            <tr>
              <td data-label="Acción" style="width:1%; white-space:nowrap;">
                <div class="cal-actions-grid">
                  <button type="button" class="btn-cal-reabrir" data-id="${c.id}" data-ids="${idsCsv}" style="background:transparent; border:1px solid #aaa; color:#aaa; border-radius:4px; cursor:pointer; padding:4px 6px;" title="Deshacer">🔙</button>
                  <button type="button" class="btn-nota-rapida" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}" style="background:transparent; border:1px solid var(--accent-orange); color:var(--accent-orange); border-radius:4px; cursor:pointer; padding:4px 6px;" title="Nota">📝</button>
                  <button type="button" class="btn-imp-etiqueta" data-rollo="${escHtml(rId)}" data-metros="${fmtNum(c.metros)}" style="background:var(--accent-blue); border:1px solid var(--accent-blue); color:#fff; border-radius:4px; cursor:pointer; padding:4px 6px;" title="Etiqueta">🖨️</button>
                  <button type="button" class="btn-crud-edit" data-table="prod_cola_calandrado" data-id="${c.id}" style="background:transparent; border:1px solid var(--accent-blue); color:var(--accent-blue); border-radius:4px; cursor:pointer; padding:4px 6px;" title="Editar">✏️</button>
                  <button type="button" class="btn-crud-del" data-table="prod_cola_calandrado" data-id="${c.id}" data-batch="${escHtml(c.batch_id)}" data-ids="${idsCsv}" style="background:transparent; border:1px solid var(--danger); color:var(--danger); border-radius:4px; cursor:pointer; padding:4px 6px;" title="Eliminar">🗑️</button>
                </div>
              </td>
              <td data-label="Fecha">${fmtDateHora(c.fecha_terminado || c.fecha_hora)}</td>
              <td data-label="Cliente/Archivo">
                ${c.es_anidado ? `<span class="badge activo" style="font-size:10px; margin-bottom:4px; display:inline-block;">📦 ANIDADO (${c.archivos.length} archivos)</span><br>` : ""}
                ${formatearAnidadosHTML(c.cliente_archivo)}
              </td>
              <td data-label="Diseño" style="text-align:center;">${renderCarruselCalandrado(c)}</td>
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
        file_ids: String(r.file_id || "").split(",").filter(Boolean),
        file_id: r.file_id || "",
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
      const nuevosFids = String(r.file_id || "").split(",").filter(Boolean);
      nuevosFids.forEach(fid => { if (!g.file_ids.includes(fid)) g.file_ids.push(fid); });
      if (!g.file_id && r.file_id) g.file_id = r.file_id;
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
            <button type="button" class="btn-laser-kiosco-lote" data-batch="${escHtml(g.batch_id)}" data-ids="${g.ids.join(",")}" style="background:#00E676; color:#000; font-weight:900; border:none; padding:5px 9px; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;" title="Iniciar en Modo Kiosko Láser">⚡ Kiosko</button>
            <button type="button" class="btn-main btn-laser-cortar-lote" data-batch="${escHtml(g.batch_id)}" data-ids="${g.ids.join(",")}" style="width:auto; padding:5px 10px; font-size:11px; margin:0; background:#2196F3;">
              Cortar ${esAnidado ? `(${g.archivos.length})` : ""}
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
// MÓDULO 5: TELAS, FICHAS TÉCNICAS Y PARÁMETROS RELACIONALES
// ============================================================================

export function normalizarTextoBusqueda(str = "") {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function buscarFichaTelaPorNombre(nombreRaw = "") {
  if (!nombreRaw) return null;
  const buscado = normalizarTextoBusqueda(nombreRaw);
  if (!buscado || buscado === "-") return null;

  // 1. Coincidencia exacta con nombre comercial o código
  let encontrada = (STATE.telasFicha || []).find(t => {
    const nom = normalizarTextoBusqueda(t.nombre_comercial);
    const cod = normalizarTextoBusqueda(t.codigo_tela);
    return nom === buscado || cod === buscado;
  });
  if (encontrada) return encontrada;

  // 2. Coincidencia en array alias_busqueda
  encontrada = (STATE.telasFicha || []).find(t => {
    if (Array.isArray(t.alias_busqueda)) {
      return t.alias_busqueda.some(a => {
        const aNorm = normalizarTextoBusqueda(a);
        return aNorm === buscado || buscado.includes(aNorm) || aNorm.includes(buscado);
      });
    }
    return false;
  });
  if (encontrada) return encontrada;

  // 3. Coincidencia por subcadena
  encontrada = (STATE.telasFicha || []).find(t => {
    const nom = normalizarTextoBusqueda(t.nombre_comercial);
    return buscado.includes(nom) || nom.includes(buscado);
  });
  return encontrada || null;
}

export function obtenerVarianteYParametrosTela(telaId, varianteId = null) {
  let variante = null;
  if (varianteId) {
    variante = (STATE.telasVariantes || []).find(v => v.id === varianteId) || null;
  }
  if (!variante) {
    variante = (STATE.telasVariantes || []).find(v => v.tela_id === telaId && v.es_predeterminada) ||
               (STATE.telasVariantes || []).find(v => v.tela_id === telaId) || null;
  }
  const parametros = variante
    ? ((STATE.telasParametros || []).find(p => p.variante_id === variante.id) || null)
    : null;
  return { variante, parametros };
}

function renderModuloTelas() {
  const tbody = document.getElementById("tbodyTelasFichas");
  if (!tbody) return;

  const telas = STATE.telasFicha || [];
  const variantes = STATE.telasVariantes || [];
  const parametros = STATE.telasParametros || [];
  const historial = STATE.historialAnchosTelas || [];

  // 1. Cálculo de KPIs
  const totalTelas = telas.length;
  const totalVariantes = variantes.length;

  const rindesValidos = variantes.map(v => Number(v.rinde_mts_kg)).filter(n => n > 0);
  const rindeProm = rindesValidos.length > 0 ? (rindesValidos.reduce((a, b) => a + b, 0) / rindesValidos.length).toFixed(2) : "0.00";

  // Ancho más común
  const mapaAnchos = {};
  variantes.forEach(v => {
    const a = Number(v.ancho_real_m || 0).toFixed(2);
    if (Number(a) > 0) mapaAnchos[a] = (mapaAnchos[a] || 0) + 1;
  });
  let anchoComun = "1.50 m";
  let maxCountAncho = 0;
  for (const [anch, cant] of Object.entries(mapaAnchos)) {
    if (cant > maxCountAncho) {
      maxCountAncho = cant;
      anchoComun = `${anch} m`;
    }
  }

  // Promedios calandra y láser
  const tempsCal = parametros.map(p => Number(p.calandra_temp_c)).filter(n => n > 0);
  const tempCalProm = tempsCal.length > 0 ? `${Math.round(tempsCal.reduce((a, b) => a + b, 0) / tempsCal.length)} °C` : "-";

  const velsCal = parametros.map(p => Number(p.calandra_vel_m_min)).filter(n => n > 0);
  const velCalProm = velsCal.length > 0 ? `${Math.round(velsCal.reduce((a, b) => a + b, 0) / velsCal.length)} m/min` : "-";

  const velsLaser = parametros.map(p => Number(p.laser_vel_mm_s)).filter(n => n > 0);
  const velLaserProm = velsLaser.length > 0 ? `${Math.round(velsLaser.reduce((a, b) => a + b, 0) / velsLaser.length)} mm/s` : "-";

  const poderLaser = parametros.map(p => Number(p.laser_poder_pct)).filter(n => n > 0);
  const poderLaserProm = poderLaser.length > 0 ? `${Math.round(poderLaser.reduce((a, b) => a + b, 0) / poderLaser.length)} %` : "-";

  setTxt("kpiTelasActivas", totalTelas);
  setTxt("kpiTelasVariantes", totalVariantes);
  setTxt("kpiTelasRindeProm", `${rindeProm} m/kg`);
  setTxt("kpiTelasAnchoComun", anchoComun);
  setTxt("kpiTelasTempProm", tempCalProm);
  setTxt("kpiTelasVelProm", velCalProm);
  setTxt("kpiTelasVelLaserProm", velLaserProm);
  setTxt("kpiTelasPoderLaserProm", poderLaserProm);

  // 2. Filtrado de la tabla
  const filtro = normalizarTextoBusqueda(STATE.filtroTelasLocal);
  const telasFiltradas = telas.filter(t => {
    if (!filtro) return true;
    const matchNom = normalizarTextoBusqueda(t.nombre_comercial).includes(filtro);
    const matchCod = normalizarTextoBusqueda(t.codigo_tela).includes(filtro);
    const matchComp = normalizarTextoBusqueda(t.composicion).includes(filtro);
    const matchObs = normalizarTextoBusqueda(t.observaciones).includes(filtro);
    const matchAlias = Array.isArray(t.alias_busqueda) && t.alias_busqueda.some(a => normalizarTextoBusqueda(a).includes(filtro));
    return matchNom || matchCod || matchComp || matchObs || matchAlias;
  });

  if (telasFiltradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:15px; color:#888;">No se encontraron telas con el filtro especificado.</td></tr>`;
    return;
  }

  tbody.innerHTML = telasFiltradas.map(t => {
    const { variante, parametros: param } = obtenerVarianteYParametrosTela(t.id);
    const varsDeTela = variantes.filter(v => v.tela_id === t.id);

    // Revisar aprendizaje de anchos de esta tela
    const histDeTela = historial.filter(h => h.tela_id === t.id || normalizarTextoBusqueda(h.nombre_tela_raw) === normalizarTextoBusqueda(t.nombre_comercial));
    let badgeAprendizaje = "";
    if (histDeTela.length > 0) {
      const anchosAprendidos = histDeTela.map(h => Number(h.ancho_archivo_impreso) + 0.02).filter(n => n > 0);
      if (anchosAprendidos.length > 0) {
        const promAprendido = (anchosAprendidos.reduce((a, b) => a + b, 0) / anchosAprendidos.length).toFixed(2);
        badgeAprendizaje = `<span style="display:inline-block; font-size:10px; background:rgba(0,230,118,0.15); color:#00E676; border:1px solid #00E676; padding:1px 5px; border-radius:4px; margin-top:3px;" title="Ancho aprendido de ${histDeTela.length} impresiones">🧠 ~${promAprendido}m</span>`;
      }
    }

    const anchoReal = variante ? Number(variante.ancho_real_m).toFixed(2) : "-";
    const anchoImp = variante ? Number(variante.ancho_impresion_sugerido_m).toFixed(2) : "-";
    const rinde = variante && Number(variante.rinde_mts_kg) > 0 ? `${Number(variante.rinde_mts_kg).toFixed(2)} m/kg` : "-";
    const encog = variante && Number(variante.encogimiento_largo_pct) > 0 ? `${variante.encogimiento_largo_pct}%` : "-";
    const partidaNom = variante ? (variante.codigo_partida || "Estándar") : "Estándar";

    const calStr = param
      ? `<strong style="color:var(--accent-orange);">${param.calandra_temp_c || 205}°C</strong> | <span style="color:#00E676;">${param.calandra_vel_m_min || 50} m/min</span>`
      : `<span style="color:#666;">Sin calibrar</span>`;

    const laserStr = param
      ? `<strong style="color:#38BDF8;">${param.laser_vel_mm_s || 300} mm/s</strong> | <span style="color:#ff4081;">${param.laser_poder_pct || 85}%</span>`
      : `<span style="color:#666;">Sin calibrar</span>`;

    const badgePartidas = varsDeTela.length > 1
      ? `<span class="badge" style="background:rgba(33,150,243,0.15); color:#2196F3; border:1px solid #2196F3; font-size:10px; margin-left:6px;" title="${varsDeTela.length} partidas registradas">${varsDeTela.length} partidas</span>`
      : "";

    return `
      <tr>
        <td data-label="Acción" style="white-space:nowrap;">
          <div style="display:flex; gap:4px; align-items:center;">
            <button type="button" class="btn-tela-ficha" data-tela-id="${t.id}" style="background:#1b2130; border:1px solid #2196F3; color:#2196F3; border-radius:4px; font-size:11px; font-weight:bold; padding:4px 8px; cursor:pointer;" title="Ver Ficha Técnica Completa">ℹ️ Ficha</button>
            <button type="button" class="btn-tela-edit" data-tela-id="${t.id}" style="background:transparent; border:1px solid #00E676; color:#00E676; border-radius:4px; font-size:11px; padding:4px 8px; cursor:pointer;" title="Editar Parámetros">✏️</button>
            <button type="button" class="btn-tela-add-partida" data-tela-id="${t.id}" style="background:transparent; border:1px solid var(--accent-orange); color:var(--accent-orange); border-radius:4px; font-size:10px; padding:4px 6px; cursor:pointer;" title="Añadir Variante o Partida Especial">+ Partida</button>
            <button type="button" class="btn-tela-del" data-tela-id="${t.id}" style="background:transparent; border:1px solid var(--danger); color:var(--danger); border-radius:4px; font-size:11px; padding:4px 6px; cursor:pointer;" title="Archivar Tela">🗑️</button>
          </div>
        </td>
        <td data-label="Código"><code style="background:#1a1c23; color:#38BDF8; padding:2px 6px; border-radius:4px; font-size:11px;">${escHtml(t.codigo_tela || "-")}</code></td>
        <td data-label="Nombre Comercial">
          <strong style="color:#fff; font-size:13px;">${escHtml(t.nombre_comercial)}</strong>
          ${badgePartidas}
        </td>
        <td data-label="Composición" style="color:#bbb; font-size:12px;">${escHtml(t.composicion || "-")}</td>
        <td data-label="Ancho Real" style="font-weight:bold; color:#00E676;">
          ${anchoReal} m
          ${badgeAprendizaje}
        </td>
        <td data-label="Ancho Impresión" style="color:#38BDF8; font-weight:bold;">${anchoImp} m</td>
        <td data-label="Rinde (m/kg)">${rinde}</td>
        <td data-label="Encogimiento">${encog}</td>
        <td data-label="🔥 Calandrado" style="white-space:nowrap;">${calStr}</td>
        <td data-label="⚡ Corte Láser" style="white-space:nowrap;">${laserStr}</td>
        <td data-label="Partida"><span class="badge activo" style="font-size:10.5px;">${escHtml(partidaNom)}</span></td>
        <td data-label="Observaciones" style="font-size:11.5px; color:#aaa; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(t.observaciones || "")}">${escHtml(t.observaciones || "-")}</td>
      </tr>
    `;
  }).join("");
}

export function abrirModalFichaRapidaTela(idONombre) {
  if (!idONombre) return;
  const tela = (STATE.telasFicha || []).find(t => t.id === idONombre) || buscarFichaTelaPorNombre(idONombre);
  if (!tela) {
    toast(`No se encontró ficha técnica para: ${idONombre}`, "warn");
    return;
  }

  const { variante, parametros: param } = obtenerVarianteYParametrosTela(tela.id);
  const varsDeTela = (STATE.telasVariantes || []).filter(v => v.tela_id === tela.id);
  const histDeTela = (STATE.historialAnchosTelas || []).filter(h => h.tela_id === tela.id || normalizarTextoBusqueda(h.nombre_tela_raw) === normalizarTextoBusqueda(tela.nombre_comercial)).slice(0, 5);

  setTxt("fichaRapidaNombre", tela.nombre_comercial);

  const container = document.getElementById("fichaRapidaBody");
  if (!container) return;

  const anchoReal = variante ? Number(variante.ancho_real_m).toFixed(2) : "1.50";
  const anchoImp = variante ? Number(variante.ancho_impresion_sugerido_m).toFixed(2) : "1.48";
  const rinde = variante && Number(variante.rinde_mts_kg) > 0 ? `${Number(variante.rinde_mts_kg).toFixed(2)} m/kg` : "-";
  const gramaje = variante && Number(variante.gramaje_gsm) > 0 ? `${Number(variante.gramaje_gsm).toFixed(0)} g/m²` : "-";
  const encog = variante ? `${variante.encogimiento_largo_pct || 2}% (largo) / ${variante.encogimiento_ancho_pct || 1}% (ancho)` : "-";

  const tempCal = param ? (param.calandra_temp_c || 205) : 205;
  const velCal = param ? (param.calandra_vel_m_min || 50) : 50;
  const presCal = param ? (param.calandra_presion_bar || 4) : 4;
  const velLaser = param ? (param.laser_vel_mm_s || 300) : 300;
  const podLaser = param ? (param.laser_poder_pct || 85) : 85;
  const precauciones = (param && param.precauciones) || tela.observaciones || "Mantener tensión regular y rollo centrado en calandra.";

  container.innerHTML = `
    <div style="background:#181c26; padding:12px; border-radius:8px; border:1px solid #2a324b; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <span style="font-size:12px; color:#aaa;">Código: <code style="color:#38BDF8; font-weight:bold;">${escHtml(tela.codigo_tela || "-")}</code></span>
        <span style="font-size:12px; color:#aaa;">Composición: <strong style="color:#fff;">${escHtml(tela.composicion || "100% Poliéster")}</strong></span>
      </div>
      ${Array.isArray(tela.alias_busqueda) && tela.alias_busqueda.length > 0 ? `
        <div style="font-size:11px; color:#888; margin-top:6px;">
          Alias reconocidos: <span style="color:#bbb;">${tela.alias_busqueda.map(a => `<code>${escHtml(a)}</code>`).join(" ")}</span>
        </div>
      ` : ""}
    </div>

    <div style="background:#141720; padding:12px; border-radius:8px; border:1px solid #2a324b; margin-bottom:12px;">
      <h3 style="margin:0 0 10px 0; font-size:12px; color:#2196F3; text-transform:uppercase; letter-spacing:0.5px;">📐 Geometría y Propiedades Físicas</h3>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
        <div style="background:#0f1118; padding:8px; border-radius:6px; border:1px solid #222;">
          <div style="font-size:10px; color:#888;">ANCHO REAL TELA</div>
          <div style="font-size:17px; font-weight:900; color:#00E676; margin-top:2px;">${anchoReal} m</div>
        </div>
        <div style="background:#0f1118; padding:8px; border-radius:6px; border:1px solid #222;">
          <div style="font-size:10px; color:#888;">ANCHO IMPRESIÓN (2cm menos)</div>
          <div style="font-size:17px; font-weight:900; color:#38BDF8; margin-top:2px;">${anchoImp} m</div>
        </div>
        <div style="background:#0f1118; padding:8px; border-radius:6px; border:1px solid #222;">
          <div style="font-size:10px; color:#888;">RINDE METROS/KG</div>
          <div style="font-size:16px; font-weight:bold; color:#fff; margin-top:2px;">${rinde}</div>
        </div>
        <div style="background:#0f1118; padding:8px; border-radius:6px; border:1px solid #222;">
          <div style="font-size:10px; color:#888;">GRAMAJE APROX.</div>
          <div style="font-size:16px; font-weight:bold; color:#fff; margin-top:2px;">${gramaje}</div>
        </div>
      </div>
      <div style="font-size:11px; color:#aaa; margin-top:8px;">
        Encogimiento estimado: <strong style="color:#ff9800;">${encog}</strong>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px;">
      <div style="background:rgba(255,152,0,0.06); border:1.5px solid rgba(255,152,0,0.3); border-radius:8px; padding:12px;">
        <h4 style="margin:0 0 8px 0; color:var(--accent-orange); font-size:12px; display:flex; align-items:center; gap:5px;">
          🔥 CALANDRADO
        </h4>
        <div style="font-size:11.5px; line-height:1.6; color:#ccc;">
          <div>Temp: <strong style="color:var(--accent-orange); font-size:15px;">${tempCal} °C</strong></div>
          <div>Velocidad: <strong style="color:#00E676; font-size:15px;">${velCal} m/min</strong></div>
          <div>Presión: <strong style="color:#fff;">${presCal} bar</strong></div>
        </div>
      </div>

      <div style="background:rgba(56,189,248,0.06); border:1.5px solid rgba(56,189,248,0.3); border-radius:8px; padding:12px;">
        <h4 style="margin:0 0 8px 0; color:#38BDF8; font-size:12px; display:flex; align-items:center; gap:5px;">
          ⚡ CORTE LÁSER
        </h4>
        <div style="font-size:11.5px; line-height:1.6; color:#ccc;">
          <div>Velocidad: <strong style="color:#38BDF8; font-size:15px;">${velLaser} mm/s</strong></div>
          <div>Potencia: <strong style="color:#ff4081; font-size:15px;">${podLaser} %</strong></div>
        </div>
      </div>
    </div>

    <div style="background:#161922; border-left:4px solid #ff9800; padding:10px 12px; border-radius:6px; margin-bottom:12px; font-size:12px; color:#ddd;">
      <strong style="color:#ff9800;">⚠️ Precauciones y Recomendaciones:</strong>
      <div style="margin-top:4px;">${escHtml(precauciones)}</div>
    </div>

    ${histDeTela.length > 0 ? `
      <div style="background:#10131a; border:1px solid #232a3b; border-radius:6px; padding:10px; margin-bottom:12px;">
        <span style="font-size:11px; font-weight:bold; color:#00E676;">🧠 Aprendizaje Automático de Anchos (Últimas mediciones):</span>
        <div style="margin-top:6px; font-size:11.5px; color:#aaa; line-height:1.6;">
          ${histDeTela.map(h => `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #1a202c; padding:3px 0;">
              <span>Impresión: <strong style="color:#38BDF8;">${Number(h.ancho_archivo_impreso).toFixed(2)}m</strong> ➔ Tela real estimada: <strong style="color:#00E676;">${(Number(h.ancho_archivo_impreso) + 0.02).toFixed(2)}m</strong></span>
              <span style="color:#666; font-size:10.5px;">${fmtDateHora(h.fecha)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}

    ${varsDeTela.length > 1 ? `
      <div style="background:#10131a; border:1px solid #232a3b; border-radius:6px; padding:10px;">
        <span style="font-size:11px; font-weight:bold; color:#2196F3;">📦 Partidas / Variantes adicionales (${varsDeTela.length}):</span>
        <div style="margin-top:6px; font-size:11px; color:#bbb;">
          ${varsDeTela.map(v => `
            <span style="display:inline-block; background:#1b2130; border:1px solid #334155; padding:2px 8px; border-radius:4px; margin-right:6px; margin-bottom:4px;">
              ${escHtml(v.codigo_partida)} (${v.ancho_real_m}m | Rinde: ${v.rinde_mts_kg}m/kg) ${v.es_predeterminada ? "⭐ Predet." : ""}
            </span>
          `).join("")}
        </div>
      </div>
    ` : ""}
  `;

  document.getElementById("modalTelaFichaRapida").classList.add("open");
}

export function abrirModalTelaCrud(telaId = null, modo = "editar") {
  const modal = document.getElementById("modalTelaCrud");
  if (!modal) return;

  const inpId = document.getElementById("telaInputId");
  const inpModo = document.getElementById("telaInputModo");
  const titulo = document.getElementById("modalTelaCrudTitle");

  if (inpId) inpId.value = telaId || "";
  if (inpModo) inpModo.value = modo;

  if (modo === "crear") {
    if (titulo) titulo.textContent = "✨ Nueva Ficha Técnica de Tela";
    document.getElementById("telaInputNombre").value = "";
    document.getElementById("telaInputNombre").readOnly = false;
    document.getElementById("telaInputCodigo").value = `TEL-${Date.now().toString().slice(-6)}`;
    document.getElementById("telaInputComposicion").value = "100% Poliéster";
    document.getElementById("telaInputPartida").value = "Estándar";
    document.getElementById("telaInputRinde").value = "3.50";
    document.getElementById("telaInputAnchoReal").value = "1.50";
    document.getElementById("telaInputAnchoImp").value = "1.48";
    document.getElementById("telaInputGramaje").value = "160";
    document.getElementById("telaInputEncogimiento").value = "2.0";
    document.getElementById("telaInputTempCal").value = "205";
    document.getElementById("telaInputVelCal").value = "50";
    document.getElementById("telaInputVelLaser").value = "300";
    document.getElementById("telaInputPoderLaser").value = "85";
    document.getElementById("telaInputObs").value = "";
  } else if (modo === "nueva_partida") {
    const tela = (STATE.telasFicha || []).find(t => t.id === telaId);
    if (!tela) return;
    if (titulo) titulo.textContent = `➕ Nueva Partida / Variante: ${tela.nombre_comercial}`;
    document.getElementById("telaInputNombre").value = tela.nombre_comercial;
    document.getElementById("telaInputNombre").readOnly = true;
    document.getElementById("telaInputCodigo").value = tela.codigo_tela;
    document.getElementById("telaInputComposicion").value = tela.composicion || "100% Poliéster";
    document.getElementById("telaInputPartida").value = "Partida Especial 1.60m";
    document.getElementById("telaInputRinde").value = "3.20";
    document.getElementById("telaInputAnchoReal").value = "1.60";
    document.getElementById("telaInputAnchoImp").value = "1.58";
    document.getElementById("telaInputGramaje").value = "180";
    document.getElementById("telaInputEncogimiento").value = "2.0";
    document.getElementById("telaInputTempCal").value = "205";
    document.getElementById("telaInputVelCal").value = "48";
    document.getElementById("telaInputVelLaser").value = "300";
    document.getElementById("telaInputPoderLaser").value = "85";
    document.getElementById("telaInputObs").value = `Partida alternativa con ancho especial.`;
  } else {
    // modo === "editar"
    const tela = (STATE.telasFicha || []).find(t => t.id === telaId);
    if (!tela) return;
    const { variante, parametros: param } = obtenerVarianteYParametrosTela(tela.id);

    if (titulo) titulo.textContent = `✏️ Editar Ficha: ${tela.nombre_comercial}`;
    document.getElementById("telaInputNombre").value = tela.nombre_comercial;
    document.getElementById("telaInputNombre").readOnly = false;
    document.getElementById("telaInputCodigo").value = tela.codigo_tela || "";
    document.getElementById("telaInputComposicion").value = tela.composicion || "";
    document.getElementById("telaInputPartida").value = variante ? (variante.codigo_partida || "Estándar") : "Estándar";
    document.getElementById("telaInputRinde").value = variante ? (variante.rinde_mts_kg || "") : "";
    document.getElementById("telaInputAnchoReal").value = variante ? (variante.ancho_real_m || "1.50") : "1.50";
    document.getElementById("telaInputAnchoImp").value = variante ? (variante.ancho_impresion_sugerido_m || "1.48") : "1.48";
    document.getElementById("telaInputGramaje").value = variante ? (variante.gramaje_gsm || "") : "";
    document.getElementById("telaInputEncogimiento").value = variante ? (variante.encogimiento_largo_pct || "") : "";
    document.getElementById("telaInputTempCal").value = param ? (param.calandra_temp_c || "205") : "205";
    document.getElementById("telaInputVelCal").value = param ? (param.calandra_vel_m_min || "50") : "50";
    document.getElementById("telaInputVelLaser").value = param ? (param.laser_vel_mm_s || "300") : "300";
    document.getElementById("telaInputPoderLaser").value = param ? (param.laser_poder_pct || "85") : "85";
    document.getElementById("telaInputObs").value = tela.observaciones || (param ? param.precauciones : "") || "";
  }

  modal.classList.add("open");
}

export async function guardarTelaCrud() {
  const inpId = document.getElementById("telaInputId")?.value;
  const modo = document.getElementById("telaInputModo")?.value || "editar";

  const nombre = document.getElementById("telaInputNombre")?.value.trim();
  const codigo = document.getElementById("telaInputCodigo")?.value.trim();
  const composicion = document.getElementById("telaInputComposicion")?.value.trim() || "100% Poliéster";
  const partida = document.getElementById("telaInputPartida")?.value.trim() || "Estándar";
  const rinde = parseFloat(document.getElementById("telaInputRinde")?.value) || 3.50;
  const anchoReal = parseFloat(document.getElementById("telaInputAnchoReal")?.value) || 1.50;
  const anchoImp = parseFloat(document.getElementById("telaInputAnchoImp")?.value) || Math.max(0.5, anchoReal - 0.02);
  const gramaje = parseFloat(document.getElementById("telaInputGramaje")?.value) || 160;
  const encog = parseFloat(document.getElementById("telaInputEncogimiento")?.value) || 2.0;

  const tempCal = parseFloat(document.getElementById("telaInputTempCal")?.value) || 205;
  const velCal = parseFloat(document.getElementById("telaInputVelCal")?.value) || 50;
  const velLaser = parseFloat(document.getElementById("telaInputVelLaser")?.value) || 300;
  const podLaser = parseFloat(document.getElementById("telaInputPoderLaser")?.value) || 85;
  const obs = document.getElementById("telaInputObs")?.value.trim() || "";

  if (!nombre) {
    toast("El nombre comercial de la tela es obligatorio.", "warn");
    return;
  }

  toast("⏳ Guardando ficha técnica de tela...", "info");

  try {
    if (modo === "crear") {
      const { data: nuevaTela, error: errTela } = await sb().from("prod_telas_ficha").insert({
        empresa_id: "vvgrafic-principal",
        codigo_tela: codigo || `TEL-${Date.now().toString().slice(-6)}`,
        nombre_comercial: nombre,
        alias_busqueda: [nombre.toUpperCase(), codigo ? codigo.toUpperCase() : ""].filter(Boolean),
        composicion,
        observaciones: obs,
        activo: true
      }).select().single();

      if (errTela) throw errTela;

      const { data: nuevaVar, error: errVar } = await sb().from("prod_telas_variantes").insert({
        tela_id: nuevaTela.id,
        empresa_id: "vvgrafic-principal",
        codigo_partida: partida,
        ancho_real_m: anchoReal,
        ancho_impresion_sugerido_m: anchoImp,
        gramaje_gsm: gramaje,
        rinde_mts_kg: rinde,
        encogimiento_largo_pct: encog,
        encogimiento_ancho_pct: 1.0,
        es_predeterminada: true,
        observaciones: obs
      }).select().single();

      if (errVar) throw errVar;

      const { error: errParam } = await sb().from("prod_telas_parametros").insert({
        variante_id: nuevaVar.id,
        empresa_id: "vvgrafic-principal",
        calandra_temp_c: tempCal,
        calandra_vel_m_min: velCal,
        calandra_presion_bar: 4.0,
        laser_vel_mm_s: velLaser,
        laser_poder_pct: podLaser,
        precauciones: obs
      });

      if (errParam) throw errParam;

      toast(`✅ Tela "${nombre}" creada y calibrada con éxito.`);
    } else if (modo === "nueva_partida") {
      const { data: nuevaVar, error: errVar } = await sb().from("prod_telas_variantes").insert({
        tela_id: inpId,
        empresa_id: "vvgrafic-principal",
        codigo_partida: partida,
        ancho_real_m: anchoReal,
        ancho_impresion_sugerido_m: anchoImp,
        gramaje_gsm: gramaje,
        rinde_mts_kg: rinde,
        encogimiento_largo_pct: encog,
        encogimiento_ancho_pct: 1.0,
        es_predeterminada: false,
        observaciones: obs
      }).select().single();

      if (errVar) throw errVar;

      await sb().from("prod_telas_parametros").insert({
        variante_id: nuevaVar.id,
        empresa_id: "vvgrafic-principal",
        calandra_temp_c: tempCal,
        calandra_vel_m_min: velCal,
        calandra_presion_bar: 4.0,
        laser_vel_mm_s: velLaser,
        laser_poder_pct: podLaser,
        precauciones: obs
      });

      toast(`✅ Partida "${partida}" añadida a la tela.`);
    } else {
      await sb().from("prod_telas_ficha").update({
        nombre_comercial: nombre,
        codigo_tela: codigo,
        composicion,
        observaciones: obs
      }).eq("id", inpId);

      const { variante } = obtenerVarianteYParametrosTela(inpId);
      if (variante) {
        await sb().from("prod_telas_variantes").update({
          codigo_partida: partida,
          ancho_real_m: anchoReal,
          ancho_impresion_sugerido_m: anchoImp,
          gramaje_gsm: gramaje,
          rinde_mts_kg: rinde,
          encogimiento_largo_pct: encog,
          observaciones: obs
        }).eq("id", variante.id);

        const paramExistente = (STATE.telasParametros || []).find(p => p.variante_id === variante.id);
        if (paramExistente) {
          await sb().from("prod_telas_parametros").update({
            calandra_temp_c: tempCal,
            calandra_vel_m_min: velCal,
            laser_vel_mm_s: velLaser,
            laser_poder_pct: podLaser,
            precauciones: obs
          }).eq("id", paramExistente.id);
        } else {
          await sb().from("prod_telas_parametros").insert({
            variante_id: variante.id,
            empresa_id: "vvgrafic-principal",
            calandra_temp_c: tempCal,
            calandra_vel_m_min: velCal,
            calandra_presion_bar: 4.0,
            laser_vel_mm_s: velLaser,
            laser_poder_pct: podLaser,
            precauciones: obs
          });
        }
      }
      toast(`✅ Ficha de "${nombre}" actualizada.`);
    }

    document.getElementById("modalTelaCrud").classList.remove("open");
    await cargarDatosTodo();
  } catch (err) {
    console.error("Error al guardar tela:", err);
    toast("Error: " + (err.message || err), "error");
  }
}

export async function eliminarTela(telaId) {
  const tela = (STATE.telasFicha || []).find(t => t.id === telaId);
  if (!tela) return;

  if (!confirm(`¿Archivar la tela "${tela.nombre_comercial}" y sus variantes asociadas?`)) {
    return;
  }

  try {
    const { error } = await sb().from("prod_telas_ficha").update({ activo: false }).eq("id", telaId);
    if (error) throw error;
    toast(`🗑️ Tela "${tela.nombre_comercial}" archivada.`);
    await cargarDatosTodo();
  } catch (err) {
    toast("Error al archivar tela: " + err.message, "error");
  }
}

// ============================================================================
// MÓDULOS 6 Y 7: FINANZAS Y BITÁCORA
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

  // Notificar al puente de Google Drive para mover físicamente los archivos a la subcarpeta IMPRESOS
  const bridgeUrl = window.VG_CONEXION?.sandboxBridgeUrl;
  if (bridgeUrl && fileIdsUnidos) {
    try {
      fetch(`${bridgeUrl}?action=mover_a_impresos&file_ids=${encodeURIComponent(fileIdsUnidos)}`, { mode: "no-cors" }).catch(() => {});
    } catch (_) {}
  }

  // APRENDIZAJE AUTOMÁTICO DE ANCHO DE TELA (Regla de 2cm)
  try {
    const telaFicha = buscarFichaTelaPorNombre(tela);
    if (telaFicha) {
      let anchoImpM = 0;
      for (const s of seleccionados) {
        if (s.ancho_estimado_m && Number(s.ancho_estimado_m) > 0) {
          anchoImpM = Math.max(anchoImpM, Number(s.ancho_estimado_m));
        } else if (s.nombre_archivo) {
          const matchW = s.nombre_archivo.match(/(\d+[\.,]?\d*)\s*[xX]/);
          if (matchW) {
            const w = parseFloat(matchW[1].replace(",", "."));
            if (w >= 50 && w <= 320) anchoImpM = Math.max(anchoImpM, w / 100);
            else if (w >= 0.5 && w <= 3.2) anchoImpM = Math.max(anchoImpM, w);
          }
        }
      }
      if (anchoImpM === 0) {
        const { variante } = obtenerVarianteYParametrosTela(telaFicha.id);
        if (variante) anchoImpM = Number(variante.ancho_impresion_sugerido_m || 1.48);
      }
      if (anchoImpM > 0) {
        await sb().from("prod_historial_anchos_tela").insert({
          empresa_id: "vvgrafic-principal",
          tela_id: telaFicha.id,
          nombre_tela_raw: tela || telaFicha.nombre_comercial,
          ancho_archivo_impreso: anchoImpM,
          metros_trabajo: metrosTotales
        });
      }
    }
  } catch (errLearn) {
    console.warn("Aviso en aprendizaje de anchos:", errLearn);
  }

  // SINCRONIZACIÓN ASÍNCRONA EN SEGUNDO PLANO CON GOOGLE SHEET VIEJA (0ms de espera para el operario)
  notificarSincronizacionSheetViejaEnSegundoPlano("IMPRESION", "NUEVA_IMPRESION", {
    batch_id: batchId,
    rollo_papel: infoRollo.bloqueActual,
    cliente_archivo: nombresUnidos,
    diseno: disenoInput || nombresUnidos.slice(0, 30),
    tela,
    num_rollo_tela: rolloTela,
    color,
    metros: metrosTotales,
    perfil,
    ruta,
    observaciones: obs
  });

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

async function finalizarTrabajoCalandrado(idCalOrCsv, minutosExtra = 0, skipReload = false, velocidad = null, temperatura = null, observacionNueva = null) {
  let ids = String(idCalOrCsv || "").split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return;

  const primerReg = STATE.colaCalandrado.find(c => ids.includes(c.id));
  if (!primerReg) return;

  // Si tiene batch_id, buscar todos los registros de la cola que pertenezcan a ese batch para terminarlos juntos
  if (primerReg.batch_id) {
    const hermanos = STATE.colaCalandrado.filter(c => c.batch_id === primerReg.batch_id && !String(c.estado).toLowerCase().includes("terminado"));
    hermanos.forEach(h => {
      if (!ids.includes(h.id)) ids.push(h.id);
    });
  }

  const regs = STATE.colaCalandrado.filter(c => ids.includes(c.id));
  const reg = regs[0] || primerReg;

  const inputFechaManual = document.getElementById("calInputFechaManual")?.value;
  const fechaFinIso = inputFechaManual ? new Date(inputFechaManual).toISOString() : new Date().toISOString();

  const totalMetros = regs.reduce((a, b) => a + (Number(b.metros) || 0), 0);
  const minTrabajados = minutosExtra || reg.minutos_trabajados || Math.max(5, Math.round(totalMetros * 1.2));

  let obsFinal = reg.observaciones || "";
  if (observacionNueva && String(observacionNueva).trim()) {
    const nLimpia = String(observacionNueva).trim();
    obsFinal = obsFinal && obsFinal !== "-" ? `${obsFinal} | ${nLimpia}` : nLimpia;
  }

  const updatePayload = {
    estado: "Terminado",
    fecha_terminado: fechaFinIso,
    minutos_trabajados: minTrabajados
  };
  if (velocidad !== null && !isNaN(velocidad)) updatePayload.velocidad = velocidad;
  if (temperatura !== null && !isNaN(temperatura)) updatePayload.temperatura = temperatura;
  if (obsFinal) updatePayload.observaciones = obsFinal;

  // Actualizar todos los registros del anidado en prod_cola_calandrado
  for (const id of ids) {
    await sb().from("prod_cola_calandrado").update(updatePayload).eq("id", id);
  }

  // Sincronización asíncrona en segundo plano con Sheet vieja (0ms de espera)
  const nombresUnidos = regs.map(r => r.cliente_archivo).filter(Boolean).join(" | ");
  notificarSincronizacionSheetViejaEnSegundoPlano("CALANDRADO", "TERMINADO", {
    id: reg.id,
    batch_id: reg.batch_id,
    rollo: reg.id_rollo_papel,
    cliente_archivo: nombresUnidos || reg.cliente_archivo,
    tela: reg.tela_destino,
    metros: totalMetros,
    ruta: reg.ruta,
    velocidad: updatePayload.velocidad || reg.velocidad || 50,
    temperatura: updatePayload.temperatura || reg.temperatura || 205,
    minutos: minTrabajados,
    estado: "Terminado",
    observaciones: obsFinal || reg.observaciones || ""
  });

  // Enrutar a Láser si la ruta lo indica
  const rLower = String(reg.ruta || "").toLowerCase();
  if (rLower.includes("laser") || rLower.includes("láser") || rLower.includes("corte")) {
    for (const rItem of regs) {
      await sb().from("prod_cola_laser").insert({
        empresa_id: "vvgrafic-principal",
        batch_id: rItem.batch_id || reg.batch_id || `BATCH-${Date.now()}`,
        fecha_ingreso: fechaFinIso,
        id_rollo_papel: rItem.id_rollo_papel || reg.id_rollo_papel,
        cliente_archivo: rItem.cliente_archivo,
        tela_rollo_color: `${rItem.tela_destino || reg.tela_destino || "-"} | ${rItem.num_rollo_tela || reg.num_rollo_tela || "-"} | ${rItem.color_tela || reg.color_tela || "Blanco"}`,
        metros: rItem.metros,
        ruta: rItem.ruta || reg.ruta,
        velocidad: 35,
        poder: 90,
        estado: "Pendiente",
        observaciones: obsFinal || rItem.observaciones || reg.observaciones || "",
        file_id: rItem.file_id || ""
      });
    }
  }

  if (!skipReload) {
    toast(`✅ Calandrado procesado (${fmtDateHoraLineal(fechaFinIso)}).`);
    await cargarDatosTodo();
  }
}

async function procesarRolloCompletoCalandrado(rolloId) {
  const pendientesRollo = STATE.colaCalandrado.filter(c => c.id_rollo_papel === rolloId && !String(c.estado).toLowerCase().includes("terminado"));
  if (pendientesRollo.length === 0) {
    toast(`No hay trabajos pendientes en el rollo ${rolloId}.`, "error");
    return;
  }

  const lotesAgrupados = agruparCalandradoPorBatch(pendientesRollo);

  const inputFechaManual = document.getElementById("calInputFechaManual")?.value;
  const msgFecha = inputFechaManual
    ? `con la fecha seleccionada (${fmtDateHoraLineal(new Date(inputFechaManual).toISOString())})`
    : `con fecha actual`;

  if (!confirm(`¿Procesar los ${lotesAgrupados.length} lote(s)/trabajo(s) del rollo ${rolloId} ${msgFecha}?`)) return;

  toast(`Procesando ${lotesAgrupados.length} lote(s)...`);
  for (const lote of lotesAgrupados) {
    const idsCsv = lote.ids ? lote.ids.join(",") : lote.id;
    await finalizarTrabajoCalandrado(idsCsv, 0, true);
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

  // Sincronización asíncrona en segundo plano con Sheet vieja (0ms de espera)
  const primerTrabLaser = (STATE.colaLaser || []).find(l => ids.includes(l.id));
  if (primerTrabLaser) {
    notificarSincronizacionSheetViejaEnSegundoPlano("LASER", "TERMINADO", {
      batch_id: primerTrabLaser.batch_id,
      rollo: primerTrabLaser.id_rollo_papel,
      cliente_archivo: primerTrabLaser.cliente_archivo,
      tela: primerTrabLaser.tela_rollo_color,
      metros: primerTrabLaser.metros,
      ruta: primerTrabLaser.ruta,
      velocidad: primerTrabLaser.velocidad,
      poder: primerTrabLaser.poder,
      estado: "Terminado"
    });
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
  const itemsAgrupados = agruparCalandradoPorBatch(items);
  const totalMts = itemsAgrupados.reduce((a, b) => a + (Number(b.metros) || 0), 0);
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
        ${itemsAgrupados.map(c => `
          <tbody class="job-group">
            <tr class="row-top">
              <td>${escHtml(c.id_rollo_papel || rolloId)}</td>
              <td colspan="8">
                ${c.es_anidado ? `[📦 ANIDADO ${c.archivos.length} ARCHIVOS] ` : ""}
                ${escHtml(c.cliente_archivo || "-")}
              </td>
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

async function eliminarRegistroCrudUniversal(tabla, id, batchId = null, idsCsv = null) {
  if (!confirm("¿Confirmás eliminar este registro?")) return;
  const pkCol = tabla === "prod_dtf_rollos" ? "id_rollo_dtf" : tabla === "prod_rollos_papel" ? "id_rollo" : "id";

  if (idsCsv && (tabla === "prod_impresiones" || tabla === "prod_cola_calandrado" || tabla === "prod_cola_laser")) {
    const ids = String(idsCsv).split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      await sb().from(tabla).delete().in("id", ids);
      toast("🗑️ Registro(s) eliminado(s).");
      await cargarDatosTodo();
      return;
    }
  } else if (batchId && (tabla === "prod_impresiones" || tabla === "prod_cola_calandrado" || tabla === "prod_cola_laser")) {
    await sb().from(tabla).delete().eq("batch_id", batchId);
    toast("🗑️ Lote eliminado.");
    await cargarDatosTodo();
    return;
  }

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

  const esLaser = STATE.kiosco.modulo === "laser";
  const rolloNombre = STATE.kiosco.rolloId || trabajos[0].batch_id || trabajos[0].id_rollo_papel || "Sin Identificador";
  const trabActual = trabajos[STATE.kiosco.indiceActual] || trabajos[0];

  const velDefault = esLaser ? 300 : 50;
  const param2Default = esLaser ? 85 : 205;
  const velActual = document.getElementById("kioscoInputVelocidad")?.value || trabActual.velocidad || velDefault;
  const tempActual = document.getElementById("kioscoInputTemperatura")?.value || (esLaser ? trabActual.poder : trabActual.temperatura) || param2Default;

  const pendientesRestantes = trabajos.filter(t => !STATE.kiosco.completadosIds.has(t.id) && !STATE.kiosco.descartadosIds.has(t.id));
  const totalM = pendientesRestantes.reduce((a, b) => a + (Number(b.metros_totales || b.metros) || 0), 0);

  // Limpieza de extensiones y sufijos técnicos redundantes para máxima legibilidad del operario
  const rawNombre = trabActual.cliente_archivo || trabActual.diseno || (trabActual.archivos ? trabActual.archivos.join(" | ") : "-");
  const nombreLimpio = String(rawNombre)
    .replace(/\.(jpg|jpeg|png|tif|tiff|pdf|ai|psd)$/i, "")
    .trim();

  const fileIds = (trabActual.file_ids && trabActual.file_ids.length > 0)
    ? trabActual.file_ids
    : String(trabActual.file_id || "").split(",").map(s => s.trim()).filter(Boolean);
  const thumbIdActual = fileIds.length > 0 ? extraerThumbIdDrive(fileIds[0]) : null;
  const driveUrlActual = thumbIdActual ? `https://drive.google.com/file/d/${escHtml(thumbIdActual)}/view` : null;
  const clickAttrActual = driveUrlActual ? `onclick="event.stopPropagation(); window.open('${driveUrlActual}', '_blank');" title="Tocar para ver en Drive"` : "";
  const fallbackThumbUrl = thumbIdActual ? `https://lh3.googleusercontent.com/d/${escHtml(thumbIdActual)}=s600` : "";

  const imgPreviewHtml = thumbIdActual
    ? `<div style="position:relative; width:100%; height:115px; background:#000; border:2px solid var(--accent-magenta); border-radius:8px; overflow:hidden; margin-bottom:6px; cursor:pointer;" ${clickAttrActual}>
        <img class="kiosk-preview-img" src="https://drive.google.com/thumbnail?id=${escHtml(thumbIdActual)}&sz=w600-h600" style="width:100%; height:100%; object-fit:contain; display:block;" onerror="if(this.src!=='${fallbackThumbUrl}'){this.src='${fallbackThumbUrl}';}else{this.style.display='none'; this.nextElementSibling.style.display='flex';}" />
        <div class="kiosk-preview-ph" style="display:none; width:100%; height:100%; position:absolute; top:0; left:0; align-items:center; justify-content:center; flex-direction:column; background:#111; color:#aaa; font-size:11px; font-weight:bold; padding:8px; text-align:center;">
          <span style="font-size:22px;">🖼️</span>
          <span style="margin-top:4px; max-width:90%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(nombreLimpio || "Ver en Drive")}</span>
        </div>
      </div>`
    : `<div class="kiosk-preview-ph" style="width:100%; height:55px; background:#111; border:2px dashed #444; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#888; font-weight:bold; margin-bottom:6px; font-size:11px; padding:4px; text-align:center;">🖼️ ${escHtml(nombreLimpio || "SIN VISTA PREVIA")}</div>`;

  document.getElementById("kioscoTitulo").textContent = esLaser
    ? `⚡ MODO KIOSKO LÁSER (LOTE: ${rolloNombre})`
    : `🔥 MODO KIOSKO ACTIVO (BOBINA: ${rolloNombre})`;

  const labelMetros = esLaser ? "METROS A CORTAR" : "METROS A CALANDRAR";
  const metrosVal = fmtNum(trabActual.metros_totales || trabActual.metros || 0);
  const telaVal = trabActual.tela_destino || trabActual.tela || trabActual.tela_rollo_color || "-";

  // Buscar ficha técnica recomendada para la tela actual
  const telaFichaMatch = buscarFichaTelaPorNombre(telaVal);
  let pillSugerenciaHtml = "";
  if (telaFichaMatch) {
    const { parametros: pMatch } = obtenerVarianteYParametrosTela(telaFichaMatch.id);
    if (pMatch) {
      const vSug = esLaser ? (pMatch.laser_vel_mm_s || 300) : (pMatch.calandra_vel_m_min || 50);
      const tSug = esLaser ? (pMatch.laser_poder_pct || 85) : (pMatch.calandra_temp_c || 205);
      const uV = esLaser ? "mm/s" : "m/min";
      const uT = esLaser ? "%" : "°C";

      pillSugerenciaHtml = `
        <div style="background:rgba(0,230,118,0.10); border:1.5px solid #00E676; border-radius:6px; padding:4px 8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <div style="font-size:11.5px; color:#fff; display:flex; align-items:center; gap:6px;">
            <span style="color:#00E676; font-weight:900;">💡 Sugerido (${escHtml(telaFichaMatch.nombre_comercial)}):</span>
            <strong style="color:${esLaser ? '#38BDF8' : 'var(--accent-orange)'}; font-size:12.5px;">${tSug}${uT}</strong> |
            <strong style="color:#00E676; font-size:12.5px;">${vSug} ${uV}</strong>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" id="btnKioscoAplicarSugerencia" data-vel="${vSug}" data-temp="${tSug}" style="background:#00E676; color:#000; border:none; padding:3px 10px; border-radius:4px; font-weight:900; font-size:11px; cursor:pointer; box-shadow:0 2px 6px rgba(0,230,118,0.3);">⚡ Aplicar</button>
            <button type="button" class="btn-ver-ficha-tela" data-tela-id="${telaFichaMatch.id}" style="background:#2196F3; color:#fff; border:none; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:11px; cursor:pointer;" title="Ver Ficha Técnica Completa">ℹ️ Ficha</button>
          </div>
        </div>
      `;
    }
  }

  // Burbujas grandes debajo de los metros en una sola línea
  const bubblesHtml = esLaser
    ? `
      <span class="kiosk-bubble-item" style="display:inline-flex; align-items:center; gap:5px; background:#1b2130; border:1.5px solid #ff9800; color:#ff9800; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:900; white-space:nowrap; box-shadow:0 2px 6px rgba(255,152,0,0.25);">
        🏷️ Rollo: ${escHtml(trabActual.id_rollo_papel || "N/A")}
      </span>
      <span class="kiosk-bubble-item" style="display:inline-flex; align-items:center; gap:5px; background:#182533; border:1.5px solid #38BDF8; color:#38BDF8; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:900; white-space:nowrap; box-shadow:0 2px 6px rgba(56,189,248,0.25);">
        📦 Lote: ${escHtml(trabActual.batch_id || "N/A")}
      </span>
    `
    : `
      <span class="kiosk-bubble-item" style="display:inline-flex; align-items:center; gap:5px; background:#1b2130; border:1.5px solid #ff9800; color:#ff9800; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:900; white-space:nowrap; box-shadow:0 2px 6px rgba(255,152,0,0.25);">
        🏷️ Rollo: ${escHtml(trabActual.num_rollo_tela || "N/A")}
      </span>
      <span class="kiosk-bubble-item" style="display:inline-flex; align-items:center; gap:5px; background:#182533; border:1.5px solid #38BDF8; color:#38BDF8; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:900; white-space:nowrap; box-shadow:0 2px 6px rgba(56,189,248,0.25);">
        🎨 Color: ${escHtml(trabActual.color_tela || "Blanco")}
      </span>
    `;

  document.getElementById("kioscoSubtitulo").innerHTML = `
    <!-- Encabezado Kiosko General con botón para ver cola opcional -->
    <div id="kioscoTopHeader" style="display:flex; justify-content:space-between; align-items:center; background:#151821; border:1px solid #2a324b; padding:8px 14px; border-radius:8px; margin-bottom:10px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:15px; font-weight:900; color:#00E676;">${esLaser ? "LOTE" : "TRABAJO"} ${STATE.kiosco.indiceActual + 1} DE ${trabajos.length}</span>
        <button type="button" id="btnKioscoToggleCola" style="background:#1e293b; border:1px solid #475569; color:#94a3b8; font-size:11px; padding:3px 10px; border-radius:6px; cursor:pointer; font-weight:bold;" title="Ver todos los trabajos">${esLaser ? "📋 Ver cola láser" : "📋 Ver cola"} (${pendientesRestantes.length})</button>
      </div>
      <div style="text-align:right; font-size:13px; color:#aaa;">
        Restante: <strong style="color:#4CAF50; font-size:16px;">${fmtNum(totalM)} m</strong>
      </div>
    </div>

    <!-- Panel de cola colapsable (oculto por defecto para cero distracciones) -->
    <div id="kioscoPanelColaOculta" style="display:none; background:#11141c; border:1px solid #334155; border-radius:8px; padding:10px; margin-bottom:12px; max-height:240px; overflow-y:auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #2a324b; padding-bottom:6px;">
        <span style="font-size:12px; font-weight:bold; color:#00E676;">📋 SECUENCIA PENDIENTE (${trabajos.length} trabajos) — Tocá uno para saltar a él:</span>
        <button type="button" id="btnCerrarColaOculta" style="background:none; border:none; color:#ff5252; font-size:14px; font-weight:bold; cursor:pointer;">✖ Cerrar</button>
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
          badgeEstado = `<span style="background:#2e7d32; color:#fff; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:bold;">✅ TERMINADO</span>`;
        } else if (esDescartado) {
          borderStyle = "1px solid #b71c1c";
          bgStyle = "rgba(183, 28, 28, 0.12)";
          badgeEstado = `<span style="background:#b71c1c; color:#fff; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:bold;">✂️ MERMA / DESCARTE</span>`;
        } else if (esActual) {
          borderStyle = "2px solid #00E676";
          bgStyle = "rgba(0, 230, 118, 0.10)";
          badgeEstado = `<span style="background:#00E676; color:#000; padding:3px 10px; border-radius:4px; font-size:11px; font-weight:bold;">⚡ EN PROCESO AHORA</span>`;
        }

        const tNom = t.cliente_archivo || t.diseno || (t.archivos ? t.archivos.join(" | ") : "-");
        const tTela = t.tela_destino || t.tela || t.tela_rollo_color || "-";
        const tMetros = fmtNum(t.metros_totales || t.metros || 0);

        return `
          <div class="kiosco-item-card" data-kiosco-idx="${idx}" style="background:${bgStyle}; padding:8px 12px; border-radius:6px; border:${borderStyle}; margin-bottom:6px; font-size:12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div>
              ${badgeEstado}
              <strong style="color:#fff; margin-left:6px;">${escHtml(tNom)}</strong>
              <span style="color:#2196F3; font-weight:bold; margin-left:6px;">[${escHtml(tTela)}]</span>
            </div>
            <div style="font-size:14px; font-weight:bold; color:var(--accent); white-space:nowrap;">${tMetros}m</div>
          </div>
        `;
      }).join("")}
    </div>

    <!-- Reproductor Principal Limpio de 2 Columnas -->
    <div class="kiosk-player-grid">
      <div class="kiosk-player-left" style="text-align:center;">
        ${imgPreviewHtml}
        <div class="kiosk-metros-val" style="font-size:38px; font-weight:900; color:var(--accent-magenta); line-height:1;">${metrosVal} m</div>
        <div class="kiosk-metros-lbl" style="color:#aaa; font-size:11px; margin-top:3px; font-weight:bold; letter-spacing:0.5px;">${labelMetros}</div>

        <!-- Burbujas Rollo y Color en la misma línea lado a lado -->
        <div class="kiosk-bubbles-rollo-color" style="display:flex; flex-direction:row; justify-content:center; align-items:center; gap:8px; flex-wrap:nowrap; margin-top:6px;">
          ${bubblesHtml}
        </div>
      </div>

      <div class="kiosk-player-right" style="display:flex; flex-direction:column; gap:8px;">
        <!-- Tela en grande y visible -->
        <div class="kiosk-info-tela" style="background:#0f1117; padding:8px 12px; border-radius:6px; border-left:4px solid #2196F3; display:flex; align-items:center; gap:8px; overflow:hidden;">
          <span style="color:#888; font-size:12px; font-weight:bold; white-space:nowrap;">TELA:</span>
          <span style="font-size:18px; font-weight:900; color:#2196F3; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escHtml(telaVal)}">${escHtml(telaVal)}</span>
        </div>

        ${pillSugerenciaHtml}

        <!-- Nombre del trabajo en máximo 2 líneas sin prefijo -->
        <div class="kiosk-info-cliente-rollo" style="background:#0f1117; padding:6px 12px; border-radius:6px; border:1px solid #2a324b;">
          ${(trabActual.es_anidado || (trabActual.archivos && trabActual.archivos.length > 1)) ? `<div style="margin-bottom:3px;"><span class="badge activo" style="font-size:10px; padding:2px 7px;">📦 LOTE ANIDADO (${trabActual.archivos ? trabActual.archivos.length : "Múltiple"})</span></div>` : ""}
          <div class="kiosk-job-title-clamp" style="font-size:13px; font-weight:bold; color:#fff; line-height:1.25; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis;" title="${escHtml(rawNombre)}">
            ${escHtml(nombreLimpio)}
          </div>
        </div>
      </div>
    </div>

    <!-- Parámetros operativos adaptados para Calandrado o Láser -->
    <div id="kioscoParametrosBox" style="background:#111; border:1px solid #333; padding:10px 14px; border-radius:8px; margin-top:8px; display:flex; justify-content:space-around; align-items:center; flex-wrap:wrap; gap:10px;">
      ${esLaser ? `
        <div style="text-align:center;">
          <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">⚡ VELOCIDAD (mm/s)</label>
          <input type="number" id="kioscoInputVelocidad" value="${velActual}" step="10" style="width:105px; font-size:22px; text-align:center; padding:6px; background:#1a1c23; color:#00E676; border:1px solid #4CAF50; border-radius:6px; font-weight:bold;" />
        </div>
        <div style="text-align:center;">
          <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">💡 POTENCIA (%)</label>
          <input type="number" id="kioscoInputTemperatura" value="${tempActual}" step="1" max="100" style="width:105px; font-size:22px; text-align:center; padding:6px; background:#1a1c23; color:#38BDF8; border:1px solid #38BDF8; border-radius:6px; font-weight:bold;" />
        </div>
        <div id="kioscoFallaBtns" style="display:flex; gap:8px;">
          <button type="button" class="btn-kiosco-reportar-falla" data-id="${trabActual.id}" data-estacion="Láser" style="background:rgba(216,27,96,0.18); border:1px solid var(--accent-magenta); color:#ff4081; padding:10px 14px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">⚠️ FALLA LÁSER</button>
        </div>
      ` : `
        <div style="text-align:center;">
          <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">⚙️ VELOCIDAD (m/min)</label>
          <input type="number" id="kioscoInputVelocidad" value="${velActual}" step="1" style="width:105px; font-size:22px; text-align:center; padding:6px; background:#1a1c23; color:#00E676; border:1px solid #4CAF50; border-radius:6px; font-weight:bold;" />
        </div>
        <div style="text-align:center;">
          <label style="font-size:11px; color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">🔥 TEMPERATURA (°C)</label>
          <input type="number" id="kioscoInputTemperatura" value="${tempActual}" step="1" style="width:105px; font-size:22px; text-align:center; padding:6px; background:#1a1c23; color:#ff9800; border:1px solid #ff9800; border-radius:6px; font-weight:bold;" />
        </div>
        <div id="kioscoFallaBtns" style="display:flex; gap:8px;">
          <button type="button" class="btn-kiosco-reportar-falla" data-id="${trabActual.id}" data-estacion="Calandrado" style="background:rgba(216,27,96,0.18); border:1px solid var(--accent-magenta); color:#ff4081; padding:10px 14px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">⚠️ FALLA CALANDRA</button>
          <button type="button" class="btn-kiosco-reportar-falla" data-id="${trabActual.id}" data-estacion="Impresión" style="background:rgba(255,152,0,0.18); border:1px solid var(--accent-orange); color:#ff9800; padding:10px 14px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">⚠️ FALLA IMPRESIÓN</button>
        </div>
      `}
    </div>

    <!-- Notas de Impresión y Campo para siguiente paso (Láser o Taller) -->
    <div id="kioscoNotasBox" style="background:#0e131f; border:1px solid #23304a; border-radius:8px; padding:7px 12px; margin-top:8px; display:flex; align-items:center; gap:8px;">
      ${(trabActual.observaciones && trabActual.observaciones !== "-") ? `
        <div style="flex:1; display:flex; align-items:center; gap:6px; min-width:0; background:rgba(255,152,0,0.14); border:1px solid #ff9800; border-radius:6px; padding:5px 8px;">
          <span style="font-size:11px; font-weight:900; color:#ff9800; white-space:nowrap;">📝 NOTA IMPRESIÓN:</span>
          <span style="font-size:11.5px; color:#fff; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(trabActual.observaciones)}">${escHtml(trabActual.observaciones)}</span>
        </div>
        <div style="flex:1; display:flex; align-items:center; gap:5px; min-width:0;">
          <input type="text" id="kioscoInputNotaExtra" placeholder="+ Anotar para paso sig..." style="width:100%; background:#1a1c23; border:1px solid #334155; border-radius:5px; color:#00E676; font-size:11px; padding:5px 8px; outline:none;" />
        </div>
      ` : `
        <div style="width:100%; display:flex; align-items:center; gap:8px;">
          <span style="font-size:11px; font-weight:bold; color:#94a3b8; white-space:nowrap;">✍️ Nota paso sig:</span>
          <input type="text" id="kioscoInputNotaExtra" placeholder="Anotar observación o detalle para Láser / Taller..." style="flex:1; width:100%; background:#1a1c23; border:1px solid #334155; border-radius:5px; color:#fff; font-size:11px; padding:5px 8px; outline:none;" />
        </div>
      `}
    </div>
  `;

  // Control para abrir y cerrar el cajón de la cola
  const btnToggleCola = document.getElementById("btnKioscoToggleCola");
  const panelCola = document.getElementById("kioscoPanelColaOculta");
  const btnCerrarCola = document.getElementById("btnCerrarColaOculta");

  if (btnToggleCola && panelCola) {
    btnToggleCola.onclick = () => {
      const oculto = panelCola.style.display === "none";
      panelCola.style.display = oculto ? "block" : "none";
      btnToggleCola.textContent = oculto ? "✖ Ocultar cola" : `${esLaser ? "📋 Ver cola láser" : "📋 Ver cola"} (${pendientesRestantes.length})`;
    };
  }
  if (btnCerrarCola && panelCola && btnToggleCola) {
    btnCerrarCola.onclick = () => {
      panelCola.style.display = "none";
      btnToggleCola.textContent = `${esLaser ? "📋 Ver cola láser" : "📋 Ver cola"} (${pendientesRestantes.length})`;
    };
  }

  const btnAplicarSug = document.getElementById("btnKioscoAplicarSugerencia");
  if (btnAplicarSug) {
    btnAplicarSug.onclick = () => {
      const v = btnAplicarSug.getAttribute("data-vel");
      const t = btnAplicarSug.getAttribute("data-temp");
      const inVel = document.getElementById("kioscoInputVelocidad");
      const inTemp = document.getElementById("kioscoInputTemperatura");
      if (inVel) inVel.value = v;
      if (inTemp) inTemp.value = t;
      toast(`⚡ Parámetros aplicados: ${t} / ${v}`, "info");
    };
  }

  const btnSig = document.getElementById("btnKioscoSiguienteTrabajo");
  const btnDesc = document.getElementById("btnKioscoDescartarSiguiente");
  const btnFin = document.getElementById("btnKioscoFinalizar");

  if (btnSig) {
    if (esLaser) {
      btnSig.innerHTML = pendientesRestantes.length > 1 ? "✔️ TERMINAR CORTE Y SIGUIENTE ➔" : "✔️ FINALIZAR CORTE";
    } else {
      btnSig.innerHTML = pendientesRestantes.length > 1 ? "✔️ TERMINAR ESTE Y SIGUIENTE ➔" : "✔️ FINALIZAR TRABAJO";
    }
    btnSig.style.display = "block";
  }
  if (btnDesc) {
    btnDesc.innerHTML = esLaser ? "✂️ MERMA LÁSER" : "✂️ DESECHAR PAPEL";
    btnDesc.style.display = "block";
  }
  if (btnFin) {
    btnFin.style.display = pendientesRestantes.length > 1 ? "block" : "none";
  }

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
      let reg = STATE.colaCalandrado.find(c => c.id === id);
      if (!reg && STATE.kiosco.modulo === "laser") {
        reg = STATE.kiosco.trabajos.find(c => c.id === id) || STATE.colaLaser.find(c => c.id === id);
      }
      if (reg) await reportarFallaConReposicion(reg, est);
    };
  });
}

function abrirKioscoCalandra(idCal, rolloId = null) {
  const modal = document.getElementById("modalKioscoOperativo");
  if (!modal) return;

  // Si ya estaba corriendo en segundo plano para el mismo rollo/trabajo, restauramos la ventana
  if (STATE.kiosco.corriendoEnFondo && STATE.kiosco.modulo === "calandrado") {
    if ((rolloId && STATE.kiosco.rolloId === rolloId) || (!rolloId && STATE.kiosco.registroIds.includes(idCal))) {
      restaurarKioscoDesdeFondo();
      return;
    }
  }

  let trabajosRaw = [];
  let rolloNombre = rolloId || "Sin Rollo";

  if (rolloId) {
    trabajosRaw = STATE.colaCalandrado.filter(c => c.id_rollo_papel === rolloId && !String(c.estado).toLowerCase().includes("terminado"));
  } else {
    const r = STATE.colaCalandrado.find(c => c.id === idCal);
    if (!r) return;
    rolloNombre = r.id_rollo_papel || "Sin Rollo";
    const delMismoRollo = STATE.colaCalandrado.filter(c => c.id_rollo_papel === r.id_rollo_papel && !String(c.estado).toLowerCase().includes("terminado"));
    trabajosRaw = delMismoRollo.length > 0 ? delMismoRollo : [r];
  }

  const trabajos = agruparCalandradoPorBatch(trabajosRaw);

  if (trabajos.length === 0) {
    toast("No hay trabajos pendientes en esta bobina.", "warn");
    return;
  }

  let idxInicial = 0;
  if (idCal) {
    const idxEncontrado = trabajos.findIndex(t => t.ids && t.ids.includes(idCal));
    if (idxEncontrado >= 0) idxInicial = idxEncontrado;
  }

  STATE.kiosco.modulo = "calandrado";
  STATE.kiosco.modo = "ROLLO";
  STATE.kiosco.abierto = true;
  STATE.kiosco.corriendoEnFondo = false;
  STATE.kiosco.pausado = false;
  STATE.kiosco.acumuladoMs = 0;
  STATE.kiosco.ultimoInicioMs = Date.now();
  STATE.kiosco.inicioMs = Date.now();
  STATE.kiosco.rolloId = rolloNombre;
  STATE.kiosco.trabajos = trabajos;
  STATE.kiosco.indiceActual = idxInicial;
  STATE.kiosco.registroIds = trabajos.flatMap(t => t.ids || [t.id]);
  STATE.kiosco.completadosIds = new Set();
  STATE.kiosco.descartadosIds = new Set();

  renderContenidoModalKiosco();
  modal.classList.add("open");
  actualizarDisplayCronometroKiosco();

  if (STATE.kiosco.timerInterval) clearInterval(STATE.kiosco.timerInterval);
  STATE.kiosco.timerInterval = setInterval(actualizarDisplayCronometroKiosco, 1000);

  vincularBotonesAccionesKiosco();
}

function abrirKioscoLaser(batchId = null, idsCsv = null) {
  const modal = document.getElementById("modalKioscoOperativo");
  if (!modal) return;

  if (STATE.kiosco.corriendoEnFondo && STATE.kiosco.modulo === "laser") {
    restaurarKioscoDesdeFondo();
    return;
  }

  const pendRaw = STATE.colaLaser.filter(l => !String(l.estado).toLowerCase().includes("terminado"));
  const lotesAgrupados = agruparLaserPorBatch(pendRaw);

  let trabajos = [];
  let nombreLote = batchId || "Cola General";

  if (batchId) {
    trabajos = lotesAgrupados.filter(l => l.batch_id === batchId);
  } else if (idsCsv) {
    const idArr = String(idsCsv).split(",").map(s => s.trim());
    trabajos = lotesAgrupados.filter(l => l.ids.some(id => idArr.includes(id)));
  } else {
    trabajos = lotesAgrupados;
  }

  if (trabajos.length === 0) {
    toast("No hay trabajos de corte láser pendientes.", "warn");
    return;
  }

  STATE.kiosco.modulo = "laser";
  STATE.kiosco.modo = "LASER";
  STATE.kiosco.abierto = true;
  STATE.kiosco.corriendoEnFondo = false;
  STATE.kiosco.pausado = false;
  STATE.kiosco.acumuladoMs = 0;
  STATE.kiosco.ultimoInicioMs = Date.now();
  STATE.kiosco.inicioMs = Date.now();
  STATE.kiosco.rolloId = nombreLote;
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

  vincularBotonesAccionesKiosco();
}

function vincularBotonesAccionesKiosco() {
  const btnPausa = document.getElementById("btnKioscoPausarReanudar");
  if (btnPausa) btnPausa.onclick = alternarPausaKiosco;

  const btnMin = document.getElementById("btnKioscoMinimizar");
  if (btnMin) btnMin.onclick = minimizarKioscoAFondo;

  const btnCerrar = document.getElementById("btnKioscoCancelarDefinitivo");
  if (btnCerrar) {
    btnCerrar.onclick = () => {
      const msg = STATE.kiosco.modulo === "laser"
        ? "¿Cerrar el Modo Kiosko Láser y detener el cronómetro sin guardar?"
        : "¿Cerrar el Modo Kiosko y detener el cronómetro sin guardar?";
      if (confirm(msg)) {
        cerrarKioscoDefinitivo();
      }
    };
  }

  const btnSig = document.getElementById("btnKioscoSiguienteTrabajo");
  if (btnSig) {
    btnSig.onclick = async () => {
      const trabActual = STATE.kiosco.trabajos[STATE.kiosco.indiceActual];
      if (!trabActual) return;

      const esLaser = STATE.kiosco.modulo === "laser";
      const min = Math.max(1, Math.round(obtenerMsTranscurridosKiosco() / 60000));
      const vel = parseFloat(document.getElementById("kioscoInputVelocidad")?.value) || (esLaser ? 300 : 50);
      const valParam2 = parseFloat(document.getElementById("kioscoInputTemperatura")?.value) || (esLaser ? 85 : 205);

      const notaExtra = document.getElementById("kioscoInputNotaExtra")?.value?.trim() || "";

      if (esLaser) {
        const idsToUpdate = trabActual.ids || [trabActual.id];
        for (const id of idsToUpdate) {
          const payloadLaser = {
            estado: "Terminado",
            fecha_terminado: new Date().toISOString(),
            velocidad: vel,
            poder: valParam2
          };
          if (notaExtra) {
            const prevObs = trabActual.observaciones && trabActual.observaciones !== "-" ? trabActual.observaciones : "";
            payloadLaser.observaciones = prevObs ? `${prevObs} | ${notaExtra}` : notaExtra;
          }
          await sb().from("prod_cola_laser").update(payloadLaser).eq("id", id);
        }
        STATE.kiosco.completadosIds.add(trabActual.id);
        if (trabActual.ids) trabActual.ids.forEach(id => STATE.kiosco.completadosIds.add(id));
        toast(`✅ Corte Láser finalizado (Vel: ${vel}mm/s | Poder: ${valParam2}%).`);
      } else {
        const idsCsv = trabActual.ids ? trabActual.ids.join(",") : trabActual.id;
        await finalizarTrabajoCalandrado(idsCsv, min, true, vel, valParam2, notaExtra);
        STATE.kiosco.completadosIds.add(trabActual.id);
        if (trabActual.ids) trabActual.ids.forEach(id => STATE.kiosco.completadosIds.add(id));
      }

      const sigIdx = buscarSiguienteIndicePendienteKiosco(STATE.kiosco.indiceActual);
      if (sigIdx === -1) {
        cerrarKioscoDefinitivo();
        toast(esLaser ? `🏁 ¡Todos los cortes láser fueron finalizados!` : `🏁 ¡Todos los trabajos del rollo fueron calandrados!`);
        await cargarDatosTodo();
        return;
      }

      STATE.kiosco.indiceActual = sigIdx;
      STATE.kiosco.acumuladoMs = 0;
      STATE.kiosco.ultimoInicioMs = Date.now();
      STATE.kiosco.pausado = false;
      const tNom = trabActual.cliente_archivo || trabActual.diseno || (trabActual.archivos ? trabActual.archivos.join(" | ") : "Trabajo");
      toast(`✅ "${tNom}" guardado. Pasando al siguiente.`);
      renderContenidoModalKiosco();
      actualizarDisplayCronometroKiosco();
      await cargarDatosTodo();
    };
  }

  const btnDesc = document.getElementById("btnKioscoDescartarSiguiente");
  if (btnDesc) {
    btnDesc.onclick = async () => {
      const trabActual = STATE.kiosco.trabajos[STATE.kiosco.indiceActual];
      if (!trabActual) return;

      const esLaser = STATE.kiosco.modulo === "laser";
      const tNom = trabActual.cliente_archivo || trabActual.diseno || (trabActual.archivos ? trabActual.archivos.join(" | ") : "Trabajo");
      const tMetros = Number(trabActual.metros_totales || trabActual.metros) || 0;

      const motivo = prompt(
        esLaser
          ? `Vas a registrar merma/descarte en Láser para "${tNom}" (${fmtNum(tMetros)}m).\nMotivo del descarte:`
          : `Vas a desechar el papel de "${tNom}" (${fmtNum(tMetros)}m).\nMotivo del descarte / falla:`,
        esLaser ? "Merma en Corte Láser" : "Papel desechado en Calandra"
      );
      if (motivo === null) return;

      await sb().from("prod_fallas_reposiciones").insert({
        empresa_id: "vvgrafic-principal",
        tipo_registro: "ALERTA_REPOSICION",
        estacion: esLaser ? "Láser" : "Calandrado",
        id_rollo: trabActual.id_rollo_papel,
        batch_id: trabActual.batch_id,
        archivo_afectado: tNom,
        tela: trabActual.tela_destino || trabActual.tela || trabActual.tela_rollo_color,
        metros_merma: tMetros,
        detalle_reposicion: esLaser ? `Merma en Láser (${fmtNum(tMetros)}m)` : `Papel desechado (${fmtNum(tMetros)}m)`,
        motivo: motivo || (esLaser ? "Merma en Láser" : "Papel desechado en Calandra"),
        estado: "Pendiente"
      });

      const idsToUpdate = trabActual.ids || [trabActual.id];
      if (esLaser) {
        for (const id of idsToUpdate) {
          await sb().from("prod_cola_laser").update({
            estado: "Terminado",
            fecha_terminado: new Date().toISOString(),
            observaciones: `[MERMA LÁSER: ${motivo}] ${trabActual.observaciones || ""}`.trim()
          }).eq("id", id);
        }
      } else {
        for (const id of idsToUpdate) {
          await sb().from("prod_cola_calandrado").update({
            estado: "Terminado",
            fecha_terminado: new Date().toISOString(),
            observaciones: `[PAPEL DESECHADO: ${motivo}] ${trabActual.observaciones || ""}`.trim()
          }).eq("id", id);
        }
      }

      STATE.kiosco.descartadosIds.add(trabActual.id);
      if (trabActual.ids) trabActual.ids.forEach(id => STATE.kiosco.descartadosIds.add(id));

      const sigIdx = buscarSiguienteIndicePendienteKiosco(STATE.kiosco.indiceActual);
      if (sigIdx === -1) {
        cerrarKioscoDefinitivo();
        toast(esLaser ? `✂️ Merma registrada. Fin de la cola láser.` : `✂️ Papel desechado registrado. Fin del rollo.`);
        await cargarDatosTodo();
        return;
      }

      STATE.kiosco.indiceActual = sigIdx;
      STATE.kiosco.acumuladoMs = 0;
      STATE.kiosco.ultimoInicioMs = Date.now();
      toast(esLaser ? `✂️ Merma registrada. Avanzando al siguiente lote láser.` : `✂️ Papel desechado registrado. Avanzando al siguiente trabajo.`);
      renderContenidoModalKiosco();
      actualizarDisplayCronometroKiosco();
      await cargarDatosTodo();
    };
  }

  const btnFin = document.getElementById("btnKioscoFinalizar");
  if (btnFin) {
    btnFin.onclick = async () => {
      const esLaser = STATE.kiosco.modulo === "laser";
      const pendientesIds = STATE.kiosco.trabajos
        .map(t => t.id)
        .filter(id => !STATE.kiosco.completadosIds.has(id) && !STATE.kiosco.descartadosIds.has(id));

      if (pendientesIds.length > 0 && !confirm(esLaser ? `⚠️ ¿Deseas TERMINAR TODO y marcar como cortados los ${pendientesIds.length} lotes restantes?` : `⚠️ ¿Deseas TERMINAR TODO y marcar como calandrados los ${pendientesIds.length} trabajos restantes de esta bobina?`)) {
        return;
      }

      const min = Math.max(1, Math.round(obtenerMsTranscurridosKiosco() / 60000));
      const vel = parseFloat(document.getElementById("kioscoInputVelocidad")?.value) || (esLaser ? 300 : 50);
      const valParam2 = parseFloat(document.getElementById("kioscoInputTemperatura")?.value) || (esLaser ? 85 : 205);
      const notaExtra = document.getElementById("kioscoInputNotaExtra")?.value?.trim() || "";
      const trabActual = STATE.kiosco.trabajos[STATE.kiosco.indiceActual] || {};

      cerrarKioscoDefinitivo();
      if (esLaser) {
        for (const trab of STATE.kiosco.trabajos.filter(t => pendientesIds.includes(t.id))) {
          const idsToUpdate = trab.ids || [trab.id];
          for (const id of idsToUpdate) {
            const payloadLaser = {
              estado: "Terminado",
              fecha_terminado: new Date().toISOString(),
              velocidad: vel,
              poder: valParam2
            };
            if (trab.id === trabActual.id && notaExtra) {
              const prevObs = trab.observaciones && trab.observaciones !== "-" ? trab.observaciones : "";
              payloadLaser.observaciones = prevObs ? `${prevObs} | ${notaExtra}` : notaExtra;
            }
            await sb().from("prod_cola_laser").update(payloadLaser).eq("id", id);
          }
        }
        toast(`✅ Kiosko Láser finalizado (${pendientesIds.length} lote(s) guardados con Vel: ${vel}mm/s y Poder: ${valParam2}%).`);
      } else {
        for (const trab of STATE.kiosco.trabajos.filter(t => pendientesIds.includes(t.id))) {
          const idsCsv = trab.ids ? trab.ids.join(",") : trab.id;
          await finalizarTrabajoCalandrado(idsCsv, min, true, vel, valParam2, (trab.id === trabActual.id ? notaExtra : null));
        }
        toast(`✅ Kiosko Calandrado finalizado (${pendientesIds.length} trabajo(s) guardados con Vel: ${vel}m/min y Temp: ${valParam2}°C).`);
      }
      await cargarDatosTodo();
    };
  }
}

async function reportarFallaConReposicion(reg, estacion) {
  if (!reg) return;
  const mDefault = reg.metros || reg.metros_impresos || reg.metros_totales || 10;
  const nombreArch = reg.cliente_archivo || reg.diseno || (reg.archivos ? reg.archivos.join(" | ") : "Trabajo");
  const metrosFalla = parseFloat(prompt(`¿Cuántos metros salieron con falla en "${nombreArch}"?`, mDefault)) || 0;
  if (metrosFalla <= 0) return;
  const motivo = prompt("Motivo de la falla:", `Falla en ${estacion}`) || `Falla en ${estacion}`;

  await sb().from("prod_fallas_reposiciones").insert({
    empresa_id: "vvgrafic-principal",
    tipo_registro: "ALERTA_REPOSICION",
    estacion,
    id_rollo: reg.id_rollo_papel || null,
    batch_id: reg.batch_id || null,
    archivo_afectado: nombreArch,
    tela: reg.tela_destino || reg.tela || reg.tela_rollo_color || null,
    metros_merma: metrosFalla,
    detalle_reposicion: `Reimprimir ${metrosFalla}m`,
    motivo,
    estado: "Pendiente"
  });

  await sb().from("prod_pendientes_drive").insert({
    empresa_id: "vvgrafic-principal",
    modulo: "SUBLIMACION",
    cliente: `REPOSICIÓN ${estacion.toUpperCase()}`,
    nombre_archivo: `[REPO URGENTE] ${nombreArch}`,
    medida_unitaria: metrosFalla,
    repeticiones: 1,
    metros_totales: metrosFalla,
    perfil_detectado: reg.perfil || "-",
    tela_detectada: reg.tela_destino || reg.tela || reg.tela_rollo_color || "-",
    rollo_detectado: reg.num_rollo_tela || "-",
    color_detectado: reg.color_tela || "-",
    ruta_detectada: reg.ruta || "-",
    prioridad_maxima: true,
    estado_impreso: "NO",
    file_id: `REPO-${Date.now()}`
  });

  // Sincronización asíncrona en segundo plano con Sheet vieja (0ms de espera)
  notificarSincronizacionSheetViejaEnSegundoPlano("FALLA", "NUEVA_FALLA", {
    estacion,
    rollo: reg.id_rollo_papel || "",
    cliente_archivo: nombreArch,
    metros_merma: metrosFalla,
    motivo
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
    const btn = document.getElementById("btnSyncDriveSandbox");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Sincronizando..."; }
    toast("⏳ Sincronizando archivos con Google Drive...");
    const url = window.VG_CONEXION?.sandboxBridgeUrl;
    if (url) {
      try {
        await fetch(`${url}?action=sync_drive`);
      } catch (err) {
        console.warn("Sync fetch error:", err);
      }
    }
    await cargarDatosTodo();
    if (btn) { btn.disabled = false; btn.textContent = "Sincronizar"; }
    toast(`✔️ Sincronizado. ${STATE.pendientesDrive.length} archivos en cola.`);
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

  document.getElementById("btnGuardarCompraFinanzas")?.addEventListener("click", async () => {
    const tipo = document.getElementById("finCompraTipo")?.value || "Papel";
    const detalle = document.getElementById("finCompraDetalle")?.value.trim() || "Insumo general";
    const cant = parseFloat(document.getElementById("finCompraCant")?.value) || 1;
    const costo = parseFloat(document.getElementById("finCompraCosto")?.value) || 0;

    if (costo <= 0) {
      toast("Por favor ingresá un costo válido.", "warn");
      return;
    }

    const { error } = await sb().from("v3_movimientos_caja").insert({
      tipo_movimiento: "egreso",
      metodo_pago: "Efectivo",
      monto: costo,
      fecha_pago: new Date().toISOString(),
      notas: `[COMPRA INSUMOS: ${tipo}] ${detalle} (Cant: ${cant})`
    });

    if (error) {
      toast("Error al registrar compra: " + error.message, "error");
      return;
    }

    document.getElementById("finCompraDetalle").value = "";
    document.getElementById("finCompraCosto").value = "";
    toast(`🛒 Compra de ${tipo} registrada ($${fmtNum(costo)}).`);
    await cargarDatosTodo();
  });

  document.body.addEventListener("click", async (e) => {
    const hdrCal = e.target.closest(".rollo-header[data-toggle-rollo]");
    if (hdrCal && !e.target.closest("button")) {
      const rId = hdrCal.getAttribute("data-toggle-rollo");
      const bodyEl = document.getElementById(`body_rollo_${rId}`);
      if (bodyEl) {
        bodyEl.classList.toggle("open");
        if (bodyEl.classList.contains("open")) STATE.rollosCalandraAbiertos.add(rId);
        else STATE.rollosCalandraAbiertos.delete(rId);
      }
      return;
    }

    const btnEdit = e.target.closest(".btn-crud-edit");
    if (btnEdit) { abrirModalCrudUniversal(btnEdit.getAttribute("data-table"), btnEdit.getAttribute("data-id")); return; }

    const btnDel = e.target.closest(".btn-crud-del");
    if (btnDel) {
      eliminarRegistroCrudUniversal(
        btnDel.getAttribute("data-table"),
        btnDel.getAttribute("data-id"),
        btnDel.getAttribute("data-batch"),
        btnDel.getAttribute("data-ids")
      );
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
      if (reg && confirm("¿Deshacer impresión de este trabajo? Se devolverá el archivo a la cola de pendientes y fuera de IMPRESOS en Drive.")) {
        toast("⏳ Revertiendo impresión en base de datos y Google Drive...", "info");

        // 1. Revertir estado_impreso en prod_pendientes_drive
        const fileIds = String(reg.file_id || "").split(",").map(s => s.trim()).filter(Boolean);
        if (fileIds.length > 0) {
          try {
            const { data: updatedPendientes } = await sb().from("prod_pendientes_drive")
              .update({ estado_impreso: "NO" })
              .in("file_id", fileIds)
              .select();

            // Si no existía en prod_pendientes_drive, insertarlo para asegurar disponibilidad inmediata
            if (!updatedPendientes || updatedPendientes.length === 0) {
              for (const fId of fileIds) {
                await sb().from("prod_pendientes_drive").insert({
                  empresa_id: "vvgrafic-principal",
                  modulo: "SUBLIMACION",
                  cliente: reg.cliente || (reg.cliente_archivo ? reg.cliente_archivo.split(" | ")[0] : "CLIENTE"),
                  nombre_archivo: reg.diseno || reg.cliente_archivo || "ARCHIVO RESTAURADO",
                  medida_unitaria: Number(reg.metros_impresos) || 1,
                  metros_totales: Number(reg.metros_impresos) || 1,
                  perfil_detectado: reg.perfil || "CALANDRADO",
                  file_id: fId,
                  estado_impreso: "NO"
                });
              }
            }
          } catch(err) {
            console.error("Error restaurando estado en prod_pendientes_drive:", err);
          }

          // 2. Invocar puente GAS para mover físicamente el archivo fuera de IMPRESOS en Drive
          const bridgeUrl = window.VG_CONEXION?.sandboxBridgeUrl;
          if (bridgeUrl) {
            try {
              fetch(`${bridgeUrl}?action=revertir_impresos&file_ids=${encodeURIComponent(fileIds.join(","))}`, { mode: "no-cors" }).catch(() => {});
            } catch(err) {
              console.error("Error llamando GAS revertir_impresos:", err);
            }
          }
        }

        // 3. Eliminar de prod_impresiones y de prod_cola_calandrado (todo el batch si es anidado)
        if (reg.batch_id) {
          await sb().from("prod_impresiones").delete().eq("batch_id", reg.batch_id);
          await sb().from("prod_cola_calandrado").delete().eq("batch_id", reg.batch_id);
        } else {
          await sb().from("prod_impresiones").delete().eq("id", reg.id);
          if (reg.file_id) {
            await sb().from("prod_cola_calandrado").delete().eq("file_id", reg.file_id);
          }
        }

        toast("✅ Impresión deshecha: archivo disponible en cola de pendientes.");
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
    if (btnCalTerm) { finalizarTrabajoCalandrado(btnCalTerm.getAttribute("data-ids") || btnCalTerm.getAttribute("data-id")); return; }

    const btnCalReabrir = e.target.closest(".btn-cal-reabrir");
    if (btnCalReabrir) {
      const idsCsv = btnCalReabrir.getAttribute("data-ids") || btnCalReabrir.getAttribute("data-id") || "";
      const ids = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        await sb().from("prod_cola_calandrado").update({ estado: "Pendiente", fecha_terminado: null }).in("id", ids);
        await cargarDatosTodo();
      }
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

    const btnLasKiosco = e.target.closest(".btn-laser-kiosco-lote");
    if (btnLasKiosco) {
      abrirKioscoLaser(btnLasKiosco.getAttribute("data-batch"), btnLasKiosco.getAttribute("data-ids"));
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

    const btnTelaFicha = e.target.closest(".btn-tela-ficha") || e.target.closest(".btn-ver-ficha-tela");
    if (btnTelaFicha) {
      abrirModalFichaRapidaTela(btnTelaFicha.getAttribute("data-tela-id"));
      return;
    }

    const btnTelaEdit = e.target.closest(".btn-tela-edit");
    if (btnTelaEdit) {
      abrirModalTelaCrud(btnTelaEdit.getAttribute("data-tela-id"), "editar");
      return;
    }

    const btnTelaAddPartida = e.target.closest(".btn-tela-add-partida");
    if (btnTelaAddPartida) {
      abrirModalTelaCrud(btnTelaAddPartida.getAttribute("data-tela-id"), "nueva_partida");
      return;
    }

    const btnTelaDel = e.target.closest(".btn-tela-del");
    if (btnTelaDel) {
      eliminarTela(btnTelaDel.getAttribute("data-tela-id"));
      return;
    }
  });

  document.getElementById("btnNuevaTelaModal")?.addEventListener("click", () => {
    abrirModalTelaCrud(null, "crear");
  });

  document.getElementById("btnGuardarTelaCrud")?.addEventListener("click", guardarTelaCrud);

  document.getElementById("searchTelasFichas")?.addEventListener("input", (e) => {
    STATE.filtroTelasLocal = e.target.value;
    renderModuloTelas();
  });

  const inpAnchoReal = document.getElementById("telaInputAnchoReal");
  const inpAnchoImp = document.getElementById("telaInputAnchoImp");
  if (inpAnchoReal && inpAnchoImp) {
    inpAnchoReal.addEventListener("input", () => {
      const ar = parseFloat(inpAnchoReal.value);
      if (!isNaN(ar) && ar > 0.1) {
        inpAnchoImp.value = (Math.max(0.1, ar - 0.02)).toFixed(2);
      }
    });
  }

  document.getElementById("btnGuardarModalCrud")?.addEventListener("click", guardarModalCrudUniversal);
  document.getElementById("btnKioscoBgPausar")?.addEventListener("click", alternarPausaKiosco);
  document.getElementById("btnKioscoBgVolver")?.addEventListener("click", restaurarKioscoDesdeFondo);
  document.getElementById("btnAbrirKioscoLaserGeneral")?.addEventListener("click", () => abrirKioscoLaser());

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
