// ============================================================================
// SEEDER: Catálogo Inicial de Telas, Fichas Técnicas y Parámetros
// Supabase Sandbox (kkvzzheccniclfwqzivu)
// ============================================================================

const SUPABASE_URL = "https://kkvzzheccniclfwqzivu.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || '' // clave secreta: va en el archivo .env (no se sube), nunca en el código;

const TELAS_SEMILLA = [
  {
    codigo_tela: "TEL-SAST-VAL",
    nombre_comercial: "Sastrero Valentino",
    alias_busqueda: ["VALENTINO", "SASTRERO", "VALENTINOS"],
    composicion: "100% Poliéster",
    proveedor_habitual: "Textil Principal",
    observaciones: "Excelente definición. Mantener tensión uniforme en calandra.",
    variantes: [
      {
        codigo_partida: "Estándar 1.50m",
        ancho_real_m: 1.50,
        ancho_impresion_sugerido_m: 1.48,
        gramaje_gsm: 180.0,
        rinde_mts_kg: 3.50,
        encogimiento_largo_pct: 2.0,
        encogimiento_ancho_pct: 1.0,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 205.0,
          calandra_vel_m_min: 50.0,
          calandra_presion_bar: 4.0,
          laser_vel_mm_s: 300.0,
          laser_poder_pct: 85.0,
          precauciones: "Evitar sobrepasar 210°C para no quemar el brillo del tejido."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-SET-POL",
    nombre_comercial: "Set de Poliéster",
    alias_busqueda: ["SET", "SET MICROFIBRA", "SET MICRO FIBRA", "POLYSET"],
    composicion: "100% Poliéster Interlock",
    proveedor_habitual: "Textil Deportivo",
    observaciones: "Ideal para camisetas y shorts deportivos. Rinde alto.",
    variantes: [
      {
        codigo_partida: "Estándar 1.60m",
        ancho_real_m: 1.60,
        ancho_impresion_sugerido_m: 1.58,
        gramaje_gsm: 135.0,
        rinde_mts_kg: 5.00,
        encogimiento_largo_pct: 2.5,
        encogimiento_ancho_pct: 1.2,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 208.0,
          calandra_vel_m_min: 52.0,
          calandra_presion_bar: 4.0,
          laser_vel_mm_s: 350.0,
          laser_poder_pct: 78.0,
          precauciones: "Corte rápido con poco poder para evitar bordes amarillos."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-DRY-FIT",
    nombre_comercial: "Dry-Fit / Panal",
    alias_busqueda: ["DRYFIT", "DRYFIT PANAL", "DRIFIT", "DRIFIT AMARILLENTO", "DRYFIT ELASTIZADO"],
    composicion: "100% Poliéster Microfibra",
    proveedor_habitual: "Textil Deportivo",
    observaciones: "Tejido microperforado de secado rápido.",
    variantes: [
      {
        codigo_partida: "Estándar 1.60m",
        ancho_real_m: 1.60,
        ancho_impresion_sugerido_m: 1.58,
        gramaje_gsm: 140.0,
        rinde_mts_kg: 4.80,
        encogimiento_largo_pct: 2.2,
        encogimiento_ancho_pct: 1.0,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 205.0,
          calandra_vel_m_min: 50.0,
          calandra_presion_bar: 3.8,
          laser_vel_mm_s: 360.0,
          laser_poder_pct: 75.0,
          precauciones: "Verificar orificios de aire en calandrado para evitar fantasmas."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-SPUN",
    nombre_comercial: "Spun (Simil Algodón)",
    alias_busqueda: ["SPUN", "SPUM", "MODAL SOFT"],
    composicion: "100% Poliéster Hilado",
    proveedor_habitual: "Hilandería San Martín",
    observaciones: "Tacto algodón de alta absorción, excelente saturación de color.",
    variantes: [
      {
        codigo_partida: "Estándar 1.60m",
        ancho_real_m: 1.60,
        ancho_impresion_sugerido_m: 1.58,
        gramaje_gsm: 155.0,
        rinde_mts_kg: 4.10,
        encogimiento_largo_pct: 3.0,
        encogimiento_ancho_pct: 1.5,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 202.0,
          calandra_vel_m_min: 48.0,
          calandra_presion_bar: 4.2,
          laser_vel_mm_s: 320.0,
          laser_poder_pct: 80.0,
          precauciones: "Encogimiento longitudinal del 3%. Considerar compensación."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-TROP-MEC",
    nombre_comercial: "Tropical Mecánico",
    alias_busqueda: ["TROPICAL", "TROPICAL MECANICO", "MECANICO"],
    composicion: "100% Poliéster Plano",
    proveedor_habitual: "Textil Once",
    observaciones: "Tejido plano rígido, gran resistencia y sin elasticidad.",
    variantes: [
      {
        codigo_partida: "Estándar 1.50m",
        ancho_real_m: 1.50,
        ancho_impresion_sugerido_m: 1.48,
        gramaje_gsm: 160.0,
        rinde_mts_kg: 4.00,
        encogimiento_largo_pct: 1.0,
        encogimiento_ancho_pct: 0.5,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 205.0,
          calandra_vel_m_min: 50.0,
          calandra_presion_bar: 4.5,
          laser_vel_mm_s: 310.0,
          laser_poder_pct: 82.0,
          precauciones: "Corte limpio y sellado perfecto de hilachas."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-MICRO-SIRE",
    nombre_comercial: "Microfibra / Sire",
    alias_busqueda: ["MICROFIBRA", "SIRE", "MIC", "CIRÉ"],
    composicion: "100% Poliéster Tafeta",
    proveedor_habitual: "Textil Avellaneda",
    observaciones: "Ultra liviana, repelente al agua, ideal para camperas y rompevientos.",
    variantes: [
      {
        codigo_partida: "Estándar 1.50m",
        ancho_real_m: 1.50,
        ancho_impresion_sugerido_m: 1.48,
        gramaje_gsm: 100.0,
        rinde_mts_kg: 7.00,
        encogimiento_largo_pct: 2.8,
        encogimiento_ancho_pct: 1.2,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 198.0,
          calandra_vel_m_min: 55.0,
          calandra_presion_bar: 3.5,
          laser_vel_mm_s: 400.0,
          laser_poder_pct: 68.0,
          precauciones: "Temperatura máx 200°C. Al ser tan fina se derrite con exceso de calor."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-FRISA-DEP",
    nombre_comercial: "Frisa Deportiva",
    alias_busqueda: ["FRISA", "DEPORTIVO FRIZADO", "TERMICO", "FRIZADO"],
    composicion: "70% Poliéster / 30% Algodón",
    proveedor_habitual: "Hilados del Sur",
    observaciones: "Interior frisado térmico para buzos y camperas de abrigo.",
    variantes: [
      {
        codigo_partida: "Estándar 1.60m",
        ancho_real_m: 1.60,
        ancho_impresion_sugerido_m: 1.58,
        gramaje_gsm: 280.0,
        rinde_mts_kg: 2.40,
        encogimiento_largo_pct: 3.5,
        encogimiento_ancho_pct: 1.8,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 200.0,
          calandra_vel_m_min: 38.0,
          calandra_presion_bar: 4.8,
          laser_vel_mm_s: 240.0,
          laser_poder_pct: 92.0,
          precauciones: "Tela gruesa: bajar velocidad para garantizar transferencia en el núcleo."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-LYCRA-POLI",
    nombre_comercial: "Lycra / Polisap",
    alias_busqueda: ["LYCRA", "LYCRA 40", "POLISAP", "MICROFIBRA LYCRA 40", "LYCA"],
    composicion: "88% Poliéster / 12% Elastano",
    proveedor_habitual: "Lycras Tex",
    observaciones: "Calzas, trajes de baño y ropa deportiva de compresión.",
    variantes: [
      {
        codigo_partida: "Estándar 1.50m",
        ancho_real_m: 1.50,
        ancho_impresion_sugerido_m: 1.48,
        gramaje_gsm: 220.0,
        rinde_mts_kg: 2.80,
        encogimiento_largo_pct: 4.0,
        encogimiento_ancho_pct: 2.0,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 198.0,
          calandra_vel_m_min: 42.0,
          calandra_presion_bar: 3.8,
          laser_vel_mm_s: 280.0,
          laser_poder_pct: 85.0,
          precauciones: "Alta elasticidad. No forzar tensión en el rodillo para evitar deformaciones."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-CORDURA",
    nombre_comercial: "Cordura 600D",
    alias_busqueda: ["CORDURA", "CORDURA RESINADA", "MOCHILERA"],
    composicion: "100% Poliéster Pesado",
    proveedor_habitual: "Distribuidora Técnica",
    observaciones: "Mochilas, bolsos y fundas. Alta resistencia a desgarro.",
    variantes: [
      {
        codigo_partida: "Estándar 1.50m",
        ancho_real_m: 1.50,
        ancho_impresion_sugerido_m: 1.48,
        gramaje_gsm: 310.0,
        rinde_mts_kg: 2.20,
        encogimiento_largo_pct: 0.8,
        encogimiento_ancho_pct: 0.4,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 205.0,
          calandra_vel_m_min: 35.0,
          calandra_presion_bar: 5.0,
          laser_vel_mm_s: 220.0,
          laser_poder_pct: 95.0,
          precauciones: "Láser con potencia alta para sellar el hilo y que no deshilache."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-MORLEY-WAF",
    nombre_comercial: "Morley / Wafle",
    alias_busqueda: ["MORLEY", "WAFLE", "MORLEY SOFT", "MICRO RIB"],
    composicion: "95% Poliéster / 5% Spandex",
    proveedor_habitual: "Textil Tejidos",
    observaciones: "Estructura acanalada / nido de abeja para remeras de moda.",
    variantes: [
      {
        codigo_partida: "Estándar 1.45m",
        ancho_real_m: 1.45,
        ancho_impresion_sugerido_m: 1.43,
        gramaje_gsm: 200.0,
        rinde_mts_kg: 3.20,
        encogimiento_largo_pct: 3.2,
        encogimiento_ancho_pct: 1.5,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 200.0,
          calandra_vel_m_min: 44.0,
          calandra_presion_bar: 4.0,
          laser_vel_mm_s: 300.0,
          laser_poder_pct: 80.0,
          precauciones: "Presión media para no aplastar el canal del tejido."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-CEY-CREP",
    nombre_comercial: "Cey / Crep Plano",
    alias_busqueda: ["CEY", "CEI", "CREP", "CREEP", "CREP PLANO"],
    composicion: "100% Poliéster Fluido",
    proveedor_habitual: "Moda Textil",
    observaciones: "Efecto arrugado natural, caída ligera para vestidos y blusas.",
    variantes: [
      {
        codigo_partida: "Estándar 1.50m",
        ancho_real_m: 1.50,
        ancho_impresion_sugerido_m: 1.48,
        gramaje_gsm: 140.0,
        rinde_mts_kg: 4.50,
        encogimiento_largo_pct: 2.0,
        encogimiento_ancho_pct: 1.0,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 200.0,
          calandra_vel_m_min: 48.0,
          calandra_presion_bar: 3.8,
          laser_vel_mm_s: 340.0,
          laser_poder_pct: 76.0,
          precauciones: "Mantener alineación perfecta para que no se arrugue en la entrada."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-MICRO-TUL",
    nombre_comercial: "Micro Tul / Red",
    alias_busqueda: ["MICRO TUL", "TUL", "RED"],
    composicion: "100% Poliéster Red",
    proveedor_habitual: "Textil Avellaneda",
    observaciones: "Calado ultra fino y transparente para detalles y lencería.",
    variantes: [
      {
        codigo_partida: "Estándar 1.50m",
        ancho_real_m: 1.50,
        ancho_impresion_sugerido_m: 1.48,
        gramaje_gsm: 80.0,
        rinde_mts_kg: 9.00,
        encogimiento_largo_pct: 1.5,
        encogimiento_ancho_pct: 0.8,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 195.0,
          calandra_vel_m_min: 55.0,
          calandra_presion_bar: 3.2,
          laser_vel_mm_s: 420.0,
          laser_poder_pct: 60.0,
          precauciones: "Usar papel de protección limpio obligatorio para evitar manchas en cinta."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-SOFT-SHELL",
    nombre_comercial: "Soft Shell",
    alias_busqueda: ["SOFT SHELL", "SOFTSHELL"],
    composicion: "Poliéster Laminado con Membrana",
    proveedor_habitual: "Técnicos Textiles",
    observaciones: "Camperas técnicas impermeables y térmicas.",
    variantes: [
      {
        codigo_partida: "Estándar 1.50m",
        ancho_real_m: 1.50,
        ancho_impresion_sugerido_m: 1.48,
        gramaje_gsm: 300.0,
        rinde_mts_kg: 2.10,
        encogimiento_largo_pct: 1.2,
        encogimiento_ancho_pct: 0.8,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 195.0,
          calandra_vel_m_min: 34.0,
          calandra_presion_bar: 4.8,
          laser_vel_mm_s: 210.0,
          laser_poder_pct: 95.0,
          precauciones: "No sobrepasar 200°C para no delaminar la membrana microporosa interna."
        }
      }
    ]
  },
  {
    codigo_tela: "TEL-ACETATO",
    nombre_comercial: "Acetato Deportivo",
    alias_busqueda: ["ACETATO", "TELA NIKE", "KETTEN"],
    composicion: "100% Poliéster Brillante",
    proveedor_habitual: "Deportivas del Plata",
    observaciones: "Pantalones y camperas de conjuntos deportivos clásicos.",
    variantes: [
      {
        codigo_partida: "Estándar 1.55m",
        ancho_real_m: 1.55,
        ancho_impresion_sugerido_m: 1.53,
        gramaje_gsm: 170.0,
        rinde_mts_kg: 3.80,
        encogimiento_largo_pct: 2.0,
        encogimiento_ancho_pct: 1.0,
        es_predeterminada: true,
        parametros: {
          calandra_temp_c: 205.0,
          calandra_vel_m_min: 50.0,
          calandra_presion_bar: 4.2,
          laser_vel_mm_s: 330.0,
          laser_poder_pct: 80.0,
          precauciones: "Brillo superficial susceptible a rayones. Vigilar superficie del cilindro."
        }
      }
    ]
  }
];

async function seed() {
  console.log("🚀 Iniciando siembra de Catálogo de Telas y Parámetros...");

  for (const t of TELAS_SEMILLA) {
    // 1. Insertar o actualizar ficha de tela
    const resTela = await fetch(`${SUPABASE_URL}/rest/v1/prod_telas_ficha`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        codigo_tela: t.codigo_tela,
        nombre_comercial: t.nombre_comercial,
        alias_busqueda: t.alias_busqueda,
        composicion: t.composicion,
        proveedor_habitual: t.proveedor_habitual,
        observaciones: t.observaciones,
        activo: true
      })
    });

    let telaId = null;
    if (resTela.ok) {
      const inserted = await resTela.json();
      telaId = inserted[0]?.id;
    } else {
      // Si ya existía, obtenemos su ID
      const query = await fetch(`${SUPABASE_URL}/rest/v1/prod_telas_ficha?nombre_comercial=eq.${encodeURIComponent(t.nombre_comercial)}&select=id`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      const existing = await query.json();
      telaId = existing[0]?.id;
    }

    if (!telaId) {
      console.error(`❌ Error obteniendo ID para tela ${t.nombre_comercial}`);
      continue;
    }

    // 2. Insertar variantes y parámetros
    for (const v of t.variantes) {
      const resVar = await fetch(`${SUPABASE_URL}/rest/v1/prod_telas_variantes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          tela_id: telaId,
          codigo_partida: v.codigo_partida,
          ancho_real_m: v.ancho_real_m,
          ancho_impresion_sugerido_m: v.ancho_impresion_sugerido_m,
          gramaje_gsm: v.gramaje_gsm,
          rinde_mts_kg: v.rinde_mts_kg,
          encogimiento_largo_pct: v.encogimiento_largo_pct,
          encogimiento_ancho_pct: v.encogimiento_ancho_pct,
          es_predeterminada: v.es_predeterminada
        })
      });

      if (resVar.ok) {
        const varInserted = await resVar.json();
        const varId = varInserted[0]?.id;

        // 3. Insertar parámetros de proceso
        if (varId && v.parametros) {
          await fetch(`${SUPABASE_URL}/rest/v1/prod_telas_parametros`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SERVICE_KEY,
              Authorization: `Bearer ${SERVICE_KEY}`
            },
            body: JSON.stringify({
              variante_id: varId,
              calandra_temp_c: v.parametros.calandra_temp_c,
              calandra_vel_m_min: v.parametros.calandra_vel_m_min,
              calandra_presion_bar: v.parametros.calandra_presion_bar,
              laser_vel_mm_s: v.parametros.laser_vel_mm_s,
              laser_poder_pct: v.parametros.laser_poder_pct,
              precauciones: v.parametros.precauciones
            })
          });
        }
      }

      // 4. Semilla de Historial de Aprendizaje (Ancho aprendido)
      await fetch(`${SUPABASE_URL}/rest/v1/prod_historial_anchos_tela`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        },
        body: JSON.stringify({
          tela_id: telaId,
          nombre_tela_raw: t.nombre_comercial,
          ancho_archivo_impreso: v.ancho_impresion_sugerido_m,
          metros_trabajo: 100.0
        })
      });
    }

    console.log(`✅ Tela configurada: ${t.nombre_comercial} (${t.variantes[0].ancho_real_m}m -> Imp: ${t.variantes[0].ancho_impresion_sugerido_m}m)`);
  }

  console.log("🏁 Siembra de telas completada con éxito.");
}

seed().catch(console.error);
