-- ============================================================================
-- Taller: alertas y recordatorios programados (23/10/2026)
-- Ej.: "miércoles y sábados: dejar el cabezal de blanco de la DTF en remojo", "todos los días: cabezales en remojo".
-- Aparecen en la pantalla del taller el día y la hora programados hasta que alguien toca "✓ Hecho". Queda anotado quién
-- y cuándo (prod_alertas_hechas), así se ve si algún día se olvidó. Nada se borra: las alertas se pausan.
-- Volver atrás: 20261023220000_taller_alertas_down.sql
-- ============================================================================

create table if not exists public.prod_alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_actual() references public.empresas(id),
  titulo text not null,
  detalle text not null default '',
  sector text not null default 'Todos',            -- para quién es: Todos, Impresión, Calandrado, Láser, DTF
  dias smallint[] not null default '{0,1,2,3,4,5,6}', -- días de la semana: 0 domingo … 6 sábado
  hora time,                                        -- desde qué hora aparece (vacío: desde que empieza el día)
  activo boolean not null default true,
  creado_por text,
  created_at timestamptz not null default now(),
  actualizado_por text,
  actualizado_at timestamptz
);

create table if not exists public.prod_alertas_hechas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_actual() references public.empresas(id),
  alerta_id uuid not null references public.prod_alertas(id),
  fecha date not null,                              -- el día (hora de Buenos Aires)
  hecha_por text,
  hecha_at timestamptz not null default now(),
  nota text not null default ''
);
create unique index if not exists prod_alertas_hechas_dia_uq on public.prod_alertas_hechas (alerta_id, fecha);

alter table public.prod_alertas enable row level security;
alter table public.prod_alertas_hechas enable row level security;
drop policy if exists "Taller: leer" on public.prod_alertas;
create policy "Taller: leer" on public.prod_alertas for select to authenticated
  using ((select public.tengo_permiso('taller')) and empresa_id = (select public.mi_empresa()));
drop policy if exists "Taller: leer" on public.prod_alertas_hechas;
create policy "Taller: leer" on public.prod_alertas_hechas for select to authenticated
  using ((select public.tengo_permiso('taller')) and empresa_id = (select public.mi_empresa()));
revoke all on public.prod_alertas, public.prod_alertas_hechas from anon, authenticated;
grant select on public.prod_alertas, public.prod_alertas_hechas to authenticated;

-- Las pantallas del taller se enteran al instante (cuando alguien marca "Hecho" se va de todas)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'prod_alertas') then
    alter publication supabase_realtime add table public.prod_alertas;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'prod_alertas_hechas') then
    alter publication supabase_realtime add table public.prod_alertas_hechas;
  end if;
end $$;

-- Crear o cambiar una alerta. p: { id?, titulo, detalle, sector, dias: [0..6], hora: 'HH:MM' | null, activo }
create or replace function public.taller_alerta_guardar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_titulo text := trim(regexp_replace(coalesce(p->>'titulo', ''), '\s+', ' ', 'g'));
  v_dias smallint[];
  v_hora time := nullif(p->>'hora', '')::time;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if length(v_titulo) < 3 then raise exception 'Escribí qué hay que hacer.'; end if;
  select array_agg(distinct d::smallint order by d::smallint) into v_dias from jsonb_array_elements_text(coalesce(p->'dias', '[]'::jsonb)) d;
  if coalesce(array_length(v_dias, 1), 0) = 0 then raise exception 'Elegí al menos un día.'; end if;
  if exists (select 1 from unnest(v_dias) d where d < 0 or d > 6) then raise exception 'Día inválido.'; end if;

  if v_id is null then
    insert into public.prod_alertas (empresa_id, titulo, detalle, sector, dias, hora, activo, creado_por)
    values (v_emp, v_titulo, coalesce(trim(p->>'detalle'), ''), coalesce(nullif(trim(p->>'sector'), ''), 'Todos'), v_dias, v_hora,
            coalesce(nullif(p->>'activo', '')::boolean, true), public.usuario_actual())
    returning id into v_id;
  else
    update public.prod_alertas
       set titulo = v_titulo, detalle = coalesce(trim(p->>'detalle'), ''), sector = coalesce(nullif(trim(p->>'sector'), ''), 'Todos'),
           dias = v_dias, hora = v_hora, activo = coalesce(nullif(p->>'activo', '')::boolean, activo),
           actualizado_por = public.usuario_actual(), actualizado_at = now()
     where id = v_id and empresa_id = v_emp;
    if not found then raise exception 'Esa alerta ya no está. Actualizá la pantalla.'; end if;
  end if;

  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_ALERTA', format('Alerta "%s": días %s%s%s', v_titulo, array_to_string(v_dias, ','),
          coalesce(' desde las ' || to_char(v_hora, 'HH24:MI'), ''),
          case when coalesce(nullif(p->>'activo', '')::boolean, true) then '' else ' (pausada)' end), public.usuario_actual());
  return jsonb_build_object('id', v_id);
end $$;

-- Marcar una alerta como hecha hoy. p: { alerta, quien, nota }
create or replace function public.taller_alerta_hecha(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_quien text := coalesce(nullif(trim(p->>'quien'), ''), public.usuario_actual());
  v_ya record;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if not exists (select 1 from public.prod_alertas where id = nullif(p->>'alerta', '')::uuid and empresa_id = v_emp) then
    raise exception 'Esa alerta ya no está. Actualizá la pantalla.';
  end if;
  select hecha_por, hecha_at into v_ya from public.prod_alertas_hechas where alerta_id = (p->>'alerta')::uuid and fecha = v_hoy;
  if found then return jsonb_build_object('ya_estaba', true, 'hecha_por', v_ya.hecha_por, 'hecha_at', v_ya.hecha_at); end if;
  insert into public.prod_alertas_hechas (empresa_id, alerta_id, fecha, hecha_por, nota)
  values (v_emp, (p->>'alerta')::uuid, v_hoy, v_quien, coalesce(trim(p->>'nota'), ''));
  return jsonb_build_object('ya_estaba', false, 'hecha_por', v_quien, 'fecha', v_hoy);
end $$;

revoke execute on function public.taller_alerta_guardar(jsonb), public.taller_alerta_hecha(jsonb) from public, anon;
grant execute on function public.taller_alerta_guardar(jsonb), public.taller_alerta_hecha(jsonb) to authenticated;
comment on table public.prod_alertas is 'Alertas y recordatorios del taller (días de la semana y hora). Se pausan, no se borran.';
