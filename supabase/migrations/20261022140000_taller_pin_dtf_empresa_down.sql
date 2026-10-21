-- Vuelve atrás 20261022140000_taller_pin_dtf_empresa.sql.
-- Después de correr este archivo, correr de nuevo 20261022120000_seguridad_taller.sql: deja tg_prod_quien, las
-- funciones del ayudante y las políticas como estaban (sin empresa ni PIN).

drop trigger if exists taller_dtf_vendido on public.prod_dtf_pedidos;
drop function if exists public.tg_prod_dtf_vendido();
drop function if exists public.taller_dtf_vender(jsonb);
drop function if exists public.taller_dtf_pedidos();
drop function if exists public.taller_buscar_clientes(text);
drop function if exists public.taller_ajustes_guardar(jsonb);
drop function if exists public.taller_operario_salir(text);
drop function if exists public.taller_operario_entrar(uuid, text);
drop function if exists public.taller_operarios();
drop function if exists public.taller_ayudante_ok(text);

alter table public.prod_dtf_pedidos drop column if exists comprobante_id;
alter table public.prod_dtf_pedidos drop column if exists cliente_id;

create or replace view public.v_prod_dtf_cuentas_clientes with (security_invoker = true) as
select upper(trim(both from cliente)) as cliente_normalizado,
  max(cliente) as cliente_nombre,
  count(*) filter (where not anulado) as total_archivos,
  coalesce(sum(metros_archivo) filter (where not anulado and tipo_cargo = 'VENTA'), 0)::numeric(12,2) as metros_comprados,
  coalesce(sum(metros_archivo) filter (where not anulado and tipo_cargo = 'REPOSICION'), 0)::numeric(12,2) as metros_reposicion,
  coalesce(sum(metros_archivo) filter (where not anulado and tipo_cargo = 'MUESTRA'), 0)::numeric(12,2) as metros_muestras,
  coalesce(sum(subtotal_cobrar) filter (where not anulado), 0)::numeric(14,2) as total_facturado,
  coalesce(sum(monto_pagado) filter (where not anulado), 0)::numeric(14,2) as total_abonado,
  coalesce(sum(subtotal_cobrar - monto_pagado) filter (where not anulado), 0)::numeric(14,2) as saldo_pendiente
from public.prod_dtf_pedidos
group by upper(trim(both from cliente));
revoke all on public.v_prod_dtf_cuentas_clientes from anon;
grant select on public.v_prod_dtf_cuentas_clientes to authenticated;

drop table if exists public.prod_operario_sesiones;
alter table public.empresas drop column if exists taller_config;

drop view if exists public.v_prod_rollos_papel_saldos;
do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'empresa_id' and c.data_type = 'uuid'
             and c.table_name like 'prod\_%' and c.table_name not like '%respaldo%' loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_empresa_fk');
    execute format('alter table public.%I alter column empresa_id drop default', t);
    execute format('alter table public.%I alter column empresa_id type text using ''vvgrafic-principal''', t);
    execute format('alter table public.%I alter column empresa_id set default ''vvgrafic-principal''', t);
  end loop;
end $$;
-- La vista v_prod_rollos_papel_saldos y las políticas vuelven al correr 20261022120000_seguridad_taller.sql
