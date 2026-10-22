-- Vuelve atrás 20261023000000_dtf_imprimir_en_lote.sql (las tiradas y pedidos ya creados quedan)
drop function if exists public.taller_dtf_imprimir(jsonb);
drop index if exists public.prod_dtf_pedidos_tirada_idx;
alter table public.prod_dtf_pedidos drop column if exists grupo_venta;
alter table public.prod_dtf_pedidos drop column if exists separado_por;
alter table public.prod_dtf_pedidos drop column if exists separado_at;
alter table public.prod_dtf_pedidos drop column if exists pendiente_id;
