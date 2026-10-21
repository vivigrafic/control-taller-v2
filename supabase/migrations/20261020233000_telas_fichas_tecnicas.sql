-- ============================================================================
-- MIGRACIÓN: Catálogo Relacional de Telas, Fichas Técnicas y Parámetros Operativos
-- Base de Datos: Supabase Sandbox (kkvzzheccniclfwqzivu)
-- ============================================================================

-- 1. Ficha Maestra de la Tela
CREATE TABLE IF NOT EXISTS public.prod_telas_ficha (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    codigo_tela TEXT NOT NULL,
    nombre_comercial TEXT NOT NULL,
    alias_busqueda TEXT[] DEFAULT '{}',
    composicion TEXT DEFAULT '100% Poliéster',
    proveedor_habitual TEXT DEFAULT '',
    observaciones TEXT DEFAULT '',
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_prod_telas_nombre UNIQUE (empresa_id, nombre_comercial)
);

CREATE INDEX IF NOT EXISTS idx_prod_telas_nombre ON public.prod_telas_ficha(nombre_comercial);
CREATE INDEX IF NOT EXISTS idx_prod_telas_activo ON public.prod_telas_ficha(activo);

-- 2. Variantes / Partidas por Tela (convivencia de anchos y rindes distintos)
CREATE TABLE IF NOT EXISTS public.prod_telas_variantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tela_id UUID NOT NULL REFERENCES public.prod_telas_ficha(id) ON DELETE CASCADE,
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    codigo_partida TEXT NOT NULL DEFAULT 'Estándar',
    ancho_real_m NUMERIC(6,2) NOT NULL DEFAULT 1.50,
    ancho_impresion_sugerido_m NUMERIC(6,2) NOT NULL DEFAULT 1.48,
    gramaje_gsm NUMERIC(6,1) DEFAULT 160.0,
    rinde_mts_kg NUMERIC(6,2) DEFAULT 3.50,
    encogimiento_largo_pct NUMERIC(4,2) DEFAULT 2.00,
    encogimiento_ancho_pct NUMERIC(4,2) DEFAULT 1.00,
    es_predeterminada BOOLEAN NOT NULL DEFAULT true,
    observaciones TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_telas_var_tela ON public.prod_telas_variantes(tela_id);

-- 3. Parámetros Operativos de Calandrado y Corte Láser por Variante
CREATE TABLE IF NOT EXISTS public.prod_telas_parametros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variante_id UUID NOT NULL REFERENCES public.prod_telas_variantes(id) ON DELETE CASCADE,
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    calandra_temp_c NUMERIC(5,1) DEFAULT 205.0,
    calandra_vel_m_min NUMERIC(6,2) DEFAULT 50.0,
    calandra_presion_bar NUMERIC(4,1) DEFAULT 4.0,
    laser_vel_mm_s NUMERIC(6,2) DEFAULT 300.0,
    laser_poder_pct NUMERIC(5,2) DEFAULT 85.0,
    precauciones TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_telas_param_var ON public.prod_telas_parametros(variante_id);

-- 4. Historial y Aprendizaje de Anchos Reales Impresos
CREATE TABLE IF NOT EXISTS public.prod_historial_anchos_tela (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tela_id UUID REFERENCES public.prod_telas_ficha(id) ON DELETE SET NULL,
    empresa_id TEXT NOT NULL DEFAULT 'vvgrafic-principal',
    nombre_tela_raw TEXT NOT NULL,
    ancho_archivo_impreso NUMERIC(6,2) NOT NULL,
    metros_trabajo NUMERIC(10,2) DEFAULT 0,
    fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_hist_anchos_tela ON public.prod_historial_anchos_tela(nombre_tela_raw);

-- Habilitar RLS público para el sandbox (acceso con clave anon y service_role)
ALTER TABLE public.prod_telas_ficha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_telas_variantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_telas_parametros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_historial_anchos_tela ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prod_telas_ficha' AND policyname = 'Allow public access prod_telas_ficha') THEN
        CREATE POLICY "Allow public access prod_telas_ficha" ON public.prod_telas_ficha FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prod_telas_variantes' AND policyname = 'Allow public access prod_telas_variantes') THEN
        CREATE POLICY "Allow public access prod_telas_variantes" ON public.prod_telas_variantes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prod_telas_parametros' AND policyname = 'Allow public access prod_telas_parametros') THEN
        CREATE POLICY "Allow public access prod_telas_parametros" ON public.prod_telas_parametros FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prod_historial_anchos_tela' AND policyname = 'Allow public access prod_historial_anchos_tela') THEN
        CREATE POLICY "Allow public access prod_historial_anchos_tela" ON public.prod_historial_anchos_tela FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
