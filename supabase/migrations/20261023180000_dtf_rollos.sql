-- ============================================================================
-- DTF: rollos de film (23/10/2026)
-- 1. taller_dtf_imprimir: el saldo del rollo (v_prod_dtf_rollos_saldos) suma metros_consumidos_rollo + metros_desperdicio,
--    y la función guardaba los metros del RIP en el primero y la diferencia en el segundo: el sobrante se contaba dos veces
--    cuando se cargaban los metros del RIP. Ahora va como el formulario de siempre (todo en consumido, desperdicio 0).
--    Ninguna tirada real quedó mal (nunca se cargaron los metros del RIP hasta hoy).
-- 2. taller_dtf_rollo_nuevo: montar un rollo nuevo. El código lo pone el sistema (numeración que sigue la del último
--    rollo: DTF-60-001 → DTF-60-002...), queda Activo, y el que estaba puesto pasa a Terminado (o a En stock si le quedan
--    metros). La marca, el perfil y los metros iniciales los propone la pantalla según el último rollo.
-- Volver atrás: 20261023180000_dtf_rollos_down.sql
-- ============================================================================

create or replace function public.taller_dtf_imprimir(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ids uuid[];
  v_n integer;
  v_metros numeric;
  v_rip numeric := nullif(p->>'metros_rip', '')::numeric;
  v_rollo public.prod_dtf_rollos%rowtype;
  v_tirada uuid;
  v_codigo text;
  v_obs text := nullif(trim(coalesce(p->>'observaciones', '')), '');
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p->'pendientes', '[]'::jsonb)) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Marcá los archivos que se imprimieron.'; end if;
  select * into v_rollo from public.prod_dtf_rollos where id_rollo_dtf = p->>'id_rollo_dtf' and empresa_id = v_emp and not anulado;
  if not found then raise exception 'Elegí el rollo de film.'; end if;

  perform 1 from public.prod_pendientes_drive where id = any (v_ids) for update;
  select count(*), coalesce(sum(metros_totales), 0) into v_n, v_metros
  from public.prod_pendientes_drive
  where id = any (v_ids) and empresa_id = v_emp and modulo = 'DTF' and not anulado and estado_impreso <> 'SI';
  if v_n <> array_length(v_ids, 1) then
    raise exception 'Algún archivo ya se imprimió o ya no está en la fila. Actualizá la pantalla.';
  end if;
  v_rip := coalesce(v_rip, v_metros);
  if v_rip <= 0 then raise exception 'Poné los metros que se usaron del rollo.'; end if;

  -- Una tirada con todos los archivos (anidados en el RIP). Lo usado del rollo va entero en metros_consumidos_rollo
  -- (como el formulario de siempre): el saldo del rollo suma consumido + desperdicio, así que el desperdicio va en 0.
  v_codigo := 'DTF-' || lpad(((select count(*) from public.prod_dtf_tiradas where empresa_id = v_emp) + 1)::text, 5, '0');
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones)
  values (v_emp, v_codigo, v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), v_n > 1,
          round(v_rip, 2), 0, coalesce(v_obs, ''))
  returning id into v_tirada;

  -- Un pedido por archivo: es lo que después se vende (o queda sin cargo si es reposición o muestra)
  insert into public.prod_dtf_pedidos (empresa_id, tirada_id, pendiente_id, cliente, nombre_archivo, file_id, tipo_cargo,
                                       metros_archivo, metros_facturados, estado_entrega, observaciones)
  select v_emp, v_tirada, pd.id, coalesce(nullif(trim(pd.cliente), ''), 'SIN CLIENTE'), pd.nombre_archivo, coalesce(pd.file_id, ''), c.cargo,
         coalesce(pd.metros_totales, 0), case when c.cargo = 'VENTA' then coalesce(pd.metros_totales, 0) else 0 end, 'Impreso', coalesce(v_obs, '')
  from public.prod_pendientes_drive pd
  cross join lateral (select case when upper(coalesce(pd.es_repo_muestra, '')) like 'REPO%' then 'REPOSICION'
                                  when upper(coalesce(pd.es_repo_muestra, '')) like 'MUESTRA%' then 'MUESTRA'
                                  else 'VENTA' end as cargo) c
  where pd.id = any (v_ids)
  order by pd.cliente, pd.nombre_archivo;

  -- Salen de la fila: el vigía de Google los mueve a IMPRESOS (suelto → "0001 IMPRESOS"; en carpeta → su "IMPRESOS")
  update public.prod_pendientes_drive set estado_impreso = 'SI' where id = any (v_ids);

  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_TIRADA', format('Tirada %s: %s archivo(s), %s m de archivos, %s m del rollo %s', v_codigo, v_n,
          trim_scale(v_metros), trim_scale(round(v_rip, 2)), v_rollo.id_rollo_dtf), public.usuario_actual());
  return jsonb_build_object('tirada_id', v_tirada, 'codigo', v_codigo, 'archivos', v_n, 'metros', v_metros, 'metros_rip', round(v_rip, 2));
