-- Status de acesso dos usuários (Ativo / Inativo / Desligado) — Administração →
-- Cadastro de Acessos. Rodar uma vez no SQL Editor do Supabase. Idempotente.
--
-- Usuário inativo ou desligado continua existindo (perfil, permissões e
-- histórico ficam guardados e podem ser reativados), mas perde TODO acesso a
-- dados: as funções usadas pelas policies de RLS passam a tratá-lo como sem
-- perfil. Vale mesmo que ele ainda tenha uma sessão aberta no navegador.
--   ativo      → acesso normal
--   inativo    → acesso suspenso (afastamento, férias longas, revisão)
--   desligado  → colaborador desligado da empresa

alter table public.profiles add column if not exists status text not null default 'ativo';
alter table public.profiles add column if not exists status_em timestamptz;
alter table public.profiles add column if not exists status_por text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check') then
    alter table public.profiles add constraint profiles_status_check check (status in ('ativo', 'inativo', 'desligado'));
  end if;
end $$;

-- Se uma versão anterior deste script (coluna booleana "ativo") já foi rodada, aproveita os dados.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'ativo') then
    execute 'update public.profiles set status = ''inativo'' where ativo = false and status = ''ativo''';
  end if;
end $$;

create or replace function public.current_role_v()
returns text
language sql stable security definer set search_path = public as $$
  select perfil from public.profiles where id = auth.uid() and status = 'ativo'
$$;

create or replace function public.has_permission(perm text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select perfil = 'admin' or coalesce((permissoes ->> perm)::boolean, false)
     from public.profiles where id = auth.uid() and status = 'ativo'),
    false
  )
$$;

create or replace function public.can_see(row_unidade text, row_departamento text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p.perfil in ('admin','rh') then true
    when p.perfil = 'gestor' then
      (
        coalesce(array_length(p.unidades, 1), 0) = 0
        or row_unidade is null
        or lower(trim(row_unidade)) in (select lower(trim(u)) from unnest(p.unidades) as u)
      )
      and
      (
        coalesce(array_length(p.departamentos, 1), 0) = 0
        or (row_departamento is not null and lower(trim(row_departamento)) in (select lower(trim(d)) from unnest(p.departamentos) as d))
      )
    else false
  end
  from (select perfil, unidades, departamentos from public.profiles where id = auth.uid() and status = 'ativo') p
$$;

-- Usuário DESLIGADO é somente leitura: perfil, permissões, unidades e
-- departamentos não podem ser alterados enquanto ele estiver desligado. A única
-- mudança permitida é a reativação (status voltando para 'ativo'/'inativo').
-- Fica no banco (não só na tela) para valer também fora do Hub.
create or replace function public.profiles_bloqueia_edicao_desligado()
returns trigger
language plpgsql as $$
begin
  if old.status = 'desligado' and new.status = 'desligado' then
    raise exception 'Usuário desligado não pode ser editado. Reative o acesso primeiro.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_bloqueia_edicao_desligado on public.profiles;
create trigger profiles_bloqueia_edicao_desligado
  before update on public.profiles
  for each row execute function public.profiles_bloqueia_edicao_desligado();
