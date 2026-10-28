-- ============================================================================
-- Recorte por unidade/departamento também para o perfil RH + permissão do
-- módulo em Feedbacks, 1:1, Celebrações e Treinamentos
-- ----------------------------------------------------------------------------
-- Regra (decisão do usuário em 08/10/2026): quem não tem uma unidade ou um
-- departamento liberado no Cadastro de Acessos não vê os dados dele em nenhum
-- módulo — principalmente Avaliação da Experiência e Entrevista de
-- Desligamento.
--
-- 1) can_see(): antes o perfil RH via tudo, ignorando as unidades e os
--    departamentos marcados (ex.: RH sem nenhum departamento do Escritório via
--    a AvE do DHO e do DP). Agora só o Administrador vê tudo; RH e Gestor
--    seguem o cadastro (lista vazia = sem restrição naquele eixo, como já era
--    para o Gestor). Vale para todas as tabelas que usam can_see().
-- 2) boletim_resumo_publicado(): o total da empresa e todas as operações só
--    para o Administrador ou para quem não tem unidade/departamento restrito.
-- 3) feedbacks, one_on_one, celebracoes, twygo_participantes, twygo_usuarios:
--    além do recorte, exigem a permissão do módulo (antes os dados chegavam ao
--    navegador de quem não tinha o menu).
-- 4) Boletim da Liderança é só do Administrador (decisão de 08/10/2026), mas
--    supabase-boletim.sql tinha marcado indicadores.boletim em todo o RH (12
--    contas) — e quem tem o Boletim também lê AvE e Engajamento por ele.
--    Retira a permissão de quem não é Administrador.
--
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- ============================================================================

create or replace function public.can_see(row_unidade text, row_departamento text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p.perfil = 'admin' then true
    when p.perfil in ('gestor', 'rh') then
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

create or replace function public.boletim_resumo_publicado()
returns table (mes date, operacao text, dados jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_mes date;
  v_ant date;
  v_tudo boolean;
begin
  select (p.perfil = 'admin')
         or (coalesce(array_length(p.unidades, 1), 0) = 0 and coalesce(array_length(p.departamentos, 1), 0) = 0)
    into v_tudo
  from public.profiles p
  where p.id = auth.uid() and coalesce(p.status, 'ativo') = 'ativo';
  if v_tudo is null then
    return; -- sem cadastro ativo no Hub
  end if;

  select max(f.mes) into v_mes from public.boletim_fechamento f;
  if v_mes is null then
    return; -- nenhum mês fechado ainda
  end if;
  v_ant := (date_trunc('month', v_mes) - interval '1 month')::date;

  return query
  select f.mes, f.operacao, f.dados
  from public.boletim_fechamento f
  where date_trunc('month', f.mes) in (date_trunc('month', v_mes), date_trunc('month', v_ant))
    and (
      (f.operacao = 'empresa' and v_tudo)
      or (f.operacao <> 'empresa' and (
        v_tudo
        or exists (
          select 1
          from jsonb_array_elements(coalesce(f.dados -> 'lojas', '[]'::jsonb)) l
          join public.colaboradores c
            on lower(trim(c.departamento)) = lower(trim(l ->> 'departamento'))
          where public.can_see(c.unidade, c.departamento)
        )
      ))
    );
end;
$$;

revoke all on function public.boletim_resumo_publicado() from public, anon;
grant execute on function public.boletim_resumo_publicado() to authenticated;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('feedbacks', 'indicadores.feedbacks'),
    ('one_on_one', 'indicadores.oneonone'),
    ('celebracoes', 'indicadores.celebracoes'),
    ('twygo_participantes', 'indicadores.treinamentos'),
    ('twygo_usuarios', 'indicadores.treinamentos')
  ) as v(tabela, perm)
  loop
    execute format('drop policy if exists %I on public.%I', r.tabela || '_select', r.tabela);
    execute format(
      'create policy %I on public.%I for select using (public.can_see(unidade, departamento) and public.has_permission(%L))',
      r.tabela || '_select', r.tabela, r.perm
    );
  end loop;
end $$;

update public.profiles
set permissoes = permissoes - 'indicadores.boletim'
where perfil <> 'admin'
  and coalesce(status, 'ativo') <> 'desligado'
  and permissoes ? 'indicadores.boletim';

-- Conferência: as 5 policies novas (com a permissão de cada módulo) e quantas
-- contas fora do Administrador ainda têm o Boletim (deve ser 0, salvo
-- desligadas, que não podem ser editadas).
select tablename as objeto, qual as regra
from pg_policies
where schemaname = 'public'
  and tablename in ('feedbacks', 'one_on_one', 'celebracoes', 'twygo_participantes', 'twygo_usuarios')
  and cmd = 'SELECT'
union all
select 'contas não-admin ativas com Boletim', count(*)::text
from public.profiles
where perfil <> 'admin' and coalesce(status, 'ativo') <> 'desligado'
  and (permissoes ->> 'indicadores.boletim')::boolean is true
order by 1;