end $$;

-- p: { marca, perfil, metros_iniciales, ancho_cm, observaciones }
create or replace function public.taller_dtf_rollo_nuevo(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_marca text := nullif(trim(regexp_replace(coalesce(p->>'marca', ''), '\s+', ' ', 'g')), '');
  v_perfil text := nullif(trim(regexp_replace(coalesce(p->>'perfil', ''), '\s+', ' ', 'g')), '');
  v_metros numeric := coalesce(nullif(p->>'metros_iniciales', '')::numeric, 100);
  v_ancho numeric := nullif(p->>'ancho_cm', '')::numeric;
  v_ultimo text;
  v_prefijo text;
  v_largo integer;
  v_n integer;
  v_codigo text;
  v_antes text[] := '{}';
  r record;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if v_marca is null then raise exception 'Elegí la marca del film.'; end if;
  if v_perfil is null then raise exception 'Elegí el perfil de impresión.'; end if;
  if v_metros <= 0 or v_metros > 2000 then raise exception 'Revisá los metros del rollo.'; end if;

  perform pg_advisory_xact_lock(hashtext('taller_dtf_rollo_nuevo:' || v_emp::text));
  -- El código sigue la numeración del último rollo: mismo prefijo, número siguiente
  select id_rollo_dtf, coalesce(v_ancho, ancho_cm) into v_ultimo, v_ancho
  from public.prod_dtf_rollos where empresa_id = v_emp and id_rollo_dtf ~ '\d+$' order by fecha_montaje desc limit 1;
  v_prefijo := coalesce(substring(v_ultimo from '^(.*?)\d+$'), 'DTF-' || coalesce(v_ancho, 60)::integer || '-');
  v_largo := greatest(coalesce(length(substring(v_ultimo from '(\d+)$')), 3), 3);
  select coalesce(max(substring(id_rollo_dtf from '(\d+)$')::integer), 0) + 1 into v_n
  from public.prod_dtf_rollos where empresa_id = v_emp and left(id_rollo_dtf, length(v_prefijo)) = v_prefijo
    and substring(id_rollo_dtf from length(v_prefijo) + 1) ~ '^\d+$';
  v_codigo := v_prefijo || lpad(v_n::text, v_largo, '0');

  -- El que estaba puesto sale de la máquina: terminado, o guardado si todavía le queda film
  for r in select s.id_rollo_dtf, s.metros_restantes_reales from public.v_prod_dtf_rollos_saldos s
           join public.prod_dtf_rollos x on x.id_rollo_dtf = s.id_rollo_dtf
           where x.empresa_id = v_emp and x.estado = 'Activo' and not x.anulado loop
    update public.prod_dtf_rollos set estado = case when r.metros_restantes_reales > 0.5 then 'En Stock' else 'Terminado' end
    where id_rollo_dtf = r.id_rollo_dtf;
    v_antes := v_antes || r.id_rollo_dtf;
  end loop;

  insert into public.prod_dtf_rollos (id_rollo_dtf, empresa_id, marca_fabricante, perfil_impresion, ancho_cm, metros_iniciales, estado,
                                      observaciones, fecha_montaje)
  values (v_codigo, v_emp, v_marca, v_perfil, coalesce(v_ancho, 60), v_metros, 'Activo', coalesce(nullif(trim(p->>'observaciones'), ''), ''), now());

  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_ROLLO', format('Rollo nuevo %s: %s, %s, %s m%s', v_codigo, v_marca, v_perfil, trim_scale(v_metros),
          case when array_length(v_antes, 1) > 0 then ' (sale ' || array_to_string(v_antes, ', ') || ')' else '' end), public.usuario_actual());
  return jsonb_build_object('id_rollo_dtf', v_codigo, 'sale', to_jsonb(v_antes));
end $$;

revoke execute on function public.taller_dtf_rollo_nuevo(jsonb) from public, anon;
grant execute on function public.taller_dtf_rollo_nuevo(jsonb) to authenticated;
comment on function public.taller_dtf_rollo_nuevo(jsonb) is 'Monta un rollo de film DTF: código con numeración del sistema, queda Activo y el anterior sale de la máquina.';
