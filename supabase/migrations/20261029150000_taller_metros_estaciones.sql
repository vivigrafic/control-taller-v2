-- ============================================================================
-- Metros de cada estación calculados en la base (29/10/2026, pedido del dueño: "revisá todo el taller").
-- La app sumaba los cuadros (Diario, Semanal, Mensual, Este Año, Histórico) y Métricas con las últimas 500 filas que
-- trae: con 693 impresiones y 613 calandrados, "Este Año" e "Histórico" daban de menos (impresión: 14.323 m en vez de
-- 20.202 m). taller_metros_estaciones() suma todo, con las mismas ventanas que la pantalla (hora de Buenos Aires,
-- la semana arranca el lunes):
--   impresion: prod_impresiones "Impresion Normal" (fecha_hora, metros_impresos)
--   calandrado / laser: lo terminado (fecha_terminado; si falta, la de ingreso) y sus metros
--   dtf: las tiradas (consumido + desperdicio, como el saldo del rollo)
-- Volver atrás: 20261029150000_taller_metros_estaciones_down.sql
-- ============================================================================

create or replace function public.taller_metros_estaciones()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ahora timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  r jsonb;
begin
  if v_emp is null or not public.tengo_permiso('taller') then return '{}'::jsonb; end if;
  with filas as (
    select 'impresion' as est, fecha_hora at time zone 'America/Argentina/Buenos_Aires' as f, coalesce(metros_impresos, 0) as m
    from public.prod_impresiones where empresa_id = v_emp and not anulado and accion = 'Impresion Normal'
    union all
    select 'calandrado', coalesce(fecha_terminado, fecha_hora) at time zone 'America/Argentina/Buenos_Aires', coalesce(metros, 0)
    from public.prod_cola_calandrado where empresa_id = v_emp and not anulado and estado ilike '%terminado%'
    union all
    select 'laser', coalesce(fecha_terminado, fecha_ingreso) at time zone 'America/Argentina/Buenos_Aires', coalesce(metros, 0)
    from public.prod_cola_laser where empresa_id = v_emp and not anulado and estado ilike '%terminado%'
    union all
    select 'dtf', fecha_hora at time zone 'America/Argentina/Buenos_Aires', coalesce(metros_consumidos_rollo, 0) + coalesce(metros_desperdicio, 0)
    from public.prod_dtf_tiradas where empresa_id = v_emp and not anulado
  ), v as (
    select date_trunc('day', v_ahora) as hoy, date_trunc('week', v_ahora) as sem, date_trunc('month', v_ahora) as mes, date_trunc('year', v_ahora) as anio
  )
  select coalesce(jsonb_object_agg(est, jsonb_build_object(
           'hoy', hoy, 'ayer', ayer, 'semana', semana, 'semana_ant', semana_ant, 'mes', mes, 'mes_ant', mes_ant, 'anio', anio, 'historico', historico)), '{}'::jsonb)
  into r
  from (
    select f.est,
      round(coalesce(sum(m) filter (where f >= v.hoy), 0), 2) as hoy,
      round(coalesce(sum(m) filter (where f >= v.hoy - interval '1 day' and f < v.hoy), 0), 2) as ayer,
      round(coalesce(sum(m) filter (where f >= v.sem), 0), 2) as semana,
      round(coalesce(sum(m) filter (where f >= v.sem - interval '7 days' and f < v.sem), 0), 2) as semana_ant,
      round(coalesce(sum(m) filter (where f >= v.mes), 0), 2) as mes,
      round(coalesce(sum(m) filter (where f >= v.mes - interval '1 month' and f < v.mes), 0), 2) as mes_ant,
      round(coalesce(sum(m) filter (where f >= v.anio), 0), 2) as anio,
      round(coalesce(sum(m), 0), 2) as historico
    from filas f cross join v group by f.est
  ) x;
  return r;
end $$;

revoke execute on function public.taller_metros_estaciones() from public, anon;
grant execute on function public.taller_metros_estaciones() to authenticated;
