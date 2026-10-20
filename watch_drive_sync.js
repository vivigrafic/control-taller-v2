/**
 * Watcher Automático de Fila de Impresión en Tiempo Real (PC Taller)
 * Vigila:
 * - G:/Mi unidad/VIVI GRAFIC/fila_impresión/sublimacion
 * - G:/Mi unidad/VIVI GRAFIC/fila_impresión/dtf
 * Cuando se agrega, edita o mueve un archivo, sincroniza automáticamente a Supabase.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const WATCH_DIR_1 = 'G:/Mi unidad/VIVI GRAFIC/fila_impresión/sublimacion';
const WATCH_DIR_2 = 'G:/Mi unidad/VIVI GRAFIC/fila_impresión/dtf';
const SCRIPT_SYNC = path.join(__dirname, 'sync_real_drive_to_supabase.js');

let debounceTimer = null;
let isSyncing = false;

function triggerSync(source) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (isSyncing) return;
    isSyncing = true;
    console.log(`[${new Date().toLocaleTimeString()}] Cambio detectado en ${source}. Ejecutando sincronización a Supabase...`);
    exec(`node "${SCRIPT_SYNC}"`, (err, stdout, stderr) => {
      isSyncing = false;
      if (err) {
        console.error('Error sincronizando:', err.message);
      } else {
        console.log(stdout.trim());
        console.log(`[${new Date().toLocaleTimeString()}] ✅ Sincronización en tiempo real completada.`);
      }
    });
  }, 2000); // 2 segundos de espera para permitir que termine de copiarse el archivo
}

console.log('--- Iniciando Vigilante de Fila de Impresión (Sublimación + DTF) ---');
if (fs.existsSync(WATCH_DIR_1)) {
  fs.watch(WATCH_DIR_1, { recursive: true }, (eventType, filename) => {
    if (filename && !filename.startsWith('00') && !filename.toLowerCase().includes('desktop.ini')) {
      triggerSync(`Sublimación (${filename})`);
    }
  });
  console.log('👀 Vigilando Sublimación:', WATCH_DIR_1);
}

if (fs.existsSync(WATCH_DIR_2)) {
  fs.watch(WATCH_DIR_2, { recursive: true }, (eventType, filename) => {
    if (filename && !filename.startsWith('00') && !filename.toLowerCase().includes('desktop.ini')) {
      triggerSync(`DTF (${filename})`);
    }
  });
  console.log('👀 Vigilando DTF:', WATCH_DIR_2);
}
