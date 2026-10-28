-- Import do Supabase, passo 1 (banco vazio, ANTES do pg_restore).
-- Cria o mínimo que o dump espera encontrar: os papéis do Supabase (as policies
-- citam "to authenticated"), o schema extensions com pgcrypto (digest,
-- gen_random_bytes, pgp_sym_*) e auth.uid() no formato novo. Tudo que é só do
-- Supabase é removido no passo 2.

-- Num servidor da TI o usuário do hub pode não ter CREATEROLE: aí os papéis não
-- são criados e só as 8 policies que os citam falham no restore — sem dano, o
-- passo 2 apaga todas as policies e a migration 1_rls_original as recria.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      begin
        execute format('create role %I nologin', r);
      exception when insufficient_privilege then
        raise notice 'Sem permissão para criar o papel % (ok: ver comentário acima).', r;
      end;
    end if;
  end loop;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create schema if not exists auth;
-- pg_restore -n não recria o próprio schema; só o que está dentro dele.
create schema if not exists conexao_private;

-- Compatibilidade: as 89 funções SQL do hub usam auth.uid(). No hub novo o
-- servidor informa o usuário da sessão com
--   select set_config('app.usuario_id', '<uuid>', true)
-- dentro da transação (src/lib/sql-usuario.ts). Sem isso, auth.uid() é null e
-- as funções se comportam como para alguém sem login.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.usuario_id', true), '')::uuid
$$;
