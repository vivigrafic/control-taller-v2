-- Vuelve atrás 20261023140000_dtf_separar.sql (las marcas de separado y las fallas anotadas quedan)
-- Después de esto, volver a correr 20261023120000_dtf_cola_ventas.sql para la cola de ventas sin "lo que falta".
drop function if exists public.taller_dtf_falla(jsonb);
drop function if exists public.taller_dtf_separar(jsonb);

drop function if exists public.taller_dtf_pedidos();
create function public.taller_dtf_pedidos()
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
revoke execute on function public.taller_dtf_pedidos() from public, anon;
grant execute on function public.taller_dtf_pedidos() to authenticated;
