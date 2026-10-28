-- ============================================================================
-- Segunda revisión del taller (28/10/2026, 6 puntos del dueño). Esta parte es la del taller:
-- Punto 4 · Archivos que salen de la fila sin registrarse. Si alguien movía a mano un archivo a IMPRESOS antes de marcarlo
--   impreso, taller_drive_sincronizar lo anulaba en silencio y se perdía la venta. Ahora queda aparte ("Salió de la fila"),
--   el ayudante de Google se fija adónde fue (taller_drive_por_ubicar / taller_drive_ubicados) y, si está en una carpeta
--   IMPRESOS, aparece en "Impresos sin registrar" para confirmarlo (taller_sin_registrar_resolver): en DTF se registra la
--   tirada y pasa a Vender; en sublimación vuelve a la cola para cargarlo con su tela y ruta; o se descarta. Lo que salió
--   de la fila desde el 21/10 se vuelve a revisar.
-- Punto 3 · taller_dtf_pedido_metros(): poner o corregir los metros de un archivo impreso (los que quedaron en 0).
-- Punto 1 · taller_dtf_tirada_editar() y taller_dtf_tirada_anular(): editar una tirada (rollo, metros, nota) o anularla
--   (sus archivos vuelven a la fila para imprimirse de nuevo). Lo vendido no se toca (tg_prod_dtf_vendido).
-- Punto 2 · Bloques del DTF como en sublimación: taller_dtf_evento() anota un corte de film o el fin del día y
--   taller_dtf_cambio_film() pone otro rollo; cada uno cierra el bloque (prod_dtf_tiradas.evento).
-- Volver atrás: 20261029000000_dtf_registro_y_fila_down.sql
-- ============================================================================

alter table public.prod_pendientes_drive add column if not exists fuera_fila_at timestamptz;
alter table public.prod_pendientes_drive add column if not exists fuera_fila_donde text;
alter table public.prod_pendientes_drive add column if not exists fuera_fila_carpeta text;
alter table public.prod_pendientes_drive add column if not exists fuera_fila_resuelto text;
comment on column public.prod_pendientes_drive.fuera_fila_at is 'Cuándo el archivo salió de la fila de Drive sin estar marcado impreso';
comment on column public.prod_pendientes_drive.fuera_fila_donde is 'Adónde fue (lo revisa el ayudante): impresos, otra_carpeta o borrado. Vacío: falta revisar';
comment on column public.prod_pendientes_drive.fuera_fila_resuelto is 'Qué se hizo con un impreso sin registrar: impreso, a_la_cola o descartado';

alter table public.prod_dtf_tiradas add column if not exists evento text;
comment on column public.prod_dtf_tiradas.evento is 'Vacío: impresión. avance (film sin imprimir), corte, fin_dia o cambio_film: cierran el bloque';
update public.prod_dtf_tiradas set evento = 'avance'
where evento is null and (codigo_tirada like 'AVF-%' or coalesce(observaciones, '') like 'AVANCE DE FILM%');

-- ---------------------------------------------------------------------------
-- Punto 4: la fila de Drive
-- ---------------------------------------------------------------------------
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

-- Para el ayudante: los archivos que salieron de la fila y falta ver adónde fueron
create or replace function public.taller_drive_por_ubicar(p_clave text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'file_id', file_id, 'modulo', modulo, 'nombre', nombre_archivo))
    from (select id, file_id, modulo, nombre_archivo from public.prod_pendientes_drive
          where empresa_id = v_emp and anulado and fuera_fila_at is not null and fuera_fila_donde is null and estado_impreso <> 'SI'
            and file_id is not null and file_id not like 'LOCAL-%' and file_id not like 'MANUAL-%' and file_id not like 'REPO-%'
          order by fuera_fila_at limit 60) s), '[]'::jsonb);
end $$;

