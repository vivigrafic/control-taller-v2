-- ============================================================================
-- Taller: empresa real, PIN optativo y DTF vendido por Ventas del sistema (22/10/2026)
-- 1. empresa_id pasa del texto "vvgrafic-principal" al id de la empresa (uuid, relacionado con empresas).
--    Cada usuario ve y carga solo lo de su empresa; el ayudante de Google, lo de la empresa de su clave.
-- 2. PIN optativo, apagado por defecto (empresas.taller_config.pin). Prendido: cada persona elige su nombre (las de
--    Empleados) y pone su PIN; la base le da una sesión de 12 horas y anota su nombre en cada cambio. El dueño
--    (permiso de configuración) no necesita PIN: ya entró con su usuario.
-- 3. DTF sin plata en el taller: cada pedido va con su cliente del sistema y se vende por Ventas, con el precio de
--    la lista (escala por metros y lo aprendido del cliente). Se quita la cuenta corriente paralela.
-- Necesita las funciones del ERP: tengo_permiso, mi_empresa, empresa_actual, usuario_actual, precio_sugerido,
-- registrar_venta, personal_revisar_pin.
-- Volver atrás: 20261022140000_taller_pin_dtf_empresa_down.sql
-- ============================================================================

-- ===== 1. Empresa real =====
drop view if exists public.v_prod_rollos_papel_saldos;

do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'empresa_id' and c.data_type = 'text'
             and c.table_name like 'prod\_%' and c.table_name not like '%respaldo%' loop
    execute format('alter table public.%I alter column empresa_id drop default', t);
    execute format('alter table public.%I alter column empresa_id type uuid using public.empresa_actual()', t);
    execute format('alter table public.%I alter column empresa_id set default public.empresa_actual()', t);
    execute format('alter table public.%I add constraint %I foreign key (empresa_id) references public.empresas(id)', t, t || '_empresa_fk');
    execute format('drop policy if exists "Taller: leer" on public.%I', t);
    execute format('drop policy if exists "Taller: cargar" on public.%I', t);
    execute format('drop policy if exists "Taller: cambiar" on public.%I', t);
    execute format('create policy "Taller: leer" on public.%I for select to authenticated using ((select public.tengo_permiso(''taller'')) and empresa_id = (select public.mi_empresa()))', t);
    execute format('create policy "Taller: cargar" on public.%I for insert to authenticated with check ((select public.tengo_permiso(''taller'')) and empresa_id = (select public.mi_empresa()))', t);
    execute format('create policy "Taller: cambiar" on public.%I for update to authenticated using ((select public.tengo_permiso(''taller'')) and empresa_id = (select public.mi_empresa())) with check ((select public.tengo_permiso(''taller'')) and empresa_id = (select public.mi_empresa()))', t);
  end loop;
end $$;

create view public.v_prod_rollos_papel_saldos with (security_invoker = true) as
select r.id_rollo, r.empresa_id, r.gramaje, r.metros_iniciales, r.estado, r.fecha_montaje,
  coalesce(sum(case when not i.anulado then i.metros_impresos else 0 end), 0)::numeric(12,2) as metros_impresos_acumulados,
  coalesce(sum(case when not i.anulado then i.metros_desperdicio else 0 end), 0)::numeric(12,2) as metros_desperdicio_acumulados,
  greatest(0, r.metros_iniciales - coalesce(sum(case when not i.anulado then (i.metros_impresos + i.metros_desperdicio) else 0 end), 0))::numeric(12,2) as metros_restantes_reales
from public.prod_rollos_papel r
left join public.prod_impresiones i on i.id_rollo_base = r.id_rollo
where not r.anulado
group by r.id_rollo, r.empresa_id, r.gramaje, r.metros_iniciales, r.estado, r.fecha_montaje;
revoke all on public.v_prod_rollos_papel_saldos from anon;
grant select on public.v_prod_rollos_papel_saldos to authenticated;

-- ===== 2. PIN optativo =====
alter table public.empresas add column if not exists taller_config jsonb not null default '{}'::jsonb;

