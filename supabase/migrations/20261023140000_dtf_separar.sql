-- ============================================================================
-- DTF: separar a pantalla completa (fase 3 del plan Imprimir → Separar → Vender, 23/10/2026)
-- 1. Cola de ventas: cuánto le falta imprimir a cada cliente (archivos suyos todavía en la fila) y el precio del
--    trabajo entero. Muchos trabajos grandes se entregan por partes pero se cobran juntos al final (ej. IVAN, 165 m).
-- 2. taller_dtf_pedidos devuelve el nombre limpio y si cada impresión ya se separó.
-- 3. taller_dtf_separar: marca (o desmarca) impresiones separadas para entregar.
-- 4. taller_dtf_falla: anota la falla y, si se reimprime, el archivo vuelve solo a la fila como REPOSICIÓN (sin cargo):
--    el vigía de Google lo saca de IMPRESOS.
-- Volver atrás: 20261023140000_dtf_separar_down.sql
-- ============================================================================

-- 1. Cola de ventas con lo que falta imprimir
create or replace function public.taller_dtf_por_vender()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_item uuid;
  v_res jsonb;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  -- Los precios solo los ve quien puede vender
  if public.tengo_permiso('ventas') then
    v_item := coalesce(
      (select i.id from public.v3_items i join public.empresas e on e.id = v_emp
       where i.id::text = e.taller_config->>'item_dtf' and i.activo),
      (select id from public.v3_items where empresa_id = v_emp and activo and se_vende and categoria = 'DTF'
       and nombre ilike 'Impresión DTF%' order by created_at limit 1));
  end if;

  with ped as (
    select p.id, p.fecha_hora, p.cliente, p.nombre_archivo, p.file_id, p.grupo_venta, p.separado_at, p.cliente_id,
           coalesce(nullif(p.metros_facturados, 0), p.metros_archivo, 0) as metros,
           coalesce(public.dtf_nombre_limpio(p.cliente), 'SIN NOMBRE') as limpio
    from public.prod_dtf_pedidos p
    where p.empresa_id = v_emp and not p.anulado and p.tipo_cargo = 'VENTA'
      and not exists (select 1 from public.v3_comprobantes v where v.id = p.comprobante_id and v.estado <> 'anulado')
  ), cli as (
    select ped.*, public.nombre_clave(ped.limpio) as clave,
           coalesce(ped.cliente_id, a.cliente_id) as cli_id,
           case when ped.cliente_id is not null then 'elegido' when a.cliente_id is not null then 'recordado' end as cli_origen
    from ped
    left join public.v3_clientes_alias a on a.empresa_id = v_emp and a.activo and a.clave = public.nombre_clave(ped.limpio)
  ), g as (
    select coalesce('g:' || grupo_venta, 'c:' || cli_id, 't:' || coalesce(clave, '')) as grupo,
      array_agg(distinct limpio order by limpio) as nombres,
      array_agg(distinct clave) filter (where clave is not null) as claves,
      case when count(distinct cli_id) = 1 then min(cli_id) end as cliente_id,
      min(cli_origen) as cliente_origen,
      bool_or(grupo_venta is not null) as a_mano,
      count(*) as archivos, sum(metros) as metros, min(fecha_hora) as desde,
      jsonb_agg(jsonb_build_object('id', id, 'nombre_archivo', nombre_archivo, 'file_id', file_id, 'metros', metros,
                                   'fecha_hora', fecha_hora, 'nombre', limpio, 'separado', separado_at is not null)
                order by fecha_hora, nombre_archivo) as pedidos
    from cli
    group by 1
  ), pend as (
    -- Lo del mismo cliente que sigue en la fila sin imprimir (las reposiciones y muestras no se cobran)
    select coalesce('c:' || a.cliente_id, 't:' || coalesce(public.nombre_clave(x.limpio), '')) as grupo,
           count(*) as archivos, sum(x.metros) as metros
    from (select coalesce(public.dtf_nombre_limpio(pd.cliente), 'SIN NOMBRE') as limpio, coalesce(pd.metros_totales, 0) as metros
          from public.prod_pendientes_drive pd
          where pd.empresa_id = v_emp and pd.modulo = 'DTF' and not pd.anulado and pd.estado_impreso <> 'SI'
            and upper(coalesce(pd.es_repo_muestra, '')) not like 'REPO%'
            and upper(coalesce(pd.es_repo_muestra, '')) not like 'MUESTRA%') x
    left join public.v3_clientes_alias a on a.empresa_id = v_emp and a.activo and a.clave = public.nombre_clave(x.limpio)
    group by 1
  )
  select coalesce(jsonb_agg(t.x order by (t.x->>'metros')::numeric desc), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
             'clave', g.grupo, 'nombres', to_jsonb(g.nombres), 'a_mano', g.a_mano,
             'cliente_id', g.cliente_id, 'cliente_nombre', c.nombre_completo,
             'cliente_origen', case when g.cliente_id is not null then g.cliente_origen end,
             'sugerido', s.sug, 'archivos', g.archivos, 'metros', g.metros, 'desde', g.desde, 'pedidos', g.pedidos,
             'falta_archivos', coalesce(f.archivos, 0), 'falta_metros', coalesce(f.metros, 0))
           || case when (pr.p->>'precio') is not null
                   then jsonb_build_object('precio_metro', (pr.p->>'precio')::numeric,
                                           'total', round((pr.p->>'precio')::numeric * g.metros),
                                           'precio_origen', pr.p->>'origen')
                   else '{}'::jsonb end
           || case when (pt.p->>'precio') is not null
                   then jsonb_build_object('precio_metro_trabajo', (pt.p->>'precio')::numeric,
                                           'total_trabajo', round((pt.p->>'precio')::numeric * (g.metros + f.metros)))
                   else '{}'::jsonb end as x
    from g
    left join pend f on f.grupo = g.grupo and not g.a_mano
    left join public.v3_clientes c on c.id_cliente = g.cliente_id
    -- Propuesta: un solo cliente cuyo nombre (o lo que está entre paréntesis, o el negocio) es ese nombre
    left join lateral (
      select case when count(*) = 1 then jsonb_build_object('id', min(vc.id_cliente), 'nombre', min(vc.nombre_completo)) end as sug
      from public.v3_clientes vc
      where g.cliente_id is null and coalesce(array_length(g.claves, 1), 0) = 1
        and coalesce(vc.es_cliente, true) and vc.id_cliente <> 'CONSUMIDOR-FINAL'
        and g.claves[1] in (public.nombre_clave(vc.nombre_completo),
                            public.nombre_clave(regexp_replace(vc.nombre_completo, '\([^)]*\)', ' ', 'g')),
                            public.nombre_clave(substring(vc.nombre_completo from '\(([^)]*)\)')),
                            public.nombre_clave(vc.nombre_negocio))
    ) s on true
    -- (con case y no con where: así no se calcula nunca sin el ítem)
    left join lateral (
      select case when v_item is not null and g.metros > 0
                  then public.precio_sugerido(jsonb_build_object('item_id', v_item, 'cliente_id', g.cliente_id, 'cantidad', g.metros)) end as p
    ) pr on true
    -- Precio del trabajo entero (lo impreso más lo que falta): la escala sale por el total
    left join lateral (
      select case when v_item is not null and coalesce(f.metros, 0) > 0
                  then public.precio_sugerido(jsonb_build_object('item_id', v_item, 'cliente_id', g.cliente_id, 'cantidad', g.metros + f.metros)) end as p
    ) pt on true
  ) t;
  return v_res;
