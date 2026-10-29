-- ============================================================================
-- DTF: una sola venta por trabajo (armonía, fase 2; 29/10/2026, decisión del dueño: "un cliente, un trabajo, una venta")
-- "Vender" en el taller: si los archivos son de una tarjeta del Kanban, los metros se suman a la venta de esa tarjeta
-- (su renglón "Impresión DTF" queda con al menos los metros vendidos, la venta se emite y los pedidos quedan enlazados).
-- Los archivos sueltos (sin tarjeta) se venden como siempre: la función de antes ahora es taller_dtf_vender_suelto_().
-- Si una tarjeta es de otro cliente que el elegido, avisa; si no tenía cliente, queda con el elegido.
-- Volver atrás: 20261029140000_dtf_venta_unica_down.sql
-- ============================================================================

create or replace function public.taller_dtf_vender_suelto_(p jsonb)
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
revoke execute on function public.taller_dtf_vender_suelto_(jsonb) from public, anon, authenticated;

-- Los pedidos de una tarjeta: suman a la venta de la tarjeta (uso interno)
create or replace function public.taller_dtf_vender_tarjeta_(p_trabajo uuid, p_ids uuid[], p_cli text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  t public.v3_trabajos%rowtype;
  v_item public.v3_items%rowtype;
  v_n integer;
  v_metros numeric;
  v_venta uuid;
  v_vendidos numeric;
  v_lineas jsonb;
  v_idx integer;
  v_actual numeric;
  v_sug jsonb;
  v_precio numeric;
  v_suma_antes numeric;
  v_suma numeric;
  v_cod text;
  c public.v3_comprobantes%rowtype;
begin
  select * into t from public.v3_trabajos where id = p_trabajo for update;
  if not found then raise exception 'No encontré la tarjeta de estos archivos.'; end if;
  v_cod := coalesce('T' || lpad(t.numero::text, 4, '0'), t.id_trabajo, 'la tarjeta');

  -- El cliente: el de la tarjeta manda; si no tenía, queda el elegido
  if nullif(t.id_cliente, '') is null or not exists (select 1 from public.v3_clientes where id_cliente = t.id_cliente) then
    update public.v3_trabajos set id_cliente = p_cli, cliente_nombre = (select nombre_completo from public.v3_clientes where id_cliente = p_cli) where id = t.id;
    t.id_cliente := p_cli;
  elsif t.id_cliente <> p_cli then
    raise exception 'Estos archivos son de la tarjeta % de %: elegí ese cliente para venderlos (o pasalos a otra tarjeta).',
      v_cod, (select nombre_completo from public.v3_clientes where id_cliente = t.id_cliente);
  end if;

  -- Los pedidos: de venta, sin vender y con metros
  select count(*), coalesce(sum(coalesce(nullif(metros_facturados, 0), metros_archivo, 0)), 0) into v_n, v_metros
  from public.prod_dtf_pedidos d
  where d.id = any (p_ids) and d.empresa_id = v_emp and not d.anulado and d.tipo_cargo = 'VENTA'
    and not exists (select 1 from public.v3_comprobantes v where v.id = d.comprobante_id and v.estado <> 'anulado');
  if v_n <> array_length(p_ids, 1) then raise exception 'Algún pedido ya está vendido, anulado o no es de venta. Actualizá la pantalla.'; end if;
  if exists (select 1 from public.prod_dtf_pedidos where id = any (p_ids) and coalesce(nullif(metros_facturados, 0), metros_archivo, 0) <= 0
             and coalesce(nombre_archivo, '') !~* 'repo') then
    raise exception 'Hay archivos sin metros: corregí los metros (lápiz del historial) antes de vender.';
  end if;

  -- El servicio "Impresión DTF" (el mismo del cuadre de la tarjeta)
  select * into v_item from public.v3_items where id = coalesce(
    nullif(public.cuadre_config_()->>'dtf', '')::uuid,
    (select i.id from public.v3_items i join public.empresas e on e.id = v_emp where i.id::text = e.taller_config->>'item_dtf' and i.activo));
  if not found then raise exception 'Falta el servicio "Impresión DTF" en Productos.'; end if;

  -- Lo vendido de esta tarjeta: lo que ya estaba en su venta más lo de ahora
  v_venta := public.venta_de_trabajo(t.id);
  select coalesce(sum(coalesce(nullif(metros_facturados, 0), metros_archivo, 0)), 0) into v_vendidos
  from public.prod_dtf_pedidos d
  where not d.anulado and d.tipo_cargo = 'VENTA' and (d.id = any (p_ids) or (v_venta is not null and d.comprobante_id = v_venta));

  -- El renglón de DTF de la tarjeta queda con al menos esos metros (si ya cubría más, por el cuadre, no se toca)
  v_lineas := case when jsonb_typeof(t.productos_servicios) = 'array' then t.productos_servicios else '[]'::jsonb end;
  select coalesce(sum(coalesce(nullif(e->>'subtotal', '')::numeric, 0)), 0) into v_suma_antes from jsonb_array_elements(v_lineas) e;
  select max(i - 1), coalesce(sum(coalesce(nullif(e->>'cantidad', '')::numeric, 0)), 0) into v_idx, v_actual
  from jsonb_array_elements(v_lineas) with ordinality as l(e, i) where e->>'item_id' = v_item.id::text;
  if v_idx is null or v_actual < v_vendidos then
    v_sug := public.precio_sugerido(jsonb_build_object('item_id', v_item.id, 'cliente_id', t.id_cliente, 'cantidad', v_vendidos));
    v_precio := coalesce(nullif(v_sug->>'precio', '')::numeric, 0);
    if v_idx is null then
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
        'id_producto', null, 'item_id', v_item.id, 'nombre', v_item.nombre, 'variante', null, 'tipo', v_item.tipo, 'controla_stock', false,
        'precio_unitario', v_precio, 'cantidad', v_vendidos, 'subtotal', round(v_vendidos * v_precio, 2), 'unidad_medida', v_item.unidad,
        'precio_lista', nullif(v_sug->>'precio_lista', '')::numeric, 'precio_origen', coalesce(nullif(v_sug->>'origen', ''), 'lista'),
        'precio_auto', false, 'origen', 'taller'));
    else
      -- Sube el último renglón de DTF; si su precio salía de la lista, se recalcula con el total (la escala cambia con los metros)
      v_lineas := jsonb_set(v_lineas, array[v_idx::text], (v_lineas->v_idx) || jsonb_build_object(
        'cantidad', round(coalesce(nullif(v_lineas->v_idx->>'cantidad', '')::numeric, 0) + v_vendidos - v_actual, 2),
        'precio_unitario', case when coalesce(v_lineas->v_idx->>'precio_origen', '') = 'manual' then (v_lineas->v_idx->>'precio_unitario')::numeric else v_precio end));
      v_lineas := jsonb_set(v_lineas, array[v_idx::text], (v_lineas->v_idx) || jsonb_build_object(
        'subtotal', round((v_lineas->v_idx->>'cantidad')::numeric * coalesce(nullif(v_lineas->v_idx->>'precio_unitario', '')::numeric, 0), 2)));
    end if;
    select coalesce(sum(coalesce(nullif(e->>'subtotal', '')::numeric, 0)), 0) into v_suma from jsonb_array_elements(v_lineas) e;
    if coalesce(t.presupuesto_total, 0) = 0 or abs(coalesce(t.presupuesto_total, 0) - v_suma_antes) <= 1 then
      update public.v3_trabajos set productos_servicios = v_lineas, presupuesto_total = v_suma where id = t.id;
    else
      update public.v3_trabajos set productos_servicios = v_lineas where id = t.id;
    end if;
  end if;

  -- La venta de la tarjeta (se arma aunque la tarjeta esté en Consultas) y se emite: lo vendido ya es deuda del cliente
  v_venta := public.sincronizar_venta_trabajo(t.id, public.usuario_actual(), true);
  if v_venta is null then raise exception 'No se pudo armar la venta de la tarjeta %.', v_cod; end if;
  select * into c from public.v3_comprobantes where id = v_venta;
  if c.estado = 'borrador' then
    update public.v3_comprobantes set estado = 'emitido', fecha_emision = now(), updated_at = now() where id = v_venta;
    insert into public.v3_bitacora (id_trabajo, tipo_evento, detalle, usuario)
    values (t.id, 'VENTA_EMITIDA', format('Venta %s de %s emitida desde el taller (DTF) por $%s', coalesce(c.numero_comprobante, ''), v_cod, c.total), public.usuario_actual());
  end if;

  -- Los pedidos quedan en la venta de la tarjeta (así salen de la cola para vender y el cuadre los cuenta en la tarjeta)
  perform set_config('vg.taller_sistema', '1', true);
  update public.prod_dtf_pedidos set comprobante_id = v_venta, cliente_id = t.id_cliente where id = any (p_ids);
  perform set_config('vg.taller_sistema', '', true);
  insert into public.v3_bitacora (id_trabajo, tipo_evento, detalle, usuario)
  values (t.id, 'TALLER_DTF_VENTA_TARJETA', format('%s archivo(s) DTF, %s m, sumados a la venta %s de %s', v_n, trim_scale(v_metros), coalesce(c.numero_comprobante, ''), v_cod),
          public.usuario_actual());

  select * into c from public.v3_comprobantes where id = v_venta;
  return jsonb_build_object('id', v_venta, 'numero_comprobante', c.numero_comprobante, 'total', c.total, 'metros', v_metros,
    'precio_metro', (select (e->>'precio_unitario')::numeric from jsonb_array_elements((select productos_servicios from public.v3_trabajos where id = t.id)) e
                     where e->>'item_id' = v_item.id::text limit 1),
    'tarjeta', v_cod, 'trabajo_id', t.id);
