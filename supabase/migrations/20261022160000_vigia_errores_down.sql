-- Vuelve atrás 20261022160000_vigia_errores.sql
drop function if exists public.taller_archivos_conocidos(text);
drop function if exists public.taller_vigia_movido(text, uuid, boolean, text);
create function public.taller_vigia_movido(p_clave text, p_id uuid, p_en_impresos boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  update public.prod_pendientes_drive set en_impresos = p_en_impresos where id = p_id and empresa_id = v_emp;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.taller_vigia_movido(text, uuid, boolean) from public;
grant execute on function public.taller_vigia_movido(text, uuid, boolean) to anon, authenticated;

create or replace function public.taller_vigia_tareas(p_clave text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  return jsonb_build_object(
    'a_impresos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'file_id', file_id)) from (select id, file_id from public.prod_pendientes_drive
                  where empresa_id = v_emp and estado_impreso = 'SI' and not en_impresos and not anulado limit 200) s), '[]'::jsonb),
    'a_fila', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'file_id', file_id)) from (select id, file_id from public.prod_pendientes_drive
              where empresa_id = v_emp and estado_impreso = 'NO' and en_impresos and not anulado limit 200) s), '[]'::jsonb));
end $$;

alter table public.prod_pendientes_drive drop column if exists vigia_error_at;
alter table public.prod_pendientes_drive drop column if exists vigia_error;
