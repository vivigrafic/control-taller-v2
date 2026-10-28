-- ============================================================================
-- Revisión del DTF del taller (28/10/2026, puntos 5, 15, 19, 20, 21, 22 y 23 del dueño)
-- - taller_dtf_avance(): avanzar film sin imprimir (error, calibración, film manchado, prueba de cabezales...). Descuenta
--   del rollo como desperdicio y queda en las últimas tiradas con el motivo.
-- - taller_dtf_sin_venta(): archivos impresos que no se venden (prueba, muestra, error, consumo interno): salen de "Vender"
--   y quedan en el historial con el motivo. Se pueden volver a poner para vender.
-- - taller_dtf_vender(): un solo renglón "Impresión DTF" con todos los metros (por defecto) o uno por archivo; se recuerda
--   lo que eligió cada cliente (empresas.taller_config.dtf_detalle).
-- - taller_drive_sincronizar(): si un archivo de la fila cambia de nombre o de medidas, la cola se actualiza (antes solo
--   agregaba los nuevos). Guarda los metros reales medidos de la imagen y avisa si el nombre dice otra cosa.
-- - venta_dtf_reasignar(): si en "Editar venta" se cambia el cliente de una venta del DTF, los archivos pasan al cliente
--   nuevo y, si se elige "para siempre", lo que llegue con ese nombre va a ese cliente ("llega como").
-- Volver atrás: 20261028000000_dtf_revision_down.sql
-- ============================================================================

create or replace function public.taller_dtf_avance(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_rollo public.prod_dtf_rollos%rowtype;
  v_metros numeric := round(coalesce(nullif(p->>'metros', '')::numeric, 0), 2);
  v_motivo text := coalesce(nullif(trim(p->>'motivo'), ''), 'Otro');
  v_obs text := nullif(trim(coalesce(p->>'observaciones', '')), '');
  v_codigo text;
  v_id uuid;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if v_metros <= 0 then raise exception 'Poné cuántos metros de film se avanzaron.'; end if;
  select * into v_rollo from public.prod_dtf_rollos where id_rollo_dtf = p->>'id_rollo_dtf' and empresa_id = v_emp and not anulado;
  if not found then raise exception 'Elegí el rollo de film.'; end if;
  v_codigo := 'AVF-' || lpad(((select count(*) from public.prod_dtf_tiradas where empresa_id = v_emp) + 1)::text, 5, '0');
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones)
  values (v_emp, v_codigo, v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), false,
          0, v_metros, 'AVANCE DE FILM: ' || v_motivo || coalesce(' · ' || v_obs, ''))
  returning id into v_id;
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_AVANCE', format('%s: %s m del rollo %s sin imprimir (%s)%s', v_codigo, trim_scale(v_metros), v_rollo.id_rollo_dtf, v_motivo, coalesce(' · ' || v_obs, '')),
          public.usuario_actual());
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'metros', v_metros);
end $$;

create or replace function public.taller_dtf_sin_venta(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ids uuid[];
  v_volver boolean := coalesce((p->>'volver')::boolean, false);
  v_motivo text := upper(coalesce(nullif(trim(p->>'motivo'), ''), 'INTERNO'));
  n int;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if v_motivo not in ('PRUEBA', 'MUESTRA', 'ERROR', 'INTERNO', 'REPOSICION') then raise exception 'Elegí por qué no se vende.'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p->'pedidos', '[]'::jsonb)) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Marcá los archivos.'; end if;
  if exists (select 1 from public.prod_dtf_pedidos pd join public.v3_comprobantes v on v.id = pd.comprobante_id and v.estado <> 'anulado'
             where pd.id = any (v_ids)) then
    raise exception 'Alguno ya está vendido: primero anulá la venta en el sistema.';
  end if;
  if v_volver then
    update public.prod_dtf_pedidos set tipo_cargo = 'VENTA', metros_facturados = coalesce(nullif(metros_archivo, 0), metros_facturados),
      observaciones = trim(regexp_replace(coalesce(observaciones, ''), '\s*· No se vende:.*$', ''))
    where id = any (v_ids) and empresa_id = v_emp and not anulado;
  else
    update public.prod_dtf_pedidos set tipo_cargo = v_motivo, metros_facturados = 0,
      observaciones = trim(coalesce(observaciones, '') || ' · No se vende: ' || v_motivo || coalesce(' (' || nullif(trim(p->>'nota'), '') || ')', ''))
    where id = any (v_ids) and empresa_id = v_emp and not anulado;
  end if;
  get diagnostics n = row_count;
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_SIN_VENTA', case when v_volver then format('%s archivo(s) vuelven a Vender', n)
                                       else format('%s archivo(s) impresos sin venta: %s%s', n, v_motivo, coalesce(' (' || nullif(trim(p->>'nota'), '') || ')', '')) end,
          public.usuario_actual());
  return jsonb_build_object('ok', true, 'archivos', n);
