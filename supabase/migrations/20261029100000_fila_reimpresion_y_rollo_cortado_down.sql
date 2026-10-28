-- Vuelve atrás 20261029100000_fila_reimpresion_y_rollo_cortado
drop function if exists public.taller_fila_parcial(jsonb);
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
      -- Volvió a la fila: otra vez pendiente
      update public.prod_pendientes_drive set anulado = false, anulado_motivo = null, anulado_at = null, anulado_por = null,
        fuera_fila_at = null, fuera_fila_donde = null, fuera_fila_carpeta = null, fuera_fila_resuelto = null
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
  -- Lo que ya no está en la fila y no se marcó impreso queda aparte hasta que el ayudante vea adónde fue (si la lista
  -- vino vacía, Drive no respondió y no se toca nada). Lo que se devolvió a la cola desde IMPRESOS no se toca.
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    update public.prod_pendientes_drive set anulado = true, anulado_motivo = 'Salió de la fila: revisando adónde fue',
      fuera_fila_at = now(), fuera_fila_donde = null, fuera_fila_carpeta = null, fuera_fila_resuelto = null
    where empresa_id = v_emp and not anulado and estado_impreso <> 'SI' and not en_impresos and file_id is not null
      and file_id not like 'LOCAL-%' and file_id not like 'MANUAL-%' and not (file_id = any (v_ids))
      and coalesce(fuera_fila_resuelto, '') <> 'a_la_cola';
    get diagnostics v_quitados = row_count;
  end if;
  return jsonb_build_object('ok', true, 'nuevos', v_nuevos, 'cambiados', v_cambiados, 'quitados', v_quitados);
end $$;

alter table public.prod_pendientes_drive drop column if exists ya_impreso_at;
alter table public.prod_pendientes_drive drop column if exists veces_impreso;
alter table public.prod_pendientes_drive drop column if exists metros_impresos_parcial;
alter table public.prod_pendientes_drive drop column if exists parcial_detalle;
