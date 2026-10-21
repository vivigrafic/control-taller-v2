-- ============================================================================
-- Telas unidas con el sistema (22/10/2026)
-- Cada ficha técnica del taller (temperatura, velocidad, ancho, rinde...) es la ficha de UNA tela de Productos
-- (v3_items, categoría Telas), que es la que se compra, se vende y entra al módulo Telas (partidas P-00001...).
-- La unión se guarda del lado del taller: el núcleo no depende del taller; el taller sí del núcleo.
-- - prod_telas_ficha.item_id: la tela del sistema (una ficha por tela).
-- - prod_telas_variantes.partida_id: opcional, la partida real de esa variante (ancho y rinde medidos).
-- - taller_telas_sistema(): las telas del sistema con lo que queda en stock (propio y de clientes).
-- - taller_tela_unir(ficha, item): une (o crea la tela en Productos con guardar_item). Pide el permiso de productos.
-- Volver atrás: 20261022180000_telas_unidas_down.sql
-- ============================================================================

alter table public.prod_telas_ficha add column if not exists item_id uuid references public.v3_items(id);
create unique index if not exists prod_telas_ficha_item_uk on public.prod_telas_ficha (empresa_id, item_id)
  where item_id is not null and not anulado;
alter table public.prod_telas_variantes add column if not exists partida_id uuid references public.v3_telas_partidas(id);

-- Telas del sistema para el taller (solo lo necesario: nombre, unidad y lo que queda)
create or replace function public.taller_telas_sistema()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v_emp uuid := public.mi_empresa();
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'nombre', i.nombre, 'unidad', i.unidad,
      'ficha_id', (select f.id from public.prod_telas_ficha f where f.item_id = i.id and f.empresa_id = v_emp and not f.anulado limit 1),
      'partidas', (select count(*) from public.v_telas_saldos s where s.item_id = i.id and not s.anulado
                   and coalesce(s.queda_kilos, s.queda_metros, 1) > 0),
      'kilos_propios', (select round(sum(s.queda_kilos), 2) from public.v_telas_saldos s where s.item_id = i.id and not s.anulado and s.dueno = 'taller'),
      'kilos_clientes', (select round(sum(s.queda_kilos), 2) from public.v_telas_saldos s where s.item_id = i.id and not s.anulado and s.dueno = 'cliente'))
      order by i.nombre)
    from public.v3_items i
    where i.empresa_id = v_emp and i.activo and i.tipo = 'material' and lower(coalesce(i.categoria, '')) = 'telas'), '[]'::jsonb);
end $$;

-- Une una ficha del taller con una tela del sistema. Sin p_item: crea la tela en Productos con el nombre de la ficha.
create or replace function public.taller_tela_unir(p_ficha uuid, p_item uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  f public.prod_telas_ficha%rowtype;
  v_item uuid := p_item;
  v_otra text;
  v_nombre text;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  perform public.puede_editar_catalogo();
  select * into f from public.prod_telas_ficha where id = p_ficha and empresa_id = v_emp and not anulado;
  if not found then raise exception 'No encontramos esa ficha.'; end if;
  if v_item is null then
    v_item := public.guardar_item(jsonb_build_object(
      'nombre', f.nombre_comercial, 'tipo', 'material', 'categoria', 'Telas',
      -- la unidad de las otras telas (casi siempre se compran por kilo)
      'unidad', coalesce((select mode() within group (order by unidad) from public.v3_items
                         where empresa_id = v_emp and lower(coalesce(categoria, '')) = 'telas'), 'kilo'),
      'se_compra', true, 'se_vende', true, 'controla_stock', false,
      'descripcion', nullif(concat_ws(' · ', f.composicion, f.observaciones), ''),
      'notas', 'Creada desde la ficha técnica del taller'));
  elsif not exists (select 1 from public.v3_items where id = v_item and empresa_id = v_emp and activo) then
    raise exception 'Esa tela no está en Productos.';
  end if;
  select nombre_comercial into v_otra from public.prod_telas_ficha
  where empresa_id = v_emp and item_id = v_item and id <> p_ficha and not anulado limit 1;
  if v_otra is not null then raise exception 'Esa tela ya está unida a la ficha "%".', v_otra; end if;
  update public.prod_telas_ficha set item_id = v_item where id = p_ficha;
  select nombre into v_nombre from public.v3_items where id = v_item;
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_TELA_UNIDA', format('Ficha "%s" unida a la tela "%s" de Productos', f.nombre_comercial, v_nombre), public.usuario_actual());
  return jsonb_build_object('item_id', v_item, 'nombre', v_nombre, 'creada', p_item is null);
end $$;

create or replace function public.taller_tela_separar(p_ficha uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp uuid := public.mi_empresa();
  v_nombre text;
begin
  if v_emp is null or not public.tengo_permiso('taller') then raise exception 'Este usuario no tiene el taller.'; end if;
  perform public.puede_editar_catalogo();
  update public.prod_telas_ficha set item_id = null where id = p_ficha and empresa_id = v_emp returning nombre_comercial into v_nombre;
  if v_nombre is null then raise exception 'No encontramos esa ficha.'; end if;
  insert into public.v3_bitacora (tipo_evento, detalle, usuario)
  values ('TALLER_TELA_UNIDA', format('Ficha "%s" separada de su tela de Productos', v_nombre), public.usuario_actual());
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.taller_telas_sistema(), public.taller_tela_unir(uuid, uuid), public.taller_tela_separar(uuid) from public, anon;
grant execute on function public.taller_telas_sistema(), public.taller_tela_unir(uuid, uuid), public.taller_tela_separar(uuid) to authenticated;
