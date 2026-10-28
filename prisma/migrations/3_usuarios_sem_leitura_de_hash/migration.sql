-- 3_usuarios_sem_leitura_de_hash — o papel restrito hub_app (operações das
-- telas, src/lib/rls.ts) não lê o hash das senhas.
--
-- O 1_rls_original concedeu select em todas as tabelas de public ao hub_app;
-- em public.usuarios isso incluía senha_hash. Nenhuma operação lê essa coluna
-- (o login roda como dono, em src/lib/login.ts), então o grant passa a ser por
-- coluna: o hub_app vê id/e-mail/datas, cria contas (Cadastro de Acessos) e
-- grava senha nova (redefinir senha), mas não lê hash nenhum.
-- Aditiva quanto a dados: só muda permissões.
revoke all on public.usuarios from hub_app;
grant select (id, email, trocar_senha, criado_em, ultimo_login) on public.usuarios to hub_app;
grant insert (id, email, senha_hash, trocar_senha) on public.usuarios to hub_app;
grant update (senha_hash, trocar_senha) on public.usuarios to hub_app;
