-- ============================================================================
-- Seguridad del Control de Taller (22/10/2026). Revisión: docs/taller/revision_control_taller_v2.md del ERP.
-- 1. Sin usuario no se lee ni se toca nada: las tablas prod_* solo para usuarios del sistema con el permiso "taller"
--    (el equipo del taller entra una sola vez). Antes: "acceso total" a cualquiera con la clave pública.
-- 2. Nada se borra: se anula (anulado, quién, cuándo y por qué). Un disparador impide borrar.
-- 3. Queda quién hizo cada cosa: creado_por y actualizado_por (el operario elegido en la app + el usuario del equipo).
-- 4. El ayudante de Google (fila de Drive y vigía de IMPRESOS) usa funciones con su propia clave, no las tablas.
-- Necesita las funciones del ERP: tengo_permiso, usuario_actual, mi_empresa, empresa_actual y la tabla v3_claves_integracion.
-- Volver atrás: 20261022120000_seguridad_taller_down.sql
-- ============================================================================

-- Quién: el operario que eligió la app (cabecera x-operario) y el usuario con el que entró el equipo
create or replace function public.tg_prod_quien()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_op text;
  v_us text := public.usuario_actual();
  v_quien text;
  v_id text;
begin
  begin
    v_op := nullif(trim(current_setting('request.headers', true)::json->>'x-operario'), '');
  exception when others then v_op := null;
  end;
  v_quien := nullif(concat_ws(' · ', v_op, case when v_us <> 'Sistema' then v_us end), '');
  if tg_op = 'INSERT' then new.creado_por := coalesce(new.creado_por, v_quien, 'Sistema'); end if;
  new.actualizado_por := coalesce(v_quien, 'Sistema');
  new.actualizado_at := now();
  if new.anulado and (tg_op = 'INSERT' or not old.anulado) then
    new.anulado_at := coalesce(new.anulado_at, now());
    new.anulado_por := coalesce(new.anulado_por, v_quien, 'Sistema');
    v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'id_rollo', to_jsonb(new)->>'id_rollo_dtf');
    insert into public.v3_bitacora (tipo_evento, detalle, usuario)
    values ('TALLER_ANULADO', format('%s %s anulado. Motivo: %s', tg_table_name, v_id, coalesce(new.anulado_motivo, 'sin motivo')),
            coalesce(v_quien, 'Sistema'));
  end if;
  return new;
end $$;

create or replace function public.tg_prod_no_borrar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'En el taller nada se borra: se anula (con su motivo).';
end $$;