end $$;

-- 2. Los pedidos como los ve el taller, ahora con el nombre limpio y si ya se separó (cambia lo que devuelve)
drop function if exists public.taller_dtf_pedidos();
create function public.taller_dtf_pedidos()
returns table (id uuid, tirada_id uuid, fecha_hora timestamptz, cliente text, cliente_id text, cliente_sistema text,
               nombre_archivo text, tipo_cargo text, metros_archivo numeric, metros_dpi_real numeric, dpi_detectado integer,
               metros_a_vender numeric, estado_entrega text, observaciones text, file_id text, creado_por text,
               venta_id uuid, venta_numero text, vendido boolean,
               cliente_limpio text, pendiente_id uuid, separado_at timestamptz, separado_por text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  return query
  select p.id, p.tirada_id, p.fecha_hora, p.cliente::text, p.cliente_id::text, c.nombre_completo::text,
    p.nombre_archivo::text, p.tipo_cargo::text, p.metros_archivo::numeric, p.metros_dpi_real::numeric, p.dpi_detectado::integer,
    coalesce(nullif(p.metros_facturados, 0), p.metros_archivo)::numeric, p.estado_entrega::text, p.observaciones::text,
    p.file_id::text, p.creado_por::text, v.id, v.numero_comprobante::text, (v.id is not null),
    coalesce(public.dtf_nombre_limpio(p.cliente), 'SIN NOMBRE'), p.pendiente_id, p.separado_at, p.separado_por::text
  from public.prod_dtf_pedidos p
  left join public.v3_clientes c on c.id_cliente = p.cliente_id
  left join public.v3_comprobantes v on v.id = p.comprobante_id and v.estado <> 'anulado'
  where not p.anulado and p.empresa_id = public.mi_empresa()
  order by p.fecha_hora desc;
end $$;

-- 3. Marcar impresiones como separadas (o desmarcarlas). p: { pedidos: [ids], separado: true | false }
create or replace function public.taller_dtf_separar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ids uuid[];
  v_si boolean := coalesce(nullif(p->>'separado', '')::boolean, true);
  v_n integer;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p->'pedidos', '[]'::jsonb)) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'No hay impresiones para marcar.'; end if;
  update public.prod_dtf_pedidos
     set separado_at = case when v_si then coalesce(separado_at, now()) end,
         separado_por = case when v_si then coalesce(separado_por, public.usuario_actual()) end,
         estado_entrega = case when coalesce(estado_entrega, '') in ('', 'Impreso', 'Separado')
                               then case when v_si then 'Separado' else 'Impreso' end else estado_entrega end
   where id = any (v_ids) and empresa_id = v_emp and not anulado;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Esas impresiones ya no están. Actualizá la pantalla.'; end if;
  return jsonb_build_object('archivos', v_n, 'separado', v_si);