-- p: [{ file_id, donde: impresos | otra_carpeta | borrado, carpeta }]
create or replace function public.taller_drive_ubicados(p_clave text, p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.taller_ayudante_ok(p_clave);
  x jsonb;
  v_donde text;
  v_carpeta text;
  v_impresos int := 0;
  v_otros int := 0;
  n int;
begin
  for x in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    v_donde := case when x->>'donde' in ('impresos', 'otra_carpeta', 'borrado') then x->>'donde' else 'otra_carpeta' end;
    v_carpeta := nullif(trim(coalesce(x->>'carpeta', '')), '');
    update public.prod_pendientes_drive set fuera_fila_donde = v_donde, fuera_fila_carpeta = v_carpeta,
      anulado_motivo = case v_donde
        when 'impresos' then 'Impreso sin registrar (está en ' || coalesce(v_carpeta, 'IMPRESOS') || ')'
        when 'borrado' then 'Ya no está en la fila de Drive (se borró)'
        else 'Ya no está en la fila de Drive' || coalesce(' (está en ' || v_carpeta || ')', '') end
    where empresa_id = v_emp and file_id = x->>'file_id' and anulado and fuera_fila_at is not null and fuera_fila_donde is null and estado_impreso <> 'SI';
    get diagnostics n = row_count;
    if v_donde = 'impresos' then v_impresos := v_impresos + n; else v_otros := v_otros + n; end if;
  end loop;
  if v_impresos > 0 then
    insert into public.v3_bitacora (tipo_evento, detalle, usuario)
    values ('TALLER_IMPRESOS_SIN_REGISTRAR', format('%s archivo(s) se movieron a IMPRESOS sin marcarlos impresos: quedan para confirmar en el taller', v_impresos), 'Ayudante de Google');
  end if;
  return jsonb_build_object('ok', true, 'impresos', v_impresos, 'otros', v_otros);
end $$;

-- Confirmar o descartar los impresos sin registrar.
-- p: { ids: [...], accion: impreso | a_la_cola | descartado, id_rollo_dtf, descontar (true), metros_rip, motivo }
-- impreso (DTF): una tirada con todos, con la fecha en que salieron de la fila; pasan a Vender. Se puede no descontar del
--   rollo (si ya estaba terminado o se descontó a mano). a_la_cola (sublimación): vuelven a la cola para cargarlos con
--   su tela y su ruta. descartado: no se imprimieron.
create or replace function public.taller_sin_registrar_resolver(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ids uuid[];
  v_accion text := p->>'accion';
  v_n int;
  v_modulos text[];
  v_metros numeric;
  v_rip numeric;
  v_desc boolean := coalesce(nullif(p->>'descontar', '')::boolean, true);
  v_rollo public.prod_dtf_rollos%rowtype;
  v_fecha timestamptz;
  v_tirada uuid;
  v_codigo text;
  v_motivo text := nullif(trim(coalesce(p->>'motivo', '')), '');
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if v_accion not in ('impreso', 'a_la_cola', 'descartado') then raise exception 'Elegí qué hacer con los archivos.'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Marcá los archivos.'; end if;
  perform 1 from public.prod_pendientes_drive where id = any (v_ids) for update;
  select count(*), array_agg(distinct upper(modulo)), coalesce(sum(metros_totales), 0), min(fuera_fila_at)
  into v_n, v_modulos, v_metros, v_fecha
  from public.prod_pendientes_drive
  where id = any (v_ids) and empresa_id = v_emp and anulado and fuera_fila_donde = 'impresos' and fuera_fila_resuelto is null and estado_impreso <> 'SI';
  if v_n <> array_length(v_ids, 1) then raise exception 'Alguno ya se resolvió. Actualizá la pantalla.'; end if;

  if v_accion = 'descartado' then
    update public.prod_pendientes_drive set fuera_fila_resuelto = 'descartado',
      anulado_motivo = 'No se imprimió (estaba en IMPRESOS)' || coalesce(': ' || v_motivo, '')
    where id = any (v_ids);
    insert into public.v3_bitacora (tipo_evento, detalle, usuario)
    values ('TALLER_SIN_REGISTRAR_DESCARTADO', format('%s archivo(s) que estaban en IMPRESOS: no se imprimieron%s', v_n, coalesce(' (' || v_motivo || ')', '')), public.usuario_actual());
    return jsonb_build_object('ok', true, 'archivos', v_n);
  end if;

  if v_accion = 'a_la_cola' then
    update public.prod_pendientes_drive set anulado = false, anulado_motivo = null, anulado_at = null, anulado_por = null,
      fuera_fila_resuelto = 'a_la_cola', en_impresos = false, estado_impreso = 'NO'
    where id = any (v_ids);
    insert into public.v3_bitacora (tipo_evento, detalle, usuario)
    values ('TALLER_SIN_REGISTRAR_A_LA_COLA', format('%s archivo(s) que estaban en IMPRESOS volvieron a la cola para registrarlos', v_n), public.usuario_actual());
    return jsonb_build_object('ok', true, 'archivos', v_n);
  end if;

  -- impreso: solo DTF (la sublimación se carga con su formulario: tela, rollo de papel y ruta)
  if v_modulos <> array['DTF'] then raise exception 'Los de sublimación se mandan a la cola para cargarlos con su tela y su ruta.'; end if;
  select * into v_rollo from public.prod_dtf_rollos where id_rollo_dtf = p->>'id_rollo_dtf' and empresa_id = v_emp and not anulado;
  if not found then raise exception 'Elegí el rollo de film en el que se imprimieron.'; end if;
  v_rip := case when v_desc then round(coalesce(nullif(p->>'metros_rip', '')::numeric, v_metros), 2) else 0 end;
  if v_desc and v_rip <= 0 then raise exception 'Poné los metros que se usaron del rollo (o elegí no descontar).'; end if;

  update public.prod_pendientes_drive set anulado = false, anulado_motivo = null, anulado_at = null, anulado_por = null,
    fuera_fila_resuelto = 'impreso', en_impresos = true
  where id = any (v_ids);
  v_codigo := 'DTF-' || lpad(((select count(*) from public.prod_dtf_tiradas where empresa_id = v_emp) + 1)::text, 5, '0');
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, fecha_hora, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones)
  values (v_emp, v_codigo, coalesce(v_fecha, now()), v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), v_n > 1,
          v_rip, 0, 'Impreso sin registrar (estaba en IMPRESOS), registrado el ' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')
                    || case when v_desc then '' else ' · no descuenta del rollo' end)
  returning id into v_tirada;
  insert into public.prod_dtf_pedidos (empresa_id, tirada_id, pendiente_id, fecha_hora, cliente, nombre_archivo, file_id, tipo_cargo,
                                       metros_archivo, metros_facturados, estado_entrega, observaciones)
  select v_emp, v_tirada, pd.id, coalesce(pd.fuera_fila_at, now()), coalesce(nullif(trim(pd.cliente), ''), 'SIN CLIENTE'), pd.nombre_archivo,
         coalesce(pd.file_id, ''), c.cargo, coalesce(pd.metros_totales, 0), case when c.cargo = 'VENTA' then coalesce(pd.metros_totales, 0) else 0 end,
         'Impreso', 'Impreso sin registrar'
  from public.prod_pendientes_drive pd
  cross join lateral (select case when upper(coalesce(pd.es_repo_muestra, '')) like 'REPO%' or pd.nombre_archivo ~* '\mrepo' then 'REPOSICION'
                                  when upper(coalesce(pd.es_repo_muestra, '')) like 'MUESTRA%' or pd.nombre_archivo ~* '\mmuestra' then 'MUESTRA'
                                  else 'VENTA' end as cargo) c
  where pd.id = any (v_ids)
  order by pd.cliente, pd.nombre_archivo;
  update public.prod_pendientes_drive set estado_impreso = 'SI', impreso_at = coalesce(fuera_fila_at, now()) where id = any (v_ids);
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_TIRADA', format('Tirada %s (impresos sin registrar): %s archivo(s), %s m de archivos, %s m del rollo %s', v_codigo, v_n,
          trim_scale(v_metros), trim_scale(v_rip), v_rollo.id_rollo_dtf), public.usuario_actual());
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'archivos', v_n, 'metros', v_metros, 'metros_rip', v_rip);
end $$;

