/**
 * Configuración única de conexión a Supabase - Control de Taller V&V Grafic
 * Regla AGENTS.md: En entorno de pruebas, ramas o local usa SIEMPRE el clon kkvzzheccniclfwqzivu.
 */
(function () {
  const ES_PRODUCCION_AUTORIZADA = false; // Bloqueado en false durante toda la etapa de pruebas

  const CONFIG_PRUEBAS = {
    modo: 'PRUEBAS',
    projectRef: 'kkvzzheccniclfwqzivu',
    url: 'https://kkvzzheccniclfwqzivu.supabase.co',
    key: 'sb_publishable_d5502ZSvf9nA_d3AVYWt2Q_9jajS8-r', // clave publicable (las claves viejas anon/service_role están desactivadas)
    empresaId: 'vvgrafic-principal',
    sandboxBridgeUrl: 'https://script.google.com/macros/s/AKfycbwyqBeRS80Q2mg7CCFSt2736LQlnRcc73eXxaADOJk1PSkGcTcioYw2n__dnLBNWoc-AA/exec'
  };

  const CONFIG_REAL = {
    modo: 'PRODUCCION',
    projectRef: 'rqgzirimgpyvfhzbfoig',
    url: 'https://rqgzirimgpyvfhzbfoig.supabase.co',
    key: 'sb_publishable_wPnEZ16KdHDHX3xyw7PyQw_-iNnrTCn',
    empresaId: 'vvgrafic-principal'
  };

  window.VG_CONEXION = ES_PRODUCCION_AUTORIZADA ? CONFIG_REAL : CONFIG_PRUEBAS;

  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    window.vgSupabase = window.supabase.createClient(window.VG_CONEXION.url, window.VG_CONEXION.key);
  }
})();
