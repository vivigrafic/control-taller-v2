-- ============================================================================
-- ROLLBACK: Control de Taller y Producción 2.0 (V&V Grafic)
-- Base destino: Clon de Pruebas (kkvzzheccniclfwqzivu)
-- ============================================================================

DROP VIEW IF EXISTS public.v_prod_dtf_cuentas_clientes;
DROP VIEW IF EXISTS public.v_prod_dtf_rollos_saldos;
DROP VIEW IF EXISTS public.v_prod_bloques_impresion;
DROP VIEW IF EXISTS public.v_prod_rollos_papel_saldos;

DROP TABLE IF EXISTS public.prod_sync_sheets_queue CASCADE;
DROP TABLE IF EXISTS public.prod_chat_mensajes CASCADE;
DROP TABLE IF EXISTS public.prod_dtf_pedidos CASCADE;
DROP TABLE IF EXISTS public.prod_dtf_tiradas CASCADE;
DROP TABLE IF EXISTS public.prod_dtf_rollos CASCADE;
DROP TABLE IF EXISTS public.prod_finanzas_taller CASCADE;
DROP TABLE IF EXISTS public.prod_catalogos CASCADE;
DROP TABLE IF EXISTS public.prod_fallas_reposiciones CASCADE;
DROP TABLE IF EXISTS public.prod_sobrantes CASCADE;
DROP TABLE IF EXISTS public.prod_pendientes_drive CASCADE;
DROP TABLE IF EXISTS public.prod_cola_laser CASCADE;
DROP TABLE IF EXISTS public.prod_cola_calandrado CASCADE;
DROP TABLE IF EXISTS public.prod_impresiones CASCADE;
DROP TABLE IF EXISTS public.prod_rollos_papel CASCADE;