-- ---------------------------------------------------------------------------
-- Punto 3: metros de un archivo impreso (los que quedaron en 0 o con la medida mal)
-- ---------------------------------------------------------------------------
create or replace function public.taller_dtf_pedido_metros(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ped public.prod_dtf_pedidos%rowtype;
  v_metros numeric := round(coalesce(nullif(p->>'metros', '')::numeric, -1), 2);
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if v_metros < 0 then raise exception 'Poné los metros del archivo.'; end if;
  select * into v_ped from public.prod_dtf_pedidos where id = (p->>'id')::uuid and empresa_id = v_emp and not anulado for update;
  if not found then raise exception 'No encontré ese archivo.'; end if;
  -- si ya se vendió, tg_prod_dtf_vendido no deja (se cambia desde la venta)
  update public.prod_dtf_pedidos set metros_archivo = v_metros,
    metros_facturados = case when tipo_cargo = 'VENTA' then v_metros else metros_facturados end
  where id = v_ped.id;
  if v_ped.pendiente_id is not null then
    update public.prod_pendientes_drive set metros_totales = v_metros where id = v_ped.pendiente_id;
  end if;
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_METROS', format('%s: %s m → %s m', v_ped.nombre_archivo, trim_scale(coalesce(v_ped.metros_archivo, 0)), trim_scale(v_metros)), public.usuario_actual());
  return jsonb_build_object('ok', true, 'metros', v_metros);
end $$;

-- ---------------------------------------------------------------------------
-- Punto 1: editar o anular una tirada
-- ---------------------------------------------------------------------------
-- p: { id, id_rollo_dtf, metros_consumidos, metros_desperdicio, observaciones }  (lo que no viene, no cambia)
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
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select * into t from public.prod_dtf_tiradas where id = (p->>'id')::uuid and empresa_id = v_emp and not anulado for update;
  if not found then raise exception 'No encontré esa tirada.'; end if;
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

-- Anula una tirada: sus archivos se anulan y los que vinieron de la fila vuelven a la cola (el vigía los saca de IMPRESOS).
create or replace function public.taller_dtf_tirada_anular(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  t public.prod_dtf_tiradas%rowtype;
  v_motivo text := nullif(trim(coalesce(p->>'motivo', '')), '');
  v_venta text;
  v_peds int;
  v_vuelven int;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if v_motivo is null or length(v_motivo) < 3 then raise exception 'Escribí por qué se anula.'; end if;
  select * into t from public.prod_dtf_tiradas where id = (p->>'id')::uuid and empresa_id = v_emp and not anulado for update;
  if not found then raise exception 'No encontré esa tirada.'; end if;
  select v.numero_comprobante into v_venta from public.prod_dtf_pedidos pd join public.v3_comprobantes v on v.id = pd.comprobante_id and v.estado <> 'anulado'
  where pd.tirada_id = t.id and not pd.anulado limit 1;
  if v_venta is not null then raise exception 'Tiene archivos vendidos (venta %): primero anulá la venta en el sistema.', v_venta; end if;
  update public.prod_dtf_pedidos set anulado = true, anulado_motivo = 'Tirada anulada: ' || v_motivo where tirada_id = t.id and not anulado;
  get diagnostics v_peds = row_count;
  update public.prod_pendientes_drive set estado_impreso = 'NO', impreso_at = null, fuera_fila_resuelto = null
  where id in (select pendiente_id from public.prod_dtf_pedidos where tirada_id = t.id and pendiente_id is not null) and estado_impreso = 'SI';
  get diagnostics v_vuelven = row_count;
  update public.prod_dtf_tiradas set anulado = true, anulado_motivo = v_motivo where id = t.id;
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_TIRADA_ANULADA', format('%s anulada (%s): %s archivo(s), %s vuelven a la fila', t.codigo_tirada, v_motivo, v_peds, v_vuelven), public.usuario_actual());
  return jsonb_build_object('ok', true, 'archivos', v_peds, 'a_la_fila', v_vuelven);
end $$;

-- ---------------------------------------------------------------------------
-- Punto 2: bloques del DTF
-- ---------------------------------------------------------------------------
-- Avanzar film: igual que antes, ahora marcado como evento
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
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if v_metros <= 0 then raise exception 'Poné cuántos metros de film se avanzaron.'; end if;
  select * into v_rollo from public.prod_dtf_rollos where id_rollo_dtf = p->>'id_rollo_dtf' and empresa_id = v_emp and not anulado;
  if not found then raise exception 'Elegí el rollo de film.'; end if;
  v_codigo := 'AVF-' || lpad(((select count(*) from public.prod_dtf_tiradas where empresa_id = v_emp) + 1)::text, 5, '0');
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones, evento)
  values (v_emp, v_codigo, v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), false,
          0, v_metros, 'AVANCE DE FILM: ' || v_motivo || coalesce(' · ' || v_obs, ''), 'avance');
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_AVANCE', format('%s: %s m del rollo %s sin imprimir (%s)%s', v_codigo, trim_scale(v_metros), v_rollo.id_rollo_dtf, v_motivo, coalesce(' · ' || v_obs, '')),
          public.usuario_actual());
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'metros', v_metros);
end $$;

