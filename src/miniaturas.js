// ============================================================================
// MINIATURAS SIN CUENTA DE GOOGLE NI CARPETAS PÚBLICAS
// Las carpetas de la fila de impresión son privadas. La terminal de Google (que corre con la cuenta dueña) entrega la
// miniatura de un archivo de la fila (?action=miniatura&id=...&lado=...). Este script toma cualquier <img> con una
// dirección "drive.google.com/thumbnail?id=..." y la reemplaza por la imagen que trae la terminal.
// Se carga después de src/config/conexion.js (usa VG_CONEXION.terminalUrl) y antes de src/app.js.
// ============================================================================
(function () {
  const terminal = window.VG_CONEXION && window.VG_CONEXION.terminalUrl;
  if (!terminal) return;
  const RX = /drive\.google\.com\/thumbnail\?id=([A-Za-z0-9_-]+)(?:&(?:amp;)?sz=w(\d+))?/;
  const pedidos = new Map();
  const cola = [];
  let activos = 0;

  function siguiente() {
    while (activos < 4 && cola.length) {
      const tarea = cola.shift();
      activos++;
      fetch(`${terminal}?action=miniatura&id=${encodeURIComponent(tarea.id)}&lado=${tarea.lado}`)
        .then(r => r.json()).then(d => tarea.ok(d && d.data ? d.data : ""), () => tarea.ok(""))
        .finally(() => { activos--; siguiente(); });
    }
  }

  function traer(id, lado) {
    const k = `${id}_${lado}`;
    if (!pedidos.has(k)) pedidos.set(k, new Promise(ok => { cola.push({ id, lado, ok }); siguiente(); }));
    return pedidos.get(k);
  }

  function cargar(img) {
    const m = RX.exec(img.getAttribute("src") || "");
    if (!m) return;
    const lado = Math.min((parseInt(m[2] || "100", 10) || 100) * 2, 800);
    img.onerror = null;
    img.removeAttribute("src");
    traer(m[1], lado).then(url => {
      if (url) { img.src = url; img.style.display = ""; } else { img.style.display = "none"; }
    });
  }

  function barrer(raiz) {
    if (raiz.querySelectorAll) raiz.querySelectorAll('img[src*="drive.google.com/thumbnail"]').forEach(cargar);
  }

  new MutationObserver(cambios => {
    cambios.forEach(c => {
      if (c.type === "attributes") { if (c.target.tagName === "IMG") cargar(c.target); return; }
      c.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.tagName === "IMG") cargar(n); else barrer(n); } });
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  barrer(document);
})();
