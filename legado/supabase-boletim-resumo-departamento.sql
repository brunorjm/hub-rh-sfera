-- ============================================================================
-- Boletim da Liderança no Dashboard — só os departamentos liberados
-- ----------------------------------------------------------------------------
-- Substitui a versão de supabase-boletim-resumo.sql (que mostrava a operação
-- inteira para quem tinha qualquer loja dela). Decisão do usuário em
-- 08/10/2026: o gestor NÃO tem o módulo Boletim; no Dashboard ele vê o quadro
-- resumo só dos departamentos (lojas) liberados no cadastro dele.
--
-- Para quem tem recorte de unidade/departamento:
--   - operação com TODAS as lojas liberadas → linha da operação inteira;
--   - operação com só algumas lojas liberadas → uma linha por loja liberada
--     (dados.lojas), sem o total da operação;
--   - total da empresa → nunca.
-- Administrador ou conta sem recorte: todas as operações + total da empresa.
--
-- p_profile_id: usado só pelo "Visualizar como" (quem tem admin.usuarios vê o
-- resumo como a conta simulada veria). Sem essa permissão o parâmetro é
-- ignorado e vale sempre o login de quem chama.
--
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- ============================================================================

-- Mesma regra de can_see(), mas para um cadastro informado (não o login).
create or replace function public.can_see_perfil(p_profile_id uuid, row_unidade text, row_departamento text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
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
    from public.profiles p
    where p.id = p_profile_id and coalesce(p.status, 'ativo') = 'ativo'
  ), false)
$$;
revoke all on function public.can_see_perfil(uuid, text, text) from public, anon, authenticated;

drop function if exists public.boletim_resumo_publicado();
drop function if exists public.boletim_resumo_publicado(uuid);

create function public.boletim_resumo_publicado(p_profile_id uuid default null)
returns table (mes date, operacao text, dados jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_alvo uuid := auth.uid();
  v_mes date;
  v_ant date;
  v_tudo boolean;
begin
  if p_profile_id is not null and p_profile_id <> auth.uid() and public.has_permission('admin.usuarios') then
    v_alvo := p_profile_id;
  end if;

  select (p.perfil = 'admin')
         or (coalesce(array_length(p.unidades, 1), 0) = 0 and coalesce(array_length(p.departamentos, 1), 0) = 0)
    into v_tudo
  from public.profiles p
  where p.id = v_alvo and coalesce(p.status, 'ativo') = 'ativo';
  if v_tudo is null then
    return; -- sem cadastro ativo no Hub
  end if;

  select max(f.mes) into v_mes from public.boletim_fechamento f;
  if v_mes is null then
    return; -- nenhum mês fechado ainda
  end if;
  v_ant := (date_trunc('month', v_mes) - interval '1 month')::date;

  if v_tudo then
    return query
    select f.mes, f.operacao, f.dados
    from public.boletim_fechamento f
    where date_trunc('month', f.mes) in (date_trunc('month', v_mes), date_trunc('month', v_ant));
    return;
  end if;

  return query
  with base as (
    select f.mes, f.operacao, f.dados,
           coalesce(jsonb_array_length(f.dados -> 'lojas'), 0) as n_lojas,
           coalesce((
             select jsonb_agg(l)
             from jsonb_array_elements(coalesce(f.dados -> 'lojas', '[]'::jsonb)) l
             -- Unidade da loja: tirada do cadastro de Colaboradores (loja sem
             -- ninguém no cadastro fica de fora para quem tem recorte).
             where exists (
               select 1 from public.colaboradores c
               where lower(trim(c.departamento)) = lower(trim(l ->> 'departamento'))
                 and public.can_see_perfil(v_alvo, c.unidade, c.departamento)
             )
           ), '[]'::jsonb) as lojas_ok
    from public.boletim_fechamento f
    where date_trunc('month', f.mes) in (date_trunc('month', v_mes), date_trunc('month', v_ant))
      and f.operacao <> 'empresa'
  )
  select b.mes, b.operacao,
         case when b.n_lojas > 0 and jsonb_array_length(b.lojas_ok) = b.n_lojas
              then b.dados
              else jsonb_build_object('parcial', true, 'lojas', b.lojas_ok)
         end
  from base b
  where jsonb_array_length(b.lojas_ok) > 0;
end;
$$;

revoke all on function public.boletim_resumo_publicado(uuid) from public, anon;
grant execute on function public.boletim_resumo_publicado(uuid) to authenticated;

-- Conferência (como Administrador): seu próprio resumo — deve listar todas as
-- operações e o total da empresa do último mês fechado e do anterior.
select mes, operacao, (dados ? 'parcial') as so_departamentos
from public.boletim_resumo_publicado()
order by mes desc, operacao;
