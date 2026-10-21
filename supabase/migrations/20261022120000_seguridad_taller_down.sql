-- Vuelve a dejar las tablas del taller abiertas (como antes del 22/10/2026). Solo para emergencias: queda sin seguridad.
do $$
declare t text;
begin
  foreach t in array array['prod_rollos_papel', 'prod_impresiones', 'prod_cola_calandrado', 'prod_cola_laser', 'prod_pendientes_drive',
    'prod_sobrantes', 'prod_fallas_reposiciones', 'prod_catalogos', 'prod_finanzas_taller', 'prod_dtf_rollos', 'prod_dtf_tiradas',
    'prod_dtf_pedidos', 'prod_chat_mensajes', 'prod_sync_sheets_queue', 'prod_telas_ficha', 'prod_telas_variantes', 'prod_telas_parametros',
    'prod_historial_anchos_tela'] loop
    execute format('drop trigger if exists taller_quien on public.%I', t);
    execute format('drop trigger if exists taller_no_borrar on public.%I', t);
    execute format('drop policy if exists "Taller: leer" on public.%I', t);
    execute format('drop policy if exists "Taller: cargar" on public.%I', t);
    execute format('drop policy if exists "Taller: cambiar" on public.%I', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', 'Acceso total pruebas ' || t, t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;
drop function if exists public.taller_drive_sincronizar(text, jsonb), public.taller_vigia_tareas(text), public.taller_vigia_movido(text, uuid, boolean),
  public.taller_clave_ayudante(), public.taller_ayudante_ok(text), public.tg_prod_quien(), public.tg_prod_no_borrar();
-- Las columnas nuevas (anulado, creado_por, …) quedan: no molestan y guardan la historia.
