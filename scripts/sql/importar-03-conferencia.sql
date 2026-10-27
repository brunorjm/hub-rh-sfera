-- Import do Supabase, passo 3: conferência. Só lê; não muda nada.

-- Linhas por tabela (comparadas pelo script com as do dump).
\echo '== linhas por tabela'
select format('%s.%s', n.nspname, c.relname) as tabela,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as linhas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public', 'conexao_private')
order by 1;

-- Sobrou alguma referência ao Supabase em função?
\echo '== funções que ainda citam storage./cron./net./auth.users/auth.role/auth.jwt'
select p.oid::regprocedure as funcao
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'conexao_private')
  and pg_get_functiondef(p.oid) ~ '(storage\.|cron\.|\mnet\.|auth\.users|auth\.role\(|auth\.jwt\()';

-- Regras de acesso em vigor no Supabase (para conferir src/lib/rbac/permissoes.ts).
\echo '== definição em vigor de has_permission, can_see e can_see_escopo'
select p.oid::regprocedure as funcao, pg_get_functiondef(p.oid) as definicao
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('has_permission', 'can_see', 'can_see_escopo', 'hub_escopo');