end $$;
revoke execute on function public.taller_dtf_vender_tarjeta_(uuid, uuid[], text) from public, anon, authenticated;

-- Vender DTF en el taller. p: { cliente_id, pedidos: [...], detalle, recordar_detalle } (igual que antes)
create or replace function public.taller_dtf_vender(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_cli text := nullif(p->>'cliente_id', '');
  v_ids uuid[];
  v_sueltos uuid[];
  r record;
  v_res jsonb;
  ventas jsonb := '[]'::jsonb;
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

  -- Los de cada tarjeta, a la venta de su tarjeta
  for r in select pd.trabajo_id, array_agg(d.id) as ids
           from public.prod_dtf_pedidos d join public.prod_pendientes_drive pd on pd.id = d.pendiente_id
           join public.v3_trabajos t on t.id = pd.trabajo_id and t.estado not in ('eliminado', 'archivado')
           where d.id = any (v_ids) and pd.trabajo_id is not null
           group by pd.trabajo_id loop
    ventas := ventas || public.taller_dtf_vender_tarjeta_(r.trabajo_id, r.ids, v_cli);
  end loop;

  -- Los sueltos, como siempre
  select array_agg(d.id) into v_sueltos
  from public.prod_dtf_pedidos d
  left join public.prod_pendientes_drive pd on pd.id = d.pendiente_id
  left join public.v3_trabajos t on t.id = pd.trabajo_id and t.estado not in ('eliminado', 'archivado')
  where d.id = any (v_ids) and t.id is null;
  if coalesce(array_length(v_sueltos, 1), 0) > 0 then
    v_res := public.taller_dtf_vender_suelto_(p || jsonb_build_object('pedidos', to_jsonb(v_sueltos)));
    ventas := ventas || jsonb_build_array(v_res);
  end if;

  -- La pantalla muestra la primera (y la lista, si hubo más de una)
  return (ventas->0) || jsonb_build_object('ventas', ventas,
    'metros', (select sum(coalesce((v->>'metros')::numeric, 0)) from jsonb_array_elements(ventas) v));
end $$;
revoke execute on function public.taller_dtf_vender(jsonb) from public, anon;
grant execute on function public.taller_dtf_vender(jsonb) to authenticated;
