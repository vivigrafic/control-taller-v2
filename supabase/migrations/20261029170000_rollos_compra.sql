-- ============================================================================
-- Rollos de papel y film ↔ compras (29/10/2026, plan aprobado por el dueño, fase C). Va con la migración del ERP
-- 20261031180000_insumos (aplicarla antes: crea insumo_item_ y las columnas).
-- Cada rollo que se monta guarda de qué compra sale (item_id y comprobante_item_id). Por defecto, la última compra de ese
-- insumo (lo pone un disparador); en la pantalla se puede elegir otra. No mueve stock: el papel y el film siguen bajando con
-- las ventas (decisión del dueño). Sirve para el informe de insumos (lo montado y lo usado de cada proveedor).
-- Volver atrás: 20261029170000_rollos_compra_down.sql
-- ============================================================================

alter table public.prod_rollos_papel add column if not exists item_id uuid references public.v3_items(id);
alter table public.prod_rollos_papel add column if not exists comprobante_item_id uuid references public.v3_comprobantes_items(id);
alter table public.prod_dtf_rollos add column if not exists item_id uuid references public.v3_items(id);
alter table public.prod_dtf_rollos add column if not exists comprobante_item_id uuid references public.v3_comprobantes_items(id);

-- La última compra de un insumo (el renglón)
create or replace function public.insumo_ultima_compra_(p_item uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select ci.id from public.v3_comprobantes_items ci join public.v3_comprobantes c on c.id = ci.comprobante_id
  where ci.item_id = p_item and c.tipo_comprobante = 'compra' and c.estado <> 'anulado'
  order by c.fecha_emision desc, c.created_at desc limit 1
$$;
revoke execute on function public.insumo_ultima_compra_(uuid) from public, anon, authenticated;

-- Al montar: el ítem y, si no se eligió, la última compra
create or replace function public.tg_rollo_compra()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  begin
    new.item_id := coalesce(new.item_id, public.insumo_item_(case when tg_table_name = 'prod_dtf_rollos' then 'film' else 'papel' end));
    if new.comprobante_item_id is null and new.item_id is not null then
      new.comprobante_item_id := public.insumo_ultima_compra_(new.item_id);
    end if;
  exception when others then raise warning 'Rollo ↔ compra: %', sqlerrm;   -- el rollo se monta igual
  end;
  return new;
end $$;
revoke execute on function public.tg_rollo_compra() from public, anon, authenticated;
drop trigger if exists rollo_compra on public.prod_rollos_papel;
create trigger rollo_compra before insert on public.prod_rollos_papel for each row execute function public.tg_rollo_compra();
drop trigger if exists rollo_compra on public.prod_dtf_rollos;
create trigger rollo_compra before insert on public.prod_dtf_rollos for each row execute function public.tg_rollo_compra();

-- Las últimas compras de papel o film, para elegir de cuál sale el rollo. p_tipo: 'papel' | 'film'
create or replace function public.taller_compras_insumo(p_tipo text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_item uuid := public.insumo_item_(p_tipo);
begin
  if public.mi_empresa() is null or not (public.tengo_permiso('taller') or public.tengo_permiso('compras')) then raise exception 'Este usuario no tiene el taller.'; end if;
  return jsonb_build_object('item_id', v_item, 'compras', coalesce((
    select jsonb_agg(x order by x->>'fecha' desc) from (
      select jsonb_build_object('id', ci.id, 'numero', c.numero_comprobante, 'fecha', c.fecha_emision::date, 'proveedor', cl.nombre_completo,
               'cantidad', ci.cantidad, 'unidad_compra', i.unidad_compra, 'metros', coalesce(ci.cantidad_stock, ci.cantidad * coalesce(i.factor_compra, 1)),
               'precio', ci.precio_unitario,
               'rollos_montados', (select count(*) from public.prod_rollos_papel r where r.comprobante_item_id = ci.id and not r.anulado)
                                  + (select count(*) from public.prod_dtf_rollos r where r.comprobante_item_id = ci.id and not r.anulado)) as x
      from public.v3_comprobantes_items ci join public.v3_comprobantes c on c.id = ci.comprobante_id
      join public.v3_items i on i.id = ci.item_id
      left join public.v3_clientes cl on cl.id_cliente = c.cliente_id
      where ci.item_id = v_item and c.tipo_comprobante = 'compra' and c.estado <> 'anulado'
      order by c.fecha_emision desc, c.created_at desc limit 8) z), '[]'::jsonb));
end $$;
revoke execute on function public.taller_compras_insumo(text) from public, anon;
grant execute on function public.taller_compras_insumo(text) to authenticated;

-- Cambiar de qué compra sale un rollo. p: { tipo: 'papel' | 'film', id_rollo, comprobante_item_id (vacío: ninguna) }
create or replace function public.taller_rollo_compra(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_ci uuid := nullif(p->>'comprobante_item_id', '')::uuid;
  v_n int;
  v_txt text;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  if v_ci is not null then
    select format('%s de %s', c.numero_comprobante, coalesce(cl.nombre_completo, 'sin proveedor')) into v_txt
    from public.v3_comprobantes_items ci join public.v3_comprobantes c on c.id = ci.comprobante_id left join public.v3_clientes cl on cl.id_cliente = c.cliente_id
    where ci.id = v_ci and c.tipo_comprobante = 'compra' and c.estado <> 'anulado';
    if v_txt is null then raise exception 'Esa compra no existe o está anulada.'; end if;
  end if;
  if p->>'tipo' = 'film' then
    update public.prod_dtf_rollos set comprobante_item_id = v_ci where id_rollo_dtf = p->>'id_rollo' and empresa_id = v_emp;
  else
    update public.prod_rollos_papel set comprobante_item_id = v_ci where id_rollo = p->>'id_rollo' and empresa_id = v_emp;
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'No encontré ese rollo.'; end if;
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_ROLLO_COMPRA', format('El rollo %s sale de %s', p->>'id_rollo', coalesce(v_txt, 'ninguna compra cargada')), public.usuario_actual());
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.taller_rollo_compra(jsonb) from public, anon;
grant execute on function public.taller_rollo_compra(jsonb) to authenticated;
