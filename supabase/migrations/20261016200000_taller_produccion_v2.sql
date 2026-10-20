-- ============================================================================
-- MIGRACIÓN: Control de Taller y Producción 2.0 (V&V Grafic)
-- Base destino (Etapa 0-4): Clon de Pruebas (kkvzzheccniclfwqzivu)
-- Reglas AGENTS.md: empresa_id en todas las tablas, vistas calculadas, tiempo real.
-- ============================================================================

-- 1. Rollos de Papel de Sublimación
CREATE TABLE IF NOT EXISTS public.prod_rollos_papel (
    id_rollo TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    gramaje TEXT NOT NULL DEFAULT '70',
    metros_iniciales NUMERIC(12,2) NOT NULL DEFAULT 100,
    estado TEXT NOT NULL DEFAULT 'Activo',
    observaciones TEXT DEFAULT '',
    fecha_montaje TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Movimientos e Impresiones de Papel (con batch_id para anidados y bloque)
CREATE TABLE IF NOT EXISTS public.prod_impresiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    batch_id TEXT NOT NULL,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_rollo_papel TEXT NOT NULL,
    id_rollo_base TEXT NOT NULL,
    cliente_archivo TEXT NOT NULL,
    diseno TEXT DEFAULT '',
    tela_destino TEXT DEFAULT '',
    num_rollo_tela TEXT DEFAULT '',
    color_tela TEXT DEFAULT '',
    accion TEXT NOT NULL DEFAULT 'Impresion Normal',
    metros_impresos NUMERIC(12,2) NOT NULL DEFAULT 0,
    metros_desperdicio NUMERIC(12,2) NOT NULL DEFAULT 0,
    metros_restantes_snapshot NUMERIC(12,2) DEFAULT 0,
    perfil TEXT DEFAULT '',
    ruta TEXT DEFAULT 'Solo Calandrado',
    observaciones TEXT DEFAULT '',
    file_id TEXT DEFAULT '',
    anulado BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_imp_rollo_base ON public.prod_impresiones(id_rollo_base);
CREATE INDEX IF NOT EXISTS idx_prod_imp_batch ON public.prod_impresiones(batch_id);
CREATE INDEX IF NOT EXISTS idx_prod_imp_fecha ON public.prod_impresiones(fecha_hora DESC);

-- 3. Cola e Historial de Calandrado (con batch_id y soporte real de fecha manual)
CREATE TABLE IF NOT EXISTS public.prod_cola_calandrado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    batch_id TEXT NOT NULL,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_terminado TIMESTAMPTZ,
    id_rollo_papel TEXT NOT NULL,
    cliente_archivo TEXT NOT NULL,
    diseno TEXT DEFAULT '',
    tela_destino TEXT DEFAULT '',
    num_rollo_tela TEXT DEFAULT '',
    color_tela TEXT DEFAULT '',
    metros NUMERIC(12,2) NOT NULL DEFAULT 0,
    perfil TEXT DEFAULT '',
    ruta TEXT DEFAULT 'Solo Calandrado',
    observaciones TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    velocidad NUMERIC(10,2) DEFAULT 50,
    temperatura NUMERIC(10,2) DEFAULT 245,
    minutos_trabajados NUMERIC(10,2) DEFAULT 0,
    mts_hr NUMERIC(10,2) DEFAULT 0,
    file_id TEXT DEFAULT '',
    prioritario BOOLEAN NOT NULL DEFAULT false,
    anulado BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_cal_batch ON public.prod_cola_calandrado(batch_id);
CREATE INDEX IF NOT EXISTS idx_prod_cal_rollo ON public.prod_cola_calandrado(id_rollo_papel);
CREATE INDEX IF NOT EXISTS idx_prod_cal_estado ON public.prod_cola_calandrado(estado);

-- 4. Cola e Historial de Corte Láser (con batch_id para mantener anidados juntos)
CREATE TABLE IF NOT EXISTS public.prod_cola_laser (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    batch_id TEXT NOT NULL,
    fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_terminado TIMESTAMPTZ,
    id_rollo_papel TEXT NOT NULL,
    cliente_archivo TEXT NOT NULL,
    tela_rollo_color TEXT DEFAULT '',
    metros NUMERIC(12,2) NOT NULL DEFAULT 0,
    ruta TEXT DEFAULT 'Calandrado + Corte Láser',
    velocidad NUMERIC(10,2) DEFAULT 0,
    poder NUMERIC(10,2) DEFAULT 90,
    minutos_trabajados NUMERIC(10,2) DEFAULT 0,
    mts_hr NUMERIC(10,2) DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    tipo_entrega TEXT DEFAULT 'Solo Corte',
    observaciones TEXT DEFAULT '',
    qc_detalle JSONB DEFAULT '{}'::jsonb,
    file_id TEXT DEFAULT '',
    anulado BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_laser_batch ON public.prod_cola_laser(batch_id);
CREATE INDEX IF NOT EXISTS idx_prod_laser_estado ON public.prod_cola_laser(estado);

-- 5. Archivos Pendientes de Drive (Sublimación y DTF, con autodetección de nombre y DPI)
CREATE TABLE IF NOT EXISTS public.prod_pendientes_drive (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    modulo TEXT NOT NULL DEFAULT 'SUBLIMACION',
    cliente TEXT NOT NULL DEFAULT 'SIN CLIENTE',
    nombre_archivo TEXT NOT NULL,
    medida_unitaria NUMERIC(12,2) DEFAULT 0,
    repeticiones INT DEFAULT 1,
    metros_totales NUMERIC(12,2) DEFAULT 0,
    metros_dpi_real NUMERIC(12,2),
    dpi_detectado INT,
    discrepancia_medida BOOLEAN DEFAULT false,
    perfil_detectado TEXT DEFAULT '',
    tela_detectada TEXT DEFAULT '',
    rollo_detectado TEXT DEFAULT '',
    color_detectado TEXT DEFAULT '',
    ruta_detectada TEXT DEFAULT '',
    es_repo_muestra TEXT DEFAULT '',
    estado_impreso TEXT NOT NULL DEFAULT 'NO',
    prioridad_maxima BOOLEAN NOT NULL DEFAULT false,
    file_id TEXT UNIQUE,
    url TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Inventario de Sobrantes de Papel
CREATE TABLE IF NOT EXISTS public.prod_sobrantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_bobina TEXT NOT NULL,
    gramaje TEXT DEFAULT '70',
    metros_restantes NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'En Depósito',
    observaciones TEXT DEFAULT ''
);

-- 7. Bitácora de Fallas, Mermas, Alertas de Reposición y Faltantes de Corte
CREATE TABLE IF NOT EXISTS public.prod_fallas_reposiciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    tipo_registro TEXT NOT NULL DEFAULT 'FALLA_MAQUINA', -- FALLA_MAQUINA, ALERTA_REPOSICION, FALTANTE_CORTE
    estacion TEXT DEFAULT 'Impresión',
    id_rollo TEXT DEFAULT '',
    batch_id TEXT DEFAULT '',
    archivo_afectado TEXT NOT NULL,
    tela TEXT DEFAULT '',
    metros_merma NUMERIC(12,2) DEFAULT 0,
    detalle_reposicion TEXT DEFAULT '',
    motivo TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    file_id TEXT DEFAULT ''
);

-- 8. Catálogos Maestros y Botones Inteligentes MRU (Telas, Perfiles, Colores, Prendas, Contactos, Parámetros)
CREATE TABLE IF NOT EXISTS public.prod_catalogos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    tipo TEXT NOT NULL, -- TELA, PERFIL, COLOR, PRENDA, CONTACTO, PARAMETRO
    nombre TEXT NOT NULL,
    valor_1 TEXT DEFAULT '',
    valor_2 TEXT DEFAULT '',
    config_json JSONB DEFAULT '{}'::jsonb,
    ultimo_uso_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    contador_uso_reciente INT NOT NULL DEFAULT 1,
    activo BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(empresa_id, tipo, nombre)
);

