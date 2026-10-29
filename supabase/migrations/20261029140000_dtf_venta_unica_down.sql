-- Vuelve atrás 20261029140000_dtf_venta_unica.sql: el DTF se vende siempre aparte, como antes
drop function if exists public.taller_dtf_vender_tarjeta_(uuid, uuid[], text);
drop function if exists public.taller_dtf_vender_suelto_(jsonb);
create or replace function public.taller_dtf_vender(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp uuid := public.mi_empresa();
  v_cli text := nullif(p->>'cliente_id', '');
  v_ids uuid[];
  v_n integer;
  v_metros numeric;
  v_sin_cargo integer;
  v_sin_metros text;
  v_item uuid;
  v_sug jsonb;
  v_precio numeric;
  v_items jsonb;
  v_venta jsonb;
  v_detalle text;
  v_cfg jsonb;
begin
  if v_emp is null or not public.tengo_permiso('ventas') then
    raise exception 'Para hacer la venta hay que entrar con un usuario que tenga el permiso de ventas.';
  end if;
  if v_cli is null or v_cli = 'CONSUMIDOR-FINAL' or not exists (select 1 from public.v3_clientes where id_cliente = v_cli) then
    raise exception 'Elegí el cliente del sistema.';
  end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p->'pedidos', '[]'::jsonb)) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'No hay pedidos para vender.'; end if;

  perform 1 from public.prod_dtf_pedidos where id = any (v_ids) for update;
  select count(*), sum(coalesce(nullif(pd.metros_facturados, 0), pd.metros_archivo, 0)) into v_n, v_metros
  from public.prod_dtf_pedidos pd
  where pd.id = any (v_ids) and pd.empresa_id = v_emp and not pd.anulado and pd.tipo_cargo = 'VENTA'
    and not exists (select 1 from public.v3_comprobantes v where v.id = pd.comprobante_id and v.estado <> 'anulado');
  if v_n <> array_length(v_ids, 1) then
    raise exception 'Algún pedido ya está vendido, anulado o no es de venta. Actualizá la pantalla.';
  end if;

  -- Archivos sin metros: si son reposición van sin cargo; si no, hay que corregirlos antes de vender
  select string_agg(nombre_archivo, ', ' order by nombre_archivo) into v_sin_metros
  from public.prod_dtf_pedidos
  where id = any (v_ids) and coalesce(nullif(metros_facturados, 0), metros_archivo, 0) <= 0
    and coalesce(nombre_archivo, '') !~* 'repo';
  if v_sin_metros is not null then
    raise exception 'Estos archivos no tienen metros: %. Corregí los metros (lápiz del historial) o sacalos de la tarjeta.', v_sin_metros;
  end if;
  select count(*) into v_sin_cargo from public.prod_dtf_pedidos
  where id = any (v_ids) and coalesce(nullif(metros_facturados, 0), metros_archivo, 0) <= 0;
  if coalesce(v_metros, 0) <= 0 then raise exception 'Los pedidos no tienen metros.'; end if;

  v_item := coalesce(
    (select i.id from public.v3_items i join public.empresas e on e.id = v_emp
     where i.id::text = e.taller_config->>'item_dtf' and i.activo),
    (select id from public.v3_items where empresa_id = v_emp and activo and se_vende and categoria = 'DTF'
     and nombre ilike 'Impresión DTF%' order by created_at limit 1));
  if v_item is null then raise exception 'Falta el servicio "Impresión DTF" en Productos.'; end if;

  -- Un solo renglón con todos los metros (lo de siempre) o uno por archivo; se recuerda lo que eligió cada cliente
  select coalesce(taller_config, '{}'::jsonb) into v_cfg from public.empresas where id = v_emp;
  v_detalle := case when coalesce(nullif(p->>'detalle', ''), v_cfg->'dtf_detalle'->>v_cli, 'unico') = 'por_archivo' then 'por_archivo' else 'unico' end;

  v_sug := public.precio_sugerido(jsonb_build_object('item_id', v_item, 'cliente_id', v_cli, 'cantidad', v_metros));
  v_precio := (v_sug->>'precio')::numeric;
  if v_precio is null then raise exception '"Impresión DTF" no tiene precio en la lista de precios.'; end if;

  if v_detalle = 'unico' then
    v_items := jsonb_build_array(jsonb_build_object(
      'item_id', v_item, 'referencia_id', 'dtf:' || (v_ids[1])::text,
      'descripcion', format('Impresión DTF · %s archivo(s)', v_n - v_sin_cargo),
      'cantidad', v_metros, 'precio_unitario', v_precio, 'precio_lista', (v_sug->>'precio_lista')::numeric, 'precio_origen', v_sug->>'origen'));
  else
    select jsonb_agg(jsonb_build_object(
             'item_id', v_item, 'referencia_id', 'dtf:' || s.id, 'descripcion', 'Impresión DTF · ' || coalesce(s.nombre_archivo, ''),
             'cantidad', s.m, 'precio_unitario', v_precio, 'precio_lista', (v_sug->>'precio_lista')::numeric,
             'precio_origen', v_sug->>'origen') order by s.fecha_hora)
    into v_items
    from (select id, nombre_archivo, fecha_hora, coalesce(nullif(metros_facturados, 0), metros_archivo, 0) as m
          from public.prod_dtf_pedidos where id = any (v_ids)) s
    where s.m > 0;
  end if;
  if coalesce((p->>'recordar_detalle')::boolean, true) then
    update public.empresas set taller_config = jsonb_set(coalesce(taller_config, '{}'::jsonb), '{dtf_detalle}',
      coalesce(taller_config->'dtf_detalle', '{}'::jsonb) || jsonb_build_object(v_cli, v_detalle)) where id = v_emp;
  end if;

  v_venta := public.registrar_venta(jsonb_build_object(
    'cliente_id', v_cli, 'items', v_items, 'usuario', public.usuario_actual(),
    'notas', format('DTF del taller: %s archivo(s), %s m', v_n, trim_scale(v_metros))
             || case when v_sin_cargo > 0 then format(' (%s reposición/es sin cargo)', v_sin_cargo) else '' end));

  -- Todos los archivos quedan en la venta, también las reposiciones sin cargo (así salen de la cola)
  perform set_config('vg.taller_sistema', '1', true);
  update public.prod_dtf_pedidos set comprobante_id = (v_venta->>'id')::uuid, cliente_id = v_cli where id = any (v_ids);
  perform set_config('vg.taller_sistema', '', true);

  return v_venta || jsonb_build_object('metros', v_metros, 'precio_metro', v_precio, 'origen', v_sug->>'origen', 'detalle', v_detalle);
end $function$;
revoke execute on function public.taller_dtf_vender(jsonb) from public, anon;
grant execute on function public.taller_dtf_vender(jsonb) to authenticated;
