-- Import do Supabase, passo 1 (banco vazio, ANTES do pg_restore).
-- Cria o mínimo que o dump espera encontrar: os papéis do Supabase (as policies
-- citam "to authenticated"), o schema extensions com pgcrypto (digest,
-- gen_random_bytes, pgp_sym_*) e auth.uid() no formato novo. Tudo que é só do
-- Supabase é removido no passo 2.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create schema if not exists auth;

-- Compatibilidade: as 89 funções SQL do hub usam auth.uid(). No hub novo o
-- servidor informa o usuário da sessão com
--   select set_config('app.usuario_id', '<uuid>', true)
-- dentro da transação (src/lib/sql-usuario.ts). Sem isso, auth.uid() é null e
-- as funções se comportam como para alguém sem login.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.usuario_id', true), '')::uuid
$$;