-- 9. Finanzas y Mantenimiento del Taller
CREATE TABLE IF NOT EXISTS public.prod_finanzas_taller (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    rubro TEXT NOT NULL DEFAULT 'COMPRA_INSUMO', -- COMPRA_INSUMO, MANTENIMIENTO
    tipo TEXT NOT NULL,
    detalle TEXT DEFAULT '',
    cantidad NUMERIC(12,2) DEFAULT 1,
    unidad TEXT DEFAULT 'Unidad',
    costo_total NUMERIC(14,2) DEFAULT 0,
    costo_unitario NUMERIC(14,2) DEFAULT 0,
    proveedor_tecnico TEXT DEFAULT ''
);

-- 10. Módulo DTF: Rollos de Film (60cm x 100m, por Marca y Perfil)
CREATE TABLE IF NOT EXISTS public.prod_dtf_rollos (
    id_rollo_dtf TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    marca_fabricante TEXT NOT NULL,
    perfil_impresion TEXT NOT NULL DEFAULT 'DTF Estándar',
    ancho_cm INT NOT NULL DEFAULT 60,
    metros_iniciales NUMERIC(12,2) NOT NULL DEFAULT 100,
    estado TEXT NOT NULL DEFAULT 'Activo',
    observaciones TEXT DEFAULT '',
    fecha_montaje TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Módulo DTF: Tiradas / Lotes de Máquina (Anidados o Individuales en FlexiPRINT)
CREATE TABLE IF NOT EXISTS public.prod_dtf_tiradas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    codigo_tirada TEXT NOT NULL,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_rollo_dtf TEXT NOT NULL,
    marca_rollo TEXT DEFAULT '',
    perfil_usado TEXT DEFAULT '',
    es_anidado BOOLEAN NOT NULL DEFAULT false,
    metros_consumidos_rollo NUMERIC(12,2) NOT NULL DEFAULT 0,
    metros_desperdicio NUMERIC(12,2) NOT NULL DEFAULT 0,
    tinta_blanca_ml NUMERIC(10,2) DEFAULT 0,
    tinta_cmyk_ml NUMERIC(10,2) DEFAULT 0,
    origen_watchdog BOOLEAN DEFAULT false,
    observaciones TEXT DEFAULT '',
    anulado BOOLEAN NOT NULL DEFAULT false
);

