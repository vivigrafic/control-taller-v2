-- ============================================================================
-- DTF con otra fecha (29/10/2026, pedido del dueño): las impresiones que se hicieron y no se cargaron en el momento
-- (ej.: anoche) se procesan con la fecha y hora en que se imprimieron, para que no figuren como de hoy.
--   taller_dtf_imprimir: p.fecha (opcional). La tirada, sus archivos (prod_dtf_pedidos) y la fila (impreso_at) quedan
--     con esa fecha; si se carga más de media hora después, la nota de la tirada dice cuándo se cargó.
--   taller_dtf_tirada_editar: p.fecha_hora (opcional) corrige la fecha de una tirada ya cargada, con sus archivos.
--   La fecha no puede ser en el futuro ni de hace más de 60 días. La venta no cambia: se hace el día que se vende.
-- Volver atrás: 20261029130000_dtf_fecha_impresion_down.sql
-- ============================================================================

-- Imprimir en DTF (una tirada con los archivos marcados). p: { pendientes, id_rollo_dtf, metros_rip, observaciones, fecha,
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
  v_fecha timestamptz := now();   -- cuándo se imprimió (p.fecha: si se carga después, no figura como de hoy)
  v_tarde text;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if nullif(p->>'fecha', '') is not null then
    begin v_fecha := (p->>'fecha')::timestamptz;
    exception when others then raise exception 'La fecha de impresión no es válida.'; end;
    if v_fecha > now() + interval '10 minutes' then raise exception 'La fecha de impresión no puede ser en el futuro.'; end if;
    if v_fecha < now() - interval '60 days' then raise exception 'La fecha de impresión no puede ser de hace más de 60 días.'; end if;
  end if;
  -- Si se carga más de media hora después, la nota lo dice
  v_tarde := case when v_fecha < now() - interval '30 minutes'
                  then 'Cargada el ' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') end;
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
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, fecha_hora, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones)
  values (v_emp, v_codigo, v_fecha, v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), v_completos + v_partes > 1,
          v_rip, 0, concat_ws(' · ', v_obs, case when v_partes > 0 then format('El rollo se terminó: %s archivo(s) a medias', v_partes) end, v_tarde))
  returning id into v_tirada;

  -- Un pedido por archivo completo (lo que se vende, con sus metros completos aunque haya salido en dos partes)
  insert into public.prod_dtf_pedidos (empresa_id, tirada_id, pendiente_id, fecha_hora, cliente, nombre_archivo, file_id, tipo_cargo,
                                       metros_archivo, metros_facturados, estado_entrega, observaciones)
  select v_emp, v_tirada, pd.id, v_fecha, coalesce(nullif(trim(pd.cliente), ''), 'SIN CLIENTE'), pd.nombre_archivo, coalesce(pd.file_id, ''), c.cargo,
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
  update public.prod_pendientes_drive set estado_impreso = 'SI', impreso_at = v_fecha where id in (select id from _dtf_salio where estado = 'completo');
  update public.prod_pendientes_drive pd set metros_impresos_parcial = coalesce(pd.metros_impresos_parcial, 0) + s.metros,
    parcial_detalle = concat_ws(' · ', pd.parcial_detalle, format('%s m en el rollo %s (%s)', trim_scale(s.metros), v_rollo.id_rollo_dtf, v_codigo))
  from _dtf_salio s where s.id = pd.id and s.estado = 'parte';
  if v_terminado then
    update public.prod_dtf_rollos set estado = 'Terminado' where id_rollo_dtf = v_rollo.id_rollo_dtf and empresa_id = v_emp;
  end if;

  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_TIRADA', format('Tirada %s: %s archivo(s) completos%s, %s m del rollo %s%s', v_codigo, v_completos,
          case when v_partes > 0 then format(' y %s a medias', v_partes) else '' end, trim_scale(v_rip), v_rollo.id_rollo_dtf,
          case when v_terminado then ' (el rollo se terminó)' else '' end)
          || case when v_tarde is not null then format(' · impresa el %s', to_char(v_fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')) else '' end,
          public.usuario_actual());
  return jsonb_build_object('tirada_id', v_tirada, 'codigo', v_codigo, 'archivos', v_completos, 'partes', v_partes, 'metros', v_metros, 'metros_rip', v_rip, 'fecha', v_fecha);
end $$;

-- Corregir una tirada: rollo, metros, desperdicio, nota y fecha de impresión
create or replace function public.taller_dtf_tirada_editar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  t public.prod_dtf_tiradas%rowtype;
  v_rollo public.prod_dtf_rollos%rowtype;
  v_cons numeric := round(nullif(p->>'metros_consumidos', '')::numeric, 2);
  v_desp numeric := round(nullif(p->>'metros_desperdicio', '')::numeric, 2);
  v_cambios text[] := '{}';
  v_fecha timestamptz;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select * into t from public.prod_dtf_tiradas where id = (p->>'id')::uuid and empresa_id = v_emp and not anulado for update;
  if not found then raise exception 'No encontré esa tirada.'; end if;
  if nullif(p->>'fecha_hora', '') is not null then
    begin v_fecha := (p->>'fecha_hora')::timestamptz;
    exception when others then raise exception 'La fecha de impresión no es válida.'; end;
    if v_fecha > now() + interval '10 minutes' then raise exception 'La fecha de impresión no puede ser en el futuro.'; end if;
    if v_fecha < now() - interval '60 days' then raise exception 'La fecha de impresión no puede ser de hace más de 60 días.'; end if;
  end if;
  if v_fecha is not null and abs(extract(epoch from v_fecha - t.fecha_hora)) >= 60 then
    v_cambios := array_append(v_cambios, format('fecha %s → %s', to_char(t.fecha_hora at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'),
                                                to_char(v_fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')));
    update public.prod_dtf_tiradas set fecha_hora = v_fecha where id = t.id;
    -- Los archivos de la tirada (también los ya vendidos: la fecha no cambia la venta)
    perform set_config('vg.taller_sistema', '1', true);
    update public.prod_dtf_pedidos set fecha_hora = v_fecha where tirada_id = t.id and not anulado;
    perform set_config('vg.taller_sistema', '', true);
    update public.prod_pendientes_drive pd set impreso_at = v_fecha
    from public.prod_dtf_pedidos d where d.tirada_id = t.id and not d.anulado and d.pendiente_id = pd.id and pd.estado_impreso = 'SI';
  end if;
  if nullif(p->>'id_rollo_dtf', '') is not null and p->>'id_rollo_dtf' <> t.id_rollo_dtf then
    select * into v_rollo from public.prod_dtf_rollos where id_rollo_dtf = p->>'id_rollo_dtf' and empresa_id = v_emp and not anulado;
    if not found then raise exception 'Ese rollo de film no existe.'; end if;
    v_cambios := array_append(v_cambios, format('rollo %s → %s', t.id_rollo_dtf, v_rollo.id_rollo_dtf));
    update public.prod_dtf_tiradas set id_rollo_dtf = v_rollo.id_rollo_dtf, marca_rollo = coalesce(v_rollo.marca_fabricante, marca_rollo) where id = t.id;
  end if;
  if v_cons is not null and v_cons is distinct from t.metros_consumidos_rollo then
    if v_cons < 0 then raise exception 'Los metros no pueden ser negativos.'; end if;
    v_cambios := array_append(v_cambios, format('metros del rollo %s → %s', trim_scale(coalesce(t.metros_consumidos_rollo, 0)), trim_scale(v_cons)));
    update public.prod_dtf_tiradas set metros_consumidos_rollo = v_cons where id = t.id;
  end if;
  if v_desp is not null and v_desp is distinct from t.metros_desperdicio then
    if v_desp < 0 then raise exception 'Los metros no pueden ser negativos.'; end if;
    v_cambios := array_append(v_cambios, format('desperdicio %s → %s', trim_scale(coalesce(t.metros_desperdicio, 0)), trim_scale(v_desp)));
    update public.prod_dtf_tiradas set metros_desperdicio = v_desp where id = t.id;
  end if;
  if p ? 'observaciones' and coalesce(p->>'observaciones', '') is distinct from coalesce(t.observaciones, '') then
    v_cambios := array_append(v_cambios, 'nota');
    update public.prod_dtf_tiradas set observaciones = trim(coalesce(p->>'observaciones', '')) where id = t.id;
  end if;
  if array_length(v_cambios, 1) > 0 then
    insert into public.v3_bitacora (tipo_evento, detalle, usuario)
    values ('TALLER_DTF_TIRADA_EDITADA', format('%s: %s', t.codigo_tirada, array_to_string(v_cambios, ', ')), public.usuario_actual());
  end if;
  return jsonb_build_object('ok', true, 'cambios', to_jsonb(v_cambios));
end $$;
