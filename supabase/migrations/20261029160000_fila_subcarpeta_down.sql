-- Vuelve atrás 20261029160000_fila_subcarpeta.sql (taller_drive_sincronizar como estaba; la columna subcarpeta la saca el
-- down del ERP 20261031150000_fila_carpeta_manda_down.sql)

CREATE OR REPLACE FUNCTION public.taller_drive_sincronizar(p_clave text, p_archivos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp uuid := public.taller_ayudante_ok(p_clave);
  x jsonb;
  v_ids text[] := '{}';
  v_nuevos integer := 0;
  v_cambiados integer := 0;
  v_quitados integer := 0;
  v_volvieron integer := 0;
  n integer;
begin
  for x in select * from jsonb_array_elements(coalesce(p_archivos, '[]'::jsonb)) loop
    continue when nullif(x->>'file_id', '') is null;
    v_ids := v_ids || (x->>'file_id');
    if not exists (select 1 from public.prod_pendientes_drive where file_id = x->>'file_id' and empresa_id = v_emp) then
      insert into public.prod_pendientes_drive (empresa_id, modulo, cliente, nombre_archivo, medida_unitaria, repeticiones, metros_totales,
                                               perfil_detectado, file_id, estado_impreso, creado_por, metros_dpi_real, dpi_detectado, discrepancia_medida)
      values (v_emp, coalesce(x->>'modulo', 'SUBLIMACION'), coalesce(nullif(x->>'cliente', ''), 'SIN CLIENTE'), x->>'nombre_archivo',
              coalesce(nullif(x->>'medida_unitaria', '')::numeric, 0), coalesce(nullif(x->>'repeticiones', '')::integer, 1),
              coalesce(nullif(x->>'metros_totales', '')::numeric, 0), coalesce(x->>'perfil_detectado', ''), x->>'file_id', 'NO', 'Drive',
              nullif(x->>'metros_reales', '')::numeric, nullif(x->>'dpi', '')::integer, coalesce((x->>'discrepancia')::boolean, false));
      v_nuevos := v_nuevos + 1;
    else
      -- Un archivo ya impreso que alguien volvió a poner en la fila (estaba en IMPRESOS): vuelve a la cola para imprimirse de
      -- nuevo, con el aviso de cuándo se imprimió (al imprimirlo se pregunta si es reposición o si se cobra otra vez)
      update public.prod_pendientes_drive set estado_impreso = 'NO', impreso_at = null, en_impresos = false,
        ya_impreso_at = coalesce(impreso_at, actualizado_at, now()), veces_impreso = coalesce(veces_impreso, 0) + 1,
        metros_impresos_parcial = 0, parcial_detalle = null, calandrado_at = null, cortado_at = null
      where file_id = x->>'file_id' and empresa_id = v_emp and estado_impreso = 'SI' and en_impresos and not anulado;
      get diagnostics n = row_count;
      if n > 0 then
        v_volvieron := v_volvieron + n;
        insert into public.v3_bitacora (tipo_evento, detalle, usuario)
        values ('TALLER_FILA_VOLVIO', format('%s volvió a la fila después de imprimirse: queda para imprimir de nuevo', x->>'nombre_archivo'), 'Ayudante de Google');
      end if;
      -- Volvió a la fila: otra vez pendiente
      update public.prod_pendientes_drive set anulado = false, anulado_motivo = null, anulado_at = null, anulado_por = null,
        fuera_fila_at = null, fuera_fila_donde = null, fuera_fila_carpeta = null, fuera_fila_resuelto = null
      where file_id = x->>'file_id' and empresa_id = v_emp and anulado and estado_impreso <> 'SI';
      -- Lo que cambió en la fila (se renombró el archivo, se lo pasó a otra carpeta, cambió la medida)
      update public.prod_pendientes_drive p set
        nombre_archivo = coalesce(x->>'nombre_archivo', p.nombre_archivo),
        cliente = coalesce(nullif(x->>'cliente', ''), p.cliente),
        modulo = coalesce(nullif(x->>'modulo', ''), p.modulo),
        medida_unitaria = coalesce(nullif(x->>'medida_unitaria', '')::numeric, p.medida_unitaria),
        repeticiones = coalesce(nullif(x->>'repeticiones', '')::integer, p.repeticiones),
        metros_totales = coalesce(nullif(x->>'metros_totales', '')::numeric, p.metros_totales),
        perfil_detectado = coalesce(x->>'perfil_detectado', p.perfil_detectado),
        metros_dpi_real = coalesce(nullif(x->>'metros_reales', '')::numeric, p.metros_dpi_real),
        dpi_detectado = coalesce(nullif(x->>'dpi', '')::integer, p.dpi_detectado),
        discrepancia_medida = coalesce((x->>'discrepancia')::boolean, p.discrepancia_medida),
        cliente_id = case when coalesce(nullif(x->>'cliente', ''), p.cliente) is distinct from p.cliente and coalesce(p.creado_por, '') <> 'Mandar a imprimir' then null else p.cliente_id end,
        trabajo_id = case when coalesce(nullif(x->>'cliente', ''), p.cliente) is distinct from p.cliente and coalesce(p.creado_por, '') <> 'Mandar a imprimir' then null else p.trabajo_id end
      where p.file_id = x->>'file_id' and p.empresa_id = v_emp and p.estado_impreso <> 'SI'
        and (p.nombre_archivo is distinct from coalesce(x->>'nombre_archivo', p.nombre_archivo)
          or p.cliente is distinct from coalesce(nullif(x->>'cliente', ''), p.cliente)
          or p.modulo is distinct from coalesce(nullif(x->>'modulo', ''), p.modulo)
          or p.metros_totales is distinct from coalesce(nullif(x->>'metros_totales', '')::numeric, p.metros_totales)
          or p.repeticiones is distinct from coalesce(nullif(x->>'repeticiones', '')::integer, p.repeticiones)
          or p.metros_dpi_real is distinct from coalesce(nullif(x->>'metros_reales', '')::numeric, p.metros_dpi_real)
          or p.discrepancia_medida is distinct from coalesce((x->>'discrepancia')::boolean, p.discrepancia_medida));
      get diagnostics n = row_count;
      v_cambiados := v_cambiados + n;
    end if;
  end loop;
  -- Lo que ya no está en la fila y no se marcó impreso queda aparte hasta que el ayudante vea adónde fue (si la lista
  -- vino vacía, Drive no respondió y no se toca nada). Lo que se devolvió a la cola desde IMPRESOS no se toca.
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    update public.prod_pendientes_drive set anulado = true, anulado_motivo = 'Salió de la fila: revisando adónde fue',
      fuera_fila_at = now(), fuera_fila_donde = null, fuera_fila_carpeta = null, fuera_fila_resuelto = null
    where empresa_id = v_emp and not anulado and estado_impreso <> 'SI' and not en_impresos and file_id is not null
      and file_id not like 'LOCAL-%' and file_id not like 'MANUAL-%' and not (file_id = any (v_ids))
      and coalesce(fuera_fila_resuelto, '') <> 'a_la_cola';
    get diagnostics v_quitados = row_count;
  end if;
  return jsonb_build_object('ok', true, 'nuevos', v_nuevos, 'cambiados', v_cambiados, 'quitados', v_quitados, 'volvieron', v_volvieron);
end $function$;