-- 12. Módulo DTF: Pedidos, Archivos de Clientes y Cuentas Corrientes
CREATE TABLE IF NOT EXISTS public.prod_dtf_pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    tirada_id UUID REFERENCES public.prod_dtf_tiradas(id) ON DELETE SET NULL,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    cliente TEXT NOT NULL,
    nombre_archivo TEXT NOT NULL,
    tipo_cargo TEXT NOT NULL DEFAULT 'VENTA', -- VENTA, REPOSICION, MUESTRA
    metros_archivo NUMERIC(12,2) NOT NULL DEFAULT 0,
    metros_dpi_real NUMERIC(12,2),
    dpi_detectado INT,
    metros_facturados NUMERIC(12,2) NOT NULL DEFAULT 0,
    precio_metro NUMERIC(12,2) NOT NULL DEFAULT 9000,
    subtotal_cobrar NUMERIC(14,2) NOT NULL DEFAULT 0,
    monto_pagado NUMERIC(14,2) NOT NULL DEFAULT 0,
    modalidad_pago TEXT DEFAULT 'Paga al retirar', -- Pagado adelantado, Seña, Paga al retirar
    estado_entrega TEXT NOT NULL DEFAULT 'Impreso', -- Pendiente, Impreso, Entregado
    observaciones TEXT DEFAULT '',
    file_id TEXT DEFAULT '',
    anulado BOOLEAN NOT NULL DEFAULT false
);

