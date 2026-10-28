-- 4_conexao_hub_app — o papel restrito hub_app (operações das telas,
-- src/lib/rls.ts) chama as funções do Conexão RH como o "authenticated" do
-- Supabase chamava (legado/supabase-conexao-rh.sql).
--
-- O schema conexao_private continua fechado: nenhum grant em tabela (as policies
-- *_no_direct_access do 1_rls_original seguem negando tudo ao hub_app). O acesso
-- passa só pelas funções security definer abaixo, que conferem permissão e
-- escopo por dentro (has_permission, allowed_scope, allowed_pdf).
--
-- Antes: o 1_rls_original não deu USAGE no schema, então public.conexao_state(),
-- conexao_save() e conexao_nps_sync() (security invoker) falhavam para o hub_app.
--
-- Aditiva: só permissões, e o segredo dos links de NPS se ainda não existir
-- (banco novo; na cópia de produção ele já veio no dump e não muda).
-- Pode ser reexecutada.

grant usage on schema conexao_private to hub_app;

-- Como no Supabase: nada executável por padrão; só o que as telas usam.
-- allowed_employee/allowed_scope e as triggers rodam dentro das funções
-- security definer (como dono), não precisam de grant.
-- public_nps (página pública do NPS) fica para a fase dos links públicos.
revoke all on all functions in schema conexao_private from public;
grant execute on function
  conexao_private.load_state(),
  conexao_private.write_records(jsonb),
  conexao_private.sync_nps(),
  conexao_private.allowed_pdf(text)
  to hub_app;

insert into conexao_private.secrets (id, secret)
select true, encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from conexao_private.secrets);
