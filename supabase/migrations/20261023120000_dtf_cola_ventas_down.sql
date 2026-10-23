-- Vuelve atrás 20261023120000_dtf_cola_ventas.sql (los grupos armados a mano quedan anotados en grupo_venta)
drop function if exists public.taller_dtf_agrupar(jsonb);
drop function if exists public.taller_dtf_por_vender();
drop function if exists public.dtf_nombre_limpio(text);
