-- ============================================================================
-- Copia silenciosa a la planilla vieja (22/10/2026)
-- Mientras la app vieja del taller (Google) se siga usando en algunas PC, todo lo que se carga en la app nueva se
-- copia solo a su planilla, con el mismo formato que usa la app vieja: impresiones, calandrado, láser, rollos
-- nuevos, bobinas sobrantes y fallas. Así la app vieja ve lo mismo.
-- - Cada alta, cambio o anulación en esas tablas deja un aviso en prod_sync_sheets_queue (la "lista de pendientes").
-- - La terminal de Google (cada minuto, con su clave) los lee con taller_planilla_pendientes, escribe la planilla y
--   los marca con taller_planilla_hecho.
-- Volver atrás: 20261022200000_copia_planilla_vieja_down.sql
-- ============================================================================

alter table public.prod_sync_sheets_queue add column if not exists empresa_id uuid references public.empresas(id) default public.empresa_actual();
alter table public.prod_sync_sheets_queue add column if not exists tabla text;
alter table public.prod_sync_sheets_queue add column if not exists registro_id text;
alter table public.prod_sync_sheets_queue add column if not exists intentos integer not null default 0;
alter table public.prod_sync_sheets_queue add column if not exists error text;
alter table public.prod_sync_sheets_queue add column if not exists procesado_at timestamptz;
create index if not exists prod_sync_sheets_queue_pendientes_idx on public.prod_sync_sheets_queue (empresa_id, created_at) where not sincronizado;

-- Cada alta, cambio que la planilla muestra, o anulación, deja su aviso
create or replace function public.tg_prod_a_planilla()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v jsonb := to_jsonb(new);
  o jsonb;
  v_op text;
  ignorar text[] := array['actualizado_at', 'actualizado_por', 'creado_por'];
begin
  if tg_op = 'INSERT' then
    if coalesce((v->>'anulado')::boolean, false) then return new; end if;
    v_op := 'alta';
  else
    o := to_jsonb(old);
    if coalesce((v->>'anulado')::boolean, false) and not coalesce((o->>'anulado')::boolean, false) then v_op := 'anular';
    elsif coalesce((v->>'anulado')::boolean, false) then return new;
    elsif (v - ignorar) is distinct from (o - ignorar) then v_op := 'cambio';
    else return new;
    end if;
  end if;
  insert into public.prod_sync_sheets_queue (empresa_id, hoja_destino, tabla, registro_id, operacion, payload, sincronizado)
  values (coalesce((v->>'empresa_id')::uuid, public.empresa_actual()), tg_table_name, tg_table_name,
          coalesce(v->>'id', v->>'id_rollo'), v_op, v || jsonb_build_object('_antes', o), false);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['prod_impresiones', 'prod_cola_calandrado', 'prod_cola_laser', 'prod_rollos_papel',
                           'prod_fallas_reposiciones', 'prod_sobrantes'] loop
    execute format('drop trigger if exists taller_a_planilla on public.%I', t);
    execute format('create trigger taller_a_planilla after insert or update on public.%I for each row execute function public.tg_prod_a_planilla()', t);
  end loop;
end $$;

-- Lo que falta copiar (en orden), para la terminal de Google
create or replace function public.taller_planilla_pendientes(p_clave text, p_limite integer default 100)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'tabla', tabla, 'operacion', operacion, 'payload', payload,
                                                       'intentos', intentos) order by created_at, id)
    from (select * from public.prod_sync_sheets_queue
          where empresa_id = v_emp and not sincronizado and not anulado and intentos < 5
          order by created_at, id limit greatest(1, least(coalesce(p_limite, 100), 300))) s), '[]'::jsonb);
end $$;

-- La terminal avisa qué copió (p_ok) y, si uno falló, cuál y por qué (se reintenta hasta 5 veces)
create or replace function public.taller_planilla_hecho(p_clave text, p_ok uuid[], p_error_id uuid default null, p_error text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_emp uuid := public.taller_ayudante_ok(p_clave);
begin
  update public.prod_sync_sheets_queue set sincronizado = true, procesado_at = now(), error = null
  where empresa_id = v_emp and id = any (coalesce(p_ok, '{}'));
  if p_error_id is not null then
    update public.prod_sync_sheets_queue set intentos = intentos + 1, error = left(coalesce(p_error, 'sin detalle'), 300)
    where empresa_id = v_emp and id = p_error_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.tg_prod_a_planilla() from public, anon, authenticated;
revoke execute on function public.taller_planilla_pendientes(text, integer), public.taller_planilla_hecho(text, uuid[], uuid, text) from public;
grant execute on function public.taller_planilla_pendientes(text, integer), public.taller_planilla_hecho(text, uuid[], uuid, text) to anon, authenticated;

-- Lo que la app nueva ya cargó antes de esta copia (las primeras impresiones del 21/10) también va a la planilla
insert into public.prod_sync_sheets_queue (empresa_id, hoja_destino, tabla, registro_id, operacion, payload, sincronizado, created_at)
select empresa_id, 'prod_impresiones', 'prod_impresiones', id::text, 'alta', to_jsonb(i), false, created_at
from public.prod_impresiones i where creado_por is not null and not anulado and created_at > '2026-10-21'
  and not exists (select 1 from public.prod_sync_sheets_queue q where q.registro_id = i.id::text);
insert into public.prod_sync_sheets_queue (empresa_id, hoja_destino, tabla, registro_id, operacion, payload, sincronizado, created_at)
select empresa_id, 'prod_cola_calandrado', 'prod_cola_calandrado', id::text, 'alta', to_jsonb(c), false, created_at + interval '1 millisecond'
from public.prod_cola_calandrado c where creado_por is not null and not anulado and created_at > '2026-10-21'
  and not exists (select 1 from public.prod_sync_sheets_queue q where q.registro_id = c.id::text);
