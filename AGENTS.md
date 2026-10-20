# Reglas del proyecto: Control de Taller y Producción (V&V Grafic)

Este archivo lo leen las herramientas de IA antes de trabajar en el proyecto. El plan completo está en `PLAN_MAESTRO.md`.

## Idioma y forma de trabajo

- Responder **siempre en español** (Argentina), en lenguaje simple y directo.
- **No tocar jamás** la aplicación actual en producción de Google Sheets (`1UWV6Im48i4zMj0YxAYg_3Pr7hkYqxdLDq6dGG3N7EpsMfM94w10er_kP` / `1D7z5ugTzJZAaw3CAlMiciyswmQxubT9t6x_K_oLIJ_I`) ni la base de datos real (`rqgzirimgpyvfhzbfoig`).
- Trabajar exclusivamente contra el clon de pruebas en Supabase (`kkvzzheccniclfwqzivu` - "VV Grafic ERP") y con una planilla espejo de pruebas independiente.
- **Nunca publicar a mano en Netlify (`netlify deploy --prod`)** para no gastar los créditos mensuales.
- La conexión a Supabase vive únicamente en `src/config/conexion.js` (`window.VG_CONEXION`).
- Diseño visual con tokens `--vg-*` (Cobalt Enterprise), adaptado 100% a celulares, tablets y PC sin desbordes (`max-height: 90dvh`, cabecera y pie fijos).
- Toda tabla nueva lleva `empresa_id`.
- Una sola puerta por operación (funciones o transacciones limpias) y totales/metros restantes calculados dinámicamente por vistas.
- Poder editar, eliminar y agregar información en cualquier tabla y en cualquier momento desde la interfaz.
