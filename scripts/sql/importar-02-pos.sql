-- Import do Supabase, passo 2 (DEPOIS do pg_restore de auth.users e dos schemas
-- public e conexao_private). Tira o que é do Supabase e deixa o banco no
-- formato do hub novo. Roda numa transação: ou faz tudo, ou nada.
begin;

-- 1. Usuários: auth.users vira public.usuarios, com o MESMO id (profiles.id e
--    as demais FKs continuam valendo) e o hash bcrypt da senha atual.
create table public.usuarios (
  id           uuid primary key,
  email        text,
  senha_hash   text,
  trocar_senha boolean not null default false,
  criado_em    timestamptz not null default now(),
  ultimo_login timestamptz
);
create unique index usuarios_email_key on public.usuarios (lower(email));

-- Todos os ids vêm (um profile pode apontar para conta apagada no Supabase);
-- conta apagada entra sem senha, então não consegue entrar.
insert into public.usuarios (id, email, senha_hash, criado_em, ultimo_login)
select u.id, lower(trim(u.email)),
       case when u.deleted_at is null then u.encrypted_password end,
       coalesce(u.created_at, now()), u.last_sign_in_at
from auth.users u;

-- FKs que apontavam para auth.users passam a apontar para public.usuarios.
do $$
declare
  c record;
  cols text;
begin
  for c in
    select con.conname, con.conrelid::regclass as tabela, con.confdeltype, con.conkey, con.conrelid
    from pg_constraint con
    where con.contype = 'f' and con.confrelid = 'auth.users'::regclass
  loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey);
    execute format('alter table %s drop constraint %I', c.tabela, c.conname);
    execute format('alter table %s add constraint %I foreign key (%s) references public.usuarios(id)%s',
      c.tabela, c.conname, cols,
      case c.confdeltype when 'c' then ' on delete cascade' when 'n' then ' on delete set null' else '' end);
  end loop;
end $$;

drop table auth.users cascade;

-- 2. RLS: no hub novo quem barra é o servidor (src/lib/rbac). As regras de cada
--    policy viram testes (test/acesso). Guarda o texto das policies antes de
--    apagar, para escrever esses testes a partir delas.
create table public._policies_supabase as
select schemaname, tablename, policyname, cmd, roles::text[] as roles, qual, with_check
from pg_policies where schemaname in ('public', 'conexao_private');

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname in ('public', 'conexao_private') loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
  for p in select n.nspname as schemaname, c.relname as tablename
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where c.relkind in ('r', 'p') and c.relrowsecurity and n.nspname in ('public', 'conexao_private') loop
    execute format('alter table %I.%I disable row level security', p.schemaname, p.tablename);
  end loop;
end $$;

-- 3. Papéis do Supabase: tira qualquer grant que tenha sobrado e apaga os papéis.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    execute format('revoke all on all tables in schema public from %I', r);
    execute format('revoke all on all sequences in schema public from %I', r);
    execute format('revoke all on all functions in schema public from %I', r);
    execute format('drop owned by %I', r);
    execute format('drop role %I', r);
  end loop;
end $$;

commit;