-- Sesiones de las personas en los equipos del taller (solo las usan las funciones de abajo)
create table if not exists public.prod_operario_sesiones (
  token_hash text primary key,
  empresa_id uuid not null references public.empresas(id),
  personal_id uuid not null references public.v3_personal(id),
  nombre text not null,
  equipo uuid,
  vence_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.prod_operario_sesiones enable row level security;
revoke all on public.prod_operario_sesiones from anon, authenticated;

-- Quién: la persona con PIN (si está prendido), si no el nombre elegido en la app, más el usuario del equipo.
-- También fija la empresa: la del usuario (o la del ayudante); no se puede cambiar después.
create or replace function public.tg_prod_quien()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_op text;
  v_tok text;
  v_nom text;
  v_us text := public.usuario_actual();
  v_quien text;
  v_id text;
  v_emp uuid;
  v_tiene_emp boolean := to_jsonb(new) ? 'empresa_id';
begin
  begin
    v_op := nullif(trim(current_setting('request.headers', true)::json->>'x-operario'), '');
    v_tok := nullif(trim(current_setting('request.headers', true)::json->>'x-operario-token'), '');
  exception when others then v_op := null; v_tok := null;
  end;

  if v_tiene_emp then
    if tg_op = 'INSERT' then
      v_emp := coalesce(public.mi_empresa(), (to_jsonb(new)->>'empresa_id')::uuid, public.empresa_actual());
    else
      v_emp := (to_jsonb(old)->>'empresa_id')::uuid;
    end if;
    new := jsonb_populate_record(new, jsonb_build_object('empresa_id', v_emp));
  else
    v_emp := coalesce(public.mi_empresa(), public.empresa_actual());
  end if;

  if v_tok is not null then
    select nombre into v_nom from public.prod_operario_sesiones
    where token_hash = encode(extensions.digest(v_tok, 'sha256'), 'hex') and vence_at > now() and empresa_id = v_emp;
  end if;
  if v_nom is not null then
    v_op := v_nom;
  elsif auth.uid() is not null and coalesce(current_setting('vg.taller_sistema', true), '') <> '1'
        and coalesce((select (taller_config->>'pin')::boolean from public.empresas where id = v_emp), false)
        and not public.tengo_permiso('configuracion') then
    raise exception 'Con el PIN prendido, elegí tu nombre arriba y poné tu PIN.';
  end if;

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

-- Cómo está el taller: PIN prendido o no, y las personas para elegir (las de Empleados)
create or replace function public.taller_operarios()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_pin boolean;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select coalesce((taller_config->>'pin')::boolean, false) into v_pin from public.empresas where id = v_emp;
  return jsonb_build_object('pin', v_pin, 'personas', case when v_pin then coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'tiene_pin', pin_hash is not null) order by nombre)
    from public.v3_personal where empresa_id = v_emp and activo), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Una persona pone su PIN: sesión de 12 horas en este equipo. No corta con error, así el intento fallido queda anotado.
