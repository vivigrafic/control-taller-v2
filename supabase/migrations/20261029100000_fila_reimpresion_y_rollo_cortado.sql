-- ============================================================================
-- Fila de impresión: reimpresiones y rollo que se termina en el medio (28/10/2026, pedido del dueño)
-- - Un archivo ya impreso que alguien vuelve a poner en la fila (lo saca de IMPRESOS) vuelve a la cola con el aviso de
--   cuándo se imprimió (ya_impreso_at). En DTF, al imprimirlo se elige si es reposición (sin cargo) o si se cobra otra vez.
-- - Rollo (film o papel) que se termina a mitad de una impresión: cada archivo sale completo, una parte (N m) o nada.
--   Lo que salió a medias queda en la cola con lo que falta (metros_impresos_parcial); cada rollo descuenta solo lo suyo y
--   el archivo se cobra una sola vez, cuando sale la última parte (con sus metros completos).
--   DTF: taller_dtf_imprimir() con p.partes y p.rollo_terminado. Sublimación: taller_fila_parcial().
-- Volver atrás: 20261029100000_fila_reimpresion_y_rollo_cortado_down.sql
-- ============================================================================

alter table public.prod_pendientes_drive add column if not exists ya_impreso_at timestamptz;
alter table public.prod_pendientes_drive add column if not exists veces_impreso integer not null default 0;
alter table public.prod_pendientes_drive add column if not exists metros_impresos_parcial numeric not null default 0;
alter table public.prod_pendientes_drive add column if not exists parcial_detalle text;
comment on column public.prod_pendientes_drive.ya_impreso_at is 'Si volvió a la fila después de imprimirse: cuándo se había impreso (reimpresión)';
comment on column public.prod_pendientes_drive.metros_impresos_parcial is 'Metros que ya salieron de este archivo (rollo terminado en el medio); falta metros_totales - esto';

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
  v_volvieron integer := 0;
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
      -- Un archivo ya impreso que alguien volvió a poner en la fila (estaba en IMPRESOS): vuelve a la cola para imprimirse de
      -- nuevo, con el aviso de cuándo se imprimió (al imprimirlo se pregunta si es reposición o si se cobra otra vez)
      update public.prod_pendientes_drive set estado_impreso = 'NO', impreso_at = null, en_impresos = false,
        ya_impreso_at = coalesce(impreso_at, actualizado_at, now()), veces_impreso = coalesce(veces_impreso, 0) + 1,
        metros_impresos_parcial = 0, parcial_detalle = null, calandrado_at = null, cortado_at = null
      where file_id = x->>'file_id' and empresa_id = v_emp and estado_impreso = 'SI' and en_impresos and not anulado;
      get diagnostics n = row_count;
      if n > 0 then
        v_volvieron := v_volvieron + n;
        insert into public.v3_bitacora (tipo_evento, detalle, usuario)
        values ('TALLER_FILA_VOLVIO', format('%s volvió a la fila después de imprimirse: queda para imprimir de nuevo', x->>'nombre_archivo'), 'Ayudante de Google');
      end if;
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
  return jsonb_build_object('ok', true, 'nuevos', v_nuevos, 'cambiados', v_cambiados, 'quitados', v_quitados, 'volvieron', v_volvieron);
end $$;

-- Imprimir en DTF (una tirada con los archivos marcados). p: { pendientes, id_rollo_dtf, metros_rip, observaciones,
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
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p->'pendientes', '[]'::jsonb)) x;
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
             from jsonb_array_elements(coalesce(p->'partes', '[]'::jsonb)) x) e on e.id = pd.id
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
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones)
  values (v_emp, v_codigo, v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), v_completos + v_partes > 1,
          v_rip, 0, concat_ws(' · ', v_obs, case when v_partes > 0 then format('El rollo se terminó: %s archivo(s) a medias', v_partes) end))
  returning id into v_tirada;

  -- Un pedido por archivo completo (lo que se vende, con sus metros completos aunque haya salido en dos partes)
  insert into public.prod_dtf_pedidos (empresa_id, tirada_id, pendiente_id, cliente, nombre_archivo, file_id, tipo_cargo,
                                       metros_archivo, metros_facturados, estado_entrega, observaciones)
  select v_emp, v_tirada, pd.id, coalesce(nullif(trim(pd.cliente), ''), 'SIN CLIENTE'), pd.nombre_archivo, coalesce(pd.file_id, ''), c.cargo,
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
  update public.prod_pendientes_drive set estado_impreso = 'SI' where id in (select id from _dtf_salio where estado = 'completo');
  update public.prod_pendientes_drive pd set metros_impresos_parcial = coalesce(pd.metros_impresos_parcial, 0) + s.metros,
    parcial_detalle = concat_ws(' · ', pd.parcial_detalle, format('%s m en el rollo %s (%s)', trim_scale(s.metros), v_rollo.id_rollo_dtf, v_codigo))
  from _dtf_salio s where s.id = pd.id and s.estado = 'parte';
  if v_terminado then
    update public.prod_dtf_rollos set estado = 'Terminado' where id_rollo_dtf = v_rollo.id_rollo_dtf and empresa_id = v_emp;
  end if;

  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_DTF_TIRADA', format('Tirada %s: %s archivo(s) completos%s, %s m del rollo %s%s', v_codigo, v_completos,
          case when v_partes > 0 then format(' y %s a medias', v_partes) else '' end, trim_scale(v_rip), v_rollo.id_rollo_dtf,
          case when v_terminado then ' (el rollo se terminó)' else '' end), public.usuario_actual());
  return jsonb_build_object('tirada_id', v_tirada, 'codigo', v_codigo, 'archivos', v_completos, 'partes', v_partes, 'metros', v_metros, 'metros_rip', v_rip);
end $$;

-- Sublimación: un archivo salió a medias porque se terminó el rollo de papel. Queda en la cola con lo que falta.
-- p: { id, metros, rollo }
create or replace function public.taller_fila_parcial(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_pd public.prod_pendientes_drive%rowtype;
  v_metros numeric := round(coalesce(nullif(p->>'metros', '')::numeric, 0), 2);
  v_falta numeric;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select * into v_pd from public.prod_pendientes_drive where id = (p->>'id')::uuid and empresa_id = v_emp and not anulado and estado_impreso <> 'SI' for update;
  if not found then raise exception 'Ese archivo ya no está en la cola.'; end if;
  v_falta := greatest(coalesce(v_pd.metros_totales, 0) - coalesce(v_pd.metros_impresos_parcial, 0), 0);
  if v_metros <= 0 or (v_falta > 0 and v_metros >= v_falta) then
    raise exception 'Poné los metros que salieron de "%" (más de 0 y menos de los % m que faltan).', v_pd.nombre_archivo, trim_scale(v_falta);
  end if;
  update public.prod_pendientes_drive set metros_impresos_parcial = coalesce(metros_impresos_parcial, 0) + v_metros,
    parcial_detalle = concat_ws(' · ', parcial_detalle, format('%s m en el rollo %s', trim_scale(v_metros), coalesce(nullif(p->>'rollo', ''), '?')))
  where id = v_pd.id;
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_FILA_PARCIAL', format('%s: salieron %s m (se terminó el rollo %s); faltan %s m', v_pd.nombre_archivo, trim_scale(v_metros),
          coalesce(nullif(p->>'rollo', ''), '?'), trim_scale(v_falta - v_metros)), public.usuario_actual());
  return jsonb_build_object('ok', true, 'falta', v_falta - v_metros);
end $$;

revoke execute on function public.taller_fila_parcial(jsonb) from public, anon;
grant execute on function public.taller_fila_parcial(jsonb) to authenticated;