do $$
declare t text;
begin
  foreach t in array array['prod_rollos_papel', 'prod_impresiones', 'prod_cola_calandrado', 'prod_cola_laser', 'prod_pendientes_drive',
    'prod_sobrantes', 'prod_fallas_reposiciones', 'prod_catalogos', 'prod_finanzas_taller', 'prod_dtf_rollos', 'prod_dtf_tiradas',
    'prod_dtf_pedidos', 'prod_chat_mensajes', 'prod_sync_sheets_queue', 'prod_telas_ficha', 'prod_telas_variantes', 'prod_telas_parametros',
    'prod_historial_anchos_tela'] loop
    execute format('alter table public.%I add column if not exists anulado boolean not null default false', t);
    execute format('alter table public.%I add column if not exists anulado_at timestamptz', t);
    execute format('alter table public.%I add column if not exists anulado_por text', t);
    execute format('alter table public.%I add column if not exists anulado_motivo text', t);
    execute format('alter table public.%I add column if not exists creado_por text', t);
    execute format('alter table public.%I add column if not exists actualizado_por text', t);
    execute format('alter table public.%I add column if not exists actualizado_at timestamptz', t);
    execute format('drop trigger if exists taller_quien on public.%I', t);
    execute format('create trigger taller_quien before insert or update on public.%I for each row execute function public.tg_prod_quien()', t);
    execute format('drop trigger if exists taller_no_borrar on public.%I', t);
    execute format('create trigger taller_no_borrar before delete on public.%I for each row execute function public.tg_prod_no_borrar()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'Acceso total pruebas ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Allow public access ' || t, t);
    execute format('drop policy if exists "Taller: leer" on public.%I', t);
    execute format('drop policy if exists "Taller: cargar" on public.%I', t);
    execute format('drop policy if exists "Taller: cambiar" on public.%I', t);
    execute format('create policy "Taller: leer" on public.%I for select to authenticated using ((select public.tengo_permiso(''taller'')))', t);
    execute format('create policy "Taller: cargar" on public.%I for insert to authenticated with check ((select public.tengo_permiso(''taller'')))', t);
    execute format('create policy "Taller: cambiar" on public.%I for update to authenticated using ((select public.tengo_permiso(''taller''))) with check ((select public.tengo_permiso(''taller'')))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- Las vistas leen con los permisos de quien pregunta (antes las podía leer cualquiera) y no cuentan lo anulado
create or replace view public.v_prod_rollos_papel_saldos with (security_invoker = true) as
select r.id_rollo, r.empresa_id, r.gramaje, r.metros_iniciales, r.estado, r.fecha_montaje,
  coalesce(sum(case when not i.anulado then i.metros_impresos else 0 end), 0)::numeric(12,2) as metros_impresos_acumulados,
  coalesce(sum(case when not i.anulado then i.metros_desperdicio else 0 end), 0)::numeric(12,2) as metros_desperdicio_acumulados,
  greatest(0, r.metros_iniciales - coalesce(sum(case when not i.anulado then (i.metros_impresos + i.metros_desperdicio) else 0 end), 0))::numeric(12,2) as metros_restantes_reales
from public.prod_rollos_papel r
left join public.prod_impresiones i on i.id_rollo_base = r.id_rollo
where not r.anulado
group by r.id_rollo, r.empresa_id, r.gramaje, r.metros_iniciales, r.estado, r.fecha_montaje;

do $$
declare v text;
begin
  foreach v in array array['v_prod_rollos_papel_saldos', 'v_prod_bloques_impresion', 'v_prod_dtf_rollos_saldos', 'v_prod_dtf_cuentas_clientes'] loop
    execute format('alter view public.%I set (security_invoker = true)', v);
    execute format('revoke all on public.%I from anon', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- ===== El ayudante de Google (terminal de producción): con su clave, sin tocar las tablas =====
create or replace function public.taller_ayudante_ok(p_clave text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.v3_claves_integracion where nombre = 'taller_drive' and revocada_at is null
                 and clave_hash = encode(extensions.digest(coalesce(p_clave, ''), 'sha256'), 'hex')) then
    raise exception 'La clave del ayudante del taller no es válida.';
  end if;
  update public.v3_claves_integracion set ultimo_uso_at = now() where nombre = 'taller_drive' and revocada_at is null;
  return true;
end $$;

-- Lo que hay en la fila de Drive. archivos: [{modulo, cliente, nombre_archivo, medida_unitaria, repeticiones, metros_totales,
-- perfil_detectado, file_id}]. Agrega los nuevos; los pendientes que ya no están se anulan (si vuelven, se reactivan).
create or replace function public.taller_drive_sincronizar(p_clave text, p_archivos jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  x jsonb;
  v_ids text[] := '{}';
  v_nuevos integer := 0;
  v_quitados integer := 0;
begin
  perform public.taller_ayudante_ok(p_clave);
  for x in select * from jsonb_array_elements(coalesce(p_archivos, '[]'::jsonb)) loop
    continue when nullif(x->>'file_id', '') is null;
    v_ids := v_ids || (x->>'file_id');
    if not exists (select 1 from public.prod_pendientes_drive where file_id = x->>'file_id') then
      insert into public.prod_pendientes_drive (empresa_id, modulo, cliente, nombre_archivo, medida_unitaria, repeticiones, metros_totales,
                                               perfil_detectado, file_id, estado_impreso, creado_por)
      values ('vvgrafic-principal', coalesce(x->>'modulo', 'SUBLIMACION'), coalesce(nullif(x->>'cliente', ''), 'SIN CLIENTE'), x->>'nombre_archivo',
              coalesce(nullif(x->>'medida_unitaria', '')::numeric, 0), coalesce(nullif(x->>'repeticiones', '')::integer, 1),
              coalesce(nullif(x->>'metros_totales', '')::numeric, 0), coalesce(x->>'perfil_detectado', ''), x->>'file_id', 'NO', 'Drive');
      v_nuevos := v_nuevos + 1;
    else
      update public.prod_pendientes_drive set anulado = false, anulado_motivo = null, anulado_at = null, anulado_por = null
      where file_id = x->>'file_id' and anulado and estado_impreso <> 'SI';
    end if;
  end loop;
  -- Si la lista vino vacía (Drive no respondió), no se anula nada
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    update public.prod_pendientes_drive set anulado = true, anulado_motivo = 'Ya no está en la fila de Drive'
    where not anulado and estado_impreso <> 'SI' and not en_impresos and file_id is not null and file_id not like 'LOCAL-%'
      and file_id not like 'MANUAL-%' and not (file_id = any (v_ids));
    get diagnostics v_quitados = row_count;
  end if;
  return jsonb_build_object('ok', true, 'nuevos', v_nuevos, 'quitados', v_quitados);
end $$;

-- Vigía: lo que hay que mover en Drive (impresos a IMPRESOS; deshechos, de vuelta a la fila)
create or replace function public.taller_vigia_tareas(p_clave text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.taller_ayudante_ok(p_clave);
  return jsonb_build_object(
    'a_impresos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'file_id', file_id)) from (select id, file_id from public.prod_pendientes_drive
                  where estado_impreso = 'SI' and not en_impresos and not anulado limit 200) s), '[]'::jsonb),
    'a_fila', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'file_id', file_id)) from (select id, file_id from public.prod_pendientes_drive
              where estado_impreso = 'NO' and en_impresos and not anulado limit 200) s), '[]'::jsonb));
