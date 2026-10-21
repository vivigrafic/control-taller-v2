-- Vuelve atrás 20261022180000_telas_unidas.sql (las telas creadas en Productos quedan: se anulan desde Productos)
drop function if exists public.taller_tela_separar(uuid);
drop function if exists public.taller_tela_unir(uuid, uuid);
drop function if exists public.taller_telas_sistema();
alter table public.prod_telas_variantes drop column if exists partida_id;
drop index if exists public.prod_telas_ficha_item_uk;
alter table public.prod_telas_ficha drop column if exists item_id;