end $$;

-- 4. Falla en una impresión DTF. p: { pedido, motivo, metros, reimprimir }
create or replace function public.taller_dtf_falla(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ped public.prod_dtf_pedidos%rowtype;
  v_motivo text := nullif(trim(coalesce(p->>'motivo', '')), '');
  v_reimp boolean := coalesce(nullif(p->>'reimprimir', '')::boolean, true);
  v_metros numeric;
  v_rollo text;
  v_vuelve boolean := false;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select * into v_ped from public.prod_dtf_pedidos where id = nullif(p->>'pedido', '')::uuid and empresa_id = v_emp and not anulado;
  if not found then raise exception 'Esa impresión ya no está. Actualizá la pantalla.'; end if;
  if v_motivo is null then raise exception 'Escribí qué falló.'; end if;
  v_metros := coalesce(nullif(p->>'metros', '')::numeric, v_ped.metros_archivo, 0);
  select id_rollo_dtf into v_rollo from public.prod_dtf_tiradas where id = v_ped.tirada_id;

  insert into public.prod_fallas_reposiciones (empresa_id, tipo_registro, estacion, id_rollo, batch_id, archivo_afectado, metros_merma,
                                               detalle_reposicion, motivo, estado, file_id)
  values (v_emp, 'ALERTA_REPOSICION', 'DTF', coalesce(v_rollo, ''), coalesce(v_ped.tirada_id::text, ''), v_ped.nombre_archivo, v_metros,
          case when v_reimp then format('Reimprimir %s m', trim_scale(v_metros)) else 'Sin reimpresión' end,
          v_motivo, case when v_reimp then 'Pendiente' else 'Sin reposición' end, coalesce(v_ped.file_id, ''));

  -- Vuelve a la fila como reposición (sin cargo) y primero: el vigía saca el archivo de IMPRESOS
  if v_reimp and v_ped.pendiente_id is not null then
    update public.prod_pendientes_drive set estado_impreso = 'NO', es_repo_muestra = 'REPO', prioridad_maxima = true
    where id = v_ped.pendiente_id and empresa_id = v_emp and not anulado and estado_impreso = 'SI';
    v_vuelve := found;
  end if;

  update public.prod_dtf_pedidos set observaciones = concat_ws(' · ', nullif(trim(observaciones), ''), 'Falla: ' || v_motivo)
  where id = v_ped.id;

  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_FALLA', format('%s (%s): %s%s', v_ped.nombre_archivo, coalesce(v_ped.cliente, ''), v_motivo,
          case when v_vuelve then ' · vuelve a la fila como reposición' when v_reimp then ' · hay que volver a ponerlo en la fila' else '' end),
          public.usuario_actual());
  return jsonb_build_object('vuelve_a_la_fila', v_vuelve, 'reimprimir', v_reimp);
end $$;

revoke execute on function public.taller_dtf_pedidos(), public.taller_dtf_separar(jsonb), public.taller_dtf_falla(jsonb) from public, anon;
grant execute on function public.taller_dtf_pedidos(), public.taller_dtf_separar(jsonb), public.taller_dtf_falla(jsonb) to authenticated;