create or replace function public.taller_operario_entrar(p_persona uuid, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  pe public.v3_personal%rowtype;
  v_err text;
  v_tok text := 'vgo_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  select * into pe from public.v3_personal where id = p_persona and empresa_id = v_emp and activo;
  if not found then return jsonb_build_object('ok', false, 'error', 'No encontramos ese nombre.'); end if;
  v_err := public.personal_revisar_pin(pe.id, p_pin);
  if v_err is not null then
    if v_err like 'Todavía no tenés PIN%' then v_err := 'Todavía no tenés PIN: crealo en la app de empleados (el QR del taller).'; end if;
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  insert into public.prod_operario_sesiones (token_hash, empresa_id, personal_id, nombre, equipo, vence_at)
  values (encode(extensions.digest(v_tok, 'sha256'), 'hex'), v_emp, pe.id, pe.nombre, auth.uid(), now() + interval '12 hours');
  return jsonb_build_object('ok', true, 'token', v_tok, 'nombre', pe.nombre, 'vence_at', now() + interval '12 hours');
end $$;

create or replace function public.taller_operario_salir(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  update public.prod_operario_sesiones set vence_at = least(vence_at, now())
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end $$;

-- Ajustes del taller (por ahora, el PIN). Solo con el permiso de configuración.
create or replace function public.taller_ajustes_guardar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_cfg jsonb;
begin
  if v_emp is null or not public.tengo_permiso('configuracion') then
    raise exception 'Para cambiar los ajustes del taller hay que entrar con un usuario que tenga el permiso de configuración.';
  end if;
  update public.empresas set taller_config = taller_config
    || case when p ? 'pin' then jsonb_build_object('pin', coalesce((p->>'pin')::boolean, false)) else '{}'::jsonb end
    || case when p ? 'item_dtf' then jsonb_build_object('item_dtf', nullif(p->>'item_dtf', '')) else '{}'::jsonb end
  where id = v_emp returning taller_config into v_cfg;
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_CONFIG', 'Ajustes del taller: ' || p::text, public.usuario_actual());
  return v_cfg;
end $$;

-- ===== 3. DTF vendido por Ventas =====
alter table public.prod_dtf_pedidos add column if not exists cliente_id text references public.v3_clientes(id_cliente) on update cascade;
alter table public.prod_dtf_pedidos add column if not exists comprobante_id uuid references public.v3_comprobantes(id);
create index if not exists prod_dtf_pedidos_cliente_idx on public.prod_dtf_pedidos (cliente_id);
create index if not exists prod_dtf_pedidos_comprobante_idx on public.prod_dtf_pedidos (comprobante_id);

-- Lo vendido no se toca desde el taller (se cambia o se anula la venta en el sistema)
create or replace function public.tg_prod_dtf_vendido()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_num text;
begin
  if old.comprobante_id is null or coalesce(current_setting('vg.taller_sistema', true), '') = '1' then return new; end if;
  select numero_comprobante into v_num from public.v3_comprobantes where id = old.comprobante_id and estado <> 'anulado';
  if not found then return new; end if; -- la venta se anuló: se puede volver a vender
  if (new.anulado and not old.anulado) then
    raise exception 'Este pedido ya se vendió (venta %): primero anulá la venta en el sistema.', v_num;
  end if;
  if new.metros_archivo is distinct from old.metros_archivo or new.metros_facturados is distinct from old.metros_facturados
     or new.cliente_id is distinct from old.cliente_id or new.tipo_cargo is distinct from old.tipo_cargo
     or new.comprobante_id is distinct from old.comprobante_id then
    raise exception 'Este pedido ya se vendió (venta %): los metros, el cliente y el cargo se cambian desde la venta.', v_num;
  end if;
  return new;
end $$;
drop trigger if exists taller_dtf_vendido on public.prod_dtf_pedidos;
create trigger taller_dtf_vendido before update on public.prod_dtf_pedidos for each row execute function public.tg_prod_dtf_vendido();

-- Los pedidos como los ve el taller: sin precios ni pagos, con la venta del sistema si ya se vendió.
-- Es una función (no una vista) para poder mostrar la venta aunque el usuario del taller no pueda leer Ventas.
drop view if exists public.v_prod_dtf_cuentas_clientes;
create or replace function public.taller_dtf_pedidos()
returns table (id uuid, tirada_id uuid, fecha_hora timestamptz, cliente text, cliente_id text, cliente_sistema text,
               nombre_archivo text, tipo_cargo text, metros_archivo numeric, metros_dpi_real numeric, dpi_detectado integer,
               metros_a_vender numeric, estado_entrega text, observaciones text, file_id text, creado_por text,
               venta_id uuid, venta_numero text, vendido boolean)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  return query
  select p.id, p.tirada_id, p.fecha_hora, p.cliente::text, p.cliente_id::text, c.nombre_completo::text,
    p.nombre_archivo::text, p.tipo_cargo::text, p.metros_archivo::numeric, p.metros_dpi_real::numeric, p.dpi_detectado::integer,
    coalesce(nullif(p.metros_facturados, 0), p.metros_archivo)::numeric, p.estado_entrega::text, p.observaciones::text,
    p.file_id::text, p.creado_por::text, v.id, v.numero_comprobante::text, (v.id is not null)
  from public.prod_dtf_pedidos p
  left join public.v3_clientes c on c.id_cliente = p.cliente_id
  left join public.v3_comprobantes v on v.id = p.comprobante_id and v.estado <> 'anulado'
  where not p.anulado and p.empresa_id = public.mi_empresa()
  order by p.fecha_hora desc;
end $$;

-- Buscar clientes del sistema desde el taller (solo id y nombre)
create or replace function public.taller_buscar_clientes(p_texto text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v_t text := '%' || trim(coalesce(p_texto, '')) || '%';
begin
  if not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if length(trim(coalesce(p_texto, ''))) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id_cliente, 'nombre', nombre_completo, 'negocio', nombre_negocio))
    from (select id_cliente, nombre_completo, nombre_negocio from public.v3_clientes
          where coalesce(es_cliente, true) and id_cliente <> 'CONSUMIDOR-FINAL'
            and (nombre_completo ilike v_t or nombre_negocio ilike v_t or id_cliente ilike v_t)
          order by nombre_completo limit 15) s), '[]'::jsonb);
