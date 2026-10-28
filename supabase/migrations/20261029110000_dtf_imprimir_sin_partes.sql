-- ============================================================================
-- Arreglo (28/10/2026): al imprimir en DTF sin tildar "el rollo se terminó en el medio", la pantalla manda
-- partes: null y taller_dtf_imprimir fallaba con "cannot extract elements from a scalar". Ahora, si partes o
-- pendientes no son una lista, se toman como lista vacía (todo salió completo, como siempre).
-- Volver atrás: 20261029110000_dtf_imprimir_sin_partes_down.sql
-- ============================================================================

-- Imprimir en DTF (una tirada con los archivos marcados). p: { pendientes, id_rollo_dtf, metros_rip, observaciones,
--   partes: [{ id, estado: completo | parte | nada, metros }] (si el rollo se terminó en el medio), rollo_terminado,
--   cargo_reimpresion: VENTA | REPOSICION (para los que ya se habían impreso) }
create or replace function public.taller_dtf_imprimir(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ids uuid[];
  v_n integer;
  v_rip numeric := nullif(p->>'metros_rip', '')::numeric;
  v_rollo public.prod_dtf_rollos%rowtype;
  v_tirada uuid;
  v_codigo text;
  v_obs text := nullif(trim(coalesce(p->>'observaciones', '')), '');
  v_cargo_re text := case when upper(coalesce(p->>'cargo_reimpresion', '')) = 'REPOSICION' then 'REPOSICION' else 'VENTA' end;
  v_terminado boolean := coalesce(nullif(p->>'rollo_terminado', '')::boolean, false);
  v_completos integer;
  v_partes integer;
  v_usado numeric;
  v_metros numeric;
  v_mal text;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(case when jsonb_typeof(p->'pendientes') = 'array' then p->'pendientes' else '[]'::jsonb end) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Marcá los archivos que se imprimieron.'; end if;
  select * into v_rollo from public.prod_dtf_rollos where id_rollo_dtf = p->>'id_rollo_dtf' and empresa_id = v_emp and not anulado;
  if not found then raise exception 'Elegí el rollo de film.'; end if;

  perform 1 from public.prod_pendientes_drive where id = any (v_ids) for update;
  select count(*) into v_n from public.prod_pendientes_drive
  where id = any (v_ids) and empresa_id = v_emp and modulo = 'DTF' and not anulado and estado_impreso <> 'SI';
  if v_n <> array_length(v_ids, 1) then
    raise exception 'Algún archivo ya se imprimió o ya no está en la fila. Actualizá la pantalla.';
  end if;

  -- Cómo salió cada archivo: completo (lo de siempre), una parte o nada (el rollo se terminó en el medio)
  create temp table if not exists _dtf_salio (id uuid, estado text, metros numeric, falta numeric) on commit drop;
  delete from _dtf_salio where true;
  insert into _dtf_salio
  select pd.id, coalesce(e.estado, 'completo'),
         case coalesce(e.estado, 'completo') when 'completo' then greatest(coalesce(pd.metros_totales, 0) - coalesce(pd.metros_impresos_parcial, 0), 0)
                                              when 'parte' then e.metros else 0 end,
         greatest(coalesce(pd.metros_totales, 0) - coalesce(pd.metros_impresos_parcial, 0), 0)
  from public.prod_pendientes_drive pd
  left join (select (x->>'id')::uuid as id, x->>'estado' as estado, round(nullif(x->>'metros', '')::numeric, 2) as metros
             from jsonb_array_elements(case when jsonb_typeof(p->'partes') = 'array' then p->'partes' else '[]'::jsonb end) x) e on e.id = pd.id
  where pd.id = any (v_ids);
  if exists (select 1 from _dtf_salio where estado not in ('completo', 'parte', 'nada')) then raise exception 'Estado de archivo inválido.'; end if;
  select string_agg(pd.nombre_archivo, ', ') into v_mal from _dtf_salio s join public.prod_pendientes_drive pd on pd.id = s.id
  where s.estado = 'parte' and (coalesce(s.metros, 0) <= 0 or (s.falta > 0 and s.metros >= s.falta));
  if v_mal is not null then raise exception 'En "salió una parte" poné los metros que salieron (más de 0 y menos de lo que falta): %', v_mal; end if;
  select count(*) filter (where estado = 'completo'), count(*) filter (where estado = 'parte'), coalesce(sum(metros), 0)
  into v_completos, v_partes, v_usado from _dtf_salio;
  if v_completos + v_partes = 0 then raise exception 'No salió ningún archivo: no hay nada que registrar.'; end if;
  v_rip := round(coalesce(v_rip, v_usado), 2);
  if v_rip <= 0 then raise exception 'Poné los metros que se usaron del rollo.'; end if;
  select coalesce(sum(pd.metros_totales), 0) into v_metros from _dtf_salio s join public.prod_pendientes_drive pd on pd.id = s.id where s.estado = 'completo';

  -- Una tirada con todo lo que salió (lo que salió a medias también gasta film)
  v_codigo := 'DTF-' || lpad(((select count(*) from public.prod_dtf_tiradas where empresa_id = v_emp) + 1)::text, 5, '0');
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones)
  values (v_emp, v_codigo, v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), v_completos + v_partes > 1,
          v_rip, 0, concat_ws(' · ', v_obs, case when v_partes > 0 then format('El rollo se terminó: %s archivo(s) a medias', v_partes) end))
  returning id into v_tirada;

  -- Un pedido por archivo completo (lo que se vende, con sus metros completos aunque haya salido en dos partes)
  insert into public.prod_dtf_pedidos (empresa_id, tirada_id, pendiente_id, cliente, nombre_archivo, file_id, tipo_cargo,
                                       metros_archivo, metros_facturados, estado_entrega, observaciones)
  select v_emp, v_tirada, pd.id, coalesce(nullif(trim(pd.cliente), ''), 'SIN CLIENTE'), pd.nombre_archivo, coalesce(pd.file_id, ''), c.cargo,
         coalesce(pd.metros_totales, 0), case when c.cargo = 'VENTA' then coalesce(pd.metros_totales, 0) else 0 end, 'Impreso',
         concat_ws(' · ', v_obs,
           case when coalesce(pd.metros_impresos_parcial, 0) > 0 then 'Salió en partes: ' || coalesce(pd.parcial_detalle, '') end,
           case when pd.ya_impreso_at is not null then format('Reimpresión (ya se había impreso el %s)', to_char(pd.ya_impreso_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')) end)
  from _dtf_salio s
  join public.prod_pendientes_drive pd on pd.id = s.id
  cross join lateral (select case when upper(coalesce(pd.es_repo_muestra, '')) like 'REPO%' then 'REPOSICION'
                                  when upper(coalesce(pd.es_repo_muestra, '')) like 'MUESTRA%' then 'MUESTRA'
                                  when pd.ya_impreso_at is not null then v_cargo_re
                                  else 'VENTA' end as cargo) c
  where s.estado = 'completo'
  order by pd.cliente, pd.nombre_archivo;

  -- Lo completo sale de la fila (el vigía lo mueve a IMPRESOS); lo que salió a medias queda con lo que falta
  update public.prod_pendientes_drive set estado_impreso = 'SI' where id in (select id from _dtf_salio where estado = 'completo');
  update public.prod_pendientes_drive pd set metros_impresos_parcial = coalesce(pd.metros_impresos_parcial, 0) + s.metros,
    parcial_detalle = concat_ws(' · ', pd.parcial_detalle, format('%s m en el rollo %s (%s)', trim_scale(s.metros), v_rollo.id_rollo_dtf, v_codigo))
  from _dtf_salio s where s.id = pd.id and s.estado = 'parte';
  if v_terminado then
    update public.prod_dtf_rollos set estado = 'Terminado' where id_rollo_dtf = v_rollo.id_rollo_dtf and empresa_id = v_emp;
  end if;

  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_TIRADA', format('Tirada %s: %s archivo(s) completos%s, %s m del rollo %s%s', v_codigo, v_completos,
          case when v_partes > 0 then format(' y %s a medias', v_partes) else '' end, trim_scale(v_rip), v_rollo.id_rollo_dtf,
          case when v_terminado then ' (el rollo se terminó)' else '' end), public.usuario_actual());
  return jsonb_build_object('tirada_id', v_tirada, 'codigo', v_codigo, 'archivos', v_completos, 'partes', v_partes, 'metros', v_metros, 'metros_rip', v_rip);
end $$;