-- Corte de film o fin del día: cierra el bloque (lo que se imprima después empieza otro, en el mismo rollo).
-- p: { tipo: corte | fin_dia, id_rollo_dtf, metros (desperdicio, puede ser 0), observaciones }
create or replace function public.taller_dtf_evento(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_tipo text := p->>'tipo';
  v_rollo public.prod_dtf_rollos%rowtype;
  v_metros numeric := round(coalesce(nullif(p->>'metros', '')::numeric, 0), 2);
  v_obs text := nullif(trim(coalesce(p->>'observaciones', '')), '');
  v_codigo text;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if v_tipo not in ('corte', 'fin_dia') then raise exception 'Tipo de evento inválido.'; end if;
  if v_metros < 0 then raise exception 'Los metros no pueden ser negativos.'; end if;
  select * into v_rollo from public.prod_dtf_rollos where id_rollo_dtf = p->>'id_rollo_dtf' and empresa_id = v_emp and not anulado;
  if not found then raise exception 'Elegí el rollo de film.'; end if;
  v_codigo := case v_tipo when 'corte' then 'COR-' else 'FIN-' end || lpad(((select count(*) from public.prod_dtf_tiradas where empresa_id = v_emp) + 1)::text, 5, '0');
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones, evento)
  values (v_emp, v_codigo, v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), false,
          0, v_metros, coalesce(v_obs, ''), v_tipo);
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_' || upper(v_tipo), format('%s en el rollo %s%s%s', case v_tipo when 'corte' then 'Corte de film' else 'Fin del día' end,
          v_rollo.id_rollo_dtf, case when v_metros > 0 then format(' (%s m de desperdicio)', trim_scale(v_metros)) else '' end, coalesce(' · ' || v_obs, '')),
          public.usuario_actual());
  return jsonb_build_object('ok', true, 'codigo', v_codigo);
