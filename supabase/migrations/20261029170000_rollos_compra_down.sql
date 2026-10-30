-- Vuelve atrás 20261029170000_rollos_compra.sql (las columnas item_id y comprobante_item_id de los rollos las saca el down
-- del ERP 20261031180000_insumos_down.sql)
drop trigger if exists rollo_compra on public.prod_rollos_papel;
drop trigger if exists rollo_compra on public.prod_dtf_rollos;
drop function if exists public.tg_rollo_compra();
drop function if exists public.taller_rollo_compra(jsonb);
drop function if exists public.taller_compras_insumo(text);
drop function if exists public.insumo_ultima_compra_(uuid);