end $$;

create or replace function public.taller_dtf_vender(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
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
end $$;

-- La fila de Drive en la base: agrega lo nuevo, actualiza lo que cambió (nombre y medidas, mientras no se imprimió),
-- devuelve lo que vuelve a aparecer y anula lo que ya no está. Los metros reales los mide el ayudante con la imagen.
create or replace function public.taller_drive_sincronizar(p_clave text, p_archivos jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.taller_ayudante_ok(p_clave);
  x jsonb;
  v_ids text[] := '{}';
  v_nuevos integer := 0;
  v_cambiados integer := 0;
  v_quitados integer := 0;
  n integer;
begin
  for x in select * from jsonb_array_elements(coalesce(p_archivos, '[]'::jsonb)) loop
    continue when nullif(x->>'file_id', '') is null;
    v_ids := v_ids || (x->>'file_id');
    if not exists (select 1 from public.prod_pendientes_drive where file_id = x->>'file_id' and empresa_id = v_emp) then
      insert into public.prod_pendientes_drive (empresa_id, modulo, cliente, nombre_archivo, medida_unitaria, repeticiones, metros_totales,
                                               perfil_detectado, file_id, estado_impreso, creado_por, metros_dpi_real, dpi_detectado, discrepancia_medida)
      values (v_emp, coalesce(x->>'modulo', 'SUBLIMACION'), coalesce(nullif(x->>'cliente', ''), 'SIN CLIENTE'), x->>'nombre_archivo',
              coalesce(nullif(x->>'medida_unitaria', '')::numeric, 0), coalesce(nullif(x->>'repeticiones', '')::integer, 1),
              coalesce(nullif(x->>'metros_totales', '')::numeric, 0), coalesce(x->>'perfil_detectado', ''), x->>'file_id', 'NO', 'Drive',
              nullif(x->>'metros_reales', '')::numeric, nullif(x->>'dpi', '')::integer, coalesce((x->>'discrepancia')::boolean, false));
      v_nuevos := v_nuevos + 1;
    else
      update public.prod_pendientes_drive set anulado = false, anulado_motivo = null, anulado_at = null, anulado_por = null
      where file_id = x->>'file_id' and empresa_id = v_emp and anulado and estado_impreso <> 'SI';
      -- Lo que cambió en la fila (se renombró el archivo, se lo pasó a otra carpeta, cambió la medida)
      update public.prod_pendientes_drive p set
        nombre_archivo = coalesce(x->>'nombre_archivo', p.nombre_archivo),
        cliente = coalesce(nullif(x->>'cliente', ''), p.cliente),
        modulo = coalesce(nullif(x->>'modulo', ''), p.modulo),
        medida_unitaria = coalesce(nullif(x->>'medida_unitaria', '')::numeric, p.medida_unitaria),
        repeticiones = coalesce(nullif(x->>'repeticiones', '')::integer, p.repeticiones),
        metros_totales = coalesce(nullif(x->>'metros_totales', '')::numeric, p.metros_totales),
        perfil_detectado = coalesce(x->>'perfil_detectado', p.perfil_detectado),
        metros_dpi_real = coalesce(nullif(x->>'metros_reales', '')::numeric, p.metros_dpi_real),
        dpi_detectado = coalesce(nullif(x->>'dpi', '')::integer, p.dpi_detectado),
        discrepancia_medida = coalesce((x->>'discrepancia')::boolean, p.discrepancia_medida),
        -- otro cliente en el nombre: se vuelve a buscar su cliente y su trabajo (salvo lo mandado desde una tarjeta)
        cliente_id = case when coalesce(nullif(x->>'cliente', ''), p.cliente) is distinct from p.cliente and coalesce(p.creado_por, '') <> 'Mandar a imprimir' then null else p.cliente_id end,
        trabajo_id = case when coalesce(nullif(x->>'cliente', ''), p.cliente) is distinct from p.cliente and coalesce(p.creado_por, '') <> 'Mandar a imprimir' then null else p.trabajo_id end
      where p.file_id = x->>'file_id' and p.empresa_id = v_emp and p.estado_impreso <> 'SI'
        and (p.nombre_archivo is distinct from coalesce(x->>'nombre_archivo', p.nombre_archivo)
          or p.cliente is distinct from coalesce(nullif(x->>'cliente', ''), p.cliente)
          or p.modulo is distinct from coalesce(nullif(x->>'modulo', ''), p.modulo)
          or p.metros_totales is distinct from coalesce(nullif(x->>'metros_totales', '')::numeric, p.metros_totales)
          or p.repeticiones is distinct from coalesce(nullif(x->>'repeticiones', '')::integer, p.repeticiones)
          or p.metros_dpi_real is distinct from coalesce(nullif(x->>'metros_reales', '')::numeric, p.metros_dpi_real)
          or p.discrepancia_medida is distinct from coalesce((x->>'discrepancia')::boolean, p.discrepancia_medida));
      get diagnostics n = row_count;
      v_cambiados := v_cambiados + n;
    end if;
  end loop;
  -- Si la lista vino vacía (Drive no respondió), no se anula nada
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    update public.prod_pendientes_drive set anulado = true, anulado_motivo = 'Ya no está en la fila de Drive'
    where empresa_id = v_emp and not anulado and estado_impreso <> 'SI' and not en_impresos and file_id is not null
      and file_id not like 'LOCAL-%' and file_id not like 'MANUAL-%' and not (file_id = any (v_ids));
    get diagnostics v_quitados = row_count;
  end if;
  return jsonb_build_object('ok', true, 'nuevos', v_nuevos, 'cambiados', v_cambiados, 'quitados', v_quitados);
end $$;

-- Editar venta: el cliente de una venta del DTF cambió. Los archivos pasan al cliente nuevo; con p_siempre, lo que llegue
-- con esos nombres va a ese cliente desde ahora ("llega como").
create or replace function public.venta_dtf_reasignar(p_venta uuid, p_cliente text, p_siempre boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_nombres text[];
  n int;
  a text;
begin
  if v_emp is null or not public.tengo_permiso('ventas') then raise exception 'Este usuario no puede cambiar ventas.'; end if;
  if not exists (select 1 from public.v3_clientes where id_cliente = p_cliente and id_cliente <> 'CONSUMIDOR-FINAL') then raise exception 'Elegí el cliente del sistema.'; end if;
  select array_agg(distinct public.dtf_nombre_limpio(cliente)) filter (where public.dtf_nombre_limpio(cliente) is not null) into v_nombres
  from public.prod_dtf_pedidos where comprobante_id = p_venta and empresa_id = v_emp;
  perform set_config('vg.taller_sistema', '1', true);
  update public.prod_dtf_pedidos set cliente_id = p_cliente where comprobante_id = p_venta and empresa_id = v_emp;
  get diagnostics n = row_count;
  perform set_config('vg.taller_sistema', '', true);
  if p_siempre then
    foreach a in array coalesce(v_nombres, '{}') loop
      perform public.cliente_alias_guardar(a, p_cliente, 'venta editada');
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'archivos', n, 'nombres', to_jsonb(coalesce(v_nombres, '{}')), 'para_siempre', p_siempre);
end $$;

revoke execute on function public.taller_dtf_avance(jsonb), public.taller_dtf_sin_venta(jsonb), public.venta_dtf_reasignar(uuid, text, boolean) from public, anon;
grant execute on function public.taller_dtf_avance(jsonb), public.taller_dtf_sin_venta(jsonb), public.venta_dtf_reasignar(uuid, text, boolean) to authenticated;
revoke execute on function public.taller_dtf_vender(jsonb) from public, anon;
grant execute on function public.taller_dtf_vender(jsonb) to authenticated;
