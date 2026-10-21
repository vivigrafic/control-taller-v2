-- ============================================================================
-- Vigía de Drive: si no puede mover un archivo, lo dice (22/10/2026)
-- Antes, si Google no dejaba ver la carpeta del archivo, el vigía lo marcaba como movido sin moverlo.
-- Ahora el vigía comprueba que el archivo quedó en IMPRESOS; si no, anota el motivo (vigia_error) y lo reintenta
-- cada 10 minutos. La app avisa los archivos impresos que no se pudieron mover.
-- Volver atrás: 20261022160000_vigia_errores_down.sql
-- ============================================================================

alter table public.prod_pendientes_drive add column if not exists vigia_error text;
alter table public.prod_pendientes_drive add column if not exists vigia_error_at timestamptz;

create or replace function public.taller_vigia_tareas(p_clave text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  return jsonb_build_object(
    'a_impresos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'file_id', file_id)) from (select id, file_id from public.prod_pendientes_drive
                  where empresa_id = v_emp and estado_impreso = 'SI' and not en_impresos and not anulado
                    and (vigia_error_at is null or vigia_error_at < now() - interval '10 minutes') limit 200) s), '[]'::jsonb),
    'a_fila', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'file_id', file_id)) from (select id, file_id from public.prod_pendientes_drive
              where empresa_id = v_emp and estado_impreso = 'NO' and en_impresos and not anulado
                and (vigia_error_at is null or vigia_error_at < now() - interval '10 minutes') limit 200) s), '[]'::jsonb));
end $$;

-- p_error: el vigía no pudo mover el archivo (queda el motivo y se reintenta más tarde)
drop function if exists public.taller_vigia_movido(text, uuid, boolean);
create function public.taller_vigia_movido(p_clave text, p_id uuid, p_en_impresos boolean, p_error text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  if nullif(trim(coalesce(p_error, '')), '') is not null then
    update public.prod_pendientes_drive set vigia_error = left(p_error, 300), vigia_error_at = now() where id = p_id and empresa_id = v_emp;
  else
    update public.prod_pendientes_drive set en_impresos = p_en_impresos, vigia_error = null, vigia_error_at = null where id = p_id and empresa_id = v_emp;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.taller_vigia_movido(text, uuid, boolean, text) from public;
grant execute on function public.taller_vigia_movido(text, uuid, boolean, text) to anon, authenticated;

-- Los archivos de Drive que conoce la app (para sacarles el "cualquiera con el enlace" que dejaba la versión de prueba)
create or replace function public.taller_archivos_conocidos(p_clave text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  return coalesce((select jsonb_agg(file_id order by file_id) from (
    select file_id from public.prod_pendientes_drive where empresa_id = v_emp
    union select file_id from public.prod_impresiones where empresa_id = v_emp
    union select file_id from public.prod_cola_calandrado where empresa_id = v_emp) s
    where file_id is not null and file_id !~ '^(LOCAL|MANUAL|BATCH)-' and length(file_id) between 20 and 80), '[]'::jsonb);
end $$;
revoke execute on function public.taller_archivos_conocidos(text) from public;
grant execute on function public.taller_archivos_conocidos(text) to anon, authenticated;
