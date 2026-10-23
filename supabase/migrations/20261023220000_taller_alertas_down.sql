-- Vuelve atrás 20261023220000_taller_alertas.sql (se pierden las alertas y su historial)
drop function if exists public.taller_alerta_hecha(jsonb);
drop function if exists public.taller_alerta_guardar(jsonb);
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'prod_alertas_hechas') then
    alter publication supabase_realtime drop table public.prod_alertas_hechas;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'prod_alertas') then
    alter publication supabase_realtime drop table public.prod_alertas;
  end if;
end $$;
drop table if exists public.prod_alertas_hechas;
drop table if exists public.prod_alertas;
