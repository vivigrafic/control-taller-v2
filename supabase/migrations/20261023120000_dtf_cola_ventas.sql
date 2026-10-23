-- ============================================================================
-- DTF: cola de ventas (fase 2 del plan Imprimir → Separar → Vender, 23/10/2026)
-- Lo impreso para vender se arma en tarjetas por cliente:
--   * el nombre se limpia ("VMG 22-10-26 [13.2 MTS]" → "VMG"), así lo de varios días cae junto;
--   * el cliente sale de lo elegido en el pedido, o de lo recordado ("llega como", v3_clientes_alias),
--     o se propone si el nombre coincide con un solo cliente (el que vende elige);
--   * se puede juntar archivos de varias tarjetas o sacar uno (grupo_venta) y volver a como estaba;
--   * con el permiso de ventas se ve el precio estimado (misma escala que usa la venta).
-- Necesita la migración del sistema 20261023100000_clientes_llega_como.sql (nombre_clave y v3_clientes_alias).
-- Volver atrás: 20261023120000_dtf_cola_ventas_down.sql
-- ============================================================================

-- Nombre de la carpeta o cliente sin fecha, sin [metros], sin (DTF): "IVAN (22-10-26) - [165 MTS]" → "IVAN"
create or replace function public.dtf_nombre_limpio(t text)
returns text
language sql immutable
as $$
  select nullif(upper(trim(both ' -_.,:;' from regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(t, ''),
      '\[[^]]*\]', ' ', 'g'),
      '\((dtf|[^)]*[0-9][^)]*)\)', ' ', 'gi'),
      '[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}', ' ', 'g'),
      '[0-9]+([.,][0-9]+)?\s*(mts|mt|metros|metro|m)\M', ' ', 'gi'),
    '\s+', ' ', 'g'))), '')
$$;

-- La cola de ventas armada: una tarjeta por cliente (o por grupo armado a mano), con sus archivos
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
  )
  select coalesce(jsonb_agg(t.x order by (t.x->>'metros')::numeric desc), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
             'clave', g.grupo, 'nombres', to_jsonb(g.nombres), 'a_mano', g.a_mano,
             'cliente_id', g.cliente_id, 'cliente_nombre', c.nombre_completo,
             'cliente_origen', case when g.cliente_id is not null then g.cliente_origen end,
             'sugerido', s.sug, 'archivos', g.archivos, 'metros', g.metros, 'desde', g.desde, 'pedidos', g.pedidos)
           || case when (pr.p->>'precio') is not null
                   then jsonb_build_object('precio_metro', (pr.p->>'precio')::numeric,
                                           'total', round((pr.p->>'precio')::numeric * g.metros),
                                           'precio_origen', pr.p->>'origen')
                   else '{}'::jsonb end as x
    from g
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
  ) t;
  return v_res;
end $$;

-- Juntar archivos en una venta, sacar archivos de su tarjeta o volver a como los arma el sistema
-- p: { pedidos: [ids], accion: 'juntar' | 'sacar' | 'automatico' }
create or replace function public.taller_dtf_agrupar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ids uuid[];
  v_n integer;
  v_accion text := coalesce(p->>'accion', '');
  v_grupo text;
begin
  if v_emp is null or not public.tengo_permiso('ventas') then
    raise exception 'Para armar las ventas hay que entrar con un usuario que tenga el permiso de ventas.';
  end if;
  if v_accion not in ('juntar', 'sacar', 'automatico') then raise exception 'No sé qué hacer con esos archivos.'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p->'pedidos', '[]'::jsonb)) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Marcá los archivos.'; end if;
  if v_accion = 'juntar' and array_length(v_ids, 1) < 2 then raise exception 'Para juntar marcá al menos dos archivos.'; end if;

  perform 1 from public.prod_dtf_pedidos where id = any (v_ids) for update;
  select count(*) into v_n
  from public.prod_dtf_pedidos pd
  where pd.id = any (v_ids) and pd.empresa_id = v_emp and not pd.anulado and pd.tipo_cargo = 'VENTA'
    and not exists (select 1 from public.v3_comprobantes v where v.id = pd.comprobante_id and v.estado <> 'anulado');
  if v_n <> array_length(v_ids, 1) then
    raise exception 'Algún archivo ya se vendió o no es de venta. Actualizá la pantalla.';
  end if;

  if v_accion = 'juntar' then
    v_grupo := gen_random_uuid()::text;
    update public.prod_dtf_pedidos set grupo_venta = v_grupo where id = any (v_ids);
  elsif v_accion = 'sacar' then
    update public.prod_dtf_pedidos set grupo_venta = 'solo:' || id where id = any (v_ids);
  else
    update public.prod_dtf_pedidos set grupo_venta = null where id = any (v_ids);
  end if;

  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_VENTA_ARMADA',
          format('%s %s archivo(s) DTF para vender', case v_accion when 'juntar' then 'Junta' when 'sacar' then 'Saca aparte' else 'Vuelve a lo automático' end, v_n),
          public.usuario_actual());
  return jsonb_build_object('accion', v_accion, 'archivos', v_n, 'grupo', v_grupo);
end $$;

revoke execute on function public.taller_dtf_por_vender(), public.taller_dtf_agrupar(jsonb) from public, anon;
grant execute on function public.taller_dtf_por_vender(), public.taller_dtf_agrupar(jsonb) to authenticated;
comment on function public.taller_dtf_por_vender() is 'Cola de ventas del DTF: tarjetas por cliente (nombre limpio, llega como, grupos a mano) con precio estimado.';
