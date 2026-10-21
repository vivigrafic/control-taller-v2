-- Dónde está cada archivo en Drive (21/10/2026). El vigía de la terminal de Google (procesarMovimientosDrive, cada minuto)
-- mueve a IMPRESOS los que la app marcó como impresos (estado_impreso = SI) y devuelve a la fila los que se deshicieron.
-- Reemplaza las direcciones públicas mover_a_impresos / revertir_impresos, que cualquiera podía usar.
alter table public.prod_pendientes_drive add column if not exists en_impresos boolean not null default false;
comment on column public.prod_pendientes_drive.en_impresos is 'true = el archivo ya está en IMPRESOS (lo mantiene el vigía de Google).';
update public.prod_pendientes_drive set en_impresos = true where estado_impreso = 'SI' and not en_impresos;
