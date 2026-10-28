-- 5_sessoes_validas_desde — revogação de sessão no banco e grants mais
-- estreitos do papel restrito hub_app (operações das telas, src/lib/rls.ts).
--
-- 1) public.usuarios.sessoes_validas_desde: sessão (token de login) emitida
--    antes deste instante é recusada em usuarioAtual() (src/lib/sessao.ts).
--    Gravada por admin.redefinirSenha e admin.alterarStatus (inativar ou
--    desligar). Antes a revogação dependia só do Redis (fail-open). Coluna
--    nova, nula: nada muda para quem já tem sessão.
--    Grant por coluna no padrão do 3_usuarios_sem_leitura_de_hash.
--
-- 2) O 1_rls_original deu EXECUTE em todas as funções de public e extensions
--    ao hub_app, e o dump trouxe EXECUTE para PUBLIC (default do Postgres).
--    Nenhuma operação do hub chama as funções da sincronização da Feedz
--    (feedz_*) nem pgp_sym_encrypt/pgp_sym_decrypt; quem as usa são funções
--    security definer (rodam como o dono, que mantém o EXECUTE). Revogado do
--    hub_app e de PUBLIC (com PUBLIC valendo, revogar só do hub_app não
--    teria efeito). Conferido em pg_get_functiondef: nenhuma função security
--    invoker, view ou policy as chama.
--
-- Aditiva quanto a dados: uma coluna nula nova e permissões. Pode ser reexecutada.

alter table public.usuarios add column if not exists sessoes_validas_desde timestamptz null;

grant select (sessoes_validas_desde) on public.usuarios to hub_app;
grant update (sessoes_validas_desde) on public.usuarios to hub_app;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname like 'feedz\_%')
       or (n.nspname = 'extensions' and p.proname in ('pgp_sym_encrypt', 'pgp_sym_decrypt'))
  loop
    execute format('revoke execute on function %s from public, hub_app', f);
  end loop;
end
$$;