end $$;

-- Vende pedidos DTF de un cliente: un renglón "Impresión DTF" por archivo, con el precio de la lista para los metros
-- de toda la venta (escala) y lo aprendido del cliente. Los cobros se hacen en el sistema (Ventas).
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
  v_item uuid;
  v_sug jsonb;
  v_precio numeric;
  v_items jsonb;
  v_venta jsonb;
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
  select count(*), sum(coalesce(nullif(pd.metros_facturados, 0), pd.metros_archivo)) into v_n, v_metros
  from public.prod_dtf_pedidos pd
  where pd.id = any (v_ids) and pd.empresa_id = v_emp and not pd.anulado and pd.tipo_cargo = 'VENTA'
    and not exists (select 1 from public.v3_comprobantes v where v.id = pd.comprobante_id and v.estado <> 'anulado');
  if v_n <> array_length(v_ids, 1) then
    raise exception 'Algún pedido ya está vendido, anulado o no es de venta. Actualizá la pantalla.';
  end if;
  if coalesce(v_metros, 0) <= 0 then raise exception 'Los pedidos no tienen metros.'; end if;

  v_item := coalesce(
    (select i.id from public.v3_items i join public.empresas e on e.id = v_emp
     where i.id::text = e.taller_config->>'item_dtf' and i.activo),
    (select id from public.v3_items where empresa_id = v_emp and activo and se_vende and categoria = 'DTF'
     and nombre ilike 'Impresión DTF%' order by created_at limit 1));
  if v_item is null then raise exception 'Falta el servicio "Impresión DTF" en Productos.'; end if;

  v_sug := public.precio_sugerido(jsonb_build_object('item_id', v_item, 'cliente_id', v_cli, 'cantidad', v_metros));
  v_precio := (v_sug->>'precio')::numeric;
  if v_precio is null then raise exception '"Impresión DTF" no tiene precio en la lista de precios.'; end if;

  select jsonb_agg(jsonb_build_object(
           'item_id', v_item, 'referencia_id', 'dtf:' || s.id, 'descripcion', 'Impresión DTF · ' || coalesce(s.nombre_archivo, ''),
           'cantidad', s.m, 'precio_unitario', v_precio, 'precio_lista', (v_sug->>'precio_lista')::numeric,
           'precio_origen', v_sug->>'origen') order by s.fecha_hora)
  into v_items
  from (select id, nombre_archivo, fecha_hora, coalesce(nullif(metros_facturados, 0), metros_archivo) as m
        from public.prod_dtf_pedidos where id = any (v_ids)) s;

  v_venta := public.registrar_venta(jsonb_build_object(
    'cliente_id', v_cli, 'items', v_items, 'usuario', public.usuario_actual(),
    'notas', format('DTF del taller: %s archivo(s), %s m', v_n, trim_scale(v_metros))));

  perform set_config('vg.taller_sistema', '1', true);
  update public.prod_dtf_pedidos set comprobante_id = (v_venta->>'id')::uuid, cliente_id = v_cli where id = any (v_ids);
  perform set_config('vg.taller_sistema', '', true);

  return v_venta || jsonb_build_object('metros', v_metros, 'precio_metro', v_precio, 'origen', v_sug->>'origen');
end $$;