-- 13. Chat Interno de Taller en Tiempo Real (@Menciones, #Trabajos y Fotos)
CREATE TABLE IF NOT EXISTS public.prod_chat_mensajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    autor_nombre TEXT NOT NULL,
    autor_area TEXT NOT NULL DEFAULT 'General',
    canal_area TEXT NOT NULL DEFAULT 'General', -- General, Impresión, Calandrado, Corte Láser, DTF
    menciones TEXT[] DEFAULT '{}',
    trabajo_id TEXT DEFAULT '',
    trabajo_etiqueta TEXT DEFAULT '',
    trabajo_modulo TEXT DEFAULT '',
    mensaje TEXT NOT NULL,
    foto_base64 TEXT DEFAULT '',
    resuelto BOOLEAN NOT NULL DEFAULT false
);

-- 14. Cola de Sincronización Asíncrona hacia Google Sheets (Backup Espejo)
CREATE TABLE IF NOT EXISTS public.prod_sync_sheets_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    hoja_destino TEXT NOT NULL,
    operacion TEXT NOT NULL,
    payload JSONB NOT NULL,
    sincronizado BOOLEAN NOT NULL DEFAULT false
);

-- ============================================================================
-- VISTAS CALCULADAS (Regla 2: Los totales y metros restantes se calculan solos)
-- ============================================================================

-- Vista 1: Saldos en vivo por Rollo Base de Papel de Sublimación
CREATE OR REPLACE VIEW public.v_prod_rollos_papel_saldos AS
SELECT 
    r.id_rollo,
    r.empresa_id,
    r.gramaje,
    r.metros_iniciales,
    r.estado,
    r.fecha_montaje,
    COALESCE(SUM(CASE WHEN NOT i.anulado THEN i.metros_impresos ELSE 0 END), 0)::NUMERIC(12,2) AS metros_impresos_acumulados,
    COALESCE(SUM(CASE WHEN NOT i.anulado THEN i.metros_desperdicio ELSE 0 END), 0)::NUMERIC(12,2) AS metros_desperdicio_acumulados,
    GREATEST(0, r.metros_iniciales - COALESCE(SUM(CASE WHEN NOT i.anulado THEN (i.metros_impresos + i.metros_desperdicio) ELSE 0 END), 0))::NUMERIC(12,2) AS metros_restantes_reales
FROM public.prod_rollos_papel r
LEFT JOIN public.prod_impresiones i ON i.id_rollo_base = r.id_rollo
GROUP BY r.id_rollo, r.empresa_id, r.gramaje, r.metros_iniciales, r.estado, r.fecha_montaje;

-- Vista 2: Suma de metros en vivo por cada Bloque / Corte de Impresión (-C1, -C2, etc.)
CREATE OR REPLACE VIEW public.v_prod_bloques_impresion AS
SELECT 
    id_rollo_papel AS bloque_id,
    id_rollo_base,
    COUNT(*) FILTER (WHERE accion = 'Impresion Normal' AND NOT anulado) AS cantidad_impresiones,
    COALESCE(SUM(metros_impresos) FILTER (WHERE NOT anulado), 0)::NUMERIC(12,2) AS metros_impresos_bloque,
    COALESCE(SUM(metros_desperdicio) FILTER (WHERE NOT anulado), 0)::NUMERIC(12,2) AS metros_merma_bloque,
    MAX(fecha_hora) AS ultima_actividad
FROM public.prod_impresiones
GROUP BY id_rollo_papel, id_rollo_base;

