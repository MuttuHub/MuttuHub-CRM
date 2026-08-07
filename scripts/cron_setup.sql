-- Muttu Hub — pg_cron setup del resumen diario (PRD §4.4.1)
--
-- Cómo aplicar:
--   1. Abre el SQL editor del panel de Supabase (o psql a la BD).
--   2. Reemplaza [CRON_SECRET] abajo por el MISMO valor de la env
--      `CRON_SECRET` en Vercel (POST /api/cron/daily lo valida).
--   3. Ejecuta el script completo. Re-ejecutable (los jobs se re-crean).
--
-- Detalle de tiempos (PRD §4.4.1, hora Colombia = UTC-5, sin horario de
-- verano):
--   '0 13 * * *'  → 8:00am Colombia  → job muttu-daily-8am
--   '30 13 * * *' → 8:30am Colombia  → reintento (muttu-retry-830)
-- El reintento solo envía si la corrida de las 8:00 no terminó OK (guard de
-- idempotencia dentro de /api/cron/daily: consulta cron_logs del día).
-- Retención de cron_logs: 30 días (limpieza manual o reservado a un job de
-- mantenimiento futuro).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Función que dispara el job interno: hace un POST con el secret como
-- header (pg_net es async: la respuesta real llega por el registro de
-- cron_logs del lado de la app, no por el valor de retorno).
create or replace function public.muttu_cron_daily()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _endpoint text := 'https://muttu-hub.vercel.app/api/cron/daily';
  _secret   text := '[CRON_SECRET]';
  _body     jsonb := '{}'::jsonb;
begin
  perform net.http_post(
    url := _endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    ),
    body := _body
  );
end;
$$;

-- Limpia versiones previas del job en caso de re-ejecución (mismo nombre).
do $$
declare
  _job record;
begin
  for _job in
    select jobid, jobname
    from cron.job
    where jobname in ('muttu-daily-8am', 'muttu-retry-830')
  loop
    perform cron.unschedule(_job.jobid);
  end loop;
end;
$$;

-- 08:00am hora Colombia (13:00 UTC)
select cron.schedule(
  'muttu-daily-8am',
  '0 13 * * *',
  $$ select public.muttu_cron_daily() $$
);

-- 08:30am hora Colombia (13:30 UTC) — reintento si la corrida de las 8:00
-- no cerró OK (idempotencia: no re-envía cuando ya se envió hoy).
select cron.schedule(
  'muttu-retry-830',
  '30 13 * * *',
  $$ select public.muttu_cron_daily() $$
);