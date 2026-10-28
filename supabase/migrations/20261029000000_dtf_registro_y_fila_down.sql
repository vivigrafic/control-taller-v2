-- Vuelve atrás 20261029000000_dtf_registro_y_fila: las funciones nuevas se sacan, taller_drive_sincronizar y
-- taller_dtf_avance vuelven a como estaban (20261028000000) y lo que estaba "Salió de la fila" vuelve a "Ya no está en la fila".
drop function if exists public.taller_drive_por_ubicar(text);
drop function if exists public.taller_drive_ubicados(text, jsonb);
drop function if exists public.taller_sin_registrar_resolver(jsonb);
drop function if exists public.taller_dtf_pedido_metros(jsonb);
drop function if exists public.taller_dtf_tirada_editar(jsonb);
drop function if exists public.taller_dtf_tirada_anular(jsonb);
drop function if exists public.taller_dtf_evento(jsonb);
drop function if exists public.taller_dtf_cambio_film(jsonb);

update public.prod_pendientes_drive set anulado_motivo = 'Ya no está en la fila de Drive'
where anulado and fuera_fila_at is not null and coalesce(fuera_fila_resuelto, '') <> 'descartado';

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

alter table public.prod_pendientes_drive drop column if exists fuera_fila_at;
alter table public.prod_pendientes_drive drop column if exists fuera_fila_donde;
alter table public.prod_pendientes_drive drop column if exists fuera_fila_carpeta;
alter table public.prod_pendientes_drive drop column if exists fuera_fila_resuelto;
alter table public.prod_dtf_tiradas drop column if exists evento;