-- Vista 3: Saldos y Rendimiento Real de Rollos DTF (Venta vs. Reposición vs. Muestra)
CREATE OR REPLACE VIEW public.v_prod_dtf_rollos_saldos AS
SELECT 
    r.id_rollo_dtf,
    r.marca_fabricante,
    r.perfil_impresion,
    r.metros_iniciales,
    r.estado,
    r.fecha_montaje,
    COALESCE(SUM(t.metros_consumidos_rollo + t.metros_desperdicio) FILTER (WHERE NOT t.anulado), 0)::NUMERIC(12,2) AS metros_consumidos_reales,
    GREATEST(0, r.metros_iniciales - COALESCE(SUM(t.metros_consumidos_rollo + t.metros_desperdicio) FILTER (WHERE NOT t.anulado), 0))::NUMERIC(12,2) AS metros_restantes_reales
FROM public.prod_dtf_rollos r
LEFT JOIN public.prod_dtf_tiradas t ON t.id_rollo_dtf = r.id_rollo_dtf
GROUP BY r.id_rollo_dtf, r.marca_fabricante, r.perfil_impresion, r.metros_iniciales, r.estado, r.fecha_montaje;

-- Vista 4: Cuentas Corrientes de Clientes DTF en Vivo
CREATE OR REPLACE VIEW public.v_prod_dtf_cuentas_clientes AS
SELECT 
    UPPER(TRIM(cliente)) AS cliente_normalizado,
    MAX(cliente) AS cliente_nombre,
    COUNT(*) FILTER (WHERE NOT anulado) AS total_archivos,
    COALESCE(SUM(metros_archivo) FILTER (WHERE NOT anulado AND tipo_cargo = 'VENTA'), 0)::NUMERIC(12,2) AS metros_comprados,
    COALESCE(SUM(metros_archivo) FILTER (WHERE NOT anulado AND tipo_cargo = 'REPOSICION'), 0)::NUMERIC(12,2) AS metros_reposicion,
    COALESCE(SUM(metros_archivo) FILTER (WHERE NOT anulado AND tipo_cargo = 'MUESTRA'), 0)::NUMERIC(12,2) AS metros_muestras,
    COALESCE(SUM(subtotal_cobrar) FILTER (WHERE NOT anulado), 0)::NUMERIC(14,2) AS total_facturado,
    COALESCE(SUM(monto_pagado) FILTER (WHERE NOT anulado), 0)::NUMERIC(14,2) AS total_abonado,
    COALESCE(SUM(subtotal_cobrar - monto_pagado) FILTER (WHERE NOT anulado), 0)::NUMERIC(14,2) AS saldo_pendiente
FROM public.prod_dtf_pedidos
GROUP BY UPPER(TRIM(cliente));

-- ============================================================================
-- PERMISOS Y TIEMPO REAL (Para entorno de pruebas)
-- ============================================================================
ALTER TABLE public.prod_rollos_papel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_impresiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_cola_calandrado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_cola_laser ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_pendientes_drive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_sobrantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_fallas_reposiciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_catalogos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_finanzas_taller ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_dtf_rollos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_dtf_tiradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_dtf_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_chat_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_sync_sheets_queue ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'prod_rollos_papel', 'prod_impresiones', 'prod_cola_calandrado', 'prod_cola_laser',
        'prod_pendientes_drive', 'prod_sobrantes', 'prod_fallas_reposiciones', 'prod_catalogos',
        'prod_finanzas_taller', 'prod_dtf_rollos', 'prod_dtf_tiradas', 'prod_dtf_pedidos',
        'prod_chat_mensajes', 'prod_sync_sheets_queue'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Acceso total pruebas %I" ON public.%I;', t, t);
        EXECUTE format('CREATE POLICY "Acceso total pruebas %I" ON public.%I FOR ALL USING (true) WITH CHECK (true);', t, t);
    END LOOP;
END $$;

-- Activar publicación en Supabase Realtime para todas las tablas operativas
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'prod_rollos_papel', 'prod_impresiones', 'prod_cola_calandrado', 'prod_cola_laser',
        'prod_pendientes_drive', 'prod_fallas_reposiciones', 'prod_dtf_rollos', 'prod_dtf_tiradas',
        'prod_dtf_pedidos', 'prod_chat_mensajes'
    ]
    LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;