end $$;

-- Cambio de film: se pone otro rollo (de los que hay en stock). El que estaba queda en stock o terminado.
-- p: { id_rollo_dtf, anterior: stock | terminado, observaciones }
create or replace function public.taller_dtf_cambio_film(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_rollo public.prod_dtf_rollos%rowtype;
  v_antes text;
  v_estado_antes text := case when p->>'anterior' = 'terminado' then 'Terminado' else 'En Stock' end;
  v_codigo text;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select * into v_rollo from public.prod_dtf_rollos where id_rollo_dtf = p->>'id_rollo_dtf' and empresa_id = v_emp and not anulado for update;
  if not found then raise exception 'Elegí el rollo que se pone.'; end if;
  select string_agg(id_rollo_dtf, ', ') into v_antes from public.prod_dtf_rollos
  where empresa_id = v_emp and estado = 'Activo' and not anulado and id_rollo_dtf <> v_rollo.id_rollo_dtf;
  update public.prod_dtf_rollos set estado = v_estado_antes
  where empresa_id = v_emp and estado = 'Activo' and not anulado and id_rollo_dtf <> v_rollo.id_rollo_dtf;
  update public.prod_dtf_rollos set estado = 'Activo' where id_rollo_dtf = v_rollo.id_rollo_dtf;
  v_codigo := 'CAM-' || lpad(((select count(*) from public.prod_dtf_tiradas where empresa_id = v_emp) + 1)::text, 5, '0');
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones, evento)
  values (v_emp, v_codigo, v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), false,
          0, 0, 'Se puso el rollo ' || v_rollo.id_rollo_dtf || coalesce(' (antes ' || v_antes || ', queda ' || lower(v_estado_antes) || ')', '')
                || coalesce(' · ' || nullif(trim(coalesce(p->>'observaciones', '')), ''), ''), 'cambio_film');
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_CAMBIO_FILM', format('Rollo puesto: %s%s', v_rollo.id_rollo_dtf, coalesce(' (antes ' || v_antes || ')', '')), public.usuario_actual());
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'antes', v_antes);
end $$;

-- ---------------------------------------------------------------------------
-- Lo que salió de la fila desde el 21/10 sin registrarse: se vuelve a revisar adónde fue
-- ---------------------------------------------------------------------------
update public.prod_pendientes_drive set fuera_fila_at = coalesce(anulado_at, now()), fuera_fila_donde = null, fuera_fila_carpeta = null,
  fuera_fila_resuelto = null, anulado_motivo = 'Salió de la fila: revisando adónde fue'
where anulado and anulado_motivo = 'Ya no está en la fila de Drive' and estado_impreso <> 'SI' and created_at >= '2026-10-21'
  and file_id is not null and file_id not like 'LOCAL-%' and file_id not like 'MANUAL-%' and file_id not like 'REPO-%';

revoke execute on function public.taller_drive_por_ubicar(text), public.taller_drive_ubicados(text, jsonb) from public;
grant execute on function public.taller_drive_por_ubicar(text), public.taller_drive_ubicados(text, jsonb) to anon, authenticated;
revoke execute on function public.taller_sin_registrar_resolver(jsonb), public.taller_dtf_pedido_metros(jsonb), public.taller_dtf_tirada_editar(jsonb),
  public.taller_dtf_tirada_anular(jsonb), public.taller_dtf_evento(jsonb), public.taller_dtf_cambio_film(jsonb) from public, anon;
grant execute on function public.taller_sin_registrar_resolver(jsonb), public.taller_dtf_pedido_metros(jsonb), public.taller_dtf_tirada_editar(jsonb),
  public.taller_dtf_tirada_anular(jsonb), public.taller_dtf_evento(jsonb), public.taller_dtf_cambio_film(jsonb) to authenticated;
