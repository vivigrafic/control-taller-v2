-- Vuelve atrás 20261022200000_copia_planilla_vieja.sql (lo ya copiado queda en la planilla)
do $$
declare t text;
begin
  foreach t in array array['prod_impresiones', 'prod_cola_calandrado', 'prod_cola_laser', 'prod_rollos_papel',
                           'prod_fallas_reposiciones', 'prod_sobrantes'] loop
    execute format('drop trigger if exists taller_a_planilla on public.%I', t);
  end loop;
end $$;
drop function if exists public.taller_planilla_hecho(text, uuid[], uuid, text);
drop function if exists public.taller_planilla_pendientes(text, integer);
drop function if exists public.tg_prod_a_planilla();
drop index if exists public.prod_sync_sheets_queue_pendientes_idx;
alter table public.prod_sync_sheets_queue drop column if exists procesado_at;
alter table public.prod_sync_sheets_queue drop column if exists error;
alter table public.prod_sync_sheets_queue drop column if exists intentos;
alter table public.prod_sync_sheets_queue drop column if exists registro_id;
alter table public.prod_sync_sheets_queue drop column if exists tabla;
alter table public.prod_sync_sheets_queue drop column if exists empresa_id;
