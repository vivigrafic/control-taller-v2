-- ============================================================================
-- DTF: imprimir en lote (fase 1 del plan Imprimir → Separar → Vender, 22/10/2026)
-- Antes cada archivo de la fila se cargaba y confirmaba de a uno (una tirada por archivo). Ahora el operario marca
-- muchos archivos (anidados en el RIP, de distintos clientes) y los imprime juntos: UNA tirada con todos, un pedido por
-- archivo (que pasa a la cola de ventas), y los archivos salen de la fila (el vigía los mueve a IMPRESOS).
-- También se dejan las columnas que usan las fases 2 y 3 (separar y juntar para vender).
-- Volver atrás: 20261023000000_dtf_imprimir_en_lote_down.sql
-- ============================================================================

alter table public.prod_dtf_pedidos add column if not exists pendiente_id uuid references public.prod_pendientes_drive(id);
alter table public.prod_dtf_pedidos add column if not exists separado_at timestamptz;
alter table public.prod_dtf_pedidos add column if not exists separado_por text;
alter table public.prod_dtf_pedidos add column if not exists grupo_venta text;
create index if not exists prod_dtf_pedidos_tirada_idx on public.prod_dtf_pedidos (tirada_id);

-- p: { pendientes: [id de la fila], id_rollo_dtf, metros_rip (opcional: los reales del RIP), observaciones }
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

  -- Una tirada con todos los archivos (anidados en el RIP)
  v_codigo := 'DTF-' || lpad(((select count(*) from public.prod_dtf_tiradas where empresa_id = v_emp) + 1)::text, 5, '0');
  insert into public.prod_dtf_tiradas (empresa_id, codigo_tirada, id_rollo_dtf, marca_rollo, perfil_usado, es_anidado,
                                       metros_consumidos_rollo, metros_desperdicio, observaciones)
  values (v_emp, v_codigo, v_rollo.id_rollo_dtf, coalesce(v_rollo.marca_fabricante, ''), coalesce(v_rollo.perfil_impresion, ''), v_n > 1,
          round(v_rip, 2), greatest(round(v_rip - v_metros, 2), 0), coalesce(v_obs, ''))
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

revoke execute on function public.taller_dtf_imprimir(jsonb) from public, anon;
grant execute on function public.taller_dtf_imprimir(jsonb) to authenticated;
comment on function public.taller_dtf_imprimir(jsonb) is 'Imprime en lote (anidado): una tirada, un pedido por archivo y los archivos salen de la fila.';
