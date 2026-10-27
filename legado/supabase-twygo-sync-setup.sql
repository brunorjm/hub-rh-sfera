-- Agendamento da sincronização automática do Twygo (twygo_participantes) —
-- rode isto DEPOIS de já ter feito o deploy da Edge Function sync-twygo
-- (ver SETUP.md, seção "Sincronização automática do Twygo"). Troque
-- <PROJECT_REF> e <SERVICE_ROLE_KEY> pelos valores do seu projeto antes de
-- rodar (Project Settings → API).
--
-- Se "create extension" der erro de permissão, ative pg_cron e pg_net pelo
-- painel: Database → Extensions → busque "pg_cron" e "pg_net" → Enable.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Roda todo dia às 05:00 UTC (~02:00 no horário de Brasília). Ajuste o
-- cron (segundo parâmetro) se quiser outro horário/frequência.
select cron.schedule(
  'sync-twygo-diario',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-twygo',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Pra rodar manualmente uma vez (teste, sem esperar o horário agendado):
-- select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-twygo',
--   headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
--   body := '{}'::jsonb
-- );

-- Pra ver o resultado das últimas execuções da function chamada via pg_net:
-- select * from net._http_response order by created desc limit 5;

-- Pra cancelar o agendamento, se precisar:
-- select cron.unschedule('sync-twygo-diario');