end $$;

create or replace function public.taller_vigia_movido(p_clave text, p_id uuid, p_en_impresos boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.taller_ayudante_ok(p_clave);
  update public.prod_pendientes_drive set en_impresos = p_en_impresos where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Clave nueva para el ayudante (desde la app del taller, con un usuario con el permiso de configuración). Se ve una sola vez.
create or replace function public.taller_clave_ayudante()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_clave text := 'vgt_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_emp uuid := coalesce(public.mi_empresa(), public.empresa_actual());
begin
  if auth.uid() is null or not public.tengo_permiso('configuracion') then
    raise exception 'Para generar la clave hay que entrar con un usuario que tenga el permiso de configuración.';
  end if;
  update public.v3_claves_integracion set revocada_at = now() where nombre = 'taller_drive' and revocada_at is null;
  insert into public.v3_claves_integracion (empresa_id, nombre, clave_hash, creada_por)
  values (v_emp, 'taller_drive', encode(extensions.digest(v_clave, 'sha256'), 'hex'), public.usuario_actual());
  insert into public.v3_bitacora (tipo_evento, detalle, usuario) values ('TALLER_CONFIG', 'Clave nueva del ayudante del taller', public.usuario_actual());
  return jsonb_build_object('clave', v_clave);
end $$;

revoke execute on function public.taller_ayudante_ok(text), public.tg_prod_quien(), public.tg_prod_no_borrar() from public, anon, authenticated;
revoke execute on function public.taller_drive_sincronizar(text, jsonb), public.taller_vigia_tareas(text), public.taller_vigia_movido(text, uuid, boolean) from public;
grant execute on function public.taller_drive_sincronizar(text, jsonb), public.taller_vigia_tareas(text), public.taller_vigia_movido(text, uuid, boolean) to anon, authenticated;
revoke execute on function public.taller_clave_ayudante() from public, anon;
grant execute on function public.taller_clave_ayudante() to authenticated;
