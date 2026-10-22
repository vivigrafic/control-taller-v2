/**
 * Configuración única de conexión a Supabase - Control de Taller V&V Grafic
 * Desde el 22/10/2026 el taller usa la base real (la misma del sistema): se entra con el mismo usuario y clave.
 * Los datos del taller se mudaron de la base de pruebas (kkvzzheccniclfwqzivu), que queda como archivo.
 */
(function () {
  const ES_PRODUCCION_AUTORIZADA = true; // Autorizado por el dueño el 22/10/2026 (inicio de sesión único)

  const CONFIG_PRUEBAS = {
    modo: 'PRUEBAS',
    projectRef: 'kkvzzheccniclfwqzivu',
    url: 'https://kkvzzheccniclfwqzivu.supabase.co',
    key: 'sb_publishable_d5502ZSvf9nA_d3AVYWt2Q_9jajS8-r', // clave publicable (las claves viejas anon/service_role están desactivadas)
    erpUrl: 'http://localhost:8000', // el sistema con la base de pruebas (servidor local de la PC)
    terminalUrl: 'https://script.google.com/macros/s/AKfycbwyqBeRS80Q2mg7CCFSt2736LQlnRcc73eXxaADOJk1PSkGcTcioYw2n__dnLBNWoc-AA/exec', // terminal de Google: miniaturas de la fila (carpetas privadas)
    sandboxBridgeUrl: 'https://script.google.com/macros/s/AKfycbwyqBeRS80Q2mg7CCFSt2736LQlnRcc73eXxaADOJk1PSkGcTcioYw2n__dnLBNWoc-AA/exec'
  };

  const CONFIG_REAL = {
    modo: 'PRODUCCION',
    projectRef: 'rqgzirimgpyvfhzbfoig',
    url: 'https://rqgzirimgpyvfhzbfoig.supabase.co',
    key: 'sb_publishable_wPnEZ16KdHDHX3xyw7PyQw_-iNnrTCn',
    erpUrl: 'https://erpvivigrafic.netlify.app', // el sistema publicado (base real)
    terminalUrl: 'https://script.google.com/macros/s/AKfycbwyqBeRS80Q2mg7CCFSt2736LQlnRcc73eXxaADOJk1PSkGcTcioYw2n__dnLBNWoc-AA/exec', // terminal de Google: miniaturas de la fila (carpetas privadas)
    sandboxBridgeUrl: 'https://script.google.com/macros/s/AKfycbwyqBeRS80Q2mg7CCFSt2736LQlnRcc73eXxaADOJk1PSkGcTcioYw2n__dnLBNWoc-AA/exec'
  };

  window.VG_CONEXION = ES_PRODUCCION_AUTORIZADA ? CONFIG_REAL : CONFIG_PRUEBAS;

  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    window.vgSupabase = window.supabase.createClient(window.VG_CONEXION.url, window.VG_CONEXION.key);
  }
})();