-- ===== El ayudante de Google: trabaja con la empresa de su clave =====
drop function if exists public.taller_ayudante_ok(text);
create function public.taller_ayudante_ok(p_clave text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid;
begin
  update public.v3_claves_integracion set ultimo_uso_at = now()
  where nombre = 'taller_drive' and revocada_at is null
    and clave_hash = encode(extensions.digest(coalesce(p_clave, ''), 'sha256'), 'hex')
  returning empresa_id into v_emp;
  if v_emp is null then raise exception 'La clave del ayudante del taller no es válida.'; end if;
  return v_emp;
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
  v_quitados integer := 0;
begin
  for x in select * from jsonb_array_elements(coalesce(p_archivos, '[]'::jsonb)) loop
    continue when nullif(x->>'file_id', '') is null;
    v_ids := v_ids || (x->>'file_id');
    if not exists (select 1 from public.prod_pendientes_drive where file_id = x->>'file_id' and empresa_id = v_emp) then
      insert into public.prod_pendientes_drive (empresa_id, modulo, cliente, nombre_archivo, medida_unitaria, repeticiones, metros_totales,
                                               perfil_detectado, file_id, estado_impreso, creado_por)
      values (v_emp, coalesce(x->>'modulo', 'SUBLIMACION'), coalesce(nullif(x->>'cliente', ''), 'SIN CLIENTE'), x->>'nombre_archivo',
              coalesce(nullif(x->>'medida_unitaria', '')::numeric, 0), coalesce(nullif(x->>'repeticiones', '')::integer, 1),
              coalesce(nullif(x->>'metros_totales', '')::numeric, 0), coalesce(x->>'perfil_detectado', ''), x->>'file_id', 'NO', 'Drive');
      v_nuevos := v_nuevos + 1;
    else
      update public.prod_pendientes_drive set anulado = false, anulado_motivo = null, anulado_at = null, anulado_por = null
      where file_id = x->>'file_id' and empresa_id = v_emp and anulado and estado_impreso <> 'SI';
    end if;
  end loop;
  -- Si la lista vino vacía (Drive no respondió), no se anula nada
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    update public.prod_pendientes_drive set anulado = true, anulado_motivo = 'Ya no está en la fila de Drive'
    where empresa_id = v_emp and not anulado and estado_impreso <> 'SI' and not en_impresos and file_id is not null
      and file_id not like 'LOCAL-%' and file_id not like 'MANUAL-%' and not (file_id = any (v_ids));
    get diagnostics v_quitados = row_count;
  end if;
  return jsonb_build_object('ok', true, 'nuevos', v_nuevos, 'quitados', v_quitados);
end $$;

create or replace function public.taller_vigia_tareas(p_clave text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  return jsonb_build_object(
    'a_impresos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'file_id', file_id)) from (select id, file_id from public.prod_pendientes_drive
                  where empresa_id = v_emp and estado_impreso = 'SI' and not en_impresos and not anulado limit 200) s), '[]'::jsonb),
    'a_fila', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'file_id', file_id)) from (select id, file_id from public.prod_pendientes_drive
              where empresa_id = v_emp and estado_impreso = 'NO' and en_impresos and not anulado limit 200) s), '[]'::jsonb));
end $$;

create or replace function public.taller_vigia_movido(p_clave text, p_id uuid, p_en_impresos boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  update public.prod_pendientes_drive set en_impresos = p_en_impresos where id = p_id and empresa_id = v_emp;
  return jsonb_build_object('ok', true);
end $$;

-- ===== Permisos de las funciones =====
revoke execute on function public.taller_ayudante_ok(text), public.tg_prod_quien(), public.tg_prod_dtf_vendido() from public, anon, authenticated;
revoke execute on function public.taller_drive_sincronizar(text, jsonb), public.taller_vigia_tareas(text), public.taller_vigia_movido(text, uuid, boolean) from public;
grant execute on function public.taller_drive_sincronizar(text, jsonb), public.taller_vigia_tareas(text), public.taller_vigia_movido(text, uuid, boolean) to anon, authenticated;
revoke execute on function public.taller_operarios(), public.taller_operario_entrar(uuid, text), public.taller_operario_salir(text),
  public.taller_ajustes_guardar(jsonb), public.taller_buscar_clientes(text), public.taller_dtf_vender(jsonb), public.taller_dtf_pedidos() from public, anon;
grant execute on function public.taller_operarios(), public.taller_operario_entrar(uuid, text), public.taller_operario_salir(text),
  public.taller_ajustes_guardar(jsonb), public.taller_buscar_clientes(text), public.taller_dtf_vender(jsonb), public.taller_dtf_pedidos() to authenticated;
