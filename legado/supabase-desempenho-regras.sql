-- ============================================================================
-- Desempenho das regras de acesso (Fase 4 do diagnóstico de 14/10/2026)
-- ----------------------------------------------------------------------------
-- As regras chamavam has_permission() e can_see() LINHA A LINHA, e cada
-- chamada relia o cadastro da pessoa. No Twygo (68 mil linhas) só contar
-- levava ~6 s, e um visitante sem login estourava o tempo do banco.
--
-- Mesma regra de acesso, outro cálculo:
--   - has_permission('x')  →  (select has_permission('x'))  — 1x por consulta;
--   - auth.uid()           →  (select auth.uid())           — 1x por consulta;
--   - can_see(u, d)        →  can_see_escopo((select hub_escopo()), u, d):
--     o cadastro (perfil, unidades, departamentos) é lido 1x por consulta e a
--     comparação por linha é uma conta simples, sem ir ao banco.
-- can_see() continua existindo (usada dentro de outras funções) e as duas
-- dão o mesmo resultado — a conferência no fim compara as duas.
--
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'hub_escopo_t' and typnamespace = 'public'::regnamespace) then
    create type public.hub_escopo_t as (perfil text, unidades text[], departamentos text[]);
  end if;
end $$;

-- Cadastro de quem está logado, já normalizado (minúsculas, sem espaços nas pontas).
create or replace function public.hub_escopo()
returns public.hub_escopo_t
language sql stable security definer set search_path = public as $$
  select row(
    p.perfil,
    coalesce((select array_agg(lower(trim(u))) from unnest(p.unidades) u), '{}'),
    coalesce((select array_agg(lower(trim(d))) from unnest(p.departamentos) d), '{}')
  )::public.hub_escopo_t
  from public.profiles p
  where p.id = auth.uid() and p.status = 'ativo'
$$;

-- Mesma regra de can_see(), a partir do escopo já lido. Sem "security
-- definer" e sem "set search_path" de propósito: assim o banco embute a conta
-- direto na consulta.
create or replace function public.can_see_escopo(e public.hub_escopo_t, row_unidade text, row_departamento text)
returns boolean
language sql immutable as $$
  select case
    when e is null or e.perfil is null then false
    when e.perfil = 'admin' then true
    when e.perfil in ('gestor', 'rh') then
      (coalesce(cardinality(e.unidades), 0) = 0 or row_unidade is null or lower(trim(row_unidade)) = any(e.unidades))
      and
      (coalesce(cardinality(e.departamentos), 0) = 0 or (row_departamento is not null and lower(trim(row_departamento)) = any(e.departamentos)))
    else false
  end
$$;

revoke all on function public.hub_escopo() from public, anon;
revoke all on function public.can_see_escopo(public.hub_escopo_t, text, text) from public, anon;
grant execute on function public.hub_escopo() to authenticated;
grant execute on function public.can_see_escopo(public.hub_escopo_t, text, text) to authenticated;

create table if not exists public.desempenho_regras_relatorio (tabela text, regra text, antes text, depois text, em timestamptz default now());
truncate public.desempenho_regras_relatorio;
alter table public.desempenho_regras_relatorio enable row level security; -- sem policy: só o SQL Editor lê

do $$
declare
  p record;
  v_qual text;
  v_check text;
  v_roles text;
  v_sql text;
  -- has_permission( / auth.uid() que ainda não estão dentro de um SELECT
  re_perm constant text := '(?<!SELECT )\mhas_permission\(([^()]*)\)';
  re_uid  constant text := '(?<!SELECT )\mauth\.uid\(\)';
  re_see  constant text := '\mcan_see\(';
begin
  for p in
    select pol.tablename, pol.policyname, pol.cmd, pol.permissive, pol.roles, pol.qual, pol.with_check
    from pg_policies pol
    where pol.schemaname = 'public'
      and (coalesce(pol.qual, '') ~ '(\mhas_permission\(|\mcan_see\(|\mauth\.uid\(\))'
        or coalesce(pol.with_check, '') ~ '(\mhas_permission\(|\mcan_see\(|\mauth\.uid\(\))')
  loop
    v_qual := p.qual;
    v_check := p.with_check;
    if v_qual is not null then
      v_qual := regexp_replace(v_qual, re_perm, '(SELECT public.has_permission(\1))', 'g');
      v_qual := regexp_replace(v_qual, re_uid, '(SELECT auth.uid())', 'g');
      v_qual := regexp_replace(v_qual, re_see, 'public.can_see_escopo((SELECT public.hub_escopo()), ', 'g');
    end if;
    if v_check is not null then
      v_check := regexp_replace(v_check, re_perm, '(SELECT public.has_permission(\1))', 'g');
      v_check := regexp_replace(v_check, re_uid, '(SELECT auth.uid())', 'g');
      v_check := regexp_replace(v_check, re_see, 'public.can_see_escopo((SELECT public.hub_escopo()), ', 'g');
    end if;
    if v_qual is not distinct from p.qual and v_check is not distinct from p.with_check then
      continue; -- já estava no formato novo
    end if;
    v_roles := array_to_string(p.roles, ', ');
    v_sql := format('create policy %I on public.%I as %s for %s to %s', p.policyname, p.tablename, p.permissive, p.cmd, v_roles);
    if v_qual is not null then v_sql := v_sql || format(' using (%s)', v_qual); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    execute v_sql;
    insert into public.desempenho_regras_relatorio (tabela, regra, antes, depois)
    values (p.tablename, p.policyname, coalesce(p.qual, p.with_check), coalesce(v_qual, v_check));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Conferência
--  1) regras reescritas;
--  2) can_see() × can_see_escopo() para TODOS os cadastros ativos, em todas
--     as combinações unidade/departamento de Colaboradores — deve dar 0
--     divergências.
-- ---------------------------------------------------------------------------
with perfis as (
  select p.id, p.perfil, row(
    p.perfil,
    coalesce((select array_agg(lower(trim(u))) from unnest(p.unidades) u), '{}'),
    coalesce((select array_agg(lower(trim(d))) from unnest(p.departamentos) d), '{}')
  )::public.hub_escopo_t as e, p.unidades, p.departamentos
  from public.profiles p where p.status = 'ativo'
),
combos as (
  select distinct unidade, departamento from public.colaboradores
  union select null, 'x' union select 'x', null union select null, null
),
comparado as (
  select pf.id,
    -- regra antiga de can_see(), reproduzida para o cadastro pf
    case
      when pf.perfil = 'admin' then true
      when pf.perfil in ('gestor', 'rh') then
        (coalesce(array_length(pf.unidades, 1), 0) = 0 or c.unidade is null
          or lower(trim(c.unidade)) in (select lower(trim(u)) from unnest(pf.unidades) u))
        and (coalesce(array_length(pf.departamentos, 1), 0) = 0
          or (c.departamento is not null and lower(trim(c.departamento)) in (select lower(trim(d)) from unnest(pf.departamentos) d)))
      else false
    end as antigo,
    public.can_see_escopo(pf.e, c.unidade, c.departamento) as novo
  from perfis pf cross join combos c
)
select 'regras reescritas' as item, count(*)::text as resultado from public.desempenho_regras_relatorio
union all
select 'divergências can_see × can_see_escopo (deve ser 0)', count(*)::text from comparado where antigo is distinct from novo
union all
select 'combinações conferidas', count(*)::text from comparado
union all
select 'regras que ainda chamam can_see( direto', count(*)::text from pg_policies
  where schemaname = 'public' and (coalesce(qual, '') ~ '\mcan_see\(' or coalesce(with_check, '') ~ '\mcan_see\(');
